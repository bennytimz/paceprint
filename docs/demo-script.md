# Demo video script (target 2:45)

Voice: en-US-AriaNeural or en-US-JennyNeural via edge-tts (calm, warm). Subtitles = the narration lines.
Any Judge Mode footage must show its "Simulated session" / "Recorded session" banner on screen.

| # | Time | On screen (OBS scene) | Narration |
|---|---|---|---|
| 1 | 0:00–0:10 | Title card → app consent screen | Most breathing apps assume one pace fits everyone. Six breaths a minute. But is that your pace? |
| 2 | 0:10–0:25 | Consent screen, scroll the short notice, tick both boxes, Accept. "Camera live" appears | Paceprint asks first. It explains what it reads, what it keeps, and what leaves the computer, measured. No video is saved, no accounts, no AI services. Then the camera turns on. |
| 3 | 0:25–0:40 | Setup check: checklist turns green, chips, warm-up strip | A setup check makes sure the signal is clean: face, chest, steady light, stillness, silence. Each SmartSpectra signal also has a warm-up window, and nothing is trusted before it fills. |
| 4 | 0:40–1:25 | Live sweep: pacer, belly breathing trace with the grey guide, pulse waveform beating, readouts going Trusted | Then the sweep. Five slow paces, from seven down to five breaths a minute. The SmartSpectra SDK gives Paceprint my breathing from chest and belly, and my pulse waveform, beat by beat. Paceprint finds each heartbeat itself, because the SDK's averaged pulse rate would smooth away exactly what we're measuring: how much my heart rate rises and falls with each breath. |
| 5 | 1:25–1:40 | Talk on camera, then move. Yellow "Paused: Talking" card, timer stops, hatched trace, readouts "Not read" | Watch what happens when I talk. It pauses, tells me why, and throws that stretch away. It refuses numbers it can't trust. |
| 6 | 1:40–1:50 | Felt-ease rating overlay, press 4 | After each pace I say how easy it felt. My body's answer and my own answer, side by side. |
| 7 | 1:50–2:15 | Result: response curve, certainty badge, felt chart, table | The result: a response curve, my best-coupled pace, and an honest label. Clear peak, weak peak, or no clear peak today. Beside it, how each pace felt. If a pace didn't get enough clean data, it's marked "not read", never guessed. |
| 8 | 2:15–2:30 | Guided session at the chosen pace, follow ring filling, belly hint | Then a five-minute guided session at my pace, with a live follow score. |
| 9 | 2:30–2:38 | `src/core/analysis.ts` and the README signal table | Every SDK signal maps to code: beats from the pressure waveform, phase locking with breathing, a validity layer for every moment. |
| 10 | 2:38–2:50 | "Your data" drawer → Delete everything; end card with repo link | Everything stays on this computer, and one click deletes it. Paceprint is a wellness tool, not a medical device. Find your pace. |

## Production steps (owner)
1. OBS: record 1920×1080, 30 fps, the app window only (Window Capture). Record scenes 2–8 in one live take
   (talk/move during pace 1), then a short take of scene 9 (VS Code) and scene 10.
   The live sweep is ~12 minutes: keep recording; Claude/you cut it down in the edit.
2. Voice-over (Claude can generate it):
   ```powershell
   pip install edge-tts
   edge-tts --voice en-US-AriaNeural --file docs/narration.txt --write-media voice.mp3 --write-subtitles voice.srt
   ```
3. Mux and burn subtitles (Claude will produce the exact ffmpeg command once the clip timings are known).
