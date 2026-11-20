// Records the metric stream (never frames) plus protocol markers, and loads recordings back.
import type { Recording, StreamEvent, Sample } from './types';

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Number(x.toPrecision(4));
const rs = (a: Sample[]) => a.map((s) => ({ t: r3(s.t), v: r4(s.v) }));

/** Round numbers so recordings stay small; precision is far beyond what the analysis uses. */
export function compactEvent(e: StreamEvent): StreamEvent {
  if (e.type !== 'packet') return { ...e, t: r3(e.t) } as StreamEvent;
  const p = e.p;
  return { type: 'packet', p: { ...p, t: r3(p.t), upper: rs(p.upper), lower: rs(p.lower), pressure: rs(p.pressure), eda: rs(p.eda), motion: p.motion === undefined ? undefined : r4(p.motion) } };
}

export class Recorder {
  readonly events: StreamEvent[] = [];
  constructor(readonly source: Recording['source']) {}
  push(e: StreamEvent) { this.events.push(compactEvent(e)); }
  toRecording(note?: string): Recording {
    return { format: 'paceprint-stream', version: 1, createdAt: new Date().toISOString(), source: this.source, note, events: this.events };
  }
}

export function parseRecording(text: string): Recording {
  const r = JSON.parse(text);
  if (r?.format !== 'paceprint-stream' || r.version !== 1 || !Array.isArray(r.events)) throw new Error('Not a Paceprint recording');
  return r as Recording;
}
