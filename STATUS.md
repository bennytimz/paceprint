PLAN A (confirmed live Sat Nov 21 ~21:20: beat-level pressure trace, pulse, breathing and HRV all arrived from a real person on the owner's key)

# STATUS (Lagos time)
Started Sat Nov 21 00:20 → "start on Saturday" rules. Feature freeze **Sun Nov 22 08:00**. Submit by Sun 18:00.
Tier 1 items 1–8 built and running end-to-end in Judge Mode. **Not yet tested live with a person** (NEEDS_OWNER #1, #3).
Claude must not turn on the camera or spend trial credits; all camera runs are owner tasks.
(Correction: earlier entries here had wrong clock times; the work below happened Sat 00:20–01:30.)

## Trial credits (checked Sat Nov 21 21:09 via Presage MCP `usage.get_plan`)
- **99 credits remaining** after verify-sdk run 3 (was 100), free tier, credit allowance not reported (null), renews **Dec 20, 2026**. Credits are counted per account.
- **Not confirmed as minutes:** the API returns a bare credit count, and the SmartSpectra docs searched (Sat 21:09) don't say how a credit converts to time. Evidence so far: run 2 (60 s, almost nothing measured) left 100; run 3 (60 s, all signals) took it to 99. That fits about 1 credit per measured minute, but it's two data points; confirm in the Presage portal.
- SDK 3.5.0 itself exposes no credit query; only `SmartSpectraErrorCode.kCreditExhausted = 4` when credits run out (the app stops with a friendly message).
- NEEDS_OWNER #2 (MCP sign-in) done.
- Used so far: ~2 min of SDK time (60 s auth test + two 25 s network-audit runs, Sat 00:25–01:00).
- Full live run ≈ 16 min camera time; the camera now switches off while the result is on screen.

## Done
- Item 1: repo, SDK 3.5.0 on Windows, key auth OK, docs/spike.md.
- Item 2: core pipeline (capture sim/replay, recorder, validity, protocol, analysis), Judge fixture, tests.
- Items 3–8: Electron app, Judge Mode, verify-sdk, consent (shared doc), setup check, refusal UI, warm-up strip, sweep + felt-ease, result + certainty, guided session, local store + delete-all.
- Items 9, 10, 12, 13, 15, 16: time to lock, measured network audit, past results, random order setting, belly hint, Pace Card PNG.
- Brief moved to BRIEF.private.md (gitignored); public-safe CLAUDE.md. Camera off at result; recording saved at result, end and Stop; promote-recording script ready. 20 tests pass.
- Prior art (Presage Coherence app, Lehrer 2000, pace apps; no "first" claims); SDK claims aligned (unused quotient weight removed from code).
- Accessibility pass (labels, focus, Esc order, reduced motion); tests for Plan C fallback, "no reliable result", validity timing, all 16 codes: 28 pass.
- README GIF (Judge Mode, labelled simulated); Judge Mode no longer persists settings; labels say simulated vs recorded.
- Store tests (delete one, delete everything, id sanitizing): 32 tests pass.
- Clean-clone check (Sat ~01:25): npm ci, test, typecheck, build, Judge Mode all OK without .env or the private brief.
- History purge done early (Sat ~01:40): bundle backup outside the repo, old CLAUDE.md purged, local path scrubbed, public CLAUDE.md re-added, pushed to the private repo as a fast-forward on GitHub's initial commit. Fresh clone from GitHub scanned clean.
- Video pipeline: scripts/make-video.py (edge-tts Jenny, subtitles from sentence timings, ffmpeg 1080p mux + burn-in, overlap warnings); rehearsed on a 45 s Judge Mode clip; full narration fits 2:51.
- DEV post filled except 4 true placeholders; consent "In short" now mentions the opt-in signal recording; simulator breathing-rate readout bug fixed (wobbles counted as breaths).

## Judge review: 10 weakest points (Sat Nov 21, ~20:30)
Skeptical pass against the criteria (technology, usability, originality) and the rules (consent, no medical claims, live signals visible, setup that works). Clean clone from GitHub on Node 22.23.5 following the README: npm install 49 s, 32 tests pass, typecheck and build OK, Judge Mode runs to the result.
1. **No real person in any evidence (owner).** Judge Mode, GIF and cover are simulated; the method is only checked on synthetic signals; the live path has never run with a person in frame. A judge cannot confirm "live signals visible" until the video and real recording exist. → NEEDS_OWNER #1, #3.
2. **The simulated session is too clean (owner).** Follow 96–97 % and PLV 0.99–1.00 at every pace, so the coupling column doesn't tell paces apart and the demo looks tuned. Replacing it with the real recording fixes it; left as is until then.
3. **Simulated mode said "from the SDK" (FIXED).** Pulse, breathing and HRV cards, the pulse trace caption and the result note claimed SDK data under a "not live data" banner. They now say "simulated" in Judge Mode. The README GIF still shows the old captions; it gets remade from the real run anyway.
4. **README setup order was wrong (FIXED).** Judge Mode said `npm install` before any `git clone`, which only appeared later in the live section. Clone + install now come first, shared by both modes.
5. **"No network" Judge Mode overstated (FIXED).** Install downloads ~350 MB (SDK runtime) and the first `npm run demo` silently downloads Electron (~100 MB). README and post now say so and say "no network once installed".
6. **`npm install` reported 3 vulnerabilities, 2 critical (FIXED).** Dev-only (vitest/tinypool). Upgraded vitest 3 → 5.1 and esbuild 0.25 → 0.28 (vite peer); `npm audit` 0, tests and build pass; engines now `>=22.12` (vitest 5 needs it), README says Node 22.12+.
7. **Untested platform claim (FIXED).** README listed macOS/Linux as supported; now says the SDK lists them and we haven't tested them.
8. **Post template incomplete (FIXED).** The official `## Agent Session` heading was missing; restored with "Not included: the build sessions contain personal paths and details."
9. **Placeholders and private repo (owner).** Video link, verify-sdk output (README and post), real GIF, cover upload; the GitHub repo still returns 404 to anonymous users, so a judge can't clone it yet. → NEEDS_OWNER #4, #5.
10. **Usability and originality ceiling (not fixable now).** A result costs ~11 min of camera time (16 with the guided session) and trial credits a judge may not have; pace finding itself is prior art (Presage's Coherence app, Outliyr Coherence). The pitch must lean on webcam-only + visible refusal + measured vs felt, which only the real video can prove.
Rules check: no diagnosis/treatment wording found (grep of app, docs, scripts); consent text is one bundled file shared by app, README summary and post; "nothing leaves your device" is never claimed.

## Certainty made robust (Sat Nov 21, ~22:00)
- Each pace's 90 s is split into three 30 s parts; "clear" needs the parts to agree and the peak to beat its neighbours (≥ 0.75 bpm, ≥ 1.15×, ≥ 2 SE of part wobble). Otherwise weak/flat, with the failing test named in plain words.
- PLV was 0.98–1.00 at every pace in every simulated run: now detected as saturated, dropped from the ranking, stated under the chart. Chart axis from 0 with part-range bars and a spread note; table shows each pace's three parts; flat results name the real range and the guided pace.
- 14 new tests (tests/certainty.test.ts): 46 pass. Judge fixture still shows "Clear peak" in the app but sits at the 2-SE line (headless replay gives "weak"): expect the real recording to be judged on its own data. Cover/GIF unchanged.

## Spike attempt 1 (Sat Nov 21, 21:00, owner ran it, ~3 min of credits)
- The SDK, key and camera work: 4205 packets, face found, talking flag and blink arrived.
- The SDK reported "Too dark" (code 5) from 0.7 s to the end (4486 of 4489 states), so it measured nothing: no breathing, pulse, pressure waveform or HRV. Cardio is still unconfirmed.
- Recording kept locally: recordings/spike-2026-11-21T20-02-23-370Z.*.json (gitignored).
- Rerun needs a bright, steady light in front of the face (daylight is best).

## verify-sdk run 2 (Sat Nov 21, ~21:15, owner ran it, 60 s)
- 2/10 signals: talking flag and blink PASS (1674 packets, first at 3.6 s). Face landmarks, breathing, chest/abdomen traces, pulse, pressure trace, HRV and EDA: no data.
- Validation states: "Chest hidden" (code 7) 1784 times, "No face" once, "Good" once. Light was fine this time (no "Too dark"); framing was the problem: the SDK needs the chest in view, so it measured nothing. Cardio still unconfirmed.
- Not pasted into README/post: a 2/10 result is not the evidence to show.
- Credits checked straight after: still 100, so either a credit isn't a minute or the balance updates later.
- Rerun: laptop on a table, sit ~1 m back so shoulders and upper chest are in frame (camera tilted down if needed), same bright light.

## verify-sdk run 3 (Sat Nov 21, ~21:20, owner ran it, 60 s): 10/10 PASS
- Face, talking, blink, breathing rate (first at 16.4 s, last 13.98/min), chest + abdomen traces, pulse rate (first at 36 s, last 88.34 bpm), **pressure trace (1386 samples, first at 36 s)**, HRV (first at 55 s), EDA. Validation: Good 1764, Too dark 24, No face 1.
- Cardio warm-up is ~36 s before pulse/pressure appear; HRV needs ~55 s and none of its 9 values were stable. The settle phases must cover this.
- SDK warning: this webcam driver has no auto-exposure lock or gain control, so auto exposure stays on during measurement (brightness dropped from 63 to 13 when it tried to lock). Possible source of the 24 "Too dark" moments and of drift in the pulse signal; keep the light steady and bright.
- Output (signals block, SDK log lines dropped) pasted into README "Verify the SDK" and docs/devpost.md; that placeholder is gone.

## Warm-up and HRV check (Sat Nov 21, ~21:40)
- **Paces were already safe:** the SDK runs without a break from setup to the result, and the first pace's measure window starts after setup + 60 s baseline + 30 s settle (> 90 s), well past the 36 s cardio start.
- **The baseline was not safe (FIXED).** Setup only needed 3 s of green, so the baseline could start ~5 s in, and the analysis would have used it before the waveform existed. `resample` holds edge values, so the missing ~30 s became a flat, invented heart rate. Two fixes:
  - Validity now refuses everything until the pressure waveform arrives (`warming`, up to 60 s, then breathing-only fallback), and refuses any mid-session pause in the waveform over 3 s (`nopulse`). The averaged pulse rate does not count as the waveform. Setup shows a "Pulse reading started (takes about 40 s)" row, so Start stays locked until then.
  - Analysis computes beats only inside stretches that actually have waveform samples (`coveredSpans`); gaps are never interpolated.
- **HRV:** coupling uses only our own beat detection on the pressure waveform (`detectBeats` → `heartRateSeries` → `coupling`). The SDK's HRV values and stable flag only feed one display card. A test replays a session with HRV removed and with nonsense HRV: identical coupling.
- Simulator gained `cardioDelayS` (default 0, so the Judge fixture is unchanged). 10 new tests in tests/warmup.test.ts; with the fixes removed, 5 of them fail. **56 tests pass**; typecheck and build OK.
- Not known: whether the SDK needs another ~36 s warm-up after a mid-session dropout or after the camera restarts for the guided session. Either way, the `nopulse` refusal keeps that time out.

## Spike attempt 2 (Sat Nov 21, ~21:32, owner ran it, 150 s): 10/10 signals, but nothing scoreable
- Signals all PASS. Pulse and pressure waveform first at **17 s** this time (36 s in verify-sdk run 3), so the cardio start time varies; the warm-up gate waits for the waveform rather than a fixed time. Exposure locked this time (gain 4→5). Recording: recordings/spike-2026-11-21T20-34-25-448Z.* (gitignored).
- **Talking flag is the blocker.** The SDK set `talking.detected` in 2787 of 4217 face packets: ~57 % in normal-breathing baseline, ~60 % at 7/min, ~77 % at 5/min, 100 % for the last 25 s. Under the app's rules it refuses 143 of 146 s, so every phase is excluded. Unknown whether the owner talked, or whether mouth-open slow breathing triggers it. **Decision needed from the owner.**
- **Bug found and FIXED: false "No face".** Decoded protobuf messages read absent repeated fields as `[]`; the normalizer treated a packet without landmarks (~15 % of packets; landmarks arrive in ~85 %) as "no face", so `noface` flickered all session and the 2 s settle kept restarting. Now only a present-but-empty landmarks entry means no face. Test added; it fails without the fix.
- **Spike recorder clock FIXED.** verify-sdk stamped validation/pacer events with wall time, ~3.58 s ahead of packet frame time (steady: 3.55–3.60 s). Now stamped on the stream clock like camera-source.ts. The live app was already correct.
- **Exploratory, talking flag ignored (not a result):** our own beats on the real waveform look right (45 beats in 35 s, 100 % kept). At 7/min heart rate swung 2.8 bpm at the breathing pace vs 0.5 bpm at 13/min, but following was only 44 % (app minimum 50 %). Only 15 clean seconds at 5/min, too short to say anything.
- Credits: 99 → 94 for this 150 s run (60 s run 3 cost 1). Doesn't fit a simple per-minute rate; at ~2 credits/min a full ~16 min live run costs ~32.
- 57 tests pass; typecheck and build OK. Not committed yet.

## Talk check (Sat Nov 21, ~21:46, owner ran it, 75 s, nose breathing, mouth closed)
- 10/10 signals; pulse/pressure first at 17.3 s again. Credits 94 → 91.
- **Talking flag got worse, not better:** 100 % of packets in the 15 s of normal breathing (one 11.6 s burst), 93 % at 5/min (22 bursts, median 0.5 s, longest 10.9 s); every 5 s bin 73–100 %. Spike 2 (mouth not controlled): ~60 % / ~75 %. So mouth breathing is not the cause.
- We read the field correctly: `face.talking[].detected` is the SDK's "talking/speech detection status" (generated.d.ts; Node metrics docs read it the same way). Presage's docs list no known limitations for it.
- **Burst tolerance cannot help here:** with the flag on 93–100 % of the time, the gaps between bursts are tiny. Any rule loose enough to keep data would amount to ignoring the flag. No threshold changed; no coupling looked at.
- Open question: does the flag tell silence from speech at all on this setup? Needs a contrast test (silent / reading aloud / silent). **Decision needed from the owner.**
- Recording: recordings/talkcheck-2026-11-21T20-47-13-167Z.* (gitignored).

## Talk contrast (Sat Nov 21, ~21:53, owner ran it, 60 s)
- Talking flag: **silent 64 %** (24 short bursts, longest 3.7 s), **reading aloud 96 %**, **silent again 96 %** (longest burst 8.8 s). The flag rose when speech started but did not drop when it stopped; silent periods across the three runs range 64–100 %.
- Conclusion: on this setup the SDK talking flag cannot tell silence from speech, so it cannot do Rule 8's job on its own. No threshold changed, no coupling looked at.
- Side observation: cardio came in only once (one packet at 35 s carrying ~11 s of waveform), then stopped for the rest of the run; no HRV; "Two faces" 37 times. Speaking may disrupt the cardio output. The `nopulse` refusal already keeps such gaps out.
- Credits 91 → 90. Recording: recordings/talkcontrast-2026-11-21T20-53-51-443Z.* (gitignored).
- **Decision needed from the owner:** how Rule 8 detects talking when the SDK flag is uninformative.

## Breathing-trace talking detector (Sat Nov 21, 21:57): rejected
- Tested offline on the talk contrast and the talk check (silent control), chest trace 1–4 Hz in 4 s windows (`scripts/eval-talk-detector.ts`).
- Share of 1–4 Hz power: 92 % of reading windows caught, 7 % false alarms on the silent talk check even with a threshold tuned on the same data; correlates +0.34 with follow score on silent paced windows. Absolute level: 25 % false alarms, r = 0.75 with breath size. Neither separates cleanly on both recordings, and both depend on how the person breathes, so a refusal built on them would bias the pace comparison.
- Not adopted; reasons in docs/decisions.md. No threshold changed, no coupling looked at.

## Mouth-opening talking detector built (Sat Nov 21, 22:09); not yet tested on real data
- `src/core/mouth.ts`: lip-opening ratio per face-mesh frame (inner lips 13/14 over corners 61/291; layout inferred, SDK doesn't document it) and a speech score (2–7 Hz lip movement, 2 s windows, gaps never scored). The normalizer adds `mouth` (ratio samples) to packets; face points are never kept.
- Not wired into validity: the SDK flag still decides talking until the test passes.
- App recordings drop the ratio (recorder gate) until the consent sentence is approved (NEEDS_OWNER 1d; drafted, not committed). Raw test dumps now keep only the face-point count and no expression scores.
- `npm run mouth-contrast` (120 s): 20 s silent, 20 s reading, 20 s silent, 30 s 5/min nose, 30 s 5/min mouth; prints talking flag and lip summary per part; no coupling. Lip summary checked offline on a synthetic session.
- Test fixed before data in docs/decisions.md and `scripts/eval-mouth-detector.ts`. Dry runs: a clean synthetic detector → ADOPT; a synthetic detector whose lip movement grows with breath depth → REJECT. A correlation pass rule was dropped in the dry run (chance |r| 0.51 on overlapping windows) in favour of refusal headroom; reason logged.
- 7 new tests (tests/mouth.test.ts); the slow-mouth-breathing test fails if the band is widened to include breathing. 64 tests pass; typecheck and build OK.

## Next
- Talking flag: Rule 8 stays, no threshold changes (owner, Sat ~21:55). Fixes committed (a09f4dc). New `npm run talk-check` (75 s: 15 s nose normal breathing, then 60 s at 5/min nose): prints talking-flag % and burst lengths per phase, no coupling, and saves the recording. Tested offline on the spike 2 recording.
- New `npm run talk-contrast` (60 s: 20 s silent, 20 s reading a sentence aloud, 20 s silent): talking-flag % and bursts per part, no coupling. Summary tested offline (reproduces the live talk-check printout; a synthetic silent/aloud/silent stream splits correctly).
- Waiting on owner: consent sentence (NEEDS_OWNER 1d), `npm run mouth-contrast` (1e, ~4 credits), then the fixed test decides ADOPT/REJECT. Then the spike rerun and the one live run (#3). Credits: 90. Credits: 94 after spike 2 (#2 done). Then promote the real recording, paste verify-sdk output (README + post), regenerate the GIF, cut + narrate the video.
- Without the camera: cover image, final read-through of every doc; item 14 (adaptive nudging) stays deferred.

## Blockers / risks
- Live path (renderer SDK via bindSmartSpectraIpc) untested with a person in frame.
