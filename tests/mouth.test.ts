// Mouth-opening talking detector: lip ratio, speech score, and what gets kept.
import { describe, it, expect } from 'vitest';
import { lipRatio, speechScore, MOUTH } from '../src/core/mouth';
import { Normalizer } from '../src/core/normalize';
import { compactEvent, Recorder } from '../src/core/recorder';
import type { Sample } from '../src/core/types';

/** a 478-point mesh with the mouth at (cx, cy), `width` px wide and `gap` px open */
function mesh(gap: number, width = 50, scale = 1, cx = 640, cy = 400) {
  const pts = Array.from({ length: 478 }, (_, i) => ({ x: cx + (i % 20) * scale, y: cy - 100 * scale + i * 0.2 * scale }));
  pts[MOUTH.left] = { x: cx - (width / 2) * scale, y: cy };
  pts[MOUTH.right] = { x: cx + (width / 2) * scale, y: cy };
  pts[MOUTH.upper] = { x: cx, y: cy - (gap / 2) * scale };
  pts[MOUTH.lower] = { x: cx, y: cy + (gap / 2) * scale };
  return pts;
}

const series = (f: (t: number) => number, a: number, b: number, fs = 29): Sample[] =>
  Array.from({ length: Math.floor((b - a) * fs) + 1 }, (_, i) => ({ t: a + i / fs, v: f(a + i / fs) }));

describe('lip-opening ratio', () => {
  it('is gap / width, grows when the mouth opens, and ignores face size', () => {
    expect(lipRatio(mesh(5))).toBeCloseTo(0.1, 6);
    expect(lipRatio(mesh(20))).toBeGreaterThan(lipRatio(mesh(5)));
    expect(lipRatio(mesh(10, 50, 2.5))).toBeCloseTo(lipRatio(mesh(10)), 6);
  });
  it('is not computed from a partial mesh', () => {
    expect(lipRatio(mesh(10).slice(0, 100))).toBeNaN();
  });
});

describe('speech score', () => {
  it('is high for syllable-rate lip movement and ~0 for a still mouth', () => {
    const talk = series((t) => 0.15 + 0.08 * Math.max(0, Math.sin(2 * Math.PI * 4.5 * t)), 0, 10);
    const still = series(() => 0.05, 0, 10);
    expect(speechScore(talk, 3, 5)).toBeGreaterThan(0.02);
    expect(speechScore(still, 3, 5)).toBeLessThan(1e-6);
  });
  it('ignores slow mouth breathing at 5/min, however wide the mouth opens (no pacing dependence)', () => {
    // mouth opens fully once per 12 s breath: big, slow, regular
    const mouthBreath = series((t) => 0.05 + 0.3 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 12)), 0, 40);
    // irregular, poorly paced slow breathing: period wanders 8-16 s
    const sloppy = series((t) => 0.05 + 0.3 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t / 12 + 0.15 * Math.sin(t / 7)))), 0, 40);
    const talk = series((t) => 0.15 + 0.08 * Math.max(0, Math.sin(2 * Math.PI * 4.5 * t)), 0, 40);
    for (let a = 2; a < 36; a += 4) {
      expect(speechScore(mouthBreath, a, a + 2)).toBeLessThan(speechScore(talk, a, a + 2) / 10);
      expect(speechScore(sloppy, a, a + 2)).toBeLessThan(speechScore(talk, a, a + 2) / 10);
    }
  });
  it('refuses to score across a gap in the ratio', () => {
    const s = series((t) => 0.1 + 0.05 * Math.sin(2 * Math.PI * 4 * t), 0, 10).filter((x) => x.t < 4 || x.t > 4.6);
    expect(speechScore(s, 3, 5)).toBeNaN();
    expect(speechScore(s, 6, 8)).toBeGreaterThan(0);
  });
});

describe('what is kept', () => {
  const us = (s: number) => 1_795_000_000_000_000 + s * 1e6;
  it('the normalizer keeps one ratio per landmark frame and no face points', () => {
    const n = new Normalizer();
    const p = n.packet({ face: { landmarks: [{ value: mesh(5), timestamp: us(0) }, { value: mesh(10), timestamp: us(0.033) }] } }, 0);
    expect(p.mouth!.map((s) => s.v)).toEqual([expect.closeTo(0.1, 6), expect.closeTo(0.2, 6)]);
    expect(JSON.stringify(p)).not.toMatch(/"x":/);
  });
  it('app recordings drop the ratio until the consent text covers it', () => {
    const e = { type: 'packet' as const, p: { t: 1, upper: [], lower: [], pressure: [], eda: [], mouth: [{ t: 1, v: 0.12 }] } };
    expect((compactEvent(e) as any).p.mouth).toBeUndefined();
    const rec = new Recorder('camera');
    rec.push(e);
    expect(JSON.stringify(rec.toRecording())).not.toMatch(/mouth/);
    expect((compactEvent(e, true) as any).p.mouth).toEqual([{ t: 1, v: 0.12 }]);
  });
});
