// Paceprint renderer controller: one journey (consent → setup → baseline → sweep → result → guided).
// @ts-expect-error -- bundled as text by esbuild (loader .md: text); the same file is the published notice
import consentMd from '../../docs/consent-and-data-handling.md';
import type { StreamEvent, Packet, Sample, Recording } from '../core/types';
import type { CaptureSource } from '../core/capture';
import { ReplaySource } from '../core/capture';
import { Protocol, PhaseName } from '../core/protocol';
import { Pacer } from '../core/pacer';
import { Recorder, parseRecording } from '../core/recorder';
import { SessionHealth, DeadSession, deadSessionScreen } from '../core/session-health';
import { detectBeats, heartRateSeries, coupling, ANALYSIS, StageResult, guidedPace, SweepResult } from '../core/analysis';
import { resample, bandpass } from '../core/dsp';
import { validationMessage } from '../core/validation-codes';
import { CameraSource } from './camera-source';
import { PreviewCanvas } from './preview';
import type { PreviewMode } from '../core/preview-frame';
import { TraceCanvas, measuredChart, feltChart, Span } from './charts';
import { mdToHtml, splitConsent } from './md';

const api = (window as any).paceprint;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ state
let info: { demo: boolean; hasKey: boolean; dataDir: string } = { demo: false, hasKey: false, dataDir: '' };
let settings: { saveStreams: boolean; reducedMotion: boolean; sound: boolean; randomizeOrder: boolean; consentAcceptedAt?: string } = { saveStreams: false, reducedMotion: false, sound: false, randomizeOrder: false };
let protocol: Protocol | null = null;
let source: CaptureSource | null = null;
let replay: ReplaySource | null = null;
let recording: Recording | null = null;
let recorder: Recorder | null = null;
let running = false;
let lastPacketT: number | null = null;
let lastPacketWall = 0;
let latest: { pulse?: Packet['pulseRate']; breath?: Packet['breathRate']; hrv?: Packet['hrv']; code: number; codeT: number } = { code: -1, codeT: -1 };
let invalidSpans: Span[] = [];
let openInvalid: Span | null = null;
let shownPhase: PhaseName | '' = '';
let setupGreenSince: number | null = null;
let swing: { v: number; trusted: boolean; at: number } = { v: NaN, trusted: false, at: -10 };
let guidedFollow: number[] = [];
let lastFollowSample = 0;
let lastPacerPhase = 0;
let resultSaved = false;
let sessionId = '';
let ratingsAhead = new Map<number, number>();
let audio: AudioContext | null = null;

const breathCv = new TraceCanvas($('cv-breath') as HTMLCanvasElement, '#74c7b4', 24);
const pulseCv = new TraceCanvas($('cv-pulse') as HTMLCanvasElement, '#ee8c74', 8);

// ------------------------------------------------------------------ helpers
function show(id: string) {
  for (const s of document.querySelectorAll<HTMLElement>('.screen')) s.hidden = s.id !== id;
}

/** samples with t >= t0 (binary search; arrays are time-ordered) */
function tail(arr: Sample[], t0: number): Sample[] {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t0) lo = m + 1; else hi = m; }
  return arr.slice(lo);
}

function clock(): number {
  if (replay) return replay.time;
  if (lastPacketT === null) return 0;
  return lastPacketT + (performance.now() - lastPacketWall) / 1000;
}

function fmt(v: number | undefined, d = 0) { return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d); }

// ------------------------------------------------------------------ dead SDK session
const health = new SessionHealth();
const wallS = () => performance.now() / 1000;

/** A session-ending SDK error or a silent SDK: camera off, explained on screen, with a way on. */
async function endDeadSession(d: DeadSession) {
  if (!running && !pendingGuided) return;
  running = false;
  $('btn-stop').hidden = true;
  $('rate').hidden = true;
  console.warn(`[camera] session ended: ${d.title}${d.code !== null ? ` (SDK error ${d.code})` : ' (no data from the SDK)'}`);
  await stopSource();
  pendingGuided = false;
  await saveStreamNow();
  const s = deadSessionScreen(d, !!protocol?.result);
  const act = s.action === 'retry' ? () => startSession() : s.action === 'result' ? () => showResult() : () => show('scr-consent');
  message(s.eyebrow, s.title, `${s.text}${streamSavedTo ? ` ${savedNote()}` : ''}`, s.button, act);
}

function message(eyebrow: string, title: string, text: string, btn = 'Start again', action: () => void = () => startSession()) {
  $('msg-eyebrow').textContent = eyebrow;
  $('msg-title').textContent = title;
  $('msg-text').textContent = text;
  const b = $('btn-msg-primary');
  b.textContent = btn;
  b.onclick = action;
  show('scr-message');
}

