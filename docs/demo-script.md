# Demo video script (target 2:51)

Voice: en-US-JennyNeural via edge-tts, rate -4%. Subtitles come from the same lines.
**This table drives the video.** `scripts/make-video.py` reads it: the start of each Time cell is when that line
begins in the final video, and the Narration cell is spoken and subtitled. To re-time, edit the start times here.
Any Judge Mode footage must show its "Simulated session" banner on screen.

**Footage.** Scenes 2–6 and 10 are Judge Mode, which plays a **simulated** session (banner visible). Scenes 7 and 8
are **real**: two screenshots of the result screen and the share card from the one full live session (Nov 22 2026),
and your live guided-session clip. That session's raw
signal stream was not saved ("Save session data" was off at Start), so it cannot be replayed; there is no
live footage of the sweep. No new live run is planned. `scripts/assemble-raw-cut.py` builds the silent cut from
these pieces, timed to this table. Facts the narration rests on, from that session:
about 6/min, weak peak; swing 8.4 bpm at 6.0/min vs 3.5 to 4.1 at the other paces; coupling (PLV) 0.07 at
6.0/min and 0.77 at 5.5/min; 7.0/min and baseline not read (trusted data only in short fragments). The Mayer
wave is a possible reason only, never stated as the cause.

| # | Time | On screen (OBS scene) | Narration |
|---|---|---|---|
| 1 | 0:00–0:10 | Title card (drawn by assemble-raw-cut.py) | Most breathing apps assume one pace fits everyone. Six breaths a minute. But is that your pace? |
| 2 | 0:10–0:25 | Judge Mode consent screen ("Simulated session" banner), scroll the short notice, tick both boxes, Accept | Paceprint asks first. It explains what it reads, what it keeps, and what leaves the computer, measured. No video is saved, no accounts, no AI services. Only then does the camera turn on. |
| 3 | 0:25–0:40 | Judge Mode setup check: checklist turns green, chips, warm-up strip | A setup check makes sure the signal is clean: face, chest, steady light, stillness, silence. Each SmartSpectra signal also has a warm-up window, and nothing is trusted before it fills. |
| 4 | 0:40–1:20 | Judge Mode sweep (banner visible): pacer, belly breathing trace with the grey guide, pulse waveform beating, readouts going Trusted | Then the sweep: five slow paces, from seven down to five breaths a minute. This is the simulated demo session. The SmartSpectra SDK gives Paceprint breathing from chest and belly, and the pulse waveform, beat by beat. Paceprint finds each heartbeat itself, because the SDK's averaged pulse rate would smooth away exactly what we're measuring: how much heart rate rises and falls with each breath. |
| 5 | 1:20–1:35 | Judge Mode: the simulated person moves. Yellow "Paused: Moving" card, timer stops, hatched trace, readouts "Not read" | When the person moves, it pauses, says why, and throws that stretch away. Talking it can't detect reliably, so it warns instead of pretending. |
| 6 | 1:35–1:45 | Judge Mode felt-ease rating overlay | After each pace comes a rating: how easy did it feel? The body's answer and the person's own, side by side. |
| 7 | 1:45–2:22 | **Real**, stills with slow zoom/pan: `docs/media/real-result-1.png` (top of the result screen, 12 s), `docs/media/real-result-2.png` (the table, 18 s), the share card `paceprint-card-2026-11-22.png` (7 s) | This is my real result, from a live session. About six breaths a minute, labelled a weak peak. At six my heart rate swung most, 8.4 beats a minute, against 3.5 to 4.1 at the others. But it didn't keep time with my breathing; at five and a half it did. When those disagree, Paceprint won't say clear. One possible reason: heart rate also swings by itself about six times a minute. Seven a minute and my baseline weren't read: too few clean stretches. |
| 8 | 2:22–2:30 | **Real:** your live guided-session clip, follow ring filling (Judge Mode guided session only if the clip is missing) | Then a five-minute guided session at the chosen pace, with a live follow score. |
| 9 | 2:30–2:39 | `src/core/analysis.ts` and the README signal table | Every SDK signal maps to code: beats from the pressure waveform, phase locking with breathing, a validity layer for every moment. |
| 10 | 2:39–2:51 | Judge Mode "Your data" drawer, pointer on Delete everything (never clicked); last 4 s end card with repo link (drawn by the script) | Everything stays on this computer, and one click deletes it. Paceprint is a wellness tool, not a medical device. Find your pace. |

## Production steps (owner)
No camera and no credits are needed for any of this.

**Before you record**
1. Put your two screenshots in `docs/media/`: `real-result-1.png` (top of the result screen) and
   `real-result-2.png` (the table).
