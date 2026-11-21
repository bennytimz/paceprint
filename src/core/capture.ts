// Capture adapter: every source emits the same StreamEvent stream.
//   camera     -> src/renderer/camera-source.ts (wraps the SDK; needs Electron + key)
//   replay     -> ReplaySource (a recorded metric stream; no SDK, no key, no credits)
//   simulated  -> SimulatedSource (a modelled person; used to build fixtures and tests)
import type { StreamEvent, Packet, Sample, Recording } from './types';
import { Pacer, INHALE_FRACTION } from './pacer';
import { rng, gaussian } from './dsp';

export type Listener = (e: StreamEvent) => void;

export interface CaptureSource {
  readonly kind: 'camera' | 'replay' | 'simulated';
  start(listener: Listener): Promise<void>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Simulated person
// ---------------------------------------------------------------------------

export interface SimEpisode { from: number; to: number; kind: 'talking' | 'motion' | 'lost' | 'dark' }

export interface SimOptions {
  seed?: number;
  /** pace (breaths/min) at which heart-rhythm swing is largest */
  bestPace?: number;
  restingHr?: number;
  /** extra heart-rate swing (bpm, peak-to-peak/2) at the best pace */
  peakSwing?: number;
  freeBpm?: number;
  /** how strongly breathing is pulled toward the pacer (Hz) */
  follow?: number;
  episodes?: SimEpisode[];
  /** emit one packet every this many seconds (real SDK ≈ 0.036 s; fixtures use 0.5 s) */
  packetEvery?: number;
  /** simulate a key without cardio metrics (no pulse, no pressure waveform) */
  noCardio?: boolean;
  /** seconds before pulse and the pressure waveform start (the real SDK took 36 s; default 0) */
  cardioDelayS?: number;
  /** beat-to-beat heart-rate noise, bpm SD (default 0.6) */
  hrNoise?: number;
  /** slow random drift of the breathing-linked swing, as a fraction (0 = none; ~20 s correlation) */
  swingJitter?: number;
}

/**
 * A modelled person. Breathing is an oscillator pulled toward the pacer, so it takes a few
 * seconds to lock (realistic time-to-lock). Heart rate swings with breathing; the swing is
 * largest near `bestPace`. Beats drive a synthetic pressure waveform sampled at 30 Hz.
 */
export class PersonModel {
  readonly o: Required<SimOptions>;
  private r: () => number;
  private breathPhase = 0;
  private beatAcc = 0;
  private beats: number[] = [];
  private hrHist: { t: number; v: number }[] = [];
  private brHist: { t: number; v: number }[] = [];
  /** unwrapped breath phase and completed-cycle count (wobbles across the boundary are not new breaths) */
  private phaseTotal = 0;
  private cycles = 0;
  private lastBreathT = 0;
  private drift = 0;
  t = 0;

  constructor(opts: SimOptions = {}) {
    this.o = {
      seed: 7, bestPace: 5.5, restingHr: 68, peakSwing: 5.5, freeBpm: 13, follow: 0.12,
      episodes: [], packetEvery: 0.5, noCardio: false, cardioDelayS: 0, hrNoise: 0.6, swingJitter: 0, ...opts,
    };
    this.r = rng(this.o.seed);
  }

  episode(t: number): SimEpisode['kind'] | null {
    for (const e of this.o.episodes) if (t >= e.from && t < e.to) return e.kind;
    return null;
  }

