// Merges a real-time stream (~28 packets/s) into fewer, larger packets so a 16-minute recording
// fits in the repo as a fixture. Lossless for the analysis: every trace sample is kept;
// flags are OR-ed, motion takes the max, scalars keep the latest value.
import type { Packet, Recording, StreamEvent } from './types';

export function mergePackets(rec: Recording, binS = 0.5): Recording {
  const out: StreamEvent[] = [];
  let acc: Packet | null = null;
  const flush = () => { if (acc) out.push({ type: 'packet', p: acc }); acc = null; };
  for (const e of rec.events) {
    if (e.type !== 'packet') { flush(); out.push(e); continue; }
    const p = e.p;
    if (acc && p.t - acc.t < binS) {
      const a: Packet = acc;
      a.upper.push(...p.upper); a.lower.push(...p.lower); a.pressure.push(...p.pressure); a.eda.push(...p.eda);
      if (p.talking !== undefined) a.talking = !!a.talking || p.talking;
      if (p.blinking !== undefined) a.blinking = !!a.blinking || p.blinking;
      if (p.motion !== undefined) a.motion = Math.max(a.motion ?? 0, p.motion);
      if (p.face !== undefined) a.face = a.face === false ? false : p.face;
      if (p.breathRate) a.breathRate = p.breathRate;
      if (p.pulseRate) a.pulseRate = p.pulseRate;
      if (p.hrv) a.hrv = p.hrv;
      if (p.pressureConf !== undefined) a.pressureConf = Math.min(a.pressureConf ?? Infinity, p.pressureConf);
      continue;
    }
    flush();
    acc = { ...p, upper: [...p.upper], lower: [...p.lower], pressure: [...p.pressure], eda: [...p.eda] };
  }
  flush();
  return { ...rec, events: out };
}

/** Checks a recording holds only metric data we expect (no frames, images, paths, or free text beyond SDK hints). */
export function auditRecording(rec: Recording): string[] {
  const problems: string[] = [];
  const allowed = new Set(['packet', 'validation', 'status', 'error', 'pacer', 'marker']);
  for (const e of rec.events) if (!allowed.has(e.type)) problems.push(`unexpected event type ${e.type}`);
  const text = JSON.stringify(rec);
  if (/data:image|base64|jpeg|png|frame/i.test(text)) problems.push('looks like image/frame data');
  if (/[A-Za-z]:\\\\|\/Users\/|\/home\//.test(text)) problems.push('contains a local path');
  return [...new Set(problems)];
}
