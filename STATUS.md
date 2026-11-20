PLAN A (provisional — beat-level arterial pressure trace exists; daylight spike will confirm real cardio data; app auto-falls back to Plan C breathing-only if not)

# STATUS (Lagos time)
Started Sat Nov 21 00:20 → "start on Saturday" rules. Feature freeze **Sun Nov 22 08:00**. Submit by Sun 18:00.
Ahead of plan: Tier 1 items 1–8 are built and run end-to-end in Judge Mode. **Not yet tested live on camera** (needs the owner: NEEDS_OWNER #2 and #4).

## Done
- 00:50 Item 1: repo, SDK 3.5.0 loads on Windows, key auth OK, docs/spike.md.
- 01:40 Item 2: core pipeline (capture sim/replay, recorder, validity, protocol, analysis), simulated Judge fixture, tests.
- 02:40 Items 3–8: Electron app (consent from the shared doc, setup checklist, refusal UI, warm-up strip, sweep + felt-ease, result curve + certainty, guided session, local store + delete-all), Judge Mode, verify-sdk. Item 9 time-to-lock and item 10 network audit done. Item 13 randomized order is a setting.
- 03:00 README, docs/analysis.md, consent doc with measured network audit.

## Next
- Live camera test in Electron (owner present). Then replace the simulated Judge fixture with a real recorded one (judge-recorded.json).
- Item 12 return-visit trend; Tier 3: Pace Card PNG, belly-first coaching, adaptive nudging, polish.

## Blockers / risks
- Live path (renderer SDK via bindSmartSpectraIpc) is untested with a person in frame; only headless verify-sdk ran (dark room).
