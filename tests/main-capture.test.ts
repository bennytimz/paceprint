// Option 2: the SDK captures the camera in the main process (the verify-sdk path); the window only gets
// events and preview frames. One capture path, preview or pacer-only chosen automatically, Rule 6 kept.
import { describe, it, expect, vi } from 'vitest';
import { toPreview, FrameGate, previewMode, nativeFpsLine, PIXEL, PREVIEW } from '../src/core/preview-frame';
import { LiveSdk, type LiveEvent, type LiveFrame } from '../src/main/live-sdk';
import { CameraSource, type LiveApi, type PreviewSink } from '../src/renderer/camera-source';

// ------------------------------------------------------------------ preview frames
describe('preview frames', () => {
  it('BGRA becomes RGBA with full alpha', () => {
    const img = toPreview(new Uint8Array([10, 20, 30, 0]), 1, 1, 4, PIXEL.BGRA)!;
    expect([...img.data]).toEqual([30, 20, 10, 255]);
  });
  it('RGB keeps channel order and honours row stride (padding skipped)', () => {
    // 2x2 RGB, stride 8 (2 bytes padding per row)
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 0, 0, 7, 8, 9, 10, 11, 12, 0, 0]);
    const img = toPreview(buf, 2, 2, 8, PIXEL.RGB)!;
    expect(img.width).toBe(2);
    expect([...img.data.slice(8, 12)]).toEqual([7, 8, 9, 255]);
  });
  it('downscales to at most the preview width', () => {
    const w = 1280, h = 720;
    const img = toPreview(new Uint8Array(w * h * 4), w, h, w * 4, PIXEL.RGBA, 320)!;
    expect(img.width).toBeLessThanOrEqual(320);
    expect(img.height).toBe(180);
    expect(img.data.length).toBe(img.width * img.height * 4);
  });
  it('YUV formats show the luma as grey', () => {
    const yuyv = toPreview(new Uint8Array([200, 1, 50, 2]), 2, 1, 4, PIXEL.YUYV)!;
    expect([...yuyv.data]).toEqual([200, 200, 200, 255, 50, 50, 50, 255]);
    const nv12 = toPreview(new Uint8Array([90, 91, 0, 0]), 2, 1, 2, PIXEL.NV12)!;
    expect([...nv12.data.slice(0, 4)]).toEqual([90, 90, 90, 255]);
  });
  it('refuses unknown formats and short buffers instead of drawing garbage', () => {
    expect(toPreview(new Uint8Array(16), 2, 2, 8, 99)).toBeNull();
    expect(toPreview(new Uint8Array(3), 2, 2, 8, PIXEL.RGBA)).toBeNull();
    expect(toPreview(new Uint8Array(0), 0, 0, 0, PIXEL.RGBA)).toBeNull();
  });
  it('the gate passes at most the preview rate', () => {
    const g = new FrameGate(10);
    let n = 0;
    for (let ms = 0; ms < 1000; ms += 1000 / 30) if (g.pass(ms)) n++;
    expect(n).toBe(10);
  });
});

describe('preview or pacer-only, chosen automatically', () => {
  const W = PREVIEW.waitS;
  it('waits after the camera starts, then shows frames as soon as they come', () => {
    expect(previewMode(null, null, 5)).toBe('waiting');
    expect(previewMode(0, null, W - 1)).toBe('waiting');
    expect(previewMode(0, 2, 3)).toBe('frames');
  });
  it('no frames within the wait: pacer-only', () => {
    expect(previewMode(0, null, W + 0.1)).toBe('none');
  });
  it('frames that stop for longer than the wait: pacer-only; frames that resume: preview again', () => {
    expect(previewMode(0, 10, 10 + W + 1)).toBe('none');
    expect(previewMode(0, 30, 30.5)).toBe('frames');
  });
  it('fps line names the native capture path', () => {
    expect(nativeFpsLine(5, 29.8, 0.2, 30)).toBe('fps over last 5 s: SDK camera 30.0, accepted by SDK 29.8, dropped by SDK 0.2, preview frames from SDK 30.0');
  });
});

