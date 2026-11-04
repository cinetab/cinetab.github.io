# Changelog

All notable changes to CineTab are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-11-04

### Watch-together rooms: YouTube queue
- A **Queue** tab in the room panel while YouTube is on (it opens when YouTube starts), with each
  video's thumbnail, title and who added it
- Anyone who may share videos can add a link to the end of the queue or play it straight away;
  a playlist link adds all its videos (up to 500 in the queue)
- Drag videos to reorder them (or use the arrows on phones), remove them, or press ▶ to play one
  now for everyone
- The next video in the queue starts for everyone when one ends; videos that can't be played
  outside YouTube are skipped
- A YouTube link pasted in the *Now playing* bar while YouTube is on plays right after the current
  video and keeps the queue
- Coming back from YouTube (after following one of its own links in the player) opens the queue
  ready for the link, with a paste button; a link can also be dropped onto the queue
- *Previous* / *Next* buttons beside the player's play button while the queue has more than one
  video, and `Shift` + `P` / `N`

### Rooms on any network
- Guests whose network and the host's don't allow a direct connection (mobile data behind
  carrier-grade NAT, strict campus or office firewalls) couldn't join at all without a TURN server.
  Now, if a direct connection doesn't open within about 10 seconds, the room goes through the
  relays that found it, sealed with a key only that guest and the host share. Chat, sync, YouTube
  and *My own copy* work on any network that can open websites; streaming a video still needs a
  direct connection (or TURN), and the guest is told so
- *Through the room's relay* in the People tab; such a guest leaving or losing the connection is
  noticed within about 35 seconds
- `TURN_CREDENTIALS_URL` in `room.js`: fetch short-lived TURN credentials (such as Metered's)
  instead of writing a password into the page

### Rooms: people asking to join
- A chime and a pop-up that stays until it's answered; clicking it shows **Accept** and **Deny**.
  In a background tab, the tab's title says who's asking too
- The People tab's *Let in* / *Deny* still work, and answering there closes the pop-up

### Rooms on campus, office and hostel Wi-Fi
- People on the same Wi-Fi couldn't join each other's rooms on networks that block multicast
  (browsers hide each device's local address behind a name only multicast can look up, and such
  firewalls don't loop traffic back through the shared public address)
- *Help devices find each other*: a tick box in the create and join dialogs, *Help people on this
  Wi-Fi connect* in the room's Settings, and *Same Wi-Fi: try again* when joining fails. The
  browser asks for the microphone once and CineTab turns it straight off; with that permission
  browsers use the real local address, and either side turning it on is enough
- *Check my network* says whether this device is hidden from others on the same Wi-Fi, and fixes it
- A failed join now explains the same-Wi-Fi case and what to try

### Player
- **More** menu (⋮) in the controls:
  - Picture shape: Fit, Fill (cropped to the screen), Stretch, 16:9, 4:3 or 21:9; remembered in
    this browser
  - Volume boost: 150%, 200% or 300%, with a limiter against distortion. It works for files and
    for a room's stream, and only changes what you hear (guests hear the host's normal volume).
    YouTube's player keeps its own shape and volume

## [1.2.8] - 2026-11-04

### Watch-together rooms: YouTube together
- Paste a YouTube link in the *Now playing* bar (YouTube button): a public or unlisted video, a
  Short, a playlist or a video in a playlist; a start time in the link is kept
- Everyone watches it in YouTube's own player, loaded by their own browser, so it doesn't use the
  host's upload; play, pause, jumps and speed from anyone (clicks on the YouTube player too) are
  shared, and everyone stays on the same second
- Playlists move on to the next video for everyone; *Previous* / *Next* and "3 of 12" in the bar
- Ads are YouTube's: whoever gets one catches up with everyone as soon as it ends
- Videos that can't be played outside YouTube show why; in a playlist they're skipped
- The player's volume and mute work on YouTube's player; the CC button turns YouTube's captions on
  and off (or shows subtitles loaded from a file)
- The privacy-enhanced youtube-nocookie.com player is used

## [1.2.5] - 2026-11-04

### Watch-together rooms: share videos from any device
- A *Now playing* bar in the room panel shows the current video and who shared it, with
  **Share a video** / **Change** and a ✕ to remove it for everyone
- Anyone can share a video from their device; it replaces the current one for everyone, and the
  person whose video is replaced is told who started the new one
- A guest's shared video plays in sync for everyone: play, pause, jumps and speed from anyone are
  carried out in the sharing guest's player, and everyone's timeline follows it
- The host watches a guest's video like everyone else and can control or remove it; opening a file
  as host replaces it
- Subtitles loaded by the guest who shares a video show up for everyone
- People who join while a guest is sharing see that video straight away; a new video starts
  playing as a stream automatically instead of asking for a copy of a file only one person has
- If the sharing guest leaves or is removed, their video stops for everyone with a note in the chat
- "Guests can share videos" (on by default) replaces "Guests can add media"
- **Create a room** in the home page's top bar, which stays on screen while scrolling

### Fixes
- Guests watching the stream couldn't share a video: the chosen file never loaded
- A guest's shared video didn't stay in sync: play, pause and jumps changed only the host's view
  of the stream, not the video, and the guest sharing it was pulled back to the start
- After switching between people's videos, the picture went black for everyone (Chrome ends the
  tracks of a stream shown in a captured player when it switches source; the player now shows
  copies)
