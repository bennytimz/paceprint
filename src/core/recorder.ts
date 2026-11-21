// Records the metric stream (never frames) plus protocol markers, and loads recordings back.
import type { Recording, StreamEvent, Sample } from './types';

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Number(x.toPrecision(4));
const rs = (a: Sample[]) => a.map((s) => ({ t: r3(s.t), v: r4(s.v) }));

/**
 * Round numbers so recordings stay small; precision is far beyond what the analysis uses.
 * The lip-opening ratio is dropped unless `keepMouth` is set: the consent text does not yet say that
 * recordings contain it (pending owner approval, NEEDS_OWNER.md).
 */
export function compactEvent(e: StreamEvent, keepMouth = false): StreamEvent {
  if (e.type !== 'packet') return { ...e, t: r3(e.t) } as StreamEvent;
  const { mouth, ...p } = e.p;
  const out = { ...p, t: r3(p.t), upper: rs(p.upper), lower: rs(p.lower), pressure: rs(p.pressure), eda: rs(p.eda), motion: p.motion === undefined ? undefined : r4(p.motion) };
  return { type: 'packet', p: keepMouth && mouth ? { ...out, mouth: rs(mouth) } : out };
}

export class Recorder {
  readonly events: StreamEvent[] = [];
  constructor(readonly source: Recording['source'], private readonly keepMouth = false) {}
  push(e: StreamEvent) { this.events.push(compactEvent(e, this.keepMouth)); }
  toRecording(note?: string): Recording {
    return { format: 'paceprint-stream', version: 1, createdAt: new Date().toISOString(), source: this.source, note, events: this.events };
  }
}

export function parseRecording(text: string): Recording {
  const r = JSON.parse(text);
  if (r?.format !== 'paceprint-stream' || r.version !== 1 || !Array.isArray(r.events)) throw new Error('Not a Paceprint recording');
  return r as Recording;
}
