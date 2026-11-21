// npm run verify-sdk   -> ~60 s live check, prints PASS/FAIL per signal (judge-runnable)
// npm run spike        -> 150 s guided spike (baseline, then 7 and 5 breaths/min),
//                         saves raw payloads + a normalized metric stream (no video) to recordings/
// npm run talk-check   -> 75 s: 15 s normal breathing, then 60 s at 5 breaths/min through the nose,
//                         mouth closed. Prints how often the SDK's talking flag fires (no coupling
//                         numbers, by design) and saves the recording like the spike.
// npm run talk-contrast -> 60 s: 20 s silent, 20 s reading a sentence aloud, 20 s silent. Shows whether
//                         the talking flag tells silence from speech at all on this setup.
// npm run mouth-contrast -> 120 s: the same three 20 s parts, then 60 s silent at 5/min (30 s through the
//                         nose, 30 s through the mouth). Saves one lip-opening ratio per frame (no face
//                         points) for the mouth-opening detector test in docs/decisions.md. No coupling.
//
// Needs SMARTSPECTRA_API_KEY in .env and a webcam. Never prints the key.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadEnvKey } from '../src/main/env';
import { Normalizer } from '../src/core/normalize';
import type { StreamEvent, Recording } from '../src/core/types';
import { validationMessage } from '../src/core/validation-codes';
import { speechScore } from '../src/core/mouth';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ss = require('@smartspectra/node-sdk');
const { SmartSpectraSDK, CameraSelection, breathingMetrics, cardioMetrics, faceMetrics, edaMetrics, decodeMetrics, SmartSpectraLogLevel } = ss;

const TALK = process.argv.includes('--talk-check');
const CONTRAST = process.argv.includes('--talk-contrast');
const SENTENCE = 'The morning light came through the window and warmed the old wooden floor.';
/** contrast parts: [stage, from s, to s] */
const CONTRAST_PARTS = [['silent-1', 0, 20], ['aloud', 20, 40], ['silent-2', 40, 60]] as const;
const SPIKE = process.argv.includes('--spike');
const MOUTHC = process.argv.includes('--mouth-contrast');
const MOUTH_PARTS = [['silent-1', 0, 20], ['aloud', 20, 40], ['silent-2', 40, 60], ['pace-5.0-nose', 60, 90], ['pace-5.0-mouth', 90, 120]] as const;
const RECORD = SPIKE || TALK || CONTRAST || MOUTHC;
const TALK_WARM = 15;   // s of normal breathing first: the pulse starts 17-36 s in
const SECONDS = SPIKE ? 150 : TALK ? 75 : CONTRAST ? 60 : MOUTHC ? 120 : Number(argFlag('--seconds') ?? 60);
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
const norm = new Normalizer(0, { mouth: process.argv.includes('--mouth-contrast') }); // lip ratio only for the mouth test
const validationCounts: Record<string, number> = {};
const errors: string[] = [];
let startWall = 0;
const tNow = () => (Date.now() - startWall) / 1000;
// Recorded events go on the stream clock (packet frame time, which lags wall time by ~3.6 s), stamped by
// arrival exactly like the app's camera-source.ts, so validation and pacer markers line up with the data.
let lastPacketT: number | null = null, lastPacketWall = 0;
const tStream = () => (lastPacketT === null ? 0 : lastPacketT + (Date.now() - lastPacketWall) / 1000);

function jsonSafe(m: any): any {
  // raw dump: face points are reduced to their count (no coordinates are saved), expression scores are
  // dropped (never used); protobuf Longs become numbers
  return JSON.parse(JSON.stringify(m, (k, v) => {
    if (k === 'expression') return undefined;
    if (k === 'value' && Array.isArray(v) && v.length > 6 && typeof v[0] === 'object') return { count: v.length };
    if (v && typeof v === 'object' && 'low' in v && 'high' in v && 'unsigned' in v) return (v.high >>> 0) * 4294967296 + (v.low >>> 0);
    return v;
  }));
}

