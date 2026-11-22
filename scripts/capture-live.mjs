// Records the live app's setup screen for the demo video, with ffmpeg screen capture (gdigrab) of the app
// window's content area only (no title bar, no taskbar). The app itself stores nothing: this is an outside
// screen recording the owner chose to make of themselves (Rule 6 is about what Paceprint saves).
//
//   node scripts/capture-live.mjs            live app (npm start): needs the key and the webcam; uses SDK credits
//   node scripts/capture-live.mjs --demo     Judge Mode, to test the capture without the camera
//   options: --seconds N (default 150)
//
// You click through consent yourself; the recording runs from the moment the window appears, so the clip
// holds consent, then the setup screen. Leave the window in front and don't touch the mouse until it closes.
// Output: video-raw/live-setup.mp4 (gitignored). Pick the scene start in video-raw/cuts.txt (scene 3).
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'video-raw');
const DEMO = process.argv.includes('--demo');
const SECONDS = Number(process.argv[process.argv.indexOf('--seconds') + 1]) || 150;
const OUT = path.join(RAW, DEMO ? 'live-setup-test.mp4' : 'live-setup.mp4');

// client area of the Paceprint window, in physical pixels, clipped to the screen's work area (above the taskbar)
const RECT_PS = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [StructLayout(LayoutKind.Sequential)] public struct R { public int L,T,Rr,B; }
[StructLayout(LayoutKind.Sequential)] public struct P { public int X,Y; }
[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out R r);
[DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool SystemParametersInfo(int a, int b, out R r, int c);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }
"@
[W]::SetProcessDPIAware() | Out-Null
$p = Get-Process | ? { $_.MainWindowTitle -eq 'Paceprint' } | select -First 1
if (-not $p) { exit 1 }
[W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
if ($args[0] -eq 'size') {
  # maximize (the window's minimum size fills this screen anyway) and park the pointer mid-screen, so an
  # auto-hide taskbar stays hidden
  [W]::ShowWindow($p.MainWindowHandle, 3) | Out-Null; Start-Sleep -Milliseconds 800
  [W]::SetCursorPos(960, 500) | Out-Null
}
$c = New-Object W+R; [W]::GetClientRect($p.MainWindowHandle, [ref]$c) | Out-Null
$o = New-Object W+P; [W]::ClientToScreen($p.MainWindowHandle, [ref]$o) | Out-Null
$wa = New-Object W+R; [W]::SystemParametersInfo(0x30, 0, [ref]$wa, 0) | Out-Null
$l = [Math]::Max($o.X, $wa.L); $t = [Math]::Max($o.Y, $wa.T)
$r = [Math]::Min($o.X + $c.Rr, $wa.Rr); $b = [Math]::Min($o.Y + $c.B, $wa.B)
"$l $t $($r - $l) $($b - $t)"
`;
const psFile = path.join(RAW, 'window-rect.ps1');
fs.mkdirSync(RAW, { recursive: true });
fs.writeFileSync(psFile, RECT_PS);
const rect = (size = false) => {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile, ...(size ? ['size'] : [])], { encoding: 'utf8' });
  const m = /^(-?\d+) (-?\d+) (\d+) (\d+)/.exec(r.stdout.trim());
  return r.status === 0 && m ? m.slice(1).map(Number) : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore', shell: true });
const electron = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const app = spawn(electron, ['.', ...(DEMO ? ['--demo'] : [])], { cwd: ROOT, stdio: 'ignore', shell: true });

let r = null;
for (let i = 0; i < 60 && !r; i++) { await sleep(500); r = rect(); }
if (!r) { console.error('Paceprint window not found'); process.exit(1); }
await sleep(1500); // let it paint
r = rect(true);
const [x, y] = r, w = r[2] - (r[2] % 2), h = r[3] - (r[3] % 2);
console.log(`Recording ${SECONDS} s of the window (${w}x${h} at ${x},${y}) -> ${OUT}`);
const ff = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0',
  '-offset_x', String(x), '-offset_y', String(y), '-video_size', `${w}x${h}`, '-t', String(SECONDS), '-i', 'desktop',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', OUT], { stdio: 'inherit' });
// close the window normally, so the app stops the SDK and the camera itself
spawnSync('taskkill', ['/IM', 'electron.exe'], { stdio: 'ignore' });
await sleep(4000);
spawnSync('taskkill', ['/IM', 'electron.exe', '/F'], { stdio: 'ignore' });
console.log(ff.status ? 'ffmpeg failed' : `Done: ${OUT}. The camera is off.`);
