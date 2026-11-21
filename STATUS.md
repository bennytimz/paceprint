PLAN A (provisional — beat-level arterial pressure trace exists; daylight spike will confirm real cardio data; app auto-falls back to Plan C breathing-only if not)

# STATUS (Lagos time)
Started Sat Nov 21 00:20 → "start on Saturday" rules. Feature freeze **Sun Nov 22 08:00**. Submit by Sun 18:00.
Tier 1 items 1–8 built and running end-to-end in Judge Mode. **Not yet tested live with a person** (NEEDS_OWNER #1, #3).
Claude must not turn on the camera or spend trial credits; all camera runs are owner tasks.
(Correction: earlier entries here had wrong clock times; the work below happened Sat 00:20–01:30.)

## Trial credits (checked Sat 01:10)
- SDK 3.5.0 (`.d.ts`, JS, README, bundled docs) exposes **no credit or usage query**. Only `SmartSpectraErrorCode.kCreditExhausted = 4`, raised when credits run out (the app stops with a friendly message).
- `.env` holds only `SMARTSPECTRA_API_KEY`; no portal config in the repo.
- Presage's hosted MCP server documents `usage.get_plan` ("plan tier, remaining credits, next renewal"; credits counted per account). Not connected here. → NEEDS_OWNER #2 (portal or Discord).
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

## Next
- Polish without the camera: README GIF from Judge Mode, visual review of every screen, post draft details.
- After owner's live run: promote the real recording to Judge Mode, paste verify-sdk output into README.

## Blockers / risks
- Live path (renderer SDK via bindSmartSpectraIpc) untested with a person in frame.
