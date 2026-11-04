#!/usr/bin/env python3
"""Moody period edit (1910s-20s industrial England) from public-domain archive film.

  python era_edit.py fetch  [--query ...] [-n 6]   # search + download PD films -> footage/raw/
  python era_edit.py shots                         # detect & rank shots -> footage/shots.json
  python era_edit.py sheet                         # contact sheet per film -> footage/sheets/*.jpg
  python era_edit.py render [--plan plan.json]     # build the 30 s edit -> clips/era_edit.mp4
  python era_edit.py demo                          # synthetic footage, end-to-end test (no network)

Look: crushed blacks, split-tone (cold shadows / amber highlights), 2.39:1 letterbox,
grain, vignette, slight slow motion, cuts locked to a heartbeat-and-drone score that is
synthesised here (no copyrighted music). Captions are original text.

Rights: only films whose Archive.org licenseurl is PD/CC, or that were published in or
before 1930 (public domain in the US), are downloaded. Provenance -> footage/raw/*.source.txt
"""
import argparse
import json
import random
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW, SHOTS, SHEETS = ROOT / "footage/raw", ROOT / "footage/shots.json", ROOT / "footage/sheets"
OUT = ROOT / "clips"
FONT_TYPE = "/usr/share/fonts/X11/Type1/c0583bt_.pfb"            # Courier 10 Pitch Bold (typewriter)
FONT_TITLE = "/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf"
PD_YEAR = 1930  # US: works published 1930 or earlier are public domain in 2026

DEFAULT_QUERIES = [
    '"Birmingham" 1920s', '"Black Country"', "coal mining England", "steel works Sheffield",
    "industrial England 1920s", "Manchester 1920s", "England street scenes 1910s",
    "horse drawn England", "canal barge England", "factory workers 1920s",
]

# Output-time shot lengths (s). Beat = 0.75 s, bar = 1.5 s; every cut lands on a heartbeat.
INTRO, OUTRO = 2.0, 4.0
RHYTHM = [3, 3, 3, 3, 3, 1.5, 1.5, 1.5, 1.5, 3]      # 24 s -> total 30 s
SPEED = 0.8                                          # silent-era film runs fast; slow it down


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def ff(*args):
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)])


def duration(path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", str(path)], capture_output=True, text=True,
                                check=True).stdout)


# ----------------------------------------------------------------------------- fetch
def ia_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "era-edit/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def rights_ok(doc) -> tuple[bool, str]:
    lic = doc.get("licenseurl") or ""
    if re.search(r"creativecommons|publicdomain", lic, re.I):
        return True, lic
    year = str(doc.get("year") or doc.get("date") or "")[:4]
    if year.isdigit() and int(year) <= PD_YEAR:
        return True, f"published {year} (<= {PD_YEAR}: public domain in the US)"
    return False, lic or "no license, year unknown"


