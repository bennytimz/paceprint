// Rule 8 fallback: the SDK talking flag is warned and audited, never used to refuse or to rank.
import { describe, it, expect } from 'vitest';
import { talkShare, ANALYSIS } from '../src/core/analysis';
import { runSimulatedSession } from '../src/core/session-sim';

describe('talking-flag audit share', () => {
  it('counts only flag packets inside trusted time', () => {
    const talk = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => ({ t, v: t < 4 ? 1 : 0 }));
    expect(talkShare(talk, [[0, 10]])).toBeCloseTo(0.4);
    expect(talkShare(talk, [[4, 10]])).toBe(0);
    expect(talkShare(talk, [[0, 2]])).toBe(1);
  });
  it('is NaN without flag data', () => {
    expect(talkShare([], [[0, 10]])).toBeNaN();
    expect(talkShare(undefined, [[0, 10]])).toBeNaN();
  });
});

describe('a talking flag that fires on its own', () => {
  const clean = runSimulatedSession({ sim: { seed: 31 } }).protocol;
  const flagged = runSimulatedSession({ sim: { seed: 31, episodes: [{ from: 0, to: 3600, kind: 'flagonly' }] } }).protocol;
  it('refuses nothing: every pace is read exactly as without the flag', () => {
    expect(flagged.stageResults.map((s) => s.status)).toEqual(clean.stageResults.map((s) => s.status));
    expect(flagged.stageResults.map((s) => s.validSeconds)).toEqual(clean.stageResults.map((s) => s.validSeconds));
    expect(flagged.result!.bestPace).toBe(clean.result!.bestPace);
    expect(flagged.result!.certainty).toBe(clean.result!.certainty);
  });
  it('reports each pace as flagged and caveated', () => {
    for (const s of flagged.stageResults) { expect(s.talkShare).toBe(1); expect(s.talkCaveat).toBe(true); }
    for (const s of clean.stageResults) { expect(s.talkShare).toBe(0); expect(s.talkCaveat).toBe(false); }
  });
  it('the caveat line sits between silent and reading shares seen in the clean setup', () => {
    // clean-setup flag shares: silent 0, 8, 21 %; reading 70 % (docs/decisions.md)
    expect(ANALYSIS.talkCaveat).toBeGreaterThan(0.21);
    expect(ANALYSIS.talkCaveat).toBeLessThan(0.7);
  });
});
