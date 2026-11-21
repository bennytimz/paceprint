# NEEDS_OWNER — tasks only Benny can do

Times are Lagos (WAT). Claude keeps building against replay/simulated data meanwhile and never turns on
the camera or spends trial credits.

## Still missing from the DEV post (`docs/devpost.md`; search for `⟦PLACEHOLDER`)
Everything else in the post is written. These four need your live run or your upload:
1. **Video link**: after task 5 (upload `video-out\paceprint-demo.mp4`, paste the link).
2. **verify-sdk output**: Claude pastes it after task 1 or 3 (from your terminal output).
3. **Real GIF**: Claude regenerates it from your recorded session after "live test done".
4. **Cover image**: a draft is ready at `docs/media/cover-draft.png` (1000×420, the result screen, tagged "simulated
   session"). Claude remakes it from your real session after the live run. You upload it in the DEV editor
   (cover image button); DEV fills in `cover_image` itself.

## 1. Daylight spike (3 min of camera) — NEEDED BY: Sat Nov 21, 10:00
Confirms the SDK delivers breathing and **cardio** (pulse waveform) on your key. Daylight or a bright,
steady lamp in front of you; laptop on a table; sit ~1 m back so your chest is in view; don't talk.
```powershell
cd <project folder>
npm run spike
```
It runs 150 s: 60 s normal breathing, then follow the terminal prompt at **7 breaths/min for 45 s**, then
**5 breaths/min for 45 s**. At the end it prints PASS/FAIL per signal and saves `recordings\spike-*.json`
(numbers only, no video). Then tell Claude **"spike done"**.
- If it prints `Failed to load device keys`, `kMetricNotAuthorized` (13) or FAIL on pulse/pressure: your key
  isn't provisioned for cardio. Do task 2 as well, and ask for cardio to be enabled.

## 1b. Talk check (75 s of camera, about 2–3 credits)
Spike 2 had the SDK's talking flag on most of the time, so the app refused almost everything. This checks
whether breathing through the nose stops it. Same setup as before (bright steady light, ~1 m back, chest in
view). Breathe through your **nose** the whole time, mouth gently closed, and don't speak.
```powershell
npm run talk-check
```
15 s of normal breathing, then follow the prompt at 5 breaths/min for 60 s. It prints how often the flag
fired in each part. Then tell Claude the result (or just run it with `!` in Claude Code).

## 1c. Talk contrast (60 s of camera, about 2 credits)
The talk check showed the talking flag on 93–100 % of the time while you were silent. This shows whether it
reacts to speech at all. Same setup. 20 s silent with your mouth closed, then 20 s reading the sentence shown
on screen aloud, over and over, then 20 s silent again.
```powershell
npm run talk-contrast
```

## 1d. Consent sentence: DONE (approved Sat Nov 21 22:12, with "or any images" added)
Applied to `docs/consent-and-data-handling.md` (shown in the app as-is); app recordings now keep the lip ratio.

## 1e. Mouth contrast (120 s of camera, about 4 credits; 90 left)
Tests the lip detector. Same setup as before. 20 s silent with mouth closed, 20 s reading the sentence aloud,
20 s silent, then 60 s silent at 5 breaths/min: the first 30 s through your **nose**, the last 30 s through
your **mouth** (the prompt says which). Saves only the lip-opening ratio, no face points.
```powershell
npm run mouth-contrast
```
Then Claude runs the fixed test (`scripts/eval-mouth-detector.ts`), which prints ADOPT or REJECT.

## 2. Ask Presage how many trial minutes you have — NEEDED BY: Sat Nov 21, 10:00
The SDK has no way to read your remaining credits (it only raises `kCreditExhausted` when they run out).
Options, quickest first:
- Log in at https://physiology.presagetech.com/ and look for a plan / usage / credits page.
- Or ask on the Presage Discord (challenge channel):
  > Hi! I'm building a #presagechallenge entry with @smartspectra/node-sdk 3.5.0 on Windows. How many trial
  > minutes/credits does a challenge key have, and how are they counted (per session start, per minute of
  > processing)? My full app run is about 16 minutes of camera time. Also, is my key enabled for cardio
  > metrics (pulse rate, arterial pressure trace, HRV)? Thank you!
- **Or let Claude read it (about 1 minute):** Claude has registered Presage's hosted MCP server in this project
  (`smartspectra`, https://mcp.presagetech.com/mcp). It needs your sign-in once, in your browser:
  type `/mcp` in Claude Code → select **smartspectra** → **Authenticate** → log in with your SmartSpectra
  (portal) account and approve. Then say **"credits?"** and Claude will read your plan and remaining credits
  into STATUS.md. Claude never sees your password. Signing in does not use any credits.

Already used: about 2 minutes (three short tests on Sat 00:25–01:00, two of them for the network audit).
Budget: spike 3 min + one full live run ~16 min (+ up to ~4 min if many moments get refused).

## 3. ONE live run that does three jobs — NEEDED BY: Sat Nov 21, 18:00
This single run (a) proves the live app works, (b) becomes the **real Judge Mode session** (replacing the
simulated person; the banner will say "Recorded session: a real session replayed"), and (c) gives you
the **OBS footage** for the video, with the refusal moment in the first pace.
**Estimated camera time: ~16 min** (11 to the result + 5 guided). The camera switches off while you read the result.

### Room and setup (5 min, before starting anything)
- **Light:** face a window in daylight, or put a lamp **in front of you, behind the laptop**. Nothing bright
  behind you. No ceiling fluorescent tubes or LED strips that flicker; turn off other screens behind you.
- **Camera:** laptop on a **table** (not your lap), screen tilted back so the camera sees from your face
  down to your waist. Camera at about eye level or slightly below; prop the laptop on books if needed.
- **Distance:** about an arm's length (~70–100 cm). Face in the middle of the picture.
- **Clothes:** plain, lighter-coloured top. No dark or tight stripes, no busy patterns. Avoid loose hoodies.
- **Glasses:** fine, but tilt them slightly if a lamp reflects in them.
- **You:** sit back in a chair with back support, arms resting on your thighs or the armrests. Phone on silent.
- Close other apps that use the camera (Teams, Zoom, browser tabs with camera).

### OBS checklist (do before starting the app)
1. OBS → Settings → Video: Base and Output **1920×1080**, **30 fps**. Output → Recording format **mkv** (crash-safe;
   File → Remux to mp4 later).
2. Audio: mute Mic/Aux and Desktop Audio (the video gets a voice-over later).
3. Start the app first (step 1 below), then in OBS add **Source → Window Capture → [electron.exe]: Paceprint**,
   capture method "Windows 10 (1903 and up)". Right-click → Transform → Fit to screen.
4. **Do NOT add a Video Capture Device (webcam) source** in OBS: it would fight the app for the camera.
5. Make sure no terminal with the `.env` contents or anything personal is visible. Maximize the Paceprint window.

### The run
1. Start the app:
   ```powershell
   cd <project folder>
   npm start
   ```
2. Click **Your data** (top right) → tick **Save session data** → Close. (Must be on **before** Accept.)
3. **Start recording in OBS.**
4. Scroll the consent screen slowly once (for the video), tick both boxes, click **Accept and turn on camera**.
5. Setup check: wait until every item is green for 3 seconds, then click **Start**.
6. **Baseline (60 s):** breathe normally, stay still and quiet.
7. **Pace 1 (7.0/min):** follow the circle. After the 30 s "Settling in", the label changes to "Measuring".
   - About **15 s into Measuring**: **talk for ~10 s** (e.g. "I'm talking now so you can see Paceprint refuse
     this data"). The yellow "Paused: Talking" card should appear and the timer should stop.
   - Then stay still and quiet for about **20 s**.
   - Then **turn your head side to side and lift your arms for ~5 s**. Expect "Paused: Moving".
   - Then stay still and quiet for the rest of the session.
8. After each pace, rate how easy it felt (keys **1–5** or click). Be honest.
9. Paces 2–5: just follow the circle. Don't talk or move.
10. **Result:** leave it on screen for ~20 s (for the video). Click **Save Pace Card (PNG)**.
11. Click **Start 5-minute guided session**, sit as before, breathe with the circle until it ends.
12. Stop recording in OBS.
13. Tell Claude **"live test done"**, plus anything odd (chips never green, stuck screens, numbers that looked
    wrong). Claude will run `npm run promote-recording` on your saved session
    (`%APPDATA%\paceprint\paceprint-data\recordings\`, numbers only, no video) to make it the Judge Mode session.

If something breaks, restart with logs and paste the terminal output to Claude:
```powershell
$env:PACEPRINT_DEVTOOLS = "1"; npm start
```

## 4. Making the repo public — SUNDAY, two steps left
**Already done (Sat Nov 21, ~01:40):** backup bundle made (`..\paceprint-backup-20261121.bundle`, outside the
repo; it still holds the OLD history, so keep it private and delete it after submission); every old version of
CLAUDE.md purged from history; your local project path scrubbed from history; the public-safe CLAUDE.md
re-added in one fresh commit; pushed to the **private** GitHub repo as a normal fast-forward on top of GitHub's
own "Initial commit" (nothing on GitHub was overwritten). A fresh clone from GitHub was scanned: no API key,
no old brief, no local paths, no email, no `BRIEF.private.md`, one CLAUDE.md version, no attribution lines.
(`..\BRIEF.private.backup.md` is a spare copy of the brief, also outside the repo.)

Left for Sunday, after the last commit (Claude runs step 1 with you):
1. **Final secret scan** of everything committed since: the key, local paths, your username, email/phone,
   recordings that aren't numbers-only metric streams (only `tests/fixtures/*.json` may exist), any mention of
   `BRIEF.private.md` other than the one line in CLAUDE.md. Note: `docs/devpost.md` says you're a final-year
   pharmacy student; that's intentional for the post, so keep or remove it as you prefer.
2. **Flip visibility:** GitHub → paceprint → Settings → General → Danger Zone → Change visibility → Public.
   (Or: `gh repo edit Bennytimz/paceprint --visibility public --accept-visibility-change-consequences`.)

## 5. Sunday: video, post, submit — details added before the freeze (Sun Nov 22, 08:00)
The pipeline is ready and rehearsed: `python scripts/make-video.py --video raw-cut.mp4` turns your cut footage
into `video-out\paceprint-demo.mp4` (1080p, Jenny voice, burned-in subtitles). Exact steps and variants are in
`docs/demo-script.md` → "Production steps". Nothing to install; Python, edge-tts and ffmpeg are already set up.

**Keep the voice-over in line with the screen.** Before uploading, watch the whole video once with sound on.
Every narrated line must describe what is visible at that moment: "watch what happens when I talk" must land
on the yellow "Paused: Talking" card, the result lines on the result screen, the guided line on the guided
session. If the live run differs from the script (for example the refusal says "Moving" first, or the
result says "weak peak"), change the narration words in the table to match what actually happened. Never
narrate something the footage doesn't show. Then re-run the command (about 30 s).

You: upload the video, publish the DEV post, submit by 18:00.

## Feedback
(write here)
