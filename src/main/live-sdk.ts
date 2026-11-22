// Live SDK session in the Electron main process, using the SDK's own camera capture, the same path
// scripts/verify-sdk.ts uses (30 fps on the test laptop, where the window's camera path gave 18-29 fps
// and the SDK ended sessions with error 14). The window never opens the camera, so there is only ever
// one capture path. The API key stays in this process.
//
// Forwarded to the window: status, validation, errors, metrics (bytes, decoded there), and preview
// frames. Preview frames are drawn on screen only, never stored or sent elsewhere (Rule 6).
import { teardownSdk, RateCounter } from '../core/sdk-teardown';
import { toPreview, FrameGate, nativeFpsLine } from '../core/preview-frame';

/** s between frame-rate lines in the terminal */
const FPS_LOG_S = 5;
/** s to wait for destroy() before starting a new session anyway */
const DESTROY_TIMEOUT_S = 8;

export type LiveEvent =
  | { type: 'status'; status: number }
  | { type: 'validation'; code: number; hint: string }
  | { type: 'error'; code: number; message: string; retryable: boolean }
  | { type: 'metrics'; buf: Uint8Array; ts: number }
  | { type: 'cardioRefused'; code: number; message: string };

export interface LiveFrame { width: number; height: number; data: Uint8Array }

export type StartResult = { ok: true; cardioRefused: boolean } | { ok: false; code: number | null; message: string };

/** SmartSpectraErrorCode names (node-sdk 3.5 index.d.ts), for the log only */
const SDK_ERROR_NAMES: Record<number, string> = {
  1: 'InvalidState', 2: 'AuthenticationFailed', 3: 'ConfigurationFailed', 4: 'CreditExhausted', 5: 'NetworkError',
  6: 'ServerError', 7: 'InputUnavailable', 8: 'ProcessingFailed', 9: 'FrameConversionFailed', 10: 'NonMonotonicTimestamp',
  11: 'TimestampGap', 13: 'MetricNotAuthorized', 14: 'SustainedLowFrameRate',
};

