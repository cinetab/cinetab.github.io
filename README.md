<p align="center"><img src="logo.svg" alt="CineTab logo" width="96" height="96"></p>

# CineTab

**Movie night on any video call.** CineTab plays a movie from your own computer in a browser tab. Share that tab (with audio) in Google Meet, Zoom or Teams and watch it together with friends.

<p align="center">
  <b><a href="https://ranjan-sarkar.github.io/cinetab/">Open CineTab</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://ranjan-sarkar.github.io/cinetab/cinetab-offline.html" download>Download the offline player</a></b> (one HTML file)
</p>

The movie is never uploaded. The page uses the browser's File API to play the file straight from your disk, so the site is just static HTML/CSS/JS hosted on GitHub Pages. The home page explains how it works; choosing or dropping a video switches the same page into the player.

## Watch together

1. Open CineTab in **Chrome or Edge** on a desktop and pick a movie (or drag it onto the page).
2. In Google Meet click **Share screen → Chrome Tab** (Zoom / Teams: **Share** and pick the tab).
3. Choose the CineTab tab and turn on **Also share tab audio**.
4. Press play. `F` gives fullscreen inside the tab.

Don't use Picture-in-Picture while sharing: the video moves out of the tab and the people watching see an empty player.

## Features

- Plays video and audio files via drag & drop or the file picker, in almost any format (see below)
- Subtitles: drop or pick an `.srt` / `.vtt` file, or use the text subtitles inside an MKV; toggle with `C`
- Remembers where you stopped for each file (stored only in your browser)
- Lists your converted videos on the home page with the space each uses; play or delete them
- Hover preview on the timeline, playback speed (presets or any speed from 0.25x to 4x), Picture-in-Picture, fullscreen

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` / `K` | Play / pause |
| `←` / `→` | Seek 5 s |
| `J` / `L` | Seek 10 s |
| `↑` / `↓` | Volume |
| `M` | Mute |
| `C` | Subtitles on / off (opens picker if none loaded) |
| `F` | Fullscreen |
| `P` | Picture-in-Picture |
| `0`–`9` | Jump to 0–90 % |
| `Shift` + `>` / `<` | Speed up / slow down |

## Supported formats

| Plays instantly | Converted automatically on first open |
| --- | --- |
| MP4, MKV, MOV, M4V, WebM (H.264, HEVC*, VP9, AV1) | AVI, WMV/ASF, FLV, TS/M2TS, MPG, VOB, 3GP |
| MP3, M4A/AAC, WAV, FLAC, OGG, Opus | DTS, Dolby Digital (AC3/E-AC3) and TrueHD sound, WMA, AIFF, AC3 |

\* HEVC needs a GPU decoder in Chrome/Edge; without one the file is converted.

Files the browser can't play, or would play **silently** (browsers skip DTS/AC3 sound in MKVs without an error), are converted with [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) inside the browser:

- **Container or sound only** (e.g. AVI/TS with H.264, MKV with DTS): the video is copied untouched and only the sound becomes AAC, which takes a few minutes for a full movie.
- **Old video codecs** (Xvid/DivX, WMV, MPEG-2): the video is re-encoded to H.264 at up to 720p, about 4-5x faster than real time on a typical laptop, so a full movie can take 20-30 minutes.

The input is read straight from disk and the output is written to the browser's private storage (OPFS), so large movies don't need to fit in memory. The three most recent conversions are kept so they reopen instantly; they're listed on the home page, where each one (or all) can be deleted. The converter (~31 MB) is downloaded from jsDelivr the first time it's needed.

## Offline player

[`cinetab-offline.html`](cinetab-offline.html) is just the CineTab player, without the website's home page, in one ~1 MB file: fonts, icons, styles and scripts are all inlined. Download it (from the website or the link above), save it anywhere and double-click it. It opens straight into the player and runs from disk with no server and no internet.

Differences from the website, both down to browser rules for pages opened from disk:

- The converter still downloads ffmpeg.wasm the first time it's needed, so converting AVI/DTS/etc. needs internet once.
- Browsers don't allow OPFS for `file://` pages, so conversions happen in memory and aren't saved between visits (there's no converted-videos list). Very large movies may not fit; use the website for those.

The file is generated from the sources. After changing anything, rebuild it and commit the result:

```
node tools/build-offline.mjs
```

(Node 18+, no dependencies. It downloads Poppins and Font Awesome and inlines them.)

## Project files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Home page and player |
| `script.js` | Player logic |
| `tooltips.js` | Tooltips for every `title` attribute (also in fullscreen) |
| `converter.js` | Detects files that need converting, manages saved conversions |
| `converter-worker.js` | Runs ffmpeg.wasm in a Web Worker and writes the MP4 to OPFS |
| `tools/build-offline.mjs` | Builds `cinetab-offline.html` (player only) |
| `cinetab-offline.html` | Generated single-file offline player |

## Run locally

Serve the folder with any static server, for example `npx serve .` or `python -m http.server`, and open the printed address. (Opening `index.html` directly works too, but the converter needs a server or the offline file.)

## License

CineTab is released under the [MIT License](LICENSE).

Third-party parts it uses, each under its own license:

| Component | Used for | License |
| --- | --- | --- |
| [Font Awesome Free 6.4.0](https://fontawesome.com/license/free) | Icons (loaded from cdnjs; embedded in the offline player) | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT |
| [Poppins](https://fonts.google.com/specimen/Poppins) | Font (loaded from Google Fonts; embedded in the offline player) | SIL OFL 1.1 |
| [ffmpeg.wasm core 0.12.10](https://github.com/ffmpegwasm/ffmpeg.wasm) | Converter, downloaded from jsDelivr/unpkg only when a file needs converting; not included in this repository | FFmpeg build including GPL components (e.g. x264) |
