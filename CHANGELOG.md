# Changelog

All notable changes to CineTab are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [1.5.7] - 2026-11-20

### Video call window
- Computers: resize it from any edge or corner, to any shape, like a computer's window (the
  bottom right corner also takes the arrow keys); double-click its title bar for the size that
  fits everyone again. Phones and tablets: pinch it, and it keeps its shape
- Everyone's pictures fill the window, as many across as makes them largest for its shape (a
  tall window: one under another; a wide one: side by side; in between: a grid)
- At first it fits everyone one under another on computers and phones held sideways, and side by
  side on phones held upright. Its size is remembered separately for sideways and upright
- A compact title bar: the number of people in the room (not "2 in the room"), then your mic and
  camera, dock and fold; the separate row of mic and camera buttons and the Larger / Smaller
  button are gone (docked, Wider / Narrower stays)
- Docking and floating it again are in motion: the video glides to its new place, the docked
  column slides in from the left (a strip up from below), and a floating window fades in where it
  lands. Wider / Narrower is in motion too. Still, for people who asked for less motion
- Computers: drag the docked column's long right edge to make it any width (a bar shows on it
  while pointed at), or use the arrow keys on it; double-click it to go back. Remembered

### Video call window
- Mic and camera buttons right in the call window (a row below everyone, and inside the pill when
  it's folded up), so they can be turned on or off without opening the room's panel; they stay in
  step with the panel's own buttons
- Dock it as a panel (the new button in its title bar), and float it again the same way:
  computers and phones held sideways get a column on the left of the video, everyone one under
  another, scrolling up and down (Wider / Narrower); phones held upright get a strip below the
  video's details or the room's chat, just above the call bar, everyone side by side, scrolling
  across. Remembered. A phone held upright in fullscreen floats it, so the video keeps the screen

### Room panel
- People and Invite are one tab: who's in the room, then the QR code, code, password and invite
  link below them (a new host starts there)
- Searching YouTube has its own Search tab (the YouTube button in Now playing opens it), and the
  Queue tab is just the queue, with Find more videos under it. Picking videos in Search no longer
  jumps away to the queue when the first one starts
- A YouTube link pasted in Search shows a card with its picture, title and what it is (a video,
  a playlist, a Mix / radio, a time to start from), with Play now and Add to queue. A video in a
  playlist or a Mix can go with the rest of its list, or on its own. Enter on a link no longer
  queues it straight away; Enter on words searches
- Play now on a video in a playlist (with something already playing) starts at that video, not
  the playlist's first one; Add to queue adds the list from that video on
- A Mix YouTube won't open in an embedded player (when its first video can't be embedded): the
  video is still added, and the chat says why and that Autoplay carries on like a radio
- Phones held upright: while Search shows results or suggestions, the room's panel grows into a
  sheet up to the top of the screen, and the keyboard closes once a search starts, so the
  results have room to scroll; clearing the search puts it back

## [1.5.5] - 2026-11-20

### Video call window
- Folded up, it's easy to spot: a glowing blue pill with a slow pulse around it and a camera with
  a live dot in front of its title (still, for people who asked for less motion)
- Computers: drag the grip in its bottom right corner (shown when pointed at) to make it larger
  or smaller, or use the arrow keys on it; the same limits and remembered size as pinching it on
  a phone

### YouTube
- Seeking no longer shows YouTube's own title bar and buttons: while it catches up after a jump
  (and a moment after it plays again), they're cut off, and a widescreen video stays exactly
  where it was

## [1.5.4] - 2026-11-20

### Video details (phones held upright)
- More now shows a YouTube video's whole description, with its line breaks and full links (a
  search only gave its first line or two); a long one scrolls inside the card, and the video
  keeps its size

### Video call window
- On your own in a room, turning your camera on opens the call window ("Just you"); people who
  join come in beside you, one after another
