#!/usr/bin/env python3
"""Fetch a YouTube transcript with timestamps into ./transcripts, and search it.

  python transcript.py URL [--lang en]          # fetch + save
  python transcript.py URL --grep "lunar module" # fetch (or reuse) and search
  python transcript.py --grep "saturn" --all     # search every saved transcript

Saves <id>.txt  ("[MM:SS] text" lines, easy to grep) and <id>.json (raw segments).
For non-YouTube URLs (e.g. Archive.org) it falls back to yt-dlp subtitles.
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from common import fmt_time, video_id

TRANSCRIPTS = Path(__file__).resolve().parent / "transcripts"


def fetch_youtube(vid: str, langs: list[str]) -> list[dict]:
    from youtube_transcript_api import YouTubeTranscriptApi

    api = YouTubeTranscriptApi()
    try:
        fetched = api.fetch(vid, languages=langs)
    except Exception:
        # fall back to any available transcript, translated to the first language if possible
        tl = api.list(vid)
        t = next(iter(tl))
        if t.language_code not in langs and t.is_translatable:
            t = t.translate(langs[0])
        fetched = t.fetch()
    return [{"start": s.start, "duration": s.duration, "text": s.text} for s in fetched]


def fetch_ytdlp_subs(url: str, langs: list[str]) -> list[dict]:
    """Generic fallback: grab subtitles (VTT) via yt-dlp and parse them."""
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(
            ["yt-dlp", "--skip-download", "--write-subs", "--write-auto-subs",
             "--sub-langs", ",".join(langs + ["en.*"]), "--sub-format", "vtt",
             "-o", f"{d}/sub.%(ext)s", url],
            check=True,
        )
        vtts = list(Path(d).glob("*.vtt"))
        if not vtts:
            raise SystemExit("No subtitles/transcript available for this video.")
        return parse_vtt(vtts[0].read_text(errors="replace"))


def parse_vtt(text: str) -> list[dict]:
    segs, last = [], None
    ts = re.compile(r"(\d+):(\d+):(\d+)\.(\d+)\s+-->\s+(\d+):(\d+):(\d+)\.(\d+)")
    for block in text.split("\n\n"):
        lines = block.strip().splitlines()
        for i, line in enumerate(lines):
            m = ts.search(line)
            if m:
                g = list(map(int, m.groups()))
                start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
                end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
                body = " ".join(re.sub(r"<[^>]+>", "", l) for l in lines[i + 1:]).strip()
                if body and body != last:  # auto-subs repeat lines
                    segs.append({"start": start, "duration": end - start, "text": body})
                    last = body
                break
    return segs


def save(key: str, url: str, segs: list[dict]) -> Path:
    TRANSCRIPTS.mkdir(exist_ok=True)
    (TRANSCRIPTS / f"{key}.json").write_text(json.dumps({"url": url, "segments": segs}, indent=1))
    txt = TRANSCRIPTS / f"{key}.txt"
    txt.write_text(f"# {url}\n" + "".join(f"[{fmt_time(s['start'])}] {s['text']}\n" for s in segs))
    return txt


def search(key: str, pattern: str, context: int) -> int:
    data = json.loads((TRANSCRIPTS / f"{key}.json").read_text())
    segs, url = data["segments"], data["url"]
    rx = re.compile(pattern, re.I)
    hits = 0
    for i, s in enumerate(segs):
        nxt = segs[i + 1]["text"] if i + 1 < len(segs) else ""
        # also catch phrases split across two caption lines (credited to the first line)
        split_hit = not rx.search(nxt) and rx.search(f"{s['text']} {nxt}")
        if rx.search(s["text"]) or split_hit:
            hits += 1
            lo, hi = max(0, i - context), min(len(segs), i + context + 1)
            t = int(s["start"])
            link = f"https://youtu.be/{key}?t={t}" if re.fullmatch(r"[\w-]{11}", key) else url
            print(f"\n== {key} @ {fmt_time(t)} ({t}s)  {link}")
            for x in segs[lo:hi]:
                mark = ">>" if x is s else "  "
                print(f"{mark} [{fmt_time(x['start'])}] {x['text']}")
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", nargs="?")
    ap.add_argument("--lang", default="en", help="comma-separated preferred languages (default en)")
    ap.add_argument("--grep", help="regex to search for (case-insensitive)")
    ap.add_argument("--context", type=int, default=2, help="lines of context around hits")
    ap.add_argument("--all", action="store_true", help="search all saved transcripts")
    ap.add_argument("--refresh", action="store_true", help="re-fetch even if saved")
    a = ap.parse_args()
    langs = a.lang.split(",")

    if a.all:
        if not a.grep:
            ap.error("--all needs --grep")
        total = sum(search(p.stem, a.grep, a.context) for p in sorted(TRANSCRIPTS.glob("*.json")))
        print(f"\n{total} hit(s)")
        return 0
    if not a.url:
        ap.error("URL required (or --all --grep PATTERN)")

    try:
        key = video_id(a.url)
        is_yt = True
    except ValueError:
        key = re.sub(r"[^\w-]+", "_", a.url.split("://")[-1]).strip("_")[:80]
        is_yt = False

    if a.refresh or not (TRANSCRIPTS / f"{key}.json").exists():
        segs = fetch_youtube(key, langs) if is_yt else fetch_ytdlp_subs(a.url, langs)
        path = save(key, a.url, segs)
        print(f"Saved {len(segs)} segments to {path}")
    if a.grep:
        print(f"\n{search(key, a.grep, a.context)} hit(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
