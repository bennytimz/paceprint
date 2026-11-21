PLAN A (provisional — beat-level arterial pressure trace exists; daylight spike will confirm real cardio data; app auto-falls back to Plan C breathing-only if not)

# STATUS (Lagos time)
Started Sat Nov 21 00:20 → "start on Saturday" rules. Feature freeze **Sun Nov 22 08:00**. Submit by Sun 18:00.
Tier 1 items 1–8 built and running end-to-end in Judge Mode. **Not yet tested live with a person** (NEEDS_OWNER #1, #3).
Claude must not turn on the camera or spend trial credits; all camera runs are owner tasks.
(Correction: earlier entries here had wrong clock times; the work below happened Sat 00:20–01:30.)

## Trial credits (checked Sat 01:10)
- SDK 3.5.0 (`.d.ts`, JS, README, bundled docs) exposes **no credit or usage query**. Only `SmartSpectraErrorCode.kCreditExhausted = 4`, raised when credits run out (the app stops with a friendly message).
- `.env` holds only `SMARTSPECTRA_API_KEY`; no portal config in the repo.
- Presage's hosted MCP server documents `usage.get_plan` ("plan tier, remaining credits, next renewal"; credits counted per account). Registered in this project (Sat ~01:45, `claude mcp add --transport http smartspectra https://mcp.presagetech.com/mcp`) but it needs a one-time browser OAuth sign-in that only the owner can do, so **remaining credits are not known yet**. → NEEDS_OWNER #2 (`/mcp` → smartspectra → Authenticate, then say "credits?").
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

## Next
- Waiting on owner: daylight spike (#1), MCP sign-in or credits answer (#2), the one live run (#3). Then promote the real recording, paste verify-sdk output (README + post), regenerate the GIF, cut + narrate the video.
- Without the camera: cover image, final read-through of every doc; item 14 (adaptive nudging) stays deferred.

## Blockers / risks
- Live path (renderer SDK via bindSmartSpectraIpc) untested with a person in frame.