// ------------------------------------------------------------------ boot
async function boot() {
  info = await api.info();
  settings = await api.settings();
  document.body.classList.toggle('reduced-motion', settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const { short, full } = splitConsent(consentMd);
  $('consent-short').innerHTML = mdToHtml(short);
  $('consent-full').innerHTML = mdToHtml(full);
  if (info.demo) {
    recording = parseRecording(await api.loadFixture());
    $('judge-banner').hidden = false;
    $('judge-kind').textContent = recording.source === 'simulated' ? 'Simulated session' : 'Recorded session';
    $('judge-note').textContent = recording.source === 'simulated'
      ? 'Judge Mode: a modelled person, not live data. No camera, no key, no network.'
      : 'Judge Mode: a real session replayed. No camera, no key, no network.';
    ($('btn-accept') as HTMLButtonElement).textContent = 'Accept and play the recorded session';
    $('camtime').hidden = true;
    const kind = recording.source === 'simulated' ? 'Simulated session' : 'Recorded session';
    $('mini-placeholder').innerHTML = `<span>${kind}<br/><small>no camera in Judge Mode</small></span>`;
    $('preview-placeholder').innerHTML = `<span>${kind}<br/><small>no camera in Judge Mode</small></span>`;
    if (recording.source === 'simulated') { $('pulse-src').textContent = 'simulated in the SDK format, beat by beat'; $('cv-pulse').setAttribute('aria-label', 'Simulated pulse waveform (Judge Mode)'); }
  }
  if (settings.consentAcceptedAt && !info.demo) {
    ($('chk-adult') as HTMLInputElement).checked = true;
    ($('chk-wellness') as HTMLInputElement).checked = true;
  }
  updateAccept();
  show('scr-consent');
  requestAnimationFrame(loop);
}

function updateAccept() {
  ($('btn-accept') as HTMLButtonElement).disabled = !(($('chk-adult') as HTMLInputElement).checked && ($('chk-wellness') as HTMLInputElement).checked);
}
$('chk-adult').addEventListener('change', updateAccept);
$('chk-wellness').addEventListener('change', updateAccept);
$('btn-decline').addEventListener('click', () => {
  $('consent-msg').textContent = 'No problem. The camera stays off. You can close Paceprint, or run Judge Mode (npm run demo) to see a recorded session.';
});
$('btn-accept').addEventListener('click', async () => {
  await api.acceptConsent();
  startSession();
});

// ------------------------------------------------------------------ session lifecycle
async function startSession() {
  await stopSource();
  protocol = new Protocol({ randomizeOrder: settings.randomizeOrder }, info.demo ? 'follow' : 'live', (m) => recorder?.push(m));
  invalidSpans = []; openInvalid = null; shownPhase = ''; setupGreenSince = null; resultSaved = false;
  swing = { v: NaN, trusted: false, at: -10 }; guidedFollow = []; lastPacketT = null;
  latest = { code: -1, codeT: -1 };
  sessionId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  buildStages();
  show('scr-setup');
  running = true;
  $('btn-stop').hidden = false;

  if (info.demo && recording) {
    $('preview').hidden = true; $('preview-placeholder').hidden = false;
    $('preview-mini').hidden = true; $('mini-placeholder').hidden = false;
    ratingsAhead = new Map(recording.events.filter((e): e is Extract<StreamEvent, { type: 'marker' }> => e.type === 'marker' && e.kind === 'rating').map((e) => [e.data.stage, e.data.value]));
    replay = new ReplaySource(recording, currentSpeed());
    source = replay;
    replay.onEnd = () => { running = false; $('btn-stop').hidden = true; };
    await replay.start(onEvent);
    return;
  }

  replay = null;
  // kept in memory for every live session; written to disk only if Save session data is on (saveStreamNow),
  // so turning it on at any point up to the result still saves the whole session
  recorder = new Recorder('camera');
  streamSavedTo = null;
  renderSaveState();
  const cam = new CameraSource(preview, (m) => console.warn('[camera]', m));
  source = cam;
  $('setup-msg').textContent = 'Starting the camera…';
  health.start(wallS());
  try {
    await cam.start(onEvent);
    $('setup-msg').textContent = 'Everything must be green for a few seconds.';
  } catch (e: any) {
    running = false;
    await stopSource();
    const msg = String(e?.message ?? e);
    if (msg.includes('NO_KEY')) message('Setup needed', 'No SmartSpectra API key found.', 'Add SMARTSPECTRA_API_KEY to the .env file (see .env.example and the README), then restart. Without a key you can still run Judge Mode: npm run demo.', 'Back', () => show('scr-consent'));
    else if (/Permission|NotAllowed|NotFound|NotReadable|SDK error 7\)/i.test(msg)) message('Camera', 'The camera could not start.', `Check that no other app is using the camera and that Windows camera access is allowed for desktop apps. (${msg})`);
    else message('Something went wrong', 'Could not start the measurement.', msg);
  }
}

// Live preview: the SDK's own camera frames, drawn on the canvases (never kept: Rule 6). If none arrive,
// a pacer-only screen without the face, chosen automatically (core/preview-frame.ts previewMode).
const PACER_ONLY = '<span>Camera live<br/><small>No preview on this camera path. Follow the checks and the pacer.<br/>Flicker cannot be checked without the preview: use daylight or a steady lamp.</small></span>';
const preview = new PreviewCanvas([$('preview') as HTMLCanvasElement, $('preview-mini') as HTMLCanvasElement], onPreview);
let pacerOnlyLogged = false;
function onPreview(on: boolean, mode: PreviewMode) {
  $('cam-live').hidden = !on;
  const frames = on && mode === 'frames';
  const none = on && mode === 'none';
  $('preview').hidden = !frames; $('preview-mini').hidden = !frames;
  $('preview-placeholder').hidden = frames; $('mini-placeholder').hidden = frames;
  const text = none ? PACER_ONLY : on ? '<span>Camera live<br/><small>Waiting for the preview…</small></span>' : '<span>Camera off</span>';
  $('preview-placeholder').innerHTML = text; $('mini-placeholder').innerHTML = text;
  if (none && !pacerOnlyLogged) { console.warn(`[camera] no preview frames from the SDK; pacer-only screen (flicker check off)`); pacerOnlyLogged = true; }
  if (frames && pacerOnlyLogged) { console.warn('[camera] preview frames arrived; showing the preview'); pacerOnlyLogged = false; }
}

async function stopSource() {
  const s = source;
  source = null;
  health.stop();
  if (s) { try { await s.stop(); } catch { /* ignore */ } }
  $('cam-live').hidden = true;
}

async function stopAll(reason = 'Stopped by you.') {
  running = false;
  $('btn-stop').hidden = true;
  $('rate').hidden = true;
  await stopSource();
  replay = null;
  pendingGuided = false;
  await saveStreamNow();
  if (protocol?.result) { show('scr-result'); return; }
  message('Stopped', 'Camera is off.', `${reason} ${streamSavedTo ? `No result was saved. ${savedNote()}` : 'Nothing from this session was saved.'}`);
}
$('btn-stop').addEventListener('click', () => stopAll());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('panel-data').hidden) { $('panel-data').hidden = true; $('btn-data').focus(); return; }
  if (e.key === 'Escape' && running) stopAll();
  if (!$('rate').hidden && /^[1-5]$/.test(e.key)) pickRating(Number(e.key));
});

function onEvent(e: StreamEvent) {
  if (!protocol) return;
  recorder?.push(e);
  protocol.ingest(e);
  if (e.type === 'packet') {
    lastPacketT = e.p.t; lastPacketWall = performance.now();
    if (!info.demo) health.packet(wallS());
    if (e.p.pulseRate) latest.pulse = e.p.pulseRate;
    if (e.p.breathRate) latest.breath = e.p.breathRate;
    if (e.p.hrv) latest.hrv = e.p.hrv;
  } else if (e.type === 'validation') {
    latest.code = e.code; latest.codeT = e.t;
  } else if (e.type === 'error' && !info.demo) {
    // any SDK error ends the session (terminal state), retryable or not: explain it on screen
    health.error(e.code, e.message, e.retryable);
    const d = health.check(wallS());
    if (d) void endDeadSession(d);
  }
}

