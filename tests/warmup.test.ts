// The SDK's cardio output starts late (pulse and pressure waveform first arrived at 36 s in the
// Nov 21 live check). Nothing may be scored before it arrives, and a missing stretch of waveform is
// never filled in. Coupling comes from our own beat detection, never from the SDK's HRV values.
import { describe, it, expect } from 'vitest';
import { runSimulatedSession } from '../src/core/session-sim';
import { ValidityMonitor, VALIDITY } from '../src/core/validity';
import { analyzeStage, coveredSpans } from '../src/core/analysis';
import { Protocol } from '../src/core/protocol';
import { eventTime } from '../src/core/capture';
import type { Packet, StreamEvent } from '../src/core/types';

const pkt = (t: number, extra: Partial<Packet> = {}): Packet => ({ t, upper: [], lower: [], pressure: [], eda: [], face: true, motion: 0, ...extra });
const ids = (v: ValidityMonitor, t: number) => v.check(t).reasons.map((r) => r.id);

describe('cardio warm-up gate', () => {
  it('refuses every moment until the pulse waveform arrives', () => {
    const v = new ValidityMonitor();
    for (let t = 0; t <= 35; t += 0.5) v.ingest({ type: 'packet', p: pkt(t) });
    expect(ids(v, 35)).toContain('warming');
    v.ingest({ type: 'packet', p: pkt(36, { pressure: [{ t: 36, v: 1 }] }) });
    expect(ids(v, 36)).not.toContain('warming');
  });
  it('falls back to breathing only if the waveform never arrives', () => {
    const v = new ValidityMonitor();
    for (let t = 0; t <= VALIDITY.cardioWaitS + 1; t += 0.5) v.ingest({ type: 'packet', p: pkt(t) });
    expect(ids(v, VALIDITY.cardioWaitS - 1)).toContain('warming');
    expect(ids(v, VALIDITY.cardioWaitS + 1)).not.toContain('warming');
  });
  it('refuses when the waveform pauses mid-session, even though packets keep coming', () => {
    const v = new ValidityMonitor();
    v.ingest({ type: 'packet', p: pkt(40, { pressure: [{ t: 40, v: 1 }] }) });
    for (let t = 40.5; t <= 45; t += 0.5) v.ingest({ type: 'packet', p: pkt(t) });
    expect(ids(v, 40 + VALIDITY.cardioLostAfter - 0.5)).not.toContain('nopulse');
    expect(ids(v, 45)).toContain('nopulse');
  });
  it('does not treat the averaged pulse rate as the waveform having started', () => {
    const v = new ValidityMonitor();
    v.ingest({ type: 'packet', p: pkt(20, { pulseRate: { t: 20, v: 70, conf: 80, stable: true } }) });
    expect(ids(v, 20)).toContain('warming');
  });
});

describe('a session whose pulse starts at 36 s, as measured live', () => {
  const { protocol, recording } = runSimulatedSession({ sim: { seed: 31, cardioDelayS: 36 } });
  const phases = recording.events.filter((e): e is Extract<StreamEvent, { type: 'marker' }> => e.type === 'marker' && e.kind === 'phase');
  it('cannot start the baseline before the waveform has arrived', () => {
    const baseline = phases.find((m) => m.data.name === 'baseline')!;
    expect(baseline.t).toBeGreaterThanOrEqual(36);
  });
  it('scores no pace with data from inside the warm-up', () => {
    for (let i = 0; i < protocol.order.length; i++) {
      const s = protocol.stageInput(i)!;
      for (const [a] of s.valid) expect(a).toBeGreaterThanOrEqual(36);
      expect(s.pressure[0].t).toBeGreaterThanOrEqual(36);
    }
  });
  it('still reaches a pulse-based result', () => {
    expect(protocol.hasCardio).toBe(true);
    expect(protocol.result!.mode).not.toBe('breathing-only');
    expect(protocol.result!.bestPace).not.toBeNull();
  });
});

describe('missing waveform is never filled in', () => {
  it('finds only the stretches that have samples', () => {
    const p = [...Array(300)].map((_, i) => ({ t: i / 30, v: 0 })).concat([...Array(600)].map((_, i) => ({ t: 20 + i / 30, v: 0 })));
    const spans = coveredSpans(p, 0, 40, 5);
    expect(spans.length).toBe(2);
    expect(spans[0][1]).toBeLessThan(10);
    expect(spans[1][0]).toBeGreaterThanOrEqual(20);
  });
  it('scores a pace with a waveform gap exactly as if only the covered part had been measured', () => {
    const { protocol } = runSimulatedSession({ sim: { seed: 32 } });
    const full = protocol.stageInput(2)!;
    const cut = full.measureStart + 30;
    const gapped = { ...full, pressure: full.pressure.filter((s) => s.t >= cut) };
    const onlyCovered = { ...full, valid: full.valid.map(([a, b]) => [Math.max(a, cut), b] as [number, number]).filter(([a, b]) => b > a) };
    const g = analyzeStage(gapped, true).coupling!, c = analyzeStage(onlyCovered, true).coupling!;
    expect(g).not.toBeNull();
    expect(g.amplitude).toBeCloseTo(c.amplitude, 6);
    expect(g.plv).toBeCloseTo(c.plv, 6);
  });
  it('gives the same coupling whatever the SDK HRV says (never stable, absent, or nonsense)', () => {
    const { recording } = runSimulatedSession({ sim: { seed: 33 } });
    expect(recording.events.some((e) => e.type === 'packet' && e.p.hrv)).toBe(true);
    const replay = (map: (p: Packet) => Packet) => {
      const pr = new Protocol({ guidedS: 0 }, 'follow');
      for (const e of recording.events) { pr.tick(eventTime(e)); pr.ingest(e.type === 'packet' ? { ...e, p: map(e.p) } : e); }
      return pr.stageResults.map((r) => [r.coupling?.amplitude, r.coupling?.plv, r.beatsKept]);
    };
    const asRecorded = replay((p) => p);
    expect(asRecorded.every(([amp]) => Number.isFinite(amp))).toBe(true);
    expect(replay(({ hrv, ...p }) => p)).toEqual(asRecorded);
    expect(replay((p) => (p.hrv ? { ...p, hrv: { ...p.hrv, rmssd: 999, sdnn: 999, conf: 0, stable: false } } : p))).toEqual(asRecorded);
  });
});
