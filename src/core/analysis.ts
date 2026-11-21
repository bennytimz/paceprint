// Pure analysis functions. Formulas are documented in docs/analysis.md.
// IMPORTANT: coupling is computed from beat timing on the arterial pressure WAVEFORM,
// never from the SDK's ~12 s averaged pulse rate (that average erases the swing we measure).
import type { Sample } from './types';
import { resample, bandpass, bandAnalytic, pearson, findPeaks, std, median, mean, toneAmplitude, wrapPi, detrend } from './dsp';

export const ANALYSIS = {
  breathFs: 10,
  hrFs: 4,
  pressureFs: 30,
  maxLagS: 2.5,
  adherenceMin: 0.5,       // below this a stage is excluded: you weren't following the pacer
  lockThreshold: 0.6,
  lockWindowS: 15,
  minValidS: 45,           // a stage needs this much valid measuring time
  minSegmentS: 20,
  /** stage score = our own measures only: heart-rate swing at the pace and phase locking (PLV) */
  weights: { amplitude: 0.5, plv: 0.3 },
  ibiMin: 60 / 110,        // valid pulse 40..110 bpm
  ibiMax: 60 / 40,
};

export type Segment = [number, number];

function inSegments(t: number, segs: Segment[]) {
  return segs.some(([a, b]) => t >= a && t < b);
}

/** keep segments at least `min` seconds long */
export function longSegments(segs: Segment[], min: number): Segment[] {
  return segs.filter(([a, b]) => b - a >= min);
}

// ---------------------------------------------------------------------------
// Adherence (follow score) and time to lock
// ---------------------------------------------------------------------------

/**
 * How closely the breathing trace follows the pacer over [a,b): the best Pearson correlation
 * between the band-passed trace and the pacer fill, over lags 0..2.5 s (people trail the guide).
 * Sign-agnostic, because trace polarity is not guaranteed. Returns 0..1.
 */
export function adherence(trace: Sample[], pacer: Sample[], a: number, b: number, bpm: number): number {
  const fs = ANALYSIS.breathFs;
  if (b - a < 8 || trace.length < 10) return NaN;
  const f0 = bpm / 60;
  const x = bandpass(resample(trace, a, b, fs), fs, f0 * 0.5, f0 * 2.5);
  const y = resample(pacer, a, b, fs);
  let best = -1;
  const maxLag = Math.round(ANALYSIS.maxLagS * fs);
  for (let lag = 0; lag <= maxLag; lag++) {
    const r = Math.abs(pearson(x.subarray(lag), y.subarray(0, y.length - lag)));
    if (r > best) best = r;
  }
  return best;
}

/** Seconds from `start` until a rolling window of adherence first stays ≥ threshold. NaN if never. */
export function timeToLock(trace: Sample[], pacer: Sample[], start: number, end: number, bpm: number): number {
  const w = ANALYSIS.lockWindowS;
  for (let t = start + w; t <= end; t += 1) {
    if (adherence(trace, pacer, t - w, t, bpm) >= ANALYSIS.lockThreshold) return Math.max(0, t - w - start + w / 2);
  }
  return NaN;
}

// ---------------------------------------------------------------------------
// Beats -> instantaneous heart rate
// ---------------------------------------------------------------------------

/** Beat times (s) from the arterial pressure waveform in [a,b). */
export function detectBeats(pressure: Sample[], a: number, b: number): number[] {
  const fs = ANALYSIS.pressureFs;
  const raw = resample(pressure, a, b, fs);
  if (raw.length < fs * 5 || raw.some((v) => !Number.isFinite(v))) return [];
  const x = bandpass(raw, fs, 0.7, 3.2);
  const s = std(x);
  const peaks = findPeaks(x, Math.round(ANALYSIS.ibiMin * fs * 0.9), 0.3 * s);
  // parabolic interpolation for sub-sample timing
  return peaks.map((i) => {
    const y0 = x[i - 1], y1 = x[i], y2 = x[i + 1];
    const den = y0 - 2 * y1 + y2;
    const off = den !== 0 ? (0.5 * (y0 - y2)) / den : 0;
    return a + (i + Math.max(-0.5, Math.min(0.5, off))) / fs;
  });
}

/**
 * Instantaneous heart rate (bpm) on a uniform grid, from beat times.
 * Intervals outside 40..110 bpm, or > 25 % off the local median, are dropped (ectopic/missed beats).
 */
