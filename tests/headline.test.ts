// The result headline must always say why a peak is weak. Live run, Sun Nov 22: swing peaked at 6.0/min
// (8.4 bpm) and stood out in every part, but PLV there was 0.07, so the peak was 'weak', and the sentence
// read "The peak is weak: . Treat it as a starting point." Numbers below are that session's summary.
import { describe, it, expect } from 'vitest';
import { summarizeSweep, type StageResult } from '../src/core/analysis';

function stage(bpm: number, amp: number, plv: number, parts = [amp, amp, amp]): StageResult {
  return {
    id: `pace-${bpm}`, bpm, validSeconds: 90, adherence: 0.85, lockTime: 40, beatsKept: 1, status: 'ok', felt: 3,
    coupling: { amplitude: amp, plv, lagDeg: 0, swing: amp, meanHr: 70, _re: 0, _im: 0, _n: 1 },
    blocks: parts.map((a, i) => ({ amplitude: a + (i - 1) * 0.1, plv })),
  };
}
const excluded = (bpm: number): StageResult => ({ id: `pace-${bpm}`, bpm, validSeconds: 46, adherence: NaN, lockTime: NaN, coupling: null, beatsKept: 0, status: 'excluded', reason: 'Trustworthy data came only in short fragments.', blocks: [] });

describe('weak-peak headline', () => {
  it('live session of Nov 22: weak because PLV at the peak is low, and the sentence says so', () => {
    const r = summarizeSweep([excluded(7), stage(6.5, 3.49, 0.055), stage(6, 8.43, 0.068), stage(5.5, 4.08, 0.767), stage(5, 3.66, 0.605)], null);
    expect(r.bestPace).toBe(6);
    expect(r.certainty).toBe('weak');
    expect(r.checks.standsOut).toBe(true);
    expect(r.checks.blocksAgree).toBe(true);
    expect(r.explanation).not.toMatch(/weak: \./);
    expect(r.explanation).toContain('The peak is weak: your heartbeat did not keep time with your breathing at that pace (coupling 0.07; a clear peak needs 0.50). Treat it as a starting point.');
  });
  it('the same data with a high PLV at the peak is clear (the PLV rule alone made it weak)', () => {
    const r = summarizeSweep([excluded(7), stage(6.5, 3.49, 0.055), stage(6, 8.43, 0.7), stage(5.5, 4.08, 0.767), stage(5, 3.66, 0.605)], null);
    expect(r.certainty).toBe('clear');
  });
  it('only three paces read: says so', () => {
    const r = summarizeSweep([excluded(7), excluded(6.5), stage(6, 8.43, 0.8), stage(5.5, 4.08, 0.767), stage(5, 3.66, 0.605)], null);
    expect(r.certainty).toBe('weak');
    expect(r.explanation).toContain('only 3 paces could be compared (a clear peak needs 4)');
  });
  it('every weak explanation names at least one reason', () => {
    const cases = [
      [stage(6.5, 3.5, 0.6), stage(6, 4.2, 0.6), stage(5.5, 3.6, 0.6), stage(5, 3.4, 0.6)],
      [stage(6.5, 3.5, 0.2), stage(6, 6, 0.2), stage(5.5, 3.6, 0.2), stage(5, 3.4, 0.2)],
      [stage(7, 2, 0.7), stage(6.5, 3.5, 0.7), stage(6, 6, 0.7, [6, 6, 3]), stage(5.5, 3.6, 0.7), stage(5, 3.4, 0.7)],
    ];
    for (const c of cases) {
      const r = summarizeSweep(c, null);
      if (r.certainty === 'weak') expect(r.explanation).toMatch(/The peak is weak: \S/);
    }
  });
});
