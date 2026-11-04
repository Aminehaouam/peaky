# Video research & clipping toolkit

Four steps: **search → transcript → find timestamps → cut clips**.

## Setup
```bash
pip install -r requirements.txt     # yt-dlp, youtube-transcript-api
ffmpeg -version                     # needed for cutting/merging (apt install ffmpeg / brew install ffmpeg)
```
Keep yt-dlp current (`pip install -U yt-dlp`). YouTube changes often and old versions break.

## Rights rule (always follow it)
Only **download** footage that is:
- **Public domain**: e.g. NASA and other US-government works, and items marked PD/CC0 on Archive.org
- **Creative Commons**: YouTube "Creative Commons Attribution" license, or an Archive.org `licenseurl` pointing to creativecommons.org
- **The user's own** uploads

For copyrighted material (most documentaries, movies, TV, news), **use transcripts for research only**. Never download or clip it.
`clip.py` enforces this: it refuses unless yt-dlp reports a CC/PD license. Pass `--own` only for the user's own videos. Pass `--force` only when the rights were checked another way (e.g. a NASA original re-uploaded without a license field). Write down why in the commit or notes.
For CC-BY clips, credit the creator. Each clip gets a `clips/<name>.source.txt` with URL, uploader and license.

Note: a third-party re-upload of NASA footage is not automatically PD. The uploader may have added copyrighted music, narration or edits. Prefer NASA's own channels and Archive.org NASA collections.

## 1. Search
```bash
python search.py "NASA Apollo documentary"               # YouTube + Archive.org, 10 each
python search.py "Apollo 11 landing" --cc                # YouTube Creative Commons filter only
python search.py "Apollo 11" --source yt --licenses      # look up each YouTube video's license (slower)
python search.py "Apollo 11" --free-only --json          # only CC/PD, machine-readable
```
Output: title, duration, URL, license (and channel/creator).

## 2. Transcript
```bash
python transcript.py "https://www.youtube.com/watch?v=VIDEO_ID"     # saves transcripts/VIDEO_ID.txt + .json
python transcript.py URL --lang en,de                              # language preference
```
YouTube uses youtube-transcript-api. Other sites (Archive.org, etc.) fall back to yt-dlp subtitles when they exist.
`.txt` has `[M:SS] text` lines, easy to grep. `.json` holds raw segments (start, duration, text).
Transcripts are fine to pull for **any** public video, copyrighted or not. That is the research path.

## 3. Find exact moments
```bash
python transcript.py VIDEO_ID --grep "eagle has landed"       # hits with context and a ?t= deep link
python transcript.py --all --grep "saturn v|lunar module"     # regex across every saved transcript
grep -i "tranquility" transcripts/*.txt                       # plain grep works too
```
Captions are split into short lines. Start a clip a few seconds **before** the hit, and check by opening the `?t=` link.

## 4. Cut clips (rights-cleared sources only)
```bash
python clip.py URL 1:02:15 1:02:45                      # saves clips/<title>_<start>-<end>.mp4
python clip.py URL 75 105 --name apollo11_landing
python clip.py URL 0:30 1:00 --own                      # user's own video
```
Uses `yt-dlp --download-sections "*START-END" --force-keyframes-at-cuts`, so only that segment downloads and the cut is frame-accurate. Times can be `SS`, `MM:SS` or `HH:MM:SS`. `--height 720` lowers the resolution.

## Files
- `common.py`: time parsing, license detection, yt-dlp probe
- `search.py`, `transcript.py`, `clip.py`: the three CLIs
- `clips/`, `transcripts/`: output (git-ignored)

## Environment note
In the Claude Code cloud sandbox, the network policy must allow `youtube.com`, `googlevideo.com`, `ytimg.com`, `archive.org` (and `*.archive.org`). Otherwise searches and downloads fail with `Tunnel connection failed: 403`.