// ------------------------------------------------------------------ judge speed
function currentSpeed() { return Number(document.querySelector<HTMLButtonElement>('.speed button.on')?.dataset.speed ?? 12); }
for (const b of document.querySelectorAll<HTMLButtonElement>('.speed button')) {
  b.addEventListener('click', () => {
    document.querySelectorAll('.speed button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    if (replay && !(protocol?.phase.name === 'result')) replay.speed = Number(b.dataset.speed);
    heldSpeed = Number(b.dataset.speed);
  });
}

// ------------------------------------------------------------------ main loop
let lastHeavy = 0;
function loop(now: number) {
  requestAnimationFrame(loop);
  if (!info.demo && (running || pendingGuided)) { const d = health.check(wallS()); if (d) void endDeadSession(d); }
  if (!protocol) return;
  const t = clock();
  protocol.tick(t);
  trackInvalid(t);
  const ph = protocol.phase.name;
  if (pendingGuided && ph === 'result' && protocol.verdict.ok) { pendingGuided = false; protocol.startGuided(); }
  if (ph !== shownPhase) enterPhaseUi(ph);
  if (ph === 'setup') renderSetup(t);
  else if (ph === 'baseline' || ph === 'settle' || ph === 'measure' || ph === 'guided') renderSession(t, now - lastHeavy > 33);
  if (now - lastHeavy > 33) lastHeavy = now;
}

function trackInvalid(t: number) {
  if (!protocol) return;
  if (protocol.refusing) {
    if (!openInvalid) { openInvalid = { a: t, b: t }; invalidSpans.push(openInvalid); }
    openInvalid.b = t;
  } else openInvalid = null;
  if (invalidSpans.length > 200) invalidSpans.splice(0, 100);
}

function enterPhaseUi(ph: PhaseName) {
  shownPhase = ph;
  $('rate').hidden = ph !== 'rate';
  if (ph === 'setup') show('scr-setup');
  else if (ph === 'baseline' || ph === 'settle' || ph === 'measure' || ph === 'guided') { show('scr-session'); $('btn-end-guided').hidden = ph !== 'guided' || info.demo; }
  else if (ph === 'rate') showRating();
  else if (ph === 'result') showResult();
  else if (ph === 'done') showDone();
  buildStages();
}

// ------------------------------------------------------------------ setup check
// `warn` items are shown but never block Start (the talking flag: docs/decisions.md, Rule 8 decision)
const CHECKS: { id: string; label: string; warn?: boolean; bad: (codes: number, reasons: Set<string>) => boolean }[] = [
  { id: 'signal', label: 'Signal flowing from the SDK', bad: (_c, r) => r.has('lost') },
  { id: 'face', label: 'Face in view and centred', bad: (c, r) => r.has('noface') || [1, 2, 3, 4, 13, 14, 15, 16, 17].includes(c) },
  { id: 'chest', label: 'Chest in view', bad: (c) => c === 7 },
  { id: 'light', label: 'Even, steady light', bad: (c, r) => [5, 6].includes(c) || r.has('flicker') },
  { id: 'still', label: 'Holding still', bad: (c, r) => c === 12 || r.has('motion') || c === 10 },
  { id: 'quiet', label: 'Not talking (camera check; a warning only)', warn: true, bad: (_c, r) => r.has('talking') },
  { id: 'pulse', label: 'Pulse reading started (takes about 40 s)', bad: (_c, r) => r.has('warming') || r.has('nopulse') },
];

// sticky: the SDK may report a state once and keep it until it changes
function currentCode(_t: number) { return latest.code >= 0 ? latest.code : (lastPacketT === null && !replay ? 1 : 0); }

/** refusal reasons plus warnings, for the checks' `bad` tests */
function verdictIds(): Set<string> {
  return new Set([...protocol!.verdict.reasons, ...protocol!.verdict.warnings].map((r) => r.id));
}

function renderSetup(t: number) {
  if (!protocol) return;
  const reasons = verdictIds();
  const code = currentCode(t);
  const noData = lastPacketT === null;
  const items = CHECKS.map((c) => ({ ...c, ok: !noData && !c.bad(code, reasons) }));
  const hint = (id: string) => {
    if (noData) return 'waiting…';
    if (id === 'face' || id === 'chest' || id === 'still' || id === 'light') return code ? validationMessage(code).tip : '';
    const r = [...protocol!.verdict.reasons, ...protocol!.verdict.warnings].find((x) => (id === 'quiet' ? x.id === 'talking' : id === 'pulse' ? x.id === 'warming' || x.id === 'nopulse' : x.id === id));
    return r?.tip ?? '';
  };
  $('checklist').innerHTML = items.map((i) => `<li class="${i.ok ? 'ok' : i.warn && !noData ? 'warn' : ''}">${i.label}${i.ok ? '' : `<span class="hint">${escapeHtml(hint(i.id))}</span>`}</li>`).join('');
  $('setup-chips').innerHTML = chipsHtml(t);
  renderWarmup('warmup-setup');
  const allOk = items.every((i) => i.ok || i.warn) && protocol.verdict.ok;
  if (allOk) setupGreenSince ??= t; else setupGreenSince = null;
  const ready = setupGreenSince !== null && t - setupGreenSince >= 3;
  const confirm = $('confirm-still') as HTMLInputElement;
  if (info.demo) { confirm.checked = true; confirm.disabled = true; }
  const b = $('btn-begin') as HTMLButtonElement;
  const wasDisabled = b.disabled;
  b.disabled = !ready || !confirm.checked || info.demo;
  if (wasDisabled && !b.disabled) b.focus();
  if (info.demo) $('setup-msg').textContent = recording?.source === 'simulated' ? 'Simulated session: the modelled person starts once everything is green.' : 'Recorded session: the person pressed Start when everything was green.';
  else $('setup-msg').textContent = ready ? (confirm.checked ? 'All green. Press Start when you are comfortable.' : "All green. Tick \u201cI'll stay silent and still\u201d to start.") : allOk ? 'Hold it there…' : 'Everything must be green for a few seconds.';
}
$('btn-begin').addEventListener('click', () => { if (($('confirm-still') as HTMLInputElement).checked) protocol?.beginBaseline(); });

function escapeHtml(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

function chipsHtml(t: number): string {
  if (!protocol) return '';
  const reasons = verdictIds();
  const code = currentCode(t);
  const noData = lastPacketT === null;
  return CHECKS.map((c) => {
    const short = { signal: 'Signal', face: 'Face', chest: 'Chest', light: 'Light', still: 'Still', quiet: 'Quiet', pulse: 'Pulse' }[c.id];
    const cls = noData ? 'idle' : c.bad(code, reasons) ? (c.warn ? 'warn' : 'bad') : '';
    return `<span class="chip ${cls}">${short}</span>`;
  }).join('');
}

function renderWarmup(id: string) {
  if (!protocol) return;
  $(id).innerHTML = protocol.warmup().map((w) => `<div class="wu ${w.progress >= 1 ? 'full' : ''}" title="${w.label}: needs ${w.seconds} s of steady data before it is trusted">${w.label} ${w.seconds}s<div class="track"><div class="fill" data-p="${w.progress}"></div></div></div>`).join('');
  for (const f of $(id).querySelectorAll<HTMLElement>('.fill')) f.style.width = `${Number(f.dataset.p) * 100}%`;
}

// ------------------------------------------------------------------ stages strip
function buildStages() {
  const p = protocol;
  if (!p) return;
  const ph = p.phase;
  const items: { label: string; cls: string }[] = [];
  const baselineDone = ph.name !== 'setup' && ph.name !== 'baseline';
  items.push({ label: 'Baseline', cls: ph.name === 'baseline' ? 'now' : baselineDone ? 'done' : '' });
  p.order.forEach((bpm, i) => {
    const inSweep = ph.name === 'settle' || ph.name === 'measure' || ph.name === 'rate';
    const now = inSweep && ph.stage === i;
    const done = (inSweep && ph.stage > i) || ['result', 'guided', 'done'].includes(ph.name);
    items.push({ label: `${bpm.toFixed(1)}/min`, cls: now ? 'now' : done ? 'done' : '' });
  });
  items.push({ label: 'Result', cls: ph.name === 'result' ? 'now' : ['guided', 'done'].includes(ph.name) ? 'done' : '' });
  if (ph.name === 'guided' || ph.name === 'done') items.push({ label: 'Guided', cls: ph.name === 'guided' ? 'now' : 'done' });
  $('stages').innerHTML = items.map((i) => `<li class="${i.cls}">${i.label}</li>`).join('');
}

// ------------------------------------------------------------------ session view
function renderSession(t: number, heavy: boolean) {
  const p = protocol!;
  const ph = p.phase;
  const lost = p.verdict.reasons.some((r) => r.id === 'lost');
  const refusing = p.refusing;
  const pacerEl = $('pacer');
  pacerEl.classList.toggle('frozen', lost);
  pacerEl.classList.toggle('refusing', refusing && !lost);

  // pacer
  const phase = lost ? lastPacerPhase : p.pacerPhase;
  if (!lost && ph.bpm > 0 && settings.sound && phase < lastPacerPhase) chime();
  lastPacerPhase = phase;
  const fill = ph.bpm > 0 ? Pacer.fill(phase) : 0.5 + 0.08 * Math.sin(t * 0.8);
  const orb = $('orb');
  if (document.body.classList.contains('reduced-motion')) { orb.setAttribute('r', '100'); orb.style.opacity = String(0.35 + 0.65 * fill); }
  else orb.setAttribute('r', String(58 + 62 * fill));
  const label = lost ? 'Signal lost' : ph.bpm > 0 ? Pacer.label(phase) : 'Breathe normally';
  $('pacer-label').textContent = label;
  const rem = Math.ceil(p.remaining());
  let sub = '';
  if (ph.name === 'baseline') sub = refusing ? 'Paused' : `${rem} s of steady data to go`;
  else if (ph.name === 'settle') sub = `Settling in · ${rem} s (not measured)`;
  else if (ph.name === 'measure') sub = refusing ? 'Paused' : `Measuring · ${rem} s left`;
  else if (ph.name === 'guided') sub = `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')} left`;
  $('pacer-sub').textContent = sub;

  const n = p.order.length;
  $('phase-title').textContent = ph.name === 'baseline' ? 'Baseline: breathe as you normally do'
    : ph.name === 'guided' ? `Guided session at ${ph.bpm} breaths a minute`
    : `Pace ${ph.stage + 1} of ${n}: ${ph.bpm.toFixed(1)} breaths a minute`;
  $('phase-sub').textContent = ph.name === 'baseline' ? 'This gives Paceprint your own starting point. No guide yet.'
    : ph.name === 'settle' ? 'Follow the circle. The first 30 seconds let your body settle and are not measured.'
    : ph.name === 'measure' ? 'Keep following. Stay still and quiet.'
    : bellyHint || 'Breathe with the circle. Gently, no forcing.';

  // refusal card
  const ref = $('refusal');
  if (refusing) {
    const r = p.verdict.reasons[0];
    ref.hidden = false;
    $('refusal-title').textContent = lost ? 'Signal lost' : r.id === 'settling' ? 'Settling' : `Paused: ${r.short}`;
    $('refusal-tip').textContent = r.tip;
  } else ref.hidden = true;
  const talkWarn = p.verdict.warnings.find((w) => w.id === 'talking');
  $('talk-warn').hidden = !talkWarn;
  if (talkWarn) $('talk-warn-tip').textContent = talkWarn.tip;

  // follow ring
  if (heavy && t - lastFollowSample > 1) {
    lastFollowSample = t;
    const f = p.liveFollow();
    const ring = $('ring-follow');
    ring.style.strokeDashoffset = String(867 * (1 - (Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0)));
    ring.style.stroke = f >= 0.6 ? 'var(--breath)' : 'var(--warn)';
    if (ph.name === 'guided' && Number.isFinite(f) && p.verdict.ok) guidedFollow.push(f);
    ring.setAttribute('aria-label', `Follow score ${Number.isFinite(f) ? Math.round(f * 100) : 0} percent`);
  }
  if (heavy && t - swing.at > 2) updateSwing(t);
  if (heavy && ph.name === 'guided' && t - bellyAt > 5) updateBelly(t);

  if (!heavy) return;
  $('chips').innerHTML = chipsHtml(t);
  renderReadouts(t);
  renderWarmup('warmup');
  const breath = p.lower.length ? p.lower : p.upper;
  breathCv.draw(tail(breath, t - 25), t, { ghost: tail(p.pacerFill, t - 25), invalid: invalidSpans, frozen: lost });
  pulseCv.draw(tail(p.pressure, t - 9), t, { invalid: invalidSpans, frozen: lost, label: lost ? 'Signal lost' : !p.hasCardio ? 'Pulse not available' : undefined });
}

let bellyHint = '';
let bellyAt = -10;
/** Belly-first coaching: compare chest vs belly trace movement at the guide pace over the last 20 s of clean data. */
function updateBelly(t: number) {
  const p = protocol!;
  bellyAt = t;
  const a = t - 20, f0 = p.phase.bpm / 60;
  if (!p.verdict.ok || invalidSpans.some((s) => s.b > a) || !p.upper.length || !p.lower.length) { bellyHint = ''; return; }
  const amp = (arr: Sample[]) => { const x = bandpass(resample(tail(arr, a - 1), a, t, 10), 10, f0 * 0.5, f0 * 2); return Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length); };
  const chest = amp(p.upper), belly = amp(p.lower);
  if (!(chest > 0) || !(belly > 0)) { bellyHint = ''; return; }
  const r = chest / belly;
  bellyHint = r > 1.2 ? 'Most of the movement is in your chest. Let your belly lead: breathe low and slow, chest quiet.'
    : r < 0.8 ? 'Nice: your belly is leading the breath. Keep it soft.' : '';
}

/** Paceprint's own beat-to-beat heart-rhythm swing over the last 30 s, only when all 30 s were valid. */
function updateSwing(t: number) {
  const p = protocol!;
  swing.at = t;
  const bpm = p.phase.bpm;
  const a = t - 30;
  const clean = bpm > 0 && p.hasCardio && !invalidSpans.some((s) => s.b > a) && p.now - (p.phase.start) > 30;
  if (!clean) { swing.trusted = false; return; }
  const beats = detectBeats(tail(p.pressure, a - 1), a, t);
  const hr = heartRateSeries(beats, a, t);
  if (!hr || hr.kept < 0.8 || hr.hr.some((v) => !Number.isFinite(v))) { swing.trusted = false; return; }
  const breath = resample(tail(p.lower.length ? p.lower : p.upper, a - 1), a, t, ANALYSIS.hrFs);
  const c = coupling(hr.hr, breath, ANALYSIS.hrFs, bpm / 60);
  swing = { v: c.amplitude, trusted: Number.isFinite(c.amplitude), at: t };
}

function renderReadouts(t: number) {
  const p = protocol!;
  const wu = Object.fromEntries(p.warmup().map((w) => [w.id, w.progress >= 1]));
  const ok = p.verdict.ok;
  const origin = info.demo && recording?.source === 'simulated' ? 'simulated' : 'SDK';
  const ro = (k: string, v: string, unit: string, trusted: boolean, src: string) =>
    `<div class="ro ${trusted ? '' : 'notread'}" title="${src}"><div class="k">${k}</div><div class="v">${trusted ? v : '—'} <small>${unit}</small></div><span class="s ${trusted ? '' : 'no'}">${trusted ? 'Trusted' : 'Not read'}</span></div>`;
  const pulseOk = !!latest.pulse && latest.pulse.stable && ok && wu.pulse && t - latest.pulse.t < 5;
  const brOk = !!latest.breath && latest.breath.conf >= 45 && ok && wu.breathing && t - latest.breath.t < 5;
  const hrvOk = !!latest.hrv && latest.hrv.stable && ok && wu.hrv && t - latest.hrv.t < 5;
  $('readouts').innerHTML =
    ro(`Pulse (${origin}, 12 s avg)`, fmt(latest.pulse?.v), 'bpm', pulseOk, 'SDK pulse rate; trusted when confidence ≥ 40, data valid and 12 s window full') +
    ro(`Breathing (${origin}, 30 s)`, fmt(latest.breath?.v, 1), '/min', brOk, 'SDK breathing rate; trusted when confidence ≥ 45 and 30 s window full') +
    ro('Heart-rhythm swing', fmt(swing.v, 1), 'bpm', swing.trusted, 'Paceprint: beat-by-beat heart rate from the pulse waveform, swing at the guide pace over the last 30 s of clean data') +
    ro(origin === 'SDK' ? 'HRV (RMSSD, 60 s)' : 'HRV (simulated, 60 s)', fmt(latest.hrv?.rmssd), 'ms', hrvOk, 'SDK HRV; trusted when confidence ≥ 50 and 60 s window full');
}

function chime() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 392; o.type = 'sine';
    g.gain.setValueAtTime(0, audio.currentTime);
    g.gain.linearRampToValueAtTime(0.05, audio.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 1.2);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 1.3);
  } catch { /* audio unavailable */ }
}

