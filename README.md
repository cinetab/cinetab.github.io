<p align="center"><img src="logo.svg" alt="CineTab logo" width="96" height="96"></p>

<h1 align="center">CineTab</h1>

<p align="center">
  <a href="https://github.com/cinetab/cinetab.github.io/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/cinetab/cinetab.github.io?label=release&color=5b78ff"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/cinetab/cinetab.github.io?color=5b78ff"></a>
  <a href="https://cinetab.github.io/"><img alt="Website" src="https://img.shields.io/website?url=https%3A%2F%2Fcinetab.github.io%2F&label=cinetab.github.io"></a>
</p>

**Movie night on any video call, or without one.** CineTab plays a movie from your own computer in a browser tab. Share that tab (with audio) in Google Meet, Zoom or Teams, or invite friends to a private CineTab room where everyone watches in sync and chats.

<p align="center">
  <b><a href="https://cinetab.github.io/">Open CineTab</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://github.com/cinetab/cinetab.github.io/releases/latest">Download the offline player</a></b> (one HTML file)
</p>

The movie is never uploaded to a server. The page uses the browser's File API to play the file straight from your disk, so the site is just static HTML/CSS/JS hosted on GitHub Pages. The home page explains how it works; choosing or dropping a video switches the same page into the player.

## Watch together in a CineTab room

1. Click **Watch together → Create a room** (or **Create a room** on the home page) and open a movie.
2. Invite friends with the invite link, the QR code, or the room code and password.
3. Let each person in as they arrive. Everyone watches your movie streamed from your browser, in step with you, and can chat beside the video.

Anyone in the room can share a video from their own device: **Share a video** (or **Change**) in the *Now playing* bar at the top of the room panel. It replaces the current video for everyone, and the ✕ next to it removes the video for everyone. The person sharing plays the file in their browser and everyone else watches it in sync; play, pause, jumps and speed from anyone go to that person's player. The host can switch off **Guests can share videos** in Room settings, and then only the host shares and removes videos. Sharing from a guest's device needs Chrome or Edge there.

**YouTube together:** the YouTube button in the *Now playing* bar takes a link to a public or unlisted video, a playlist, or a video in a playlist (`youtube.com/watch`, `youtu.be`, Shorts, `youtube.com/playlist`, with a start time if the link has one). Everyone watches it in YouTube's own player, loaded from YouTube in their own browser, so it doesn't use the host's upload, and the same controls play, pause, jump and change speed for everyone. A playlist moves on to the next video for everyone, and *Previous* / *Next* skip through it. YouTube shows its ads as usual (CineTab can't and doesn't block them); whoever gets an ad catches up with everyone as soon as it ends. People who use an ad blocker or YouTube Premium in their own browser usually see none. Private videos, and videos whose uploader doesn't allow playing outside YouTube, can't be played; in a playlist they're skipped.

The room lives in a side panel with separate **Chat**, **People**, **Invite** and **Settings** tabs. Everyone picks a name and an avatar (their initial on a colour, or an emoji) and can change them at any time with **Edit profile**. The host can give the room a name.

The player's back button doesn't have to end the room: the host can go to the home page while the video keeps playing for everyone (a guest can likewise stay in the room), and a bar on the home page leads back. Closing the tab disconnects.

Rooms are remembered in the browser unless you untick *Remember this room*: the next visit offers to rejoin with one click, and **Your rooms** on the home page lists them. A host opens a remembered room again with the same code and password, so friends who saved it can rejoin too. Remembered rooms (code, password, room name) are kept only in that browser's local storage. To delete them: the trash button next to a room (or **Delete all**) in **Your rooms**, the trash button on the "Welcome back" bar, or switch off **Remember this room** in the room's Settings tab, which also stops it from being saved again.

Friends who have the same movie can choose **My own copy** in Settings: CineTab keeps their copy in step with the host's, which gives the best picture and uses almost none of the host's upload. Play, pause and jumps are shared with everyone; in **Room settings** the host can stop guests from controlling playback, turn streaming off, change the stream quality, skip the "let in" step and lock the room. Streaming needs Chrome or Edge on the host's computer; guests can use Chrome, Edge, Firefox or Safari, on a computer or a phone.

### How rooms work, and what stays private

