// npm run verify-sdk   -> ~60 s live check, prints PASS/FAIL per signal (judge-runnable)
// npm run spike        -> 150 s guided spike (baseline, then 7 and 5 breaths/min),
//                         saves raw payloads + a normalized metric stream (no video) to recordings/
//
// Needs SMARTSPECTRA_API_KEY in .env and a webcam. Never prints the key.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadEnvKey } from '../src/main/env';
import { Normalizer } from '../src/core/normalize';
import type { StreamEvent, Recording } from '../src/core/types';
import { validationMessage } from '../src/core/validation-codes';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ss = require('@smartspectra/node-sdk');
const { SmartSpectraSDK, CameraSelection, breathingMetrics, cardioMetrics, faceMetrics, edaMetrics, decodeMetrics, SmartSpectraLogLevel } = ss;

const SPIKE = process.argv.includes('--spike');
const SECONDS = SPIKE ? 150 : Number(argFlag('--seconds') ?? 60);
const ROOT = path.resolve(__dirname, '..', '..');

function argFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const key = loadEnvKey(ROOT);
if (!key) {
  console.error('No SMARTSPECTRA_API_KEY found in .env (see .env.example). Judge Mode works without one: npm run demo');
  process.exit(2);
}

interface Tally { packets: number; samples: number; stable: number; firstAt?: number; lastValue?: number }
const tally: Record<string, Tally> = {};
const SIGNALS = ['face landmarks', 'talking flag', 'blinking', 'breathing rate', 'chest trace', 'abdomen trace', 'pulse rate', 'pressure trace', 'HRV', 'EDA trace'];
for (const s of SIGNALS) tally[s] = { packets: 0, samples: 0, stable: 0 };
function hit(name: string, arr: any[] | undefined, t: number, valueOf = (m: any) => m.value) {
  if (!arr || arr.length === 0) return;
  const k = tally[name];
  k.packets++; k.samples += arr.length;
  k.stable += arr.filter((m) => m.stable).length;
  k.firstAt ??= t;
  const v = valueOf(arr[arr.length - 1]);
  if (typeof v === 'number') k.lastValue = v;
}

const events: StreamEvent[] = [];
const raw: any[] = [];
const norm = new Normalizer();
const validationCounts: Record<string, number> = {};
const errors: string[] = [];
let startWall = 0;
const tNow = () => (Date.now() - startWall) / 1000;

function jsonSafe(m: any): any {
  // shrink landmarks for the raw dump; convert Longs
  return JSON.parse(JSON.stringify(m, (k, v) => {
    if (k === 'value' && Array.isArray(v) && v.length > 6 && typeof v[0] === 'object') return { count: v.length, first: v.slice(0, 3) };
    if (v && typeof v === 'object' && 'low' in v && 'high' in v && 'unsigned' in v) return (v.high >>> 0) * 4294967296 + (v.low >>> 0);
    return v;
  }));
}

async function run(metrics: number[], label: string): Promise<boolean> {
  const sdk = new SmartSpectraSDK({
    apiKey: key,
    requestedMetrics: metrics,
    enableTelemetry: false,
    logLevel: SPIKE ? SmartSpectraLogLevel.kInfo : SmartSpectraLogLevel.kWarning,
  });
  let fatal = false;
  sdk.on('processingStatus', (s: number) => { events.push({ type: 'status', t: tNow(), status: s }); });
  sdk.on('validationStatus', (code: number, _ts: number, hint: string) => {
    const k = `${code} ${validationMessage(code).short}`;
    validationCounts[k] = (validationCounts[k] ?? 0) + 1;
    events.push({ type: 'validation', t: tNow(), code, hint });
  });
  sdk.on('error', (code: number, message: string, retryable: boolean) => {
    errors.push(`[${label}] error ${code}: ${message} (retryable=${retryable})`);
    events.push({ type: 'error', t: tNow(), code, message, retryable });
    if (!retryable) fatal = true;
  });
  sdk.on('metrics', (buf: Buffer, ts: number) => {
    const m = decodeMetrics(buf);
    if (Buffer.isBuffer(m)) return;
    const t = tNow();
    if (SPIKE) raw.push({ t, ts, m: jsonSafe(m) });
    events.push({ type: 'packet', p: norm.packet(m, ts) });
    hit('face landmarks', m.face?.landmarks, t);
    hit('talking flag', m.face?.talking, t, (d) => (d.detected ? 1 : 0));
    hit('blinking', m.face?.blinking, t, (d) => (d.detected ? 1 : 0));
    hit('breathing rate', m.breathing?.rate, t);
    hit('chest trace', m.breathing?.upperTrace, t);
    hit('abdomen trace', m.breathing?.lowerTrace, t);
    hit('pulse rate', m.cardio?.pulseRate, t);
    hit('pressure trace', m.cardio?.arterialPressureTrace, t);
    hit('HRV', m.cardio?.hrv, t, (h) => h.rmssd);
    hit('EDA trace', m.eda?.trace, t);
  });

  sdk.useCamera(CameraSelection.default);
  try {
    sdk.start();
  } catch (e: any) {
    errors.push(`[${label}] start() threw: ${e?.message ?? e}`);
    await sdk.destroy().catch(() => {});
    return false;
  }
  startWall ||= Date.now();
  console.log(`Measuring for ${SECONDS} s (${label}). Sit still, face and chest in view, don't talk.`);
  await guide(() => fatal);
  await sdk.stopAsync().catch(() => {});
  await sdk.destroy().catch(() => {});
  return !fatal;
}

