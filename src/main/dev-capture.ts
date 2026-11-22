// Dev-only: records the app's own window as JPEG frames on a timed plan, for the demo video
// (scripts/capture-judge.mjs). Used only with PACEPRINT_CAPTURE=<plan.json> and --demo (Judge Mode: no
// camera, simulated session). Captures this window's own pixels (webContents.capturePage), not the screen.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BrowserWindow } from 'electron';

export interface CapturePlan {
  /** folder for frames: <dir>/<segment>/000001.jpg, plus segments.json */
  dir: string;
  fps: number;
  /** window content size in CSS px, e.g. [1536, 864] */
  size?: [number, number];
  /** JavaScript run in the page at `at` seconds after load */
  steps: { at: number; js: string }[];
  /** frames captured between `from` and `to` seconds after load */
  segments: { name: string; from: number; to: number }[];
  /** seconds after load to quit */
  quitAt: number;
}

export function runCapture(win: BrowserWindow, planFile: string, quit: () => void) {
  const plan: CapturePlan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (plan.size) win.setContentSize(plan.size[0], plan.size[1]);
  const t0 = Date.now();
  const at = (s: number, fn: () => void) => setTimeout(fn, Math.max(0, t0 + s * 1000 - Date.now()));
  const log: Record<string, { frames: number; seconds: number; startMs: number }> = {};
  for (const st of plan.steps) at(st.at, () => { void win.webContents.executeJavaScript(st.js).catch((e) => console.log(`[capture] step at ${st.at}s failed: ${e}`)); });
  for (const seg of plan.segments) {
    at(seg.from, async () => {
      const dir = path.join(plan.dir, seg.name);
      fs.mkdirSync(dir, { recursive: true });
      const start = Date.now(), end = t0 + seg.to * 1000, step = 1000 / plan.fps;
      let n = 0;
      while (Date.now() < end && !win.isDestroyed()) {
        const due = start + n * step;
        if (Date.now() < due) await new Promise((r) => setTimeout(r, due - Date.now()));
        const img = await win.webContents.capturePage();
        n++;
        fs.writeFileSync(path.join(dir, `${String(n).padStart(6, '0')}.jpg`), img.toJPEG(92));
      }
      log[seg.name] = { frames: n, seconds: (Date.now() - start) / 1000, startMs: start };
      console.log(`[capture] ${seg.name}: ${n} frames in ${log[seg.name].seconds.toFixed(1)} s`);
    });
  }
  at(plan.quitAt, () => { fs.writeFileSync(path.join(plan.dir, 'segments.json'), JSON.stringify(log, null, 2)); quit(); });
}
