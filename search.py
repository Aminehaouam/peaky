#!/usr/bin/env python3
"""Search YouTube and the Internet Archive for a topic.

  python search.py "NASA Apollo documentary" [-n 10] [--source yt|ia|both] [--free-only]

Lists title, duration, URL and license. On YouTube the license is only known
after a per-video lookup, so pass --licenses to check each result (slower).
YouTube's own "Creative Commons" filter is applied with --cc.
"""
import argparse
import json
import subprocess
import sys
import urllib.parse
import urllib.request

from common import fmt_time, is_free_license

IA_API = "https://archive.org/advancedsearch.php"


def search_youtube(query: str, n: int, check_licenses: bool, cc: bool) -> list[dict]:
    if cc:
        # sp=EgIwAQ== is YouTube's "Creative Commons" search filter
        target = "https://www.youtube.com/results?sp=EgIwAQ%253D%253D&search_query=" + urllib.parse.quote_plus(query)
        cmd = ["yt-dlp", "-j", "--flat-playlist", "--playlist-end", str(n), "--no-warnings", target]
    else:
        cmd = ["yt-dlp", "-j", "--flat-playlist", "--no-warnings", f"ytsearch{n}:{query}"]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines():
        e = json.loads(line)
        url = e.get("url") or f"https://www.youtube.com/watch?v={e['id']}"
        lic = "Creative Commons (YouTube CC filter)" if cc else "? (use --licenses)"
        if check_licenses:
            try:
                full = json.loads(subprocess.run(
                    ["yt-dlp", "-J", "--no-warnings", "--skip-download", url],
                    check=True, capture_output=True, text=True).stdout)
                lic = full.get("license") or "Standard YouTube License"
            except subprocess.CalledProcessError:
                lic = "lookup failed"
        rows.append({
            "source": "YouTube", "title": e.get("title"), "duration": e.get("duration"),
            "url": url, "license": lic, "channel": e.get("channel") or e.get("uploader"),
        })
    return rows


def search_archive(query: str, n: int) -> list[dict]:
    params = [("q", f"({query}) AND mediatype:(movies)"), ("rows", str(n)), ("output", "json"),
              ("sort[]", "downloads desc")]
    params += [("fl[]", f) for f in ("identifier", "title", "licenseurl", "runtime", "creator", "year")]
    req = urllib.request.Request(IA_API + "?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": "video-research-toolkit/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        docs = json.load(r)["response"]["docs"]
    rows = []
    for d in docs:
        rt = d.get("runtime")
        dur = None
        if isinstance(rt, str) and rt:
            try:
                parts = [float(p) for p in rt.replace(" ", "").split(":")]
                dur = 0
                for p in parts:
                    dur = dur * 60 + p
            except ValueError:
                pass
        rows.append({
            "source": "Archive.org", "title": d.get("title"), "duration": dur,
            "url": f"https://archive.org/details/{d['identifier']}",
            "license": d.get("licenseurl") or "not stated (check item page; NASA/US-gov is usually PD)",
            "channel": d.get("creator") if isinstance(d.get("creator"), str) else ", ".join(d.get("creator") or []),
        })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("query")
    ap.add_argument("-n", type=int, default=10, help="results per source (default 10)")
    ap.add_argument("--source", choices=["yt", "ia", "both"], default="both")
    ap.add_argument("--licenses", action="store_true", help="look up license for each YouTube result")
    ap.add_argument("--cc", action="store_true", help="YouTube: Creative Commons results only")
    ap.add_argument("--free-only", action="store_true", help="hide results not marked PD/CC")
    ap.add_argument("--json", action="store_true", help="print JSON instead of a table")
    a = ap.parse_args()

    rows, errors = [], []
    if a.source in ("yt", "both"):
        try:
            rows += search_youtube(a.query, a.n, a.licenses, a.cc)
        except Exception as e:
            errors.append(f"YouTube search failed: {e}")
    if a.source in ("ia", "both"):
        try:
            rows += search_archive(a.query, a.n)
        except Exception as e:
            errors.append(f"Archive.org search failed: {e}")
    if a.free_only:
        rows = [r for r in rows if is_free_license(r["license"])]

    if a.json:
        print(json.dumps(rows, indent=1))
    else:
        for r in rows:
            dur = fmt_time(r["duration"]) if r["duration"] else "?"
            print(f"[{r['source']}] {r['title']}\n    {dur:>8}  {r['url']}\n    license: {r['license']}"
                  + (f"   by: {r['channel']}" if r.get("channel") else ""))
    for e in errors:
        print(e, file=sys.stderr)
    return 1 if errors and not rows else 0


if __name__ == "__main__":
    sys.exit(main())
