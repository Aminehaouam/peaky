#!/usr/bin/env python3
"""Download only a segment of a YouTube / Archive.org video into ./clips.

  python clip.py URL START END [--name NAME] [--own] [--force]

START/END: SS, MM:SS or HH:MM:SS.
Refuses sources whose license isn't public domain / Creative Commons unless
--own (your own upload) or --force (you've verified rights yourself).
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

from common import fmt_time, is_free_license, license_of, parse_time, probe

CLIPS = Path(__file__).resolve().parent / "clips"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("start")
    ap.add_argument("end")
    ap.add_argument("--name", help="output base name (default: title + times)")
    ap.add_argument("--own", action="store_true", help="this is my own video")
    ap.add_argument("--force", action="store_true", help="skip license check (I've verified rights)")
    ap.add_argument("--height", type=int, default=1080, help="max video height (default 1080)")
    a = ap.parse_args()

    start, end = parse_time(a.start), parse_time(a.end)
    if end <= start:
        ap.error("END must be after START")

    info = probe(a.url)
    lic = license_of(info)
    print(f"Title:   {info.get('title')}")
    print(f"License: {lic}")
    if not (a.own or a.force or is_free_license(info.get("license"))):
        print(
            "\nRefusing to download: license is not public domain / Creative Commons.\n"
            "Use transcript.py for research instead. If this is your own video pass --own;\n"
            "if you've verified the rights another way pass --force.",
            file=sys.stderr,
        )
        return 2

    CLIPS.mkdir(exist_ok=True)
    base = a.name or f"{info.get('title', 'clip')}_{fmt_time(start)}-{fmt_time(end)}"
    base = re.sub(r"[^\w.-]+", "_", base).strip("_")[:120]
    out = CLIPS / f"{base}.%(ext)s"

    cmd = [
        "yt-dlp", "--no-playlist",
        "--download-sections", f"*{start}-{end}",
        "--force-keyframes-at-cuts",           # frame-accurate cut (re-encodes edges)
        "-f", f"bv*[height<={a.height}]+ba/b[height<={a.height}]/b",
        "--merge-output-format", "mp4",
        "-o", str(out),
        a.url,
    ]
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    # record provenance next to the clip
    (CLIPS / f"{base}.source.txt").write_text(
        f"url: {a.url}\ntitle: {info.get('title')}\nuploader: {info.get('uploader')}\n"
        f"license: {lic}\nsegment: {fmt_time(start)}-{fmt_time(end)}\n"
        f"basis: {'own' if a.own else 'force' if a.force else 'license'}\n"
    )
    print(f"Saved to {CLIPS}/{base}.mp4")
    return 0


if __name__ == "__main__":
    sys.exit(main())
