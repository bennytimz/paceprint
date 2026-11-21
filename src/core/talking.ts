// Sustained-talking rule (burst tolerance) for the SDK talking flag. Candidate: not wired into validity
// until it passes the pre-registered test in docs/decisions.md ("Burst tolerance: rule fixed before test").
//
// Why: each flagged packet currently refuses data for the 2 s talking hold plus the 2 s settle, so short
// false blips a second apart refuse almost everything (talk check 2: 2.2 of 60 s kept). Speech is
// sustained: in every reading part so far the flag was on 96-100 % of the time. So talking is decided on
// how long the flag was on in a recent window, not on any single packet.

export const SUSTAINED = {
  /** look-back window, s */
  windowS: 4,
  /** talking when the flag was on for at least this share of the window (3 of the last 4 s) */
  minFraction: 0.75,
  /** a packet's flag counts until the next packet, but never longer than this (a data gap is not talking) */
  maxHoldS: 0.5,
};

/** Feed it every packet's talking flag in time order; ask whether talking is sustained at time t. */
export class SustainedTalking {
  private q: { t: number; on: boolean }[] = [];

  push(t: number, on: boolean) {
    this.q.push({ t, on });
    // keep one packet older than the window: its flag may still cover the window's start
    while (this.q.length > 1 && t - this.q[1].t > SUSTAINED.windowS) this.q.shift();
  }

  /** seconds the flag was on within (t - windowS, t] */
  onSeconds(t: number): number {
    const a = t - SUSTAINED.windowS;
    let s = 0;
    for (let i = 0; i < this.q.length; i++) {
      const p = this.q[i];
      if (!p.on || p.t > t) continue;
      const until = Math.min(i + 1 < this.q.length ? this.q[i + 1].t : t, p.t + SUSTAINED.maxHoldS, t);
      const from = Math.max(p.t, a);
      if (until > from) s += until - from;
    }
    return s;
  }

  active(t: number): boolean {
    return this.onSeconds(t) >= SUSTAINED.minFraction * SUSTAINED.windowS;
  }
}
