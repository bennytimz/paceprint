// Session state machine. Runs on stream time (seconds), so it works identically live,
// in replay, and headless in tests. In 'live' mode it decides transitions itself and emits
// markers; in 'follow' mode (replay) it applies recorded markers instead.
import type { StreamEvent, Sample } from './types';
import { Pacer } from './pacer';
import { ValidityMonitor, Verdict, WARMUP } from './validity';
import { analyzeStage, summarizeSweep, guidedPace, StageInput, StageResult, SweepResult, Segment, adherence } from './analysis';

export interface ProtocolConfig {
  baselineS: number;
  settleS: number;
  measureS: number;
  /** extra wall time allowed per measure window to make up for refused (invalid) time */
  maxExtraS: number;
  paces: number[];
  guidedS: number;
  randomizeOrder: boolean;
}

export const DEFAULT_CONFIG: ProtocolConfig = {
  baselineS: 60,
  settleS: 30,
  measureS: 90,
  maxExtraS: 45,
  paces: [7.0, 6.5, 6.0, 5.5, 5.0],
  guidedS: 300,
  randomizeOrder: false,
};

export type PhaseName = 'setup' | 'baseline' | 'settle' | 'measure' | 'rate' | 'result' | 'guided' | 'done';

export interface PhaseState {
  name: PhaseName;
  start: number;
  stage: number;     // index into order (sweep phases)
  bpm: number;       // current pacer pace (0 = free breathing)
}

interface StageBuf {
  valid: Segment[]; start: number; measureStart: number; end: number; felt?: number; openSince: number | null;
  /** trusted time from settle start to measure end, for time to lock only */
  lockValid: Segment[]; lockOpen: number | null;
}

export type MarkerFn = (e: Extract<StreamEvent, { type: 'marker' }>) => void;

export class Protocol {
  readonly cfg: ProtocolConfig;
  readonly validity = new ValidityMonitor();
  readonly order: number[];
  phase: PhaseState = { name: 'setup', start: 0, stage: -1, bpm: 0 };
  verdict: Verdict = { ok: false, reasons: [], warnings: [] };
  now = 0;
  result: SweepResult | null = null;
  stageResults: StageResult[] = [];
  baselineResult: StageResult | null = null;
  hasCardio = false;

  // full-session buffers (stage data is sliced by time)
  readonly upper: Sample[] = [];
  readonly lower: Sample[] = [];
  readonly pressure: Sample[] = [];
  readonly pacerFill: Sample[] = [];
  readonly pulseRate: Sample[] = [];
  /** SDK talking flag per packet (1/0): audit only */
  readonly talk: Sample[] = [];
  firstPacketT: number | null = null;
  lastPacketT = -Infinity;
  /** time each warm-up window has been filling with valid data */
  private validRunStart: number | null = null;

  private stages: StageBuf[] = [];
  private baseline: StageBuf | null = null;
  private guided = { valid: [] as Segment[], openSince: null as number | null };
  private lastPacerSample = -1;

  constructor(cfg: Partial<ProtocolConfig> = {}, readonly mode: 'live' | 'follow' = 'live', private onMarker?: MarkerFn, seed = Date.now()) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.order = [...this.cfg.paces];
    if (this.cfg.randomizeOrder) {
      let s = seed >>> 0;
      for (let i = this.order.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const j = s % (i + 1);
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }
  }

  // ---------------------------------------------------------------- input

  ingest(e: StreamEvent) {
    this.validity.ingest(e);
    if (e.type === 'packet') {
      const p = e.p;
      this.firstPacketT ??= p.t;
      this.lastPacketT = p.t;
      for (const s of p.upper) this.upper.push(s);
      for (const s of p.lower) this.lower.push(s);
      for (const s of p.pressure) this.pressure.push(s);
      if (p.pulseRate) this.pulseRate.push({ t: p.pulseRate.t, v: p.pulseRate.v });
      if (p.talking !== undefined) this.talk.push({ t: p.t, v: p.talking ? 1 : 0 });
      if (p.pressure.length) this.hasCardio = true;
    } else if (e.type === 'marker' && this.mode === 'follow') {
      this.applyMarker(e);
    }
  }

  private applyMarker(e: Extract<StreamEvent, { type: 'marker' }>) {
    this.advanceClock(e.t);
    if (e.kind === 'phase') this.enter(e.data.name as PhaseName, e.t, e.data.stage ?? -1, e.data.bpm ?? 0, true);
    else if (e.kind === 'rating') this.applyRating(e.data.value, e.t, true);
  }

  // ---------------------------------------------------------------- control (UI)

  /** Setup checklist is green and the person pressed Start. */
  beginBaseline() {
    if (this.mode === 'live' && this.phase.name === 'setup') this.enter('baseline', this.now, -1, 0);
  }

