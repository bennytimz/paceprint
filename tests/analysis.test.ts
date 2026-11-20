import { describe, it, expect } from 'vitest';
import { runSimulatedSession } from '../src/core/session-sim';
import { detectBeats, heartRateSeries, coupling, adherence, toneAmplitudeCheck } from './helpers';

describe('simulated sweep', () => {
  const { protocol } = runSimulatedSession({ sim: { seed: 3, bestPace: 5.5 } });
  const r = protocol.result!;
  it('finishes with a result in coupling mode', () => {
    expect(r).toBeTruthy();
    expect(r.mode).toBe('coupling');
  });
  it('finds the modelled best pace within 0.5 breaths/min', () => {
    expect(Math.abs((r.bestPace ?? 0) - 5.5)).toBeLessThanOrEqual(0.5);
  });
  it('labels a clear modelled peak as clear or weak, never flat', () => {
    expect(['clear', 'weak']).toContain(r.certainty);
  });
  it('every stage was followed (adherence > 0.5) and kept', () => {
    for (const s of protocol.stageResults) {
      expect(s.status).toBe('ok');
      expect(s.adherence).toBeGreaterThan(0.5);
    }
  });
  it('reports a time to lock for each stage', () => {
    for (const s of protocol.stageResults) expect(Number.isFinite(s.lockTime)).toBe(true);
  });
});

describe('refusal', () => {
  it('excludes talking/motion time and extends the window instead of averaging it in', () => {
    // talk for 20 s and move for 15 s during the first measure window (starts ≈ 8+60+30 = 98 s)
    const { protocol } = runSimulatedSession({ sim: { seed: 4, episodes: [{ from: 110, to: 130, kind: 'talking' }, { from: 150, to: 165, kind: 'motion' }] } });
    const s = protocol.stageResults[0];
    expect(s.status).toBe('ok');
    expect(s.validSeconds).toBeGreaterThanOrEqual(89);
    const inp = protocol.stageInput(0)!;
    for (const [a, b] of inp.valid) {
      expect(b <= 110.6 || a >= 132).toBe(true); // packets arrive every 0.5 s in the simulator
    }
  });
  it('a stage ruined by motion is excluded with a reason, not guessed', () => {
    const { protocol } = runSimulatedSession({ sim: { seed: 5, episodes: [{ from: 100, to: 240, kind: 'motion' }] } });
    const s = protocol.stageResults[0];
    expect(s.status).toBe('excluded');
    expect(s.reason).toMatch(/trustworthy/);
  });
  it('flat response gives a flat label', () => {
    const { protocol } = runSimulatedSession({ sim: { seed: 6, peakSwing: 0 } });
    expect(['flat', 'weak']).toContain(protocol.result!.certainty);
  });
});

describe('dsp building blocks', () => {
  it('beat detection recovers heart rate from a synthetic waveform', () => {
    const fs = 30, hr = 72, pts = [] as { t: number; v: number }[];
    for (let i = 0; i < fs * 60; i++) {
      const t = i / fs, ph = (t * hr / 60) % 1;
      pts.push({ t, v: Math.exp(-((ph - 0.15) ** 2) / 0.003) });
    }
    const beats = detectBeats(pts, 0, 60);
    expect(beats.length).toBeGreaterThan(68);
    expect(beats.length).toBeLessThan(74);
    const s = heartRateSeries(beats, 2, 58)!;
    expect(Math.abs(s.hr[50] - 72)).toBeLessThan(1.5);
  });
  it('coupling sees a 4 bpm swing at 0.1 Hz with high PLV', () => {
    const fs = 4, n = 4 * 90, f = 0.1;
    const hr = new Float64Array(n), br = new Float64Array(n);
    for (let i = 0; i < n; i++) { hr[i] = 70 + 4 * Math.sin(2 * Math.PI * f * i / fs); br[i] = Math.sin(2 * Math.PI * f * i / fs - 0.5); }
    const c = coupling(hr, br, fs, f);
    expect(c.amplitude).toBeGreaterThan(3.5);
    expect(c.amplitude).toBeLessThan(4.5);
    expect(c.plv).toBeGreaterThan(0.95);
    expect(toneAmplitudeCheck()).toBe(true);
  });
  it('adherence is high when following and low when not', () => {
    const pacer = [] as any[], good = [] as any[], bad = [] as any[];
    for (let i = 0; i < 600; i++) { const t = i / 10; const ph = (t * 6 / 60) % 1; pacer.push({ t, v: Math.sin(2 * Math.PI * ph) }); good.push({ t, v: Math.sin(2 * Math.PI * (ph - 0.05)) }); bad.push({ t, v: Math.sin(2 * Math.PI * t * 14 / 60) }); }
    expect(adherence(good, pacer, 0, 60, 6)).toBeGreaterThan(0.9);
    expect(adherence(bad, pacer, 0, 60, 6)).toBeLessThan(0.4);
  });
});