2. Make a folder `video-raw` in the project folder (it is gitignored). Every recording below goes in it.
3. OBS: Settings → Video: 1920×1080, 30 fps. Settings → Output → Recording Format: **mp4**. Source: Window
   Capture of the Paceprint window only. Mute all audio sources.

**Recording A: Judge Mode, about 15 minutes → `video-raw/judge.mp4`** (scenes 2–6 and 10)
4. Run `npm run demo` and maximise the window.
5. Start recording in OBS. Wait 3 s.
6. Consent screen: scroll the notice slowly for about 8 s, tick both boxes, click **Accept**.
7. Straight away, click **1×** in the banner (it starts at 12×).
8. Hands off for about 12 minutes. Times after Accept, for finding the scenes later:
   setup and baseline 0:00–1:10 · first pace from 1:10 · first rating card about 3:27 ·
   "Paused: Moving" about 6:12 · result screen about 11:50.
9. On the result screen, click **Play the recorded guided session** and let it run 20 s (spare footage for scene 8).
10. Click **Your data** (top right). Wait 3 s, rest the pointer on **Delete everything** for 5 s.
    **Do not click it**: even in Judge Mode it deletes your real saved sessions on this computer.
    Click **Close**, wait 2 s.
11. Stop recording. Rename the file to `judge.mp4` and move it into `video-raw/`.

**Clip B: your live guided session → `video-raw/guided-live.mp4`** (scene 8)
12. Copy your existing live guided-session clip there under that name (it needs at least 10 s of the guided
    session running). Don't record a new one: the app only offers a guided session after a full sweep.
    If the file is missing, scene 8 uses the Judge Mode guided session from Recording A.

**Recording C: code, about 20 seconds → `video-raw/code.mp4`** (scene 9)
13. In VS Code, open `src/core/analysis.ts` at line 98 (`detectBeats`). Start recording, scroll slowly for
    10 s, then open `README.md` at "How it responds to human signals" (line 103) and scroll for 10 s.
    Stop. Save as `video-raw/code.mp4`. (Optional: without it, scene 9 is a text card.)

**Assemble**
14. Run `python scripts/assemble-raw-cut.py` once. It writes `video-raw/cuts.txt` and stops.
15. Open each recording in a video player and write in `cuts.txt` the m:ss where each scene should **start**:
    scene 2 just before you scroll the notice; 3 just after Accept; 4 any 40 s of the sweep with the pacer moving
    (after the first pace starts, before "Paused: Moving"); 5 about 3 s before "Paused: Moving"; 6 about 2 s
    before a rating card; 8 in `guided-live.mp4` where the guided session is running; 9 the start of
    `code.mp4`; 10 about 2 s before you opened Your data.
16. Run `python scripts/assemble-raw-cut.py` again. It writes `video-raw/raw-cut.mp4` (2:51, silent) and prints
    the source of every scene. Watch it once; change a start time in `cuts.txt` and rerun if a scene is off.
17. **Narrate, subtitle and export** (one command):
   ```powershell
   python scripts/make-video.py --video video-raw/raw-cut.mp4
   ```
   Output: `video-out/paceprint-demo.mp4` (1920×1080, 30 fps, H.264 + AAC, subtitles burned in), plus
   `video-out/narration.wav` and `video-out/subtitles.srt` (upload the .srt too if the host supports captions).
   It prints each line's start and speech length, and **WARNING**s if a line runs into the next one or past
   the end of the video. Fix by moving start times or trimming words, then run again (about 30 s).
18. **Useful variants:**
   ```powershell
   python scripts/make-video.py --voice-only                       # just narration.wav + subtitles.srt
   python scripts/make-video.py --video video-raw/raw-cut.mp4 --at 5=1:31    # move line 5 without editing the table
   python scripts/make-video.py --video clip.mp4 --lines 4,5 --at 4=0:00,5=0:25 --out test.mp4   # one part
   python scripts/make-video.py --video video-raw/raw-cut.mp4 --rate -8%     # slower voice
   python scripts/make-video.py --video video-raw/raw-cut.mp4 --voice en-US-AriaNeural
   ```
19. **Watch it once with the sound on** and check every line matches what is on screen at that moment
   (especially line 5, the refusal, and line 7, the real result: every number spoken must match the screen).

Install once: Python 3.9+, `pip install edge-tts`, and ffmpeg (`winget install Gyan.FFmpeg`, then open a new
terminal). All three are already installed on the build machine. edge-tts sends only the narration text to
Microsoft's online text-to-speech service; nothing from the app or any session.