def cmd_fetch(a):
    RAW.mkdir(parents=True, exist_ok=True)
    seen, got = set(), 0
    for q in a.query or DEFAULT_QUERIES:
        if got >= a.n:
            break
        params = [("q", f"({q}) AND mediatype:(movies) AND year:[1895 TO 1935]"), ("rows", "15"),
                  ("output", "json"), ("sort[]", "downloads desc")]
        params += [("fl[]", f) for f in ("identifier", "title", "licenseurl", "year", "date")]
        try:
            docs = ia_json("https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(params))["response"]["docs"]
        except Exception as e:
            sys.exit(f"Archive.org unreachable ({e}). Allow archive.org in the network settings.")
        for d in docs:
            ident = d["identifier"]
            if ident in seen or got >= a.n:
                continue
            seen.add(ident)
            ok, why = rights_ok(d)
            if not ok:
                print(f"skip  {ident}: {why}")
                continue
            files = ia_json(f"https://archive.org/metadata/{ident}").get("files", [])
            mp4s = [f for f in files if f["name"].lower().endswith(".mp4")]
            if not mp4s:
                continue
            f = min(mp4s, key=lambda f: int(f.get("size") or 1 << 40))   # smallest derivative is plenty
            if int(f.get("size") or 0) > a.max_mb * 1 << 20:
                print(f"skip  {ident}: {int(f['size']) >> 20} MB > {a.max_mb} MB")
                continue
            dest = RAW / f"{ident}.mp4"
            url = f"https://archive.org/download/{ident}/{urllib.parse.quote(f['name'])}"
            print(f"get   {ident}  ({d.get('title')})")
            urllib.request.urlretrieve(url, dest)
            (RAW / f"{ident}.source.txt").write_text(
                f"title: {d.get('title')}\nurl: https://archive.org/details/{ident}\nrights: {why}\n")
            got += 1
    print(f"{got} film(s) in {RAW}")


# ----------------------------------------------------------------------------- shots
def analyse(path: Path) -> list[dict]:
    """Per-frame scene score + luma -> shots with motion/brightness stats."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path), "-an", "-vf",
         "scale=160:-2,select='gte(scene,0)',signalstats,metadata=print:file=-", "-f", "null", "-"],
        capture_output=True, text=True).stdout
    frames, cur = [], {}
    for line in out.splitlines():
        if line.startswith("frame:"):
            if cur:
                frames.append(cur)
            cur = {"t": float(re.search(r"pts_time:([\d.]+)", line).group(1))}
        elif "lavfi.scene_score=" in line:
            cur["s"] = float(line.split("=")[1])
        elif "lavfi.signalstats.YAVG=" in line:
            cur["y"] = float(line.split("=")[1])
        elif "lavfi.signalstats.YDIF=" in line:
            cur["d"] = float(line.split("=")[1])
    if cur:
        frames.append(cur)
    shots, start = [], 0
    for i in range(1, len(frames) + 1):
        if i == len(frames) or frames[i].get("s", 0) > 0.3:
            seg = frames[start:i]
            if len(seg) > 3:
                t0, t1 = seg[0]["t"], seg[-1]["t"]
                ys = [f.get("y", 0) for f in seg]
                shots.append({"src": path.name, "start": round(t0, 2), "dur": round(t1 - t0, 2),
                              "luma": round(sum(ys) / len(ys), 1),
                              "contrast": round(max(ys) - min(ys), 1),
                              "motion": round(sum(f.get("d", 0) for f in seg) / len(seg), 2)})
            start = i
    return shots


def usable(s, need):
    # drop too-short, near-black/blown-out, and static shots (intertitles, title cards)
    return s["dur"] >= need + 0.6 and 30 < s["luma"] < 200 and s["motion"] > 1.5


def cmd_shots(a):
    films = sorted(RAW.glob("*.mp4"))
    if not films:
        sys.exit(f"No films in {RAW}; run fetch first.")
    allshots = []
    for f in films:
        sh = analyse(f)
        print(f"{f.name}: {len(sh)} shots, {sum(usable(s, 1.5 * SPEED) for s in sh)} usable")
        allshots += sh
    SHOTS.write_text(json.dumps(allshots, indent=1))
    print(f"-> {SHOTS}")


def cmd_sheet(a):
    """One contact sheet per film, with timestamps, to hand-pick shots for a plan."""
    SHEETS.mkdir(parents=True, exist_ok=True)
    for f in sorted(RAW.glob("*.mp4")):
        d = duration(f)
        step = max(d / 48, 0.5)
        ff("-i", f, "-vf",
           f"fps=1/{step:.3f},scale=320:-2,drawtext=fontfile={FONT_TYPE}:text='%{{pts\\:hms\\:0\\:{step:.3f}}}':"
           "x=4:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=8x6",
           "-frames:v", 1, SHEETS / f"{f.stem}.jpg")
        print(SHEETS / f"{f.stem}.jpg")


# ----------------------------------------------------------------------------- render
def auto_plan(seed) -> list[dict]:
    shots = json.loads(SHOTS.read_text())
    rnd = random.Random(seed)
    plan, used = [], set()
    # long shots yield several non-overlapping windows
    win = max(RHYTHM) * SPEED + 0.6
    windows = []
    for s in shots:
        k = max(1, int(s["dur"] // win))
        for j in range(k):
            windows.append({**s, "start": round(s["start"] + j * win, 2), "dur": s["dur"] if k == 1 else win})
    pool = sorted(windows, key=lambda s: -(s["motion"] * 0.5 + s["contrast"] * 0.05))
    for i, beat in enumerate(RHYTHM):
        need = beat * SPEED
        cands = [s for s in pool if usable(s, need) and (s["src"], s["start"]) not in used]
        # avoid two consecutive shots from the same film when possible
        prev = plan[-1]["src"] if plan else None
        cands = [s for s in cands if s["src"] != prev] or cands
        if not cands:
            sys.exit(f"Not enough usable shots for slot {i + 1}; fetch more footage.")
        s = rnd.choice(cands[:6])
        used.add((s["src"], s["start"]))
        # take the middle of the shot (avoid splice frames at the ends)
        start = s["start"] + max(0.3, (s["dur"] - need) / 2)
        plan.append({"src": s["src"], "start": round(start, 2), "ypos": 0.5})
    return plan


def grade_shot(src: Path, start: float, out_dur: float, ypos: float, w: int, h: int, dst: Path):
    fill = (f"scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h}:(iw-{w})/2:(ih-{h})*{ypos}")
    look = ",".join([
        "format=yuv420p", "hue=s=0",                                     # unify: true B&W base
        "eq=contrast=1.35:brightness=-0.06:gamma=0.9",                     # crush blacks
        "curves=master='0/0 0.25/0.15 0.6/0.62 1/0.95'",                   # filmic S-curve, soft top
        "colorbalance=rs=-0.08:gs=0.0:bs=0.10:rh=0.12:gh=0.05:bh=-0.10",   # cold shadows, amber highs
        "eq=saturation=1.6",
    ])
    vf = (f"setpts=(PTS-STARTPTS)/{SPEED},fps=25,{fill},{look},"
          f"trim=duration={out_dur},setpts=PTS-STARTPTS")
    ff("-ss", f"{start:.2f}", "-t", f"{out_dur * SPEED + 0.5:.2f}", "-i", src, "-an",
       "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-r", 25, dst)


def typewriter(text, t0, cps, size, y, total_ref):
    """drawtext chain revealing one character at a time (text via files: no escaping issues)."""
    tmp = Path(tempfile.mkdtemp())
    filters = []
    for i in range(1, len(text) + 1):
        if text[i - 1] == " " and i < len(text):
            continue
        p = tmp / f"t{i}.txt"
        p.write_text(text[:i])
        a, b = t0 + (i - 1) / cps, (t0 + i / cps) if i < len(text) else total_ref
        filters.append(f"drawtext=fontfile={FONT_TYPE}:textfile={p}:fontsize={size}:fontcolor=0xE8DCC0:"
                       f"x=(w-tw)/2:y={y}:enable='between(t,{a:.3f},{b:.3f})'")
    return filters


def score(total, dst: Path):
    """Original score: low drone + heartbeat kick on every bar, swelling, then a final boom."""
    end = total - OUTRO
    kick = "sin(2*PI*(38+90*exp(-X*28))*X)*exp(-X*8)*gte(X,0)"
    lub = kick.replace("X", f"mod(t-{INTRO},1.5)")
    dub = kick.replace("X", f"mod(t-{INTRO}-0.27,1.5)")
    swell = f"(0.35+0.65*(t-{INTRO})/{end - INTRO})"
    beats = f"({lub}+0.6*{dub})*{swell}*between(t,{INTRO},{end - 0.05})"
    boom = "sin(2*PI*(28+70*exp(-Y*9))*Y)*exp(-Y*1.2)*gte(Y,0)".replace("Y", f"(t-{end})")
    drone = ("(0.22*sin(2*PI*55*t)+0.10*sin(2*PI*82.41*t)+0.06*sin(2*PI*110.3*t+sin(2*PI*0.2*t)))"
             "*(0.75+0.25*sin(2*PI*0.13*t))")
    expr = f"0.5*{drone}+0.9*{beats}+1.1*{boom}"
    ff("-f", "lavfi", "-i", f"aevalsrc='{expr}':s=48000:d={total}",
       "-f", "lavfi", "-i", f"anoisesrc=c=brown:a=0.08:d={total}:r=48000",
       "-filter_complex",
       "[1]lowpass=f=400,volume=0.6[wind];"
       "[0][wind]amix=inputs=2:normalize=0,aecho=0.8:0.6:90|180:0.25|0.15,"
       f"afade=t=in:d=1.5,afade=t=out:st={total - 1.2}:d=1.2,loudnorm=I=-16:TP=-1.5,"
       "aformat=channel_layouts=stereo",
       "-c:a", "aac", "-b:a", "192k", dst)


def cmd_render(a):
    plan = json.loads(Path(a.plan).read_text()) if a.plan else auto_plan(a.seed)
    if len(plan) != len(RHYTHM):
        sys.exit(f"plan needs exactly {len(RHYTHM)} shots")
    w, h = (1080, 1920) if a.vertical else (1920, 1080)
    total = INTRO + sum(RHYTHM) + OUTRO
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmpd:
        tmp = Path(tmpd)
        parts = []
        ff("-f", "lavfi", "-i", f"color=black:s={w}x{h}:r=25:d={INTRO}", "-c:v", "libx264",
           "-crf", "14", "-pix_fmt", "yuv420p", tmp / "p00.mp4")
        parts.append(tmp / "p00.mp4")
        for i, (p, beat) in enumerate(zip(plan, RHYTHM), 1):
            dst = tmp / f"p{i:02d}.mp4"
            grade_shot(RAW / p["src"], p["start"], beat, p.get("ypos", 0.5), w, h, dst)
            parts.append(dst)
            print(f"shot {i:2d}: {p['src']} @ {p['start']}s  ({beat}s)")
        # end card: last shot's final frame would be busy; use black with the title
        ff("-f", "lavfi", "-i", f"color=black:s={w}x{h}:r=25:d={OUTRO}", "-c:v", "libx264",
           "-crf", "14", "-pix_fmt", "yuv420p", tmp / "p99.mp4")
        parts.append(tmp / "p99.mp4")
        (tmp / "list.txt").write_text("".join(f"file '{p}'\n" for p in parts))
        ff("-f", "concat", "-safe", 0, "-i", tmp / "list.txt", "-c", "copy", tmp / "cut.mp4")

        score(total, tmp / "score.m4a")

        bar = int(h - w / 2.39) // 2 if not a.vertical else int(h * 0.09)
        title_file, sub_file = tmp / "title.txt", tmp / "sub.txt"
        title_file.write_text(a.title)
        sub_file.write_text(a.subtitle)
        end = total - OUTRO
        fs = h // 24 if not a.vertical else w // 22
        vf = [
            "noise=alls=14:allf=t+u",                                  # film grain
            "vignette=PI/4.5",
            # tiny exposure flicker, like a hand-cranked projector
            "eq=brightness='0.015*sin(2*PI*7.3*t)*sin(2*PI*1.1*t)':eval=frame",
            *typewriter(a.caption, 0.25, 18, fs, f"(h-th)/2", INTRO + 1.2),
            f"drawbox=x=0:y=0:w=iw:h={bar}:color=black:t=fill",          # letterbox
            f"drawbox=x=0:y=ih-{bar}:w=iw:h={bar}:color=black:t=fill",
            f"drawtext=fontfile={FONT_TITLE}:textfile={title_file}:fontsize={int(fs * 2.4)}:"
            f"fontcolor=0xE8DCC0:x=(w-tw)/2:y=(h-th)/2-{fs}:"
            f"alpha='min(1,max(0,(t-{end + 0.35})/0.8))':enable='gte(t,{end})'",
            f"drawtext=fontfile={FONT_TYPE}:textfile={sub_file}:fontsize={int(fs * 0.8)}:"
            f"fontcolor=0xB8A888:x=(w-tw)/2:y=(h/2)+{int(fs * 1.4)}:"
            f"alpha='min(1,max(0,(t-{end + 1.1})/0.8))':enable='gte(t,{end})'",
            f"fade=t=out:st={total - 0.6}:d=0.6",
            "format=yuv420p",
        ]
        dst = OUT / (a.out or ("era_edit_vertical.mp4" if a.vertical else "era_edit.mp4"))
        ff("-i", tmp / "cut.mp4", "-i", tmp / "score.m4a", "-filter_complex",
           f"[0:v]{','.join(vf)}[v]", "-map", "[v]", "-map", "1:a", "-t", total,
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "copy",
           "-movflags", "+faststart", dst)
    # credits for every source used
    srcs = sorted({p["src"] for p in plan})
    credits = "\n".join((RAW / Path(s).with_suffix(".source.txt").name).read_text()
                        if (RAW / Path(s).with_suffix(".source.txt").name).exists() else s for s in srcs)
    dst.with_suffix(".credits.txt").write_text(
        "Footage (public domain / CC):\n\n" + credits + "\nScore: synthesised for this edit (original).\n")
    (dst.with_suffix(".plan.json")).write_text(json.dumps(plan, indent=1))
    print(f"\n-> {dst}  ({duration(dst):.1f}s)\n   credits: {dst.with_suffix('.credits.txt')}")


# ----------------------------------------------------------------------------- demo
def cmd_demo(a):
    """Synthetic 'archive films' (4:3, 18 fps, B&W, with intertitles) to test the pipeline offline."""
    global RAW, SHOTS
    RAW, SHOTS = ROOT / "footage/demo", ROOT / "footage/demo_shots.json"
    a.out = a.out or "era_edit_DEMO.mp4"
    RAW.mkdir(parents=True, exist_ok=True)
    srcs = ["life=s=320x240:mold=10:r=18:ratio=0.1:death_color=#C0C0C0:life_color=#202020",
            "mandelbrot=s=320x240:r=18", "testsrc2=s=320x240:r=18", "cellauto=s=320x240:r=18:rule=110"]
    for i, s in enumerate(srcs):
        f = RAW / f"demo{i}.mp4"
        segs = []
        for j in range(4):   # 4 shots of 5 s, separated by hard cuts, plus a static intertitle
            segs.append(f"[{j}]hue=s=0,eq=brightness={(j - 1.5) * 0.05}[s{j}]")
        title = (f"color=black:s=320x240:r=18:d=3,drawtext=fontfile={FONT_TITLE}:text='Intertitle':"
                 "fontcolor=white:fontsize=30:x=(w-tw)/2:y=(h-th)/2")
        inputs = []
        for j in range(4):
            inputs += ["-f", "lavfi", "-t", "5", "-i", f"{s},crop=320:240:{j * 20}:0" if "testsrc" in s else s]
        inputs += ["-f", "lavfi", "-i", title]
        fc = ";".join(segs) + ";[s0][s1][4][s2][s3]concat=n=5:v=1:a=0,noise=alls=10:allf=t,format=yuv420p[v]"
        ff(*inputs, "-filter_complex", fc, "-map", "[v]", "-c:v", "libx264", "-crf", 23, f)
        (RAW / f"demo{i}.source.txt").write_text(f"title: synthetic demo film {i}\nrights: generated locally\n")
    print("demo footage ready; running shots + render")
    cmd_shots(a)
    cmd_render(a)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--query", action="append", help="Archive.org search (repeatable)")
    f.add_argument("-n", type=int, default=6, help="number of films")
    f.add_argument("--max-mb", type=int, default=400)
    sub.add_parser("shots")
    sub.add_parser("sheet")
    for name in ("render", "demo"):
        r = sub.add_parser(name)
        r.add_argument("--plan", help="JSON list of {src, start, ypos} (10 shots); default: auto-pick")
        r.add_argument("--seed", type=int, default=7)
        r.add_argument("--vertical", action="store_true", help="1080x1920 for Shorts/Reels/TikTok")
        r.add_argument("--caption", default="BIRMINGHAM, ENGLAND - 1919")
        r.add_argument("--title", default="SMOKE & STEEL")
        r.add_argument("--subtitle", default="the black country, after the war")
        r.add_argument("--out")
    a = ap.parse_args()
    {"fetch": cmd_fetch, "shots": cmd_shots, "sheet": cmd_sheet,
     "render": cmd_render, "demo": cmd_demo}[a.cmd](a)


if __name__ == "__main__":
    main()