// ------------------------------------------------------------------ rating
function showRating() {
  const p = protocol!;
  const stage = p.phase.stage;
  $('rate-pace').textContent = `${p.order[stage].toFixed(1)} breaths a minute · pace ${stage + 1} of ${p.order.length}`;
  for (const b of $('rate-buttons').querySelectorAll('button')) b.classList.remove('picked');
  if (info.demo) {
    const v = ratingsAhead.get(stage);
    $('rate-note').textContent = `Recorded answer: ${v ?? '?'}`;
    if (v) $('rate-buttons').querySelector(`[data-v="${v}"]`)?.classList.add('picked');
  } else {
    $('rate-note').textContent = 'Press 1 to 5. Your answer sits beside the measurement in the result.';
    ($('rate-buttons').querySelector('[data-v="3"]') as HTMLButtonElement)?.focus();
  }
}
function pickRating(v: number) {
  if (info.demo || !protocol) return;
  $('rate-buttons').querySelector(`[data-v="${v}"]`)?.classList.add('picked');
  setTimeout(() => protocol?.rate(v), 180);
}
for (const b of $('rate-buttons').querySelectorAll<HTMLButtonElement>('button')) b.addEventListener('click', () => pickRating(Number(b.dataset.v)));

// ------------------------------------------------------------------ result
const CERT: Record<string, [string, string]> = {
  clear: ['Clear peak', 'One pace stood out above the others.'],
  weak: ['Weak peak', 'One pace was a little better. Treat it as a starting point.'],
  flat: ['No clear peak', 'No pace stood out clearly enough to name one. That is a real result.'],
  insufficient: ['Not enough good data', 'Too few paces gave trustworthy data.'],
};

