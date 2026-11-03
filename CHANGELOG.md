# Changelog

All notable changes to CineTab are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-03

First public release of CineTab: play videos from your own computer in a browser tab and share
that tab with sound in Google Meet, Zoom or Microsoft Teams to watch together. Nothing is uploaded.

### Watch together
- Home page that explains how to share a tab with audio in Google Meet, Zoom and Teams
- "Watch together" guide inside the player
- Large player that fills the window, fullscreen with `F`

### Plays almost any format
- MP4, MKV, MOV, WebM and audio files (MP3, M4A, FLAC, WAV, OGG, Opus) play instantly
- AVI, WMV, FLV, TS, MPG and files with DTS or Dolby (AC3/E-AC3/TrueHD) sound are converted on
  your computer with ffmpeg.wasm, then play with sound
- Converted copies are saved in the browser and listed on the home page with their size; play,
  delete one or clear all

### Player
- Subtitles from `.srt` / `.vtt` files or embedded in MKV files
- Resume where you stopped, per file
- Playback speed presets plus any custom speed from 0.25x to 4x
- Timeline hover preview, Picture-in-Picture, keyboard shortcuts
- Dedicated view for music files
- Tooltips on every control, also in fullscreen

### Offline player
- `CineTab-Player-v1.0.0.html`: the player in one self-contained file that runs from disk with no
  server and no internet

[1.0.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.0.0