  /** advance dt seconds; pacer = target pace (0 = free breathing) and its phase */
  step(dt: number, pacerBpm: number, pacerPhase: number) {
    const o = this.o;
    const own = (o.freeBpm + 0.6 * Math.sin(this.t / 23)) / 60;
    let dphi = own;
    if (pacerBpm > 0) {
      const target = pacerBpm / 60;
      const pull = o.follow * Math.sin(2 * Math.PI * (pacerPhase - this.breathPhase - 0.03));
      dphi = target + pull;
    }
    this.breathPhase = (this.breathPhase + dphi * dt + 1) % 1;
    this.phaseTotal += dphi * dt;
    if (Math.floor(this.phaseTotal) > this.cycles) {
      this.cycles = Math.floor(this.phaseTotal);
      // a breath completed
      this.brHist.push({ t: this.t, v: 60 / Math.max(0.5, this.t - this.lastBreathT) });
      this.lastBreathT = this.t;
    }
    // heart rate: swing with breathing; larger when slow paced breathing is near bestPace
    const pace = pacerBpm > 0 ? pacerBpm : o.freeBpm;
    // AR(1) drift (only drawn when enabled, so default sessions stay bit-identical for a given seed)
    if (o.swingJitter > 0) this.drift = this.drift * Math.exp(-dt / 20) + Math.sqrt(1 - Math.exp(-2 * dt / 20)) * gaussian(this.r);
    const swing = Math.max(0, (1.6 + o.peakSwing * Math.exp(-((pace - o.bestPace) ** 2) / (2 * 0.6 ** 2)) * (pacerBpm > 0 ? 1 : 0)) * (1 + o.swingJitter * this.drift));
    const hr = o.restingHr + 2 * Math.sin(this.t / 41) + swing * Math.sin(2 * Math.PI * (this.breathPhase - 0.05)) + o.hrNoise * gaussian(this.r);
    this.hrHist.push({ t: this.t, v: hr });
    this.beatAcc += (hr / 60) * dt;
    if (this.beatAcc >= 1) { this.beatAcc -= 1; this.beats.push(this.t); }
    this.t += dt;
  }

  /** chest/abdomen lung fill (arbitrary units) */
  breathing(): { upper: number; lower: number } {
    const ph = this.breathPhase;
    const fill = ph < INHALE_FRACTION
      ? 0.5 - 0.5 * Math.cos((Math.PI * ph) / INHALE_FRACTION)
      : 0.5 + 0.5 * Math.cos((Math.PI * (ph - INHALE_FRACTION)) / (1 - INHALE_FRACTION));
    return { upper: 0.6 * fill + 0.03 * gaussian(this.r), lower: 1.0 * fill + 0.03 * gaussian(this.r) };
  }

  /** pressure waveform value at the current time, built from recent beats */
  pressure(): number {
    let v = 0;
    for (let i = this.beats.length - 1; i >= 0 && i >= this.beats.length - 4; i--) {
      const d = this.t - this.beats[i];
      if (d < 0 || d > 1.2) continue;
      v += Math.exp(-((d - 0.12) ** 2) / (2 * 0.05 ** 2)) + 0.35 * Math.exp(-((d - 0.38) ** 2) / (2 * 0.07 ** 2));
    }
    return v + 0.04 * gaussian(this.r) + 0.08 * Math.sin(2 * Math.PI * this.breathPhase);
  }

  avg(hist: { t: number; v: number }[], window: number): number {
    let s = 0, n = 0;
    for (let i = hist.length - 1; i >= 0 && this.t - hist[i].t <= window; i--) { s += hist[i].v; n++; }
    return n ? s / n : NaN;
  }

  pulseAvg() { return this.avg(this.hrHist, 12); }
  breathAvg() { return this.avg(this.brHist, 30); }
  rand() { return this.r(); }
}

/**
 * Generates StreamEvents from a PersonModel. Synchronous `advanceTo` so the same code drives
 * real-time playback (SimulatedSource) and offline fixture generation.
 */
export class SimulatedStream {
  readonly person: PersonModel;
  private nextPacket = 0;
  private buf = { upper: [] as Sample[], lower: [] as Sample[], pressure: [] as Sample[] };
  private lastValidation = -1;
  private validationSentAt = -10;

  constructor(opts: SimOptions = {}, private pacer: () => { bpm: number; phase: number }) {
    this.person = new PersonModel(opts);
  }

