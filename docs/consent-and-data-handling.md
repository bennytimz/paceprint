# Consent and data handling

## In short

- **What it does.** Paceprint uses your webcam to read your breathing and pulse signals while you breathe at a few slow paces, then shows which pace your heart rhythm and breathing moved together best.
- **Wellness only.** Paceprint is not a medical device. It does not diagnose, treat, or monitor any condition. Do not use it if you need medical monitoring. If you feel dizzy or unwell, stop and breathe normally.
- **Your video stays on this computer.** Paceprint never saves or sends video or camera frames.
- **What is saved.** Only session summaries (the paces, scores, your ease ratings, and times), in this computer's app data folder. If you switch on "Save session data" (off by default), also the signal numbers so you can replay a session, never video. Kept until you delete them. One click deletes everything.
- **No accounts, no cloud, no analytics, no AI services.**
- **The one network connection.** The camera analysis uses Presage's SmartSpectra SDK. It runs on this computer but connects to Presage (`cont-api.physiology.presagetech.com`) to check the API key, count usage, and download its models. Paceprint switches off the SDK's optional telemetry.
- **You are in control.** The camera starts only after you accept. A "Camera live" light shows whenever it is on. Stop turns it off at once.
- **18+ only.**

## Full details

### What Paceprint reads
While the camera is on, the SmartSpectra SDK turns the video into signals: breathing traces (chest and belly), breathing rate, pulse rate, a pulse waveform, heart-rate variability, a talking flag, a blinking flag, face position points, and an electrodermal-activity estimate. Paceprint uses these to guide you and to compute its result. Paceprint does not use facial-expression or emotion readings.

### What is stored, where, and for how long
- **Session summaries:** date and time, the paces tested, per-pace follow score, time to lock, heart-rhythm swing, your 1-5 ease ratings, the baseline values, and the result. Stored as files in this computer's app data folder (shown in the app under "Your data"). Kept until you delete them.
- **Settings:** your choices (for example sound and reduced motion), and the time you last accepted this notice.
- **Session data recordings (off by default):** if you turn on "Save session data", Paceprint also saves the signal stream (numbers only, never video) so you can replay a session. Off unless you switch it on.
- **Never stored:** video, camera frames, photos, or audio. Paceprint does not use the microphone.

### Deletion
"Delete everything" in "Your data" removes every file Paceprint created, immediately. You can also delete a single session. Uninstalling the app and deleting its folder also removes everything.

### Sharing
None. Paceprint has no accounts, no cloud sync, no analytics, and no advertising. Nothing is shared with anyone.

### Network use (measured)
We measured the app's network traffic at operating-system level (see `scripts/net-audit.md`). During a session the SDK made one encrypted connection, to Presage's API (`cont-api.physiology.presagetech.com`). It downloaded about 21 MB (the SDK's models) and the whole computer uploaded about 1.3 MB in 30 seconds, which is far less than video would need. The connection is encrypted, so we cannot read its content. Presage states that the SDK computes vitals on this computer, and that its telemetry (which Paceprint turns off) never includes video frames or measured vital signs. Presage can associate these requests with the API-key account. The Paceprint window itself makes no network requests. Judge Mode (the recorded demo) makes no network requests at all.

### AI services
None. Paceprint never sends data to an AI or language-model service. The SDK's optional "insights" feature, which sends measured values to a language model, is not used.

### Limitations
Camera-based readings can be less reliable with movement, talking, poor or flickering light, dark or tightly striped clothing, glasses glare, and may perform differently across skin tones. Paceprint checks for these and refuses to use data it cannot trust, but it can still be wrong. The camera's talking check is not reliable enough to discard data on, so Paceprint asks you to stay silent, warns you when it thinks you may be talking, and shows on your result how much of each pace was flagged. Results are relative to you on that day, never compared with population norms.

### Not a medical device
Paceprint is a wellness tool for self-awareness. It is not a medical device, is not cleared by any regulator, and must not be used for diagnosis, treatment, or any medical decision. The SDK's readings are offered by Presage for general wellness only.

### Your rights
You can stop at any time, delete your data at any time, and use the Judge Mode demo without a camera.
