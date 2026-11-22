# FINISH: what's left for you (6 steps)

Everything else is done and pushed: the video is built (`video-out/paceprint-demo.mp4`, 2:51, 1080p, voice-over
and burned-in subtitles), the post is filled in, Judge Mode can't delete anything, and the final secret scan passed.

1. **Make the repo public** (the post's images load from GitHub, so do this first): GitHub → paceprint → Settings →
   General → Danger Zone → Change visibility → Public.
2. **Upload the video to YouTube**: `video-out\paceprint-demo.mp4`, visibility Public or Unlisted. Copy its link.
3. **Fill the two lines in `docs/devpost.md`**:
   - line 5: `cover_image: https://raw.githubusercontent.com/Bennytimz/paceprint/main/paceprint-card-2026-11-22.png`
   - line 22: `{% embed <your YouTube link> %}`
4. **Publish on DEV**: open dev.to/new, paste all of `docs/devpost.md`, check the preview (cover card, video,
   images), then Publish before 18:00. Publishing with the `presagechallenge` tag is the submission.
5. **Delete the old-history backup** now that you've submitted: `..\paceprint-backup-20261121.bundle` (outside the repo).
6. (Optional) Watch the video once with the sound on before step 2. Every line was checked against its scene.
