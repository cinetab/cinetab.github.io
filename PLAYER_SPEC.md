# CineTab player spec

The single source of truth for how the player should look and behave in every situation. Fill in the **Wanted** column; leave it empty where **Current** is already right. When a row is implemented, the two columns should match and **Status** becomes `done`.

## How to fill this in

- **Wanted:** what it should be. Short phrases are fine (`rounded 14px`, `hidden`, `same as V-PC`). Write `= current` if it's right as it is.
- **Status:** leave empty. It's filled in as rows are implemented: `todo`, `done`, `check` (done, please verify on a real device).
- **Notes:** anything else (why, a reference, "like YouTube app").
- A row that applies to several scenarios can say so: e.g. in the V-PP row write `same as V-PL`.
- Add rows freely if something is missing. Keep the scenario ID first so it's clear which screen it is about.
- Screenshots/sketches: put them in `docs/spec/` and link them in Notes, e.g. `[sketch](docs/spec/v-pp-dock.png)`.

---

## 1. Scenarios

Every table below uses these IDs.

| ID | Mode | Device | Applies when | Also covers |
|---|---|---|---|---|
| **V-PC** | Video | Computer | Mouse, window wider than 900px (or 601–900px held wide) | Tablet held sideways with a mouse |
| **V-PP** | Video | Phone, upright (portrait) | Touch, upright, up to 900px wide | Tablet held upright |
| **V-PL** | Video | Phone, sideways / fullscreen (landscape) | Touch, held sideways, up to 900px wide | Fullscreen on a phone |
| **A-PC** | Audio | Computer | as V-PC | |
| **A-PH** | Audio | Phone | Touch, up to 900px wide | Tablet. There's no fullscreen in audio. Turned sideways, the same player shows artwork left, details right |

### States

These combine with any scenario (e.g. *V-PP in a call*). Use the state name in the tables when a row only applies to one state.

| State | Meaning |
|---|---|
| **Solo** | Watching on your own, not in a room |
| **Room** | In a room, nobody's camera or mic on |
| **Call** | In a room, someone's camera or mic on |
| **Panel hidden** | The details panel (queue/chat) put away, where that's allowed |
| **Fullscreen** | Browser fullscreen (computer) / fullscreen button (phone) |
| **YT Music** | Playing a YouTube Music track (audio only) |
| **Local audio** | Playing an audio file from the device |

---

