// Electron main process: window, permissions, local store, live SDK session (live mode only).
import * as path from 'node:path';
import * as fs from 'node:fs';
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { loadEnvKey } from './env';
import { Store } from './store';
import type { LiveSdk } from './live-sdk';

const DEMO = process.argv.includes('--demo');
const ROOT = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..', '..');
const NET_AUDIT = process.env.PACEPRINT_NET_AUDIT === '1';
let store: Store;
let win: BrowserWindow | null = null;
let consentGiven = false;
let live: LiveSdk | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 1000, minHeight: 700,
    backgroundColor: '#0e1116',
    title: DEMO ? 'Paceprint · Judge Mode' : 'Paceprint',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // keep camera frames and timers at full rate when the window is behind another one: a throttled
      // window can starve the SDK of frames and end the session (low frame rate / timestamp gap)
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (process.env.PACEPRINT_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  // Dev-only visual check: PACEPRINT_SHOTS="5,20,40" PACEPRINT_SHOT_DIR=... captures PNGs at those
  // seconds; PACEPRINT_AUTOPILOT=1 ticks the consent boxes and presses Accept (Judge Mode only).
  if (process.env.PACEPRINT_SHOTS && process.env.PACEPRINT_SHOT_DIR) {
    const dir = process.env.PACEPRINT_SHOT_DIR;
    const times = process.env.PACEPRINT_SHOTS.split(',').map(Number);
    win.webContents.once('did-finish-load', () => {
      if (process.env.PACEPRINT_AUTOPILOT === '1' && DEMO) {
        setTimeout(() => win?.webContents.executeJavaScript(`document.getElementById('chk-adult').click();document.getElementById('chk-wellness').click();document.getElementById('btn-accept').click();${process.env.PACEPRINT_SPEED ? `document.querySelector('[data-speed="${process.env.PACEPRINT_SPEED}"]').click();` : ''}`), 1500);
      }
      if (process.env.PACEPRINT_EVAL && DEMO) {
        setTimeout(() => win?.webContents.executeJavaScript(process.env.PACEPRINT_EVAL!), Number(process.env.PACEPRINT_EVAL_AT ?? 2.5) * 1000);
      }
      times.forEach((s, i) => setTimeout(async () => {
        const img = await win!.webContents.capturePage();
        fs.writeFileSync(path.join(dir, `shot-${String(i).padStart(2, '0')}-${s}s.png`), img.toPNG());
        if (i === times.length - 1) app.quit();
      }, s * 1000));
    });
  }
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 || process.env.PACEPRINT_DEVTOOLS === '1') console.log(`[renderer] ${message}`);
  });
}

/** The live SDK session, created on demand so Judge Mode never loads the native runtime. */
function liveSdk(): LiveSdk {
  if (live) return live;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LiveSdk: Live } = require('./live-sdk') as typeof import('./live-sdk');
  live = new Live(
    (e) => { if (win && !win.isDestroyed()) win.webContents.send('live:event', e); },
    // preview frames go to our own window only, to be drawn; never stored or sent elsewhere (Rule 6)
    (f) => { if (win && !win.isDestroyed()) win.webContents.send('live:frame', f); },
  );
  return live;
}

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'paceprint-data'));

  // The window never opens the camera or microphone: the SDK captures the camera in this process, after
  // consent, so there is only ever one capture path (Windows won't share a webcam between two).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  // Renderer network log (used for the network audit). Native SDK traffic is audited at OS level.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    if (!/^(file|devtools|blob|data):/.test(details.url)) {
      console.log(`[net] renderer request: ${details.method} ${details.url}`);
      if (NET_AUDIT) fs.appendFileSync(path.join(ROOT, 'recordings', 'net-audit-renderer.log'), `${new Date().toISOString()} ${details.method} ${details.url}\n`);
    }
    cb({});
  });

  ipcMain.handle('app:info', () => ({
    demo: DEMO,
    hasKey: !!loadEnvKey(ROOT),
    version: app.getVersion(),
    platform: process.platform,
    dataDir: store.dir,
  }));
  ipcMain.handle('consent:accept', () => { consentGiven = true; return DEMO ? store.settings() : store.saveSettings({ consentAcceptedAt: new Date().toISOString() }); });
  // The SDK captures the camera itself, in this process (src/main/live-sdk.ts). The key never leaves it.
  ipcMain.handle('live:start', () => {
    if (!consentGiven) throw new Error('Consent required before the camera can start.');
    if (DEMO) throw new Error('Judge Mode never uses the camera.');
    const key = loadEnvKey(ROOT);
    if (!key) throw new Error('NO_KEY');
    return liveSdk().start(key);
  });
  ipcMain.handle('live:stop', () => live?.stop());
  ipcMain.handle('fixture:load', () => {
    const dir = path.join(__dirname, '..', 'fixtures');
    const real = path.join(dir, 'judge-recorded.json');
    const file = fs.existsSync(real) ? real : path.join(dir, 'judge-simulated.json');
    return fs.readFileSync(file, 'utf8');
  });
  ipcMain.handle('store:settings', () => store.settings());
  let demoSettings: Record<string, unknown> = {};
  ipcMain.handle('store:saveSettings', (_e, s) => (DEMO ? { ...store.settings(), ...(demoSettings = { ...demoSettings, ...s }) } : store.saveSettings(s)));
  ipcMain.handle('store:sessions', () => store.listSessions());
  ipcMain.handle('store:saveSession', (_e, s) => (DEMO ? 'demo-not-saved' : store.saveSession(s)));
  ipcMain.handle('store:deleteSession', (_e, id: string) => store.deleteSession(id));
  ipcMain.handle('store:saveStream', (_e, id: string, text: string) => { if (!DEMO && store.settings().saveStreams) store.saveStream(id, text); });
  ipcMain.handle('store:deleteAll', () => { store.deleteAll(); return store.summary(); });
  ipcMain.handle('store:summary', () => store.summary());
  ipcMain.handle('app:openDataFolder', () => { fs.mkdirSync(store.dir, { recursive: true }); return shell.openPath(store.dir); });

  createWindow();
});

app.on('window-all-closed', () => { void (live?.stop() ?? Promise.resolve()).finally(() => app.quit()); });
