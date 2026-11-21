---
title: "Paceprint: find the breathing pace that suits you, from a webcam, and refuse numbers it can't trust"
published: false
tags: devchallenge, presagechallenge
cover_image: TODO
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)*

## What I Built
Most breathing apps assume six breaths a minute suits everyone. **Paceprint measures what suits you, from a webcam, and refuses to show numbers it can't trust.**

It's for someone like me: a final-year pharmacy student in exam week who has tried a breathing app and wondered whether the pace it prescribes is actually right for them.

You breathe along with a calm guide at five slow paces (7.0 to 5.0 breaths a minute). Paceprint reads your breathing and your pulse waveform through the SmartSpectra SDK, measures at which pace your heart rhythm and breathing move together most (a dose-response curve: pace is the dose, coupling the response), asks how easy each pace felt, and shows both: **measured vs felt**. Then it guides a five-minute session at your pace.

The rule that shaped everything: **never show a number the data can't support.** Talk, move, step out of frame, or sit under a flickering light, and Paceprint pauses, tells you why, and throws that stretch away.

It's a wellness tool for self-awareness, not a medical device.

## Demo
TODO: video link (voice-over + subtitles)

Try it without a camera or key (Judge Mode): `npm install && npm run demo`.

## Code
TODO: https://github.com/Bennytimz/paceprint

## How It Responds to Human Signals
TODO: paste the README signal table, plus:

- **Beat-by-beat, not averaged.** The paces are 8.5 to 12 s per breath. The SDK pulse rate is a ~12 s average, which would erase the heart-rate swing. So Paceprint detects each beat on `cardio.arterialPressureTrace`, builds beat-to-beat heart rate, and measures the swing (single-bin DFT at the pace) and phase locking (PLV) with the belly breathing trace.
- **Validity layer.** Talking flag, face motion from landmarks, all 16 ValidationCodes in plain language, confidence thresholds (40/45/50), a brightness-flicker probe, and signal-loss freezing. Refused time is excluded and the timer waits.
- **Honest output.** Certainty label (clear / weak / no clear peak), "not read" paces, a warm-up strip, a breathing-only fallback if pulse data isn't available.
- Short code excerpts: TODO (`capture.ts` adapter, `detectBeats`, `ValidityMonitor.check`).
- Testing: `npm run verify-sdk` (TODO: paste output), `npm test`.

## Prize Categories
**Best Thoughtful Real-World Use.** A real question (is the "standard" pace right for me?), answered with the person's own data, with consent and honesty as design features: local only, no video stored, no AI services, telemetry off, measured network audit, one-click delete, and a visible refusal instead of a confident guess.

## Consent and Data Handling
TODO: paste "In short" from docs/consent-and-data-handling.md verbatim (must match the app).

## Agent Session
TODO (optional, scrub paths and personal details first)

## Prior art
Resonance-frequency breathing is established in HRV-biofeedback research (Lehrer, Vaschillo & Vaschillo, 2000). Presage's own *Coherence by Presage Tech* app offers interactive breathwork with pulse and breathing tracking (we could not verify whether it runs a pace sweep), and phone apps such as Outliyr's Coherence, BreathTuner HRV and HRV4Biofeedback find a personal pace from a fingertip on the camera. Paceprint doesn't claim to be first. What it adds is the combination: webcam-only, validity-gated, honest about uncertainty, measured vs felt, consent-first, local, and no AI service.
