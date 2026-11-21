---
title: "Paceprint: find the breathing pace that suits you, from a webcam, and refuse numbers it can't trust"
published: false
tags: devchallenge, presagechallenge
cover_image: ⟦PLACEHOLDER: cover image URL⟧
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)*

## What I Built
Most breathing apps assume six breaths a minute suits everyone. **Paceprint measures what suits you, from a webcam, and refuses to show numbers it can't trust.**

It's for someone like me: a final-year pharmacy student in exam week who has tried a breathing app and wondered whether the pace it prescribes is actually right for them.

You breathe along with a calm guide at five slow paces (7.0 to 5.0 breaths a minute). Paceprint reads your breathing and your pulse waveform through the SmartSpectra SDK, measures at which pace your heart rhythm and breathing move together most (a dose-response curve: pace is the dose, coupling the response), asks how easy each pace felt, and shows both: **measured vs felt**. Then it guides a five-minute session at your pace.

The rule that shaped everything: **never show a number the data can't support.** Talk, move, step out of frame, or sit under a flickering light, and Paceprint pauses, tells you why, and throws that stretch away.

It's a wellness tool for self-awareness, not a medical device.

## Demo
⟦PLACEHOLDER: video link (voice-over + subtitles)⟧

⟦PLACEHOLDER: GIF from the real recorded session⟧

Try it without a camera or key (Judge Mode replays a bundled session, clearly labelled as simulated or recorded). Needs Node 22.12+ and git; `npm install` downloads about 350 MB (mostly the SDK runtime):

```bash
git clone https://github.com/Bennytimz/paceprint.git
cd paceprint
npm install
npm run demo
```

## Code
https://github.com/Bennytimz/paceprint (MIT)

## How It Responds to Human Signals

| SDK signal | What Paceprint does with it |
|---|---|
| `cardio.arterialPressureTrace` (beat-level pulse waveform; relative, never blood pressure) | Detects each heartbeat, builds beat-to-beat heart rate, measures the heart-rate swing and phase locking at each pace. The core measurement. |
| `breathing.lowerTrace` / `upperTrace` (belly / chest) | Follow score (are you breathing with the guide?), time to lock, breathing phase for coupling, live trace on screen |
| `face.talking` | Refuses data while you talk (speech moves the chest); the timer waits |
| `face.landmarks` | Face motion as a fraction of face width; refuses data while you move |
| `validationStatus` (all 16 codes) | Each mapped to a plain instruction ("Hold still", "Add more even light", "Sit back so your chest is in view") |
| Confidence / `stable` flags | Pulse 40, breathing 45, HRV 50 before a number is shown as Trusted; talking, motion and flicker are checked independently |
| `cardio.pulseRate`, `breathing.rate`, `cardio.hrv` | Context only, with Trusted / Not read states and a warm-up strip; **not** used for coupling |
| `eda.trace` | Warm-up strip only; not interpreted |
| `processingStatus`, `error` | Friendly stop screens; automatic breathing-only fallback if the key isn't provisioned for cardio |

- **Beat by beat, not averaged.** The paces are 8.5 to 12 s per breath. The SDK pulse rate is a ~12 s average, which would erase the heart-rate swing. So Paceprint finds each beat on the pulse waveform itself, builds beat-to-beat heart rate, and measures the swing (a single-bin DFT at the pace) and phase locking (PLV) against the belly breathing trace. Everything about coupling is Paceprint's own calculation.
- **Validity layer.** Every moment is accepted or refused. Refused time is shaded on the traces, excluded from the analysis, and the measuring timer waits for good data (up to 45 s extra); a pace with too little clean data is shown as "not read", never guessed.
- **Honest output.** A certainty label (clear peak / weak peak / no clear peak today), "not read" paces, a warm-up strip, and a breathing-only mode that says so.

Finding beats on the pulse waveform (`src/core/analysis.ts`):

