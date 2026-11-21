"""Paceprint demo video: narration + subtitles + 1080p export, all from docs/demo-script.md.

The narration table in docs/demo-script.md is the single source of truth:
  | # | Time | On screen | Narration |
The START of each "Time" cell (e.g. 1:25 in "1:25–1:40") is when that line begins in the final video.
To re-time, edit the table (or override one line with --at 5=1:31) and run again.

  python scripts/make-video.py --video raw.mp4                  # full video -> video-out/paceprint-demo.mp4
  python scripts/make-video.py --video clip.mp4 --lines 4,5 --at 4=0:00,5=0:17   # a part, re-timed
  python scripts/make-video.py --voice-only                     # just narration.wav + subtitles.srt

Needs: Python 3.9+, `pip install edge-tts`, ffmpeg + ffprobe on PATH.
edge-tts sends the narration text (only that) to Microsoft's online text-to-speech service.
"""
import argparse, asyncio, json, os, re, subprocess, sys, textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCRIPT = ROOT / 'docs' / 'demo-script.md'
OUT = ROOT / 'video-out'


def mmss(s: str) -> float:
    s = s.strip()
    if ':' in s:
        m, sec = s.split(':')
        return int(m) * 60 + float(sec)
    return float(s)


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}'


def read_lines(path: Path):
    rows = []
    for line in path.read_text(encoding='utf-8').splitlines():
        m = re.match(r'^\|\s*(\d+)\s*\|\s*([\d:.]+)\s*[–-]\s*([\d:.]+)\s*\|(.*)\|(.*)\|\s*$', line)
        if m:
            rows.append({'n': int(m[1]), 'start': mmss(m[2]), 'end': mmss(m[3]), 'text': m[5].strip()})
    if not rows:
        sys.exit(f'No narration rows found in {path}')
    return rows


async def tts(text: str, voice: str, rate: str, out_mp3: Path):
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary='SentenceBoundary')
    sentences = []
    with open(out_mp3, 'wb') as f:
        async for chunk in comm.stream():
            if chunk['type'] == 'audio':
                f.write(chunk['data'])
            elif chunk['type'] == 'SentenceBoundary':
                sentences.append({'t': chunk['offset'] / 1e7, 'd': chunk['duration'] / 1e7, 'text': chunk['text']})
    return sentences


def duration(path: Path) -> float:
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)['format']['duration'])


