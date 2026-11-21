// Sustained-talking rule: acts on flagging that fills a window, not on single blips.
import { describe, it, expect } from 'vitest';
import { SustainedTalking, SUSTAINED } from '../src/core/talking';

const FS = 29; // talking-flag packets per second, as from the SDK

function run(on: (t: number) => boolean, seconds: number) {
  const st = new SustainedTalking();
  const active: { t: number; a: boolean }[] = [];
  for (let i = 0; i <= seconds * FS; i++) { const t = i / FS; st.push(t, on(t)); active.push({ t, a: st.active(t) }); }
  return active;
}

describe('sustained-talking rule', () => {
  it('triggers on continuous flagging once it fills most of the window', () => {
    const a = run((t) => t >= 5, 15);
    expect(a.filter((x) => x.t < 5).some((x) => x.a)).toBe(false);
    const first = a.find((x) => x.a)!.t;
    expect(first - 5).toBeCloseTo(SUSTAINED.windowS * SUSTAINED.minFraction, 0);
    expect(a.filter((x) => x.t > 9).every((x) => x.a)).toBe(true);
  });
  it('ignores single blips, even long-ish ones, spread out in time', () => {
    // a 1.5 s blip every 4 s
    const a = run((t) => t % 4 < 1.5, 40);
    expect(a.some((x) => x.a)).toBe(false);
  });
  it('ignores frequent short blips covering a minority of the time', () => {
    // 0.2 s on, 0.6 s off: 25 % flagged
    const a = run((t) => t % 0.8 < 0.2, 40);
    expect(a.some((x) => x.a)).toBe(false);
  });
  it('keeps triggering through short pauses in speech', () => {
    // talking with a 0.4 s pause every 3 s (87 % flagged; at most 0.8 s off in any 4 s)
    const a = run((t) => t > 2 && t % 3 > 0.4, 30);
    expect(a.filter((x) => x.t > 8).every((x) => x.a)).toBe(true);
  });
  it('has no opinion without flag data', () => {
    expect(new SustainedTalking().active(10)).toBe(false);
  });
});
