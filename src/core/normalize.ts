// Turns a decoded SmartSpectra `Metrics` protobuf object into a Packet.
// Stateful: keeps the session time origin and the previous face position.
import type { Packet, Sample, ConfSample } from './types';

type AnyObj = Record<string, any>;

/** protobuf int64 may arrive as number, Long-like {low,high}, or string. */
export function toNum(x: unknown): number {
  if (typeof x === 'number') return x;
  if (typeof x === 'string') return Number(x);
  if (x && typeof x === 'object') {
    const o = x as AnyObj;
    if (typeof o.toNumber === 'function') return o.toNumber();
    if ('low' in o && 'high' in o) return (o.high >>> 0) * 4294967296 + (o.low >>> 0);
  }
  return NaN;
}

export class Normalizer {
  private t0Us: number | null = null;
  private prevCentroid: { x: number; y: number } | null = null;

  /** seconds since the first timestamp seen */
  sec(tsUs: unknown): number {
    const us = toNum(tsUs);
    if (!Number.isFinite(us)) return NaN;
    if (this.t0Us === null) this.t0Us = us;
    return (us - this.t0Us) / 1e6;
  }

  private samples(arr: AnyObj[] | undefined): Sample[] {
    if (!arr) return [];
    const out: Sample[] = [];
    for (const m of arr) {
      const t = this.sec(m.timestamp);
      if (Number.isFinite(t) && Number.isFinite(m.value)) out.push({ t, v: m.value });
    }
    return out;
  }

  private lastConf(arr: AnyObj[] | undefined): ConfSample | undefined {
    const m = arr?.at(-1);
    if (!m || !Number.isFinite(m.value)) return undefined;
    return { t: this.sec(m.timestamp), v: m.value, conf: m.confidence ?? 0, stable: !!m.stable };
  }

  /** packetTsUs: the timestamp passed with the `metrics` event */
  packet(m: AnyObj, packetTsUs: unknown): Packet {
    const t = this.sec(packetTsUs);
    const cardio = m.cardio ?? {};
    const br = m.breathing ?? {};
    const face = m.face ?? {};
    const p: Packet = {
      t,
      upper: this.samples(br.upperTrace),
      lower: this.samples(br.lowerTrace),
      pressure: this.samples(cardio.arterialPressureTrace),
      eda: this.samples(m.eda?.trace),
    };
    p.breathRate = this.lastConf(br.rate);
    p.pulseRate = this.lastConf(cardio.pulseRate);
    const apLast = cardio.arterialPressureTrace?.at(-1);
    if (apLast) p.pressureConf = apLast.confidence ?? 0;
    const h = cardio.hrv?.at(-1);
    if (h) {
      p.hrv = {
        t: this.sec(h.timestamp), rmssd: h.rmssd, sdnn: h.sdnn, meanNn: h.meanNn,
        baevsky: h.baevsky, conf: h.confidence ?? 0, stable: !!h.stable,
      };
    }
    if (face.talking?.length) p.talking = face.talking.some((d: AnyObj) => d.detected);
    if (face.blinking?.length) p.blinking = face.blinking.some((d: AnyObj) => d.detected);
    const lm = face.landmarks?.at(-1)?.value as { x: number; y: number }[] | undefined;
    if (lm && lm.length > 10) {
      p.face = true;
      p.motion = this.motionOf(lm);
    } else if (face.landmarks) {
      p.face = false;
    }
    return p;
  }

  /** centroid shift since last packet, as a fraction of face width */
  private motionOf(lm: { x: number; y: number }[]): number {
    let sx = 0, sy = 0, minX = Infinity, maxX = -Infinity;
    for (const q of lm) {
      sx += q.x; sy += q.y;
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
    }
    const c = { x: sx / lm.length, y: sy / lm.length };
    const width = Math.max(maxX - minX, 1e-6);
    const prev = this.prevCentroid;
    this.prevCentroid = c;
    if (!prev) return 0;
    return Math.hypot(c.x - prev.x, c.y - prev.y) / width;
  }
}
