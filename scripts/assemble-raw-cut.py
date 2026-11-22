"""Builds the silent raw cut of the demo video, timed to docs/demo-script.md.

  node scripts/capture-judge.mjs                # first: records Judge Mode, writes judge.mp4, code.mp4, cuts.txt

  python scripts/assemble-raw-cut.py            # -> video-raw/raw-cut.mp4
  python scripts/make-video.py --video video-raw/raw-cut.mp4   # then: narration + subtitles + export

Inputs (video-raw/ is gitignored; the stills are in the repo):
  video-raw/judge.mp4          Judge Mode screen recording ("Simulated session" banner): scenes 2-6, 10 (and 8 if no live clip)
  video-raw/guided-live.mp4    your live guided-session clip: scene 8 (optional; falls back to judge.mp4)
  video-raw/code.mp4           VS Code clip: scene 9 (optional; falls back to a text card)
  video-raw/cuts.txt           where each scene starts inside its recording (written by you; template printed if missing)
  docs/media/real-result-1.png, docs/media/real-result-2.png, paceprint-card-2026-11-22.png: scene 7 (real result)
Scene 1 (title) and the end card in scene 10 are drawn here. Each scene is cut to exactly its length in the
script table: a source that is too short holds its last frame. No audio is kept from any recording.

Needs: Python 3.9+, ffmpeg + ffprobe on PATH.
"""
import argparse, importlib.util, os, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'video-raw'
FPS = 30
BG = '0x0e1116'
FONT = 'C\\:/Windows/Fonts/segoeuib.ttf' if os.name == 'nt' else '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
#: scene 7 stills, in order: (file, seconds, motion); the last one takes whatever time is left
STILLS = [
    (ROOT / 'docs' / 'media' / 'real-result-1.png', 12, 'zoom'),   # top of the result screen: pace, weak peak
    (ROOT / 'docs' / 'media' / 'real-result-2.png', 18, 'pan'),    # the table: swing, coupling, not read
    (ROOT / 'paceprint-card-2026-11-22.png', None, 'zoom'),        # the share card
]
END_CARD_S = 4  # last seconds of scene 10

CUTS_TEMPLATE = """# Where each scene starts inside its recording (m:ss). Watch the recording, note the time, fill in.
# scene  start
2  0:00   # judge.mp4: consent screen, before you scroll
3  0:00   # judge.mp4: setup check, checklist turning green
4  0:00   # judge.mp4: the sweep, pacer and traces moving
5  0:00   # judge.mp4: a few seconds before the "Paused: Moving" card
6  0:00   # judge.mp4: just before a felt-ease rating card appears
8  0:00   # guided-live.mp4 (or judge.mp4 if you have no live clip): guided session running
9  0:00   # code.mp4
10 0:00   # judge.mp4: just before you open "Your data"
"""


def load_script_rows():
    spec = importlib.util.spec_from_file_location('make_video', ROOT / 'scripts' / 'make-video.py')
    mv = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mv)
    rows = mv.read_lines(ROOT / 'docs' / 'demo-script.md')
    return {r['n']: r for r in rows}, mv.mmss


def run(args, cwd=None):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], cwd=cwd)
    if r.returncode:
        sys.exit(f'ffmpeg failed: {" ".join(args)}')


def probe_s(path: Path) -> float:
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True).stdout.strip()
    return float(out or 0)


FIT = f'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color={BG},setsar=1'
ENC = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS)]


def clip(src: Path, start: float, dur: float, out: Path):
    """dur seconds of src from start, fitted to 1080p; holds the last frame if src runs out."""
    run(['-ss', f'{start:.3f}', '-i', str(src), '-t', f'{dur:.3f}',
         '-vf', f'{FIT},fps={FPS},tpad=stop_mode=clone:stop_duration={dur:.3f}', '-t', f'{dur:.3f}', *ENC, str(out)])


def still(img: Path, dur: float, motion: str, out: Path):
    """A still with a slow 6 % zoom in ('zoom') or, at 8 % zoom, a slow pan from top to bottom ('pan'). Gentle, so table edges stay in frame."""
    n = round(dur * FPS)
    if motion == 'pan':
        z, x, y = '1.08', 'iw/2-(iw/zoom/2)', f'(ih-ih/zoom)*on/{n}'
    else:
        z, x, y = f'1+0.06*on/{n}', 'iw/2-(iw/zoom/2)', 'ih/2-(ih/zoom/2)'
    vf = f"{FIT},scale=3840:2160,zoompan=z='{z}':x='{x}':y='{y}':d=1:s=1920x1080:fps={FPS}"
    run(['-loop', '1', '-framerate', str(FPS), '-i', str(img), '-vf', vf, '-frames:v', str(n), *ENC, str(out)])


