import { describe, it, expect } from 'vitest';
import { runSimulatedSession } from '../src/core/session-sim';
import { ValidityMonitor, VALIDITY } from '../src/core/validity';
import { validationMessage, ALL_VALIDATION_CODES } from '../src/core/validation-codes';
import type { Packet } from '../src/core/types';

const pkt = (t: number, extra: Partial<Packet> = {}): Packet => ({ t, upper: [], lower: [], pressure: [], eda: [], face: true, motion: 0, ...extra });

describe('Plan C fallback (no cardio)', () => {
  const { protocol } = runSimulatedSession({ sim: { seed: 21, noCardio: true }, felt: (b) => (b === 6.0 ? 5 : 3) });
  const r = protocol.result!;
  it('switches to breathing-only mode and says so', () => {
    expect(protocol.hasCardio).toBe(false);
    expect(r.mode).toBe('breathing-only');
    expect(r.explanation).toMatch(/breathing only/i);
  });
  it('never claims a clear peak without pulse data', () => {
    expect(r.certainty).not.toBe('clear');
  });
  it('prefers the comfortable, well-followed pace', () => {
    expect(r.bestPace).toBe(6.0);
  });
});

describe('no reliable reading', () => {
  it('gives no best pace when most paces are refused', () => {
    // signal lost from the second pace onwards
    const { protocol } = runSimulatedSession({ sim: { seed: 22, episodes: [{ from: 230, to: 3000, kind: 'lost' }] } });
    const r = protocol.result!;
    expect(r.certainty).toBe('insufficient');
    expect(r.bestPace).toBeNull();
    expect(r.explanation).toMatch(/No clear result today/);
    expect(protocol.stageResults.filter((s) => s.status === 'excluded').length).toBeGreaterThanOrEqual(3);
  });
});

describe('ValidityMonitor', () => {
  it('reports signal lost after the gap threshold and recovers only after settling', () => {
    const v = new ValidityMonitor();
    const wave = (t: number) => ({ pressure: [{ t, v: 1 }] });
    v.ingest({ type: 'packet', p: pkt(10, wave(10)) });
    v.ingest({ type: 'validation', t: 10, code: 0, hint: '' });
    expect(v.check(10.5).ok).toBe(true);
    expect(v.check(10 + VALIDITY.lostAfter + 0.1).reasons[0].id).toBe('lost');
    v.ingest({ type: 'packet', p: pkt(14, wave(14)) });
    expect(v.check(14).reasons[0].id).toBe('settling');
    v.ingest({ type: 'packet', p: pkt(14 + VALIDITY.settle, wave(14 + VALIDITY.settle)) });
    expect(v.check(14 + VALIDITY.settle + 0.01).ok).toBe(true);
  });
  it('refuses on talking, motion, flicker and any non-OK validation code', () => {
    const v = new ValidityMonitor();
    v.ingest({ type: 'packet', p: pkt(1, { talking: true }) });
    expect(v.check(1).reasons.map((r) => r.id)).toContain('talking');
    const m = new ValidityMonitor();
    m.ingest({ type: 'packet', p: pkt(1, { motion: 0.05 }) });
    expect(m.check(1).reasons.map((r) => r.id)).toContain('motion');
    const f = new ValidityMonitor();
    f.ingest({ type: 'packet', p: pkt(1) });
    f.setFlicker(0.9);
    expect(f.check(1).reasons.map((r) => r.id)).toContain('flicker');
    const c = new ValidityMonitor();
    c.ingest({ type: 'packet', p: pkt(1) });
    c.ingest({ type: 'validation', t: 1, code: 5, hint: '' });
    expect(c.check(1).reasons[0].short).toBe('Too dark');
  });
  it('enforces pulse confidence only after the grace period', () => {
    const v = new ValidityMonitor();
    v.ingest({ type: 'packet', p: pkt(0, { pressure: [{ t: 0, v: 1 }], pressureConf: 10 }) });
    expect(v.check(0).ok).toBe(true);
    v.ingest({ type: 'packet', p: pkt(VALIDITY.confGrace + 1, { pressure: [{ t: 16, v: 1 }], pressureConf: 10 }) });
    expect(v.check(VALIDITY.confGrace + 1).reasons.map((r) => r.id)).toContain('lowconf');
  });
});

describe('validation codes', () => {
  it('maps all 16 SDK codes (kOk + 15 problems) to plain language, with a safe fallback', () => {
    expect(ALL_VALIDATION_CODES.length).toBe(16);
    for (const c of ALL_VALIDATION_CODES) expect(validationMessage(c).tip.length).toBeGreaterThan(10);
    expect(validationMessage(99).blocking).toBe(true);
  });
});