// ------------------------------------------------------------------ main process: LiveSdk
function fakeSdkModule(opts: { startThrowsFor?: (metrics: number[]) => boolean; hangReset?: boolean } = {}) {
  const sessions: any[] = [];
  class SmartSpectraSDK {
    listeners = new Map<string, (...a: any[]) => void>();
    calls: string[] = [];
    camera: unknown = undefined;
    constructor(public options: any) { sessions.push(this); }
    on(ev: string, cb: (...a: any[]) => void) { this.listeners.set(ev, cb); return this; }
    useCamera(sel: unknown, o?: unknown) { this.calls.push('useCamera'); this.camera = { sel, o }; return this; }
    useMediaStream() { throw new Error('the main process must not take a media stream'); }
    start() {
      this.calls.push('start');
      if (opts.startThrowsFor?.(this.options.requestedMetrics)) throw Object.assign(new Error('metric not authorized'), { code: 13 });
    }
    stopAsync() { this.calls.push('stopAsync'); return Promise.resolve(); }
    reset() { this.calls.push('reset'); }
    destroy() { this.calls.push('destroy'); return Promise.resolve(); }
    fire(ev: string, ...a: any[]) { this.listeners.get(ev)?.(...a); }
  }
  const mod = {
    SmartSpectraSDK,
    CameraSelection: { default: 'default-camera' },
    breathingMetrics: [1], cardioMetrics: [2], faceMetrics: [3], edaMetrics: [4],
  };
  return { mod, sessions };
}

function live(opts?: Parameters<typeof fakeSdkModule>[0]) {
  const { mod, sessions } = fakeSdkModule(opts);
  const events: LiveEvent[] = [];
  const frames: LiveFrame[] = [];
  const logs: string[] = [];
  const sdk = new LiveSdk((e) => events.push(e), (f) => frames.push(f), (m) => logs.push(m), () => mod);
  return { sdk, sessions, events, frames, logs };
}

describe('main-process SDK session', () => {
  it('uses the SDK\'s own default camera capture, like verify-sdk, with telemetry off', async () => {
    const { sdk, sessions } = live();
    expect(await sdk.start('KEY')).toEqual({ ok: true, cardioRefused: false });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].camera).toEqual({ sel: 'default-camera', o: undefined });
    expect(sessions[0].options).toEqual({ apiKey: 'KEY', requestedMetrics: [1, 2, 3, 4], enableTelemetry: false });
    await sdk.stop();
  });
  it('forwards status, validation, metrics and errors (error 14 reaches the window)', async () => {
    const { sdk, sessions, events, logs } = live();
    await sdk.start('KEY');
    const s = sessions[0];
    s.fire('processingStatus', 3);
    s.fire('validationStatus', 12, 0, 'moving');
    s.fire('metrics', new Uint8Array([1, 2]), 1234);
    s.fire('error', 14, 'frame rate stayed too low', true);
    expect(events).toEqual([
      { type: 'status', status: 3 },
      { type: 'validation', code: 12, hint: 'moving' },
      { type: 'metrics', buf: new Uint8Array([1, 2]), ts: 1234 },
      { type: 'error', code: 14, message: 'frame rate stayed too low', retryable: true },
    ]);
    expect(logs.some((l) => l.includes('SDK error 14 (SustainedLowFrameRate)'))).toBe(true);
    await sdk.stop();
  });
  it('preview frames are converted and rate-limited before they go to the window', async () => {
    const { sdk, sessions, frames } = live();
    await sdk.start('KEY');
    const buf = new Uint8Array(640 * 480 * 3);
    for (let i = 0; i < 5; i++) sessions[0].fire('videoOutput', buf, 640, 480, 640 * 3, PIXEL.BGR, i);
    expect(frames).toHaveLength(1); // the rest fall inside the gate's interval
    expect(frames[0].width).toBe(320);
    expect(frames[0].data.length).toBe(320 * 240 * 4);
    await sdk.stop();
  });
  it('stop: stopAsync then destroy on a healthy session; reset then destroy after an error', async () => {
    const a = live();
    await a.sdk.start('KEY');
    await a.sdk.stop();
    expect(a.sessions[0].calls).toEqual(['useCamera', 'start', 'stopAsync', 'destroy']);
    const b = live();
    await b.sdk.start('KEY');
    b.sessions[0].fire('error', 14, 'low fps', true);
    await b.sdk.stop();
    expect(b.sessions[0].calls).toEqual(['useCamera', 'start', 'reset', 'destroy']);
  });
  it('a new start tears the old session down first, so two sessions never overlap', async () => {
    const { sdk, sessions } = live();
    await sdk.start('KEY');
    await sdk.start('KEY');
    expect(sessions[0].calls.at(-1)).toBe('destroy');
    expect(sessions[1].calls).toEqual(['useCamera', 'start']);
    await sdk.stop();
  });
  it('events from a torn-down session are ignored', async () => {
    const { sdk, sessions, events } = live();
    await sdk.start('KEY');
    await sdk.stop();
    sessions[0].fire('processingStatus', 3);
    expect(events).toEqual([]);
  });
  it('cardio refused at start: retries once with breathing + face', async () => {
    const { sdk, sessions } = live({ startThrowsFor: (m) => m.includes(2) });
    expect(await sdk.start('KEY')).toEqual({ ok: true, cardioRefused: true });
    expect(sessions[1].options.requestedMetrics).toEqual([1, 3]);
    await sdk.stop();
  });
  it('start that fails for good reports the code instead of throwing', async () => {
    const { sdk } = live({ startThrowsFor: () => true });
    const r = await sdk.start('KEY');
    expect(r).toEqual({ ok: false, code: 13, message: 'metric not authorized' });
  });
});

