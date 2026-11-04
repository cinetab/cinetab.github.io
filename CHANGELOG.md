# Changelog

All notable changes to CineTab are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

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

[1.2.5]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.5
[1.2.1]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.1
[1.2.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.0
[1.1.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.1.0
[1.0.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.0.0
