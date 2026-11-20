// Runs a whole session headlessly: simulated person + live-mode protocol + recorder.
// Used by tests and by scripts/make-fixture.ts. Deterministic for a given seed.
import { SimulatedStream, SimOptions } from './capture';
import { Protocol, ProtocolConfig } from './protocol';
import type { Recording, StreamEvent } from './types';

export interface SimSessionOptions {
  sim?: SimOptions;
  cfg?: Partial<ProtocolConfig>;
  /** felt-ease the simulated person reports for a pace */
  felt?: (bpm: number) => number;
  /** seconds of guided session to include (0 = stop at result) */
  guided?: number;
  note?: string;
}

export function runSimulatedSession(o: SimSessionOptions = {}): { protocol: Protocol; recording: Recording } {
  const events: StreamEvent[] = [];
  const protocol = new Protocol({ ...o.cfg, guidedS: o.guided ?? 0 }, 'live', (m) => events.push(m), 1);
  const stream = new SimulatedStream(o.sim ?? {}, () => ({ bpm: protocol.phase.bpm, phase: protocol.pacerPhase }));
  const felt = o.felt ?? ((bpm: number) => Math.max(1, Math.min(5, Math.round(5 - Math.abs(bpm - 6.0) * 1.6))));
  const emit = (e: StreamEvent) => { events.push(e); protocol.ingest(e); };
  const dt = 0.1;
  for (let t = 0; t < 3600; t += dt) {
    stream.advanceTo(t, emit);
    protocol.tick(t);
    const ph = protocol.phase.name;
    if (ph === 'setup' && t >= 8 && protocol.verdict.ok) protocol.beginBaseline();
    else if (ph === 'rate' && t - protocol.phase.start >= 3) protocol.rate(felt(protocol.order[protocol.phase.stage]));
    else if (ph === 'result' && t - protocol.phase.start >= 2) {
      if ((o.guided ?? 0) > 0) protocol.startGuided();
      else break;
    } else if (ph === 'done') break;
  }
  events.push({ type: 'marker', t: protocol.now, kind: 'end', data: {} });
  const recording: Recording = { format: 'paceprint-stream', version: 1, createdAt: new Date().toISOString(), source: 'simulated', note: o.note, events };
  return { protocol, recording };
}