async function guide(stop: () => boolean) {
  const end = Date.now() + SECONDS * 1000;
  let lastPrompt = '';
  while (Date.now() < end && !stop()) {
    const t = tNow();
    let prompt = '';
    if (SPIKE) {
      if (t < 60) prompt = `baseline: breathe normally (${Math.ceil(60 - t)} s)`;
      else if (t < 105) prompt = pace(t - 60, 7.0);
      else prompt = pace(t - 105, 5.0);
      const stage = t < 60 ? 'baseline' : t < 105 ? 'pace-7.0' : 'pace-5.0';
      const bpm = t < 60 ? 0 : t < 105 ? 7.0 : 5.0;
      events.push({ type: 'pacer', t, bpm, stage });
    } else {
      prompt = `${Math.ceil((end - Date.now()) / 1000)} s left`;
    }
    if (prompt !== lastPrompt) { process.stdout.write(`\r${prompt.padEnd(60)}`); lastPrompt = prompt; }
    await new Promise((r) => setTimeout(r, 250));
  }
  process.stdout.write('\n');
}

function pace(dt: number, bpm: number): string {
  const period = 60 / bpm;
  const ph = (dt % period) / period;
  return `${bpm} breaths/min: ${ph < 0.5 ? 'IN  ' + '>'.repeat(Math.round(ph * 20)) : 'OUT ' + '<'.repeat(Math.round((1 - ph) * 20))}`;
}

(async () => {
  console.log(`SmartSpectra SDK ${SmartSpectraSDK.version}; telemetry disabled; key loaded (not shown)`);
  try {
    console.log('Cameras:', SmartSpectraSDK.availableCameras().map((c: any) => c.name).join(', ') || 'none');
  } catch (e: any) { console.log('Camera discovery failed:', e.message); }

  const full = [...breathingMetrics, ...cardioMetrics, ...faceMetrics, ...edaMetrics];
  let ok = await run(full, 'all metrics');
  let cardioDenied = false;
  if (!ok && tally['face landmarks'].packets === 0 && tally['chest trace'].packets === 0) {
    console.log('\nFull request failed; retrying without cardio/EDA (they may need a provisioned key)...');
    cardioDenied = true;
    ok = await run([...breathingMetrics, ...faceMetrics], 'breathing + face');
  }

  console.log('\n=== Signals ===');
  let pass = 0;
  for (const s of SIGNALS) {
    const k = tally[s];
    const status = k.packets > 0 ? 'PASS' : 'FAIL';
    if (k.packets > 0) pass++;
    const extra = k.packets
      ? `packets=${k.packets} samples=${k.samples} stable=${k.stable} first@${k.firstAt?.toFixed(1)}s last=${k.lastValue?.toFixed?.(2)}`
      : (cardioDenied && /pulse|pressure|HRV|EDA/.test(s) ? 'not authorized for this key?' : 'no data');
    console.log(`${status}  ${s.padEnd(16)} ${extra}`);
  }
  console.log(`\n${pass}/${SIGNALS.length} signals received.`);
  if (Object.keys(validationCounts).length) {
    console.log('Validation states seen:');
    for (const [k, n] of Object.entries(validationCounts)) console.log(`  ${k}: ${n}`);
  }
  for (const e of errors) console.log(e);

  if (SPIKE) {
    const dir = path.join(ROOT, 'recordings');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rec: Recording = { format: 'paceprint-stream', version: 1, createdAt: new Date().toISOString(), source: 'camera', note: 'spike: 60 s baseline, 45 s @7.0, 45 s @5.0', events };
    fs.writeFileSync(path.join(dir, `spike-${stamp}.stream.json`), JSON.stringify(rec));
    fs.writeFileSync(path.join(dir, `spike-${stamp}.raw.json`), JSON.stringify({ tally, validationCounts, errors, raw }));
    console.log(`Saved recordings/spike-${stamp}.{stream,raw}.json (metric streams only, no video).`);
  }
  process.exit(pass >= 3 ? 0 : 1);
})();
