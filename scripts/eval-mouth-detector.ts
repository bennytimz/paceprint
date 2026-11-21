// Pre-registered test of the mouth-opening talking detector (docs/decisions.md, "Mouth-opening talking
// detector: test fixed before data"). Written before any mouth-contrast recording existed.
// Reads the newest recordings/mouthcontrast-*.stream.json (or the path given) and prints ADOPT or REJECT
// with every check. Prints no coupling numbers.
// Run: npx esbuild scripts/eval-mouth-detector.ts --bundle --platform=node --outfile=dist/scripts/eval-mouth-detector.js && node dist/scripts/eval-mouth-detector.js [file]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { speechScore } from '../src/core/mouth';
import { adherence } from '../src/core/analysis';
import { resample, detrend, bandpass, pearson } from '../src/core/dsp';
import type { Sample } from '../src/core/types';

// ---- the rule, fixed before data
const WIN = 2, STEP = 0.5, TRIM = 2;
const MIN_CATCH = 0.9;        // reading windows at or above threshold
const MAX_FALSE = 0.05;       // per held-out silent part
const MIN_AVAILABLE = 0.9;    // ratio available, per part
const HEADROOM = 0.5;         // circularity: in each silent paced part, p95 of the score <= HEADROOM x threshold
// (Correlations with follow score and breath size are printed for information only. A |r| <= 0.2 pass rule
// was dropped before any real data: on overlapping 2 s windows it failed a synthetic detector that has no
// link to breathing at all (|r| 0.51 by chance), so it could not tell circular from not.)

const dir = path.join(__dirname, '..', '..', 'recordings');
const file = process.argv[2] ?? fs.readdirSync(dir).filter((f) => /^mouthcontrast-.*\.stream\.json$/.test(f)).sort().map((f) => path.join(dir, f)).pop();
if (!file) { console.error('No mouth-contrast recording found (npm run mouth-contrast).'); process.exit(2); }
const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
const P = rec.events.filter((e: any) => e.type === 'packet').map((e: any) => e.p);
const mouth: Sample[] = P.flatMap((p: any) => p.mouth ?? []).sort((a: Sample, b: Sample) => a.t - b.t);
const upper: Sample[] = P.flatMap((p: any) => p.upper);
const stages: [string, number][] = [];
for (const e of rec.events) if (e.type === 'pacer' && (!stages.length || stages[stages.length - 1][0] !== e.stage)) stages.push([e.stage, e.t]);
const tEnd = P[P.length - 1].t;
const part = (name: string): [number, number] => {
  const i = stages.findIndex(([s]) => s === name);
  if (i < 0) throw new Error(`part ${name} missing`);
  return [i === 0 ? Math.max(0, mouth[0]?.t ?? 0) : stages[i][1], i + 1 < stages.length ? stages[i + 1][1] : tEnd];
};
const windows = (name: string) => {
  const [a, b] = part(name);
  const out: { t: number; s: number }[] = [];
  let unscored = 0;
  for (let t = a + TRIM; t + WIN <= b - TRIM; t += STEP) { const s = speechScore(mouth, t, t + WIN); if (Number.isFinite(s)) out.push({ t, s }); else unscored++; }
  return { out, unscored };
};
const available = (name: string) => {
  const [a, b] = part(name);
  let c = 0, n = 0, j = 0;
  for (let t = a; t < b; t += 0.1, n++) {
    while (j < mouth.length - 1 && mouth[j + 1].t <= t) j++;
    if (mouth.some((s, k) => k >= j - 1 && k <= j + 2 && Math.abs(s.t - t) <= 0.25)) c++;
  }
  return n ? c / n : 0;
};
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

console.log(`Recording: ${path.basename(file)}`);
const checks: [string, boolean][] = [];
for (const name of ['silent-1', 'aloud', 'silent-2', 'pace-5.0-nose', 'pace-5.0-mouth']) {
  const av = available(name);
  checks.push([`ratio available in ${name}: ${(av * 100).toFixed(0)}% (needs >= ${MIN_AVAILABLE * 100}%)`, av >= MIN_AVAILABLE]);
}

