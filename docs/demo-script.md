# Demo video script (target 2:51)

Voice: en-US-JennyNeural via edge-tts, rate -4%. Subtitles come from the same lines.
**This table drives the video.** `scripts/make-video.py` reads it: the start of each Time cell is when that line
begins in the final video, and the Narration cell is spoken and subtitled. To re-time, edit the start times here.
Any Judge Mode footage must show its "Simulated session" / "Recorded session" banner on screen.

| # | Time | On screen (OBS scene) | Narration |
|---|---|---|---|
| 1 | 0:00–0:10 | Title card → app consent screen | Most breathing apps assume one pace fits everyone. Six breaths a minute. But is that your pace? |
| 2 | 0:10–0:25 | Consent screen, scroll the short notice, tick both boxes, Accept. "Camera live" appears | Paceprint asks first. It explains what it reads, what it keeps, and what leaves the computer, measured. No video is saved, no accounts, no AI services. Then the camera turns on. |
| 3 | 0:25–0:40 | Setup check: checklist turns green, chips, warm-up strip | A setup check makes sure the signal is clean: face, chest, steady light, stillness, silence. Each SmartSpectra signal also has a warm-up window, and nothing is trusted before it fills. |
| 4 | 0:40–1:25 | Live sweep: pacer, belly breathing trace with the grey guide, pulse waveform beating, readouts going Trusted | Then the sweep. Five slow paces, from seven down to five breaths a minute. The SmartSpectra SDK gives Paceprint my breathing from chest and belly, and my pulse waveform, beat by beat. Paceprint finds each heartbeat itself, because the SDK's averaged pulse rate would smooth away exactly what we're measuring: how much my heart rate rises and falls with each breath. |
| 5 | 1:25–1:40 | Move on camera. Yellow "Paused: Moving" card, timer stops, hatched trace, readouts "Not read". Then say a few words: the dashed "Talking?" warning appears, measuring continues | Watch what happens when I move. It pauses, tells me why, and throws that stretch away. Talking it can't detect reliably, so it warns me and notes it on the result instead of pretending. |
| 6 | 1:40–1:50 | Felt-ease rating overlay, press 4 | After each pace I say how easy it felt. My body's answer and my own answer, side by side. |
| 7 | 1:50–2:15 | Result: response curve, certainty badge, felt chart, table | The result: a response curve, my best-coupled pace, and an honest label. Clear peak, weak peak, or no clear peak today. Beside it, how each pace felt. If a pace didn't get enough clean data, it's marked "not read", never guessed. |
| 8 | 2:15–2:30 | Guided session at the chosen pace, follow ring filling, belly hint | Then a five-minute guided session at my pace, with a live follow score. |
| 9 | 2:30–2:39 | `src/core/analysis.ts` and the README signal table | Every SDK signal maps to code: beats from the pressure waveform, phase locking with breathing, a validity layer for every moment. |
| 10 | 2:39–2:51 | "Your data" drawer → Delete everything; end card with repo link | Everything stays on this computer, and one click deletes it. Paceprint is a wellness tool, not a medical device. Find your pace. |

## Production steps (owner)
1. **OBS:** record 1920×1080, 30 fps, the app window only (Window Capture), no microphone. Record scenes 2–8 in
   the one live take (talk/move during pace 1), then a short take of scene 9 (VS Code) and scene 10.
   The live run is ~16 minutes: keep recording; it gets cut down in the edit.
2. **Cut** the footage to ~2:50 so each scene starts at the time in the table (any editor; Clipchamp ships
   with Windows). Export one file, e.g. `raw-cut.mp4`, with no audio needed.
   Or change the start times in the table to match your cut instead.
3. **Narrate, subtitle and export** (one command):
   ```powershell
   python scripts/make-video.py --video raw-cut.mp4
   ```
   Output: `video-outpaceprint-demo.mp4` (1920×1080, 30 fps, H.264 + AAC, subtitles burned in), plus
   `video-out
arration.wav` and `video-outsubtitles.srt` (upload the .srt too if the host supports captions).
   It prints each line's start and speech length, and **WARNING**s if a line runs into the next one or past
   the end of the video. Fix by moving start times or trimming words, then run again (about 30 s).
4. **Useful variants:**
   ```powershell
   python scripts/make-video.py --voice-only                       # just narration.wav + subtitles.srt
   python scripts/make-video.py --video raw-cut.mp4 --at 5=1:31    # move line 5 without editing the table
   python scripts/make-video.py --video clip.mp4 --lines 4,5 --at 4=0:00,5=0:25 --out test.mp4   # one part
   python scripts/make-video.py --video raw-cut.mp4 --rate -8%     # slower voice
   python scripts/make-video.py --video raw-cut.mp4 --voice en-US-AriaNeural
   ```
5. **Watch it once with the sound on** and check every line matches what is on screen at that moment
   (especially line 5, the refusal, and line 7, the result).

Install once: Python 3.9+, `pip install edge-tts`, and ffmpeg (`winget install Gyan.FFmpeg`, then open a new
terminal). All three are already installed on the build machine. edge-tts sends only the narration text to
Microsoft's online text-to-speech service; nothing from the app or any session.
