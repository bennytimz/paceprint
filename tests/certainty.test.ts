// Certainty label: a "clear peak" must hold up across the three 30 s parts of each pace and stand out
// from the paces either side. Synthetic stage results (exact) plus simulated people (end to end).
import { describe, it, expect } from 'vitest';
import { summarizeSweep, splitValid, type StageResult } from '../src/core/analysis';
import { runSimulatedSession } from '../src/core/session-sim';

const PACES = [7.0, 6.5, 6.0, 5.5, 5.0];

function stage(bpm: number, blocks: number[], plv = 0.8, felt = 3): StageResult {
  const amp = blocks.reduce((a, b) => a + b, 0) / blocks.length;
  return {
    id: `pace-${bpm}`, bpm, validSeconds: 90, adherence: 0.9, lockTime: 8, beatsKept: 1, felt, status: 'ok',
    coupling: { amplitude: amp, plv, lagDeg: 0, swing: amp * 2, meanHr: 68, _re: 0, _im: 0, _n: 0 },
    blocks: blocks.map((a) => ({ amplitude: a, plv })),
  };
}
/** build a sweep from per-pace part values, in PACES order */
const sweep = (parts: number[][], plv: number[] = PACES.map(() => 0.8)) =>
  summarizeSweep(PACES.map((p, i) => stage(p, parts[i], plv[i])), null);

describe('splitValid', () => {
  it('cuts clean time into three equal parts, across gaps', () => {
    const parts = splitValid([[0, 40], [50, 100]], 3); // 90 s of clean time
    const dur = parts.map((p) => p.reduce((a, [x, y]) => a + (y - x), 0));
    for (const d of dur) expect(d).toBeCloseTo(30, 6);
    expect(parts[1]).toEqual([[30, 40], [50, 70]]);
  });
});

describe('certainty from synthetic stage results', () => {
  it('clear peak: every part agrees and the peak stands clear of its neighbours', () => {
    const r = sweep([[3.0, 3.1, 2.9], [5.4, 5.5, 5.6], [7.1, 6.9, 7.0], [5.5, 5.6, 5.4], [3.0, 2.9, 3.1]]);
    expect(r.certainty).toBe('clear');
    expect(r.bestPace).toBe(6);
    expect(r.checks.blockPeaks).toEqual([6, 6, 6]);
    expect(r.checks.blocksAgree).toBe(true);
    expect(r.checks.standsOut).toBe(true);
    expect(r.explanation).toMatch(/All three 30-second parts/);
  });

  it('noisy: same averages, but the parts point to different paces -> never clear, and it says why', () => {
    const r = sweep([[2.0, 4.0, 3.0], [8.0, 4.0, 4.5], [7.0, 6.5, 7.5], [4.0, 8.5, 4.0], [3.0, 2.0, 4.0]]);
    expect(r.checks.blockPeaks).toEqual([6.5, 5.5, 6]);
    expect(r.checks.blocksAgree).toBe(false);
    expect(r.certainty).not.toBe('clear');
    expect(r.explanation).toMatch(/30-second parts of each pace pointed to different paces \(6\.5, 5\.5, 6\.0\)/);
  });

  it('noisy: a peak smaller than the part-to-part wobble is not clear', () => {
    // means 3 / 5.5 / 6.5 / 5.5 / 3, but each pace swings ±1.5 bpm between parts
    const r = sweep([[1.5, 3.0, 4.5], [4.0, 5.5, 7.0], [5.2, 8.0, 6.3], [7.0, 4.0, 5.5], [1.5, 4.5, 3.0]]);
    expect(r.checks.standsOut).toBe(false);
    expect(r.certainty).not.toBe('clear');
  });

  it('a peak barely above the pace next to it is not clear, even if far above the rest', () => {
    const r = sweep([[2.0, 2.1, 1.9], [2.5, 2.4, 2.6], [6.0, 6.1, 5.9], [5.6, 5.5, 5.7], [2.0, 2.1, 1.9]]);
    expect(r.checks.gapToNeighbours!).toBeCloseTo(0.4, 6);
    expect(r.certainty).not.toBe('clear');
    expect(r.explanation).toMatch(/only 0\.4 bpm above the pace next to it/);
  });

  it('flat: small spread gives "flat", names the real range, and says it is a real result', () => {
    const r = sweep([[2.0, 2.1, 1.9], [2.1, 2.0, 2.2], [2.2, 2.1, 2.3], [2.1, 2.2, 2.0], [2.0, 1.9, 2.1]]);
    expect(r.certainty).toBe('flat');
    expect(r.checks.spread!.min).toBeCloseTo(2.0, 6);
    expect(r.checks.spread!.max).toBeCloseTo(2.2, 6);
    expect(r.explanation).toMatch(/ranged from 2\.0 to 2\.2 bpm/);
    expect(r.explanation).toMatch(/real result/);
  });

  it('flat keeps every point and the felt-ease answers for the chart', () => {
    const r = sweep([[2.0, 2.1, 1.9], [2.1, 2.0, 2.2], [2.2, 2.1, 2.3], [2.1, 2.2, 2.0], [2.0, 1.9, 2.1]]);
    expect(r.points.every((p) => p.amplitude !== null && p.felt === 3 && p.blocks.length === 3)).toBe(true);
  });
});

