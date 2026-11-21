# NEEDS_OWNER — tasks only Benny can do

Times are Lagos (WAT). Claude keeps building against replay/simulated data meanwhile and never turns on
the camera or spends trial credits.

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

## 2. Ask Presage how many trial minutes you have — NEEDED BY: Sat Nov 21, 10:00
The SDK has no way to read your remaining credits (it only raises `kCreditExhausted` when they run out).
Options, quickest first:
- Log in at https://physiology.presagetech.com/ and look for a plan / usage / credits page.
- Or ask on the Presage Discord (challenge channel):
  > Hi! I'm building a #presagechallenge entry with @smartspectra/node-sdk 3.5.0 on Windows. How many trial
  > minutes/credits does a challenge key have, and how are they counted (per session start, per minute of
  > processing)? My full app run is about 16 minutes of camera time. Also, is my key enabled for cardio
  > metrics (pulse rate, arterial pressure trace, HRV)? Thank you!
- (Presage also has a hosted MCP server with a `usage.get_plan` tool that reports remaining credits; it needs
  you to connect your account, so the portal or Discord is simpler.)

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

## 4. Before making the repo public — ON SUNDAY, ONLY WHEN YOU TELL CLAUDE TO RUN IT
Nothing has been pushed yet (local `main` is ahead of GitHub), so the old full brief exists only in local
history. The full brief is now `BRIEF.private.md` (gitignored); `CLAUDE.md` is a short public-safe version.
Checklist (Claude will run it with you):
1. Backup everything:
   `git bundle create ..\paceprint-backup-YYYYMMDD.bundle --all`
2. Keep a copy of the public-safe file outside the repo: `copy CLAUDE.md ..\CLAUDE.public.md`
3. Purge every version of CLAUDE.md from history:
   `git filter-repo --path CLAUDE.md --invert-paths --force`
   (filter-repo removes the `origin` remote; re-add it: `git remote add origin https://github.com/Bennytimz/paceprint.git`)
4. Re-add the public-safe CLAUDE.md in a fresh commit:
   `copy ..\CLAUDE.public.md CLAUDE.md; git add CLAUDE.md; git commit -m "Add public project notes"`
5. Check all history and docs for: the API key; local paths (`C:\Users\...`, your Windows username); personal details
   (email, phone, real name where not intended, school/placement details); recordings that are not metric
   streams (only `tests/fixtures/*.json` should exist, and they must be numbers only); `BRIEF.private.md`
   must not appear anywhere.
6. Force-push to your private repo: `git push --force origin main`, then check on GitHub.
7. Then make the repo public.

## 5. Sunday: video, post, submit — details added before the freeze (Sun Nov 22, 08:00)
Voice-over and subtitles: Claude generates them (edge-tts + ffmpeg) from `docs/demo-script.md` once your OBS
footage exists. You: upload the video, publish the DEV post, submit by 18:00.

## Feedback
(write here)