  /** Felt-ease rating 1..5 after a stage. */
  rate(value: number) {
    if (this.mode === 'live' && this.phase.name === 'rate') this.applyRating(value, this.now);
  }

  startGuided() {
    if (this.mode === 'live' && this.phase.name === 'result') this.enter('guided', this.now, -1, this.result ? guidedPace(this.result) : 6);
  }

  finishGuided() {
    if (this.mode === 'live' && this.phase.name === 'guided') this.enter('done', this.now, -1, 0);
  }

  // ---------------------------------------------------------------- clock

  tick(t: number) {
    if (t < this.now) return;
    this.advanceClock(t);
    if (this.mode === 'live') this.autoTransitions();
  }

  private advanceClock(t: number) {
    const dtStart = this.now;
    this.now = t;
    this.verdict = this.validity.check(t);
    const ok = this.verdict.ok;
    // pacer fill samples at 10 Hz for adherence
    if (this.phase.bpm > 0 && t - this.lastPacerSample >= 0.1) {
      this.pacerFill.push({ t, v: Pacer.fill(this.pacerPhase) });
      this.lastPacerSample = t;
    }
    // warm-up: continuous valid run
    if (ok) this.validRunStart ??= t; else this.validRunStart = null;
    // valid-segment bookkeeping for windows that collect data
    const buf = this.activeBuf();
    if (buf) {
      if (ok && buf.openSince === null) buf.openSince = Math.max(dtStart, this.windowStart());
      if (!ok && buf.openSince !== null) { buf.valid.push([buf.openSince, t]); buf.openSince = null; }
    }
    // trusted time across settle and measure, so time to lock never reads a refused stretch
    const st = this.phase.name === 'settle' || this.phase.name === 'measure' ? this.stages[this.phase.stage] : null;
    if (st) {
      if (ok && st.lockOpen === null) st.lockOpen = Math.max(dtStart, st.start);
      if (!ok && st.lockOpen !== null) { st.lockValid.push([st.lockOpen, t]); st.lockOpen = null; }
    }
  }

  private windowStart(): number {
    const p = this.phase;
    if (p.name === 'measure') return this.stages[p.stage].measureStart;
    return p.start;
  }

  private activeBuf(): { valid: Segment[]; openSince: number | null } | null {
    const p = this.phase;
    if (p.name === 'baseline') return this.baseline;
    if (p.name === 'measure') return this.stages[p.stage];
    if (p.name === 'guided') return this.guided;
    return null;
  }

  private closeBuf(t: number) {
    const b = this.activeBuf();
    if (b && b.openSince !== null) { b.valid.push([b.openSince, t]); b.openSince = null; }
  }

  /** valid seconds collected in the current window */
  validSeconds(): number {
    const b = this.activeBuf();
    if (!b) return 0;
    return b.valid.reduce((s, [a, c]) => s + c - a, 0) + (b.openSince !== null ? this.now - b.openSince : 0);
  }

  private autoTransitions() {
    const p = this.phase, t = this.now, c = this.cfg;
    const elapsed = t - p.start;
    if (p.name === 'baseline') {
      if (this.validSeconds() >= c.baselineS || elapsed >= c.baselineS + c.maxExtraS) this.enter('settle', t, 0, this.order[0]);
    } else if (p.name === 'settle') {
      if (elapsed >= c.settleS) this.enter('measure', t, p.stage, p.bpm);
    } else if (p.name === 'measure') {
      if (this.validSeconds() >= c.measureS || elapsed >= c.measureS + c.maxExtraS) this.enter('rate', t, p.stage, 0);
    } else if (p.name === 'guided') {
      if (elapsed >= c.guidedS) this.enter('done', t, -1, 0);
    }
  }

  private applyRating(value: number, t: number, fromMarker = false) {
    const p = this.phase;
    if (p.name !== 'rate') return;
    this.stages[p.stage].felt = value;
    if (!fromMarker) this.onMarker?.({ type: 'marker', t, kind: 'rating', data: { stage: p.stage, value } });
    const next = p.stage + 1;
    if (this.mode === 'live') {
      if (next < this.order.length) this.enter('settle', t, next, this.order[next]);
      else this.enter('result', t, -1, 0);
    }
  }