// threshold from silent-1 and reading only
const s1 = windows('silent-1').out.map((w) => w.s), rd = windows('aloud').out.map((w) => w.s);
const p95s = q(s1, 0.95), p10r = q(rd, 0.1);
const separable = p10r > p95s;
const thr = Math.sqrt(p95s * p10r);
checks.push([`training separation: reading p10 ${p10r.toFixed(4)} > silent-1 p95 ${p95s.toFixed(4)}`, separable]);
console.log(`threshold (geometric mean of the two): ${thr.toFixed(4)}`);
const catchRate = rd.filter((s) => s >= thr).length / rd.length;
checks.push([`reading windows caught: ${(catchRate * 100).toFixed(0)}% (needs >= ${MIN_CATCH * 100}%)`, catchRate >= MIN_CATCH]);

// held-out silent parts
for (const name of ['silent-2', 'pace-5.0-nose', 'pace-5.0-mouth']) {
  const w = windows(name).out;
  const fa = w.filter((x) => x.s >= thr).length / Math.max(1, w.length);
  checks.push([`false alarms in ${name}: ${(fa * 100).toFixed(0)}% of ${w.length} windows (needs <= ${MAX_FALSE * 100}%)`, w.length > 0 && fa <= MAX_FALSE]);
}

// circularity on the silent paced parts: score vs local follow score and vs chest breath size
const [p0] = part('pace-5.0-nose');
const pacer: Sample[] = [];
for (let t = p0; t < tEnd; t += 0.1) { const ph = (((t - p0) * 5) / 60) % 1; pacer.push({ t, v: ph < 0.5 ? ph / 0.5 : 1 - (ph - 0.5) / 0.5 }); }
const breathSize = (a: number, b: number) => {
  const x = bandpass(detrend(resample(upper, a - 2, b + 2, 30)), 30, 0.05, 0.7).slice(60, 60 + (b - a) * 30);
  return Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
};
const allS: number[] = [], allF: number[] = [], allB: number[] = [];
for (const name of ['pace-5.0-nose', 'pace-5.0-mouth']) {
  const [a, b] = part(name);
  const w = windows(name).out;
  const fol = w.map((x) => adherence(upper, pacer, Math.max(a, x.t - 5), Math.min(b, x.t + 7), 5));
  const ok = w.map((x, i) => ({ s: x.s, f: fol[i], b: breathSize(x.t, x.t + WIN) })).filter((x) => Number.isFinite(x.f) && Number.isFinite(x.b));
  allS.push(...ok.map((x) => x.s)); allF.push(...ok.map((x) => x.f)); allB.push(...ok.map((x) => x.b));
  const p95 = q(w.map((x) => x.s), 0.95);
  checks.push([`${name}: headroom, p95 score ${p95.toFixed(4)} <= ${HEADROOM} x threshold (${(HEADROOM * thr).toFixed(4)})`, w.length > 0 && p95 <= HEADROOM * thr]);
  const rf = pearson(ok.map((x) => x.s), ok.map((x) => x.f)), rb = pearson(ok.map((x) => x.s), ok.map((x) => x.b));
  console.log(`info  ${name}: r score vs follow score ${rf.toFixed(2)}, vs breath size ${rb.toFixed(2)} (n=${ok.length} overlapping windows; not a pass/fail check)`);
}
console.log(`info  both paced parts: r vs follow ${pearson(allS, allF).toFixed(2)}, vs breath size ${pearson(allS, allB).toFixed(2)}`);

for (const [text, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'}  ${text}`);
const adopt = checks.every(([, p]) => p);
console.log(adopt ? `\nADOPT: talking = speech score >= ${thr.toFixed(4)} (log this threshold in docs/decisions.md before any coupling result)` : '\nREJECT: the mouth-opening detector does not meet the pre-registered test.');
process.exit(adopt ? 0 : 1);