function showResult() {
  const p = protocol!;
  if (!p.result) p.computeResult();
  const r = p.result!;
  show('scr-result');
  const best = r.bestPace;
  $('res-title').textContent = r.certainty === 'insufficient' ? 'No reliable result today'
    : r.certainty === 'flat' ? 'No clear favourite pace today'
    : `About ${best} breaths a minute`;
  $('res-expl').textContent = r.explanation;
  const [ct, cs] = CERT[r.certainty];
  $('res-cert').className = `cert ${r.certainty}`;
  $('res-cert').innerHTML = `<b>${ct}</b><span>${cs}</span><br/><span>${r.mode === 'coupling' ? (info.demo && recording?.source === 'simulated' ? 'From beat-by-beat pulse timing (simulated pressure waveform).' : 'From beat-by-beat pulse timing (SDK pressure waveform).') : 'Breathing only: pulse data was not reliable or not available.'}</span>`;
  $('chart-measured').innerHTML = measuredChart(r);
  $('chart-felt').innerHTML = feltChart(r);
  $('res-spread').textContent = spreadNote(r);
  const rows = p.stageResults.map((s) => stageRow(s, r.bestPace));
  $('res-table').innerHTML = `<thead><tr><th>Pace</th><th>Follow score</th><th>Time to lock</th><th>Heart-rhythm swing</th><th>Coupling (PLV)</th><th>Felt</th><th title="Share of trusted measuring time the camera flagged as talking">Talking flag</th><th>Status</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  $('res-talk').textContent = talkNote(p.stageResults, r.bestPace);
  const b = p.baselineResult;
  $('res-baseline').textContent = b?.coupling
    ? `Baseline (your normal breathing): heart-rhythm swing ${b.coupling.amplitude.toFixed(1)} bpm, average pulse ${b.coupling.meanHr.toFixed(0)} bpm.${r.vsBaseline ? ` At the best pace the swing was ${r.vsBaseline.toFixed(1)}× your baseline.` : ''}`
    : b?.status === 'excluded' ? `Baseline not read: ${b.reason}` : '';
  const gpNum = r.certainty === 'insufficient' ? null : guidedPace(r);
  const gp = gpNum === null ? null : gpNum % 1 === 0 ? gpNum.toFixed(1) : String(gpNum);
  ($('btn-guided') as HTMLButtonElement).textContent = `Start 5-minute guided session${gp ? ` at ${gp}/min` : ''}`;
  if (r.certainty === 'flat' && gp) $('res-expl').textContent += ` The guided session uses ${gp}/min, the pace you found easiest and followed well.`;
  ($('btn-guided') as HTMLButtonElement).hidden = info.demo ? !running : false;
  if (!info.demo && source) void pauseCameraForResult();
  if (info.demo && replay) { heldSpeed = replay.speed; replay.speed = 0; ($('btn-guided') as HTMLButtonElement).textContent = 'Play the recorded guided session'; }
  saveSummary().then(renderHistory);
}

/** The real spread behind the curve, in bpm, and whether phase locking could tell paces apart. */
function spreadNote(r: SweepResult): string {
  if (r.mode !== 'coupling' || !r.checks.spread) return r.mode === 'coupling' ? '' : 'Breathing-only score: follow score and felt ease combined (0 to 1).';
  const c = r.checks;
  let t = `Axis starts at 0. Swing across paces: ${c.spread!.min.toFixed(1)} to ${c.spread!.max.toFixed(1)} bpm.`;
  if (c.wobble !== null) t += ` Bars show the three 30-second parts of each pace (typical wobble ±${c.wobble.toFixed(1)} bpm).`;
  if (c.plvSaturated && c.plvRange) t += ` Phase locking was ${c.plvRange.min.toFixed(2)} to ${c.plvRange.max.toFixed(2)} at every pace, too similar to tell paces apart, so the ranking uses swing alone.`;
  return t;
}

/** Audit line for the talking flag: it never removes data or changes the ranking, so the result says how much of each pace it flagged. */
function talkNote(stages: StageResult[], best: number | null): string {
  const read = stages.filter((s) => s.status !== 'excluded' && Number.isFinite(s.talkShare));
  if (!read.length) return '';
  const cav = read.filter((s) => s.talkCaveat);
  let t = `Talking flag: the share of each pace's trusted measuring time the camera flagged as talking. It does not remove data or change the ranking, because in our tests it also fired during silence. Paces at ${Math.round(ANALYSIS.talkCaveat * 100)}% or more are marked caveated.`;
  if (cav.length) {
    t += ` Caveated: ${cav.map((s) => `${s.bpm.toFixed(1)}/min`).join(', ')}. If you were silent, it was likely a false alarm; if you talked, treat ${cav.length === 1 ? 'that pace' : 'those paces'} with caution.`;
    if (best !== null && cav.some((s) => Math.abs(s.bpm - best) < 0.26)) t += ' Your best pace is one of them.';
  } else t += ' No pace was caveated.';
  return t;
}

