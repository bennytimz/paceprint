// Builds the bundled Judge Mode fixture from the simulated person (clearly labelled "simulated").
// npm run make-fixture
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runSimulatedSession } from '../src/core/session-sim';
import { compactEvent } from '../src/core/recorder';

const out = path.resolve(__dirname, '..', '..', 'tests', 'fixtures');
const { protocol, recording } = runSimulatedSession({
  sim: {
    seed: 11, bestPace: 5.5,
    // visible refusal moments: talking during the first measure window, motion during the third
    episodes: [{ from: 112, to: 124, kind: 'talking' }, { from: 372, to: 382, kind: 'motion' }],
  },
  guided: 60,
  note: 'SIMULATED person (not a real recording): best-coupled pace modelled at 5.5/min; talking at ~112 s and motion at ~372 s to show the refusal.',
});
recording.events = recording.events.map(compactEvent);
const file = path.join(out, 'judge-simulated.json');
fs.writeFileSync(file, JSON.stringify(recording));
const r = protocol.result!;
console.log(`wrote ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ${recording.events.length} events)`);
console.log(`result: best ${r.bestPace} certainty ${r.certainty} mode ${r.mode}`);
console.log(r.points.map((p) => `${p.bpm}: amp ${p.amplitude?.toFixed(2)} plv ${p.plv?.toFixed(2)} felt ${p.felt} ${p.status}`).join('\n'));
