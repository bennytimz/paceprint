# Demo video script (target 3:11)

Voice: en-US-JennyNeural via edge-tts, rate -4%. Subtitles come from the same lines.
**This table drives the video.** `scripts/make-video.py` reads it: the start of each Time cell is when that line
begins in the final video, and the Narration cell is spoken and subtitled. To re-time, edit the start times here.
Any Judge Mode footage must show its "Simulated session" banner on screen.

**Footage.** Scene 3 is **live**: the setup screen and the start of a baseline, recorded on the owner's webcam
(Nov 22 2026) with ffmpeg screen capture (`scripts/capture-live.mjs`; the app saves nothing). Scenes 2 and 4–6, 8 and 10 are Judge Mode, which plays a
**simulated** session (banner on screen), captured unattended by `scripts/capture-judge.mjs`. Scene 7 is **real**:
two screenshots of the result screen from the one full live session (Nov 22 2026; the first still shows that day's
blank weak-peak reason, since fixed) and its share card. That session's raw signal stream was not saved ("Save
session data" was off at Start), so it cannot be replayed. Facts the narration rests on, from that session:
about 6/min, weak peak; swing 8.4 bpm at 6.0/min vs 3.5 to 4.1 at the other paces; coupling (PLV) 0.07 at
6.0/min and 0.77 at 5.5/min; 7.0/min and baseline not read (trusted data only in short fragments). The Mayer
wave is a possible reason only, never stated as the cause.

| # | Time | On screen (OBS scene) | Narration |
|---|---|---|---|
| 1 | 0:00–0:10 | Title card (drawn by assemble-raw-cut.py) | Most breathing apps assume one pace fits everyone. Six breaths a minute. But is that your pace? |
| 2 | 0:10–0:25 | Judge Mode consent screen ("Simulated session" banner), scroll the short notice, tick both boxes, Accept | Paceprint asks first. It explains what it reads, what it keeps, and what leaves the computer. No video is saved, no accounts, no AI services. Only then does the camera turn on. |
| 3 | 0:25–1:10 | **Live, recorded on my webcam** (`video-raw/live-setup.mp4`, label on screen): setup check turning green, the four warm-up bars filling (22.5 s), then the live baseline with real traces, a real "Paused: Weak pulse signal", and the timer resuming (22.5 s) | This part is live, recorded on my own webcam: the real SmartSpectra signal, not the simulation. The setup check turns each item green as the SDK confirms my face, chest, light and stillness. Each signal has a warm-up window, and these four bars fill as each one warms up. Nothing is trusted before they do. When I started the baseline, my pulse signal weakened, and the app paused on its own instead of using it, then carried on when the signal came back. |
| 4 | 1:10–1:40 | Judge Mode sweep (banner visible, 30 s): pacer, belly breathing trace with the grey guide, pulse waveform beating, readouts going Trusted | Then the sweep: five slow paces, from seven down to five breaths a minute. This is the simulated demo session. The SmartSpectra SDK gives Paceprint breathing from chest and belly, and the pulse waveform, beat by beat. Paceprint finds each heartbeat itself, because the SDK's averaged pulse rate would smooth away exactly what we're measuring: how much heart rate rises and falls with each breath. |
| 5 | 1:40–1:55 | Judge Mode: the simulated person moves. Yellow "Paused: Moving" card, timer stops, hatched trace, readouts "Not read" | When the person moves, it pauses, says why, and throws that stretch away. Talking it can't detect reliably, so it warns instead of pretending. |
| 6 | 1:55–2:05 | Judge Mode felt-ease rating overlay | After each pace comes a rating: how easy did it feel? The body's answer and the person's own, side by side. |
| 7 | 2:05–2:42 | **Real**, stills with slow zoom/pan: `docs/media/real-result-1.png` (top of the result screen, 12 s), `docs/media/real-result-2.png` (the table, 18 s), the share card `paceprint-card-2026-11-22.png` (7 s) | This is my real result, from a live session. About six breaths a minute, labelled a weak peak. At six my heart rate swung most, 8.4 beats a minute, against 3.5 to 4.1 at the others. But it didn't keep time with my breathing; at five and a half it did. When those disagree, Paceprint won't say clear. One possible reason: heart rate also swings by itself about six times a minute. Seven a minute and my baseline weren't read: too few clean stretches. |
| 8 | 2:42–2:50 | Judge Mode recorded guided session (banner visible), follow ring filling | Then a five-minute guided session at the chosen pace, with a live follow score. |
| 9 | 2:50–2:59 | Code screens: `detectBeats` in `src/core/analysis.ts`, then the README signal table | Every SDK signal maps to code: beats from the pressure waveform, phase locking with breathing, a validity layer for every moment. |
| 10 | 2:59–3:11 | Judge Mode "Your data" drawer (deleting is switched off in Judge Mode, as the drawer says); last 4 s end card with repo link | Everything stays on this computer, and in the live app one click deletes it. Paceprint is a wellness tool, not a medical device. Find your pace. |

## Production steps
No camera, no credits, no screen recording by hand. Run from the project folder:
1. `npm run build`
2. `node scripts/capture-judge.mjs` (about 3 minutes; the app records its own window). Writes `video-raw/judge.mp4`,
   `video-raw/cuts.txt` (scene start times) and `video-raw/code.mp4` (scene 9). `--code-only` rebuilds just the code clip.
   Scene 3 (live): `node scripts/capture-live.mjs` while you sit in front of the camera (uses SDK credits), writes
   `video-raw/live-setup.mp4`; part start times are `live` and `live2` in `video-raw/cuts.txt` (defaults 3.5 and 59 s).
3. `python scripts/assemble-raw-cut.py`: builds `video-raw/raw-cut.mp4` (3:11, silent) timed to the table above,
   with the scene 7 stills (`docs/media/real-result-1.png`, `real-result-2.png`, `paceprint-card-2026-11-22.png`).
   If a scene starts at the wrong moment, change its time in `video-raw/cuts.txt` and run this step again.
4. **Narrate, subtitle and export** (one command):
   ```powershell
   python scripts/make-video.py --video video-raw/raw-cut.mp4
   ```
   Output: `video-out/paceprint-demo.mp4` (1920×1080, 30 fps, H.264 + AAC, subtitles burned in), plus
   `video-out/narration.wav` and `video-out/subtitles.srt` (upload the .srt too if the host supports captions).
   It prints each line's start and speech length, and **WARNING**s if a line runs into the next one or past
   the end of the video. Fix by moving start times or trimming words, then run again (about 30 s).
5. **Useful variants:**
   ```powershell
   python scripts/make-video.py --voice-only                       # just narration.wav + subtitles.srt
   python scripts/make-video.py --video video-raw/raw-cut.mp4 --at 5=1:31    # move line 5 without editing the table
   python scripts/make-video.py --video clip.mp4 --lines 4,5 --at 4=0:00,5=0:25 --out test.mp4   # one part
   python scripts/make-video.py --video video-raw/raw-cut.mp4 --rate -8%     # slower voice
   python scripts/make-video.py --video video-raw/raw-cut.mp4 --voice en-US-AriaNeural
   ```
6. **Watch it once with the sound on** and check every line matches what is on screen at that moment
   (especially line 5, the refusal, and line 7, the real result: every number spoken must match the screen).

Install once: Python 3.9+, `pip install edge-tts`, and ffmpeg (`winget install Gyan.FFmpeg`, then open a new
terminal). All three are already installed on the build machine. edge-tts sends only the narration text to
Microsoft's online text-to-speech service; nothing from the app or any session.
