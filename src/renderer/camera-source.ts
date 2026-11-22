// Live camera source. The SmartSpectra SDK runs in the main process with its own camera capture
// (src/main/live-sdk.ts, the verify-sdk path); this window never opens the camera. Here the SDK's events
// become normalized StreamEvents, and its preview frames go to the preview (drawn only: Rule 6).
import type { CaptureSource, Listener } from '../core/capture';
import { Normalizer } from '../core/normalize';
import type { PreviewImage } from '../core/preview-frame';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');

declare global { interface Window { paceprint: any } }

/** Where the camera source reports camera on/off and preview frames. */
export interface PreviewSink {
  started(): void;
  frame(f: PreviewImage): void;
  stopped(): void;
}

/** One SDK event from the main process (LiveEvent in src/main/live-sdk.ts). */
export type LiveEvent =
  | { type: 'status'; status: number }
  | { type: 'validation'; code: number; hint: string }
  | { type: 'error'; code: number; message: string; retryable: boolean }
  | { type: 'metrics'; buf: Uint8Array; ts: number }
  | { type: 'cardioRefused'; code: number; message: string };

/** The main-process API this source uses (preload.ts). */
export interface LiveApi {
  liveStart(): Promise<{ ok: true; cardioRefused: boolean } | { ok: false; code: number | null; message: string }>;
  liveStop(): Promise<void>;
  onLiveEvent(fn: (e: LiveEvent) => void): () => void;
  onLiveFrame(fn: (f: PreviewImage) => void): () => void;
}

export class CameraSource implements CaptureSource {
  readonly kind = 'camera' as const;
  private norm: Normalizer;
  /** set when cardio metrics were refused for this key (Plan C fallback) */
  cardioRefused = false;
  private unsubs: (() => void)[] = [];
  private lastPacketT: number | null = null;
  private lastPacketWall = 0;

  /** timeOffsetS: continue an existing session clock (used when the camera restarts for the guided session) */
  constructor(private preview: PreviewSink, private onLog: (msg: string) => void = () => {}, timeOffsetS = 0,
    private api: LiveApi = window.paceprint) {
    this.norm = new Normalizer(timeOffsetS);
  }

  async start(listener: Listener) {
    // status/validation/error events are stamped on the stream clock by arrival (see normalize.ts)
    const t = () => (this.lastPacketT === null ? 0 : this.lastPacketT + (performance.now() - this.lastPacketWall) / 1000);
    this.unsubs.push(this.api.onLiveEvent((e) => this.onEvent(e, listener, t)));
    this.unsubs.push(this.api.onLiveFrame((f) => this.preview.frame(f)));
    let r;
    try {
      r = await this.api.liveStart();
    } catch (e) {
      await this.stop();
      throw e;
    }
    if (!r.ok) {
      await this.stop();
      throw new Error(r.code === null ? r.message : `${r.message} (SDK error ${r.code})`);
    }
    if (r.cardioRefused) this.cardioRefused = true;
    this.preview.started();
  }

  private onEvent(e: LiveEvent, listener: Listener, t: () => number) {
    switch (e.type) {
      case 'status': listener({ type: 'status', t: t(), status: e.status }); break;
      case 'validation': listener({ type: 'validation', t: t(), code: e.code, hint: e.hint }); break;
      case 'error': listener({ type: 'error', t: t(), code: e.code, message: e.message, retryable: e.retryable }); break;
      case 'cardioRefused': this.cardioRefused = true; this.onLog(`cardio refused (${e.code}: ${e.message}); continuing with breathing + face`); break;
      case 'metrics':
        try {
          const m = decodeMetrics(e.buf);
          if (m && !(m instanceof Uint8Array)) {
            const p = this.norm.packet(m, e.ts);
            this.lastPacketT = p.t; this.lastPacketWall = performance.now();
            listener({ type: 'packet', p });
          }
        } catch (err) { this.onLog(`decode failed: ${err}`); }
        break;
    }
  }

  async stop() {
    this.unsubs.splice(0).forEach((u) => u());
    try { await this.api.liveStop(); } catch (e) { this.onLog(`stop failed: ${e}`); }
    this.preview.stopped();
  }
}