- **No server of ours.** The site is still static files. Browsers connect to each other with WebRTC, and the host's browser is the hub: each guest connects only to the host, never to other guests. The host relays chat, sends playback updates and, if streaming is on, sends its video to the guests who want it. When a guest shares a video, their browser sends it to the host, which passes it on to everyone else (so it also uses the host's upload).
- **YouTube videos** are the exception to "nothing leaves the room": while the room watches one, each person's browser loads it from YouTube (through the privacy-enhanced `youtube-nocookie.com` player), and YouTube sees that like any embedded video. Only the link and the playback position go through CineTab's connections.
- **Encrypted end to end.** WebRTC encrypts the video, sound, chat and playback messages between browsers (DTLS/SRTP). Nothing is stored; when the room ends, the chat is gone.
- **Finding each other.** Before they can connect, two browsers have to swap connection details. CineTab sends them through several free public relays at once, see `signaling.js`: two MQTT brokers ([EMQX](https://www.emqx.com/en/mqtt/public-mqtt5-broker) and [HiveMQ](https://www.hivemq.com/mqtt/public-mqtt-broker/), on ports 8084/8884) and four Nostr relays (nos.lol, relay.primal.net, nostr.mom, relay.snort.social), which use the normal HTTPS port 443 and so also get through networks that block everything else. Nostr relays only accept signed events, so each session signs with a throwaway key (BIP-340 Schnorr, implemented in `signaling.js`); the signature only satisfies the relay.
  - The room code and password go through PBKDF2-SHA256 (600,000 rounds) to produce both the broker topic and an AES-GCM key. Every message is encrypted and authenticated with that key, so a broker or anyone listening sees only random bytes on a random-looking topic, and can't forge messages. The password itself is never sent anywhere.
  - Each guest and the host also agree on a pair key (ECDH P-256), and the WebRTC offer and answer are encrypted with it, so other people who know the room password can't read them (they contain IP addresses).
  - WebRTC's own encryption keys are authenticated through these messages, so a broker can't sit in the middle of the connection.
- **Who's in.** By default the host lets each person in. The host can remove people (they can't come back with the same connection) and lock the room. A guest who loses connection briefly is let straight back in.
- **Invite links** look like `https://cinetab.github.io/#join=ABC-DEF-GHJ&pw=…`. The part after `#` is never sent to any web server, and CineTab removes it from the address bar as soon as the page opens. Untick *Put the password in the link and QR code* to send the password separately.
- **What others can see.** As on any video call, the host and each guest can see each other's IP address; guests can't see each other's. The relays see the IP addresses of browsers connecting to them, like any website does. Anyone who knows the room code and password can knock; that's why the host lets people in.

### Campus, office and other strict networks

The create and join dialogs have **Check my network**, which tests from that device whether the relays can be reached, whether direct connections over the internet are allowed (UDP via STUN), and whether a TURN relay (if configured) works. The People tab then shows how each person is actually connected: *same network*, *direct connection* or *through a relay*.

- **Finding a room** works as long as any one relay is reachable. On networks that only allow the normal web port, the Nostr relays carry it.
- **Same Wi-Fi.** Browsers on the same network connect straight to each other over the local network, the fastest route, and CineTab then streams at full quality (1080p, up to 8 Mbit/s; *Data saver* is still respected). This needs the network to let devices reach each other: many campus and hotel Wi-Fi networks isolate devices (and block the multicast that browsers use to find each other locally), and then even people in the same building need one of the routes below.
- **Different networks** connect directly using STUN (Google's and Cloudflare's public servers). Some networks, such as campus and office firewalls that block UDP, or carrier-grade NAT mobile networks, don't allow this, and then the connection needs a **TURN** relay, which forwards the still-encrypted traffic. A phone hotspot shared by everyone in the room is the quick fix. CineTab doesn't ship one because TURN servers need credentials and bandwidth. To add one (Metered and Cloudflare have free tiers), put it in `ICE_SERVERS` at the top of `room.js`:

```js
{ urls: "turns:turn.example.com:443?transport=tcp", username: "…", credential: "…" }
```

Credentials in a public site can be used by anyone, so use a provider that lets you cap usage. With a TURN server configured, the create and join dialogs also offer **Hide my IP address**, which sends everything through the relay.

### Limits

- Up to 12 guests per room. When streaming, the host's upload is shared between viewers: about 1.2 / 2.5 / 5 Mbit/s each at Data saver / Standard / High, so 3 to 5 stream viewers is comfortable on most home connections. Guests playing their own copy use almost no bandwidth.
- The room lasts while the host keeps CineTab open.

## Watch together on a video call

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
- Rename a video by clicking its title (remembered for that file); all shortcuts listed with the keyboard button or `?`
- Private watch-together rooms with chat, streaming and synced playback (see above)

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
| `?` | Show all shortcuts |
| `Esc` | Close a dialog |

On phones and tablets: tap the video to show or hide the controls, double-tap the left or right third to jump 10 seconds back or forward (the middle toggles fullscreen), and drag the timeline with a finger. Fullscreen turns the phone sideways for a wide video.

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

[`cinetab-offline.html`](cinetab-offline.html) is just the CineTab player, without the website's home page or rooms, in one ~1 MB file: fonts, icons, styles and scripts are all inlined. Download it (from the website or the link above), save it anywhere and double-click it. It opens straight into the player and runs from disk with no server and no internet.

Differences from the website, both down to browser rules for pages opened from disk:

- The converter still downloads ffmpeg.wasm the first time it's needed, so converting AVI/DTS/etc. needs internet once.
- Browsers don't allow OPFS for `file://` pages, so conversions happen in memory and aren't saved between visits (there's no converted-videos list). Very large movies may not fit; use the website for those.

The file is generated from the sources. After changing anything, rebuild it and commit the result:

```
node tools/build-offline.mjs
```

(Node 18+, no dependencies. It downloads Poppins and Font Awesome and inlines them.)

## Versions and releases

CineTab uses [Semantic Versioning](https://semver.org/). The version lives in `package.json`, is shown in the website footer and inside the offline player, and every release is listed in [CHANGELOG.md](CHANGELOG.md) and on the [Releases page](https://github.com/cinetab/cinetab.github.io/releases), with the offline player attached as `CineTab-Player-vX.Y.Z.html`.

To publish a new version:

1. Bump `version` in `package.json`, and the three places in `index.html` that show it (`<meta name="version">`, `softwareVersion` in the structured data, the footer badge). The build refuses to run if they don't match.
2. Add a `## [X.Y.Z] - YYYY-MM-DD` section to `CHANGELOG.md`.
3. Run `node tools/build-offline.mjs`, then commit and push.
4. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`. The [Release workflow](.github/workflows/release.yml) builds the offline player and publishes the GitHub Release with the changelog notes.

## Project files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Home page and player |
| `script.js` | Player logic |
| `tooltips.js` | Tooltips for every `title` attribute (also in fullscreen) |
| `converter.js` | Detects files that need converting, manages saved conversions |
| `converter-worker.js` | Runs ffmpeg.wasm in a Web Worker and writes the MP4 to OPFS |
| `room.js` | Watch-together rooms: hosting, joining, chat, playback sync and streaming over WebRTC |
| `signaling.js` | How room browsers find each other: encrypted messages through public MQTT brokers |
| `vendor/qrcode-generator.js` | Draws the invite QR code |
| `tools/build-offline.mjs` | Builds `cinetab-offline.html` (player only) |
| `cinetab-offline.html` | Generated single-file offline player |
| `package.json`, `CHANGELOG.md` | Version number and release history |
| `.github/workflows/release.yml` | Publishes a GitHub Release for each version tag |
| `robots.txt`, `sitemap.xml`, `og-image.png`, `manifest.webmanifest`, `404.html` | Search engines, link previews, install as an app, missing pages |

## Run locally

Serve the folder with any static server, for example `npx serve .` or `python -m http.server`, and open the printed address. (Opening `index.html` directly works too, but the converter needs a server or the offline file, and rooms need `http://localhost` or `https://`.) To try a room on one computer, open the site in two different browser profiles (or a normal and a private window): one creates the room, the other joins.

## License

CineTab is released under the [MIT License](LICENSE).

Third-party parts it uses, each under its own license:

| Component | Used for | License |
| --- | --- | --- |
| [Font Awesome Free 6.4.0](https://fontawesome.com/license/free) | Icons (loaded from cdnjs; embedded in the offline player) | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT |
| [Poppins](https://fonts.google.com/specimen/Poppins) | Font (loaded from Google Fonts; embedded in the offline player) | SIL OFL 1.1 |
| [qrcode-generator 1.4.4](https://github.com/kazuhikoarase/qrcode-generator) | Invite QR codes (in `vendor/`, unchanged) | MIT |
| [ffmpeg.wasm core 0.12.10](https://github.com/ffmpegwasm/ffmpeg.wasm) | Converter, downloaded from jsDelivr/unpkg only when a file needs converting; not included in this repository | FFmpeg build including GPL components (e.g. x264) |