## 2. Player area (the video / the audio player itself)

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| V-PC | Position & size | Left of the panel, as large as fits, 16:9, centred vertically | | | |
| V-PC | Corners / frame | Rounded 18px, shadow, 12px from window edges | | | |
| V-PC | Narrow window (601–900px, mouse) | Same layout as wide: rounded video + rounded panel | | | |
| V-PP | Position & size | Top of screen, full width, exactly 16:9 | | | |
| V-PP | Corners / frame | Square, edge to edge | | | |
| V-PP | Under the video | The details panel (always), rounded top corners (20px) where it meets the video; the seekbar sits a little above the video's bottom edge (8px) with 12px either side, its knob whole | show the seekbar over the details panel. currently the circle point is cute by the panel.  | done | |
| V-PP | Around the panel's rounded corners | Plain black - no ambient glow of the video | | done | |
| V-PP | Call bar | As tall as its buttons, which sit centred in it | | done | |
| V-PL | Position & size (in a room) | The video card fills the space; a card on the left only while the call is pinned with everyone's video (otherwise the call is the floating pill) | | done | |
| V-PL | Corners / frame | Rounded 14px card, 6px gaps between cards | | | |
| V-PL | Solo, not fullscreen | Panel beside it if open | | | |
| V-PL | No panel open | The video fills the screen edge to edge: no border, corners or margins. The room's panel open, or the call pinned on the left with video, makes everything rounded cards with 6px gaps | | done | |
| V-PL | Fullscreen | Whole screen, no panel | | | |
| Phones | Going fullscreen | The panels step aside at first: the details panel closes (on your own too), the pinned call column folds to its buttons; both can be opened again | | done | |
| V-PL | Camera cutout | Ignored: the cards keep the same 6px margin on both sides, so the panel never shifts when the cutout is on its side | | done | |
| A-PC | Position & size | Left of the panel: artwork left (up to 480px), details column right (320–460px), 40–96px between them (7% of the width) - about the same as the margins at the sides. Centred vertically in the free room: 16px below the top row, and 16px above the call dock when there is one, so it moves up and down by itself as a camera comes on or off | | done | |
| A-PC | Now playing layout (design A) | The details column is as tall as the artwork: title (larger) + artist / album / year and ♡ level with the artwork top; seekbar (times at its two ends) and the buttons (larger) in the middle; seekbar (times at its ends) and the buttons at the bottom, level with the artwork bottom. Up next (the queue next track: round picture, title; click plays it) is a pill in the middle of the top row - at the bottom of the details column only when the top row is too narrow for it. A short stage (cameras on the dock, a low window): Up next is left out | | done | |
| A-PC | Artwork colour | The play button and the seekbar fill take the artwork own colour (kept bright); white for local files or a picture that cannot be read | | done | |
| A-PC | Narrow window (900px and less, with a mouse) | The same top row as the computer: Up next in the middle, Queue (opens the sheet on its Queue tab) · volume (slider drops down on pointing) · search · switch · ⋮. In a room, the tab bar sits just above the call dock, the player above both. A tab opened: the sheet has the same dynamic acrylic as a phone | | done | |
| A-PC | Narrowing the window | The side panel stays while the player beside it still fits (two columns, or at least 640px wide); narrower, it slides away by itself (Queue at the top right brings it back) and the player keeps its two columns over the whole width; widened again, the panel comes back by itself. 900px and less: the phone view (sideways or upright). Tablets the same, by their width | | done | |
| A-PC | Background | Blurred artwork ("mica"), stronger glow than before; no ambient glow | | | |
| A-PH | Position | Stacked: artwork, then title, seekbar, controls. Centred in the space between the top buttons and the bottom bars | | | |
| A-PH | Artwork size | As wide as the controls (max 460px); shrinks to fit the height left (e.g. in a call) | | | |
| A-PH | Sideways | Artwork left; title, seekbar, controls right; compact sizes | | | |
| All | Ambient glow (coloured light around the video) | On in video, off in audio | | | |
| All audio | Miniplayer | Never: no miniplayer for anything in the audio player (music, audio files, audio mode) - also going home from a room; the home page shows the room bar instead | | done | |
| All | Home (logo / back arrow) | Always opens the home page, from any player (video or audio, local or online) - also when the player has no history entry of its own | | done | |

## 3. Top bar (over the top of the player)

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| V-PC | Left | CineTab logo, then the title | | | |
| V-PC | Right | Miniplayer, Search, Queue | | | |
| V-PC | Shows | With the controls (hides after inactivity) | | | |
| V-PP | Left | Logo, then the video title (not the room name) | | | |
| V-PP | Right | Search (no queue button) | | | |
| V-PL | Left | Logo, then the title | | | |
| V-PL | Right | Search, Queue (no miniplayer) | | | |
| A-PC | Top left | CineTab brand | | | |
| A-PC | Top right | Search · Video/Audio switch · ⋮ (no Queue: the panel always shows) | | | |
| A-PH | Top left | CineTab brand | | | |
| A-PH | Top right | Search · Video/Audio switch · ⋮ | | | |
| A-PH | Search button | A true circle (38 x 38) | | done | |
| Phones | Settings menu (⋮ / ⚙) | A sheet that slides up from below and back down as it closes; a line under "Player settings"; pulled down from the top of its list, it closes - scrolling its list (either way) never closes it | | done | |