async function run(metrics: number[], label: string): Promise<boolean> {
  const sdk = new SmartSpectraSDK({
    apiKey: key,
    requestedMetrics: metrics,
    enableTelemetry: false,
    logLevel: RECORD ? SmartSpectraLogLevel.kInfo : SmartSpectraLogLevel.kWarning,
  });
  let fatal = false;
  sdk.on('processingStatus', (s: number) => { events.push({ type: 'status', t: tStream(), status: s }); });
  sdk.on('validationStatus', (code: number, _ts: number, hint: string) => {
    const k = `${code} ${validationMessage(code).short}`;
    validationCounts[k] = (validationCounts[k] ?? 0) + 1;
    events.push({ type: 'validation', t: tStream(), code, hint });
  });
  sdk.on('error', (code: number, message: string, retryable: boolean) => {
    errors.push(`[${label}] error ${code}: ${message} (retryable=${retryable})`);
    events.push({ type: 'error', t: tStream(), code, message, retryable });
    if (!retryable) fatal = true;
  });
  sdk.on('metrics', (buf: Buffer, ts: number) => {
    const m = decodeMetrics(buf);
    if (Buffer.isBuffer(m)) return;
    const t = tNow();
    if (RECORD) raw.push({ t, ts, m: jsonSafe(m) });
    const p = norm.packet(m, ts);
    lastPacketT = p.t; lastPacketWall = Date.now();
    events.push({ type: 'packet', p });
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
  if (TALK) console.log('Breathe through your NOSE the whole time, mouth gently closed. Follow the prompt after the first 15 s.');
  if (MOUTHC) console.log(`Silent 20 s, read the sentence aloud 20 s, silent 20 s, then 60 s silent at 5 breaths/min:
  first half through your NOSE, second half through your MOUTH (the prompt says which). The sentence:
  "${SENTENCE}"`);
  if (CONTRAST) console.log(`Silent for 20 s, then read this aloud, over and over, for 20 s, then silent again:
  "${SENTENCE}"`);
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
      events.push({ type: 'pacer', t: tStream(), bpm, stage });
    } else if (TALK) {
      prompt = t < TALK_WARM ? `nose, normal breathing (${Math.ceil(TALK_WARM - t)} s)` : `nose, ${pace(t - TALK_WARM, 5.0)}`;
      events.push({ type: 'pacer', t: tStream(), bpm: t < TALK_WARM ? 0 : 5.0, stage: t < TALK_WARM ? 'baseline' : 'pace-5.0' });
    } else if (CONTRAST) {
      const [stage, , to] = CONTRAST_PARTS.find(([, , b]) => t < b) ?? CONTRAST_PARTS[2];
      prompt = stage === 'aloud' ? `READ ALOUD, repeat the sentence (${Math.ceil(to - t)} s)` : `silent, mouth closed (${Math.ceil(to - t)} s)`;
      events.push({ type: 'pacer', t: tStream(), bpm: 0, stage });
    } else if (MOUTHC) {
      const [stage, , to] = MOUTH_PARTS.find(([, , b]) => t < b) ?? MOUTH_PARTS[4];
      const left = Math.ceil(to - t);
      prompt = stage === 'aloud' ? `READ ALOUD, repeat the sentence (${left} s)`
        : stage === 'pace-5.0-nose' ? `silent, NOSE, ${pace(t - 60, 5.0)}`
        : stage === 'pace-5.0-mouth' ? `silent, MOUTH, ${pace(t - 60, 5.0)}`
        : `silent, mouth closed (${left} s)`;
      events.push({ type: 'pacer', t: tStream(), bpm: stage.startsWith('pace') ? 5.0 : 0, stage });
    } else {
      prompt = `${Math.ceil((end - Date.now()) / 1000)} s left`;
    }
    if (prompt !== lastPrompt) { process.stdout.write(`\r${prompt.padEnd(60)}`); lastPrompt = prompt; }
    await new Promise((r) => setTimeout(r, 250));
  }
  process.stdout.write('\n');
}

const LABELS: Record<string, string> = { baseline: 'normal breathing', 'pace-5.0': '5/min, nose', 'silent-1': 'silent', aloud: 'READING ALOUD', 'silent-2': 'silent again', 'pace-5.0-nose': '5/min, nose', 'pace-5.0-mouth': '5/min, mouth' };

/** Parts from the recorded stage markers (stream clock), so they line up with the packets. */
function stageParts(): [string, number, number][] {
  const marks = events.filter((e): e is Extract<StreamEvent, { type: 'pacer' }> => e.type === 'pacer');
  const parts: [string, number, number][] = [];
  for (const m of marks) if (!parts.length || parts.at(-1)![0] !== m.stage) parts.push([m.stage, m.t, Infinity]);
  parts.forEach((p, i) => { if (i === 0) p[1] = -Infinity; if (i + 1 < parts.length) p[2] = parts[i + 1][1]; });
  return parts;
}

