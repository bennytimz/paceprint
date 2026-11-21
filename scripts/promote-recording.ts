// Turns a saved live session (metric stream) into the Judge Mode fixture.
//   npm run promote-recording -- "<path to .stream.json>"
// Merges packets to 0.5 s bins (keeps every sample), audits for non-metric content, checks that
// replay reproduces a result, and writes tests/fixtures/judge-recorded.json (loaded before the simulated one).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseRecording, compactEvent } from '../src/core/recorder';
import { mergePackets, auditRecording } from '../src/core/merge';
import { Protocol } from '../src/core/protocol';
import { eventTime } from '../src/core/capture';

const src = process.argv[2];
if (!src) { console.error('usage: npm run promote-recording -- <file.stream.json>'); process.exit(2); }
const rec = parseRecording(fs.readFileSync(src, 'utf8'));
if (rec.source !== 'camera') { console.error('Not a camera recording.'); process.exit(1); }
const merged = mergePackets(rec);
merged.events = merged.events.map(compactEvent);
merged.note = 'Real session, recorded live with the owner\'s consent (metric streams only, no video).';
const problems = auditRecording(merged);
if (problems.length) { console.error('Refusing to promote:', problems.join('; ')); process.exit(1); }

const p = new Protocol({}, 'follow');
for (const e of merged.events) { p.tick(eventTime(e)); p.ingest(e); }
if (!p.result) p.computeResult();
const r = p.result!;
console.log(`replay result: mode ${r.mode}, best ${r.bestPace}, certainty ${r.certainty}`);
for (const s of p.stageResults) console.log(`  ${s.bpm}/min ${s.status} follow ${(s.adherence * 100).toFixed(0)}% swing ${s.coupling?.amplitude?.toFixed(2) ?? '-'} felt ${s.felt ?? '-'} ${s.reason ?? ''}`);

const out = path.resolve(__dirname, '..', '..', 'tests', 'fixtures', 'judge-recorded.json');
fs.writeFileSync(out, JSON.stringify(merged));
console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB; was ${(fs.statSync(src).size / 1e6).toFixed(2)} MB)`);