- Phones and tablets: pinch the window with two fingers to make it larger or smaller, from a
  small tile up to as large as the screen holds it; the size is remembered, and Larger / Smaller
  still go back to the two usual sizes

### YouTube on touch screens
- Tapping the video only ever shows CineTab's own controls: YouTube's player no longer takes a
  tap, ads included (they play to the end there). An iPhone or iPad still needs one tap on
  YouTube's player to start a video, until it plays; elsewhere ▶ starts it

### Touch
- Your profile: the card is rounded all round and sits clear of the call bar below it; swipe it
  down to close it (a small handle at its top shows it can be pulled)
- Holding a button no longer flashes a square or selects its label; the room's tabs and buttons
  light up in their own rounded shape while pressed

## [1.5.3] - 2026-11-20

### Swipes in the room (phones and tablets)
- Swipe left or right on the room panel to move between Chat, Queue, People, Invite and Settings
- Phones held upright: swipe the panel down to close it, like a bottom sheet (a small handle at
  its top shows it can be pulled); swipe up on the title bar under the video to open it again
- Swipes only start once the finger clearly picks a direction, so taps, scrolling the chat and
  typing work as before

### Queue
- The video playing now has animated equalizer bars over its picture; they move while it plays
  and freeze while it's paused (still bars for people who asked for less motion)
- Previous / Next beside the play button are always there for YouTube, and with Autoplay on, Next
  loads the next suggestion straight away. Autoplay adds what's next to the queue while the last
  video plays, and anything you add goes before the Autoplay picks

### Ambient mode
- Installed as an app on a phone, the status bar takes on the glow's colour from the top of the
  picture, easing as the video changes, and goes back to the usual dark when the glow isn't shown
- Phones held upright: the title bar under the video has crisp rounded corners, with the glow
  only inside it

### Room
- Leave opens a small menu: Just leave (the room goes on) or End room, which ends it for everyone
  and can be chosen by anyone in the room
- Now playing's stop button is a stop icon, "Stop video for everyone"
- Phones held upright: the Room button at the top right of the player is gone where the room is
  already just below the picture (it stays sideways, in fullscreen, and before a video is open)

## [1.5.2] - 2026-11-20

### YouTube Autoplay & Recommendations
- Autoplay suggestions now provide true YouTube recommendations and design mixes, strictly avoiding picking songs from the same channel or artist so playback remains fresh and diverse
- In a room, Autoplay only commits a suggested song to the queue when the current video finishes and there is no next song waiting, and silently pre-fetches without prematurely occupying the queue slot

### Mobile layout & video details
- On phones held upright, the area below the video features channel information, an expandable full description, a one-tap button to copy the YouTube video link, and quick buttons to create or join a room when watching solo
- Rounded top corners on the below-the-video title bar for a seamless, modern look

## [1.5.1] - 2026-11-20

### Room panel
- The room's name is on the Room button at the top right of the player (with how many are in
  the room), so the panel starts straight with what's playing
- Hiding the panel: a round › button on its left edge, near the top (R and the Room button show
  and hide it too)
- Now playing no longer says who shared the video (the chat says so as it starts)
- Phones held upright: the Room button under the title is at the right end of its row

## [1.5.0] - 2026-11-20

### The room goes on without its host
- If the host leaves, closes the tab or loses the connection, the room carries on: the next
  person in line (whoever joined first) hosts it straight away, and everyone else reconnects to
  them. The chat stays, the room keeps its name and settings, everyone is let straight back in,
  and a YouTube video or queue goes on from where it was. A video streaming from the old host's
  own computer stops with it; anyone can share another. If the next in line is gone too, the one
  after them takes over a few seconds later
