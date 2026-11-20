// Pacer engine. Phase accumulates so pace changes never jump the guide.
// phase in [0,1): 0 = start of inhale. Inhale takes INHALE_FRACTION of the cycle.

export const INHALE_FRACTION = 0.4; // gentle, slightly longer exhale

export class Pacer {
  private phase = 0;
  private lastT: number | null = null;
  constructor(public bpm: number) {}

  setBpm(bpm: number) { this.bpm = bpm; }

  /** advance to time t (s); returns phase */
  tick(t: number): number {
    if (this.lastT !== null && this.bpm > 0) {
      const dt = Math.max(0, t - this.lastT);
      this.phase = (this.phase + (dt * this.bpm) / 60) % 1;
    }
    this.lastT = t;
    return this.phase;
  }

  get current(): number { return this.phase; }

  /** 0 (empty) .. 1 (full) lung target for the visual guide */
  static fill(phase: number): number {
    if (phase < INHALE_FRACTION) return 0.5 - 0.5 * Math.cos((Math.PI * phase) / INHALE_FRACTION);
    return 0.5 + 0.5 * Math.cos((Math.PI * (phase - INHALE_FRACTION)) / (1 - INHALE_FRACTION));
  }

  static label(phase: number): 'Breathe in' | 'Breathe out' {
    return phase < INHALE_FRACTION ? 'Breathe in' : 'Breathe out';
  }
}