/** Time to lock, read only from trusted time: a refused stretch is never turned into a number. */
function lockCell(s: StageResult): string {
  if (s.lockStatus === 'untrusted') return '<span class="muted" title="No 15-second stretch of trusted data in this pace">not enough trusted data</span>';
  if (!Number.isFinite(s.lockTime)) return '<span title="Did not lock during trusted time">—</span>';
  const v = `${Math.round(s.lockTime)} s`;
  return s.lockStatus === 'bound' ? `<span title="Lock was first seen after a refused stretch, so it happened by this time at the latest">≤ ${v}</span>` : v;
}

function talkCell(s: StageResult): string {
  if (s.status === 'excluded' || !Number.isFinite(s.talkShare)) return '—';
  const pct = `${Math.round(s.talkShare! * 100)}%`;
  return s.talkCaveat ? `<span class="caveat" title="Flagged for ${pct} of this pace's trusted time: treat with caution if you talked">${pct} · caveated</span>` : pct;
}

function stageRow(s: StageResult, best: number | null): string {
  const excl = s.status === 'excluded';
  const isBest = !excl && best !== null && Math.abs(s.bpm - best) < 0.26;
  return `<tr class="${excl ? 'excl' : ''} ${isBest ? 'best' : ''} ${!excl && s.talkCaveat ? 'caveat' : ''}"><td>${s.bpm.toFixed(1)}/min</td><td>${Number.isFinite(s.adherence) ? Math.round(s.adherence * 100) + '%' : '—'}</td><td>${lockCell(s)}</td><td>${s.coupling ? s.coupling.amplitude.toFixed(1) + ' bpm' : '—'}${!excl && s.blocks.some((b) => Number.isFinite(b.amplitude)) ? ` <span class="parts" title="the same measure in each 30-second part">(${s.blocks.map((b) => (Number.isFinite(b.amplitude) ? b.amplitude.toFixed(1) : '–')).join(' · ')})</span>` : ''}</td><td>${s.coupling ? s.coupling.plv.toFixed(2) : '—'}</td><td>${s.felt ?? '—'}</td><td>${talkCell(s)}</td><td>${excl ? `Not read: ${escapeHtml(s.reason ?? '')}` : s.talkCaveat ? 'Trusted, caveated' : 'Trusted'}</td></tr>`;
}

async function saveSummary() {
  if (resultSaved || info.demo || !protocol?.result) return;
  resultSaved = true;
  const p = protocol;
  const strip = (s: StageResult | null) => s && ({ id: s.id, bpm: s.bpm, status: s.status, reason: s.reason, validSeconds: Math.round(s.validSeconds), adherence: s.adherence, lockTime: s.lockTime, lockStatus: s.lockStatus, felt: s.felt, swing: s.coupling?.amplitude, plv: s.coupling?.plv, meanHr: s.coupling?.meanHr, talkShare: s.talkShare, talkCaveat: s.talkCaveat });
  await api.saveSession({
    id: sessionId, createdAt: new Date().toISOString(), mode: p.result!.mode, bestPace: p.result!.bestPace, certainty: p.result!.certainty,
    vsBaseline: p.result!.vsBaseline, baseline: strip(p.baselineResult), stages: p.stageResults.map(strip),
  });
  await saveStreamNow();
}

let heldSpeed = 0;
$('btn-guided').addEventListener('click', () => {
  if (info.demo && replay) { replay.speed = heldSpeed || currentSpeed(); return; }
  void startGuidedLive();
});
$('btn-again').addEventListener('click', () => (info.demo ? startSession() : running ? (protocol = null, startSession()) : startSession()));
$('btn-end-guided').addEventListener('click', () => protocol?.finishGuided());

