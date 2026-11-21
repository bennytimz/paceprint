// Pre-registered test of the sustained-talking rule (docs/decisions.md, "Burst tolerance: rule fixed before
// test"). Reading: a talk-contrast run made in the clean setup (after 23:00 on Nov 21). Silent control: the
// 5/min part of talk check 2 (recordings/talkcheck-2026-11-21T22-14-31-388Z). Prints ADOPT or REJECT.
// Only the talking flag is used. No coupling numbers.
// Run: npx esbuild scripts/eval-burst-tolerance.ts --bundle --platform=node --outfile=dist/scripts/eval-burst-tolerance.js && node dist/scripts/eval-burst-tolerance.js [contrast.json] [control.json]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SustainedTalking, SUSTAINED } from '../src/core/talking';
import { VALIDITY } from '../src/core/validity';

// ---- fixed before testing
const WIN = 2, STEP = 1, TRIM = 2, TICK = 0.1;
const REFUSED_IF = 0.5;       // a window counts as refused when the talking refusal covers >= half of it
const MIN_CATCH = 0.9;        // reading windows refused
const MAX_FALSE = 0.05;       // silent control windows refused
const CLEAN_SETUP_FROM = '2026-11-21T22-00';  // file stamps are UTC; 22:00 UTC = 23:00 Lagos

const dir = path.join(__dirname, '..', '..', 'recordings');
const newest = (re: RegExp) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().pop();
const CONTROL_ONLY = process.argv.includes('--control-only');  // the same check on the control alone; no verdict
const args = process.argv.slice(2).filter((x) => x !== '--control-only');
const contrastName = args[0] ? path.basename(args[0]) : newest(/^talkcontrast-.*\.stream\.json$/);
const controlName = args[1] ? path.basename(args[1]) : 'talkcheck-2026-11-21T22-14-31-388Z.stream.json';
const stamp = /^talkcontrast-(\d{4}-\d\d-\d\dT\d\d-\d\d)/.exec(contrastName ?? '')?.[1];
if (!CONTROL_ONLY && (!stamp || stamp < CLEAN_SETUP_FROM)) {
  console.error(`No talk-contrast run from the clean setup yet (newest: ${contrastName ?? 'none'}). Run: npm run talk-contrast`);
  process.exit(2);
}
const load = (name: string) => JSON.parse(fs.readFileSync(path.isAbsolute(name) ? name : path.join(dir, name), 'utf8'));

/** talking-refusal timeline from the flag alone: sustained rule, then the unchanged 2 s talking hold */
function refusal(rec: any) {
  const flags = rec.events.filter((e: any) => e.type === 'packet' && e.p.talking !== undefined).map((e: any) => ({ t: e.p.t, on: !!e.p.talking }));
  flags.sort((a: any, b: any) => a.t - b.t);
  const st = new SustainedTalking();
  let j = 0, lastActive = -Infinity;
  const end = flags.length ? flags[flags.length - 1].t : 0;
  const ticks: { t: number; refused: boolean }[] = [];
  for (let t = 0; t <= end; t += TICK) {
    while (j < flags.length && flags[j].t <= t) { st.push(flags[j].t, flags[j].on); j++; }
    if (st.active(t)) lastActive = t;
    ticks.push({ t, refused: t - lastActive < VALIDITY.talkingHold });
  }
  const stages: [string, number][] = [];
  for (const e of rec.events) if (e.type === 'pacer' && (!stages.length || stages[stages.length - 1][0] !== e.stage)) stages.push([e.stage, e.t]);
  const part = (name: string): [number, number] => {
    const i = stages.findIndex(([s]) => s === name);
    if (i < 0) throw new Error(`part ${name} missing`);
    return [stages[i][1], i + 1 < stages.length ? stages[i + 1][1] : end];
  };
  const windows = (name: string) => {
    const [a, b] = part(name);
    const out: boolean[] = [];
    for (let t = a + TRIM; t + WIN <= b - TRIM; t += STEP) {
      const w = ticks.filter((k) => k.t >= t && k.t < t + WIN);
      out.push(w.length > 0 && w.filter((k) => k.refused).length / w.length >= REFUSED_IF);
    }
    return out;
  };
  return { windows };
}

console.log(`Rule: talking when the flag was on for >= ${SUSTAINED.minFraction * SUSTAINED.windowS} of the last ${SUSTAINED.windowS} s; then the existing ${VALIDITY.talkingHold} s hold.`);
if (CONTROL_ONLY) {
  const sil = refusal(load(controlName)).windows('pace-5.0');
  const fr = sil.filter(Boolean).length / sil.length;
  console.log(`Control only (${controlName}): silent 5/min windows refused ${(fr * 100).toFixed(0)}% of ${sil.length} (needs <= ${MAX_FALSE * 100}%). No verdict without the reading run.`);
  process.exit(0);
}
console.log(`Reading: ${contrastName}\nControl: ${controlName}`);
const contrast = refusal(load(contrastName!)), control = refusal(load(controlName));
const rd = contrast.windows('aloud');
const sil = control.windows('pace-5.0');
const caught = rd.filter(Boolean).length / rd.length;
const falseRate = sil.filter(Boolean).length / sil.length;
const checks: [string, boolean][] = [
  [`reading windows refused: ${(caught * 100).toFixed(0)}% of ${rd.length} (needs >= ${MIN_CATCH * 100}%)`, caught >= MIN_CATCH],
  [`silent 5/min control windows refused: ${(falseRate * 100).toFixed(0)}% of ${sil.length} (needs <= ${MAX_FALSE * 100}%)`, falseRate <= MAX_FALSE],
];
for (const name of ['silent-1', 'silent-2']) {
  const w = contrast.windows(name);
  console.log(`info  contrast ${name}: ${(100 * w.filter(Boolean).length / w.length).toFixed(0)}% of ${w.length} windows refused (not a pass/fail check)`);
}
for (const [text, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'}  ${text}`);
const adopt = checks.every(([, p]) => p);
console.log(adopt ? '\nADOPT: wire the sustained rule into validity (log it in docs/decisions.md first).' : '\nREJECT: the sustained-talking rule does not meet the pre-registered test.');
process.exit(adopt ? 0 : 1);