- The person who created the room is its owner: they can come back any time (also from the home
  page's remembered rooms) and are let straight in as a participant. Only the owner can end the
  room for everyone: Leave asks them whether to leave (the room goes on) or end it, which also
  removes it from everyone's remembered rooms. Everyone else just leaves
- Two browsers hosting the same room (one's connection came back, or the owner opened it again
  while it was going on) settle it themselves within seconds: the older one gives way and joins
  as a participant
- Nobody's secrets are passed around: the owner's browser keeps a key that the others only know
  the fingerprint of, and the next host recognises people by the fingerprints of their tickets
- With a CineTab from before this version in the room, a host leaving still ends it as before

### Phones held upright: what's playing, under its title
- In a room, Now playing sits just below the video's title: who shared it, then one row of
  buttons: the room (people icon and how many; opens and closes the panel, with a badge for
  unread chat), YouTube, share / change and remove
- The panel then starts straight with its tabs: the room's name is at the top of the player, so
  the panel has no heading of its own, and more room for the chat, the queue and search results
- The call window first opens on the picture, not over the title below it

### Computers: Now playing at the top of the room panel
- The Now playing bar is at the top of the panel, under the room's name
- A playlist's previous / next aren't in Now playing any more (on computers and phones): they're
  the player's own buttons, beside play

### Phones held upright: the video's details, the call bar, rounded corners
- With the room's panel closed (or outside a room), the space below the title shows about the
  video in a rounded card: a YouTube video's channel (verified or not), views, upload date and
  description, with a button to open it on YouTube; your own file's name, length, size and format
- The call bar (you, mic, camera, leave) stays at the bottom of the screen, with the panel open
  or closed
- The room's panel has rounded top corners

### The call window
- Small, it shows names for a few seconds (when it appears, someone joins or leaves, or it's
  touched or pointed at), then just the pictures and mics; large, it always shows them

## [1.4.9] - 2026-11-20

### The call window
- Everyone in a room appears in a small window over the player, like a video call, on computers
  and phones, also in fullscreen: their camera, or their avatar while it's off, with their name
- Each person's mic shows on their tile: on, or muted (red, crossed out), for everyone. Guests'
  mics are now known to the room (on the previous version they show as muted)
- Drag it anywhere with the mouse or a finger; it stays on screen and remembers where you left it
  (also when a phone turns sideways). Fold it up to its title bar, or make it larger
- It takes the place of the row of cameras at the top of the room panel
- Phones: the camera button on your own tile switches between the front and back cameras (the
  front one shows to you as a mirror, the back one as it is); everyone sees the new one at once

### A tidier room panel, with room for YouTube results on phones
- The top of the panel is just the room's name (its code, password and link are in Invite; who
  hosts and the connection in People)
- The tabs are one row of icons; the open tab also shows its name
- One place for YouTube: the YouTube button in Now playing opens the Queue tab's search (it can
  be opened before anything plays). While results show they fill the tab, and the buttons, hint
  and queue step aside until the search is cleared; Previous / Next leave Now playing beside the
  queue, which has the same
- Scrolling search results: only the results scroll, so swiping back up always works (before, the
  list scrolled inside the tab, and reaching its top stopped the scroll)

### A quicker timeline
- A tap on the timeline jumps your own video there at once (the scene preview no longer competes
  with the jump), and keeps playing
- Dragging: the picture follows as fast as the video can be decoded, without jumps piling up
  (each waits for the one before, and only the newest place counts; where the browser can, it
  jumps to the nearest keyframe on the way), then lands exactly where the finger or mouse let go.
  A finger's small wobble during a tap isn't taken for a drag

### The room panel opens and closes in motion
- It slides in from the side (on a phone held upright, up from below) as it fades in, and the
  player moves and resizes smoothly to make room; closing is the same backwards. Instant for
  people whose device asks for less motion
- **R** shows or hides it (outside a room, R opens the Watch together options); it's in the
  keyboard shortcuts list too

### Phones: the player and the room panel as rounded cards
- With the room open beside a video on a phone held sideways, or below it in fullscreen on a phone
  held upright, the player and the panel are two rounded cards like on a computer, only 6px apart
  (and clear of a camera cutout or the home indicator)