// ------------------------------------------------------------------ done
function showDone() {
  const p = protocol!;
  show('scr-done');
  const mins = Math.max(0, Math.round((p.now - (p.phase.start - 0)) / 60));
  const avg = guidedFollow.length ? guidedFollow.reduce((a, b) => a + b, 0) / guidedFollow.length : NaN;
  const lastBpm = p.cfg.paces.length ? (p.result ? (p.result.bestPace ?? 6) : 6) : 6;
  $('done-text').textContent = `Guided breathing finished${Number.isFinite(avg) ? `, with an average follow score of ${Math.round(avg * 100)}%` : ''}. ${info.demo ? ' (Judge Mode saves nothing.)' : ' Your result is saved on this computer only.'}${mins ? '' : ''}`;
  void lastBpm;
  if (!info.demo) stopAll('Session finished.').then(() => show('scr-done'));
}
$('btn-back-result').addEventListener('click', () => { if (protocol?.result) show('scr-result'); });

// ------------------------------------------------------------------ your data
async function refreshData() {
  const sum = await api.dataSummary();
  $('data-dir').textContent = sum.dir;
  $('data-demo-note').hidden = !info.demo;
  $('data-summary').textContent = `${sum.sessions} saved session${sum.sessions === 1 ? '' : 's'}, ${sum.recordings} signal recording${sum.recordings === 1 ? '' : 's'}.`;
  ($('set-streams') as HTMLInputElement).checked = settings.saveStreams;
  ($('set-motion') as HTMLInputElement).checked = settings.reducedMotion;
  ($('set-sound') as HTMLInputElement).checked = settings.sound;
  ($('set-random') as HTMLInputElement).checked = settings.randomizeOrder;
  const sessions: any[] = await api.sessions();
  $('session-list').innerHTML = sessions.length ? sessions.map((s) => `<li><span>${new Date(s.createdAt).toLocaleString()} · ${s.bestPace ? `best ≈ ${s.bestPace}/min (${s.certainty})` : 'no clear result'}</span><button class="danger" data-del="${escapeHtml(String(s.id))}"${info.demo ? ' disabled title="Deleting is off in Judge Mode"' : ''}>Delete</button></li>`).join('') : '<li class="muted">No saved sessions.</li>';
  for (const b of $('session-list').querySelectorAll<HTMLButtonElement>('[data-del]')) b.addEventListener('click', async () => { await api.deleteSession(b.dataset.del); refreshData(); });
  // Judge Mode never deletes (main refuses too): these are the real sessions on this computer
  ($('btn-delete-all') as HTMLButtonElement).disabled = info.demo;
  if (info.demo) $('delete-msg').textContent = 'Deleting is off in Judge Mode, so your real saved sessions are safe. Use npm start to delete.';
}
$('btn-data').addEventListener('click', () => { const d = $('panel-data'); d.hidden = !d.hidden; if (!d.hidden) { refreshData(); d.focus(); } });
$('btn-close-data').addEventListener('click', () => { $('panel-data').hidden = true; });
$('btn-open-folder').addEventListener('click', () => api.openDataFolder());
let deleteArmed = false;
$('btn-delete-all').addEventListener('click', async () => {
  const b = $('btn-delete-all');
  if (!deleteArmed) { deleteArmed = true; b.textContent = 'Click again to delete everything'; setTimeout(() => { deleteArmed = false; b.textContent = 'Delete everything'; }, 4000); return; }
  deleteArmed = false; b.textContent = 'Delete everything';
  const after = await api.deleteAll();
  settings = await api.settings();
  $('delete-msg').textContent = after.exists ? 'Some files could not be deleted. Use "Open folder" to remove them.' : 'Done. Every Paceprint file on this computer has been deleted.';
  refreshData();
});
async function setSetting(k: keyof typeof settings, v: boolean) {
  settings = await api.saveSettings({ [k]: v });
  document.body.classList.toggle('reduced-motion', settings.reducedMotion);
}
$('set-streams').addEventListener('change', async (e) => {
  await setSetting('saveStreams', (e.target as HTMLInputElement).checked);
  // switched on after the result: save the session now (it is saved at the result otherwise)
  if (settings.saveStreams && protocol?.result) await saveStreamNow();
  renderSaveState();
});
$('set-motion').addEventListener('change', (e) => setSetting('reducedMotion', (e.target as HTMLInputElement).checked));
$('set-sound').addEventListener('change', (e) => setSetting('sound', (e.target as HTMLInputElement).checked));
$('set-random').addEventListener('change', (e) => setSetting('randomizeOrder', (e.target as HTMLInputElement).checked));

// ------------------------------------------------------------------ flicker probe (live only)
const probe = document.createElement('canvas');
probe.width = 16; probe.height = 9;
const pctx = probe.getContext('2d', { willReadFrequently: true })!;
const lumas: number[] = [];
setInterval(() => {
  if (!protocol || info.demo) return;
  // reads the SDK preview frames; with no preview (pacer-only screen) flicker can't be checked
  if (!preview.hasFrames) { lumas.length = 0; return; }
  pctx.drawImage($('preview') as HTMLCanvasElement, 0, 0, 16, 9);
  const d = pctx.getImageData(0, 0, 16, 9).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  lumas.push(s / (d.length / 4));
  if (lumas.length > 30) lumas.shift();
  if (lumas.length < 10) return;
  const diffs = lumas.slice(1).map((x, i) => x - lumas[i]);
  const m = lumas.reduce((a, b) => a + b, 0) / lumas.length;
  const sd = Math.sqrt(diffs.reduce((a, b) => a + b * b, 0) / diffs.length);
  protocol.validity.setFlicker(Math.min(1, sd / Math.max(1, m) / 0.02));
}, 66);

boot().catch((e) => message('Something went wrong', 'Paceprint could not start.', String(e?.message ?? e)));

// ------------------------------------------------------------------ return visits (own history only)
async function renderHistory() {
  const el = $('res-history');
  if (info.demo || !protocol?.result) { el.hidden = true; return; }
  const past: any[] = (await api.sessions()).filter((s: any) => s.id !== sessionId).slice(0, 6).reverse();
  if (!past.length) { el.hidden = true; return; }
  const r = protocol.result;
  const item = (date: string, pace: number | null, cert: string, now = false) =>
    `<li class="${now ? 'now' : ''}">${escapeHtml(date)} · ${pace && cert !== 'flat' && cert !== 'insufficient' ? `${pace}/min` : 'no clear peak'}${cert === 'weak' ? ' (weak)' : ''}</li>`;
  const clear = past.filter((s) => s.bestPace && (s.certainty === 'clear' || s.certainty === 'weak')).map((s) => s.bestPace as number);
  let note = '';
  if (clear.length >= 2 && r.bestPace) {
    const spread = Math.max(...clear, r.bestPace) - Math.min(...clear, r.bestPace);
    note = spread <= 0.5 ? 'Your best pace has been consistent across visits.' : 'Your best pace has varied between visits. Sleep, stress and time of day can shift it; the most common value is a sensible default.';
  }
  el.innerHTML = `<strong>Your past results</strong> <span class="muted">(compared only with you)</span><ol>${past.map((s) => item(new Date(s.createdAt).toLocaleDateString(), s.bestPace, s.certainty)).join('')}${item('Today', r.bestPace, r.certainty, true)}</ol>${note ? `<p class="muted small">${note}</p>` : ''}`;
  el.hidden = false;
}

