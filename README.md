<p align="center"><img src="logo.svg" alt="CineTab logo" width="96" height="96"></p>

# CineTab

**Movie night on any video call.** CineTab plays a movie from your own computer in a browser tab. Share that tab (with audio) in Google Meet, Zoom or Teams and watch it together with friends.

The movie is never uploaded. The page uses the browser's File API to play the file straight from your disk, so the site is just static HTML/CSS/JS hosted on GitHub Pages. The home page explains how it works; choosing or dropping a video switches the same page into the player.

## Watch together

1. Open CineTab in **Chrome or Edge** on a desktop and pick a movie (or drag it onto the page).
2. In Google Meet click **Share screen → Chrome Tab** (Zoom / Teams: **Share** and pick the tab).
3. Choose the CineTab tab and turn on **Also share tab audio**.
4. Press play. `F` gives fullscreen inside the tab.

Don't use Picture-in-Picture while sharing: the video moves out of the tab and the people watching see an empty player.

## Features

- Plays local files via drag & drop or the file picker (MP4, WebM, and MKV where the browser supports the codecs)
- Subtitles: drop or pick an `.srt` / `.vtt` file, toggle with `C`
- Remembers where you stopped for each file (stored only in your browser)
- Hover preview on the timeline, playback speed, Picture-in-Picture, fullscreen

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

## If a file won't play

Browsers can only decode some codecs. If you get the codec error, or a file plays without sound (common with MKV files using AC3/DTS audio), convert it to MP4 with H.264 video and AAC audio, e.g. with HandBrake or:

```
ffmpeg -i input.mkv -c:v copy -c:a aac output.mp4
```

## Run locally

Open `index.html` directly in the browser, or serve the folder with any static server.