```ts
export function detectBeats(pressure: Sample[], a: number, b: number): number[] {
  const fs = ANALYSIS.pressureFs;
  const raw = resample(pressure, a, b, fs);
  if (raw.length < fs * 5 || raw.some((v) => !Number.isFinite(v))) return [];
  const x = bandpass(raw, fs, 0.7, 3.2);
  const peaks = findPeaks(x, Math.round(ANALYSIS.ibiMin * fs * 0.9), 0.3 * std(x));
  // parabolic interpolation for sub-sample beat timing
  return peaks.map((i) => {
    const y0 = x[i - 1], y1 = x[i], y2 = x[i + 1];
    const den = y0 - 2 * y1 + y2;
    const off = den !== 0 ? (0.5 * (y0 - y2)) / den : 0;
    return a + (i + Math.max(-0.5, Math.min(0.5, off))) / fs;
  });
}
```

Refusing a moment (`src/core/validity.ts`, trimmed):

```ts
if (t - this.lastPacketT > VALIDITY.lostAfter) {
  add('lost', 'Signal lost', 'No reading from the camera right now. Visuals are frozen until it returns.');
} else {
  if (t - this.lastTalkT < VALIDITY.talkingHold) add('talking', 'Talking', 'Stop talking for a moment. Speech moves the chest and hides breathing.');
  if (this.motion.some((m) => m.v > VALIDITY.motionMax)) add('motion', 'Moving', 'Hold still. Rest your arms and lean back.');
  if (this.flicker > VALIDITY.flickerMax) add('flicker', 'Flickering light', 'More even light: screens and some bulbs flicker.');
  // ...plus every non-OK SDK validation code and low pulse confidence
}
```

**Testing.** `npm test` runs 32 tests: a full simulated sweep that must find the right pace, refusal windows that must be excluded, the breathing-only fallback, a "no clear result" day, timestamp handling, the local store's delete-everything, and a replay of the bundled Judge Mode session. `npm run verify-sdk` checks every signal live on a real key:

```
⟦PLACEHOLDER: verify-sdk output⟧
```

## Prize Categories
**Best Thoughtful Real-World Use.** A real question (is the "standard" pace right for me?), answered with the person's own data, with consent and honesty as design features: local only, no video stored, no AI services, telemetry off, measured network audit, one-click delete, and a visible refusal instead of a confident guess.

## Consent and Data Handling
This is the "In short" notice shown in the app before the camera turns on (the full notice is in [`docs/consent-and-data-handling.md`](https://github.com/Bennytimz/paceprint/blob/main/docs/consent-and-data-handling.md)):

- **What it does.** Paceprint uses your webcam to read your breathing and pulse signals while you breathe at a few slow paces, then shows which pace your heart rhythm and breathing moved together best.
- **Wellness only.** Paceprint is not a medical device. It does not diagnose, treat, or monitor any condition. Do not use it if you need medical monitoring. If you feel dizzy or unwell, stop and breathe normally.
- **Your video stays on this computer.** Paceprint never saves or sends video or camera frames.
- **What is saved.** Only session summaries (the paces, scores, your ease ratings, and times), in this computer's app data folder. If you switch on "Save session data" (off by default), also the signal numbers so you can replay a session, never video. Kept until you delete them. One click deletes everything.
- **No accounts, no cloud, no analytics, no AI services.**
- **The one network connection.** The camera analysis uses Presage's SmartSpectra SDK. It runs on this computer but connects to Presage (`cont-api.physiology.presagetech.com`) to check the API key, count usage, and download its models. Paceprint switches off the SDK's optional telemetry.
- **You are in control.** The camera starts only after you accept. A "Camera live" light shows whenever it is on. Stop turns it off at once.
- **18+ only.**

## Agent Session
Not included: the build sessions contain personal paths and details.

## Prior art
Resonance-frequency breathing is established in HRV-biofeedback research (Lehrer, Vaschillo & Vaschillo, 2000). Presage's own *Coherence by Presage Tech* app offers interactive breathwork with pulse and breathing tracking (we could not verify whether it runs a pace sweep), and phone apps such as Outliyr's Coherence, BreathTuner HRV and HRV4Biofeedback find a personal pace from a fingertip on the camera. Paceprint doesn't claim to be first. What it adds is the combination: webcam-only, validity-gated, honest about uncertainty, measured vs felt, consent-first, local, and no AI service.
