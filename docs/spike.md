# Spike results (Sat Nov 21, 00:20–01:00 WAT)

Sources: SDK package `@smartspectra/node-sdk` **3.5.0** (installed `.d.ts` + bundled docs), the official
GitHub repo `Presage-Security/SmartSpectra/nodejs` (README, api-reference.md, metrics.md,
electron-quickstart), and one live 60 s run on the owner's laptop (Windows 11, Node 22.23.5).
The docs website was not needed; GitHub raw files + `node_modules` were enough.

## Platform
- `npm install` works on Windows/Node 22. No postinstall; native runtime ships as
  `@smartspectra/node-sdk-win32-x64` (smartspectra_capi.dll, opencv, vulkan). **PASS**
- `SmartSpectraSDK.availableCameras()` finds "HP Wide Vision HD Camera" (facing unknown, so select
  by `CameraSelection.default` / byId, never `.front` on Windows). **PASS**
- Live run with the owner's key: authenticates, camera opens, ~28 metric packets/s
  (1374 packets in ~49 s). Night-time room: validation said "Too dark" (1555×) and "No face" (230×),
  so breathing/cardio never started. **Needs a daylight re-run (NEEDS_OWNER #2).**

## Signal availability in Node (3.5.0)
| Signal | Exposed? | Path / note |
|---|---|---|
| Chest / abdomen breathing traces | Yes | `breathing.upperTrace[]`, `breathing.lowerTrace[]` (`Measurement`: value, stable, timestamp µs) |
| Breathing rate | Yes | `breathing.rate[]` with confidence (30 s window) |
| Pulse rate | Yes (cardio bundle) | `cardio.pulseRate[]` with confidence; `stable` ⇔ conf ≥ 40 |
| **Arterial pressure trace** | Yes (cardio bundle) | `cardio.arterialPressureTrace[]`, relative/unitless, conf ≥ 40 = stable. **Beat-level waveform → Plan A** |
| HRV | Yes (cardio bundle) | `cardio.hrv[]`: rmssd, sdnn, meanNn, baevsky, confidence (stable ≥ 50) |
| EDA proxy | Yes | `eda.trace[]`, first sample after > 35 s |
| Face landmarks | Yes | `face.landmarks[].value` (Point2d list) |
| Talking / blinking | Yes, **verified live** | `face.talking[].detected`, `face.blinking[].detected` |
| Expressions | Yes | not used (out of scope) |
| Inhale/exhale ratio | **No** | Requesting `INHALE_EXHALE_RATIO` makes `start()` fail (kConfigurationFailed) |
| Apnea, amplitude, baseline, line length | **No** | same as above |
| Pulse-respiration quotient | **No** | `Pulse.pulseRespirationQuotient` exists in the proto but `Metrics` has no `pulse` field, so it is never delivered |
| ValidationCode | Yes, **verified live** | 16 codes (0–7, 10–17) via `validationStatus(code, ts, hint)` |
| Processing status / errors | Yes | `processingStatus`, `error(code, msg, retryable)`; kCreditExhausted = 4 |
| Telemetry switch | Yes | `enableTelemetry: false` (Paceprint sets it). Docs: no raw frames or vitals are sent by telemetry |

Caveat from the official quickstart README: cardio outputs need an API key **provisioned for cardio**
("Failed to load device keys" otherwise). Our full request (breathing+cardio+face+EDA) started without a
config/authorization error, which suggests the key is allowed, but no cardio sample has been seen yet
because no face was found. Confirm in the daylight spike.

## Replay without credits
- `useFile()` exists but the SDK has **no offline mode** (it authenticates and verifies usage), so it
  would still spend credits. **Paceprint's replay is its own**: it records the normalized metric stream
  (no frames) and replays it without the SDK. Judge Mode uses this. No credits, no key, no camera.

## Electron pattern
Official: `bindSmartSpectraIpc(win)` in main; renderer `SmartSpectraSDK` from `/renderer` captures the
camera with `getUserMedia` and ships frames to main over a MessagePort; SDK preload exposes the bridge.
The preload `require`s only `electron`, so we bundle it into our own sandboxed preload.

## Decision
**Plan A (provisional)**: the arterial pressure waveform is exposed at frame rate, so we detect beats and
compute our own coupling (amplitude at pace + PLV). The SDK quotient is not available, so the stage score
uses amplitude + PLV only (weights renormalized). If the daylight spike shows no cardio data
(key not provisioned or waveform too noisy), the app falls back automatically to the Plan C
breathing-quality score and says so on screen.

## Still open (daylight spike, NEEDS_OWNER #2)
- Does the pressure trace show beats clearly enough for peak detection at ~28 Hz?
- Does heart rate oscillation differ between 7.0 and 5.0 breaths/min?
- Do landmarks arrive (the dark run showed none because no face was found)?
