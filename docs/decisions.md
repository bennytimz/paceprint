# Decisions log

- **2026-11-21 00:40 — SDK 3.5.0, not 3.4.0.** 3.5.0 is current on npm; pinned exactly.
- **2026-11-21 00:45 — Plan A (provisional).** See docs/spike.md. Pulse-respiration quotient is not delivered by the SDK, so the stage score is amplitude + PLV only.
- **2026-11-21 00:45 — Electron: official renderer-capture pattern.** Renderer SDK (`useMediaStream`/getUserMedia) + `bindSmartSpectraIpc` in main. Gives a real camera preview with no second camera opener. The API key is read from `.env` by main and handed to the sandboxed renderer through the preload only when the user starts a live session (local app, renderer loads only bundled files).
- **2026-11-21 00:45 — Own replay, not `useFile`.** `useFile` still authenticates and spends credits. We record normalized metric streams (no frames) and replay them without the SDK.
- **2026-11-21 00:45 — Telemetry off.** `enableTelemetry: false` on every SDK instance (documented opt-out).
- **2026-11-21 00:45 — No LLM insights.** `requestInsight` is never called.
