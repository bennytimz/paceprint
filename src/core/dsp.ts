// Small, dependency-free signal helpers. Pure functions.
import type { Sample } from './types';

export function mean(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : NaN;
}

export function std(a: ArrayLike<number>): number {
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
  return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : 0;
}

export function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    sab += x * y; saa += x * x; sbb += y * y;
  }
  const d = Math.sqrt(saa * sbb);
  return d > 0 ? sab / d : NaN;
}

/** Linear resample of irregular samples onto a uniform grid [t0, t1) at fs Hz. */
export function resample(samples: Sample[], t0: number, t1: number, fs: number): Float64Array {
  const n = Math.max(0, Math.floor((t1 - t0) * fs));
  const out = new Float64Array(n);
  if (!samples.length) return out.fill(NaN);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fs;
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j], b = samples[Math.min(j + 1, samples.length - 1)];
    if (t <= a.t) out[i] = a.v;
    else if (t >= b.t) out[i] = b.v;
    else out[i] = a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
  }
  return out;
}

/** Remove least-squares line. */
export function detrend(x: ArrayLike<number>): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  if (n < 2) return out;
  let st = 0, sx = 0, stt = 0, stx = 0;
  for (let i = 0; i < n; i++) { st += i; sx += x[i]; stt += i * i; stx += i * x[i]; }
  const slope = (n * stx - st * sx) / (n * stt - st * st || 1);
  const icpt = (sx - slope * st) / n;
  for (let i = 0; i < n; i++) out[i] = x[i] - (icpt + slope * i);
  return out;
}

/** Radix-2 in-place complex FFT. re/im length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const nextPow2 = (n: number) => 1 << Math.ceil(Math.log2(Math.max(2, n)));

/**
 * FFT band-pass + analytic signal in one go (zero-phase, so no lag is introduced).
 * Returns the band-limited real signal and its instantaneous phase.
 */
export function bandAnalytic(x: ArrayLike<number>, fs: number, lo: number, hi: number): { real: Float64Array; phase: Float64Array; amp: Float64Array } {
  const n = x.length;
  const N = nextPow2(n * 2);
  const re = new Float64Array(N), im = new Float64Array(N);
  const d = detrend(x);
  // Hann taper on the edges only (10%) to limit ringing.
  const edge = Math.floor(n * 0.1);
  for (let i = 0; i < n; i++) {
    let w = 1;
    if (i < edge) w = 0.5 - 0.5 * Math.cos((Math.PI * i) / edge);
    else if (i >= n - edge) w = 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - i)) / edge);
    re[i] = d[i] * w;
  }
  fft(re, im);
  for (let k = 0; k < N; k++) {
    const f = (k * fs) / N;
    const pos = k > 0 && k < N / 2;
    const inBand = f >= lo && f <= hi;
    // analytic: keep positive band ×2, zero negative frequencies and DC
    const g = pos && inBand ? 2 : 0;
    re[k] *= g; im[k] *= g;
  }
  fft(re, im, true);
  const real = new Float64Array(n), phase = new Float64Array(n), amp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    real[i] = re[i];
    phase[i] = Math.atan2(im[i], re[i]);
    amp[i] = Math.hypot(re[i], im[i]);
  }
  return { real, phase, amp };
}

/** Zero-phase FFT band-pass (real output). */
export function bandpass(x: ArrayLike<number>, fs: number, lo: number, hi: number): Float64Array {
  return bandAnalytic(x, fs, lo, hi).real;
}

/** Amplitude of the sinusoid at frequency f (single-bin DFT, Goertzel-equivalent) on a detrended series. */
export function toneAmplitude(x: ArrayLike<number>, fs: number, f: number): number {
  const d = detrend(x);
  let c = 0, s = 0;
  for (let i = 0; i < d.length; i++) {
    const a = (2 * Math.PI * f * i) / fs;
    c += d[i] * Math.cos(a);
    s += d[i] * Math.sin(a);
  }
  return d.length ? (2 * Math.hypot(c, s)) / d.length : NaN;
}

/** Local maxima with a minimum spacing (samples) and minimum height. */
export function findPeaks(x: ArrayLike<number>, minDist: number, minHeight: number): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] < minHeight || x[i] < x[i - 1] || x[i] < x[i + 1]) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < minDist) {
      if (x[i] > x[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  return peaks;
}

export function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Deterministic PRNG (mulberry32) for the simulator and tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(r: () => number): number {
  const u = Math.max(r(), 1e-12), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
