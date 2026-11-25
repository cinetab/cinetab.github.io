# CineTab project guide for AI coding agents

This guide describes the current source layout and the behavior that matters when changing the interface or playback. Read it together with `README.md` for the product, setup, privacy, and release details.

## What this project is

CineTab is a static browser app. The website is served as ordinary HTML, CSS, and JavaScript; there is no frontend framework, bundler, or server-side application. Local media is read by the browser. Watch-together rooms use browser-to-browser WebRTC, with public relays used only to exchange encrypted connection messages.

The main source page is `index.html`. Its home shell and player are two views in the same document. JavaScript switches between them; opening a player or room does not navigate to a separate app page.

## Source map

| File | Responsibility |
| --- | --- |
| `index.html` | Home, guide, library/room views, player markup, dialogs, and ordered script loading. |
| `style.css` | All site and player styling, including responsive, room, fullscreen, call, and audio layouts. |
| `script.js` | Player lifecycle and controls, local file loading/conversion integration, playback state, audio mode, fullscreen, and player overlays. |
| `youtube.js` | YouTube iframe/API playback, search/results, playlists, track metadata, and YouTube playback integration. |
| `room.js` | Create/join rooms, room panel/tabs, chat, people, invites/settings, WebRTC media, shared playback, and queue. |
| `signaling.js` | Encrypted room signaling through public relays; connection discovery, not media playback. |
| `converter.js` | Local-file capability checks and conversion orchestration/storage. |
| `converter-worker.js` | ffmpeg.wasm worker used for browser-side media conversion. |
| `history.js` | Browser-local recent media, saved items, and persistent file handles where supported. |
| `home.js` | Home/guide view navigation, room cards, install prompt, dashboard search/history, and home-page interactions. |
| `tooltips.js` | Accessible tooltips for title/help text, including the player. |
| `vendor/qrcode-generator.js` | QR code generation for room invites. |
| `tools/build-offline.mjs` | Produces the one-file offline player. |
| `cinetab-offline.html` | Generated player-only artifact. Do not edit by hand. |

### Script loading and shared APIs

The scripts in `index.html` are classic scripts, not ES modules. They share the page's global lexical scope and depend on load order. Keep that order intact and avoid introducing duplicate top-level `const`/`let` names. Useful public bridges include `window.CineAudioMode`, `window.CineYouTube`, `window.CineRoom`, `window.CineHistory`, `window.CineSaved`, `window.CineHome`, and `window.together`.

## Player structure and playback paths

The player is `.player-page` in `index.html`. Its `.container` owns the media surface and playback controls. Related content (metadata, details, room panel, notices, and call UI) is placed beside or over that surface. `script.js` controls player visibility and mode; `youtube.js` and `room.js` provide playback backends and shared playback behavior.

- **Local video/audio:** file selection and drag/drop enter through `script.js`. Browser-compatible media uses the native media element. Unsupported formats or silent audio paths can be converted locally through `converter.js` and `converter-worker.js`. Local media is never uploaded by this flow.
- **YouTube:** `youtube.js` owns the YouTube player/API and track/playlist behavior. `script.js` coordinates the player surface and controls. Music tracks use audio mode automatically; do not assume a YouTube iframe exposes decoded audio samples.
- **Watch-together rooms:** `room.js` coordinates room state, playback sync, queue, chat, and WebRTC streaming/calls. `signaling.js` only helps peers discover/connect to each other. Playback mode and room membership are related UI states but are not interchangeable.
- **Audio mode:** `.container.audio-mode-only` is the main CSS state and `.player-page.audio-mode-active` mirrors it for page-level layout. `script.js` creates `.audio-mode-view` and moves existing timeline/control elements into it, keeping the playback logic and DOM controls shared. Local audio and YouTube Music can require audio mode; desktop manual audio mode can open the room queue. Keep the album art/placeholder and real playback controls functional together.
- **Fullscreen:** fullscreen is a player layout state, not a new playback backend. Keep video and iframe sizing clipped to `.container`, including portrait, landscape, and fullscreen. Audio mode intentionally exits fullscreen when entered.
- **Miniplayer:** the solo miniplayer is a desktop feature and is disabled at small widths and in audio mode. Preserve that behavior unless explicitly redesigning it.

