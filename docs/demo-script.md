# Demo video script (target 2:51)

Voice: en-US-JennyNeural via edge-tts, rate -4%. Subtitles come from the same lines.
**This table drives the video.** `scripts/make-video.py` reads it: the start of each Time cell is when that line
begins in the final video, and the Narration cell is spoken and subtitled. To re-time, edit the start times here.
Any Judge Mode footage must show its "Simulated session" banner on screen.

**Footage.** Scenes 2–6 and 8 are Judge Mode, which plays a **simulated** session (banner visible). Scene 7 is
**real**: the result screen and share card from the one full live session (Nov 22 2026). That session's raw
signal stream was not saved ("Save session data" was off at Start), so it cannot be replayed; there is no
live footage of the sweep. No new live run is planned. Facts the narration rests on, from that session:
about 6/min, weak peak; swing 8.4 bpm at 6.0/min vs 3.5 to 4.1 at the other paces; coupling (PLV) 0.07 at
6.0/min and 0.77 at 5.5/min; 7.0/min and baseline not read (trusted data only in short fragments). The Mayer
wave is a possible reason only, never stated as the cause.

| # | Time | On screen (OBS scene) | Narration |
|---|---|---|---|
| 1 | 0:00–0:10 | Title card → app consent screen | Most breathing apps assume one pace fits everyone. Six breaths a minute. But is that your pace? |
| 2 | 0:10–0:25 | Judge Mode consent screen ("Simulated session" banner), scroll the short notice, tick both boxes, Accept | Paceprint asks first. It explains what it reads, what it keeps, and what leaves the computer, measured. No video is saved, no accounts, no AI services. Only then does the camera turn on. |
| 3 | 0:25–0:40 | Judge Mode setup check: checklist turns green, chips, warm-up strip | A setup check makes sure the signal is clean: face, chest, steady light, stillness, silence. Each SmartSpectra signal also has a warm-up window, and nothing is trusted before it fills. |
| 4 | 0:40–1:20 | Judge Mode sweep (banner visible): pacer, belly breathing trace with the grey guide, pulse waveform beating, readouts going Trusted | Then the sweep: five slow paces, from seven down to five breaths a minute. This is the simulated demo session. The SmartSpectra SDK gives Paceprint breathing from chest and belly, and the pulse waveform, beat by beat. Paceprint finds each heartbeat itself, because the SDK's averaged pulse rate would smooth away exactly what we're measuring: how much heart rate rises and falls with each breath. |
| 5 | 1:20–1:35 | Judge Mode: the simulated person moves. Yellow "Paused: Moving" card, timer stops, hatched trace, readouts "Not read". The dashed "Talking?" warning during the talking moment | When the person moves, it pauses, says why, and throws that stretch away. Talking it can't detect reliably, so it warns instead of pretending. |
| 6 | 1:35–1:45 | Judge Mode felt-ease rating overlay | After each pace comes a rating: how easy did it feel? The body's answer and the person's own, side by side. |
| 7 | 1:45–2:22 | **Real:** the result screen from the Nov 22 live session (no banner), then the share card `paceprint-card-2026-11-22.png` | This is my real result, from a live session. About six breaths a minute, labelled a weak peak. At six my heart rate swung most, 8.4 beats a minute, against 3.5 to 4.1 at the others. But it didn't keep time with my breathing; at five and a half it did. When those disagree, Paceprint won't say clear. One possible reason: heart rate also swings by itself about six times a minute. Seven a minute and my baseline weren't read: too few clean stretches. |
| 8 | 2:22–2:30 | Judge Mode guided session (banner visible), follow ring filling, belly hint | Then a five-minute guided session at the chosen pace, with a live follow score. |
| 9 | 2:30–2:39 | `src/core/analysis.ts` and the README signal table | Every SDK signal maps to code: beats from the pressure waveform, phase locking with breathing, a validity layer for every moment. |
| 10 | 2:39–2:51 | "Your data" drawer → Delete everything; end card with repo link | Everything stays on this computer, and one click deletes it. Paceprint is a wellness tool, not a medical device. Find your pace. |

## Production steps (owner)
1. **OBS:** record 1920×1080, 30 fps, the app window only (Window Capture), no microphone. Record scenes 2–6
   and 8 in one Judge Mode take (`npm run demo`; use 12× or 30× and slow down for the move/talk moment and
   the guided session), keeping the "Simulated session" banner in frame. Scene 7: your capture of the real
   result screen, then the card image held on screen. Then a short take of scene 9 (VS Code) and scene 10.
   No camera and no credits needed.
2. **Cut** the footage to ~2:50 so each scene starts at the time in the table (any editor; Clipchamp ships
   with Windows). Export one file, e.g. `raw-cut.mp4`, with no audio needed.
   Or change the start times in the table to match your cut instead.
3. **Narrate, subtitle and export** (one command):
   ```powershell
   python scripts/make-video.py --video raw-cut.mp4
   ```
   Output: `video-out/paceprint-demo.mp4` (1920×1080, 30 fps, H.264 + AAC, subtitles burned in), plus
   `video-out/narration.wav` and `video-out/subtitles.srt` (upload the .srt too if the host supports captions).
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
   (especially line 5, the refusal, and line 7, the real result: every number spoken must match the screen).

Install once: Python 3.9+, `pip install edge-tts`, and ffmpeg (`winget install Gyan.FFmpeg`, then open a new
terminal). All three are already installed on the build machine. edge-tts sends only the narration text to
Microsoft's online text-to-speech service; nothing from the app or any session.
