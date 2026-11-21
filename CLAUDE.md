# CLAUDE.md: Paceprint

Local-only working notes may exist in `BRIEF.private.md` (gitignored). If present, read it at the start of every session, then `STATUS.md`.

## What Paceprint is
A desktop app (Electron + Node + TypeScript) that uses a webcam and the Presage SmartSpectra SDK to find the slow breathing pace at which a person's heart rhythm and breathing are best coupled, then guides a short session at that pace. The person also rates how easy each pace felt, so the result is "measured vs felt". Wellness tool for self-awareness; not a medical device.

## Architecture
```
src/core/      no Electron imports; runs in the app, Node scripts and Vitest
  capture.ts     stream sources: camera | replay | simulated
  normalize.ts   decoded SDK protobuf -> plain packets
  validity.ts    per-moment accept/refuse; warm-up windows
  protocol.ts    setup -> baseline -> 5 paces (settle, measure, felt-ease) -> result -> guided
  analysis.ts    follow score, time to lock, beat detection, coupling, curve, best pace, certainty
  recorder.ts    metric-stream recordings (numbers only, never video)
src/main/      Electron main: window, camera permission, local store, SDK IPC (bound only for live sessions)
src/renderer/  UI; camera-source.ts wraps the official renderer SDK
scripts/       verify-sdk.ts, make-fixture.ts, build.mjs, net-audit.md
tests/         Vitest; fixtures/ holds metric streams only
docs/          spike, analysis, consent-and-data-handling, decisions, demo-script, devpost
```

## Commands
- `npm start` live app (needs `SMARTSPECTRA_API_KEY` in `.env` and a webcam)
- `npm run demo` Judge Mode: bundled session, no key, no camera, no network
- `npm run verify-sdk` 60 s live SDK check, PASS/FAIL per signal (uses trial credits)
- `npm test`, `npm run typecheck`, `npm run build`, `npm run make-fixture`

## Rules
1. No diagnosis, treatment, or medical claims anywhere. Say "best-coupled pace", "wellness", "relative to your own baseline".
2. Camera only after explicit consent; visible "Camera live" indicator; Stop always reachable.
3. Consent text lives in `docs/consent-and-data-handling.md` and is bundled into the app as-is; keep README and post consistent with it.
4. Never commit or print the API key. `.env` is gitignored; `.env.example` documents it.
5. No cloud storage, analytics, accounts, or AI/LLM calls. SDK telemetry is turned off. Never claim "nothing leaves your device".
6. Never store or send video or frames. Recordings are metric streams only and are opt-in.
7. Coupling uses the beat-level pressure waveform, never the SDK's averaged pulse rate. The SDK (3.5) does not deliver inhale/exhale ratio, apnea, or a pulse-respiration quotient; do not claim to use them.
8. Refuse data that can't be trusted (motion, framing, flicker, low confidence, signal loss, pulse gaps); never average it in or animate a fake signal. Talking: the SDK flag is a live warning plus a per-pace audit share, never a refusal (docs/decisions.md, Rule 8 decision); the person confirms "I'll stay silent and still" before Start.
9. Commits use the configured git user only, with no co-author or "Generated with" lines.
10. Build everything ourselves; credit prior art in the README.
