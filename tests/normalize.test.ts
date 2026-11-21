import { describe, it, expect } from 'vitest';
import { Normalizer, toNum } from '../src/core/normalize';
import { mergePackets, auditRecording } from '../src/core/merge';
import { runSimulatedSession } from '../src/core/session-sim';

const us = (s: number) => 1_795_000_000_000_000 + s * 1e6;

describe('Normalizer', () => {
  it('reads protobuf Longs', () => {
    expect(toNum({ low: 5, high: 1, unsigned: false })).toBe(4294967296 + 5);
    expect(toNum('12')).toBe(12);
  });
  it('takes packet time from measurement timestamps, even if the event timestamp uses another base', () => {
    const n = new Normalizer();
    const p1 = n.packet({ breathing: { upperTrace: [{ value: 1, timestamp: us(0) }] } }, 42);
    const p2 = n.packet({ breathing: { upperTrace: [{ value: 1, timestamp: us(0.5) }] } }, 500_042);
    expect(p1.t).toBe(0);
    expect(p2.t).toBeCloseTo(0.5, 6);
    expect(p2.upper[0].t).toBeCloseTo(0.5, 6);
    // a packet with no samples uses the learned offset
    const p3 = n.packet({}, 1_000_042);
    expect(p3.t).toBeCloseTo(1.0, 6);
  });
  it('never runs backwards', () => {
    const n = new Normalizer();
    n.packet({ breathing: { upperTrace: [{ value: 1, timestamp: us(5) }] } }, 0);
    expect(n.packet({}, 'garbage').t).toBe(0);
  });
  it('continues an existing session clock with an offset (camera restart)', () => {
    const n = new Normalizer(700);
    const p = n.packet({ cardio: { arterialPressureTrace: [{ value: 1, timestamp: us(3), confidence: 60 }] } }, 0);
    expect(p.t).toBe(700);
    expect(p.pressureConf).toBe(60);
  });
  it('reads talking flags, motion and confidences', () => {
    const n = new Normalizer();
    const lm = (dx: number) => Array.from({ length: 20 }, (_, i) => ({ x: 100 + i * 5 + dx, y: 100 + i }));
    n.packet({ face: { landmarks: [{ value: lm(0), timestamp: us(0) }] } }, 0);
    const p = n.packet({ face: { landmarks: [{ value: lm(9.5), timestamp: us(0.1) }], talking: [{ detected: true, timestamp: us(0.1) }] }, cardio: { pulseRate: [{ value: 70, confidence: 55, stable: true, timestamp: us(0.1) }] } }, 0);
    expect(p.talking).toBe(true);
    expect(p.motion).toBeCloseTo(0.1, 2); // 9.5 px of a 95 px face
    expect(p.pulseRate).toMatchObject({ v: 70, conf: 55, stable: true });
  });
});

describe('recording merge for fixtures', () => {
  const { recording } = runSimulatedSession({ sim: { seed: 9, packetEvery: 0.1 } });
  const merged = mergePackets(recording, 0.5);
  it('keeps every trace sample and all markers while cutting packets', () => {
    const count = (r: typeof recording, k: 'upper' | 'pressure') => r.events.reduce((s, e) => s + (e.type === 'packet' ? e.p[k].length : 0), 0);
    expect(count(merged, 'upper')).toBe(count(recording, 'upper'));
    expect(count(merged, 'pressure')).toBe(count(recording, 'pressure'));
    const markers = (r: typeof recording) => r.events.filter((e) => e.type === 'marker').length;
    expect(markers(merged)).toBe(markers(recording));
    expect(merged.events.length).toBeLessThan(recording.events.length * 0.5);
  });
  it('audits clean', () => {
    expect(auditRecording(merged)).toEqual([]);
    expect(auditRecording({ ...merged, events: [...merged.events, { type: 'marker', t: 1, kind: 'end', data: { x: 'C:\\Users\\someone' } }] }).length).toBe(1);
  });
});
