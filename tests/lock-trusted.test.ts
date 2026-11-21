// Time to lock reads only trusted time: a covered lens during settle is never turned into a number.
import { describe, it, expect } from 'vitest';
import { timeToLock, ANALYSIS } from '../src/core/analysis';
import { runSimulatedSession } from '../src/core/session-sim';
import type { Sample } from '../src/core/types';

const BPM = 6, F = BPM / 60, END = 120;
const series = (f: (t: number) => number) => { const out: Sample[] = []; for (let t = 0; t <= END; t += 0.1) out.push({ t, v: f(t) }); return out; };
const pacer = series((t) => 0.5 - 0.5 * Math.cos(2 * Math.PI * F * t));
const breathing = (t: number) => Math.sin(2 * Math.PI * F * t - 0.3);

describe('time to lock from a broken trace', () => {
  // lens covered 0-20 s: the trace there is an artefact that happens to follow the guide (the worst case);
  // after the cover the person needs until 40 s to start following
  const broken = series((t) => (t < 20 ? breathing(t) : t < 40 ? 0 : breathing(t)));

  it('the old ungated reading would have reported a lock from the covered stretch', () => {
    const whole = timeToLock(broken, pacer, 0, END, BPM, [[0, END]]);
    expect(whole.status).toBe('locked');
    expect(whole.t).toBeLessThan(20);
  });
  it('ignores the covered stretch: lock is read only after it, and marked as an upper bound', () => {
    const r = timeToLock(broken, pacer, 0, END, BPM, [[20, END]]);
    expect(r.status).toBe('bound');
    expect(r.t - ANALYSIS.lockWindowS / 2).toBeGreaterThanOrEqual(20);
  });
  it('gives no number when no window is wholly trusted', () => {
    const r = timeToLock(broken, pacer, 0, END, BPM, [[0, 10], [20, 30], [40, 50]]);
    expect(r.status).toBe('untrusted');
    expect(r.t).toBeNaN();
  });
  it('gives no number when trusted time never locks', () => {
    const r = timeToLock(broken, pacer, 0, END, BPM, [[20, 39]]);
    expect(r.status).toBe('never');
    expect(r.t).toBeNaN();
  });
  it('a clean, fully trusted pace still gets a plain time to lock', () => {
    const r = timeToLock(series(breathing), pacer, 0, END, BPM, [[0, END]]);
    expect(r.status).toBe('locked');
    expect(Number.isFinite(r.t)).toBe(true);
  });
});

describe('lens covered during the settle of pace 1 (simulated session)', () => {
  const seed = 41;
  const clean = runSimulatedSession({ sim: { seed } }).protocol;
  const s0 = clean.stageInput(0)!;
  const cover: [number, number] = [s0.start + 3, s0.start + 13];
  const covered = runSimulatedSession({ sim: { seed, episodes: [{ from: cover[0], to: cover[1], kind: 'dark' }] } }).protocol;
  const p1 = covered.stageResults[0];

  it('the covered stretch is not trusted time for that pace', () => {
    const lv = covered.stageInput(0)!.lockValid!;
    // refusal can start only when the first dark packet arrives: at most one packet interval (0.5 s in the simulator)
    for (const [a, b] of lv) expect(b <= cover[0] + 0.5 || a >= cover[1]).toBe(true);
  });
  it('time to lock never uses a window that overlaps the cover', () => {
    expect(['bound', 'untrusted', 'never']).toContain(p1.lockStatus);
    if (Number.isFinite(p1.lockTime)) expect(s0.start + p1.lockTime - ANALYSIS.lockWindowS / 2).toBeGreaterThanOrEqual(cover[1]);
  });
  it('the clean session reports plain locks, and the other paces are unchanged', () => {
    expect(clean.stageResults.every((s) => s.lockStatus === 'locked')).toBe(true);
    expect(covered.stageResults.slice(1).map((s) => [s.lockTime, s.lockStatus])).toEqual(clean.stageResults.slice(1).map((s) => [s.lockTime, s.lockStatus]));
  });
});
