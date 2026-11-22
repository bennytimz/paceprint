// Records the Judge Mode demo (simulated session, banner on screen) unattended, for the demo video.
//   node scripts/capture-judge.mjs        (after npm run build)
// Writes video-raw/judge.mp4 + video-raw/cuts.txt (scene start times) + video-raw/code.mp4, ready for
// scripts/assemble-raw-cut.py. The app records its own window (src/main/dev-capture.ts): no camera, no
// screen capture, about 2.5 minutes. Replay runs at 1x for each scene and 30x in between.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'video-raw');
const FRAMES = path.join(RAW, 'frames');
const FPS = 20;

const speed = (s) => `document.querySelector('.speed [data-speed="${s}"]').click()`;
const click = (id) => `document.getElementById('${id}').click()`;
const scroll = `(()=>{let e=document.getElementById('chk-adult');while(e&&!(e.scrollHeight>e.clientHeight+2&&getComputedStyle(e).overflowY!=='visible'))e=e.parentElement;(e||document.scrollingElement).scrollBy({top:160,behavior:'smooth'})})()`;

// seconds after page load. Session clock starts at Accept (14 s); simulated talking 112-124 s, motion 372-377 s,
// first rating card 203-207 s, result 711 s, recorded guided session from 713 s (tests/fixtures/judge-simulated.json).
// logs when the "Paused: Moving" card first shows, so scene 5 can start just before it (replay timing varies by a few s)
const markMoving = `(()=>{const t=document.getElementById('refusal-title');new MutationObserver(()=>{if(!window.__mv&&/Moving/.test(t.textContent)){window.__mv=1;console.warn('[capture-mark] moving '+Date.now())}}).observe(t,{childList:true,characterData:true,subtree:true})})()`;
const steps = [
  [0.5, markMoving], [1, speed(1)], [3, scroll], [5, scroll], [7, scroll], [9, scroll],
  [10.5, click('chk-adult')], [11.5, click('chk-wellness')], [14, click('btn-accept')],
  [29.7, speed(30)], [32.4, speed(1)],          // to session ~97 s: sweep, pace 7.0, talking warning at 112 s
  [73.1, speed(30)], [75.2, speed(1)],          // to ~200 s: first rating card
  [85.9, speed(30)], [90.9, speed(1)],          // to ~360 s; "Paused: Moving" (372 s) lands inside the 24 s capture
  [115.2, speed(30)],                           // to the result (~126 s wall)
  [129, speed(1)], [129.5, click('btn-guided')], // recorded guided session at 1x
  [140, click('btn-data')],
  // the drawer shows the data folder; show it as %APPDATA% so the video carries no Windows user name
  [140.2, `document.getElementById('data-dir').textContent='%APPDATA%\\\\paceprint\\\\paceprint-data'`],
  [140.6, `document.getElementById('btn-delete-all').scrollIntoView({block:'center'})`],
];
// [scene, from, to]: each a little longer than the scene; the cut starts 0.3 s in (scene 5: just before the pause)
const segments = [[2, 0.5, 16.0], [3, 14.2, 29.7], [4, 32.6, 73.1], [6, 75.4, 85.9], [5, 91.1, 115.2], [8, 131, 139.6], [10, 140.3, 149]];

const ff = (args, cwd = ROOT) => { const p = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit', cwd }); if (p.status) throw new Error(`ffmpeg ${args.join(' ')}`); };
const ENC = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
  '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0e1116,setsar=1'];
const list = path.join(FRAMES, 'list.txt');
const CODE_ONLY = process.argv.includes('--code-only'); // rebuild only code.mp4

