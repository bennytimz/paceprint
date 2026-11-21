import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseRecording } from '../src/core/recorder';
import { Protocol } from '../src/core/protocol';
import { eventTime } from '../src/core/capture';

describe('judge fixture replay', () => {
  const rec = parseRecording(fs.readFileSync(path.join(__dirname, 'fixtures', 'judge-simulated.json'), 'utf8'));
  it('is labelled simulated and contains no frames', () => {
    expect(rec.source).toBe('simulated');
    expect(JSON.stringify(rec.events.slice(0, 50))).not.toMatch(/frame|image|jpeg|png/i);
  });
  it('follow-mode protocol reproduces the recorded session result', () => {
    const p = new Protocol({ guidedS: 60 }, 'follow');
    for (const e of rec.events) { p.tick(eventTime(e)); p.ingest(e); }
    expect(p.result).toBeTruthy();
    expect(p.result!.bestPace).toBe(5.5);
    // The modelled peak is real and every 30 s part agrees on it. Its gap to 6.0/min sits right at the
    // two-standard-error line (the talking moment makes the parts wobble), so the label can be "clear" or
    // "weak" depending on where stage boundaries fall to the frame (the app's replay clock vs this loop).
    // Either way it must never be "flat", and a "weak" label must say why.
    const r = p.result!;
    expect(['clear', 'weak']).toContain(r.certainty);
    expect(r.checks.blocksAgree).toBe(true);
    if (r.certainty === 'weak') expect(r.explanation).toMatch(/bpm above the pace next to it/);
    expect(p.stageResults.every((s) => s.felt !== undefined)).toBe(true);
  });
});