### Phones held upright: the title below the video
- The video's title is just below the picture, like the YouTube app (up to two lines; tap it to
  rename your own file), with the room panel or without it
- In a room, the top of the player shows the room's name instead
- Sideways, in fullscreen and on computers, the title stays at the top as before

## [1.4.8] - 2026-11-19

### Cameras in rooms, like a meeting
- A camera button beside the mic (both are now round buttons, as in a meeting): your camera, for
  everyone in the room. Everyone whose camera is on appears in a row of tiles at the top of the
  room panel, yours mirrored, with each person's name
- Everyone sees everyone: guests connect only to the host, so the host's browser passes each
  guest's camera on to the others (up to three other guests' cameras for each guest, plus the
  host's own)
- Small and at a modest rate (about 320×240, 15 frames a second), so cameras don't get in the way
  of the movie. They need a direct connection; someone connected through the room's relay can't
  send or see them
- Works with hosts and guests on the previous version: they just don't see cameras

### Room panel
- YouTube search results: the Videos / Playlists and Clear bar is frosted glass like the cards
  around it, instead of a dark rectangle; the results scroll below it (never under it), with More
  results kept at the bottom

## [1.4.7] - 2026-11-19

### YouTube fills the player on computers
- A YouTube video now fills the player like your own videos, in the page and in fullscreen
  (before, the title bar and controls sat above and below it, so it was smaller and had black
  bars in fullscreen). The title and controls come and go over it; a click plays or pauses, a
  double click is fullscreen, and Picture (Fit / Fill) works for it too
- While an ad plays, the controls along the bottom step aside, so YouTube's Skip button can be
  clicked (the keyboard still works)

## [1.4.6] - 2026-11-19

### Autoplay in rooms
- The host has the Autoplay switch while the room watches YouTube. While the last video in the
  queue plays, a video like it is added after it ("Added by Autoplay"), so the room goes on for
  everyone when the queue ends; anyone who can edit the queue can move or remove it
- What's next: what YouTube suggests beside the video, or another from its channel (the artist,
  for a song), never one the room already had. Turning Autoplay off takes out what it added
- The title at the top follows the queue when it moves on to a video whose title was known already

### Background play and picture in picture on phones (Brave and others)
- The picture in picture button is on every phone and tablet. Where the browser doesn't let pages
  float a video (Brave), it shows the video fullscreen on its own, with the browser's controls:
  going to the home screen floats it where the phone allows. A YouTube video gets the same
- Your own videos keep their sound in the background in browsers that stop a page's video when
  it leaves the screen (Brave, Safari): the sound goes on in a sound-only player from the same
  moment, the lock screen's buttons work on it, and the video carries on from there when you're
  back
- In Brave, Settings → Background play says how to keep YouTube videos playing (Brave's own
  Background video playback setting)

### Ambient mode, live
- The glow is a soft, blurred copy of what's playing, as it plays: your own video frame by frame,
  and a YouTube video through a second, muted, small copy of it kept in step with the player
  (YouTube sends that one at its lowest quality; its thumbnail stands in while it loads). It
  stops whenever nothing around the player can show it, or the page isn't on screen
- In a room, the glow reaches behind the side panel, which lets it through like frosted glass

## [1.4.5] - 2026-11-19

### Ambient mode
- The picture's colours glow softly around the player, like YouTube's ambient mode, drifting
  gently from scene to scene. A YouTube video glows with its thumbnail
- On by default; turn it off in the More menu (⋮) or, on phones, in Settings. Remembered

### Subtitles remembered
- Subtitles on or off is remembered for every video: your own, a room's and YouTube's
- Off means YouTube's own captions stay off too, even when the video or your YouTube account
  would turn them on. YouTube's captions are off until you turn them on

### YouTube Autoplay
- A switch at the top of the player: when a YouTube video (or the last video of a playlist)
  ends, its YouTube Mix plays next, the same Mix YouTube makes, and goes on from Mix to Mix.
  Videos played lately aren't picked again