if (!CODE_ONLY) {
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const plan = {
  dir: FRAMES, fps: FPS, size: [1536, 864], quitAt: 151,
  steps: steps.map(([at, js]) => ({ at, js })),
  segments: segments.map(([n, from, to]) => ({ name: `s${n}`, from, to })),
};
const planFile = path.join(FRAMES, 'plan.json');
fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

console.log('Capturing Judge Mode (about 3 minutes)...');
const electron = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const r = spawnSync(electron, ['.', '--demo'], { cwd: ROOT, env: { ...process.env, PACEPRINT_CAPTURE: planFile }, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', encoding: 'utf8' });
for (const line of `${r.stdout}`.split('\n')) if (line.includes('[capture]')) console.log(line.trim());
const moving = Number(/\[capture-mark\] moving (\d+)/.exec(`${r.stdout}`)?.[1] ?? NaN);
const log = JSON.parse(fs.readFileSync(path.join(FRAMES, 'segments.json'), 'utf8'));

// one clip per captured scene at its real frame rate, then joined in capture order
const parts = [];
let cut = '# written by scripts/capture-judge.mjs\n';
let offset = 0;
for (const [n] of segments) {
  const s = log[`s${n}`];
  if (!s?.frames) throw new Error(`no frames for scene ${n}`);
  const out = path.join(FRAMES, `s${n}.mp4`);
  ff(['-framerate', (s.frames / s.seconds).toFixed(3), '-i', path.join(FRAMES, `s${n}`, '%06d.jpg'), ...ENC, out]);
  parts.push(out);
  // scene 5 starts 2.5 s before the "Paused: Moving" card when it was seen; the others 0.3 s in
  let lead = 0.3;
  if (n === 5) {
    if (Number.isFinite(moving)) {
      const at = (moving - s.startMs) / 1000;
      lead = Math.min(Math.max(0.3, at - 2.5), s.seconds - 15.2);
      console.log(`"Paused: Moving" at ${at.toFixed(1)} s into the scene 5 capture; scene 5 starts at ${lead.toFixed(1)} s`);
    } else console.log('WARNING: "Paused: Moving" was not seen; check scene 5');
  }
  cut += `${n} ${(offset + lead).toFixed(2)}\n`;
  offset += s.seconds;
}
cut += '9 0\n';
fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(RAW, 'judge.mp4')]);
fs.writeFileSync(path.join(RAW, 'cuts.txt'), cut);
}

// scene 9: two code screens (real source text), 4.5 s each
const font = process.platform === 'win32' ? 'C\\:/Windows/Fonts/consola.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'analysis.ts'), 'utf8').split(/\r?\n/);
const at = src.findIndex((l) => l.startsWith('export function detectBeats'));
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').split(/\r?\n/);
const rt = readme.findIndex((l) => l.startsWith('## How it responds to human signals'));
const screens = [
  ['src/core/analysis.ts: every heartbeat found on the pulse waveform', src.slice(at, at + 26)],
  ['README.md: how it responds to human signals', readme.slice(rt + 2, rt + 12).map((l) => l.replace(/\s*\|\s*`?src[^|]*\|\s*$/, '').slice(0, 118))],
];
const codeParts = [];
screens.forEach(([title, lines], i) => {
  const tf = path.join(FRAMES, `code-${i}.txt`), hf = path.join(FRAMES, `code-${i}-h.txt`);
  fs.writeFileSync(tf, lines.join('\n').replace(/\t/g, '  '));
  fs.writeFileSync(hf, title);
  const out = path.join(FRAMES, `code-${i}.mp4`);
  ff(['-f', 'lavfi', '-i', 'color=c=0x0e1116:s=1920x1080:r=30:d=4.5', '-vf',
    `drawtext=fontfile='${font}':expansion=none:textfile='code-${i}-h.txt':fontcolor=0x74c7b4:fontsize=34:x=90:y=70,` +
    `drawtext=fontfile='${font}':expansion=none:textfile='code-${i}.txt':fontcolor=0xebe6dc:fontsize=${i ? 22 : 27}:line_spacing=8:x=90:y=150`,
    ...ENC.slice(0, -2), out], FRAMES);
  codeParts.push(out);
});
fs.writeFileSync(list, codeParts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(RAW, 'code.mp4')]);
console.log(`Wrote ${path.join(RAW, 'judge.mp4')}, cuts.txt and code.mp4. Next: python scripts/assemble-raw-cut.py`);
