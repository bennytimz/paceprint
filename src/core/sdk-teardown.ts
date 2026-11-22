// Ending an SDK session so the next one can start in the same app run. No Electron or DOM imports.
//
// After an SDK error the session is in its terminal error state. The renderer SDK documents reset() as
// the way to "rebuild the graph after a kError state"; stop() is for a healthy session. Either call can
// hang on a wedged session, so each step is time-limited and destroy() always runs.

/** The parts of the renderer SmartSpectraSDK that teardown uses. */
export interface SdkLike {
  stop(): Promise<unknown>;
  reset(): Promise<unknown>;
  destroy(): void;
}

export const TEARDOWN = {
  /** s to wait for stop()/reset() before giving up on it */
  stepTimeoutS: 8,
};

function withTimeout<T>(p: Promise<T>, s: number): Promise<T | 'timeout'> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve('timeout'), s * 1000);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

/** Returns what happened, for the log. Never throws. */
export async function teardownSdk(sdk: SdkLike, errored: boolean, timeoutS = TEARDOWN.stepTimeoutS): Promise<string> {
  const step = errored ? 'reset' : 'stop';
  let outcome: string;
  try {
    const r = await withTimeout(errored ? sdk.reset() : sdk.stop(), timeoutS);
    outcome = r === 'timeout' ? `${step} timed out after ${timeoutS} s` : `${step} ok`;
  } catch (e: any) {
    outcome = `${step} failed: ${e?.message ?? e}`;
  }
  try { sdk.destroy(); outcome += ', destroyed'; } catch (e: any) { outcome += `, destroy failed: ${e?.message ?? e}`; }
  return outcome;
}

/** Frames counted over a window; take() gives the rate since the last take() and starts a new window. */
export class RateCounter {
  private n = 0;
  constructor(private since: number) {}
  add(k = 1) { this.n += k; }
  take(now: number): number {
    const dt = now - this.since;
    const r = dt > 0 ? this.n / dt : NaN;
    this.n = 0; this.since = now;
    return r;
  }
}

/** One terminal line: camera rate next to what the SDK accepted, so a gap points at the frame path. */
export function fpsLine(seconds: number, camera: number, accepted: number, dropped: number): string {
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
  return `fps over last ${Math.round(seconds)} s: camera ${f(camera)}, accepted by SDK ${f(accepted)}, dropped by SDK ${f(dropped)}`;
}
