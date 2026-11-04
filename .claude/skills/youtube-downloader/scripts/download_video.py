#!/usr/bin/env python3
"""Download a single video with quality/format options, honouring the rights rule.

Only public-domain, Creative Commons, or the user's own videos (--own) are downloaded.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

FREE = re.compile(r"creativecommons\.org|creative commons|\bcc[- ]?by\b|\bcc0\b|public ?domain|publicdomain", re.I)
HEIGHTS = {"1080p": 1080, "720p": 720, "480p": 480, "360p": 360}


def ensure_ytdlp() -> None:
    if shutil.which("yt-dlp"):
        return
    print("yt-dlp not found, installing...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "yt-dlp"], check=True)
    if not shutil.which("yt-dlp"):
        sys.exit("yt-dlp install failed; run: pip install yt-dlp")


def format_selector(quality: str, ext: str) -> str:
    if quality == "best":
        return f"bv*[ext={ext}]+ba/bv*+ba/b" if ext == "mp4" else "bv*+ba/b"
    if quality == "worst":
        return "wv*+wa/w"
    h = HEIGHTS[quality]
    return f"bv*[height<={h}]+ba/b[height<={h}]/b"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("url")
    ap.add_argument("-q", "--quality", choices=["best", *HEIGHTS, "worst"], default="best")
    ap.add_argument("-f", "--format", choices=["mp4", "webm", "mkv"], default="mp4")
    ap.add_argument("-a", "--audio-only", action="store_true", help="download audio as MP3")
    ap.add_argument("-o", "--output", default="downloads", help="output directory (default ./downloads)")
    ap.add_argument("--own", action="store_true", help="this is my own video")
    ap.add_argument("--force", action="store_true", help="skip license check (rights verified another way)")
    a = ap.parse_args()

    ensure_ytdlp()
    info = json.loads(subprocess.run(
        ["yt-dlp", "-J", "--no-playlist", "--no-warnings", a.url],
        check=True, capture_output=True, text=True).stdout)
    title, lic = info.get("title"), info.get("license") or "Standard / not stated"
    dur = info.get("duration")
    print(f"Title:    {title}\nUploader: {info.get('uploader')}\nDuration: {dur and f'{int(dur)//60}:{int(dur)%60:02d}'}\nLicense:  {lic}")

    if not (a.own or a.force or FREE.search(lic)):
        print("\nRefusing to download: not public domain / Creative Commons.\n"
              "Use transcript.py for research. Pass --own if this is your video, "
              "or --force if you've verified the rights.", file=sys.stderr)
        return 2

    out = Path(a.output).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    cmd = ["yt-dlp", "--no-playlist", "-o", str(out / "%(title)s.%(ext)s")]
    if a.audio_only:
        cmd += ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"]
    else:
        cmd += ["-f", format_selector(a.quality, a.format), "--merge-output-format", a.format]
    subprocess.run(cmd + [a.url], check=True)

    safe = re.sub(r'[\\/:*?"<>|]', "_", title or "video")
    (out / f"{safe}.source.txt").write_text(
        f"url: {a.url}\ntitle: {title}\nuploader: {info.get('uploader')}\nlicense: {lic}\n"
        f"basis: {'own' if a.own else 'force' if a.force else 'license'}\n")
    print(f"Saved to {out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