def cues_for(sentences, offset: float, max_chars: int):
    """One cue per sentence; long sentences split into ~2-line chunks, timed by character share."""
    cues = []
    for s in sentences:
        words, chunks, cur = s['text'].split(), [], ''
        for w in words:
            if cur and len(cur) + 1 + len(w) > max_chars * 2:
                chunks.append(cur); cur = w
            else:
                cur = f'{cur} {w}'.strip()
        if cur:
            chunks.append(cur)
        total = sum(len(c) for c in chunks) or 1
        t = offset + s['t']
        for c in chunks:
            d = s['d'] * len(c) / total
            cues.append((t, t + d, '\n'.join(textwrap.wrap(c, max_chars))))
            t += d
    return cues


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--video', help='screen recording to narrate (any size/fps)')
    ap.add_argument('--script', default=str(DEFAULT_SCRIPT))
    ap.add_argument('--voice', default='en-US-JennyNeural')
    ap.add_argument('--rate', default='-4%', help='speaking rate, e.g. -10%% or +0%%')
    ap.add_argument('--lines', help='only these line numbers, e.g. 4,5')
    ap.add_argument('--at', default='', help='override start times, e.g. 4=0:00,5=0:17')
    ap.add_argument('--out', default=str(OUT / 'paceprint-demo.mp4'))
    ap.add_argument('--voice-only', action='store_true', help='make narration.wav + subtitles.srt, no video')
    ap.add_argument('--keep-audio', type=float, default=0.0, help='mix the recording\'s own audio at this volume (0 = drop it)')
    ap.add_argument('--max-chars', type=int, default=46, help='subtitle line length')
    a = ap.parse_args()

    rows = read_lines(Path(a.script))
    if a.lines:
        keep = {int(x) for x in a.lines.split(',')}
        rows = [r for r in rows if r['n'] in keep]
    for kv in filter(None, a.at.split(',')):
        n, t = kv.split('=')
        for r in rows:
            if r['n'] == int(n):
                r['start'] = mmss(t)

    OUT.mkdir(exist_ok=True)
    clips = OUT / 'clips'
    clips.mkdir(exist_ok=True)
    cues, inputs, warnings = [], [], []
    for r in rows:
        mp3 = clips / f'line{r["n"]:02}.mp3'
        sentences = asyncio.run(tts(r['text'], a.voice, a.rate, mp3))
        d = duration(mp3)
        nxt = min((x['start'] for x in rows if x['start'] > r['start']), default=None)
        if nxt is not None and r['start'] + d > nxt:
            warnings.append(f'line {r["n"]}: speech is {d:.1f}s and runs {r["start"] + d - nxt:.1f}s into line starting at {nxt:.1f}s')
        print(f'line {r["n"]:>2}  starts {r["start"]:6.1f}s  speech {d:5.1f}s  {r["text"][:60]}')
        cues += cues_for(sentences, r['start'], a.max_chars)
        inputs.append((mp3, r['start']))

    srt = OUT / 'subtitles.srt'
    srt.write_text(''.join(f'{i}\n{srt_time(s)} --> {srt_time(e)}\n{t}\n\n' for i, (s, e, t) in enumerate(cues, 1)), encoding='utf-8')

    # narration track: every clip placed at its start time
    wav = OUT / 'narration.wav'
    cmd = ['ffmpeg', '-v', 'error', '-y']
    for mp3, _ in inputs:
        cmd += ['-i', str(mp3)]
    parts = ''.join(f'[{i}:a]adelay={int(st * 1000)}:all=1[a{i}];' for i, (_, st) in enumerate(inputs))
    mix = ''.join(f'[a{i}]' for i in range(len(inputs)))
    cmd += ['-filter_complex', f'{parts}{mix}amix=inputs={len(inputs)}:normalize=0,aresample=48000[out]', '-map', '[out]', str(wav)]
    subprocess.run(cmd, check=True)
    print(f'wrote {wav} ({duration(wav):.1f}s) and {srt} ({len(cues)} cues)')
    for w in warnings:
        print('WARNING', w)
    if a.voice_only or not a.video:
        return

    video = Path(a.video).resolve()
    vdur = duration(video)
    last = max(e for _, e, _ in cues)
    if last > vdur:
        print(f'WARNING narration ends at {last:.1f}s but the video is {vdur:.1f}s; the end will be cut')
    style = ('FontName=Segoe UI,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,'
             'BackColour=&H30000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=28,Alignment=2')
    vf = (f'scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0d1117,'
          f'fps=30,format=yuv420p,subtitles=subtitles.srt:force_style=\'{style}\'')
    if a.keep_audio > 0:
        af = ['-filter_complex', f'[0:a]volume={a.keep_audio}[o];[1:a][o]amix=inputs=2:normalize=0[a]', '-map', '0:v', '-map', '[a]']
    else:
        af = ['-map', '0:v', '-map', '1:a']
    out = Path(a.out).resolve()
    # run inside video-out so the subtitles path needs no Windows escaping
    subprocess.run(['ffmpeg', '-v', 'error', '-stats', '-y', '-i', str(video), '-i', 'narration.wav', *af,
                    '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '192k',
                    '-t', f'{vdur:.3f}', '-movflags', '+faststart', str(out)], check=True, cwd=OUT)
    print(f'wrote {out} ({duration(out):.1f}s, 1920x1080)')


if __name__ == '__main__':
    main()