/** Talking-flag summary per phase: share of flagged packets and burst lengths. No coupling numbers. */
function printTalking() {
  const pk = events.flatMap((e) => (e.type === 'packet' && e.p.talking !== undefined ? [{ t: e.p.t, on: !!e.p.talking }] : []));
  const parts = stageParts();
  console.log('\n=== Talking flag (SDK) ===');
  for (const [stage, a, b] of parts) {
    const label = LABELS[stage] ?? stage;
    const ps = pk.filter((p) => p.t >= a && p.t < b);
    if (!ps.length) { console.log(`${label.padEnd(17)} no talking-flag packets`); continue; }
    const bursts: number[] = [];
    let from: number | null = null, prev = 0;
    for (const p of ps) {
      if (p.on && from === null) from = p.t;
      if (!p.on && from !== null) { bursts.push(prev - from); from = null; }
      prev = p.t;
    }
    if (from !== null) bursts.push(prev - from);
    bursts.sort((x, y) => x - y);
    const on = ps.filter((p) => p.on).length;
    const med = bursts.length ? bursts[Math.floor(bursts.length / 2)] : 0;
    console.log(`${label.padEnd(17)} flagged ${((100 * on) / ps.length).toFixed(0)}% of ${ps.length} packets | bursts ${bursts.length}, median ${med.toFixed(1)} s, longest ${(bursts.at(-1) ?? 0).toFixed(1)} s`);
  }
  let line = '';
  const t0 = pk[0]?.t ?? 0, t1 = pk.at(-1)?.t ?? 0;
  for (let a = Math.floor(t0 / 5) * 5; a < t1; a += 5) {
    const b = pk.filter((p) => p.t >= a && p.t < a + 5);
    if (b.length) line += `${a}s:${Math.round((100 * b.filter((p) => p.on).length) / b.length)}% `;
  }
  console.log(`per 5 s: ${line.trim()}`);
  if (TALK) console.log('(Spike 2, mouth not controlled: about 60% during normal breathing, about 75% at 5/min.)');
  if (CONTRAST) console.log('(Talk check, silent and nose-breathing: 100% and 93%. A useful flag would be far higher while reading aloud than while silent.)');
}

/** Lip-opening summary per part: how much of the time the ratio was available, its typical value, and the
 *  speech score (2-7 Hz movement) over 2 s windows, 2 s trimmed at each part change. No coupling numbers. */
function printMouth() {
  const m = events.flatMap((e) => (e.type === 'packet' ? e.p.mouth ?? [] : [])).sort((a, b) => a.t - b.t);
  console.log('');
  console.log('=== Lip opening (our own, from face points; only the ratio is kept) ===');
  if (!m.length) { console.log('no lip-opening data: face points did not arrive'); return; }
  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  for (const [stage, a0, b0] of stageParts()) {
    const a = Math.max(a0, m[0].t), b = Math.min(b0, m[m.length - 1].t);
    const inPart = m.filter((s) => s.t >= a && s.t < b);
    let covered = 0, n = 0;
    for (let t = a; t < b; t += 0.1, n++) if (inPart.some((s) => Math.abs(s.t - t) <= 0.25)) covered++;
    const scores: number[] = [];
    let unscored = 0;
    for (let t = a + 2; t + 2 <= b - 2; t += 0.5) { const v = speechScore(m, t, t + 2); if (Number.isFinite(v)) scores.push(v); else unscored++; }
    const label = (LABELS[stage] ?? stage).padEnd(17);
    console.log(`${label} ratio available ${n ? ((100 * covered) / n).toFixed(0) : 0}% | median ratio ${q(inPart.map((s) => s.v), 0.5).toFixed(3)} | speech score p10 ${q(scores, 0.1).toFixed(4)} med ${q(scores, 0.5).toFixed(4)} p90 ${q(scores, 0.9).toFixed(4)} (${scores.length} windows, ${unscored} unscored)`);
  }
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

  if (TALK || CONTRAST || MOUTHC) printTalking();
  if (MOUTHC) printMouth();
  if (RECORD) {
    const dir = path.join(ROOT, 'recordings');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = TALK ? 'talkcheck' : CONTRAST ? 'talkcontrast' : MOUTHC ? 'mouthcontrast' : 'spike';
    const note = MOUTHC ? 'mouth-contrast: 20 s silent, 20 s reading aloud, 20 s silent, 30 s @5.0 nose, 30 s @5.0 mouth (lip-opening ratio only)' : TALK ? 'talk-check: 15 s nose normal breathing, 60 s @5.0 nose' : CONTRAST ? 'talk-contrast: 20 s silent, 20 s reading aloud, 20 s silent' : 'spike: 60 s baseline, 45 s @7.0, 45 s @5.0';
    const rec: Recording = { format: 'paceprint-stream', version: 1, createdAt: new Date().toISOString(), source: 'camera', note, events };
    fs.writeFileSync(path.join(dir, `${name}-${stamp}.stream.json`), JSON.stringify(rec));
    fs.writeFileSync(path.join(dir, `${name}-${stamp}.raw.json`), JSON.stringify({ tally, validationCounts, errors, raw }));
    console.log(`Saved recordings/${name}-${stamp}.{stream,raw}.json (metric streams only, no video).`);
  }
  process.exit(pass >= 3 ? 0 : 1);
})();
