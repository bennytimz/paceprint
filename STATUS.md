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

## Next
- Waiting on owner: daylight spike (#1), MCP sign-in or credits answer (#2), the one live run (#3). Then promote the real recording, paste verify-sdk output (README + post), regenerate the GIF, cut + narrate the video.
- Without the camera: cover image, final read-through of every doc; item 14 (adaptive nudging) stays deferred.

## Blockers / risks
- Live path (renderer SDK via bindSmartSpectraIpc) untested with a person in frame.
