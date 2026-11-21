// Mouth-opening talking detector (candidate; not wired into validity until it passes the test logged in
// docs/decisions.md). From the SDK's 478-point face mesh we compute ONE number per frame, the lip-opening
// ratio, and keep nothing else from the face points. Speech moves the lips several times a second
// (syllables, ~2-7 Hz); breathing, even through the mouth at 5/min, opens them slowly (< 0.5 Hz). The
// score only looks at the fast band, so how slowly or regularly someone breathes cannot raise it.
import type { Sample } from './types';
import { resample, detrend, bandpass } from './dsp';

export const MOUTH = {
  /** face-mesh indices: inner upper lip, inner lower lip, left and right mouth corners.
   *  The SDK does not document its layout; 478 points and the first points we checked (0 = upper lip,
   *  1 = nose tip, 2 = between, all on the midline) match the standard face-mesh-with-iris layout. */
  upper: 13, lower: 14, left: 61, right: 291,
  minPoints: 468,
  fs: 30,
  /** articulation band, Hz */
  bandLo: 2, bandHi: 7,
  /** padding resampled on each side of a scored window, for filter edges */
  padS: 1,
  /** a window needs a sample at least this often, else it is not scored */
  maxGapS: 0.25,
};

type Pt = { x: number; y: number };

/** Lip gap divided by mouth width (scale-free). NaN if the mesh is too small or the mouth width is ~0. */
export function lipRatio(lm: Pt[]): number {
  if (!lm || lm.length < MOUTH.minPoints) return NaN;
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = d(lm[MOUTH.left], lm[MOUTH.right]);
  if (!(width > 1e-6)) return NaN;
  return d(lm[MOUTH.upper], lm[MOUTH.lower]) / width;
}

/**
 * Speech score for [a, b]: RMS of the lip-opening ratio in the articulation band (2-7 Hz).
 * NaN when the ratio is missing for more than `maxGapS` anywhere in the padded window: a gap is never
 * filled in and scored.
 */
export function speechScore(mouth: Sample[], a: number, b: number): number {
  const lo = a - MOUTH.padS, hi = b + MOUTH.padS;
  const inside = mouth.filter((s) => s.t >= lo && s.t <= hi && Number.isFinite(s.v));
  if (inside.length < 2) return NaN;
  let prev = lo;
  for (const s of inside) { if (s.t - prev > MOUTH.maxGapS) return NaN; prev = s.t; }
  if (hi - prev > MOUTH.maxGapS) return NaN;
  const x = bandpass(detrend(resample(inside, lo, hi, MOUTH.fs)), MOUTH.fs, MOUTH.bandLo, MOUTH.bandHi);
  const i0 = Math.round(MOUTH.padS * MOUTH.fs), i1 = x.length - i0;
  let s2 = 0;
  for (let i = i0; i < i1; i++) s2 += x[i] * x[i];
  return Math.sqrt(s2 / Math.max(1, i1 - i0));
}