## 4. Controls (seekbar, time, buttons)

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| V-PC | Seekbar | Full width above the button row; times above it at both ends | | | |
| V-PC | Time format | `00:41` left, `03:20` right; tap the left one: time left | | | |
| V-PC | Left buttons | Volume (slider on hover) | | | |
| V-PC | Centre | Back 10s · Play/Pause · Forward 10s over the middle of the picture | | | |
| All video | Centre buttons look | See-through black circles with a light blur (4px) behind them; a little darker on hover | | done | |
| All video | Seekbar preview picture | Nothing over it: the centre buttons fade away while pointing along the seekbar or dragging it | | done | |
| V-PC | Right buttons | Video/Audio switch · ⋮ · Fullscreen | | | |
| V-PP | Seekbar | On the video's bottom edge, thin, thumb at the end | | | |
| V-PP | Time format | `0:41 / 3:20` bottom left; tap: time left | | | |
| V-PP | Right buttons | Video/Audio switch · ⚙ · Fullscreen | | | |
| V-PL | Layout | One row: time · seekbar · length · buttons | | | |
| V-PL | Right buttons | Video/Audio switch · ⚙ · Fullscreen (compact) | | | |
| A-all | Seekbar | Thin white bar under the title; knob on hover (always shown on touch) | | | |
| A-all | Time | Under the seekbar: elapsed left, length right. Elapsed only, not tappable | | | |
| A-all | Buttons | Shuffle · Prev · Play (large white circle) · Next · Repeat, spread across the column | | | |
| A-all | Shuffle / Repeat on | Blue with a dot under it | | | |
| A-all | Unavailable buttons | Kept in place, dimmed | | | |
| A-all | Skip ±5s | Not shown | | | |
| A-PC | Volume | A round speaker button among those at the top right (Queue · volume · search · switch · ⋮); pointed at, a dark pill with the slider drops down under it. The wheel over it, and ↑ / ↓, still change it | | done | |
| Computers | Volume by wheel / keys | The mouse wheel over the volume (video controls or the audio player's row) turns it up or down 5 points a notch; ↑ / ↓ also 5 points; the level shows as a message | | done | |
| V-PC | Keys 1-0 (jump to 10%…90%) | The percentage message on the right when the jump goes forward, on the left when it goes back | | done | |
| A-PH | Volume | None (phone's buttons) | | | |
| All | Auto-hide | Video: after inactivity. Audio: never | | | |

## 5. Video/Audio switch

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| All video | Where | In the control row (right) | | | |
| All audio | Where | Top right group | | | |
| All | Look | Pill, two halves (🎥 / 🎧), active half blue | | | |
| Phones upright | Size | 66 x 34 (halves 28px) - a little smaller than elsewhere | | done | |
| YT Music, Local audio | Video half | Greyed out, can't be picked | | | |
| YouTube link | Default | Video; can switch to audio | | | |
| Phones | Switching video <-> audio | The details panel stays (on an upright phone in video it's always there) and fades in from below - no sliding across | | done | |
| Local video file | Default | Video; can switch to audio | | | |

## 6. Details panel (Queue / Chat / People / Settings)

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| V-PC | Position | Right side, full height, rounded 18px, 12px inset | | | |
| V-PC | Call bar (the buttons) | A bar at the bottom of the player, centred under the video (in the room left of any side panel) - pinned or floating alike. Just below the video where there's room, else in its bottom row below the seekbar. With no side panel open (fullscreen or not) it steps away with the player's controls after a few seconds and comes back with them; with the room's panel or the pinned column open it always shows | | done | |
| V-PC | Hide | » button top-left of the panel, slides right | | | |
| V-PC | Resize (drag its left edge) | 40% of the window wide at most (never over 520px); the panel stays put - only its left edge moves | | done | |
| V-PP | Position | Under the video, fills to the bottom (or to the call dock) | | | |
| V-PP | Default | Always open, can't be hidden; no hide button and no grab handle on its top edge | | done | |
| V-PL | Position | Right card, rounded 14px | | | |
| V-PL | Hide | » slides right | | | |
| V-PL | Resize | None: no drag handle on its edge, no scrollbar pill | | done | |
| A-PC | Position | Right side, full height, rounded 18px card, 12px inset | | | |
| A-PC | Hide | Hidden by you it stays hidden, also as the track changes (only Queue brings it back). The » on the panel hides it; a Queue button then shows first among the buttons at the top right and brings it back. Hidden, the player takes the whole width (72px margins both sides), the call dock centred under it | | done | |
| A-PH | Collapsed, look | Taller (81px): the pull handle clear above the tab icons. Darker, less glassy than before; in a room a fine line separates it from the call bar below (also darker) | | done | |
| A-PH | Collapsed | A full-width glass bar (translucent, blurred, the artwork's colours through it) with rounded top corners: app-style tabs (icon over name), none marked while nothing is open. On your own: on the bottom edge; in a room: on top of the call bar (glass too) | | done | |
| A-PH | Opened (tap a tab) | The player shrinks to the strip on top; the sheet fills the rest (rounded top corners, handle, round ⌄, the tabs - selected one filled), the call bar pinned below it in the column. ⌄ or swipe down closes it | | done | |
| A-PH | Opened, on a phone | Fixed to the screen: the strip stays at the top, the call bar at the bottom edge - no black box as the browser's bars come and go | | check | Verify on a phone |
| A-PH | Strip and sheet meeting | The strip's seekbar a rounded line set in from the edges; a 10px gap, then the sheet - no straight line behind its corners | | done | |
| A-PH | Strip's artwork, local file | A music note (a video camera for a video) on a violet tile in the artwork's place | | done | |
| A-PH | Strip, seekbar | The strip is 70px tall, so its seekbar runs clear below the artwork and the title (not across the artwork's bottom edge) | | done | |
| A-PH | Strip on top (player collapsed) | See-through; artwork, title, Play, Next (dimmed when there's no next track); a seekbar along its bottom border | | done | |
| Solo | Tabs | Queue · Watch together | | | |
| Room / Call | Tabs | Chat · Queue · People · Settings | | | |
| Solo | Watch together tab | Your rooms first (open / rejoin), then the intro, Create a room, Join a room | | done | |
| Phones | Selected tab look | Same as the computer's panel: soft grey track, selected tab filled light blue (white label, blue icon) | | done | |
| Phones | Queue rows | One line; ♡ and ⋮ (⋮ shows play/up/down/remove) | | | |
| People tab | Order | People list · Copy invite link · QR · code · password | | | |
| Queue tab, Solo | Bottom card | "Watch together with friends · Create room" after the list | | | |

## 7. Call dock (in a room)

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| V-PC | Default | Docked on the video: rounded bar centred over its bottom, above the controls | | | |
| V-PC | Camera video | Two options, like phones: pinned or floating (layout button, U). Hidden with the chevron or H | | done | |
| V-PC | Pin / float button | One button, no menu: its icon shows what a click does (float / pin). Only while someone's camera is on. Also U | | done | |
| V-PC | Pinned, side panel closed | A rounded column left of the video with only the videos, stacked; the call bar below the video | | done | |
| V-PC | Pinned, side panel open | The videos in a row at the very top, the call bar at the bottom, the video between them with the same space above and below it (as large as fits - in fullscreen too). Opening / closing the panel: the row (or column) just goes, the other fades in from its side, the video and the bar glide to their places | | done | |
| V-PC | Floating | Window over the video; drag; resize from edges; double-click title: fit | | | |
| V-PC | Floating, the flyout (pin, hide…) | Shows as the mouse comes onto the window - no click; goes 1.5 s after the mouse has left the window and the flyout | | done | |
| V-PC | Bar buttons | Show/hide videos chevron (same as H; only with video) · Mic · Camera · Chat · PiP · Layout (pinned / floating) · Leave | | done | |
| V-PP | Default | Docked: videos in a row attached above the bar, bottom of the screen | | | |
| V-PP | Float (✥) | Only the videos float; bar stays pinned at the bottom | | | |
| V-PP | Floating window | Drag anywhere above the bar; corner grips + two-finger resize | | | |
| V-PP / A-PH | Bar buttons | Mic · Camera · (flip) · Leave; with someone's video on, also the show/hide videos arrow (no ✥/📌: the videos always float) | | done | The people count is in the People tab |
| Computers | Flip camera | Never shown (phones and tablets only) | | done | |
| V-PL | No video (no camera on) | A pill: a narrow, tall rounded column of the call's buttons (as long as its buttons, clear of the logo and the time) floating over the left of the video. Hides 1.5 s after the player's controls hide; a tap brings both back. The video keeps the full width | | done | |
| V-PL | With video, pinned (📌) | A rounded panel on the left beside the video (a rounded card too): everyone's video, then the buttons in two rows of three (leave a round button). The arrow folds the videos away: the panel morphs smoothly into the pill (and back) | | done | |
| V-PL | With video, floating (✥) | Only the videos float: a window to move anywhere and resize; the buttons are the pill, without Pin - Pin is in the floating videos' flyout (with Hide, mic, camera, camera switch). Pinned again: the left panel, videos then its 6 buttons | | done | |
| V-PL | Fullscreen (a phone turned sideways) | The same layout as not fullscreen: the details panel a card on the right beside the video, the pinned videos a fixed panel on the left - nothing laid over the video | | done | The centred row above the seekbar was dropped |
| All | Hiding / showing the videos (chevron, H, the flyout, the call menu) | One short, smooth change everywhere: the videos fade out / in, and whatever makes room glides to its new place and size - the video beside the pinned videos (V-PC, V-PL), the audio player above the dock (A-PC) - instead of jumping | | done | |
| V-PL | Leave menu (pinned panel, pill) | Opens in full above the button, out of the panel, on screen | | done | |
| A-PC | Mic / camera buttons | Always in the dock, never laid over your own video | | done | |
| A-PC | Dock | A bottom row centred in the room beside the side panel; everyone's video sits on it, above its buttons - each fitted whole in its own shape (never under the buttons) - or is hidden with the chevron / H; no floating. The audio player above it shrinks to leave it free | | done | |
| A-PC | Picture in picture (the call's PiP button) | A small window of only everyone's video, stacked, like a meeting's | | check | Verify in Chrome / Edge on a computer |
| A-PH | Dock | Same as V-PP: a full-width bar pinned to the bottom edge; everyone's video floating above everything, or hidden (arrow) | | done | |
| A-PH | Leave menu | Opens above the collapsed details bar (not under it) | | done | |
| A-PH | Artwork gestures | Double tap: save (a heart pops on it) / unsave (the broken-heart "Taken out of Saved" message). Swipe right to left: the next track (like Next); left to right: the previous one in the queue | | done | |
| A-PH | Collapsed details bar | A pull handle on top; swiped up, the sheet opens on the tab last open | | done | |
| A-PH | Sheet open | Icon-only tabs; the page behind its rounded corners is the same dynamic mica (no dark band) | | done | |
| A-PH / V-PP | Details panel background | Dynamic mica: the artwork (or the video's picture) blurred deep into it, changing with what plays | | done | |
| A-PH | Sheet's hide (⌄) button | On the right of the tabs | | done | |
| All | Leave | Red round button; host: leave or end for everyone | | | |
| All | Nobody's camera on | Avatars in tiles (or hidden?) | | | |

## 8. Audio player details

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| YT Music | Artwork | The shape of what the picture really shows, black bars left out (measured): an album cover is 1:1 - also one inside a 4:3 / 16:9 YouTube thumbnail with bars round it; a landscape picture gets its own ratio. Computer and phone | | done | |
| YouTube link (in audio) | Artwork | 16:9, the video's picture, filled (no black bars) | | | |
| Local audio | Artwork | Square, a music note centred in it (the equalizer a band below it); the panels' mica in the placeholder's violet / blue | | done | |
| Local video (in audio) | Artwork | 16:9, a video camera icon centred in it | | done | |
| Local video | Panels' mica | From the video's own picture, taken again every few seconds as it plays and after a jump - the same acrylic as a YouTube video's | | done | |
| All | Artwork look | Rounded corners (14–16px), soft shadow | | | |
| All | Title | One line, bold, left-aligned; scrolls sideways when long, edges fade ("…" with reduced motion) | | | |
| YT Music | Line under title | Artist (bright) · Album · Year (muted); one line, scrolls when long | | | |
| Others | Line under title | none | | | |
| Local audio | Visualizer | The file's real spectrum (bars in a band under the note), moving with the sound - flat while paused, nothing made up; computer and phone | | done | |
| All | ♡ Save | At the end of the title row; pink when saved. Hidden where nothing can be saved (local files) | | | |

## 9. Fullscreen

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| V-PC | Fullscreen | No panel open: the video fills the whole screen (no margins, no corners). In a room the seekbar sits a fixed step higher (never moving) and the call bar fits in the row below it | | check | Verify in real fullscreen |
| V-PC | Fullscreen, pinned with video, no panel | Not a column: a card of everyone's video centred just above the seekbar (more people side by side), the call bar at the bottom - the seekbar between them | | done | |
| V-PC | Hiding / showing the videos, pin / float | A short, light fade (no whole-page transition) | | done | |
| V-PP | Fullscreen button | Goes to landscape fullscreen (V-PL) | | | |
| V-PL | Fullscreen | Whole screen, controls over the picture | | | |
| Phones | Opening a video | Normal view (never fullscreen by itself) | | | |
| Audio (phones) | Fullscreen | Not available | | | |
| Audio (computer) | Fullscreen | Entering audio leaves fullscreen | | | |
| V-PC | Miniplayer | Button in the title bar (or I; I again opens the player): the video goes on in a corner of the home page, with a seekbar on its bottom edge | | done | Was black: fixed |
| Audio | Miniplayer | Not available (button hidden; I says so) | | done | |

## 10. Menus and overlays

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| PC | Settings menu (⋮) | Card under the button | | | |
| Phones | Settings menu | Full-width sheet from the bottom | | | |
| All | Settings menu rows | Ambient · Subtitles · Shuffle · Speed · Picture · Volume boost · Open file · Audio mode · Keyboard shortcuts (PC only) | | | |
| All | Settings menu heading | "Player settings" plain text, no box of its own | | done | |
| All | Stop video | In the settings menu on every device and mode while something plays (computers' menu, the audio player's, the phone's settings sheet): stops it, back to "pick a video" (in a room: for everyone, when allowed) | | done | |
| PC | Search flyout | Centred card; pills YouTube · Music · Playlist; Clear after results | | | |
| Phones | Search flyout | Full screen (also over fullscreen video); × instead of Clear | | | |
| All | Search loading | Shimmer rows, results fade in | | | |
| All | Notices (errors, converting) | Small card at the top of the player | | | |
| All | Toasts | Bottom centre | | | |

### Keyboard shortcuts (computer)

| Key | Current | Wanted | Status | Notes |
|---|---|---|---|---|
| P | Picture-in-picture | | done | |
| I | Miniplayer on / off (video mode only) | | done | |
| A | Video / audio mode (your choice: holds for the next videos) | | done | |
| M | Your mic on/off (in a room) | | done | |
| Shift + M | Mute / unmute the player | | done | |
| S | Save the video (or its playlist) - the heart's choices | | done | |
| Shift + V | Your camera on/off (in a room) | | done | |
| H | Hide / show everyone's video (in a call, only while someone's video is on; otherwise nothing) | | done | |
| U | The call's video pinned / floating (computers: docked / floating, like D; phones sideways: pinned / floating; upright: always floating) | | done | |
| (all) | Each button's hover popup names its key: mic (M), camera (Shift + V), mute (Shift + M), miniplayer (I), video/audio switch (A), picture in picture (P) | | done | |

## 11. Home page

| Scenario | Property | Current | Wanted | Status | Notes |
|---|---|---|---|---|---|
| PC (>980px) | Layout | Library column + rooms panel on the right | | | |
| Phones (≤980px) | Order | Rooms first if any room exists; else hero → rooms → recent | | | |
| Phones | Bottom nav | Home · Lobby · Search · Library · Guide | | | |
| All | Refresh while in the player | Lands on home (a room rejoins in the background) | | | |
| PC (>980px) | Rooms panel | A fixed right column: stays in place while the page scrolls (sticky under the header) | | done | |
| PC | Content area under 1080px (sidebar expanded, narrower window) | Stacked like a phone: the rooms panel full width first (if it lists rooms), cards side by side; nothing squeezed or under the panel | | done | |
| PC | B | Collapse / expand the left sidebar (also with a button focused) | | done | Was blocked by hidden dialogs |
| PC (>980px) | Rooms panel, in a room | The live room's card: a green "Live now · N watching" pill with a pulsing dot | | done | |
| All | Room "Last active" | When it was last in use (kept current while you're in it, stamped when you leave) - not when it started | | done | |
| PC | Trackpad bounce at the page's ends | Allowed (the browser's own); the header, the left sidebar and the rooms panel all move with it together | | check | Verify on a Mac trackpad |
| A-PC | Behind the side panel | The artwork's blurred colours, full width; the panel is acrylic over them (translucent, blurred) | | done | |

## 12. Motion

| Thing | Current | Wanted | Status | Notes |
|---|---|---|---|---|
| Panel open/close (PC) | Slides from the right | | | |
| Audio sheet open/close (phones) | Slides up / down | | | |
| Selected tab | Pill slides | | | |
| Search results | Fade in one after another | | | |
| Reduced motion setting | All of the above off | | | |

---

## 13. Rules (hold everywhere in the player)

Conditions that apply across scenarios - whatever the screen, mode or state, the player must follow them. One rule per row. These win over a table above if the two disagree (say so in Notes when a table row is an exception).

How to fill a rule:

- **ID:** `R-` and a number (`R-12`). Never reuse an ID; mark an old rule `dropped` instead of deleting it.
- **When:** the condition, as specific as needed (`a YouTube Music link starts`, `the listener picks Audio`, `any phone, the panel open`).
- **Then:** what must happen (or never happen).
- **Applies to:** scenario IDs or states (`all`, `V-PC, A-PC`, `Room / Call`, `phones`).
- **Until / unless:** what ends the rule or the exceptions (`until the listener picks Video`, `not in fullscreen`).
- **Status:** leave empty; filled as rules are implemented (`todo`, `done`, `check`).

### Template (copy a row)

| ID | When | Then | Applies to | Until / unless | Status | Notes |
|---|---|---|---|---|---|---|
| R-__ | | | | | | |

### Mode (video / audio)

| ID | When | Then | Applies to | Until / unless | Status | Notes |
|---|---|---|---|---|---|---|
| R-1 | An audio file or a YouTube Music link plays | Audio mode only; the Video half of the switch is greyed out | all | - | done | |
| R-2 | The listener picks Audio with the switch | Every next video plays in audio mode too | all | until they pick Video | done | Music and audio files stay audio regardless (R-1) |
| R-3 | The listener picks Video | Every next video plays in video mode | all | music and audio files (R-1) | done | |
| R-4 | Audio mode | No fullscreen, no miniplayer, no picture-in-picture | all | - | done | |

### Panel and layout

| ID | When | Then | Applies to | Until / unless | Status | Notes |
|---|---|---|---|---|---|---|
| R-5 | The miniplayer opens | Only the video shows in it (no panel, no controls but the seekbar); the panel keeps its open/closed state for when the player opens again | V-PC | - | done | |
| R-6 | Anything is drawn on the edge between two areas (a seekbar's knob, a handle) | It shows whole - never cut off by the area next to it | all | - | done | V-PP seekbar, A-PH strip |
| R-10 | The player's controls hide after a while without a touch | Overlays that belong to them hide too - the V-PL call pill 1.5 s after them; a tap brings all back at once | V-PL (and any overlay added later) | the pill's menus open | done | |
| R-11 | A side panel is showing (the room's panel, or the call pinned on the left with video) | Everything is a rounded card with 6px gaps; no side panel: the video goes edge to edge | V-PL | fullscreen (always edge to edge) | done | |
| R-12 | The call has video to show | Pinned: a panel showing the videos; floating: a window of the videos only. No video (none on, or folded away): the call's buttons alone, as a compact pill/bar | phones (V-PL, V-PP) | - | done | V-PP: the pinned bar at the bottom |
| R-13 | Something can be dragged to resize | Only where resizing is offered; elsewhere no handle, grip or pill is drawn on the edge | all | - | done | V-PL panel: no resize |
| R-14 | A phone held upright, in a room | The call is always a full-width bar pinned to the bottom edge (same design in video and audio). Everyone's video always floats (a window to move / resize) - no pinning - or is hidden with the arrow; with no video there's no window at all | V-PP, A-PH | - | done | |
| R-15 | The call's buttons are shown | No people-count button, on any device: a round button with a rounded chevron shows / hides everyone's video - only while someone's video is on (up / down on a horizontal bar, right / left on a vertical pill). Phones: ✥/📌 also only with video | all | - | done | |
| R-16 | A computer's call bar | Never covers or moves the seekbar: below the video if there's room, else in the bottom row below the seekbar; centred on the video (audio: on the room beside the panel) | V-PC, A-PC | floating | done | |
| R-17 | The call's videos float in a window | A plain acrylic frame (translucent dark, blurred, no shine). Resizable to any shape - the video fills it. Four rounded resize corners show for 3 s after a touch / click. The corner (or side) opposite the one dragged stays put; from 160x120 up to 60% of the screen's width, stopping at the screen's edge. Dragging follows the finger / mouse exactly, in every mode | all | - | done | |
| R-18 | The floating videos are tapped / clicked (not dragged) | A small flyout beside the window: pin them back (where pinning exists), hide them; plus your mic, camera and camera switch when they don't fit on your video. Gone after 4 s, on a tap elsewhere, or when dragged | V-PC, V-PL, phones | - | done | |
| R-19 | Joining a room (the waiting messages) | They name the room (its code only while the name isn't known yet); no Cancel button - the × leaves | all | - | done | |
| R-20 | Previous / next track | Always shown; with nothing before / after this track, dimmed and inactive (not hidden) | all | - | done | |
| R-21 | A phone's player, pulled down from its top band | Pull to refresh: a round arrow follows the finger, turns blue past the line; let go there and the page reloads (landing on home). Not from the seekbar, the call, menus or typing boxes, nor while what's under the finger is scrolled down | phones | - | done | |
| R-22 | The call's flip-camera button | Phones only; held sideways, only in the pinned panel with everyone's video (not in the pill) | phones | - | done | |
| R-8 | The A-PH sheet is open (keyboard up, browser bars, in a room) | It fits the part of the screen that shows; the strip on top stays in view | A-PH | - | check | Verify on a real phone |
| R-9 | A YouTube Music track starts | Its artwork and details come from that track only (never the one before); no confident album match: the YouTube picture | all | - | done | |
| R-__ | | | | | | |

### Shortcuts and input

| ID | When | Then | Applies to | Until / unless | Status | Notes |
|---|---|---|---|---|---|---|
| R-7 | A key is pressed while typing in a box | No player shortcut runs | all | - | done | |
| R-__ | | | | | | |

### Room / call

| ID | When | Then | Applies to | Until / unless | Status | Notes |
|---|---|---|---|---|---|---|
| R-__ | | | | | | |

## 14. Anything else

Free-form: things that don't fit a table, priorities, or "do this first".

-
