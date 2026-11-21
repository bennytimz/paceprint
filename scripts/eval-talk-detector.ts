// Offline check of a breathing-trace talking detector (docs/decisions.md, 2026-11-21 22:15).
// Reads the owner's local recordings (gitignored): talk-contrast (20 s silent, 20 s reading aloud, 20 s
// silent) and talk-check (silent, 5/min, nose). For each 4 s window of the chest trace it measures energy
// at 1-4 Hz, as a share of the window's power and as an absolute level, then reports (1) how well the best
// single threshold separates reading from silence on both recordings and (2) whether the measure tracks
// breath size or pacing quality on silent paced data (circularity). Prints no coupling numbers.
// Run: npx esbuild scripts/eval-talk-detector.ts --bundle --platform=node --outfile=dist/scripts/eval-talk-detector.js && node dist/scripts/eval-talk-detector.js
import * as fs from 'node:fs';
import { resample, detrend, bandpass } from '../src/core/dsp';
type S = { t: number; v: number };
const FS = 30, WIN = 4, STEP = 1;
const pw = (x: ArrayLike<number>) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return s / x.length; };
function load(f: string) {
  const r = JSON.parse(fs.readFileSync(`recordings/${f}.stream.json`, 'utf8'));
  const P = r.events.filter((e: any) => e.type === 'packet').map((e: any) => e.p);
  const st: [string, number][] = [];
  for (const e of r.events) if (e.type === 'pacer' && (!st.length || st.at(-1)![0] !== e.stage)) st.push([e.stage, e.t]);
  return { upper: P.flatMap((p: any) => p.upper) as S[], lower: P.flatMap((p: any) => p.lower) as S[], st, t1: P.at(-1).t };
}
function windows(tr: S[], a: number, b: number) {
  const out: { t: number; f: Record<string, number> }[] = [];
  for (let t = a; t + WIN <= b; t += STEP) {
    // pad 2 s each side for filter edges, then score the middle 4 s
    const x = detrend(resample(tr, t - 2, t + WIN + 2, FS));
    const mid = (y: Float64Array) => y.slice(2 * FS, 2 * FS + WIN * FS);
    const total = pw(mid(bandpass(x, FS, 0.05, 8)));
    const f: Record<string, number> = {};
    for (const [lo, hi] of [[1, 4]]) { const hb = pw(mid(bandpass(x, FS, lo, hi))); f[`share ${lo}-${hi}`] = hb / total; f[`rms ${lo}-${hi}`] = Math.sqrt(hb); }
    f['breath rms'] = Math.sqrt(pw(mid(bandpass(x, FS, 0.05, 0.7))));
    out.push({ t, f });
  }
  return out;
}
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const recs = { contrast: load('talkcontrast-2026-11-21T20-53-51-443Z'), check: load('talkcheck-2026-11-21T20-47-13-167Z') };
for (const [name, r] of Object.entries(recs)) {
  const parts = r.st.map(([s, a], i) => [s, i === 0 ? r.upper[0].t : a, i + 1 < r.st.length ? r.st[i + 1][1] : r.t1] as [string, number, number]);
  for (const trName of ['upper'] as const) {
    for (const [stage, a, b] of parts) {
      const w = windows(r[trName], a + 2, b - 2);
      const keys = Object.keys(w[0].f);
      console.log(`${name.padEnd(8)} ${trName} ${stage.padEnd(9)} n=${String(w.length).padStart(2)} ` + keys.map((k) => `${k}: p10 ${q(w.map((x) => x.f[k]), 0.1).toFixed(4)} med ${q(w.map((x) => x.f[k]), 0.5).toFixed(4)} p90 ${q(w.map((x) => x.f[k]), 0.9).toFixed(4)}`).join(' | '));
    }
  }
}

// ---- separation and circularity
import { pearson } from '../src/core/dsp';
import { adherence } from '../src/core/analysis';
{
  const all: { rec: string; stage: string; t: number; f: Record<string, number> }[] = [];
  for (const [name, r] of Object.entries(recs)) {
    const parts = r.st.map(([s, a], i) => [s, i === 0 ? r.upper[0].t : a, i + 1 < r.st.length ? r.st[i + 1][1] : r.t1] as [string, number, number]);
    for (const [stage, a, b] of parts) for (const w of windows(r.upper, a + 2, b - 2)) all.push({ rec: name, stage, ...w });
  }
  const isTalk = (w: typeof all[0]) => w.stage === 'aloud';
  console.log('\n=== best possible single threshold per measure (window level) ===');
  for (const k of ['share 1-4', 'rms 1-4']) {
    let best = { thr: 0, bacc: 0, sens: 0, fpC: 0, fpK: 0 };
    for (const thr of [...new Set(all.map((w) => w.f[k]))].sort((a, b) => a - b)) {
      const tp = all.filter((w) => isTalk(w) && w.f[k] >= thr).length / all.filter(isTalk).length;
      const silC = all.filter((w) => w.rec === 'contrast' && !isTalk(w)), silK = all.filter((w) => w.rec === 'check');
      const fpC = silC.filter((w) => w.f[k] >= thr).length / silC.length, fpK = silK.filter((w) => w.f[k] >= thr).length / silK.length;
      const bacc = (tp + (1 - (fpC * silC.length + fpK * silK.length) / (silC.length + silK.length))) / 2;
      if (bacc > best.bacc) best = { thr, bacc, sens: tp, fpC, fpK };
    }
    console.log(`${k.padEnd(10)} thr ${best.thr.toFixed(4)}: catches ${(best.sens * 100).toFixed(0)}% of reading windows; false alarms ${(best.fpC * 100).toFixed(0)}% of contrast-silent, ${(best.fpK * 100).toFixed(0)}% of talk-check (all silent)`);
  }
  // circularity: on silent paced data, does the measure track breath size or how well the pacer is followed?
  const r = recs.check;
  const s5 = r.st.find(([s]) => s === 'pace-5.0')![1];
  const pacer: S[] = [];
  for (let t = s5; t < r.t1; t += 0.1) { const ph = (((t - s5) * 5) / 60) % 1; pacer.push({ t, v: ph < 0.5 ? ph / 0.5 : 1 - (ph - 0.5) / 0.5 }); }
  const paced = all.filter((w) => w.rec === 'check' && w.stage === 'pace-5.0');
  // follow score over a 12 s window centred on each 4 s window (one breath cycle at 5/min)
  const fol = paced.map((w) => adherence(r.upper, pacer, Math.max(s5, w.t - 4), w.t + 8, 5));
  const ok = fol.map((f, i) => [f, i] as const).filter(([f]) => Number.isFinite(f));
  console.log('\n=== circularity, talk-check paced phase (silent), n=' + ok.length + ' windows ===');
  for (const k of ['share 1-4', 'rms 1-4']) {
    const x = ok.map(([, i]) => paced[i].f[k]);
    console.log(`${k.padEnd(10)} r vs breath size ${pearson(paced.map((w) => w.f[k]), paced.map((w) => w.f['breath rms'])).toFixed(2)} | r vs local follow score ${pearson(x, ok.map(([f]) => f)).toFixed(2)}`);
  }
  console.log('follow score range in these windows:', Math.min(...ok.map(([f]) => f)).toFixed(2), '-', Math.max(...ok.map(([f]) => f)).toFixed(2));
}
