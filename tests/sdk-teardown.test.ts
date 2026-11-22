// Try again after a dead session: teardown must leave the SDK able to start a new session in the same run.
import { describe, it, expect, vi } from 'vitest';
import { teardownSdk, RateCounter, fpsLine } from '../src/core/sdk-teardown';

function fakeSdk(opts: { stop?: () => Promise<unknown>; reset?: () => Promise<unknown>; destroyThrows?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    stop: () => { calls.push('stop'); return opts.stop ? opts.stop() : Promise.resolve(); },
    reset: () => { calls.push('reset'); return opts.reset ? opts.reset() : Promise.resolve(); },
    destroy: () => { calls.push('destroy'); if (opts.destroyThrows) throw new Error('gone'); },
  };
}

describe('SDK teardown', () => {
  it('after an SDK error, rebuilds with reset() (not stop()) and destroys', async () => {
    const sdk = fakeSdk();
    const out = await teardownSdk(sdk, true);
    expect(sdk.calls).toEqual(['reset', 'destroy']);
    expect(out).toBe('reset ok, destroyed');
  });
  it('a healthy session is stopped, then destroyed', async () => {
    const sdk = fakeSdk();
    expect(await teardownSdk(sdk, false)).toBe('stop ok, destroyed');
    expect(sdk.calls).toEqual(['stop', 'destroy']);
  });
  it('a wedged session cannot hang teardown: gives up after the time limit and still destroys', async () => {
    vi.useFakeTimers();
    const sdk = fakeSdk({ reset: () => new Promise(() => {}) });
    const p = teardownSdk(sdk, true, 8);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await p).toBe('reset timed out after 8 s, destroyed');
    expect(sdk.calls).toEqual(['reset', 'destroy']);
    vi.useRealTimers();
  });
  it('never throws, even when every step fails', async () => {
    const sdk = fakeSdk({ stop: () => Promise.reject(new Error('not in a valid state')), destroyThrows: true });
    expect(await teardownSdk(sdk, false)).toBe('stop failed: not in a valid state, destroy failed: gone');
  });
});

describe('frame-rate line', () => {
  it('reports the rate per window and starts a new window each time', () => {
    const r = new RateCounter(0);
    r.add(150);
    expect(r.take(5)).toBe(30);
    r.add(40);
    expect(r.take(10)).toBe(8);
  });
  it('puts camera and SDK rates side by side', () => {
    expect(fpsLine(5, 29.96, 12.2, 0)).toBe('fps over last 5 s: camera 30.0, accepted by SDK 12.2, dropped by SDK 0.0');
    expect(fpsLine(5, NaN, 0, 0)).toContain('camera n/a');
  });
});