export class LiveSdk {
  private sdk: any = null;
  private errored = false;
  private cardioRefused = false;
  private fpsTimer: ReturnType<typeof setInterval> | null = null;
  private accepted = new RateCounter(0);
  private dropped = new RateCounter(0);
  private previews = new RateCounter(0);
  /** serialises start/stop so two sessions never overlap (native SDK state is process-global) */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private emit: (e: LiveEvent) => void,
    private frame: (f: LiveFrame) => void,
    private log: (msg: string) => void = (m) => console.log(`[live] ${m}`),
    /** the native SDK module; loaded on first start so Judge Mode never loads it (tests pass a fake) */
    private load: () => any = () => require('@smartspectra/node-sdk'),
  ) {}

  start(key: string): Promise<StartResult> {
    return this.serial(async () => {
      await this.close();
      this.cardioRefused = false;
      const ss = this.load();
      const full = [...ss.breathingMetrics, ...ss.cardioMetrics, ...ss.faceMetrics, ...ss.edaMetrics];
      const r = await this.open(key, full);
      if (r.ok) return r;
      // Cardio metrics need a provisioned key. Fall back to breathing + face, honestly labelled.
      this.log(`Full metric request failed (${r.message}); retrying without cardio.`);
      this.cardioRefused = true;
      await this.close();
      return this.open(key, [...ss.breathingMetrics, ...ss.faceMetrics]);
    });
  }

  stop(): Promise<void> {
    return this.serial(() => this.close());
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  private async open(key: string, metrics: number[]): Promise<StartResult> {
    const ss = this.load();
    const sdk = new ss.SmartSpectraSDK({ apiKey: key, requestedMetrics: metrics, enableTelemetry: false });
    this.sdk = sdk;
    this.errored = false;
    const live = () => this.sdk === sdk;
    const askedCardio = metrics.some((m) => ss.cardioMetrics.includes(m));
    let lastStatus: number | null = null;

    sdk.on('processingStatus', (status: number) => {
      if (!live()) return;
      if (status !== lastStatus) { this.log(`SDK processing status ${status}`); lastStatus = status; }
      this.emit({ type: 'status', status });
    });
    sdk.on('validationStatus', (code: number, _ts: number, hint: string) => { if (live()) this.emit({ type: 'validation', code, hint }); });
    sdk.on('error', (code: number, message: string, retryable: boolean) => {
      // every SDK error reaches the terminal log (the message never contains the key)
      this.log(`SDK error ${code} (${SDK_ERROR_NAMES[code] ?? 'unknown'}): ${message} [retryable=${retryable}]`);
      if (!live()) return;
      this.errored = true;
      // 13 = kMetricNotAuthorized, 3 = kConfigurationFailed: the key may not be provisioned for cardio.
      // Fall back once to breathing + face (Plan C scoring), instead of failing.
      if ((code === 13 || code === 3) && askedCardio && !this.cardioRefused) {
        this.cardioRefused = true;
        this.log(`cardio refused (${code}: ${message}); continuing with breathing + face`);
        this.emit({ type: 'cardioRefused', code, message });
        void this.serial(async () => {
          if (!live()) return;
          await this.close();
          const r = await this.open(key, [...ss.breathingMetrics, ...ss.faceMetrics]);
          if (!r.ok) this.emit({ type: 'error', code: r.code ?? 0, message: r.message, retryable: true });
        });
        return;
      }
      this.emit({ type: 'error', code, message, retryable });
    });
    sdk.on('metrics', (buf: Uint8Array, ts: number) => { if (live()) this.emit({ type: 'metrics', buf, ts }); });
    sdk.on('frameSentThrough', (sent: boolean) => { if (live()) (sent ? this.accepted : this.dropped).add(); });
    const gate = new FrameGate();
    sdk.on('videoOutput', (buf: Uint8Array, width: number, height: number, stride: number, format: number) => {
      if (!live()) return;
      this.previews.add();
      if (!gate.pass(Date.now())) return;
      const img = toPreview(buf, width, height, stride, format);
      if (img) this.frame(img);
    });

    // the SDK's default capture, exactly as verify-sdk.ts uses it
    sdk.useCamera(ss.CameraSelection.default);
    try {
      sdk.start();
    } catch (e: any) {
      this.log(`start() threw: ${e?.code ?? ''} ${e?.message ?? e}`);
      this.errored = true;
      await this.close();
      return { ok: false, code: typeof e?.code === 'number' ? e.code : null, message: String(e?.message ?? e) };
    }
    this.log(`camera started by the SDK in the main process (${askedCardio ? 'full metrics' : 'breathing + face'})`);
    this.startFpsLog();
    return { ok: true, cardioRefused: this.cardioRefused };
  }

  /** End the session: reset() after an error, stopAsync() otherwise; destroy() always, awaited. */
  private async close() {
    const sdk = this.sdk;
    this.sdk = null;
    if (this.fpsTimer) { clearInterval(this.fpsTimer); this.fpsTimer = null; }
    if (!sdk) return;
    const errored = this.errored;
    this.errored = false;
    let destroyed: Promise<unknown> = Promise.resolve();
    const out = await teardownSdk({
      stop: () => sdk.stopAsync(),
      reset: async () => sdk.reset(),
      destroy: () => { destroyed = Promise.resolve(sdk.destroy()); },
    }, errored);
    const d = await Promise.race([
      destroyed.then(() => 'done', (e: any) => `failed: ${e?.message ?? e}`),
      new Promise<string>((r) => setTimeout(() => r(`timed out after ${DESTROY_TIMEOUT_S} s`), DESTROY_TIMEOUT_S * 1000)),
    ]);
    this.log(`SDK teardown: ${out} (destroy ${d})`);
  }

  private startFpsLog() {
    const now = () => Date.now() / 1000;
    this.accepted = new RateCounter(now()); this.dropped = new RateCounter(now()); this.previews = new RateCounter(now());
    this.fpsTimer = setInterval(() => {
      const t = now();
      this.log(nativeFpsLine(FPS_LOG_S, this.accepted.take(t), this.dropped.take(t), this.previews.take(t)));
    }, FPS_LOG_S * 1000);
  }
}