// ------------------------------------------------------------------ window: CameraSource
function fakeApi(start: Awaited<ReturnType<LiveApi['liveStart']>> = { ok: true, cardioRefused: false }) {
  let onEvent: ((e: any) => void) | null = null;
  let onFrame: ((f: any) => void) | null = null;
  const calls: string[] = [];
  const api: LiveApi = {
    liveStart: async () => { calls.push('start'); return start; },
    liveStop: async () => { calls.push('stop'); },
    onLiveEvent: (fn) => { onEvent = fn; return () => { onEvent = null; calls.push('unsub-event'); }; },
    onLiveFrame: (fn) => { onFrame = fn; return () => { onFrame = null; calls.push('unsub-frame'); }; },
  };
  return { api, calls, event: (e: any) => onEvent?.(e), frame: (f: any) => onFrame?.(f) };
}
function fakePreview() {
  const calls: string[] = [];
  const sink: PreviewSink = { started: () => calls.push('started'), frame: () => calls.push('frame'), stopped: () => calls.push('stopped') };
  return { sink, calls };
}

describe('window camera source (no camera of its own)', () => {
  it('never asks the browser for the camera', async () => {
    const gum = vi.fn();
    (globalThis as any).navigator ??= {};
    const nav = (globalThis as any).navigator;
    const before = nav.mediaDevices;
    nav.mediaDevices = { getUserMedia: gum };
    const f = fakeApi(); const p = fakePreview();
    const cam = new CameraSource(p.sink, () => {}, 0, f.api);
    await cam.start(() => {});
    await cam.stop();
    expect(gum).not.toHaveBeenCalled();
    nav.mediaDevices = before;
  });
  it('passes SDK events on as stream events and frames to the preview', async () => {
    const f = fakeApi(); const p = fakePreview();
    const out: any[] = [];
    const cam = new CameraSource(p.sink, () => {}, 0, f.api);
    await cam.start((e) => out.push(e));
    f.event({ type: 'status', status: 3 });
    f.event({ type: 'validation', code: 1, hint: 'no face' });
    f.event({ type: 'error', code: 14, message: 'low fps', retryable: true });
    f.frame({ width: 1, height: 1, data: new Uint8Array(4) });
    expect(out.map((e) => e.type)).toEqual(['status', 'validation', 'error']);
    expect(out[2]).toMatchObject({ code: 14, retryable: true });
    expect(p.calls).toEqual(['started', 'frame']);
    await cam.stop();
  });
  it('stop unsubscribes, stops the main-process session and clears the preview', async () => {
    const f = fakeApi(); const p = fakePreview();
    const cam = new CameraSource(p.sink, () => {}, 0, f.api);
    await cam.start(() => {});
    await cam.stop();
    expect(f.calls).toEqual(['start', 'unsub-event', 'unsub-frame', 'stop']);
    expect(p.calls).toEqual(['started', 'stopped']);
  });
  it('a failed start cleans up and throws with the SDK code', async () => {
    const f = fakeApi({ ok: false, code: 2, message: 'Authentication failed' }); const p = fakePreview();
    const cam = new CameraSource(p.sink, () => {}, 0, f.api);
    await expect(cam.start(() => {})).rejects.toThrow('Authentication failed (SDK error 2)');
    expect(f.calls).toContain('stop');
    expect(p.calls).toEqual(['stopped']);
  });
  it('cardio refused mid-session is recorded, not passed on as an error', async () => {
    const f = fakeApi(); const p = fakePreview();
    const out: any[] = [];
    const cam = new CameraSource(p.sink, () => {}, 0, f.api);
    await cam.start((e) => out.push(e));
    f.event({ type: 'cardioRefused', code: 13, message: 'not authorized' });
    expect(cam.cardioRefused).toBe(true);
    expect(out).toEqual([]);
    await cam.stop();
  });
});
