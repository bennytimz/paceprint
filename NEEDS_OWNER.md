# NEEDS_OWNER — tasks only Benny can do

Times are Lagos (WAT). Claude keeps building against replay/simulated data meanwhile.

## 1. API key — DONE (found in .env at 00:25; a 60 s auth test passed)

## 2. Run the live spike (≈3 min) — NEEDED BY: Sat Nov 21, 10:00 (do it in daylight or a well-lit room)
The 00:25 test saw only "Too dark" / "No face". Sit ~1 m from the laptop camera, face and chest visible, even front light, laptop on a table.
```powershell
cd <project folder>
npm run spike
```
It runs 150 s: breathe normally for 60 s, then follow the on-screen prompt
(it will ask you to breathe at **7 breaths/min for 45 s**, then **5 breaths/min for 45 s**,
counting "in…out" in the terminal). Stay still and do not talk.
When it ends it writes `recordings/spike-<time>.json` and prints PASS/FAIL per signal.
Then just tell Claude "spike done" — Claude reads the file itself.

Important: if it prints `Failed to load device keys` or `kMetricNotAuthorized`, your key is
**not provisioned for cardio metrics** (pulse / pressure trace / HRV). Then do task 3.

## 3. (Only if cardio is not authorized) Ask Presage — NEEDED BY: Sat Nov 21, 12:00
Post in the Presage Discord (challenge channel) or email support@presagetech.com:
> Hi, I'm building a #presagechallenge entry with @smartspectra/node-sdk 3.5.0 on Windows.
> My key returns "not authorized" for PULSE_RATE / ARTERIAL_PRESSURE_TRACE / HRV.
> Could cardio metrics be enabled on my challenge key? Thank you!

## 4. Live app test on camera — NEEDED BY: Sat Nov 21, 18:00
```powershell
npm start
```
Walk through consent → setup → baseline → sweep. Try talking and moving during a stage to check the
app pauses and says why. Note anything confusing in this file under "Feedback".

## 4b. Decide: CLAUDE.md in the public repo — NEEDED BY: Sun Nov 22, 12:00
CLAUDE.md (committed) contains our competitive notes about other entries. Before making the repo public, either keep it (shows the agent workflow) or remove it:
```powershell
git rm --cached CLAUDE.md; Add-Content .gitignore "CLAUDE.md"; git commit -m "Keep agent brief local"
```

## 4c. FYI: Presage has its own "Coherence by Presage Tech" iOS app — check by Sun 12:00
App Store: https://apps.apple.com/us/app/id6758461062 . If it already finds a personal breathing pace from the camera, we should mention it under Prior art (README) so judges do not think we missed it. Tell Claude what it does.

## 5. Later (Sun): OBS recording, publish post, make repo public, submit
Details will be added here before the freeze (Sun Nov 22, 08:00).

## Feedback
(write here)
