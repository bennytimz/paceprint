// Preview frames from the SDK's own camera capture (its 'videoOutput' event), turned into small RGBA
// images for the on-screen preview. No Electron or DOM imports.
//
// Rule 6: these frames are drawn on screen and nothing else. They are never stored, recorded, or sent
// anywhere but from the main process to this app's own window.

/** SDK PixelFormat values (node-sdk 3.5 index.d.ts) */
export const PIXEL = { RGB: 0, BGR: 1, RGBA: 2, BGRA: 3, NV12: 4, NV21: 5, YUYV: 6 } as const;

export const PREVIEW = {
  /** widest preview frame sent to the window, px */
  maxWidth: 320,
  /** preview frames per second sent to the window (the SDK keeps every frame it captures) */
  fps: 12,
  /** s after the camera starts with no preview frame before the screen switches to pacer-only */
  waitS: 8,
};

export interface PreviewImage { width: number; height: number; data: Uint8Array }

/**
 * Nearest-neighbour downscale to at most maxWidth, as RGBA. YUV formats show the luma plane only
 * (grey), which is enough to check framing. Returns null for a format or size it can't read.
 */
export function toPreview(buf: Uint8Array, width: number, height: number, stride: number, format: number, maxWidth = PREVIEW.maxWidth): PreviewImage | null {
  if (!(width > 0 && height > 0)) return null;
  const bpp = format === PIXEL.RGB || format === PIXEL.BGR ? 3 : format === PIXEL.RGBA || format === PIXEL.BGRA ? 4 : format === PIXEL.YUYV ? 2 : format === PIXEL.NV12 || format === PIXEL.NV21 ? 1 : 0;
  if (!bpp) return null;
  const rowBytes = stride > 0 ? stride : width * bpp;
  if (buf.length < rowBytes * (height - 1) + width * bpp) return null;
  const step = Math.max(1, Math.ceil(width / maxWidth));
  const w = Math.floor(width / step), h = Math.floor(height / step);
  const out = new Uint8Array(w * h * 4);
  const bgr = format === PIXEL.BGR || format === PIXEL.BGRA;
  let o = 0;
  for (let y = 0; y < h; y++) {
    const row = y * step * rowBytes;
    for (let x = 0; x < w; x++) {
      const sx = x * step;
      if (bpp >= 3) {
        const i = row + sx * bpp;
        out[o] = buf[bgr ? i + 2 : i]; out[o + 1] = buf[i + 1]; out[o + 2] = buf[bgr ? i : i + 2];
      } else {
        // YUYV: Y at every even byte; NV12/NV21: first plane is Y
        const v = buf[row + (bpp === 2 ? sx * 2 : sx)];
        out[o] = v; out[o + 1] = v; out[o + 2] = v;
      }
      out[o + 3] = 255;
      o += 4;
    }
  }
  return { width: w, height: h, data: out };
}

/** Lets through at most fps frames per second (times in ms). */
export class FrameGate {
  private next = 0;
  constructor(private fps = PREVIEW.fps) {}
  pass(nowMs: number): boolean {
    if (nowMs < this.next) return false;
    this.next = nowMs + 1000 / this.fps;
    return true;
  }
}

export type PreviewMode = 'waiting' | 'frames' | 'none';

/** Auto-choice between the live preview and the pacer-only screen. */
export function previewMode(startedAtS: number | null, lastFrameAtS: number | null, nowS: number, waitS = PREVIEW.waitS): PreviewMode {
  if (startedAtS === null) return 'waiting';
  if (lastFrameAtS !== null && nowS - lastFrameAtS < waitS) return 'frames';
  return nowS - startedAtS < waitS ? 'waiting' : 'none';
}

/** One terminal line for the native capture path. The SDK reports every frame it captured as sent or dropped. */
export function nativeFpsLine(seconds: number, accepted: number, dropped: number, preview: number): string {
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
  return `fps over last ${Math.round(seconds)} s: SDK camera ${f(accepted + dropped)}, accepted by SDK ${f(accepted)}, dropped by SDK ${f(dropped)}, preview frames from SDK ${f(preview)}`;
}