// ------------------------------------------------------------------ Pace Card (PNG, only when the user asks)
function paceCard(): HTMLCanvasElement {
  const r = protocol!.result!;
  const cv = document.createElement('canvas');
  cv.width = 1200; cv.height = 630;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 1200, 630);
  g.addColorStop(0, '#0e1116'); g.addColorStop(1, '#14211e');
  c.fillStyle = g; c.fillRect(0, 0, 1200, 630);
  c.fillStyle = '#74c7b4'; c.beginPath(); c.arc(84, 84, 16, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ebe6dc'; c.font = '600 28px "Segoe UI", system-ui, sans-serif'; c.fillText('Paceprint', 112, 94);
  c.fillStyle = '#8d96a3'; c.font = '20px "Segoe UI", system-ui, sans-serif';
  c.fillText(`${new Date().toLocaleDateString()}${info.demo ? ' · simulated demo session' : ''}`, 68, 150);
  c.fillStyle = '#ebe6dc'; c.font = '600 64px "Segoe UI", system-ui, sans-serif';
  const title = r.bestPace !== null && r.certainty !== 'flat' && r.certainty !== 'insufficient' ? `My pace: about ${r.bestPace}/min` : 'No clear favourite pace today';
  c.fillText(title, 68, 240);
  c.fillStyle = r.certainty === 'clear' ? '#7fc794' : r.certainty === 'weak' ? '#e7b95f' : '#8d96a3';
  c.font = '600 26px "Segoe UI", system-ui, sans-serif';
  c.fillText(CERT[r.certainty][0], 68, 290);
  // mini curve
  const pts = r.points.filter((p) => p.status === 'ok' && p.amplitude !== null).sort((a, b) => a.bpm - b.bpm);
  const x0 = 68, y0 = 520, w = 620, h = 170;
  const ymax = Math.max(1, ...pts.map((p) => p.amplitude!)) * 1.1;
  const X = (b: number) => x0 + ((b - 4.75) / 2.5) * w, Y = (v: number) => y0 - (v / ymax) * h;
  c.strokeStyle = '#252c37'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + w, y0); c.stroke();
  if (pts.length > 1) {
    c.strokeStyle = '#ee8c74'; c.lineWidth = 4; c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(X(p.bpm), Y(p.amplitude!)) : c.moveTo(X(p.bpm), Y(p.amplitude!)))); c.stroke();
    c.fillStyle = '#ee8c74'; for (const p of pts) { c.beginPath(); c.arc(X(p.bpm), Y(p.amplitude!), 7, 0, Math.PI * 2); c.fill(); }
  }
  c.fillStyle = '#8d96a3'; c.font = '18px "Segoe UI", system-ui, sans-serif';
  for (const p of r.points) c.fillText(p.bpm.toFixed(1), X(p.bpm) - 14, y0 + 30);
  c.fillText('heart-rhythm swing by breathing pace (breaths/min)', x0, y0 + 62);
  // felt
  c.fillStyle = '#ebe6dc'; c.font = '600 24px "Segoe UI", system-ui, sans-serif'; c.fillText('Felt easiest', 780, 360);
  const felt = [...r.points].filter((p) => p.felt).sort((a, b) => (b.felt! - a.felt!))[0];
  c.fillStyle = '#74c7b4'; c.font = '600 48px "Segoe UI", system-ui, sans-serif'; c.fillText(felt ? `${felt.bpm.toFixed(1)}/min` : '—', 780, 420);
  c.fillStyle = '#8d96a3'; c.font = '18px "Segoe UI", system-ui, sans-serif';
  c.fillText('Measured vs felt, relative to me today.', 780, 470);
  c.fillText('Wellness only. Not a medical reading.', 780, 500);
  return cv;
}
$('btn-card').addEventListener('click', () => {
  if (!protocol?.result) return;
  paceCard().toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `paceprint-card-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
});

// ------------------------------------------------------------------ camera time: off while reading the result
let pendingGuided = false;

/** Live: switch the camera off at the result so no trial credits are spent while reading it. */
async function pauseCameraForResult() {
  running = false;
  $('btn-stop').hidden = true;
  await stopSource();
}

/** Live: turn the camera back on, continuing the same session clock, then start guided once data is clean. */
async function startGuidedLive() {
  if (!protocol || info.demo || pendingGuided) return;
  const b = $('btn-guided') as HTMLButtonElement;
  b.disabled = true; b.textContent = 'Starting camera… sit as before';
  const cam = new CameraSource(preview, (m) => console.warn('[camera]', m), clock());
  source = cam;
  running = true;
  $('btn-stop').hidden = false;
  pendingGuided = true;
  health.start(wallS());
  try {
    await cam.start(onEvent);
  } catch (e: any) {
    pendingGuided = false; running = false;
    await stopSource();
    b.textContent = 'Camera could not start. Try again';
  }
  b.disabled = false;
}

/** file the current session's metric stream was saved to (null = not saved yet) */
let streamSavedTo: string | null = null;

/** Save the metric stream (if the person opted in). Called at the result, at the end, on Stop, and when
 *  Save session data is switched on after the result. */
async function saveStreamNow() {
  if (info.demo || !recorder || !sessionId) return;
  if (settings.saveStreams) {
    const file: string | null = await api.saveStream(sessionId, JSON.stringify(recorder.toRecording('live session (real person)')));
    if (file) { streamSavedTo = file; console.warn(`[camera] recording saved: ${file}`); }
  }
  renderSaveState();
}

/** "Recording saved: <file> ..." for the current session, or '' if not saved */
function savedNote(): string {
  const name = streamSavedTo?.split(/[\\/]/).pop();
  return name ? `Recording saved: ${name} (signal numbers only, never video).` : '';
}

/** Whether this session's signal numbers will be (setup) or were (result) saved, so it is never silent. */
function renderSaveState() {
  const setup = $('save-state'), res = $('res-saved');
  setup.hidden = res.hidden = info.demo;
  if (info.demo) return;
  setup.className = `small save-state ${settings.saveStreams ? 'on' : 'off'}`;
  setup.textContent = settings.saveStreams
    ? 'Save session data: on. This session’s signal numbers (never video) will be saved on this computer.'
    : 'Save session data: off. Only the summary will be saved. To keep this session’s signal numbers, turn it on in Your data (top right) before you leave the result.';
  const note = savedNote();
  res.className = `small save-state ${note ? 'on' : 'off'}`;
  res.textContent = note
    ? note
    : settings.saveStreams
      ? 'Recording not saved yet.'
      : 'Recording not saved: Save session data is off. Turn it on in Your data to save this session’s signal numbers.';
}