  advanceTo(t: number, emit: Listener) {
    const p = this.person;
    const dt = 1 / 30;
    while (p.t + dt <= t) {
      const pc = this.pacer();
      p.step(dt, pc.bpm, pc.phase);
      const ep = p.episode(p.t);
      if (ep === 'lost') continue; // nothing arrives
      const b = p.breathing();
      const moving = ep === 'motion';
      const jitter = moving ? 0.6 * Math.sin(p.t * 3.1) + 0.3 * gaussian(() => p.rand()) : 0;
      const talk = ep === 'talking' ? 0.25 * Math.sin(p.t * 9) : 0;
      this.buf.upper.push({ t: p.t, v: b.upper + jitter + talk });
      this.buf.lower.push({ t: p.t, v: b.lower + jitter + talk });
      if (!p.o.noCardio && p.t >= p.o.cardioDelayS) this.buf.pressure.push({ t: p.t, v: p.pressure() + (moving ? 1.5 * jitter : 0) });

      if (p.t >= this.nextPacket) {
        this.nextPacket = p.t + p.o.packetEvery;
        this.flush(emit, ep);
      }
    }
  }

  private flush(emit: Listener, ep: SimEpisode['kind'] | null) {
    const p = this.person;
    const t = p.t;
    const conf = ep === 'motion' ? 18 : ep === 'talking' ? 30 : ep === 'dark' ? 25 : 72;
    const pulse = p.pulseAvg();
    const br = p.breathAvg();
    const packet: Packet = {
      t,
      upper: this.buf.upper, lower: this.buf.lower, pressure: this.buf.pressure,
      pressureConf: t > 12 ? conf : 10,
      eda: [],
      talking: ep === 'talking',
      blinking: p.rand() < 0.05,
      face: true,
      motion: ep === 'motion' ? 0.04 + 0.03 * p.rand() : 0.002 * p.rand(),
    };
    if (p.o.noCardio) { packet.pressureConf = undefined; }
    else if (t > Math.max(12, p.o.cardioDelayS) && Number.isFinite(pulse)) packet.pulseRate = { t, v: pulse, conf, stable: conf >= 40 };
    if (t > 30 && Number.isFinite(br)) packet.breathRate = { t, v: br, conf: ep ? 35 : 70, stable: !ep };
    if (t > 60 && !p.o.noCardio) packet.hrv = { t, rmssd: 38 + 4 * Math.sin(t / 50), sdnn: 52, meanNn: 60000 / pulse, baevsky: 90, conf: ep ? 30 : 65, stable: !ep };
    if (t > 36) packet.eda = [{ t, v: 0.5 + 0.1 * Math.sin(t / 20) }];
    this.buf = { upper: [], lower: [], pressure: [] };
    emit({ type: 'packet', p: packet });

    const code = ep === 'motion' ? 12 : ep === 'dark' ? 5 : 0;
    if (code !== this.lastValidation || t - this.validationSentAt > 5) {
      this.lastValidation = code;
      this.validationSentAt = t;
      emit({ type: 'validation', t, code, hint: '' });
    }
  }
}

/** Real-time simulated source (for development without a camera). */
export class SimulatedSource implements CaptureSource {
  readonly kind = 'simulated' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private opts: SimOptions, private pacer: () => { bpm: number; phase: number }, private speed = 1) {}
  async start(listener: Listener) {
    const stream = new SimulatedStream(this.opts, this.pacer);
    const t0 = Date.now();
    listener({ type: 'status', t: 0, status: 3 });
    this.timer = setInterval(() => stream.advanceTo(((Date.now() - t0) / 1000) * this.speed, listener), 50);
  }
  async stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/** Event time for any StreamEvent. */
export function eventTime(e: StreamEvent): number {
  return e.type === 'packet' ? e.p.t : e.t;
}

/** Plays a Recording back in (scaled) real time. Emits every event type, including pacer/stage markers. */
export class ReplaySource implements CaptureSource {
  readonly kind = 'replay' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private i = 0;
  private t = 0;
  speed: number;
  onEnd?: () => void;

  constructor(private rec: Recording, speed = 1) { this.speed = speed; }

  get duration(): number {
    const last = this.rec.events.at(-1);
    return last ? eventTime(last) : 0;
  }
  get time(): number { return this.t; }

  async start(listener: Listener) {
    let wall = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      this.t += ((now - wall) / 1000) * this.speed;
      wall = now;
      const ev = this.rec.events;
      while (this.i < ev.length && eventTime(ev[this.i]) <= this.t) listener(ev[this.i++]);
      if (this.i >= ev.length) { this.stop(); this.onEnd?.(); }
    }, 40);
  }
  async stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

export { Pacer };
