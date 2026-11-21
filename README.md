# Paceprint

**Most breathing apps assume 6 breaths a minute suits everyone. Paceprint measures what suits you, from a webcam, and refuses to show numbers it can't trust.**

Paceprint is a desktop app (Electron + Node) built on the [Presage SmartSpectra SDK](https://github.com/Presage-Security/SmartSpectra). You breathe along with a calm guide at five slow paces (7.0, 6.5, 6.0, 5.5, 5.0 breaths a minute). Paceprint reads your breathing and your pulse waveform from the camera, measures at which pace your heart rhythm and breathing move together most, asks how easy each pace felt, and shows both: **measured vs felt**. Then it guides a 5-minute session at your pace.

It is a wellness tool for self-awareness. **Not a medical device**, not for diagnosis or treatment.

> Built for the DEV x Presage SmartSpectra SDK Challenge (#presagechallenge).

<!-- GIF: added after recording -->

## Who it's for
A student in exam week who has tried a breathing app and wondered whether the pace it prescribes is right for them. Paceprint answers with their own data, and says so plainly when the data isn't good enough.

## Try it

### Judge Mode (no key, no camera, no network)
```bash
npm install
npm run demo
```
Plays a bundled session through the real app and analysis code. A banner says what it is: today the bundled fixture is a **simulated person** (`tests/fixtures/judge-simulated.json`), clearly labelled; it includes a talking moment and a movement moment so you can see the app refuse that data. Use the 1×/4×/12×/30× buttons to change speed.

### Live, with your webcam
Requirements: Windows 11 (also macOS Apple Silicon / Linux x64 per the SDK), **Node 22** (`node -v`), a webcam, and a SmartSpectra API key from <https://physiology.presagetech.com/>.
```bash
git clone https://github.com/Bennytimz/paceprint
cd paceprint
npm install                     # also installs the SDK's native runtime (a few hundred MB)
copy .env.example .env          # macOS/Linux: cp .env.example .env
# edit .env: SMARTSPECTRA_API_KEY=your_key
npm start
```
Sit about an arm's length from the camera, laptop on a table, even light from the front, chest in view. **Estimated camera time: ~16 min** (about 11 min to your result, then an optional 5-minute guided session). The camera switches off while you read your result, so no SDK time is spent there.

### Check the SDK on your machine
```bash
npm run verify-sdk
```
Runs the SDK for 60 s with your camera and prints PASS/FAIL per signal (face, talking flag, breathing traces and rate, pulse, pressure waveform, HRV, EDA) and every validation state seen.

<!-- verify-sdk output from the owner's machine: added after the daylight run -->

### Tests
```bash
npm test         # analysis, refusal, and replay tests (Vitest)
npm run typecheck
```

## How it responds to human signals

| SDK signal | What Paceprint does with it | Code |
|---|---|---|
| `cardio.arterialPressureTrace` (pulse waveform, ~30 Hz) | Detects each heartbeat, builds beat-to-beat heart rate, measures the heart-rate swing and phase-locking at each pace. This is the core measurement. | `src/core/analysis.ts` (`detectBeats`, `heartRateSeries`, `coupling`) |
| `breathing.lowerTrace` / `upperTrace` (belly / chest) | Follow score (are you breathing with the guide?), time to lock, breathing phase for coupling; live trace on screen | `analysis.ts` (`adherence`, `timeToLock`), `renderer/charts.ts` |
| `face.talking` | Refuses data while you talk (speech moves the chest); the timer waits | `src/core/validity.ts` |
| `face.landmarks` | Face motion as a fraction of face width; refuses data while you move | `src/core/normalize.ts`, `validity.ts` |
| `validationStatus` (all 16 codes) | Each mapped to a plain instruction ("Hold still", "Add more even light", "Sit back so your chest is in view"); setup checklist and live chips | `src/core/validation-codes.ts`, `renderer/app.ts` |
| Confidence / `stable` flags | Pulse and pressure must reach confidence 40, breathing 45, HRV 50 before a number is shown as Trusted. Never trusted alone: talking, motion and flicker are checked independently | `validity.ts`, `renderer/app.ts` (`renderReadouts`) |
| `cardio.pulseRate` (12 s average), `breathing.rate` (30 s), `cardio.hrv` (60 s) | Shown as context with Trusted / Not read states and a warm-up strip; **not** used for coupling, because a 12 s average erases the swing we measure | `renderer/app.ts` |
| `eda.trace` | Warm-up strip only (35 s window); not interpreted | `validity.ts` (`WARMUP`) |
| `processingStatus`, `error` (incl. credits exhausted, auth) | Friendly stop screens; automatic fallback to breathing-only if the key isn't provisioned for cardio | `renderer/camera-source.ts`, `renderer/app.ts` |

Not used, on purpose: expressions (no emotion inference), and the SDK's optional LLM "insights" (no AI services). Paceprint does not use an inhale/exhale ratio, apnea detection, or an SDK coupling score: SDK 3.5 does not deliver them (`docs/spike.md`). Every coupling number is Paceprint's own, computed from the beat-level pulse waveform and the breathing traces.

### The refusal
When you talk, move, leave the frame, or the light flickers, Paceprint pauses the measuring timer, says why in plain words, marks that stretch as hatched "refused" on the live traces, drops every reading to **Not read**, and excludes it from the analysis. A pace that can't collect 45 s of clean data is shown as **not read** on the result curve instead of being guessed. When the signal stops, the guide and traces freeze and say "Signal lost"; nothing is animated to look alive.

### Architecture
```
src/core/        no Electron imports; runs in the app, in Node scripts, and in tests
  capture.ts       one stream interface: camera | replay | simulated
  normalize.ts     decoded SDK protobuf -> plain packets (seconds, no Longs)
  validity.ts      refuse-or-accept, moment by moment; warm-up windows
  protocol.ts      consent -> setup -> baseline -> 5 paces (settle + measure + rating) -> result -> guided
  analysis.ts      follow score, time to lock, beats, coupling, curve, best pace, certainty
  recorder.ts      metric-stream recordings (numbers only, never video)
src/main/        Electron main: window, camera permission (video only, after consent), local store, SDK IPC
src/renderer/    UI; camera-source.ts wraps the official renderer SDK (camera in the window, SDK native runtime in main)
scripts/         verify-sdk (judge-runnable), make-fixture, net-audit.md
```
The SDK is bound only when you start a live session, so Judge Mode never loads it.

## Consent and data handling
The full notice is `docs/consent-and-data-handling.md`. The app shows **this same file** (it is bundled into the app at build time), so the wording cannot drift. In short:

- The camera starts only after you accept. "Camera live" shows whenever it is on. **Stop** (or Esc) turns it off at once.
- **No video or frames are stored or sent by Paceprint.** Only session summaries (paces, scores, ease ratings, times) are saved, locally, until you delete them. Optional "save session data" (signal numbers only) is off by default.
- **One-click delete everything**, plus per-session delete.
- No accounts, cloud, analytics, or AI services. The SDK's LLM insights feature is not used.
- **Measured network use** (`scripts/net-audit.md`): the SDK makes one encrypted connection, to `cont-api.physiology.presagetech.com`, to check the key, count usage, and download its models (~21 MB). Upload volume is far below what video would need. Paceprint sets `enableTelemetry: false`. We cannot read the encrypted content, so we don't claim "nothing leaves your device".
- 18+. Wellness only.

## Limitations
- Camera readings can be less reliable with movement, talking, poor or flickering light, dark or striped clothing, and glasses glare, and may perform differently across skin tones. Paceprint checks for these and refuses bad data, but it can still be wrong.
- The method is validated on synthetic and simulated signals (`docs/analysis.md`); real-person testing is limited.
- Results are relative to you on that day. No population norms. Not a clinical assessment.
- SDK use needs network access and API credits (no offline mode).

## Troubleshooting
| Problem | Fix |
|---|---|
| "No SmartSpectra API key found" | Put `SMARTSPECTRA_API_KEY=...` in `.env` (one line, no quotes) and restart |
| Setup check stays red on "Even, steady light" | Face a window or lamp; avoid backlight; avoid flickering screens or bulbs |
| "Chest in view" red | Sit back or tilt the screen down so your chest (ideally waist) is visible |
| Camera won't start | Close other apps using the camera; Windows Settings → Privacy → Camera → allow desktop apps |
| Pulse never Trusted / result says "breathing only" | Your key may not be provisioned for cardio metrics, or the light is too dim. Run `npm run verify-sdk` |
| Credits exhausted | Use Judge Mode (`npm run demo`) |

## Prior art and inspiration
- **Resonance-frequency breathing** is an established technique in heart-rate-variability biofeedback research: Lehrer, Vaschillo & Vaschillo (2000), [*Resonant frequency biofeedback training to increase cardiac variability: rationale and manual for training*](https://link.springer.com/article/10.1023/A:1009554825745), Applied Psychophysiology and Biofeedback 25(3), 177–191. Paceprint is a camera-based wellness approximation of the idea, not a clinical assessment.
- **Presage's own app**: [*Coherence by Presage Tech*](https://apps.apple.com/us/app/id6758461062) (iOS) is interactive breathwork with pulse and breathing tracking, squarely in Presage's wheelhouse and the closest relative of Paceprint. Its App Store description does not mention a pace sweep, and we could not verify whether it has one.
- **Personal-pace apps**: several iOS apps find a personal breathing pace from a fingertip on the phone camera or a chest strap, e.g. Outliyr's [*Coherence*](https://outliyr.com/coherence) (4.5 to 6.5 breaths/min), [*BreathTuner HRV*](https://apps.apple.com/app/id1562688066), [*HRV4Biofeedback*](https://apps.apple.com/us/app/id1504638613). We did not invent pace finding.
- **What Paceprint adds** is a combination, not a first: **webcam-only** (face and chest, nothing to touch), **validity-gated** (refuses talking, motion, poor framing, flicker), **honest about uncertainty** (clear / weak / no clear peak; "not read" paces), **measured vs felt**, **consent-first**, **local**, and **no AI service**.
- Patterns from other #presagechallenge entries that shaped our design (ideas only; no code or visuals copied): per-metric "not read" instead of a guess (Roll Call, CalmDesk AI), freezing instead of faking a signal (Aura), a judge-runnable SDK verifier and plain-language validation states (StagePulse), an honest warm-up wait (Stillpoint), one module owning the SDK with a simulated source (Breathless Reef), body numbers beside the person's own answers (Ad Pulse Lab), a visible follow score (Slow-Breath Coach), settle time as a metric (HalfBeat), a private end-of-session summary (Viva Mode), and disclosing measured network traffic (Exhale).

## License
MIT. The SmartSpectra SDK is © Presage Technologies under its own license and is installed from npm, not redistributed here.