## Responsive behavior

Responsive behavior is driven mainly by CSS in `style.css`, with a few JavaScript decisions based on `matchMedia` and pointer/orientation checks.

| Viewport class | Current behavior to preserve |
| --- | --- |
| **Phone / compact, up to 900px** | Uses compact player rules. Portrait room playback places the video surface above the room panel; the panel takes the remaining space below it. Audio mode has a dedicated vertical layout. Call controls/docks must respect safe areas and must not cover essential playback or room controls. |
| **Tablet-sized, 601–900px** | Still uses the compact player breakpoint; do not assume a tablet should get the desktop side panel merely because it is wider than a phone. Check both width and orientation. |
| **Desktop, 901px and wider** | Uses the desktop player and room-sidebar layout. Audio mode can show its wide artwork-and-controls surface beside the room panel. Miniplayer is available when otherwise eligible. |
| **Short landscape screens** | Additional max-height rules compact the player and call UI. Check these when changing fixed heights or vertical spacing. |

The home page has its own breakpoints: at wide widths (currently 1200px and above) the launcher and active rooms can share a two-column layout; below that, they stack. Narrow home rails/navigation have additional 767px, 600px, and 860px rules. Player and home breakpoints are not a single shared responsive system.

Important page/player state classes include:

- `.player-page.room-open`: a room is open; room panel and media surface are laid out together.
- `.container.audio-mode-only` / `.player-page.audio-mode-active`: audio-only presentation.
- `.mobile-audio-extended`: expanded mobile audio/room panel presentation.
- `.container.fullscreen` and the browser fullscreen element: fullscreen presentation.
- `.title-below`: portrait phone title/details placement for solo video.
- Call dock classes on `.player-page` and `.room-call`: call position/size state; inspect `room.js` before changing those styles.

## Audio / video mode