- Sharing the same movie a second time sent no picture
- The host no longer sends a guest's own video back to them
- Cancelling the file picker no longer leaves the next opened file marked for sharing

## [1.2.1] - 2026-11-04

### Mobile player
- Swipe up on the video in portrait mode to enter fullscreen like the YouTube mobile app
- Show brightness and volume gesture feedback as vertical controls on the left and right edges

## [1.2.0] - 2026-11-04

### Mobile player
- Fullscreen pinch-to-zoom: fill the screen or fit the video's aspect ratio
- Swipe the left and right edges to adjust brightness and volume
- Swipe down in the middle to exit fullscreen
- Tap the middle of the video to pause or resume

### Watch-together rooms
- Voice chat with a muted-by-default microphone control
- Separate WebRTC voice audio keeps microphone chat independent from movie streaming
- Microphone permissions, errors and cleanup are handled explicitly
- Chat messages are aligned separately for you and other participants
- Hosts can allow guests to publish a local video for everyone in the room
- Guests without the file can seek the shared stream when playback control is enabled
- Remembered rooms reconnect automatically and retain approved guest access until deleted

## [1.1.0] - 2026-11-03

Watch together without a video call: CineTab rooms. Sharing the tab on Google Meet, Zoom or Teams
works exactly as before; the Watch together button now offers both.

### CineTab rooms
- Create a private room and invite friends with a link, a QR code, or the room code and password
- You let each person in (or turn that off), can remove anyone and lock the room
- A meeting-style side panel with separate Chat, People, Invite and Settings tabs, also in
  fullscreen
- Group chat beside the video; nothing is saved anywhere
- Pick an avatar (your initial on a colour, or an emoji) and change your name or avatar at any
  time after joining
- Give the room a name; the host can rename it at any time
- Go to the home page without ending the room: the video keeps playing for everyone, and a bar on
  the home page leads back to it
- Rooms are remembered in the browser (optional): the next visit offers to rejoin with one click,
  and a host can open the same room again with the same code and password. Delete one or all of
  them from the home page, or switch off Remember this room in a room's settings
- React to any chat message with an emoji, or reply to it; replies quote the original
- A pop-up for each new message whenever the chat isn't on screen (another tab, panel hidden, or
  the home page); click it to open the chat
- Works on strict networks: rooms are also found through Nostr relays on the normal web port (443)
- Check my network: shows whether this network allows finding rooms, direct connections and the
  TURN relay
- The People tab shows how each person is connected (same network, direct or through a relay);
  guests on the same network as the host get the stream in full quality
- Stream the video you're playing to everyone in the room, with its sound in stereo; pick Data
  saver, Standard or High quality
- Friends who have the same movie can play their own copy instead, kept in step with the host
- Play, pause and jumps are shared with everyone; the host decides whether guests may control playback
- Subtitles loaded by the host show up for every guest
- Works on phones: scan the QR code and watch in the browser

### Privacy and security
- Peer-to-peer: guests connect directly to the host's browser, never to each other
- Video, sound and chat are encrypted end to end by WebRTC
- Connection details are exchanged through public relays, encrypted with a key derived from the
  room code and password (PBKDF2, AES-GCM), plus a per-guest key (ECDH) so other people in the room
  can't read them either; the relays never see the password
- The password in an invite link sits after the `#`, which browsers never send to the web server,
  and is removed from the address bar as soon as the page opens

### Changes
- Fullscreen now covers the whole player page, so the room's chat can stay open beside the video
- Cleaner dialogs: every one has a × in its corner, and Esc closes it
- Back button in the player
- Keyboard shortcuts list: the keyboard button in the player, or press `?`
- Rename a video by clicking its title; the name is remembered for that file
- Restyled volume and speed sliders and the custom speed box
- Phones: the player fills the screen sideways and sits at the top when upright; fullscreen turns
  the phone to landscape; tap to show the controls, double-tap left or right to jump 10 seconds,
  drag the timeline with a finger (with a scene preview); in a room the panel sits beside the
  video instead of over it, and steps aside in fullscreen
- iPhone: videos play inside the page instead of jumping to Safari's own player; fullscreen uses
  Safari's video fullscreen
- The home page explains both ways to watch together

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

[1.3.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.3.0
[1.2.8]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.8
[1.2.5]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.5
[1.2.1]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.1
[1.2.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.0
[1.1.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.1.0
[1.0.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.0.0
