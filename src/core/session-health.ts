// Live-session health: decides when an SDK session has ended and what the screen should say, so a dead
// session never leaves "Signal flowing" red with no explanation. No Electron or DOM imports (tested in Vitest).
//
// An SDK 'error' event means the session reached its terminal error state (node-sdk 3.5 index.d.ts:
// waitUntilDone "blocks until the session reaches a terminal state (idle or error)"); every frame after it
// is refused with "not in a valid state". A session can also go silent with no error event, so a watchdog
// ends it when no packet arrives for too long. These times only decide when to show the message; they
// never touch what data is trusted or scored.

export const HEALTH = {
  /** s after the camera starts with no packet at all (first packet came at ~4 s in live checks) */
  firstPacketS: 20,
  /** s without a packet once packets have flowed */
  silentS: 30,
};

export interface DeadSession {
  /** SDK error code, or null when the watchdog ended it */
  code: number | null;
  sdkMessage: string;
  title: string;
  text: string;
  /** a new attempt can help (false for exhausted credits and a rejected key) */
  retry: boolean;
}

export interface DeadScreen {
  eyebrow: string;
  title: string;
  text: string;
  button: string;
  action: 'retry' | 'result' | 'back';
}

/** What to tell the person for each SmartSpectraErrorCode (node-sdk 3.5). */
export function sdkErrorView(code: number, message: string, retryable: boolean): DeadSession {
  const v = (title: string, text: string, retry = true): DeadSession => ({ code, sdkMessage: message, title, text, retry });
  switch (code) {
    case 4: return v('Your SmartSpectra trial credits have run out.', 'Measuring needs credits. Judge Mode (npm run demo) still works without them.', false);
    case 2: return v('The API key was rejected.', 'Check SMARTSPECTRA_API_KEY in the .env file, then restart Paceprint.', false);
    case 5: return v('Could not reach SmartSpectra.', 'Check your internet connection, then try again.');
    case 6: return v('SmartSpectra had a server problem.', 'Wait a moment, then try again.');
    case 7: return v('The camera stopped delivering frames.', 'Check that no other app is using the camera, then try again.');
    case 14: return v('The camera frame rate stayed too low.', 'Keep Paceprint in front, close other heavy or camera apps, then try again.');
    case 10:
    case 11: return v('Camera frames arrived out of step.', 'This can happen if the computer was busy or the window was hidden. Keep Paceprint in front, then try again.');
    case 13:
    case 3: return v('This key is not set up for some of the readings.', 'Try again; if it keeps happening, check the key in the Presage dashboard.');
    default: return v('The measurement stopped unexpectedly.', retryable ? 'Try again.' : 'Try again; if it keeps happening, restart Paceprint.');
  }
}

/** The message screen for a dead session. A sweep cannot be resumed, so retry starts a new one from setup. */
export function deadSessionScreen(d: DeadSession, hasResult: boolean): DeadScreen {
  const why = d.code !== null ? ` (SDK error ${d.code}: ${d.sdkMessage})` : '';
  if (hasResult) {
    return { eyebrow: 'Session ended', title: d.title, text: `${d.text} Your result is already saved.${why}`, button: 'Back to result', action: 'result' };
  }
  if (d.retry) {
    return { eyebrow: 'Session ended', title: d.title, text: `${d.text} The camera is off. Try again starts a new measurement from the setup check; nothing from this attempt is used.${why}`, button: 'Try again', action: 'retry' };
  }
  return { eyebrow: 'Session ended', title: d.title, text: `${d.text} The camera is off.${why}`, button: 'Back', action: 'back' };
}

/** Feed it camera start/stop, packets and SDK errors (wall-clock seconds); ask whether the session is dead. */
export class SessionHealth {
  private startedAt: number | null = null;
  private lastPacket: number | null = null;
  private dead: DeadSession | null = null;

  start(now: number) { this.startedAt = now; this.lastPacket = null; this.dead = null; }
  stop() { this.startedAt = null; this.lastPacket = null; this.dead = null; }
  packet(now: number) { if (this.startedAt !== null) this.lastPacket = now; }
  error(code: number, message: string, retryable: boolean) {
    if (this.startedAt !== null && !this.dead) this.dead = sdkErrorView(code, message, retryable);
  }

  check(now: number): DeadSession | null {
    if (this.startedAt === null) return null;
    if (this.dead) return this.dead;
    const silentFor = this.lastPacket === null ? now - this.startedAt : now - this.lastPacket;
    const limit = this.lastPacket === null ? HEALTH.firstPacketS : HEALTH.silentS;
    if (silentFor > limit) {
      this.dead = {
        code: null, sdkMessage: '', retry: true,
        title: this.lastPacket === null ? 'No data came from the SDK.' : 'The SDK stopped sending data.',
        text: `Nothing arrived for ${Math.round(limit)} s, so this attempt cannot continue. Keep Paceprint in front while measuring.`,
      };
    }
    return this.dead;
  }
}