The player has two media modes, expressed as plain classes. (An earlier `window.CinePlayerCases` / `data-player-case` design was never implemented in JavaScript; its CSS has been removed. Don't reintroduce selectors that depend on it.)

| State | Set by | Meaning |
| --- | --- | --- |
| `.container.audio-mode-only` + `.player-page.audio-mode-active` | `setAudioMode()` in `script.js` | The audio player is showing (artwork, title, timeline, controls). |
| `.container.audio-mode` | `script.js` (`loadedmetadata`), `room.js` | The current file has **no picture**. Not the same as the above; used by ambient, PiP and room sharing. |
| `.container.is-yt-music` | audio-mode `update()` in `script.js` | A YouTube Music track (audio only). |

**The audio player's layout (2026 redesign).** The view is `section#audio-stage.audio-mode-view`, built in `script.js`. Its parts have their own `ap-` classes:

- `.ap-art`: square, or 16:9 with `.audio-art-wide` for a YouTube video or a video's own frame. It also holds `.ap-viz`, the equalizer, for local files only.
- `.ap-head`: the title, the artist · album · year line, and Save.
  - The title is one line, and so is the artist line, which shows for YouTube Music only. Each scrolls sideways when too long (`fitAudioMarquee`), restarting only when the text or width changes.
  - The Save button is the heart, in `.ap-actions`.
- `.ap-timeline`: the seekbar, with the times under it.
- `.ap-transport`: shuffle · previous · play · next · repeat. Unavailable buttons stay in place, dimmed.
- `.ap-volume`: shows with a mouse or trackpad only.

The seekbar, play controls, volume and Save button are the video player's own elements, moved in and back by `setAudioMode()`.

All of its CSS is the **"Audio player (2026 redesign)" block at the end of `style.css`**. It is scoped by the id, so the ~300 older `.audio-mode-*` rules above can't reach it. Edit there.

The layout follows the stage's own size, which is a size container named `apstage`, not the window's:
- an upright stage stacks the artwork above the details;
- a wider one (aspect ≥ 1) puts the artwork on the left and the details on the right;
- a low wide stage (phone sideways) is compacted.

Behaviour to preserve:

- **The switch.** `.audio-mode-toggle` is a two-half pill (`.video-choice` / `.audio-choice`). Each half selects its own mode; clicking the active half does nothing. In video mode it sits in `.video-controls .right`; in audio mode `script.js` moves it into `.audio-corner-actions` (top right). **All of its CSS is one block near the end of `style.css`** ("Video / Audio switch - the ONLY rules"). Edit there; don't add overrides elsewhere.
- **Automatic audio mode.** YouTube Music and local audio files switch to audio mode by themselves, with the Video half greyed out (`.inactive`, `aria-disabled`). A local file counts as audio only from its MIME type, or once *its own* metadata has loaded with no picture (`videoWidth` is 0 for every file before that). Automatic audio mode switches back to video when a video replaces it; a mode the listener chose is left alone.
- **Desktop (901px and wider).** Entering audio mode opens the queue panel beside the player; leaving closes it again only if it was opened for audio mode and no room is open.
- **Phones and tablets (900px and below).**
  - Top right: search, the Video/Audio switch and More only (no room button).
  - Bottom: on your own, one bar with **Queue** and **Watch together**; in a room, **Chat / Queue / People / Settings** above the call dock. (Which tabs show follows `.room-panel.solo-queue`.)
  - Portrait: the player is centred horizontally and sits on the visible bottom bars (`--audio-bottom-space`: the tab bar, plus the call dock in a room), with the artwork growing into the free height above. Landscape: artwork left, title/timeline/controls right.
  - A tab opens the panel as a sheet (`.mobile-audio-extended`); it slides up and back down through `together.setAudioExtended()` in `room.js` (also used by the collapsed strip and swipe-down). Never toggle the class directly, and don't put transitions on the panel's `transform` (the bar is centred with it, so it slid sideways). The open sheet (both orientations) is the strip on top plus the panel filling the rest; its hide button is a ⌄ in the tab row.
- **Hiding the panel.** Computer video and phone landscape/fullscreen video: the » on the side panel (slides right). Phone audio: the ⌄ on the open sheet (slides down; also a swipe down). Upright phone/tablet video: the panel under the video always shows - no hide button and no swipe to hide. Computer audio: no hide button.
- **Panel tabs on an upright phone/tablet** stack their sections in one column (`flex-direction: column` on `.room-tab`); in a room the Queue, People and Settings tabs had been laid out in a row. In a room the call dock (tiles + bar) is the last item of the page's column and the panel grows to meet it - no fixed positioning, no reserved padding.
- **Queue rows on touch screens** stay on one line; their play / move / remove buttons open from a ⋮ (`.room-queue-row-more`, `.actions-open`). The "Watch together with friends" card follows the queue on phones and tablets (it is a sticky footer only on computers).
  - The More menu is a full-width sheet. Nothing around it may have `transform`/`backdrop-filter` (that traps a `position: fixed` child); the corner pill's blur is on its `::before` for that reason.
  - The time is a plain label in audio mode (no switching to the time left).
  - **No fullscreen in audio mode**: the button is hidden by CSS and `toggleFullscreen()` refuses (entering audio mode also exits fullscreen). Opening a file or a YouTube video on a phone starts in the normal view, not fullscreen.
- **Artwork.** The frame is 16:9 for a YouTube video's picture (`.audio-art-wide`, set in `update()`) and square for music and files; the image always fills it (`object-fit: cover`). YouTube pictures use the 16:9 `hq720.jpg` (falling back to `mqdefault.jpg`), never the 4:3 `hqdefault.jpg`, whose black bars would show.
- **Overlays.** `.audio-menu-backdrop` is hidden by default and shown only behind the open settings menu in audio mode. `.audio-collapsed-bar` (mini strip) is phone-only. The video's ambient glow is hidden in audio mode (`.audio-mode-mica` is the audio backdrop). The room call bar shows only when it isn't `[hidden]`.
- **Moved controls.** Audio mode moves the timeline, centre controls, volume, search, More menu, room button, queue button and shuffle into the audio view, leaving comment placeholders, and puts them back on exit. PiP's `hidden` state is restored to what it was; shuffle's visibility belongs to `room.js`.

### Search flyout (`cmdPalette` in `script.js`)

- One pill row chooses where to search (YouTube / Music / Playlist); Enter searches there. Typing shows no "Search YouTube for …" rows, and a matching recent video runs on Enter only if it was picked with the arrow keys.
- The Clear button exists only while results are showing (`syncClear()`); the pills stay to search again elsewhere.
- Phones (up to 600px wide, touch screens up to 900px, or short landscape): the flyout fills the screen, Clear is a cross only, no keyboard hints. When the player is fullscreen, opening the flyout moves it inside the fullscreen element (otherwise it can't show).

### Home page on phones

Stacked (980px and narrower): with any room listed (live or recent), Active & Recent Rooms comes first; with none, hero → rooms → the rest. `room.js` sets `.has-rooms` (and `.has-live`) on `.home-rooms-panel`.

### Search results

While YouTube answers, `youtube.js` shows shimmering placeholder rows (`.yt-skeleton`); the results then fade in one after another (`.yt-enter`, `--i`). Both are off with reduced motion.

### Reloading, artwork, tabs

- **A reload always lands on the home page.** A file or YouTube video isn't restored. In a room, `room.js` rejoins it in the background (`cinetab:reload-room`) and keeps the home page showing (`landHome()`); its card turns Live with Return.
- **Artwork.** YouTube Music (`music.youtube.com` links and Music search results) always plays in audio mode, in a square frame with the album art (iTunes lookup, run once the title is known). A YouTube video keeps its own 16:9 picture, also in audio mode - the album lookup runs for music only. YouTube pictures fall back `hq720` → `maxresdefault` → `mqdefault` (all 16:9, no bars).
- **Panel tabs on phones/tablets.** One pill slides behind the selected tab (`.room-tabs::before`, positioned from `--tab-x` / `--tab-w` set by `placeTabIndicator()` in `room.js`); the older per-layout fills and underlines are switched off.
- **Settings menu.** "Keyboard shortcuts" is a normal `more-menu-row` (it was an old `more-row` with the browser's default button border) and is hidden on touch-only devices.
- **People tab.** "Copy invite link" sits right under the people list, above the invite details.

### Window sizes on a computer, title bar, audio details

- **A narrow window with a mouse** (601-900px wide, landscape) keeps the desktop layout - the rounded panel beside a rounded video. The square full-height side column is for touch screens only: the "Player layout authority" block in `style.css` is `(min-width: 901px), (min-width: 601px) and (orientation: landscape) and (hover: hover) and (pointer: fine)`, and the phone-landscape block below it adds `(pointer: coarse)`.
- **Title bar:** the CineTab logo first, then the title; the miniplayer button sits at the end of the title area (CSS `order`, the markup is unchanged).
- **Audio player title:** always one line; when it's longer than the space it scrolls sideways (`fitAudioMarquee`, also on resize), fading at the ends (`.is-scrolling`). For YouTube Music the line under it is Artist • Album • Year, and the title drops a leading "Artist -/–/—" (`withoutArtist()`).
- **Computer audio player, top right:** search, Video/Audio switch, More, and the queue button (the room is a tab of the panel beside it). Phones don't show the queue button there.

### Call dock (restored to v1.8.3's behaviour)

- **Phones held upright:** docked, everyone's video is a row attached above the call bar, at the bottom of the page's column (`.room-call.unit.docked.strip`, an in-flow flex item - not `position: fixed`); the panel grows to meet it. The ✥ button floats the videos only: the call bar stays pinned at the bottom in a wrapper with the docked call's classes (`.room-call-pinned-bar`, room.js `footInCall` / `barPinnedOut`), and the floating window keeps above it (`pinnedBarH()`). It resizes from its corner grips (faintly shown on touch, fully on a tap) or with two fingers.
- **Phones held sideways:** docked, a rounded column on the left; the call, video and panel are three rounded cards 6px apart; the player's controls are one row (time, seekbar, length, buttons). Floating: the whole unit floats, as in v1.8.3.
- **Computers:** docked over the bottom of the video (centred on the picture, above the controls), pinned to the side (a column; with the panel open, the "rail": videos above the video, buttons below), or a floating window. The rail keeps its own grid - the later room layout rules exclude `.call-dock-rail`.
- After v1.8.3, many overrides broke this (hiding the float button and resize grips on phones, a fixed "floating video card", a fixed bottom bar "independent of the saved dock", video-shrinking rules). They were removed; don't reintroduce dock rules without checking all of these modes with two people in a room.

### Added in 2.1.0 (script.js unless noted)

- **YouTube frame.** `.yt-mount iframe` always runs past the picture's box above and below (`--yt-bleed`), so YouTube's own title bar, "More videos" and logo stay cut off (also while paused). In Fit it is exactly as wide as the video (`--yt-ar`, from YouTube's oEmbed answer, `paintYouTubeShape()`), so the extra height never enlarges or crops the picture. Don't toggle the bleed per state: that made the picture jump.
- **Media keys and lock screen.** While a YouTube video plays, `sessionKeeper` plays a silent sound so the browser gives this page (not YouTube's frame) the media keys, the lock screen and the notification. Previous / Next follow the player's own `.prev-track` / `.next-track` (`updateTrackActions()`).
- **YouTube seekbar previews.** `CineYouTube.storyboard(id)` (youtube.js) gets YouTube's signed storyboard links from a Piped server and loads the sheets straight from `i.ytimg.com`; `.yt-sb-frame` in `.thumbnail-preview` shows the frame (`.yt-has-preview`).
- **Video Up next.** `.player-page > .video-up-next`: from 90% to the end, centred on the video, in the space above it or under the title bar (phone sideways: top centre while the controls hide). It ignores the previous video's time until the new one's comes in.
- **Player tour.** `startPlayerTour()`: steps whose target is on screen only; also from the command palette ("tour"). `cinetab:player-tour` remembers it was seen.
- **Dialogs.** `playerAsk()` has one answer button; the × (or Esc) is "no".

### Style-sheet pitfalls

- `style.css` has several layered "final" blocks for the same audio selectors. The rule that wins is often an *earlier* one with higher specificity (for example `.player-page:has(.container.audio-mode-only) .container.audio-mode-only …`), not the last one. Check computed styles in the browser before adding a rule.
- Keep braces balanced. A stray top-level `}` makes the browser silently drop the *next* rule or `@media` block.
- `together` in `script.js` is a top-level `const`, so `window.together` is undefined. Use `together` directly from the page's scripts.
- Phone-portrait solo video currently shows only the room actions below the video (no title or file details); see the "Mobile portrait player" block in `style.css`.

## UI change workflow

1. Identify which view and state the change belongs to: home, solo player, room player, audio mode, fullscreen, or call UI.
2. Trace the relevant markup in `index.html`, state changes in `script.js`/`room.js`/`home.js`, then all matching selectors in `style.css`.
3. `style.css` is large and contains accumulated overrides. Search every occurrence of the selector and media query before editing; the last matching rule can override an earlier component definition. Prefer updating the existing authoritative block for that state instead of adding another competing rule.
4. Check the change at phone portrait, phone landscape, tablet widths around 768–900px, desktop around 901px, and a wide desktop. Also check room-open, audio, and fullscreen states if the component participates in them.
5. Keep keyboard/accessibility behavior, safe-area insets, reduced-motion rules, and `[hidden]` behavior intact. Avoid changing playback logic for a visual-only request.

## Build and generated files

- Run `npm run serve` for the static site (`npx serve .`). Room networking requires `localhost` or HTTPS.
- `npm run build` / `node tools/build-offline.mjs` generates `cinetab-offline.html` from the source page, styles, and scripts. The build embeds fonts/icons and can fetch those resources. Do not edit the generated file as the primary source.
- If a source change should also appear in the downloadable offline player, rebuild the artifact and review its diff. The offline player omits the home/guide/rooms site experience by design.
- This repo has no dedicated automated test suite. For JS changes, at minimum run `node --check <changed-file.js>`; for CSS/HTML, use an available parser or open the relevant layout in a browser at the responsive sizes above.