export function heartRateSeries(beats: number[], a: number, b: number, fs = ANALYSIS.hrFs): { hr: Float64Array; kept: number } | null {
  const pts: Sample[] = [];
  for (let i = 1; i < beats.length; i++) {
    const ibi = beats[i] - beats[i - 1];
    if (ibi < ANALYSIS.ibiMin || ibi > ANALYSIS.ibiMax) continue;
    pts.push({ t: (beats[i] + beats[i - 1]) / 2, v: 60 / ibi });
  }
  if (pts.length < 8) return null;
  const clean = pts.filter((p, i) => {
    const nb = pts.slice(Math.max(0, i - 4), i + 5).map((q) => q.v);
    return Math.abs(p.v - median(nb)) / median(nb) < 0.25;
  });
  if (clean.length < 8) return null;
  return { hr: resample(clean, a, b, fs), kept: clean.length / pts.length };
}

// ---------------------------------------------------------------------------
// Coupling
// ---------------------------------------------------------------------------

export interface Coupling {
  /** heart-rate swing at the pacing frequency, bpm (amplitude of the sinusoid) */
  amplitude: number;
  /** phase-locking value between heart rate and breathing, 0..1 */
  plv: number;
  /** mean phase lag of heart rate relative to breathing, degrees */
  lagDeg: number;
  /** median per-cycle peak-to-trough heart-rate swing, bpm (cross-check) */
  swing: number;
  meanHr: number;
  /** PLV accumulator so segments can be pooled */
  _re: number; _im: number; _n: number;
}

export function coupling(hr: Float64Array, breath: Float64Array, fs: number, f0: number): Coupling {
  const lo = Math.max(0.02, f0 - 0.05), hi = f0 + 0.05;
  const h = bandAnalytic(hr, fs, lo, hi);
  const r = bandAnalytic(breath, fs, lo, hi);
  // ignore 10 % edges (filter ringing)
  const e = Math.floor(hr.length * 0.1);
  let re = 0, im = 0, n = 0;
  for (let i = e; i < hr.length - e; i++) {
    const d = h.phase[i] - r.phase[i];
    re += Math.cos(d); im += Math.sin(d); n++;
  }
  const period = Math.round(fs / f0);
  const swings: number[] = [];
  const hd = detrend(hr);
  for (let i = 0; i + period <= hd.length; i += period) {
    let mn = Infinity, mx = -Infinity;
    for (let j = i; j < i + period; j++) { mn = Math.min(mn, hd[j]); mx = Math.max(mx, hd[j]); }
    swings.push(mx - mn);
  }
  return {
    amplitude: toneAmplitude(hr, fs, f0),
    plv: n ? Math.hypot(re, im) / n : NaN,
    lagDeg: (Math.atan2(im, re) * 180) / Math.PI,
    swing: median(swings),
    meanHr: mean(hr),
    _re: re, _im: im, _n: n,
  };
}

// ---------------------------------------------------------------------------
// Stage analysis
// ---------------------------------------------------------------------------

export interface StageInput {
  id: string;
  bpm: number;          // 0 = baseline (free breathing)
  start: number;        // stage start (settle begins)
  measureStart: number; // settle ends
  end: number;
  valid: Segment[];     // valid intervals inside the measure window
  upper: Sample[];
  lower: Sample[];
  pressure: Sample[];
  pacer: Sample[];      // pacer fill 0..1 (empty for baseline)
  felt?: number;        // felt-ease 1..5
}

export interface StageResult {
  id: string;
  bpm: number;
  validSeconds: number;
  adherence: number;
  lockTime: number;
  coupling: Coupling | null;
  beatsKept: number;
  felt?: number;
  status: 'ok' | 'excluded';
  reason?: string;
}

function pickBreath(s: StageInput): { trace: Sample[]; which: 'lower' | 'upper' } {
  if (s.lower.length > 10 && s.bpm > 0) {
    const segs = longSegments(s.valid, 15);
    const aLow = mean(segs.map(([a, b]) => adherence(s.lower, s.pacer, a, b, s.bpm)));
    const aUp = mean(segs.map(([a, b]) => adherence(s.upper, s.pacer, a, b, s.bpm)));
    if (!(aUp > aLow + 0.1)) return { trace: s.lower, which: 'lower' };
    return { trace: s.upper, which: 'upper' };
  }
  return s.lower.length > 10 ? { trace: s.lower, which: 'lower' } : { trace: s.upper, which: 'upper' };
}

/** dominant breathing frequency (Hz) in 0.08..0.6 Hz, for the free-breathing baseline */
export function dominantBreathHz(trace: Sample[], a: number, b: number): number {
  const fs = ANALYSIS.breathFs;
  const x = resample(trace, a, b, fs);
  let best = 0.25, bestA = -1;
  for (let f = 0.08; f <= 0.6; f += 0.005) {
    const amp = toneAmplitude(x, fs, f);
    if (amp > bestA) { bestA = amp; best = f; }
  }
  return best;
}