- **Next** (beside play, Shift + N, the lock screen) skips to the Mix straight away
- If YouTube won't open the Mix here, the videos YouTube suggests play instead
- Turning it off stops after the video playing now. Remembered; also in Settings on phones

### Background play on phones and tablets
- Settings → **Background play**, for your own videos and songs and for YouTube:
  - **Picture in picture**: the video floats over other apps when you leave the browser, where
    the phone allows it (a YouTube video, which can't float from here, keeps its sound)
  - **Sound only**: the sound keeps playing, also with the screen off, and nothing floats
  - **Off**: it pauses when you leave
- A pause the phone makes as you leave is undone; your own pauses (also from the lock screen or
  headphones) never are. The Picture in picture button floats the video whatever this is
- The lock screen and notification show a YouTube video's picture, with Previous / Next in a
  playlist, Mix or Autoplay
- In a room, the room's own rules apply, as before

## [1.4.2] - 2026-11-04

### YouTube search in rooms
- The room's YouTube box and the Queue tab suggest what you watched before (YouTube videos and
  playlists, also from earlier rooms) as soon as you click into them, newest first, with when
  you watched each one
- Typing narrows the suggestions to the ones that match; Enter searches all of YouTube. A
  playlist picked from them carries on from the video you were on
- **Hide** (or Esc) puts the suggestions away; emptying the box brings them back

## [1.4.1] - 2026-11-04

### Fixed
- Phones held sideways in fullscreen: the picture now reaches the edge beside the camera
  (notch or punch-hole) instead of leaving a black bar there; the title, buttons and timeline
  stay clear of the camera. The home page and the room panel keep their content clear of it too,
  and the room panel stays above the iPhone's home indicator

### YouTube search
- The results have a **Clear** button that empties the search, and it stays at the top while the
  results scroll in the room panel
- Emptying the search box, or Esc in it, clears the results too (a second Esc closes the room's
  YouTube box); closing that box clears its search

### Other
- The offline player builds on Windows checkouts (CRLF line endings) too

## [1.4.0] - 2026-11-04

### YouTube, on your own and in rooms
- Search YouTube from the home page: Videos or Playlists, with pictures, lengths and "More
  results". Pasting a video or playlist link still works, and so does the paste button
- A YouTube video or playlist plays right in CineTab with its own controls (timeline, jumps,
  speed, volume, fullscreen, captions with C, Shift + N / P in a playlist); live streams show
  LIVE
- **Watch together** while a YouTube video plays creates a room that carries on with it, from
  the same moment, for everyone
- In a room, the YouTube box and the Queue tab search YouTube too (Play now / Add to queue)
- Searches go to public Piped servers (several are tried); a YouTube Data API key can be set in
  youtube.js to ask YouTube first. If none answers, a link to YouTube's own search is offered

### Dashboard
- The home page has a dashboard: the YouTube search and **Recently watched** (YouTube videos,
  playlists, and videos from this device), with how much is left, filters and Clear
- One click carries on: YouTube where you stopped (a playlist at its video), a video from this
  device straight away in Chrome and Edge on computers (the browser asks first), elsewhere after
  picking the file again
- For someone who has used CineTab before, the dashboard, rooms and converted videos come first
- History stays in this browser and is never sent anywhere

### Install as an app
- **Install app** at the top of the page (and in the footer): Android installs straight away,
  iPhone and iPad get the Share → Add to Home Screen steps
- A service worker (sw.js) keeps CineTab's own files, so the installed app opens without a
  connection; the app has a "Search YouTube" shortcut

### Other
- The tab is now called "CineTab - Movie Night Together"

## [1.3.1] - 2026-11-04

### Player on phones and tablets
- Play / pause and the jumps are big buttons in the middle of the picture. At the bottom, one row:
  where the video is, the timeline, its length, **Picture in picture**, **Settings** and
  **Fullscreen**