def card(lines, dur: float, out: Path, work: Path):
    """Text card: lines of (text, size, colour), centred."""
    filters, total = [], sum(int(s * 1.35) for _, s, _ in lines)
    y = f'(h-{total})/2'
    for i, (text, size, colour) in enumerate(lines):
        tf = work / f'{out.stem}-{i}.txt'
        tf.write_text(text, encoding='utf-8')
        filters.append(f"drawtext=fontfile='{FONT}':textfile='{tf.name}':fontcolor={colour}:fontsize={size}:x=(w-text_w)/2:y={y}")
        y += f'+{int(size * 1.35)}'
    run(['-f', 'lavfi', '-i', f'color=c={BG}:s=1920x1080:r={FPS}:d={dur:.3f}', '-vf', ','.join(filters), *ENC, out.name], cwd=work)


def read_cuts(path: Path, mmss):
    if not path.exists():
        path.parent.mkdir(exist_ok=True)
        path.write_text(CUTS_TEMPLATE, encoding='utf-8')
        sys.exit(f'Wrote a template to {path}. Fill in the start time of each scene, then run again.')
    cuts = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.split('#')[0].strip()
        if line:
            n, t = line.split()[:2]
            cuts[int(n)] = mmss(t)
    return cuts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', default=str(RAW), help='folder with judge.mp4, guided-live.mp4, code.mp4, cuts.txt')
    ap.add_argument('--out', default=None, help='output file (default: <raw>/raw-cut.mp4)')
    a = ap.parse_args()
    raw = Path(a.raw)
    out = Path(a.out) if a.out else raw / 'raw-cut.mp4'
    rows, mmss = load_script_rows()
    dur = {n: r['end'] - r['start'] for n, r in rows.items()}
    if sorted(rows) != list(range(1, 11)):
        sys.exit(f'Expected scenes 1-10 in docs/demo-script.md, found {sorted(rows)}')
    cuts = read_cuts(raw / 'cuts.txt', mmss)

    judge, guided, code = raw / 'judge.mp4', raw / 'guided-live.mp4', raw / 'code.mp4'
    missing = [str(p) for p in [judge, *[s[0] for s in STILLS]] if not p.exists()]
    if missing:
        sys.exit('Missing:\n  ' + '\n  '.join(missing))
    need = [n for n in (2, 3, 4, 5, 6, 8, 10) if n not in cuts] + ([9] if code.exists() and 9 not in cuts else [])
    if need:
        sys.exit(f'cuts.txt has no start time for scene(s) {need}')

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        segs = []

        def seg(name):
            p = work / f'{len(segs):02d}-{name}.mp4'
            segs.append(p)
            return p

        print('scene  length  source')
        card([('Paceprint', 120, '0xebe6dc'), ('Is six breaths a minute your pace?', 54, '0x74c7b4')], dur[1], seg('s1'), work)
        print(f' 1     {dur[1]:5.1f}s  title card')
        for n in (2, 3, 4, 5, 6):
            clip(judge, cuts[n], dur[n], seg(f's{n}'))
            print(f' {n}     {dur[n]:5.1f}s  judge.mp4 from {cuts[n]:.1f}s')
        left = dur[7]
        for i, (img, s, motion) in enumerate(STILLS):
            d = left if s is None else s
            left -= d
            still(img, d, motion, seg(f's7-{i}'))
            print(f' 7     {d:5.1f}s  {img.name} ({motion})')
        src8 = guided if guided.exists() else judge
        clip(src8, cuts[8], dur[8], seg('s8'))
        print(f' 8     {dur[8]:5.1f}s  {src8.name} from {cuts[8]:.1f}s')
        if code.exists():
            clip(code, cuts[9], dur[9], seg('s9'))
            print(f' 9     {dur[9]:5.1f}s  code.mp4 from {cuts[9]:.1f}s')
        else:
            card([('src/core/analysis.ts', 72, '0xebe6dc'), ('beats from the pulse waveform · phase locking · a validity layer', 40, '0x8d96a3')], dur[9], seg('s9'), work)
            print(f' 9     {dur[9]:5.1f}s  text card (no code.mp4)')
        clip(judge, cuts[10], dur[10] - END_CARD_S, seg('s10'))
        card([('github.com/Bennytimz/paceprint', 64, '0xebe6dc'), ('Wellness tool, not a medical device.', 40, '0x8d96a3')], END_CARD_S, seg('s10-end'), work)
        print(f'10     {dur[10]:5.1f}s  judge.mp4 from {cuts[10]:.1f}s, then end card {END_CARD_S}s')

        lst = work / 'list.txt'
        lst.write_text(''.join(f"file '{p.name}'\n" for p in segs), encoding='utf-8')
        out.parent.mkdir(parents=True, exist_ok=True)
        run(['-f', 'concat', '-safe', '0', '-i', lst.name, '-c', 'copy', str(out.resolve())], cwd=work)

    total, want = probe_s(out), rows[10]['end']
    print(f'\nwrote {out} ({total:.1f} s; script ends at {want:.0f} s)')
    if abs(total - want) > 0.5:
        print(f'WARNING: length differs from the script by {total - want:+.1f} s')
    print(f'next: python scripts/make-video.py --video {out}')


if __name__ == '__main__':
    main()