export function analyzeStage(s: StageInput, hasCardio: boolean): StageResult {
  const validSeconds = s.valid.reduce((acc, [a, b]) => acc + (b - a), 0);
  const base: StageResult = { id: s.id, bpm: s.bpm, validSeconds, adherence: NaN, lockTime: NaN, coupling: null, beatsKept: 0, felt: s.felt, status: 'ok' };
  const minValid = s.bpm > 0 ? ANALYSIS.minValidS : 30;
  if (validSeconds < minValid) return { ...base, status: 'excluded', reason: `Only ${Math.round(validSeconds)} s of trustworthy data (needs ${minValid} s).` };

  const { trace } = pickBreath(s);
  const segs = longSegments(s.valid, ANALYSIS.minSegmentS);
  if (!segs.length) return { ...base, status: 'excluded', reason: 'Trustworthy data came only in short fragments.' };

  if (s.bpm > 0) {
    let num = 0, den = 0;
    for (const [a, b] of segs) {
      const ad = adherence(trace, s.pacer, a, b, s.bpm);
      if (Number.isFinite(ad)) { num += ad * (b - a); den += b - a; }
    }
    base.adherence = den ? num / den : NaN;
    base.lockTime = timeToLock(trace, s.pacer, s.start, s.end, s.bpm);
    if (!(base.adherence >= ANALYSIS.adherenceMin)) {
      return { ...base, status: 'excluded', reason: 'Breathing did not follow the guide closely enough to compare this pace.' };
    }
  }

  if (hasCardio) {
    const f0 = s.bpm > 0 ? s.bpm / 60 : dominantBreathHz(trace, segs[0][0], segs[0][1]);
    const parts: { c: Coupling; w: number; kept: number }[] = [];
    for (const [a, b] of segs) {
      const beats = detectBeats(s.pressure, a, b);
      const hrs = heartRateSeries(beats, a, b);
      if (!hrs || hrs.hr.some((v) => !Number.isFinite(v))) continue;
      const br = resample(trace, a, b, ANALYSIS.hrFs);
      parts.push({ c: coupling(hrs.hr, br, ANALYSIS.hrFs, f0), w: b - a, kept: hrs.kept });
    }
    if (parts.length) {
      const W = parts.reduce((x, p) => x + p.w, 0);
      const wavg = (f: (c: Coupling) => number) => parts.reduce((x, p) => x + f(p.c) * p.w, 0) / W;
      const re = parts.reduce((x, p) => x + p.c._re, 0), im = parts.reduce((x, p) => x + p.c._im, 0), n = parts.reduce((x, p) => x + p.c._n, 0);
      base.coupling = {
        amplitude: wavg((c) => c.amplitude), swing: wavg((c) => c.swing), meanHr: wavg((c) => c.meanHr),
        plv: n ? Math.hypot(re, im) / n : NaN, lagDeg: (Math.atan2(im, re) * 180) / Math.PI, _re: re, _im: im, _n: n,
      };
      base.beatsKept = parts.reduce((x, p) => x + p.kept * p.w, 0) / W;
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// Curve, best pace, certainty
// ---------------------------------------------------------------------------

export type Certainty = 'clear' | 'weak' | 'flat' | 'insufficient';

export interface SweepResult {
  mode: 'coupling' | 'breathing-only';
  points: { bpm: number; score: number | null; amplitude: number | null; plv: number | null; felt?: number; adherence: number; status: StageResult['status']; reason?: string }[];
  bestPace: number | null;
  certainty: Certainty;
  atEdge: boolean;
  /** best-pace swing relative to free-breathing baseline swing */
  vsBaseline: number | null;
  explanation: string;
}

/** z-score with a spread floor, so near-identical values (noise) don't look like differences */
function z(xs: number[], floor: number): number[] {
  const m = mean(xs), s = Math.max(std(xs), floor);
  return xs.map((x) => (x - m) / s);
}

export function summarizeSweep(stages: StageResult[], baseline: StageResult | null): SweepResult {
  const ok = stages.filter((s) => s.status === 'ok');
  const withCoupling = ok.filter((s) => s.coupling && Number.isFinite(s.coupling.amplitude));
  const mode: SweepResult['mode'] = withCoupling.length >= 3 ? 'coupling' : 'breathing-only';

  const scores = new Map<string, number>();
  if (mode === 'coupling') {
    const w = ANALYSIS.weights;
    const wa = w.amplitude, wp = w.plv;
    const za = z(withCoupling.map((s) => s.coupling!.amplitude), 0.5); // bpm
    const zp = z(withCoupling.map((s) => s.coupling!.plv), 0.1);
    withCoupling.forEach((s, i) => scores.set(s.id, (wa * za[i] + wp * zp[i]) / (wa + wp)));
  } else {
    // Plan C: comfortable AND followed. felt (1..5) and adherence (0..1) both scaled to 0..1.
    ok.forEach((s) => scores.set(s.id, 0.5 * (Number.isFinite(s.adherence) ? s.adherence : 0) + 0.5 * (((s.felt ?? 3) - 1) / 4)));
  }

  const points = stages.map((s) => ({
    bpm: s.bpm,
    score: scores.get(s.id) ?? null,
    amplitude: s.coupling ? s.coupling.amplitude : null,
    plv: s.coupling ? s.coupling.plv : null,
    felt: s.felt,
    adherence: s.adherence,
    status: s.status,
    reason: s.reason,
  }));

  const ranked = points.filter((p) => p.score !== null).sort((a, b) => b.score! - a.score!);
  if (ranked.length < 3) {
    return { mode, points, bestPace: null, certainty: 'insufficient', atEdge: false, vsBaseline: null, explanation: 'No clear result today: too few paces gave trustworthy data. Try again rested, still, and in even light.' };
  }
  const top = ranked[0];
  const sortedByPace = points.filter((p) => p.score !== null).sort((a, b) => a.bpm - b.bpm);
  const idx = sortedByPace.findIndex((p) => p.bpm === top.bpm);
  const atEdge = idx === 0 || idx === sortedByPace.length - 1;

  let best = top.bpm;
  if (!atEdge && mode === 'coupling') {
    // quadratic through the peak and its neighbours (on amplitude), clamped to the neighbours
    const [p0, p1, p2] = [sortedByPace[idx - 1], sortedByPace[idx], sortedByPace[idx + 1]];
    const x = [p0.bpm, p1.bpm, p2.bpm], y = [p0.amplitude!, p1.amplitude!, p2.amplitude!];
    const den = (x[0] - x[1]) * (x[0] - x[2]) * (x[1] - x[2]);
    const A = (x[2] * (y[1] - y[0]) + x[1] * (y[0] - y[2]) + x[0] * (y[2] - y[1])) / den;
    const B = (x[2] ** 2 * (y[0] - y[1]) + x[1] ** 2 * (y[2] - y[0]) + x[0] ** 2 * (y[1] - y[2])) / den;
    if (A < 0) best = Math.min(p2.bpm, Math.max(p0.bpm, -B / (2 * A)));
    best = Math.round(best * 4) / 4; // never claim more precision than ±0.25
  }

  let certainty: Certainty;
  if (mode === 'coupling') {
    const others = ranked.slice(1).map((p) => p.amplitude!);
    const ratio = top.amplitude! / Math.max(1e-6, median(others));
    // gap to the runner-up, in bpm of heart-rate swing (physical units, easy to explain)
    const gap = top.amplitude! - Math.max(...others);
    if (ratio >= 1.3 && gap >= 0.75 && (top.plv ?? 0) >= 0.5 && ranked.length >= 4) certainty = 'clear';
    else if (ratio >= 1.1 && gap >= 0.3) certainty = 'weak';
    else certainty = 'flat';
  } else {
    certainty = top.score! - ranked[1].score! >= 0.1 ? 'weak' : 'flat';
  }

  const baseAmp = baseline?.coupling?.amplitude;
  const vsBaseline = mode === 'coupling' && baseAmp && baseAmp > 0 ? top.amplitude! / baseAmp : null;

  const paceTxt = `${best.toFixed(best % 1 === 0 ? 1 : 2).replace(/0$/, '')} breaths a minute`;
  let explanation: string;
  if (certainty === 'flat') {
    explanation = mode === 'coupling'
      ? 'No clear peak today: your heart rhythm followed your breathing about equally at every pace. Any of these paces is a reasonable choice; pick the one that felt easiest.'
      : 'No clear favourite today. Pick the pace that felt easiest.';
  } else if (mode === 'coupling') {
    explanation = `Your heart rhythm and breathing moved together most at about ${paceTxt}` +
      (vsBaseline ? `, with a heart-rate swing ${vsBaseline.toFixed(1)}× your normal breathing.` : '.') +
      (certainty === 'weak' ? ' The peak is weak, so treat this as a starting point.' : '') +
      (atEdge ? ' The best pace was at the edge of the range tested, so your true best may lie just beyond it.' : '');
  } else {
    explanation = `Pulse data was not reliable enough to measure coupling, so this result uses breathing only: ${paceTxt} was the pace you followed best and found comfortable.`;
  }
  return { mode, points, bestPace: best, certainty, atEdge, vsBaseline, explanation };
}

/** Choose the guided-session pace: best pace if certain, else the most comfortable adherent pace. */
export function guidedPace(r: SweepResult): number {
  if (r.bestPace !== null && r.certainty !== 'flat') return r.bestPace;
  const ok = r.points.filter((p) => p.status === 'ok');
  if (!ok.length) return 6.0;
  ok.sort((a, b) => (b.felt ?? 3) - (a.felt ?? 3) || (b.adherence || 0) - (a.adherence || 0));
  return ok[0].bpm;
}

export { inSegments, wrapPi };
