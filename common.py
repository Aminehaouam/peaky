"""Shared helpers: time parsing and license detection."""
import json
import re
import subprocess

FREE_LICENSE_PATTERNS = [
    r"creativecommons\.org",
    r"creative commons",
    r"\bcc[- ]?by\b",
    r"\bcc0\b",
    r"public ?domain",
    r"publicdomain",
]


def parse_time(value: str) -> float:
    """Accept SS, MM:SS, HH:MM:SS (with optional .fraction). Returns seconds."""
    parts = value.strip().split(":")
    if not 1 <= len(parts) <= 3:
        raise ValueError(f"bad time: {value!r}")
    secs = 0.0
    for p in parts:
        secs = secs * 60 + float(p)
    return secs


def fmt_time(seconds: float) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:d}:{s:02d}"


def is_free_license(text: str | None) -> bool:
    if not text:
        return False
    return any(re.search(p, text, re.I) for p in FREE_LICENSE_PATTERNS)


def probe(url: str) -> dict:
    """Metadata for one URL via yt-dlp (no download)."""
    out = subprocess.run(
        ["yt-dlp", "-J", "--no-playlist", "--no-warnings", url],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def license_of(info: dict) -> str:
    """Best-effort license string from yt-dlp metadata."""
    lic = info.get("license")
    if lic:
        return lic
    # Archive.org: licenseurl / rights sometimes land in description or tags
    blob = " ".join(str(info.get(k) or "") for k in ("description", "tags"))
    if is_free_license(blob):
        return "possibly CC/PD (found in description - verify)"
    return "unknown / standard (assume copyrighted)"


def video_id(url_or_id: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})", url_or_id)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url_or_id):
        return url_or_id
    raise ValueError(f"can't find a YouTube video id in {url_or_id!r}")