describe('PLV saturation', () => {
  it('PLV near 1.0 at every pace is flagged and cannot move the ranking', () => {
    // swing peaks at 6.0; PLV is highest at 7.0 but all within 0.995..0.999
    const parts = [[3.0, 3.1, 2.9], [5.4, 5.5, 5.6], [7.1, 6.9, 7.0], [5.5, 5.6, 5.4], [3.0, 2.9, 3.1]];
    const r = sweep(parts, [0.999, 0.996, 0.995, 0.996, 0.997]);
    expect(r.checks.plvSaturated).toBe(true);
    expect(r.checks.plvRange!.max - r.checks.plvRange!.min).toBeLessThan(0.005);
    expect(r.bestPace).toBe(6);
  });

  it('nearly equal PLV (below 0.95) also counts as saturated: it does not tell paces apart', () => {
    const parts = [[2.0, 2.1, 1.9], [2.1, 2.0, 2.2], [2.2, 2.1, 2.3], [2.1, 2.2, 2.0], [2.0, 1.9, 2.1]];
    const r = sweep(parts, [0.80, 0.81, 0.82, 0.81, 0.80]);
    expect(r.checks.plvSaturated).toBe(true);
    expect(r.certainty).toBe('flat');
  });

  it('PLV that really varies is kept', () => {
    const parts = [[3.0, 3.1, 2.9], [5.4, 5.5, 5.6], [7.1, 6.9, 7.0], [5.5, 5.6, 5.4], [3.0, 2.9, 3.1]];
    const r = sweep(parts, [0.4, 0.6, 0.9, 0.7, 0.5]);
    expect(r.checks.plvSaturated).toBe(false);
  });

  it('the simulated person saturates PLV, and the result says so through the checks', () => {
    const r = runSimulatedSession({ sim: { seed: 41, bestPace: 6.0 } }).protocol.result!;
    expect(r.checks.plvSaturated).toBe(true);
  });
});

describe('certainty on simulated people', () => {
  it('clear modelled peak: clear, at the modelled pace, all parts agree', () => {
    const r = runSimulatedSession({ sim: { seed: 41, bestPace: 6.0 } }).protocol.result!;
    expect(r.certainty).toBe('clear');
    expect(r.bestPace).toBe(6);
    expect(r.checks.blocksAgree).toBe(true);
  });

  it('flat person with drifting swing: never clear', () => {
    for (const seed of [31, 32, 33, 34, 35]) {
      const r = runSimulatedSession({ sim: { seed, peakSwing: 0, swingJitter: 0.3 } }).protocol.result!;
      expect(r.certainty, `seed ${seed}`).not.toBe('clear');
    }
  });

  it('noisy person (small peak, heavy drift): a "clear" label is never more than one step from the true pace', () => {
    for (const seed of [21, 22, 23, 24, 25, 26]) {
      const r = runSimulatedSession({ sim: { seed, peakSwing: 2, swingJitter: 0.6, hrNoise: 2 } }).protocol.result!;
      if (r.certainty === 'clear') expect(Math.abs(r.bestPace! - 5.5), `seed ${seed}`).toBeLessThanOrEqual(0.5);
    }
  });
});