  private enter(name: PhaseName, t: number, stage: number, bpm: number, fromMarker = false) {
    this.closeBuf(t);
    const prev = this.phase;
    if (prev.name === 'baseline' && this.baseline) this.baseline.end = t;
    if (prev.name === 'measure') {
      const st = this.stages[prev.stage];
      st.end = t;
      if (st.lockOpen !== null) { st.lockValid.push([st.lockOpen, t]); st.lockOpen = null; }
    }
    this.phase = { name, start: t, stage, bpm };
    if (name === 'baseline') this.baseline = { valid: [], start: t, measureStart: t, end: t, openSince: null, lockValid: [], lockOpen: null };
    if (name === 'settle') this.stages[stage] = { valid: [], start: t, measureStart: t + this.cfg.settleS, end: t, openSince: null, lockValid: [], lockOpen: null };
    if (name === 'measure' && this.stages[stage]) this.stages[stage].measureStart = t;
    if (name === 'result') this.computeResult();
    if (!fromMarker) this.onMarker?.({ type: 'marker', t, kind: 'phase', data: { name, stage, bpm } });
  }

  // ---------------------------------------------------------------- analysis

  private slice(arr: Sample[], a: number, b: number): Sample[] {
    return arr.filter((s) => s.t >= a - 1 && s.t < b + 1);
  }

  stageInput(i: number): StageInput | null {
    const s = this.stages[i];
    if (!s) return null;
    return {
      id: `pace-${this.order[i]}`, bpm: this.order[i], start: s.start, measureStart: s.measureStart, end: s.end,
      valid: s.valid, felt: s.felt,
      upper: this.slice(this.upper, s.start, s.end), lower: this.slice(this.lower, s.start, s.end),
      pressure: this.slice(this.pressure, s.measureStart, s.end), pacer: this.slice(this.pacerFill, s.start, s.end),
      talk: this.slice(this.talk, s.measureStart, s.end),
      lockValid: s.lockOpen !== null ? [...s.lockValid, [s.lockOpen, Math.max(s.lockOpen, this.now)]] : s.lockValid,
    };
  }

  computeResult() {
    const b = this.baseline;
    this.baselineResult = b ? analyzeStage({
      id: 'baseline', bpm: 0, start: b.start, measureStart: b.start, end: b.end, valid: b.valid,
      upper: this.slice(this.upper, b.start, b.end), lower: this.slice(this.lower, b.start, b.end),
      pressure: this.slice(this.pressure, b.start, b.end), pacer: [], talk: this.slice(this.talk, b.start, b.end),
    }, this.hasCardio) : null;
    this.stageResults = this.order.map((_, i) => {
      const inp = this.stageInput(i);
      return inp ? analyzeStage(inp, this.hasCardio) : { id: `pace-${this.order[i]}`, bpm: this.order[i], validSeconds: 0, adherence: NaN, lockTime: NaN, coupling: null, beatsKept: 0, status: 'excluded' as const, reason: 'Not measured.', blocks: [] };
    });
    this.result = summarizeSweep(this.stageResults, this.baselineResult);
  }

  // ---------------------------------------------------------------- live readouts for the UI

  get pacerPhase(): number {
    const p = this.phase;
    if (p.bpm <= 0) return 0;
    const start = p.name === 'measure' && this.stages[p.stage] ? this.stages[p.stage].start : p.start;
    return (((this.now - start) * p.bpm) / 60) % 1;
  }

  /** follow score over the last 20 s (0..1), NaN when not pacing */
  liveFollow(): number {
    const p = this.phase;
    if (p.bpm <= 0) return NaN;
    const a = Math.max(p.name === 'measure' ? this.stages[p.stage].start : p.start, this.now - 20);
    if (this.now - a < 10) return NaN;
    const trace = this.lower.length ? this.lower : this.upper;
    return adherence(this.slice(trace, a, this.now), this.slice(this.pacerFill, a, this.now), a, this.now, p.bpm);
  }

  /** warm-up progress per window, 0..1 (valid continuous seconds / window length) */
  warmup(): { id: string; label: string; seconds: number; progress: number }[] {
    const run = this.validRunStart === null ? 0 : this.now - this.validRunStart;
    return WARMUP.map((w) => ({ ...w, progress: Math.min(1, run / w.seconds) }));
  }

  /** remaining seconds in the current timed phase, counting only valid time where relevant */
  remaining(): number {
    const p = this.phase, c = this.cfg, el = this.now - p.start;
    if (p.name === 'baseline') return Math.max(0, c.baselineS - this.validSeconds());
    if (p.name === 'settle') return Math.max(0, c.settleS - el);
    if (p.name === 'measure') return Math.max(0, c.measureS - this.validSeconds());
    if (p.name === 'guided') return Math.max(0, c.guidedS - el);
    return 0;
  }

  /** true when the current window is paused because data is being refused */
  get refusing(): boolean {
    const n = this.phase.name;
    return (n === 'baseline' || n === 'measure' || n === 'guided') && !this.verdict.ok;
  }

  guidedValidSeconds(): number {
    return this.guided.valid.reduce((s, [a, b]) => s + b - a, 0);
  }
}
