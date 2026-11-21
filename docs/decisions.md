# Decisions log

- **2026-11-21 00:40 — SDK 3.5.0, not 3.4.0.** 3.5.0 is current on npm; pinned exactly.
- **2026-11-21 00:45 — Plan A (provisional).** See docs/spike.md. Pulse-respiration quotient is not delivered by the SDK, so the stage score is amplitude + PLV only.
- **2026-11-21 00:45 — Electron: official renderer-capture pattern.** Renderer SDK (`useMediaStream`/getUserMedia) + `bindSmartSpectraIpc` in main. Gives a real camera preview with no second camera opener. The API key is read from `.env` by main and handed to the sandboxed renderer through the preload only when the user starts a live session (local app, renderer loads only bundled files).
- **2026-11-21 00:45 — Own replay, not `useFile`.** `useFile` still authenticates and spends credits. We record normalized metric streams (no frames) and replay them without the SDK.
- **2026-11-21 00:45 — Telemetry off.** `enableTelemetry: false` on every SDK instance (documented opt-out).
- **2026-11-21 00:45 — No LLM insights.** `requestInsight` is never called.
- **2026-11-21 02:00 — Validity holds.** Talking keeps data invalid for 2 s, a non-OK validation code for 1.5 s, plus 2 s settle after any problem. Measuring timer counts valid time only, up to 45 s extra per pace; a pace with < 45 s valid data is "not read".
- **2026-11-21 02:10 — Certainty in physical units.** "Clear" needs the best swing ≥ 1.3× the median of the others and ≥ 0.75 bpm above the runner-up (z-score gaps were unstable with 5 points).
- **2026-11-21 02:30 — Judge fixture is simulated for now, and labelled so.** Replaced by a real recording (judge-recorded.json, loaded first if present) after the owner's live run.
- **2026-11-21 03:00 — Store lives in src/main/store.ts** (needs fs), not src/core as the brief sketched; core stays Electron/Node-free.
- **2026-11-21 03:10 — Validation state is sticky** until the SDK reports a new one (safe whether the SDK reports per frame or on change). Packet time comes from measurement timestamps; status/validation events are stamped on the same stream clock by arrival.
- **2026-11-21 03:30 — Adaptive pace nudging (Tier 3 #14) deferred** until real-data behaviour is known; a fixed pace is the honest default.
- **2026-11-21 20:30 — Simulated data is never labelled "SDK".** Judge Mode with the simulated fixture labels pulse, breathing, HRV and the pulse trace "simulated", not "SDK": the banner already said "not live data", and the cards contradicted it.
- **2026-11-21 20:30 — Dev dependencies upgraded for a clean audit.** vitest 3 → 5.1 and esbuild 0.25 → 0.28 to clear `npm audit` (2 critical, dev-only). Engines raised to Node >=22.12 because vitest 5 requires it.
- **2026-11-21 22:00 — Certainty must survive three 30 s parts.** "Clear" needs every part to agree on the peak and the peak to beat its neighbouring paces by ≥ 0.75 bpm, ≥ 1.15× and ≥ 2 SE of the part-to-part wobble. The neighbour ratio is 1.15, not the old 1.3 against the median of all paces: adjacent paces (0.5/min away) sit high on any smooth peak, and the bpm gap plus the 2-SE test already guard against noise. At 1.3, a strong modelled peak (gap 1.2–1.4 bpm, about 5 SE) was always "weak". Checked against simulated flat and noisy people before choosing.
- **2026-11-21 22:00 — PLV dropped from the ranking when saturated** (range < 0.05 or all ≥ 0.95). It was 0.98–1.00 at every pace in every simulated run, so it carried no information about which pace is best.
