// Shared data shapes. NO Electron or Node imports here: core/ runs in the
// renderer, in Node scripts, and in Vitest.

/** A timed scalar. t = seconds since session start. */
export interface Sample {
  t: number;
  v: number;
}

export interface ConfSample extends Sample {
  conf: number;
  stable: boolean;
}

export interface HrvSample {
  t: number;
  rmssd: number;
  sdnn: number;
  meanNn: number;
  baevsky: number;
  conf: number;
  stable: boolean;
}

/** One SDK `metrics` event, normalized into plain numbers (seconds, no Longs). */
export interface Packet {
  /** packet arrival time, s since session start */
  t: number;
  breathRate?: ConfSample;
  /** chest breathing trace */
  upper: Sample[];
  /** abdomen breathing trace */
  lower: Sample[];
  pulseRate?: ConfSample;
  /** arterial pressure trace: relative, uncalibrated, unitless. NEVER blood pressure. */
  pressure: Sample[];
  pressureConf?: number;
  hrv?: HrvSample;
  talking?: boolean;
  blinking?: boolean;
  /** face motion this packet, as a fraction of face size (0 = still) */
  motion?: number;
  /** face present in this packet */
  face?: boolean;
  /** lip-opening ratio per landmark frame (lip gap / mouth width). Owner test scripts only; the app
   *  never computes it (mouth detector rejected, docs/decisions.md). */
  mouth?: Sample[];
  eda: Sample[];
}

export type StreamEvent =
  | { type: 'packet'; p: Packet }
  | { type: 'validation'; t: number; code: number; hint: string }
  | { type: 'status'; t: number; status: number }
  | { type: 'error'; t: number; code: number; message: string; retryable: boolean }
  /** pacer phase marker written by the app while recording (0..1 cycle phase, bpm) */
  | { type: 'pacer'; t: number; bpm: number; stage: string }
  /** protocol markers (phase changes, felt-ease ratings) so a replay reproduces the session */
  | { type: 'marker'; t: number; kind: 'phase' | 'rating' | 'end'; data: Record<string, any> };

/** A recorded metric stream. Never contains video or frames. */
export interface Recording {
  format: 'paceprint-stream';
  version: 1;
  createdAt: string;
  source: 'camera' | 'simulated';
  note?: string;
  events: StreamEvent[];
}
