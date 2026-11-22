// Live camera source: the official SmartSpectra renderer SDK (camera captured here, processed by
// the native runtime in the main process via bindSmartSpectraIpc). Emits normalized StreamEvents.
import type { CaptureSource, Listener } from '../core/capture';
import { Normalizer } from '../core/normalize';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ssr = require('@smartspectra/node-sdk/renderer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');
const { SmartSpectraSDK, breathingMetrics, cardioMetrics, faceMetrics, edaMetrics } = ssr;

declare global { interface Window { paceprint: any } }

/** SmartSpectraErrorCode names (node-sdk 3.5 index.d.ts), for the log only */
const SDK_ERROR_NAMES: Record<number, string> = {
  1: 'InvalidState', 2: 'AuthenticationFailed', 3: 'ConfigurationFailed', 4: 'CreditExhausted', 5: 'NetworkError',
  6: 'ServerError', 7: 'InputUnavailable', 8: 'ProcessingFailed', 9: 'FrameConversionFailed', 10: 'NonMonotonicTimestamp',
  11: 'TimestampGap', 13: 'MetricNotAuthorized', 14: 'SustainedLowFrameRate',
};

export class CameraSource implements CaptureSource {
  readonly kind = 'camera' as const;
  private sdk: any = null;
  private norm: Normalizer;
  /** set when cardio metrics were refused for this key (Plan C fallback) */
  cardioRefused = false;

  /** timeOffsetS: continue an existing session clock (used when the camera restarts for the guided session) */
  constructor(private onStream: (s: MediaStream) => void, private onLog: (msg: string) => void = () => {}, timeOffsetS = 0) {
    this.norm = new Normalizer(timeOffsetS);
  }

  async start(listener: Listener) {
    const key: string = await window.paceprint.prepareLive();
    // status/validation/error events are stamped on the stream clock by arrival (see normalize.ts)
    const t = () => (this.lastPacketT === null ? 0 : this.lastPacketT + (performance.now() - this.lastPacketWall) / 1000);
    const full = [...breathingMetrics, ...cardioMetrics, ...faceMetrics, ...edaMetrics];
    try {
      await this.open(key, full, listener, t);
    } catch (e: any) {
      // Cardio metrics need a provisioned key. Fall back to breathing + face, honestly labelled.
      this.onLog(`Full metric request failed (${e?.message ?? e}); retrying without cardio.`);
      this.cardioRefused = true;
      await this.close();
      await this.open(key, [...breathingMetrics, ...faceMetrics], listener, t);
    }
  }

  private lastPacketT: number | null = null;
  private lastPacketWall = 0;

  private async open(key: string, metrics: number[], listener: Listener, t: () => number) {
    const sdk = new SmartSpectraSDK({ apiKey: key, requestedMetrics: metrics, enableTelemetry: false });
    this.sdk = sdk;
    sdk.on('streamAvailable', (s: MediaStream) => this.onStream(s));
    let lastStatus: number | null = null;
    sdk.on('processingStatus', (status: number) => {
      if (status !== lastStatus) { this.onLog(`SDK processing status ${status}`); lastStatus = status; }
      listener({ type: 'status', t: t(), status });
    });
    sdk.on('validationStatus', (code: number, _ts: number, hint: string) => listener({ type: 'validation', t: t(), code, hint }));
    sdk.on('error', (code: number, message: string, retryable: boolean) => {
      // every SDK error reaches the terminal log (the message never contains the key)
      this.onLog(`SDK error ${code} (${SDK_ERROR_NAMES[code] ?? 'unknown'}): ${message} [retryable=${retryable}]`);
      // 13 = kMetricNotAuthorized, 3 = kConfigurationFailed: the key may not be provisioned for
      // cardio. Fall back once to breathing + face (Plan C scoring), instead of failing.
      const askedCardio = metrics.some((m) => cardioMetrics.includes(m));
      if ((code === 13 || code === 3) && askedCardio && !this.cardioRefused) {
        this.cardioRefused = true;
        this.onLog(`cardio refused (${code}: ${message}); continuing with breathing + face`);
        void this.close().then(() => this.open(key, [...breathingMetrics, ...faceMetrics], listener, t));
        return;
      }
      listener({ type: 'error', t: t(), code, message, retryable });
    });
    sdk.on('metrics', (buf: Uint8Array, ts: number) => {
      try {
        const m = decodeMetrics(buf);
        if (m && !(m instanceof Uint8Array)) {
          const p = this.norm.packet(m, ts);
          this.lastPacketT = p.t; this.lastPacketWall = performance.now();
          listener({ type: 'packet', p });
        }
      } catch (e) { this.onLog(`decode failed: ${e}`); }
    });
    await sdk.start();
  }

  private async close() {
    const sdk = this.sdk;
    this.sdk = null;
    if (!sdk) return;
    try { await sdk.stop(); } catch { /* already stopped */ }
    try { sdk.destroy(); } catch { /* already destroyed */ }
  }

  async stop() { await this.close(); }
}