- Picture in picture on phones: the video floats over other apps (Android's floating window, the
  iPhone's PiP, older iPhones included); it leaves fullscreen first, and the button only shows
  where the browser supports it
- **Settings** (⚙) opens a sheet like YouTube's: playback speed, picture (Fit, Fill, Stretch,
  16:9…), volume boost, subtitles on / off, choosing a subtitle file and opening another video.
  Sideways it opens as a card in the middle
- The controls stay on screen while Settings (or a menu) is open, and hide again a few seconds
  after it closes
- Swiping up on the right of the picture goes past 100% into the volume boost (up to 300%, shown
  in orange); swiping down turns the boost off again. Settings shows the same boost
- Pinching is the Picture setting: spread two fingers for Fill, pinch them together for Fit
  (remembered, and it works outside fullscreen too)
- Double taps on the left or right jump 10 seconds with a ripple on that side, and every further
  tap straight after jumps 10 more (20 seconds, 30 seconds…)
- A tap shows or hides the controls (it used to pause in the middle of the picture)
- Fixed: after a volume or brightness swipe, the next tap was ignored and the swipe itself
  counted as a tap
- No grey flash on tapped buttons; a pressed button shrinks a little instead
- Sized for the space: the whole screen held upright or sideways, or the strip above a room's
  chat; clear of notches and the gesture bar in fullscreen
- Messages such as "Subtitles On" show as a pill above the middle buttons instead of covering them

### YouTube in a room, on phones and tablets
- YouTube's player fills the picture like any video, with the same controls over it, instead of
  sitting between a black title bar and a black controls bar. Fullscreen fills the screen
  (sideways it was a small picture with wide black borders)
- Upright, the player is just the video, so the room's panel below has much more room
- Taps, double taps (with the ripple), volume swipes and pinches work on YouTube's picture too;
  while an ad plays they're left to YouTube, so its Skip button can be tapped
- Settings works for YouTube: playback speed (for everyone in the room), Picture Fit or Fill (Fill
  crops to the screen, also by spreading two fingers), YouTube's captions on / off, and a
  subtitle file. Volume boost and picture in picture aren't possible for YouTube's player, so
  they're not offered
- Fixed: Subtitles in the Settings sheet closed the sheet

### Leaving the browser or locking the phone
- Lock screen and notification controls: the video's title, play / pause, jumps and the
  timeline (in a room they work for the room, like the player's own). It also tells the phone the
  page is playing media, so its sound goes on in the background where the browser allows it
- In a room, a pause the phone makes by itself while CineTab isn't on screen (some browsers pause
  video in the background; YouTube's player always does on phones) no longer pauses the video for
  everyone; coming back, the video catches up with the room
- The mic stays on while another app is open, and turns off when the phone is locked (in Chrome
  and Edge, which can tell when the screen is locked: a phone asks for that permission once, with
  the mic). Coming back says why it's off. If the phone itself stops the mic, the Mic button shows
  it's off

### Watch-together rooms
- The microphone no longer uses noise suppression, which cut out quiet or distant speech so others
  couldn't hear well; echo cancellation stays on so the movie's sound isn't sent back

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

[1.5.7]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.5.7
[1.5.6]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.5.6
[1.5.5]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.5.5
[1.5.4]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.5.4
[1.5.3]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.5.3
[1.5.2]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.5.2
[1.5.1]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.5.1
[1.5.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.5.0
[1.4.9]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.4.9
[1.4.8]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.4.8
[1.4.7]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.4.7
[1.4.6]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.4.6
[1.4.5]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.4.5
[1.4.2]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.4.2
[1.4.1]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.4.1
[1.4.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.4.0
[1.3.1]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.3.1
[1.3.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.3.0
[1.2.8]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.8
[1.2.5]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.5
[1.2.1]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.1
[1.2.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.2.0
[1.1.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.1.0
[1.0.0]: https://github.com/cinetab/cinetab.github.io/releases/tag/v1.0.0
