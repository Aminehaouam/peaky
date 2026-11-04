---
name: youtube-downloader
description: Download YouTube (or Archive.org) videos with customizable quality and format options. Use this skill when the user asks to download, save, or grab a video. Supports quality settings (best, 1080p, 720p, 480p, 360p, worst), formats (mp4, webm, mkv), and audio-only downloads as MP3. Only downloads public-domain, Creative Commons, or the user's own videos.
---

# YouTube Video Downloader

Download single videos with control over quality and format, using yt-dlp.

## Rights rule (project policy, see /CLAUDE.md)
Only download videos that are **public domain**, **Creative Commons**, or **the user's own**.
The script checks the license yt-dlp reports and refuses otherwise.
- `--own`: the user says it is their own upload
- `--force`: the user has verified the rights another way (e.g. a NASA original with no license field)

Never pass `--own` or `--force` on your own initiative for copyrighted shows, movies or music.
For those, use `transcript.py` for research instead.

## Quick start
```bash
python .claude/skills/youtube-downloader/scripts/download_video.py "URL"
```
Best quality, MP4, saved to `./downloads/` (git-ignored).

## Options
| Flag | Values | Default |
|---|---|---|
| `-q`, `--quality` | `best`, `1080p`, `720p`, `480p`, `360p`, `worst` | `best` |
| `-f`, `--format` | `mp4`, `webm`, `mkv` (video only) | `mp4` |
| `-a`, `--audio-only` | download audio as MP3 | off |
| `-o`, `--output` | output directory | `./downloads` |
| `--own` / `--force` | skip the license check (see above) | off |

## Examples
```bash
python .claude/skills/youtube-downloader/scripts/download_video.py "URL" -q 1080p
python .claude/skills/youtube-downloader/scripts/download_video.py "URL" -a
python .claude/skills/youtube-downloader/scripts/download_video.py "URL" -q 720p -f webm -o /custom/path
python .claude/skills/youtube-downloader/scripts/download_video.py "MY_VIDEO_URL" --own
```

## Notes
- Installs yt-dlp automatically if missing. ffmpeg is needed to merge streams and make MP3s.
- The filename comes from the video title. Playlists are skipped (single video only).
- A `<title>.source.txt` file next to each download records URL, uploader and license, for crediting CC-BY work.
- To download only a segment, use `/clip.py` instead.
