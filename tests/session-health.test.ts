// A dead SDK session always ends on an explained screen, never on a silent red "Signal flowing".
import { describe, it, expect } from 'vitest';
import { SessionHealth, sdkErrorView, deadSessionScreen, HEALTH } from '../src/core/session-health';

describe('session-ending SDK errors', () => {
  it('an SDK error ends the session at once, even when marked retryable, with a Try again screen', () => {
    const h = new SessionHealth();
    h.start(0); h.packet(5);
    expect(h.check(6)).toBeNull();
    h.error(14, 'frame rate too low', true);
    const d = h.check(6.1)!;
    expect(d.code).toBe(14);
    const s = deadSessionScreen(d, false);
    expect(s.action).toBe('retry');
    expect(s.button).toBe('Try again');
    expect(s.title).toMatch(/frame rate/);
    expect(s.text).toContain('SDK error 14: frame rate too low');
    expect(s.text).toContain('The camera is off');
  });
  it('names every documented error code and keeps the SDK message on screen', () => {
    for (const code of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14]) {
      const s = deadSessionScreen(sdkErrorView(code, `msg ${code}`, true), false);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.text).toContain(`SDK error ${code}: msg ${code}`);
    }
  });
  it('offers no retry where one cannot help: credits run out, key rejected', () => {
    expect(deadSessionScreen(sdkErrorView(4, 'x', false), false).action).toBe('back');
    expect(deadSessionScreen(sdkErrorView(2, 'x', false), false).action).toBe('back');
  });
  it('after the result, goes back to the saved result instead of restarting', () => {
    const s = deadSessionScreen(sdkErrorView(11, 'gap', true), true);
    expect(s.action).toBe('result');
    expect(s.text).toContain('already saved');
  });
  it('keeps the first error, ignores errors while the camera is off', () => {
    const h = new SessionHealth();
    h.error(5, 'net', true);
    expect(h.check(1)).toBeNull();
    h.start(0); h.error(11, 'gap', true); h.error(1, 'invalid state', false);
    expect(h.check(1)!.code).toBe(11);
  });
});

describe('silent-session watchdog', () => {
  it('ends a session that never sends a packet', () => {
    const h = new SessionHealth();
    h.start(0);
    expect(h.check(HEALTH.firstPacketS - 1)).toBeNull();
    const d = h.check(HEALTH.firstPacketS + 1)!;
    expect(d.code).toBeNull();
    expect(deadSessionScreen(d, false).action).toBe('retry');
    expect(d.title).toMatch(/No data/);
  });
  it('ends a session whose packets stop (the 31 s failure), but not one that keeps flowing', () => {
    const h = new SessionHealth();
    h.start(0);
    for (let t = 4; t <= 31; t += 0.5) h.packet(t);
    expect(h.check(31 + HEALTH.silentS - 1)).toBeNull();
    expect(h.check(31 + HEALTH.silentS + 1)!.title).toMatch(/stopped sending/);
    const ok = new SessionHealth();
    ok.start(0);
    for (let t = 4; t <= 600; t += 0.5) { ok.packet(t); expect(ok.check(t)).toBeNull(); }
  });
  it('says nothing while the camera is deliberately off (result screen) and starts clean', () => {
    const h = new SessionHealth();
    h.start(0); h.packet(3); h.stop();
    expect(h.check(1000)).toBeNull();
    h.start(1000);
    expect(h.check(1001)).toBeNull();
  });
});
