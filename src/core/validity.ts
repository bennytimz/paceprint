// Validity layer: decides, moment by moment, whether data may be used.
// Never trusts SDK confidence alone: talking, motion, framing, flicker and signal loss
// are checked independently. Invalid time is excluded, never averaged in.
import type { StreamEvent, Packet } from './types';
import { validationMessage } from './validation-codes';

export type ReasonId = 'lost' | 'validation' | 'talking' | 'motion' | 'noface' | 'lowconf' | 'flicker' | 'settling';

export interface Reason { id: ReasonId; short: string; tip: string }
export interface Verdict { ok: boolean; reasons: Reason[] }

export const VALIDITY = {
  lostAfter: 2.0,          // s without packets = signal lost
  talkingHold: 2.0,        // s a talking flag keeps data invalid
  motionWindow: 1.5,       // s window for motion
  motionMax: 0.02,         // face centroid shift per packet, fraction of face width
  validationHold: 1.5,     // s a non-OK validation code keeps data invalid
  pulseConfMin: 40,        // SDK "stable" threshold for pulse/pressure
  confGrace: 15,           // s after start before pressure confidence is enforced
  flickerMax: 0.6,         // flicker score (0..1) from the renderer's brightness probe
  settle: 2.0,             // s to stay invalid after a problem clears
};

export class ValidityMonitor {
  private lastPacketT = -Infinity;
  private lastTalkT = -Infinity;
  private motion: { t: number; v: number }[] = [];
  private lastCode = 0;
  private lastCodeT = -Infinity;
  private lastFace: boolean | undefined;
  private lastConf: number | undefined;
  private cardioSeen = false;
  private startT: number | null = null;
  private flicker = 0;
  private lastBadT = -Infinity;
  now = 0;

  ingest(e: StreamEvent) {
    if (e.type === 'packet') this.packet(e.p);
    else if (e.type === 'validation') {
      this.lastCode = e.code;
      if (e.code !== 0) this.lastCodeT = e.t;
    }
  }

  private packet(p: Packet) {
    this.startT ??= p.t;
    this.lastPacketT = p.t;
    this.now = Math.max(this.now, p.t);
    if (p.talking) this.lastTalkT = p.t;
    if (p.motion !== undefined) {
      this.motion.push({ t: p.t, v: p.motion });
      while (this.motion.length && p.t - this.motion[0].t > VALIDITY.motionWindow) this.motion.shift();
    }
    if (p.face !== undefined) this.lastFace = p.face;
    if (p.pressure.length || p.pulseRate) this.cardioSeen = true;
    if (p.pressureConf !== undefined) this.lastConf = p.pressureConf;
  }

  /** brightness-flicker score from the renderer (0 = steady light) */
  setFlicker(score: number) { this.flicker = score; }

  /** whether cardio data has ever arrived (Plan A) */
  get hasCardio() { return this.cardioSeen; }

  check(t: number = this.now): Verdict {
    const reasons: Reason[] = [];
    const add = (id: ReasonId, short: string, tip: string) => reasons.push({ id, short, tip });
    if (t - this.lastPacketT > VALIDITY.lostAfter) {
      add('lost', 'Signal lost', 'No reading from the camera right now. Visuals are frozen until it returns.');
    } else {
      if (this.lastCode !== 0 || t - this.lastCodeT < VALIDITY.validationHold) {
        const code = this.lastCode !== 0 ? this.lastCode : 12;
        const m = validationMessage(code);
        add('validation', m.short, m.tip);
      }
      if (t - this.lastTalkT < VALIDITY.talkingHold) add('talking', 'Talking', 'Stop talking for a moment. Speech moves the chest and hides breathing.');
      if (this.motion.some((m) => m.v > VALIDITY.motionMax)) add('motion', 'Moving', 'Hold still. Rest your arms and lean back.');
      if (this.lastFace === false) add('noface', 'No face', 'Face the camera so your whole face is in view.');
      const grace = this.startT !== null && t - this.startT < VALIDITY.confGrace;
      if (this.cardioSeen && !grace && this.lastConf !== undefined && this.lastConf < VALIDITY.pulseConfMin) {
        add('lowconf', 'Weak pulse signal', 'The pulse reading is weak. More even front light usually helps.');
      }
      if (this.flicker > VALIDITY.flickerMax) add('flicker', 'Flickering light', 'More even light: screens and some bulbs flicker. Try daylight or a steady lamp.');
    }
    // de-duplicate (e.g. validation "Moving" + our own motion check)
    const seen = new Set<string>();
    const uniq = reasons.filter((r) => (seen.has(r.short) ? false : (seen.add(r.short), true)));
    if (uniq.length) {
      this.lastBadT = t;
      return { ok: false, reasons: uniq };
    }
    if (t - this.lastBadT < VALIDITY.settle) {
      return { ok: false, reasons: [{ id: 'settling', short: 'Settling', tip: 'Good. Give it a second to settle.' }] };
    }
    return { ok: true, reasons: [] };
  }
}

/** Warm-up windows: nothing is called trusted before its window has filled with valid data. */
export const WARMUP = [
  { id: 'pulse', label: 'Pulse', seconds: 12 },
  { id: 'breathing', label: 'Breathing', seconds: 30 },
  { id: 'eda', label: 'EDA', seconds: 35 },
  { id: 'hrv', label: 'HRV', seconds: 60 },
] as const;
