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
   - **Three parts**: each pace's 90 s of clean measuring time is also cut into three equal ~30 s parts
     (`splitValid`, across any refused gaps), and the swing is measured in each part on its own (clean pieces ≥ 12 s).
7. **Stage score.** Across kept paces, z-scores (with a spread floor: 0.5 bpm for swing, 0.1 for PLV, so noise
   doesn't masquerade as a difference) combined (0.5 · swing + 0.3 · PLV) / 0.8. Both are Paceprint's own
   measures; no SDK-derived coupling score is used (SDK 3.5 does not deliver one).
   **PLV saturation:** if PLV spans less than 0.05 across paces, or is ≥ 0.95 at every pace, it carries no
   information about which pace is best, so its weight drops to 0 and the result says so ("phase locking was
   0.99 to 1.00 at every pace … the ranking uses swing alone"). The simulated person always saturates.
8. **Best pace.** Highest score; if it is not at the edge, a parabola through it and its neighbours (on swing)
   refines it, clamped to the neighbours and rounded to 0.25. Never more precision than that.
9. **Certainty.** Two questions, both answered in bpm of heart-rate swing:
   - **Do the parts agree?** Each of the three parts picks its own best pace (all paces compared on that part
     alone). *Agree*: every part was read, every part's peak is within one step (0.5/min) of the overall peak,
     and at least two are exactly on it.
   - **Does the peak stand out from its neighbours?** Gap = peak swing minus the higher of the paces either side.
     *Stands out*: the peak is the largest swing, gap ≥ 0.75 bpm, peak ≥ 1.15× the neighbours' mean, and
     gap ≥ 2 standard errors (SE from the part-to-part SD of the two paces, SD/√3 each).
   *Clear*: both, plus PLV ≥ 0.5 and ≥ 4 paces kept. *Weak*: gap ≥ 0.3 bpm, ≥ 1.1× the neighbours, and at least
   two parts within one step of the peak. Otherwise *flat*. Fewer than 3 kept paces: *insufficient*, no result.
   The explanation says which test failed (e.g. "only 0.4 bpm above the pace next to it", "the three 30-second
   parts pointed to different paces (6.5, 5.5, 6.0)", or for flat the real range "1.1 to 1.8 bpm").
   A flat result is shown in full (curve, part ranges, felt ease) and the guided session uses the easiest
   well-followed pace.
   **Chart:** the swing axis always starts at 0 bpm, so a small spread looks small; each point carries a bar
   for its three parts, and a note states the spread across paces and the typical wobble within one.
10. **Baseline comparison.** The same swing measured during 60 s of free breathing (at the person's own
    dominant breathing frequency). Reported only as a ratio to the person's own baseline, never against norms.

## Plan C fallback (no usable pulse waveform)
If fewer than 3 paces have coupling data (key not provisioned for cardio, or the waveform is unreadable),
the result switches to **breathing-only** mode and says so: score = 0.5 · follow score + 0.5 · felt ease,
certainty at most "weak". The guided session then uses the most comfortable well-followed pace.

## Validation of the method
- Unit tests on synthetic signals: beat detection recovers 72 bpm; coupling recovers a 4 bpm swing at 0.1 Hz with PLV > 0.95; adherence separates following (r > 0.9) from not following (r < 0.4).
- Certainty tests (`tests/certainty.test.ts`) on exact synthetic stage results: clear (parts agree, peak stands
  out), noisy (same averages but parts disagree; a peak inside the wobble), a peak only 0.4 bpm above its
  neighbour, flat (spread 2.0 to 2.2 bpm), and PLV saturation (a 0.004 PLV edge can't move the best pace).
  On simulated people: a strong modelled peak is clear at the right pace; a flat person with a drifting swing is
  never clear (5 seeds); a noisy person (small peak, heavy drift, extra beat noise) is never called clear more than
  one step from the modelled pace (6 seeds). A wider probe (12 noisy, 8 flat seeds) gave the same picture.
- End-to-end tests with a simulated person (breathing as an oscillator pulled toward the pacer, heart-rate swing peaking at a chosen pace): the modelled best pace (5.5) is recovered; talking and motion are excluded and the window extended; a stage ruined by motion is excluded with a reason; a flat person gets "flat" or "weak", never "clear".
- **Not yet validated on real people.** The daylight spike and user tests will show how the method behaves on real webcam data. Results are a wellness estimate, not a clinical resonance-frequency assessment.

## Belly-first coaching (guided session)
Every 5 s, over the last 20 s of clean data: RMS of the chest and belly traces band-passed around the guide
pace. Chest/belly > 1.2 → "let your belly lead"; < 0.8 → "your belly is leading". The traces are
uncalibrated, so this is a gentle heuristic shown as a suggestion, never a score.
