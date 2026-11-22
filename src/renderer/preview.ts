// On-screen preview of the SDK's own camera frames, or a pacer-only screen if none arrive. Chosen
// automatically (previewMode). Frames are drawn on the canvases and dropped: never kept, stored, or
// sent anywhere (Rule 6).
import { previewMode, PREVIEW, type PreviewImage, type PreviewMode } from '../core/preview-frame';
import type { PreviewSink } from './camera-source';

export class PreviewCanvas implements PreviewSink {
  private startedAt: number | null = null;
  private lastFrameAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mode: PreviewMode = 'waiting';

  constructor(
    private canvases: HTMLCanvasElement[],
    /** called when the camera goes on/off and when the preview mode changes */
    private onChange: (on: boolean, mode: PreviewMode) => void,
  ) {}

  /** true while the canvases show live frames (the flicker probe reads them) */
  get hasFrames() { return this.mode === 'frames'; }

  started() {
    this.startedAt = performance.now() / 1000;
    this.lastFrameAt = null;
    this.mode = 'waiting';
    this.onChange(true, this.mode);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.update(), 1000);
  }

  frame(f: PreviewImage) {
    if (this.startedAt === null) return;
    this.lastFrameAt = performance.now() / 1000;
    const px = new Uint8ClampedArray(f.data.byteLength);
    px.set(f.data);
    const img = new ImageData(px, f.width, f.height);
    for (const c of this.canvases) {
      if (c.width !== f.width || c.height !== f.height) { c.width = f.width; c.height = f.height; }
      c.getContext('2d')!.putImageData(img, 0, 0);
    }
    this.update();
  }

  stopped() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const wasOn = this.startedAt !== null;
    this.startedAt = null; this.lastFrameAt = null; this.mode = 'waiting';
    for (const c of this.canvases) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    if (wasOn) this.onChange(false, this.mode);
  }

  private update() {
    const m = previewMode(this.startedAt, this.lastFrameAt, performance.now() / 1000, PREVIEW.waitS);
    if (m !== this.mode) { this.mode = m; this.onChange(this.startedAt !== null, m); }
  }
}
