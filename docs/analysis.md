# Analysis

All functions are pure and live in `src/core/analysis.ts` (helpers in `src/core/dsp.ts`).
Tests: `tests/analysis.test.ts`, `tests/replay.test.ts`.

## Why not the SDK pulse rate?
The paces tested (5.0 to 7.0 breaths/min) are 0.083 to 0.117 Hz, a cycle every 8.5 to 12 s. The SDK
pulse rate is a ~12 s average, which smooths away exactly the heart-rate rise and fall we want to see.
So Paceprint detects individual beats on the SDK's **arterial pressure waveform** (`cardio.arterialPressureTrace`,
relative and uncalibrated, never blood pressure) and builds its own beat-to-beat heart rate.

## Steps

1. **Validity first** (`validity.ts`). Every moment is valid or refused: signal lost (> 2 s without
   packets), any non-OK SDK ValidationCode (held 1.5 s), talking flag (held 2 s), face motion > 2 % of face
   width per packet, no face, pressure confidence < 40 after a 15 s grace, flickering light (frame-to-frame
   brightness change > 1.2 %), plus a 2 s settle after any problem. Refused time is excluded, and the
   measuring timer waits (up to 45 s extra) to collect 90 s of valid data.
2. **Adherence / follow score.** Breathing trace (belly by default, chest if it follows clearly better)
   resampled to 10 Hz, band-passed 0.5× to 2.5× the pace frequency (zero-phase FFT), correlated with the
   pacer's fill curve over lags 0 to 2.5 s. Score = best |r| (polarity of the trace is not guaranteed).
   A pace with follow score < 0.5 is excluded: you weren't breathing at that pace, so it says nothing about it.
3. **Time to lock.** First moment a rolling 15 s follow score ≥ 0.6, measured from the start of the pace
   (including the 30 s settle).
4. **Beats.** Pressure waveform resampled to 30 Hz, band-passed 0.7 to 3.2 Hz, peaks ≥ 0.33 s apart and
   above 0.3 SD, refined by parabolic interpolation.
5. **Beat-to-beat heart rate.** Inter-beat intervals outside 40 to 110 bpm are dropped, as is any beat more
   than 25 % from its local median (missed or extra beats). Resampled to 4 Hz.
6. **Coupling at the pace frequency f₀** (only on valid segments ≥ 20 s, pooled by length):
   - **Swing amplitude**: single-bin DFT (Goertzel-equivalent) amplitude of the detrended heart rate at f₀, in bpm.
   - **Phase locking (PLV)**: both heart rate and breathing band-passed f₀ ± 0.05 Hz, analytic phase via FFT
     Hilbert; PLV = |mean(exp(i(φ_hr − φ_breath)))|, plus the mean lag. Edges (10 %) ignored.
   - **Cross-check**: median per-cycle peak-to-trough heart-rate swing.
7. **Stage score.** Across kept paces, z-scores (with a spread floor: 0.5 bpm for swing, 0.1 for PLV, so noise
   doesn't masquerade as a difference) combined 0.5 · swing + 0.3 · PLV, renormalized because the SDK's
   pulse-respiration quotient is not delivered in SDK 3.5 (weight 0.2 kept in config for when it is).
8. **Best pace.** Highest score; if it is not at the edge, a parabola through it and its neighbours (on swing)
   refines it, clamped to the neighbours and rounded to 0.25. Never more precision than that.
9. **Certainty.** *Clear*: best swing ≥ 1.3× the median of the others, ≥ 0.75 bpm above the runner-up,
   PLV ≥ 0.5, and ≥ 4 paces kept. *Weak*: ≥ 1.1× and ≥ 0.3 bpm. Otherwise *flat* ("no clear peak today").
   Fewer than 3 kept paces: *insufficient*, no result shown.
10. **Baseline comparison.** The same swing measured during 60 s of free breathing (at the person's own
    dominant breathing frequency). Reported only as a ratio to the person's own baseline, never against norms.

## Plan C fallback (no usable pulse waveform)
If fewer than 3 paces have coupling data (key not provisioned for cardio, or the waveform is unreadable),
the result switches to **breathing-only** mode and says so: score = 0.5 · follow score + 0.5 · felt ease,
certainty at most "weak". The guided session then uses the most comfortable well-followed pace.

## Validation of the method
- Unit tests on synthetic signals: beat detection recovers 72 bpm; coupling recovers a 4 bpm swing at 0.1 Hz with PLV > 0.95; adherence separates following (r > 0.9) from not following (r < 0.4).
- End-to-end tests with a simulated person (breathing as an oscillator pulled toward the pacer, heart-rate swing peaking at a chosen pace): the modelled best pace (5.5) is recovered; talking and motion are excluded and the window extended; a stage ruined by motion is excluded with a reason; a flat person gets "flat" or "weak", never "clear".
- **Not yet validated on real people.** The daylight spike and user tests will show how the method behaves on real webcam data. Results are a wellness estimate, not a clinical resonance-frequency assessment.

## Belly-first coaching (guided session)
Every 5 s, over the last 20 s of clean data: RMS of the chest and belly traces band-passed around the guide
pace. Chest/belly > 1.2 → "let your belly lead"; < 0.8 → "your belly is leading". The traces are
uncalibrated, so this is a gentle heuristic shown as a suggestion, never a score.
