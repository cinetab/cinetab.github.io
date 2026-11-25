const container = document.querySelector(".container"),
mainVideo = container.querySelector("#main-video"),
previewVideo = container.querySelector("#preview-video"),
thumbnailPreview = container.querySelector(".thumbnail-preview"),
previewTime = container.querySelector(".preview-time"),
videoTitle = container.querySelector(".video-title"),
videoTimeline = container.querySelector(".video-timeline"),
progressBar = container.querySelector(".progress-bar"),
volumeBtn = container.querySelector(".volume i"),
volumeSlider = container.querySelector(".volume-slider"),
currentVidTime = container.querySelector(".current-time"),
videoDuration = container.querySelector(".video-duration"),
skipBackward = container.querySelector(".skip-backward"),
skipForward = container.querySelector(".skip-forward"),
playPauseBtn = container.querySelector(".play-pause i"),
speedBtn = container.querySelector(".playback-speed"),
speedOptions = container.querySelector(".speed-options"),
pipBtn = container.querySelector(".pic-in-pic"),
fullScreenBtn = container.querySelector(".fullscreen i"),
centerFeedback = container.querySelector(".center-feedback"),
feedbackIcon = centerFeedback.querySelector("i"),
feedbackText = centerFeedback.querySelector("span"),
fileInput = document.querySelector("#file-input"),
openFileBtn = container.querySelector(".open-file"),
browseBtn = document.querySelector("#browse-btn"),
uploadOverlay = document.querySelector("#upload-overlay"),
uploadBox = document.querySelector(".upload-box"),
errorOverlay = document.querySelector("#error-overlay"),
errorMessage = document.querySelector("#error-message"),
closeErrorBtn = document.querySelector("#close-error-btn"),
subtitleInput = document.querySelector("#subtitle-input"),
subtitlesBtn = container.querySelector(".subtitles"),
helpOverlay = document.querySelector("#help-overlay"),
shareHelpBtn = container.querySelector(".share-help-btn"),
playerQueueBtn = container.querySelector(".player-queue-btn"),
playerStopBtn = container.querySelector(".player-stop-btn"),
closeHelpBtn = document.querySelector("#close-help-btn"),
homePage = document.querySelector(".home"),
playerPage = document.querySelector(".player-page"),
homeDrop = document.querySelector("#home-drop"),
playerHomeBtn = container.querySelector(".player-home"),
playerBackBtn = container.querySelector(".player-back"),
shortcutsBtn = container.querySelector(".shortcuts-btn"),
shortcutsOverlay = document.querySelector("#shortcuts-overlay"),
chooseVideoBtns = document.querySelectorAll(".choose-video"),
dropTargets = [uploadBox, homeDrop].filter(Boolean),
convertOverlay = document.querySelector("#convert-overlay"),
convertTitle = convertOverlay.querySelector(".convert-title"),
convertReason = convertOverlay.querySelector(".convert-reason"),
convertProgress = convertOverlay.querySelector(".convert-progress"),
convertProgressBar = convertOverlay.querySelector(".convert-progress-bar"),
convertStatus = convertOverlay.querySelector(".convert-status"),
convertPlan = convertOverlay.querySelector(".convert-plan"),
convertSkipBtn = convertOverlay.querySelector(".convert-skip-btn"),
convertCancelBtn = convertOverlay.querySelector(".convert-cancel-btn"),
compatBanner = document.querySelector("#compat-banner"),
compatFixBtn = compatBanner.querySelector(".compat-fix-btn"),
compatCloseBtn = compatBanner.querySelector(".compat-close-btn"),
audioTitle = container.querySelector(".audio-title"),
savedSection = document.querySelector("#saved"),
savedList = document.querySelector("#saved .saved-list"),
savedTotal = document.querySelector("#saved .saved-total"),
clearAllBtn = document.querySelector("#saved .clear-all-btn");

const isTouch = matchMedia("(pointer: coarse)").matches;
const mustTapYouTube = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

let idleTimer;
let clickTimeout;
let currentURL = null;
let currentFileKey = null;
let lastSavedAt = 0;
let currentFile = null;
let playbackMode = null; // "native" | "converting" | "converted"
let conversionJob = null;
let lastPlan = null;
let soundChecked = false;
let retriedWithTranscode = false;
let currentSavedKey = null;
let currentSource = null; // name and size of the original file being played

// Watch together: room.js fills these in while this browser is in a room
const together = {
    following: false, // a guest: playback follows the host, so don't jump to where this file was left
    stream: null,     // a guest watching the host's stream: controls ask the host instead (see room.js)
    onFile: null,     // called with each video file opened while in a room
    openPanel: null,  // the Watch together button opens the room instead of the help
    beforeHome: null, // the back button asks what to do with the room first
    onHome: null,     // called whenever the home page is shown
    onPlayer: null,   // called whenever the player is shown
    onTitle: null,    // called when the video's title is renamed
    step: null,       // the previous (-1) / next (1) video of a room's YouTube queue (or a playlist)
    shareYouTube: null, // in a room: plays a YouTube link for everyone (returns why it couldn't)
    solo: null,       // youtube.js: a YouTube video watched on your own ({ active, stop, pause, handOff… })
    roomYouTubeId: null, // room.js: the YouTube video the room is watching, if any
    keepPlaying: () => false, // Background play: whether a pause by the phone, as the page left the screen, is undone
    active: () => false // in a room: going home keeps the video playing for everyone
};

// Hide Controls on Idle (not while a menu or the settings sheet is open, or the timeline is
// being dragged: they wait until it's closed)
const controlsInUse = () => scrubbing || popupMenus.some(menu => menu.classList.contains("show")) || !playerSheet.hidden
    || !!container.querySelector(".player-save-menu:not([hidden])") || !!document.querySelector(".player-tour");
const hideControls = () => {
    if(together.stream ? together.stream.paused : mainVideo.paused) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        if (controlsInUse()) return hideControls();
        hideTooltip();
        container.classList.remove("show-controls");
        container.classList.add("hide-cursor");
    }, 3000);
}
hideControls();

container.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;
    container.classList.add("show-controls");
    container.classList.remove("hide-cursor");
    clearTimeout(idleTimer);
    hideControls();
});

// Touching a button or the timeline counts as using the controls: they stay a while longer
container.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch" || !container.classList.contains("show-controls")) return;
    if (e.target.closest(".wrapper, .top-bar, .player-sheet")) hideControls();
});

// Show Center Visual Feedback Badge
// On a computer it shows at the side, not over the middle of the picture: going back (-10s,
// previous video) on the left, everything else (next video, play, volume…) on the right
const appToastRoot = document.createElement("div");
appToastRoot.className = "app-toasts";
appToastRoot.setAttribute("role", "region");
appToastRoot.setAttribute("aria-label", "Notifications");
appToastRoot.setAttribute("aria-live", "polite");
document.body.append(appToastRoot);
const toastByKey = new Map();
const removeAppToast = (item, immediate = false) => {
    if (!item) return;
    clearTimeout(item.toastTimer);
    if (item.toastKey && toastByKey.get(item.toastKey) === item) toastByKey.delete(item.toastKey);
    if (immediate || !item.isConnected) return item.remove();
    item.classList.add("leaving");
    setTimeout(() => item.remove(), 180);
};
const showAppToast = (message, options = {}) => {
    const text = String(message || "").trim();
    const key = options.key || "";
    if (!text) {
        if (key) removeAppToast(toastByKey.get(key));
        return null;
    }
    if (key) removeAppToast(toastByKey.get(key), true);
    const tone = options.tone === "error" ? "error" : "info";
    const item = document.createElement("div");
    item.className = `app-toast ${tone}`;
    item.setAttribute("role", tone === "error" ? "alert" : "status");
    item.setAttribute("aria-atomic", "true");
    if (key) {
        item.toastKey = key;
        toastByKey.set(key, item);
    }
    const icon = document.createElement("i");
    icon.className = `app-toast-icon fa-solid ${options.iconClass || (tone === "error" ? "fa-circle-exclamation" : "fa-circle-info")}`;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "app-toast-message";
    label.textContent = text;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "app-toast-close";
    close.title = "Dismiss notification";
    close.setAttribute("aria-label", "Dismiss notification");
    close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    close.addEventListener("click", () => removeAppToast(item));
    item.append(icon, label, close);
    appToastRoot.append(item);
    [...appToastRoot.children].slice(0, Math.max(0, appToastRoot.childElementCount - 3)).forEach(old => removeAppToast(old, true));
    item.toastTimer = setTimeout(() => removeAppToast(item), Math.max(1800, Number(options.duration) || 3600));
    return item;
};
showAppToast.dismiss = key => removeAppToast(toastByKey.get(key));
window.CineToast = showAppToast;

let centerFeedbackTimer;
centerFeedback.setAttribute("role", "status");
centerFeedback.setAttribute("aria-live", "polite");
centerFeedback.setAttribute("aria-atomic", "true");
const showFeedback = (iconClass, text = "") => {
    clearTimeout(centerFeedbackTimer);
    feedbackIcon.className = `fa-solid ${iconClass}`;
    feedbackText.textContent = text;
    centerFeedback.classList.toggle("left", /fa-backward|fa-backward-step/.test(iconClass));
    centerFeedback.classList.remove("show");
    // Restart the entrance transition when feedback changes quickly (e.g. volume keys).
    void centerFeedback.offsetWidth;
    centerFeedback.classList.add("show");
    centerFeedbackTimer = setTimeout(() => centerFeedback.classList.remove("show"), 1500);
};

// Format Time
const formatTime = time => {
    if (isNaN(time)) return "00:00";
    let seconds = Math.floor(time % 60),
    minutes = Math.floor(time / 60) % 60,
    hours = Math.floor(time / 3600);

    seconds = seconds < 10 ? `0${seconds}` : seconds;
    minutes = minutes < 10 ? `0${minutes}` : minutes;
    hours = hours < 10 ? `0${hours}` : hours;

    return hours == 0 ? `${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
}

// Resume Position (remembered per file in this browser only)
const storage = {
    get: key => { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch (e) {} },
    remove: key => { try { localStorage.removeItem(key); } catch (e) {} }
};

// Fullscreen, including Safari's prefixed version
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const exitFullscreen = () => (document.exitFullscreen || document.webkitExitFullscreen).call(document);

const savePosition = () => {
    if (!currentFileKey || !mainVideo.duration || together.stream) return;
    storage.set(currentFileKey, mainVideo.currentTime);
};

// Home <-> Player views (one page, so the picked file never has to leave this document).
// The offline build has no home page, only the player.
// (someone new: nothing watched and no rooms when the page opened - opening the first video adds
// it to the history before the player shows, so this is decided once, up front)
let firstVisit = false;
document.addEventListener("DOMContentLoaded", () => {
    firstVisit = !(window.CineHistory && CineHistory.list().length) && !storage.get("cinetab:rooms");
});
const showPlayer = () => {
    if (!homePage) return;
    homePage.hidden = true;
    playerPage.hidden = false;
    document.body.classList.add("watching");
    if (together.onPlayer) together.onPlayer();
    if (location.hash !== "#watch") history.pushState(null, "", "#watch");
    if (homePage && firstVisit && !together.active() && storage.get("cinetab:player-tour") !== "done") {
        setTimeout(startPlayerTour, 450);
    }
};

// ---------- The player tour: shown once, the first time someone opens the player (and again from
// the command palette: "Player tour"). A short welcome, then a spotlight on each part of the player
// that is on screen right now - the video or the audio player, a computer or a phone - with a card
// beside it pointing at it. Back / Next, the arrow keys, Esc to leave; the player's controls stay
// up meanwhile.
const startPlayerTour = (again = false) => {
    if (playerPage.hidden || document.querySelector(".player-tour")) return;
    const audio = () => container.classList.contains("audio-mode-only");
    const touchOnly = matchMedia("(hover: none)").matches;
    // (the first of these on screen: shown, sized, inside the window)
    const visible = selectors => {
        for (const selector of selectors) {
            for (const node of document.querySelectorAll(selector)) {
                if (node.closest("[hidden]") || !node.getClientRects().length) continue;
                const r = node.getBoundingClientRect();
                if (r.width < 4 || r.height < 2 || getComputedStyle(node).visibility === "hidden") continue;
                if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
                return node;
            }
        }
        return null;
    };
    const keyHint = text => touchOnly ? "" : text;
    const all = [
        { title: again ? "A quick tour of the player" : "Welcome to the CineTab player", icon: "fa-film",
            text: "Here's where everything is - it takes half a minute. Use the arrow keys, or Back and Next." },
        { targets: ["#audio-stage .ap-transport", ".player-center-controls"], title: "Play and pause", icon: "fa-play",
            text: () => audio() ? "Play, pause, and skip between tracks."
                : `Play, pause, and jump back or forward.${keyHint(" Space plays and pauses; the arrow keys jump and change the volume.")}` },
        { targets: ["#audio-stage .ap-timeline", ".wrapper > .timeline-container .video-timeline"], title: "Jump anywhere", icon: "fa-arrows-left-right",
            text: () => audio() ? "Drag along the bar, or click a point on it, to jump there."
                : "Drag along the bar, or click a point on it. Click the time on the left to see how much is left." },
        { targets: [".player-search-btn"], title: "Search", icon: "fa-magnifying-glass",
            text: `Find YouTube videos, music and playlists, or paste a link.${keyHint(" Ctrl + K or / opens it from anywhere.")}` },
        { targets: [".audio-queue-btn", ".player-queue-btn", ".room-tab-btn[data-tab='queue']"], title: "Your queue", icon: "fa-list-ol",
            text: "Add videos and whole playlists, reorder them, and see what plays next." },
        { targets: ["#audio-stage .player-save-btn", ".player-save-wrap:not([hidden]) .player-save-btn"], title: "Save it for later", icon: "fa-heart",
            text: `Keep a video or its playlist on your home page.${keyHint(" Press S.")}` },
        { targets: [".audio-mode-toggle"], title: "Video or audio", icon: "fa-headphones",
            text: "Just listening? The audio player shows the artwork with big controls - music switches to it by itself." },
        { targets: [".share-help-btn", ".room-tab-btn[data-tab='together']"], title: "Watch together", icon: "fa-users",
            text: "Start a room and invite friends: everyone watches in sync, with chat and video calls." },
        { targets: [".more-btn"], title: "More options", icon: "fa-ellipsis-vertical",
            text: `Speed, subtitles, ambient light and more.${keyHint(" Press ? for every keyboard shortcut.")}` },
        { title: "You're all set", icon: "fa-circle-check", last: true,
            text: `Enjoy the show! To see this again, open search${keyHint(" (Ctrl + K)")} and type "tour".` }
    ];
    // (only the steps whose part of the player is on screen; the welcome and the end always)
    const steps = all.filter(step => !step.targets || visible(step.targets));
    let index = 0;

    const layer = el("div", "player-tour");
    const spot = el("div", "player-tour-spot");
    const card = el("div", "player-tour-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "player-tour-title");
    card.setAttribute("aria-describedby", "player-tour-text");
    card.innerHTML = `
        <span class="player-tour-arrow" aria-hidden="true"></span>
        <div class="player-tour-head">
            <span class="player-tour-icon" aria-hidden="true"><i class="fa-solid"></i></span>
            <span class="player-tour-count"></span>
            <button type="button" class="player-tour-skip" aria-label="Close the tour (Esc)" title="Close the tour (Esc)"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <h2 id="player-tour-title"></h2>
        <p id="player-tour-text" aria-live="polite"></p>
        <div class="player-tour-foot">
            <div class="player-tour-dots" aria-hidden="true"></div>
            <div class="player-tour-actions">
                <button type="button" class="player-tour-back">Back</button>
                <button type="button" class="player-tour-next">Next</button>
            </div>
        </div>`;
    const dots = card.querySelector(".player-tour-dots");
    steps.forEach(() => dots.append(el("i")));
    layer.append(spot, card);
    document.body.append(layer);
    const back = card.querySelector(".player-tour-back");
    const next = card.querySelector(".player-tour-next");
    const skip = card.querySelector(".player-tour-skip");
    const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

    // (the controls stay up during the tour)
    const wake = () => {
        container.classList.add("show-controls");
        container.classList.remove("hide-cursor");
    };
    const place = () => {
        const step = steps[index];
        const target = step.targets ? visible(step.targets) : null;
        const margin = 12, pad = 8, gap = 16;
        const box = target ? target.getBoundingClientRect() : null;
        if (box) {
            spot.classList.remove("centre");
            spot.style.left = `${Math.round(box.left - pad)}px`;
            spot.style.top = `${Math.round(box.top - pad)}px`;
            spot.style.width = `${Math.round(box.width + pad * 2)}px`;
            spot.style.height = `${Math.round(box.height + pad * 2)}px`;
            const round = parseFloat(getComputedStyle(target).borderRadius) || 0;
            spot.style.borderRadius = round >= Math.min(box.width, box.height) / 2 - 1 ? "999px" : "16px";
        } else {
            spot.classList.add("centre");
            spot.style.left = `${Math.round(innerWidth / 2)}px`;
            spot.style.top = `${Math.round(innerHeight / 2)}px`;
            spot.style.width = spot.style.height = "0px";
        }
        const w = card.offsetWidth, h = card.offsetHeight;
        let left, top, side = "none";
        if (!box) {
            left = (innerWidth - w) / 2;
            top = (innerHeight - h) / 2;
        } else {
            const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
            const free = { below: innerHeight - box.bottom - pad, above: box.top - pad, right: innerWidth - box.right - pad, left: box.left - pad };
            if (free.below >= h + gap + margin) {
                side = "below"; top = box.bottom + pad + gap; left = cx - w / 2;
            } else if (free.above >= h + gap + margin) {
                side = "above"; top = box.top - pad - gap - h; left = cx - w / 2;
            } else if (free.left >= w + gap + margin) {
                side = "left"; left = box.left - pad - gap - w; top = cy - h / 2;
            } else if (free.right >= w + gap + margin) {
                side = "right"; left = box.right + pad + gap; top = cy - h / 2;
            } else {
                left = (innerWidth - w) / 2; top = innerHeight - h - margin;
            }
            left = Math.max(margin, Math.min(left, innerWidth - w - margin));
            top = Math.max(margin, Math.min(top, innerHeight - h - margin));
            // (the arrow points at the middle of the part, wherever the card had to move to)
            if (side === "below" || side === "above") card.style.setProperty("--arrow", `${Math.round(Math.max(24, Math.min(w - 24, cx - left)))}px`);
            else if (side !== "none") card.style.setProperty("--arrow", `${Math.round(Math.max(24, Math.min(h - 24, cy - top)))}px`);
        }
        card.dataset.side = side;
        card.style.left = `${Math.round(left)}px`;
        card.style.top = `${Math.round(top)}px`;
    };
    const render = (dir = 1) => {
        const step = steps[index];
        wake();
        card.querySelector(".player-tour-icon i").className = `fa-solid ${step.icon}`;
        card.querySelector(".player-tour-count").textContent = index === 0 || step.last ? "Player tour" : `${index} of ${steps.length - 2}`;
        card.querySelector("h2").textContent = step.title;
        card.querySelector("p").textContent = typeof step.text === "function" ? step.text() : step.text;
        [...dots.children].forEach((dot, i) => dot.classList.toggle("on", i === index));
        card.classList.toggle("intro", index === 0);
        back.textContent = index === 0 ? "Not now" : "Back";
        next.textContent = index === 0 ? "Show me" : step.last ? "Done" : "Next";
        skip.hidden = index === 0 || !!step.last;
        place();
        if (!calm()) card.animate([{ opacity: 0, translate: `${dir * 10}px 0` }, { opacity: 1, translate: "0 0" }], { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        next.focus({ preventScroll: true });
    };
    const go = dir => {
        if (dir > 0 && index === steps.length - 1) return finish();
        if (dir < 0 && index === 0) return;
        index += dir;
        render(dir);
    };
    // (its keys go to the tour only, not to the player under it)
    const keys = e => {
        if (e.key === "Escape") finish();
        else if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "Enter" || e.key === " ") {
            if (card.contains(document.activeElement) && document.activeElement.tagName === "BUTTON") document.activeElement.click();
            else go(1);
        } else if (e.key === "Tab") {
            // (Tab stays in the card)
            const items = [...card.querySelectorAll("button:not([hidden])")];
            const at = items.indexOf(document.activeElement);
            items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
        } else return;
        e.preventDefault();
        e.stopImmediatePropagation();
    };
    // (the parts move - the controls slide in, the window is resized: the spotlight follows)
    const follow = setInterval(() => { wake(); place(); }, 250);
    const finish = () => {
        storage.set("cinetab:player-tour", "done");
        clearInterval(follow);
        window.removeEventListener("keydown", keys, true);
        window.removeEventListener("resize", place);
        layer.classList.add("leaving");
        setTimeout(() => layer.remove(), calm() ? 0 : 220);
        hideControls();
    };
    next.addEventListener("click", () => go(1));
    back.addEventListener("click", () => index === 0 ? finish() : go(-1));
    skip.addEventListener("click", finish);
    window.addEventListener("keydown", keys, true);
    window.addEventListener("resize", place);
    render();
};

const showHome = () => {
    // A room keeps going while you look at the home page
    if (!together.active() && !together.soloMini) mainVideo.pause();
    if (together.solo && !together.soloMini) together.solo.pause();
    if (fullscreenElement()) exitFullscreen();
    playerPage.hidden = true;
    homePage.hidden = false;
    document.body.classList.remove("watching");
    renderSavedList();
    if (together.onHome) together.onHome();
};

// Browser back button returns to the home page
window.addEventListener("popstate", () => {
    if (!homePage) return;
    if (location.hash === "#watch" && (currentFile || together.active() || (together.solo && together.solo.active))) showPlayer();
    else showHome();
});

// A reload on #watch has no video any more, so start from home
if (location.hash === "#watch") history.replaceState(null, "", location.pathname);

// The back arrow and the logo go home; in a room, after asking what to do with it
// (the home page, from the player: back through its history entry - or straight there when there is
// none, or going back lands somewhere else; room.js uses it too)
const leavePlayer = () => {
    if (location.hash !== "#watch") return showHome();
    history.back();
    // (should going back not land on the home page - an entry from before, another site - it opens
    // anyway)
    setTimeout(() => {
        if (!playerPage.hidden) {
            history.replaceState(null, "", location.pathname + location.search);
            showHome();
        }
    }, 350);
};
const goHome = () => {
    if (together.beforeHome) return together.beforeHome();
    leavePlayer();
};
if (homePage) {
    if (playerHomeBtn) playerHomeBtn.addEventListener("click", goHome);
    if (playerBackBtn) playerBackBtn.addEventListener("click", goHome);
}

// The file picker. Where the browser can (Chrome and Edge on computers) it's the File System
// Access picker: its handle lets the dashboard open the same file again later (history.js).
// Elsewhere it's the usual file input.
const pickerTypes = () => {
    const extensions = fileInput.accept.split(",").filter(type => /^\.[a-z0-9]{1,10}$/i.test(type));
    return [{
        description: "Videos and music",
        accept: {
            "video/*": [".mp4", ".webm", ".m4v", ".mov", ...extensions],
            "audio/*": [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga"]
        }
    }];
};
const pickVideo = async () => {
    if (!window.CineHistory || !CineHistory.handles) return fileInput.click();
    let handle;
    try {
        [handle] = await window.showOpenFilePicker({ id: "cinetab-video", startIn: "videos", types: pickerTypes() });
    } catch (e) {
        if (e && e.name !== "AbortError") fileInput.click();
        return;
    }
    if (handle) loadVideoFile(await handle.getFile(), handle);
};
chooseVideoBtns.forEach(btn => btn.addEventListener("click", pickVideo));

// Video titles can be renamed; the new name is remembered for that file in this browser
const titleKey = (name, size) => `title:${name}:${size}`;
const savedTitle = (name, size) => storage.get(titleKey(name, size)) || name.replace(/\.[^/.]+$/, "");

// `where`: the title being tapped, at the top or below the picture (phones held upright)
const renameTitle = (where = videoTitle) => {
    if (!currentSource || together.stream || where.querySelector("input")) return;
    const { name, size } = currentSource;
    const previous = videoTitle.textContent;
    const input = document.createElement("input");
    input.className = "title-input";
    input.value = previous;
    input.maxLength = 120;
    input.setAttribute("aria-label", "Video title");
    where.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = save => {
        if (done) return;
        done = true;
        const typed = input.value.replace(/\s+/g, " ").trim();
        const original = name.replace(/\.[^/.]+$/, "");
        const title = !save ? previous : typed || original;
        videoTitle.textContent = audioTitle.textContent = title;
        if (where !== videoTitle) where.textContent = title;
        if (!save || title === previous) return;
        if (title === original) storage.remove(titleKey(name, size));
        else storage.set(titleKey(name, size), title);
        if (together.onTitle) together.onTitle();
        showFeedback("fa-pen", "Renamed");
    };
    input.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
};
videoTitle.addEventListener("click", () => renameTitle());

// ---------- Phones held upright: the video's title just below the picture, like the YouTube
// app, and (in a room) the room's name at the top in its place. Not in fullscreen (unless a
// room's panel is open below the picture) or sideways, where the title stays at the top.
const metaTitle = document.querySelector(".player-meta-title");
// One line: a title too long for it rests at its start for a few seconds, glides slowly to its
// end (about 28 px a second), rests there, and slides back - over and over, so it can be read
// whole. A tap starts it again from the beginning. A short one stays put; with less motion asked
// for, it's cut short with "…".
let metaGlide = null;
let metaGlideKey = "";
const fitMetaTitle = () => {
    const line = metaTitle.querySelector(".meta-title-text");
    if (!line) return;
    const over = Math.ceil(line.scrollWidth - metaTitle.clientWidth);
    const moving = metaTitle.clientWidth > 0 && over > 2;
    metaTitle.classList.toggle("scrolling", moving);
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || typeof line.animate !== "function";
    const key = moving && !calm ? `${over}|${line.textContent}` : "";
    if (key === metaGlideKey && (metaGlide || !key)) return;
    metaGlideKey = key;
    if (metaGlide) metaGlide.cancel();
    metaGlide = null;
    if (!key) return;
    const distance = -over - 8;
    const rest = 3500, glide = Math.max(2500, over / 28 * 1000), restEnd = 1800, back = Math.max(900, glide * 0.35);
    const total = rest + glide + restEnd + back;
    metaGlide = line.animate([
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: rest / total, easing: "ease-in-out" },
        { transform: `translateX(${distance}px)`, offset: (rest + glide) / total },
        { transform: `translateX(${distance}px)`, offset: (rest + glide + restEnd) / total, easing: "ease-in-out" },
        { transform: "translateX(0)", offset: 1 }
    ], { duration: total, iterations: Infinity });
};
// (from the beginning: the title's start, resting there before it moves)
const restartMetaTitle = () => {
    if (metaGlide) metaGlide.currentTime = 0;
};
const syncMetaTitle = () => {
    if (metaTitle.querySelector("input")) return;
    const title = videoTitle.querySelector("input") ? metaTitle.textContent : videoTitle.textContent;
    const none = title === "No Video Loaded";
    metaTitle.parentNode.classList.toggle("empty", none);
    const text = none ? "" : title;
    const line = metaTitle.querySelector(".meta-title-text");
    if (!line || line.textContent !== text || metaTitle.childNodes.length !== 1) {
        const fresh = document.createElement("span");
        fresh.className = "meta-title-text";
        fresh.textContent = text;
        metaTitle.replaceChildren(fresh);
        metaTitle.title = text;
    }
    fitMetaTitle();
};
new MutationObserver(syncMetaTitle).observe(videoTitle, { childList: true, characterData: true, subtree: true });
// (renamed right there: back to one moving line)
new MutationObserver(() => !metaTitle.querySelector("input, .meta-title-text") && syncMetaTitle()).observe(metaTitle, { childList: true });
if ("ResizeObserver" in window) new ResizeObserver(fitMetaTitle).observe(metaTitle);
syncMetaTitle();
// A tap: the title from its beginning again. Held down a moment: rename it.
{
    let holdTimer = null;
    let held = false;
    metaTitle.addEventListener("pointerdown", e => {
        if (e.button > 0 || metaTitle.querySelector("input")) return;
        held = false;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            held = true;
            renameTitle(metaTitle);
        }, 550);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(type => metaTitle.addEventListener(type, () => clearTimeout(holdTimer)));
    metaTitle.addEventListener("click", () => {
        if (held || metaTitle.querySelector("input")) return;
        restartMetaTitle();
    });
    metaTitle.addEventListener("contextmenu", e => e.preventDefault());
}
// (a phone held upright, or a window made as narrow as one: the phone's layout)
const uprightPhone = matchMedia("(pointer: coarse) and (orientation: portrait), (max-width: 600px) and (orientation: portrait)");
const placeTitle = () => playerPage.classList.toggle("title-below", uprightPhone.matches &&
    (!(document.fullscreenElement || document.webkitFullscreenElement) || playerPage.classList.contains("room-open")));
placeTitle();
uprightPhone.addEventListener?.("change", placeTitle);
document.addEventListener("fullscreenchange", placeTitle);
document.addEventListener("webkitfullscreenchange", placeTitle);
// The room's panel opening or closing (room.js)
new MutationObserver(placeTitle).observe(playerPage, { attributes: true, attributeFilter: ["class"] });

// Below the title, while the room's panel is closed (or outside a room): about the video. A
// YouTube video's channel, views, upload date and description (youtube.js asks for them), or
// your own file's length, size and format.
const detailsBox = document.querySelector(".player-details");
let detailsKey = "";
let detailsDescExpanded = false;

// Copies the YouTube link for the current video and briefly shows "Copied" on the button
const copyYouTubeLink = (id, btn) => {
    const url = `https://www.youtube.com/watch?v=${id}`;
    navigator.clipboard.writeText(url).then(() => {
        btn.classList.add("copied");
        const icon = btn.querySelector("i");
        const label = btn.querySelector("span");
        const prevIcon = icon.className;
        const prevLabel = label.textContent;
        icon.className = "fa-solid fa-check";
        label.textContent = "Copied!";
        setTimeout(() => {
            btn.classList.remove("copied");
            icon.className = prevIcon;
            label.textContent = prevLabel;
        }, 1800);
    }).catch(() => {});
};

// Builds and renders the "Watch together" CTA below the video details when not in a room
const detailsRoomCta = () => {
    const div = el("div", "details-room-cta");
    const p = el("p", null, "Watch this together with friends");
    const btns = el("div", "details-room-btns");
    const create = el("button", "details-room-btn primary room-create-open");
    create.type = "button";
    create.title = "Start a private room and invite friends";
    create.append(el("i", "fa-solid fa-plus"), el("span", null, "Create a room"));
    const join = el("button", "details-room-btn secondary room-join-open");
    join.type = "button";
    join.title = "Join a friend's room with its code and password";
    join.append(el("i", "fa-solid fa-right-to-bracket"), el("span", null, "Join a room"));
    btns.append(create, join);
    div.append(p, btns);
    return div;
};

const youTubeDetails = (id, info) => {
    const channel = el("div", "details-channel");
    const name = (info && info.channel) || "YouTube";
    const who = el("b", null, name);
    if (info && info.verified) {
        const check = el("i", "fa-solid fa-circle-check");
        check.title = "Verified channel";
        who.append(" ", check);
    }
    const open = el("a", "details-open");
    open.href = `https://www.youtube.com/watch?v=${id}`;
    open.target = "_blank";
    open.rel = "noopener";
    open.title = "Open this video on YouTube (a new tab)";
    open.append(el("i", "fa-brands fa-youtube"), el("span", null, "YouTube"));
    channel.append(el("span", "details-avatar", name.charAt(0).toUpperCase()), who, open);
    const parts = [channel];

    // Actions row: copy link button
    const actions = el("div", "details-actions");
    const copyBtn = el("button", "details-copy-btn");
    copyBtn.type = "button";
    copyBtn.title = "Copy the YouTube link for this video";
    copyBtn.append(el("i", "fa-regular fa-copy"), el("span", null, "Copy link"));
    copyBtn.addEventListener("click", () => copyYouTubeLink(id, copyBtn));
    actions.append(copyBtn);

    if (info) {
        const facts = [];
        if (info.views) facts.push(CineYouTube.views(info.views));
        if (info.uploaded) facts.push(new Date(info.uploaded).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
        if (info.ago) facts.push(info.ago);
        if (facts.length) parts.push(el("p", "details-stats", facts.join(" · ")));
        if (info.description) {
            const descEl = el("p", "details-text", info.description);
            const toggleBtn = el("button", "details-desc-toggle");
            toggleBtn.type = "button";
            toggleBtn.append(el("i"), el("span"));
            // The search only gave the first line or two: the whole description comes when it's
            // opened (once per video), scrolling inside the card if it's long
            let whole = null;
            const showDesc = () => {
                descEl.classList.toggle("expanded", detailsDescExpanded);
                toggleBtn.querySelector("i").className = detailsDescExpanded ? "fa-solid fa-chevron-up" : "fa-solid fa-chevron-down";
                toggleBtn.querySelector("span").textContent = detailsDescExpanded ? "Show less" : "More";
                toggleBtn.setAttribute("aria-expanded", String(detailsDescExpanded));
                if (!detailsDescExpanded) descEl.scrollTop = 0;
                if (!detailsDescExpanded || whole) return;
                whole = CineYouTube.fullDescription(id).then(full => {
                    if (full === null) whole = null; // no server answered: tried again next time
                    else if (full && descEl.isConnected) descEl.textContent = full;
                });
            };
            toggleBtn.addEventListener("click", () => {
                detailsDescExpanded = !detailsDescExpanded;
                showDesc();
            });
            showDesc();
            actions.append(toggleBtn);
            parts.push(descEl);
        }
    }
    parts.push(actions);

    // "Watch together" CTA when not currently in a room
    if (!together.active()) {
        const hr = el("hr", "details-room-divider");
        parts.push(hr, detailsRoomCta());
    }

    detailsBox.replaceChildren(...parts);
};

const fileDetails = source => {
    const head = el("div", "details-channel");
    head.append(el("span", "details-avatar", ""), el("b", null, source.name));
    head.firstChild.append(el("i", `fa-solid ${container.classList.contains("audio-mode") ? "fa-music" : "fa-film"}`));
    const format = (source.name.match(/\.([^.]+)$/) || [, ""])[1].toUpperCase();
    const facts = [Number.isFinite(mainVideo.duration) && mainVideo.duration > 0 ? formatTime(mainVideo.duration) : "", formatBytes(source.size), format].filter(Boolean);
    const parts = [head, el("p", "details-stats", facts.join(" · "))];
    if (!together.active()) {
        const hr = el("hr", "details-room-divider");
        parts.push(hr, detailsRoomCta());
    }
    detailsBox.replaceChildren(...parts);
};

const renderDetails = () => {
    const youtube = container.classList.contains("youtube");
    const id = youtube && typeof youTubeIdShown === "function" ? youTubeIdShown() : null;
    const source = !youtube && currentFile && currentSource ? currentSource : null;
    const wanted = playerPage.classList.contains("title-below") && !playerPage.classList.contains("room-open");
    const inRoom = together.active();
    const key = !wanted ? "" : id ? `yt:${id}:${inRoom}` : source ? `file:${source.name}:${source.size}:${Math.round(mainVideo.duration || 0)}:${inRoom}` : "";
    detailsBox.hidden = !key;
    if (key === detailsKey) return;
    detailsKey = key;
    if (!key) return detailsBox.replaceChildren();
    if (source) return fileDetails(source);
    youTubeDetails(id, null);
    if (window.CineYouTube && CineYouTube.details) CineYouTube.details(id).then(info => info && detailsKey === key && youTubeDetails(id, info));
};
setInterval(renderDetails, 1000);
new MutationObserver(renderDetails).observe(playerPage, { attributes: true, attributeFilter: ["class"] });

// Load Video File
const setSource = (source, mode, autoplay = true) => {
    const oldURL = currentURL;
    currentURL = URL.createObjectURL(source);
    playbackMode = mode;
    soundChecked = false;
    container.classList.remove("audio-mode");
    mainVideo.src = currentURL;
    previewVideo.src = currentURL;
    if (oldURL) URL.revokeObjectURL(oldURL);
    if (autoplay) mainVideo.play().catch(() => {});
};

// Resets the player for a new file; `name` and `size` are the original file's
const prepareFor = (name, size) => {
    // A YouTube video watched on your own gives way (youtube.js)
    if (together.solo) together.solo.stop();
    // Remembered for the dashboard on the home page (history.js)
    if (window.CineHistory) CineHistory.file({ name, size, title: savedTitle(name, size) });
    showPlayer();
    // (a phone opens it in the normal view; fullscreen is the player's button or a double-tap)
    mainVideo.pause();
    cancelConversion();
    removeSubtitles();
    compatBanner.classList.add("hidden");
    retriedWithTranscode = false;
    currentSavedKey = null;
    currentSource = { name, size };
    currentFileKey = `resume:${name}:${size}`;
    videoTitle.innerText = audioTitle.innerText = savedTitle(name, size);
    videoTitle.title = `${name}\nClick to rename`;
    uploadOverlay.classList.add("hidden");
    errorOverlay.classList.add("hidden");
    updatePlayerStop();
};

// `handle`: where the file came from, when the browser says (see pickVideo); kept so the
// dashboard can open it again
const loadVideoFile = async (file, handle = null) => {
    if(!file) return;
    if (together.onFile) together.onFile(file);
    prepareFor(file.name, file.size);
    currentFile = file;
    if (handle && window.CineHistory) CineHistory.saveHandle(CineHistory.fileKey(file.name, file.size), handle);

    // Converted before? Play the saved copy straight away
    const saved = await Converter.getCached(file);
    if (file !== currentFile) return;
    if (saved) return playConverted(saved);

    // Sound formats like DTS play silently instead of failing, so catch them up front
    const silentAudio = await Converter.findSilentAudio(file);
    if (file !== currentFile) return;
    if (silentAudio) return startConversion("audio", silentAudio);

    setSource(file, "native");
    playFeedback();
};

browseBtn.addEventListener("click", pickVideo);
openFileBtn.addEventListener("click", pickVideo);

const emptyYoutubeBtn = document.querySelector("#empty-youtube-btn");
emptyYoutubeBtn?.addEventListener("click", e => {
    e.stopPropagation();
    container.querySelector(".player-search-btn")?.click();
});

fileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    loadVideoFile(file);
    fileInput.value = "";
});

// Subtitles (.srt / .vtt)
const isSubtitleFile = file => /\.(srt|vtt)$/i.test(file.name);

// Subtitles on or off is remembered, for every kind of video: your own, a room's and YouTube's.
// Until it's been chosen, subtitles you add show and YouTube's own captions don't.
const SUBTITLES_KEY = "cinetab:subtitles";
const subtitlePref = {
    set: on => storage.set(SUBTITLES_KEY, on ? "on" : "off"),
    // Whether subtitles that have just become available show; `youtube`: YouTube's own captions
    wants: (youtube = false) => {
        const saved = storage.get(SUBTITLES_KEY);
        return saved ? saved === "on" : !youtube;
    }
};

// YouTube's own captions on or off in one of its players (youtube.js, room.js). YouTube turns them
// on by itself (the video's or the viewer's own preference) as each video loads, so this runs
// then (onApiChange) and as each video starts playing.
// Off is "no caption track": unloading YouTube's captions module leaves them on screen. On is a
// track chosen outright (the one YouTube has, the viewer's language, or the first), since loading
// the module alone doesn't bring them back once they've been turned off.
const youTubeCaptions = (player, on, retry = true) => {
    try {
        if (!on) return player.setOption("captions", "track", {});
        player.loadModule("captions");
        const tracks = player.getOption("captions", "tracklist") || [];
        // The list comes a moment after the module: try once more then
        if (!tracks.length) {
            if (retry) setTimeout(() => youTubeCaptions(player, subtitlePref.wants(true), false), 1200);
            return;
        }
        const current = player.getOption("captions", "track") || {};
        const language = (navigator.language || "en").slice(0, 2).toLowerCase();
        const pick = tracks.find(item => item.languageCode && item.languageCode === current.languageCode) ||
            tracks.find(item => String(item.languageCode || "").toLowerCase().startsWith(language)) || tracks[0];
        if (pick && pick.languageCode) player.setOption("captions", "track", { languageCode: pick.languageCode });
    } catch (e) {}
};

const srtToVtt = text => "WEBVTT\n\n" + text
    .replace(/\r+/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");

const updateSubtitlesTitle = () => {
    const track = mainVideo.textTracks[0];
    subtitlesBtn.title = !track ? "Load subtitles from an .srt / .vtt file (C)"
        : `${track.mode === "showing" ? "Hide" : "Show"} subtitles (C) · Shift + click to load a different file`;
};

const removeSubtitles = () => {
    mainVideo.querySelectorAll("track").forEach(track => {
        URL.revokeObjectURL(track.src);
        track.remove();
    });
    subtitlesBtn.classList.remove("active");
    updateSubtitlesTitle();
};

// `chosen`: a subtitle file the person picked just now (it shows, and subtitles are on from then
// on); otherwise (a converted file's own, a room host's) as the remembered setting says
const applySubtitles = (text, label, chosen = false) => {
    text = text.replace(/^\uFEFF/, "");
    if (!text.startsWith("WEBVTT")) text = srtToVtt(text);
    // Lift cues a few lines up so they don't sit under the control bar
    text = text.replace(/^(.*-->.*)$/gm, line => /line:/.test(line) ? line : `${line} line:-4`);

    if (chosen) subtitlePref.set(true);
    const show = chosen || subtitlePref.wants();
    removeSubtitles();
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = label;
    track.src = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
    track.default = show;
    mainVideo.appendChild(track);
    track.track.mode = show ? "showing" : "hidden";
    subtitlesBtn.classList.toggle("active", show);
    updateSubtitlesTitle();
    showFeedback("fa-closed-captioning", show ? "Subtitles On" : isTouch ? "Subtitles off" : "Subtitles off (C shows them)");
};

const loadSubtitleFile = async (file) => {
    if (!file) return;
    if (together.stream) return together.stream.loadSubtitles(await file.text());
    if (!currentFile) {
        showFeedback("fa-closed-captioning", "Open a video first");
        return;
    }
    applySubtitles(await file.text(), file.name, true);
};

const toggleSubtitles = () => {
    if (together.stream) return together.stream.toggleSubtitles();
    const track = mainVideo.textTracks[0];
    if (!track) return subtitleInput.click();
    const show = track.mode !== "showing";
    track.mode = show ? "showing" : "hidden";
    subtitlePref.set(show);
    subtitlesBtn.classList.toggle("active", show);
    updateSubtitlesTitle();
    showFeedback("fa-closed-captioning", show ? "Subtitles On" : "Subtitles Off");
};

subtitlesBtn.addEventListener("click", e => {
    // Shift + click always opens the picker to replace the current subtitle
    if (e.shiftKey) return subtitleInput.click();
    toggleSubtitles();
});

subtitleInput.addEventListener("change", e => {
    loadSubtitleFile(e.target.files[0]);
    subtitleInput.value = "";
});

// Drag & Drop Video / Subtitles anywhere on the page
// `handles`: the dropped files' handles, where the browser gives them (kept for the dashboard)
const handleDroppedFiles = (files, handles = []) => {
    const list = [...files];
    const video = list.find(file => !isSubtitleFile(file));
    const subtitle = list.find(isSubtitleFile);
    if (video) {
        loadVideoFile(video);
        if (handles.length && window.CineHistory) {
            Promise.all(handles.map(handle => handle.catch(() => null))).then(found => {
                const handle = found.find(item => item && item.kind === "file" && item.name === video.name);
                if (handle) CineHistory.saveHandle(CineHistory.fileKey(video.name, video.size), handle);
            });
        }
    }
    if (subtitle) loadSubtitleFile(subtitle);
};

const setDragOver = isOver => dropTargets.forEach(target => target.classList.toggle("drag-over", isOver));

document.addEventListener("dragover", e => {
    e.preventDefault();
    setDragOver(true);
});

document.addEventListener("dragleave", e => {
    if (!e.relatedTarget) setDragOver(false);
});

document.addEventListener("drop", e => {
    e.preventDefault();
    setDragOver(false);
    // Handles have to be asked for during the drop itself
    const handles = window.CineHistory && CineHistory.handles ? [...e.dataTransfer.items]
        .filter(item => item.kind === "file" && typeof item.getAsFileSystemHandle === "function")
        .map(item => item.getAsFileSystemHandle()) : [];
    handleDroppedFiles(e.dataTransfer.files, handles);
});

// Format Support: files the browser can't play are converted on this computer (see converter.js)
const showError = message => {
    uploadOverlay.classList.add("hidden");
    convertOverlay.classList.add("hidden");
    errorMessage.innerText = message;
    errorMessage.title = message;
    errorOverlay.classList.remove("hidden");
};

// ---------- The notices sit above everything in the player (the call, its dock, the panel):
// on the page itself, not inside the video's box, placed at the top of wherever the video is
// (style.css reads these numbers). Also in fullscreen, which is the whole player page.
const placeNotices = () => {
    if (playerPage.hidden) return;
    const box = container.getBoundingClientRect();
    if (!box.width) return;
    const phone = box.width <= 600;
    const style = playerPage.style;
    style.setProperty("--notice-x", `${Math.round(box.left + box.width / 2)}px`);
    style.setProperty("--notice-top", `${Math.round(Math.max(8, box.top) + (phone ? 58 : 72))}px`);
    style.setProperty("--notice-w", `${Math.round(Math.min(520, Math.max(260, box.width - (phone ? 16 : 24))))}px`);
};
window.placeNotices = placeNotices;
[errorOverlay, convertOverlay, compatBanner].forEach(notice => playerPage.append(notice));
if (window.ResizeObserver) new ResizeObserver(placeNotices).observe(container);
window.addEventListener("resize", placeNotices);
new MutationObserver(() => requestAnimationFrame(placeNotices)).observe(playerPage, { attributes: true, attributeFilter: ["class", "hidden"] });

// ---------- Asking: a small card at the top, like a notification - a few words and the choices
// (not the browser's own box, which stops everything). In the player, at the top of the video;
// on the home page, at the top of the page. Resolves true for the main choice; Esc, × or the
// other choice resolve false. Used by room.js and home.js too.
const playerAsk = ({ icon = "fa-circle-question", title, text = "", yes = "OK", no = "Cancel", danger = false }) => new Promise(resolve => {
    document.querySelectorAll(".player-ask").forEach(old => old.querySelector(".box-close").click());
    const layer = el("div", "notice-layer player-ask");
    layer.dataset.dialog = "";
    const box = el("div", `upload-box notice${danger ? " notice-danger" : ""}`);
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-label", title);
    const close = el("button", "box-close");
    close.type = "button";
    close.title = `${no} (Esc)`;
    close.setAttribute("aria-label", no);
    close.append(el("i", "fa-solid fa-xmark"));
    const scroll = el("div", "box-scroll");
    const iconBox = el("span", "notice-icon");
    iconBox.append(el("i", `fa-solid ${icon}`));
    const words = el("div", "notice-text");
    words.append(el("b", null, title));
    if (text) words.append(el("small", null, text));
    const actions = el("div", "notice-actions");
    // (one button: the answer; the × at the top - or Esc - is "no")
    const yesBtn = el("button", danger ? "notice-danger-btn" : "", yes);
    yesBtn.type = "button";
    actions.append(yesBtn);
    scroll.append(iconBox, words, actions);
    box.append(close, scroll);
    layer.append(box);
    let done = false;
    const finish = answer => {
        if (done) return;
        done = true;
        layer.classList.add("hidden");
        setTimeout(() => layer.remove(), 300);
        resolve(answer);
    };
    close.addEventListener("click", () => finish(false));
    yesBtn.addEventListener("click", () => finish(true));
    const onKey = e => {
        if (e.key !== "Escape" || !layer.isConnected || done) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(false);
    };
    document.addEventListener("keydown", onKey, true);
    layer.addEventListener("transitionend", () => done && document.removeEventListener("keydown", onKey, true));
    (playerPage.hidden ? document.body : playerPage).append(layer);
    placeNotices();
    yesBtn.focus({ preventScroll: true });
});
window.playerAsk = playerAsk;

const setConvertProgress = (ratio, text) => {
    convertProgress.classList.toggle("indeterminate", ratio === null);
    convertProgressBar.style.width = ratio === null ? "" : `${Math.round(ratio * 100)}%`;
    convertStatus.innerText = text;
};

const timeLeft = (ratio, startedAt) => {
    const elapsed = (Date.now() - startedAt) / 1000;
    if (ratio < 0.02 || elapsed < 3) return "";
    const minutes = Math.round(elapsed * (1 - ratio) / ratio / 60);
    if (minutes < 1) return " · less than a minute left";
    if (minutes < 60) return ` · about ${minutes} min left`;
    return ` · about ${Math.floor(minutes / 60)} h ${minutes % 60} min left`;
};

const describePlan = plan => {
    const parts = [];
    if (plan.video) parts.push(`Video: ${Converter.codecName(plan.video.codec)} ${plan.video.copy ? "kept as is" : "→ H.264 (re-encoding video is the slow part)"}`);
    if (plan.audio) parts.push(`Sound: ${Converter.codecName(plan.audio.codec)} ${plan.audio.copy ? "kept as is" : "→ AAC"}`);
    if (plan.subtitles) parts.push("Subtitles: included");
    return parts.join(" · ");
};

const cancelConversion = () => {
    if (conversionJob) conversionJob.cancel();
    conversionJob = null;
    convertOverlay.classList.add("hidden");
};

const playConverted = ({ key, file, subtitles, plan, cached }) => {
    lastPlan = plan;
    currentSavedKey = key || null;
    setSource(file, "converted", !playerPage.hidden);
    if (subtitles) applySubtitles(subtitles, "Subtitles");
    showFeedback(cached ? "fa-bolt" : "fa-circle-check", cached ? "Saved copy" : "Ready");
    renderSavedList();
};

const startConversion = (reason, detail = null, forceVideoTranscode = false) => {
    if (!Converter.isSupported) {
        return showError("This browser can't convert it · try Chrome or Edge");
    }
    cancelConversion();
    const file = currentFile;
    playbackMode = "converting";
    compatBanner.classList.add("hidden");
    container.classList.remove("audio-mode");
    [mainVideo, previewVideo].forEach(video => {
        video.pause();
        video.removeAttribute("src");
        video.load();
    });

    const ext = (file.name.match(/\.([^.]+)$/) || [, ""])[1].toUpperCase();
    convertTitle.innerText = { format: `Converting ${ext || "it"} to MP4`, audio: "Fixing the sound", video: "Converting the video" }[reason];
    convertReason.innerText = {
        format: `Your browser can't play ${ext || "this kind of"} files directly, so CineTab is converting it to MP4.`,
        audio: `This file's sound${detail ? ` (${detail})` : ""} isn't supported by your browser, so it would play silently. CineTab is converting just the sound and keeping the video as is.`,
        video: "Your browser can't show this file's video, so CineTab is converting it."
    }[reason];
    convertPlan.innerText = "";
    // (the why, and the plan below: on pointing at it, not in the way)
    const convertBox = convertOverlay.querySelector(".upload-box");
    convertBox.title = `${convertReason.innerText}
Converted on your computer, never uploaded - saved in this browser so it opens instantly next time.`;
    convertSkipBtn.hidden = reason !== "audio";
    setConvertProgress(null, "Starting…");
    uploadOverlay.classList.add("hidden");
    errorOverlay.classList.add("hidden");
    convertOverlay.classList.remove("hidden");

    let convertStartedAt = 0;
    const job = Converter.convert(file, {
        forceVideoTranscode,
        onPlan: plan => {
            convertPlan.innerText = describePlan(plan);
            convertBox.title = `${convertReason.innerText}
${convertPlan.innerText}
Converted on your computer, never uploaded - saved in this browser so it opens instantly next time.`;
        },
        onStatus: ({ stage, ratio }) => {
            if (stage === "download") {
                setConvertProgress(ratio, `Getting the converter (first time only) · ${Math.round(ratio * 100)}%`);
            } else if (stage === "probe") {
                setConvertProgress(null, "Reading the file…");
            } else if (stage === "convert") {
                if (!convertStartedAt) convertStartedAt = Date.now();
                setConvertProgress(ratio, `${Math.round(ratio * 100)}%${timeLeft(ratio, convertStartedAt)}`);
            }
        }
    });
    conversionJob = job;
    job.promise.then(result => {
        if (conversionJob !== job) return;
        conversionJob = null;
        convertOverlay.classList.add("hidden");
        playConverted(result);
    }).catch(err => {
        if (conversionJob !== job) return;
        conversionJob = null;
        playbackMode = null;
        showError(err.message);
    });
};

const looksLikeVideo = file => file.type.startsWith("video/") ||
    /\.(mp4|m4v|mkv|mov|webm|avi|wmv|flv|ts|m2ts|mts|mpe?g|3gp|ogv)$/i.test(file.name);

// Chrome/Edge count decoded audio bytes, Firefox reports whether it found audio
const noSoundDecoded = () => {
    if ("mozHasAudio" in mainVideo) return !mainVideo.mozHasAudio;
    if ("webkitAudioDecodedByteCount" in mainVideo) return mainVideo.webkitAudioDecodedByteCount === 0;
    return false;
};

mainVideo.addEventListener("error", () => {
    if (!mainVideo.getAttribute("src")) return;
    if (playbackMode === "native") return startConversion("format");
    // A copied video stream still didn't play: convert again, re-encoding the video this time
    if (playbackMode === "converted" && !retriedWithTranscode && lastPlan && lastPlan.video && lastPlan.video.copy) {
        retriedWithTranscode = true;
        return startConversion("video", null, true);
    }
    playbackMode = null;
    showError("Not even after converting it");
});

convertCancelBtn.addEventListener("click", () => {
    cancelConversion();
    playbackMode = null;
    uploadOverlay.classList.remove("hidden");
});

// For sound-only fixes, let people watch right away without sound
convertSkipBtn.addEventListener("click", () => {
    cancelConversion();
    setSource(currentFile, "native");
    soundChecked = true;
});

compatFixBtn.addEventListener("click", () => startConversion("audio"));
compatCloseBtn.addEventListener("click", () => compatBanner.classList.add("hidden"));

// Converted Videos (listed on the home page)
const formatBytes = bytes => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

const summarizePlan = plan => {
    if (!plan) return "Converted";
    const parts = [];
    if (plan.video && !plan.video.copy) parts.push(`${Converter.codecName(plan.video.codec)} video → H.264`);
    if (plan.audio && !plan.audio.copy) parts.push(`${Converter.codecName(plan.audio.codec)} sound → AAC`);
    return parts.length ? parts.join(", ") : "Repackaged as MP4";
};

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
};

const renderSavedItem = item => {
    const title = item.name.replace(/\.[^/.]+$/, "");
    const size = formatBytes(item.bytes);
    const li = el("li", "saved-item");

    const icon = el("span", "saved-icon");
    icon.appendChild(el("i", `fa-solid ${item.plan && item.plan.video ? "fa-film" : "fa-music"}`));

    const info = el("div", "saved-info");
    const name = el("p", "saved-name", title);
    name.title = item.name;
    const meta = el("p", "saved-meta");
    const date = new Date(item.created).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    meta.append(el("span", "saved-size", size), ` · ${summarizePlan(item.plan)} · converted ${date}`);
    info.append(name, meta);

    const play = el("button", "btn btn-primary btn-sm saved-play");
    play.dataset.action = "play";
    play.dataset.key = item.key;
    play.title = `Play “${title}” (opens instantly, no conversion needed)`;
    play.append(el("i", "fa-solid fa-play"), el("span", null, "Play"));

    const remove = el("button", "icon-btn saved-remove");
    remove.dataset.action = "remove";
    remove.dataset.key = item.key;
    remove.title = `Delete the converted copy of “${title}” (${size}). Your original file is not touched.`;
    remove.setAttribute("aria-label", remove.title);
    remove.appendChild(el("i", "fa-solid fa-trash-can"));

    li.append(icon, info, play, remove);
    return li;
};

const renderSavedList = async () => {
    if (!savedSection) return;
    const { items, bytes } = await Converter.listSaved();
    savedSection.hidden = items.length === 0;
    savedTotal.textContent = formatBytes(bytes);
    clearAllBtn.title = `Delete all ${items.length} converted ${items.length === 1 ? "copy" : "copies"} (${formatBytes(bytes)}) from this browser. Your original files are not touched.`;
    savedList.replaceChildren(...items.map(renderSavedItem));
};

// Stops and forgets the open video (the file itself is untouched). Used when a converted copy is
// deleted, and in a room when the video is removed or someone else's video takes its place.
const releaseMedia = () => {
    savePosition();
    cancelConversion();
    removeSubtitles();
    [mainVideo, previewVideo].forEach(video => {
        video.removeAttribute("src");
        video.load();
    });
    if (currentURL) URL.revokeObjectURL(currentURL);
    currentURL = null;
    currentFile = null;
    currentSource = null;
    currentFileKey = null;
    currentSavedKey = null;
    playbackMode = null;
    compatBanner.classList.add("hidden");
    container.classList.remove("audio-mode");
    container.classList.remove("audio-mode-only");
    window.CineAudioMode?.disable();
    videoTitle.innerText = audioTitle.innerText = "No Video Loaded";
    progressBar.style.width = "0%";
    videoDuration.innerText = formatTime(0);
    paintTime(0, 0);
    showPlaying(false);
    updatePlayerStop();
};

const unloadPlayer = () => {
    if (together.solo && together.solo.active) {
        together.solo.stop();
    }
    releaseMedia();
    uploadOverlay.classList.remove("hidden");
    updatePlayerStop();
};
window.unloadPlayer = unloadPlayer;

const updatePlayerStop = () => {
    const isSoloActive = !!(together.solo && (typeof together.solo.active === "function" ? together.solo.active() : together.solo.active));
    // (something is on: the "pick a video" notice is away, and there's a file or YouTube)
    const hasMedia = uploadOverlay.classList.contains("hidden") && (!!currentFile || !!currentSource || isSoloActive);
    if (together.updateStop) together.updateStop(hasMedia);
    else {
        if (playerStopBtn) playerStopBtn.hidden = !hasMedia;
        document.querySelectorAll(".more-stop-video").forEach(row => row.hidden = !hasMedia);
    }
};
window.updatePlayerStop = updatePlayerStop;

const onStopClick = () => {
    if (together.stopVideo) together.stopVideo();
    else unloadPlayer();
};
if (playerStopBtn) playerStopBtn.addEventListener("click", onStopClick);

const playSaved = async key => {
    const saved = await Converter.openSaved(key);
    if (!saved) return renderSavedList();
    if (together.onFile) together.onFile({ name: saved.name, size: saved.sourceSize });
    prepareFor(saved.name, saved.sourceSize);
    currentFile = saved.file;
    // Already a converted copy, so there is nothing left to retry if it fails
    retriedWithTranscode = true;
    playConverted(saved);
};

savedList?.addEventListener("click", async e => {
    const button = e.target.closest("button[data-action]");
    if (!button) return;
    const { action, key } = button.dataset;
    if (action === "play") return playSaved(key);
    if (key === currentSavedKey) unloadPlayer();
    await Converter.removeSaved(key);
    renderSavedList();
});

clearAllBtn?.addEventListener("click", async () => {
    if (!await playerAsk({ icon: "fa-trash-can", title: "Delete all converted videos?", text: "Your own files aren't touched", yes: "Delete", danger: true })) return;
    if (currentSavedKey) unloadPlayer();
    await Converter.clearSaved();
    renderSavedList();
});

renderSavedList();

// Watch Together Help
shareHelpBtn.addEventListener("click", () => {
    if (together.openPanel) return together.openPanel();
    // Not in a room: the side panel's Watch together tab (create or join a room). The offline
    // player has no rooms: just how to share the tab on a video call.
    if (together.toggleTogether) return together.toggleTogether();
    mainVideo.pause();
    helpOverlay.classList.remove("hidden");
});
if (playerQueueBtn) playerQueueBtn.addEventListener("click", () => together.toggleQueue && together.toggleQueue());
closeHelpBtn.addEventListener("click", () => helpOverlay.classList.add("hidden"));

closeErrorBtn.addEventListener("click", () => {
    errorOverlay.classList.add("hidden");
    uploadOverlay.classList.remove("hidden");
});

// Every dialog has a × in its corner, and Esc closes the topmost one
const closeButton = dialog => dialog.querySelector(".box-close");

document.querySelectorAll("[data-dialog]:not(#room-overlay)").forEach(dialog => {
    dialog.addEventListener("click", e => {
        if (e.target !== dialog) return;
        const close = closeButton(dialog);
        if (close && !close.hidden) close.click();
    });
});

closeButton(helpOverlay).addEventListener("click", () => helpOverlay.classList.add("hidden"));
closeButton(shortcutsOverlay).addEventListener("click", () => shortcutsOverlay.classList.add("hidden"));
closeButton(errorOverlay).addEventListener("click", () => closeErrorBtn.click());
closeButton(convertOverlay).addEventListener("click", async () => {
    if (await playerAsk({ icon: "fa-wand-magic-sparkles", title: "Stop converting?", yes: "Stop", no: "Keep going", danger: true })) convertCancelBtn.click();
});
// The empty player's "Select a movie" box: back to the home page (in a room, just out of the way)
closeButton(uploadOverlay).hidden = !homePage;
closeButton(uploadOverlay).addEventListener("click", () => {
    if (homePage && !together.active()) history.back();
    else uploadOverlay.classList.add("hidden");
});

// Keyboard shortcuts list (the More menu, or ?)
const toggleShortcuts = () => shortcutsOverlay.classList.toggle("hidden");
shortcutsBtn.addEventListener("click", () => {
    closePopups();
    toggleShortcuts();
});

document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || playerPage.hidden) return;
    if (closePopups()) return;
    const open = [...document.querySelectorAll("[data-dialog]")]
        .filter(dialog => !dialog.hidden && !dialog.classList.contains("hidden") && dialog.getClientRects().length)
        .pop();
    const close = open && closeButton(open);
    if (close && !close.hidden) {
        e.preventDefault();
        close.click();
    }
});

mainVideo.addEventListener("loadedmetadata", () => {
    if (together.stream) return;
    videoDuration.innerText = formatTime(mainVideo.duration);

    const noPicture = mainVideo.videoWidth === 0;
    container.classList.toggle("audio-mode", noPicture);
    // A video file without a picture means the browser couldn't decode its video codec
    if (noPicture && playbackMode === "native" && looksLikeVideo(currentFile)) return startConversion("video");

    const saved = together.following ? NaN : parseFloat(storage.get(currentFileKey));
    if (saved > 10 && saved < mainVideo.duration - 10) {
        mainVideo.currentTime = saved;
        showFeedback("fa-clock-rotate-left", `Resumed ${formatTime(saved)}`);
    }
});

mainVideo.addEventListener("pause", savePosition);
mainVideo.addEventListener("ended", () => storage.remove(currentFileKey));
window.addEventListener("beforeunload", savePosition);

// Popup menus (speed, More): one at a time, closed by a click elsewhere or Esc
const moreBtn = container.querySelector(".more-btn"),
moreOptions = container.querySelector(".more-options");
let audioMenuBackdrop = playerPage.querySelector(".audio-menu-backdrop");
if (!audioMenuBackdrop) {
    audioMenuBackdrop = document.createElement("div");
    audioMenuBackdrop.className = "audio-menu-backdrop";
    audioMenuBackdrop.setAttribute("aria-hidden", "true");
    playerPage.append(audioMenuBackdrop);
}
// (only shown behind the open settings menu in audio mode - see togglePopup)
audioMenuBackdrop.hidden = true;
// (speed is a section of More: speedOptions isn't a menu of its own any more)
const popupMenus = [moreOptions];
const togglePopup = menu => {
    const open = !menu.classList.contains("show");
    popupMenus.forEach(other => other.classList.toggle("show", other === menu && open));
    if (!open && menu === moreOptions && audioMenuBackdrop) audioMenuBackdrop.hidden = true;
    if (open && menu === moreOptions) {
        if (container.classList.contains("audio-mode-only")) audioMenuBackdrop.hidden = false;
        // (as tall as the player leaves room for above the control bar; it scrolls past that)
        moreOptions.style.maxHeight = `${Math.max(180, Math.min(600, (container.classList.contains("audio-mode-only") ? window.innerHeight : container.clientHeight) - 84))}px`;
        renderMoreOptions();
        showMoreMenuMain();
    }
};
const showMoreMenuMain = () => {
    moreOptions.querySelector("[data-more-main]").hidden = false;
    moreOptions.querySelectorAll("[data-more-view]").forEach(view => view.hidden = true);
    moreOptions.classList.remove("showing-subview");
    const heading = moreOptions.querySelector(".more-menu-heading");
    if (heading && !heading.querySelector(".audio-menu-close")) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "audio-menu-close";
        close.setAttribute("aria-label", "Close player settings");
        close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        close.addEventListener("click", e => {
            e.stopPropagation();
            closePopups();
        });
        heading.append(close);
    }
};
moreOptions.addEventListener("click", e => {
    const back = e.target.closest("[data-more-back]");
    if (back) {
        showMoreMenuMain();
        return;
    }
    const opener = e.target.closest("[data-more-open]");
    if (!opener) return;
    const viewName = opener.dataset.moreOpen;
    const main = moreOptions.querySelector("[data-more-main]");
    const view = moreOptions.querySelector(`[data-more-view="${viewName}"]`);
    if (!view) return;
    main.hidden = true;
    moreOptions.querySelectorAll("[data-more-view]").forEach(item => item.hidden = item !== view);
    moreOptions.classList.add("showing-subview");
});
const playerSheet = container.querySelector(".player-sheet");
const sheetMenu = () => matchMedia("(max-width: 900px)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
const closePopups = () => {
    const open = popupMenus.some(menu => menu.classList.contains("show")) || !playerSheet.hidden;
    popupMenus.forEach(menu => {
        // (a phone: the menu is a sheet from below - it slides back down, then goes)
        if (menu.classList.contains("show") && sheetMenu()) {
            menu.classList.add("closing");
            setTimeout(() => menu.classList.remove("show", "closing"), 220);
        } else menu.classList.remove("show", "closing");
    });
    if (audioMenuBackdrop) audioMenuBackdrop.hidden = true;
    closeSheet();
    return open;
};
audioMenuBackdrop?.addEventListener("click", closePopups);
// (a phone's settings sheet, swiped down: it follows the finger and closes. Only a pull down from
// the very top of its list: not while the list (the sheet itself, or a list in it) is scrolled
// down, and not once the gesture has scrolled it - scrolling the list back up never closes it)
{
    let menuSwipe = null;
    const cancelMenuSwipe = () => {
        menuSwipe = null;
        moreOptions.style.removeProperty("translate");
    };
    moreOptions.addEventListener("touchstart", e => {
        if (!sheetMenu() || !moreOptions.classList.contains("show") || e.touches.length !== 1) return menuSwipe = null;
        const scrollers = [];
        for (let node = e.target; node && node !== moreOptions.parentElement; node = node.parentElement) {
            if (node.scrollHeight > node.clientHeight + 1) scrollers.push([node, node.scrollTop]);
        }
        menuSwipe = scrollers.some(([, top]) => top > 0) ? null : { y: e.touches[0].clientY, dy: 0, scrollers, started: false };
    }, { passive: true });
    moreOptions.addEventListener("touchmove", e => {
        if (!menuSwipe) return;
        const dy = e.touches[0].clientY - menuSwipe.y;
        // (a move up first is a scroll of the list; anything scrolled meanwhile, too)
        if (!menuSwipe.started && dy < -4) return cancelMenuSwipe();
        if (menuSwipe.scrollers.some(([node, top]) => node.scrollTop !== top)) return cancelMenuSwipe();
        if (dy > 6) menuSwipe.started = true;
        menuSwipe.dy = Math.max(0, dy);
        if (menuSwipe.started) moreOptions.style.translate = `0 ${Math.round(menuSwipe.dy)}px`;
    }, { passive: true });
    const endMenuSwipe = () => {
        if (!menuSwipe) return;
        const far = menuSwipe.started && menuSwipe.dy > 70;
        menuSwipe = null;
        moreOptions.style.removeProperty("translate");
        if (far) closePopups();
    };
    moreOptions.addEventListener("touchend", endMenuSwipe, { passive: true });
    moreOptions.addEventListener("touchcancel", endMenuSwipe, { passive: true });
}
speedBtn.addEventListener("click", () => togglePopup(speedOptions));
moreBtn.addEventListener("click", () => togglePopup(moreOptions));

document.addEventListener("click", e => {
    if (!e.target.closest(".popup-menu-wrapper, .audio-settings-menu, .settings-btn, .player-sheet")) closePopups();
});

// A YouTube video's previews on the seekbar: YouTube's own storyboard - small pictures every few
// seconds, on sheets (youtube.js CineYouTube.storyboard) - the one for the time pointed at
const ytPreview = document.createElement("span");
ytPreview.className = "yt-sb-frame";
ytPreview.setAttribute("aria-hidden", "true");
thumbnailPreview.prepend(ytPreview);
const ytStoryboards = new Map();
const ytStoryboard = id => {
    if (!id || !window.CineYouTube || !CineYouTube.storyboard) return null;
    if (!ytStoryboards.has(id)) {
        ytStoryboards.set(id, null);
        CineYouTube.storyboard(id).then(board => {
            ytStoryboards.set(id, board || false);
            if (board) board.sheets.slice(0, 2).forEach(src => { const img = new Image(); img.referrerPolicy = "no-referrer"; img.src = src; });
        }, () => ytStoryboards.set(id, false));
    }
    return ytStoryboards.get(id) || null;
};
// (fetched as a video starts, so it's there the first time the seekbar is pointed at)
setInterval(() => {
    const id = container.classList.contains("youtube") && !container.classList.contains("audio-mode-only") ? youTubeIdShown() : null;
    container.classList.toggle("yt-has-preview", !!(id && ytStoryboard(id)));
}, 600);
const showYouTubePreview = e => {
    const id = youTubeIdShown();
    const board = ytStoryboard(id);
    // (the length the seekbar shows - a YouTube video's, on your own or in a room)
    const duration = shownTime.duration || mediaDuration();
    if (!board || !Number.isFinite(duration) || duration <= 0) return;
    const width = videoTimeline.clientWidth;
    const offsetX = Math.min(width, Math.max(0, e.clientX - videoTimeline.getBoundingClientRect().left));
    const time = offsetX / width * duration;
    thumbnailPreview.style.left = `${Math.min(width - 80, Math.max(80, offsetX))}px`;
    previewTime.innerText = formatTime(time);
    const perSheet = board.cols * board.rows;
    const frame = Math.min(board.count - 1, Math.max(0, Math.floor(time * 1000 / board.every)));
    const sheet = board.sheets[Math.min(board.sheets.length - 1, Math.floor(frame / perSheet))];
    const at = frame % perSheet;
    // (each picture scaled to the box's 160px width)
    const scale = 160 / board.w;
    const h = Math.round(board.h * scale);
    ytPreview.style.height = `${h}px`;
    ytPreview.style.backgroundImage = `url("${sheet}")`;
    ytPreview.style.backgroundSize = `${board.cols * 160}px ${board.rows * h}px`;
    ytPreview.style.backgroundPosition = `-${(at % board.cols) * 160}px -${Math.floor(at / board.cols) * h}px`;
};
videoTimeline.addEventListener("mousemove", e => container.classList.contains("youtube") && showYouTubePreview(e));

// Timeline Hover Live Preview & Seeking
const showPreview = e => {
    if (!mainVideo.duration || together.stream) return;
    let timelineWidth = videoTimeline.clientWidth;
    let offsetX = Math.min(timelineWidth, Math.max(0, e.clientX - videoTimeline.getBoundingClientRect().left));
    let targetTime = (offsetX / timelineWidth) * mainVideo.duration;

    const thumbWidth = 160;
    let boundsX = offsetX;
    let halfThumb = thumbWidth / 2;

    if (offsetX < halfThumb) boundsX = halfThumb;
    else if (offsetX > timelineWidth - halfThumb) boundsX = timelineWidth - halfThumb;

    thumbnailPreview.style.left = `${boundsX}px`;
    previewTime.innerText = formatTime(targetTime);

    if (!previewVideo.seeking && Math.abs(previewVideo.currentTime - targetTime) > 0.3) {
        previewVideo.currentTime = targetTime;
    }
};
videoTimeline.addEventListener("mousemove", showPreview);

// Handoff media helper (initialized early to prevent TDZ ReferenceErrors before full script init)
let handoffMedia = () => null;

// In a room's stream the timeline shows, and jumps in, the host's video
const mediaDuration = () => together.stream ? together.stream.duration : mainVideo.duration;

const seekTo = time => {
    if (handoffMedia()) return handoffMedia().currentTime = time;
    if (together.stream) return together.stream.request({ time });
    mainVideo.currentTime = time;
};

// Seeking: click, or drag along the timeline with the mouse or a finger
let scrubbing = false;
const timelineRatio = e => {
    const rect = videoTimeline.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
};
// Your own video, prompt to jump: a tap (or click) jumps exactly there at once. While dragging,
// the picture follows as fast as the video can be decoded: each jump waits for the one before,
// and only the newest place counts (browsers that can jump to the nearest keyframe do, which is
// quicker), so jumps never pile up; letting go lands exactly there. YouTube and a room's stream
// jump once, where the finger or mouse let go.
let scrubFrom = 0;
let scrubMoved = false;
let scrubNext = null;
const seekWhileDragging = time => {
    scrubNext = time;
    if (mainVideo.seeking) return;
    scrubNext = null;
    if (typeof mainVideo.fastSeek === "function") mainVideo.fastSeek(time);
    else mainVideo.currentTime = time;
};
mainVideo.addEventListener("seeked", () => scrubbing && scrubNext !== null && seekWhileDragging(scrubNext));

// The time at the left of the controls: how far in (01:23), or - clicked or tapped - how long is
// left (-43:37). Clicked again, back. Remembered in this browser.
const TIME_MODE_KEY = "cinetab:time-left";
let showRemaining = storage.get(TIME_MODE_KEY) === "1";
const shownTime = { time: 0, duration: 0 };
const paintTime = (time = shownTime.time, duration = shownTime.duration) => {
    shownTime.time = time;
    shownTime.duration = duration;
    const left = !container.classList.contains("audio-mode-only") && showRemaining && Number.isFinite(duration) && duration > 0;
    currentVidTime.innerText = left ? `-${formatTime(Math.max(0, duration - time))}` : formatTime(time);
    currentVidTime.classList.toggle("left", left);
};
const paintTimeLabel = () => {
    const audioOnly = container.classList.contains("audio-mode-only");
    const label = audioOnly ? "Elapsed time" : showRemaining ? "Time left: show how far in" : "Show the time left";
    currentVidTime.setAttribute("aria-label", label);
    if (audioOnly) {
        // (the audio player always shows how far in: a plain label, nothing to tap)
        currentVidTime.removeAttribute("title");
        currentVidTime.removeAttribute("role");
        currentVidTime.removeAttribute("aria-pressed");
        currentVidTime.tabIndex = -1;
    } else {
        currentVidTime.title = label;
        currentVidTime.setAttribute("role", "button");
        currentVidTime.setAttribute("aria-pressed", String(showRemaining));
        currentVidTime.tabIndex = 0;
    }
};
currentVidTime.setAttribute("role", "button");
currentVidTime.tabIndex = 0;
paintTimeLabel();
const toggleTimeLeft = e => {
    e.stopPropagation();
    if (container.classList.contains("audio-mode-only")) return;
    // ("LIVE" has no time left)
    if (container.classList.contains("yt-live")) return;
    showRemaining = !showRemaining;
    storage.set(TIME_MODE_KEY, showRemaining ? "1" : "0");
    paintTimeLabel();
    paintTime();
};
currentVidTime.addEventListener("click", toggleTimeLeft);
currentVidTime.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggleTimeLeft(e);
});

const scrub = (e, dragging = false) => {
    const ratio = timelineRatio(e);
    progressBar.style.width = `${ratio * 100}%`;
    paintTime(ratio * mediaDuration(), mediaDuration());
    if (!together.stream) {
        const time = ratio * mainVideo.duration;
        if (dragging) seekWhileDragging(time);
        else mainVideo.currentTime = time;
    }
    // The scene preview while dragging (not for a tap: the jump itself comes first)
    if (dragging && e.pointerType === "touch") showPreview(e);
};
videoTimeline.addEventListener("pointerdown", e => {
    if (!mediaDuration() || e.button > 0) return;
    scrubbing = true;
    scrubMoved = false;
    scrubNext = null;
    scrubFrom = e.clientX;
    videoTimeline.setPointerCapture(e.pointerId);
    videoTimeline.classList.add("scrubbing");
    scrub(e);
});
videoTimeline.addEventListener("pointermove", e => {
    if (!scrubbing) return;
    // A finger's small wobble during a tap isn't a drag
    if (!scrubMoved && Math.abs(e.clientX - scrubFrom) < 6) return;
    scrubMoved = true;
    scrub(e, true);
});
const endScrub = e => {
    if (!scrubbing) return;
    scrubbing = false;
    videoTimeline.classList.remove("scrubbing");
    if (e.type !== "pointerup") return;
    const time = timelineRatio(e) * mediaDuration();
    // The host's stream (or YouTube) jumps once, where the mouse or finger let go
    if (together.stream) return together.stream.request({ time });
    // Dragged: lands exactly where it let go
    scrubNext = null;
    if (scrubMoved && Math.abs(mainVideo.currentTime - time) > 0.05) mainVideo.currentTime = time;
};
videoTimeline.addEventListener("pointerup", endScrub);
videoTimeline.addEventListener("pointercancel", endScrub);

const showProgress = (currentTime, duration) => {
    if (scrubbing) return;
    let percent = (currentTime / duration) * 100;
    progressBar.style.width = `${percent}%`;
    paintTime(currentTime, duration);
};

mainVideo.addEventListener("timeupdate", e => {
    if (together.stream) return;
    let {currentTime, duration} = e.target;
    showProgress(currentTime, duration);

    if (Date.now() - lastSavedAt > 5000) {
        lastSavedAt = Date.now();
        savePosition();
    }

    if (playbackMode === "native" && !soundChecked && currentTime > 2.5) {
        soundChecked = true;
        if (noSoundDecoded()) compatBanner.classList.remove("hidden");
    }
});

// Volume Controls
// Sliders fill with the accent colour up to their thumb
const paintRange = input => input.style.setProperty("--fill", `${(input.value - input.min) / (input.max - input.min) * 100}%`);

const setVolume = (value) => {
    mainVideo.volume = value;
    volumeSlider.value = value;
    paintRange(volumeSlider);
    volumeBtn.parentNode.title = value == 0 ? "Unmute (Shift + M)" : "Mute (Shift + M)";
    if(value == 0) {
        volumeBtn.className = "fa-solid fa-volume-xmark";
    } else if(value < 0.5) {
        volumeBtn.className = "fa-solid fa-volume-low";
    } else {
        volumeBtn.className = "fa-solid fa-volume-high";
    }
};

volumeBtn.parentNode.addEventListener("click", (e) => {
    if(e.target.tagName === "INPUT") return;
    if(mainVideo.volume > 0) {
        setVolume(0);
        showFeedback("fa-volume-xmark", "Muted");
    } else {
        setVolume(1);
        showFeedback("fa-volume-high", "100%");
    }
});

volumeSlider.addEventListener("input", e => setVolume(e.target.value));
// One volume step (the arrow keys, a notch of the wheel): 5 points, shown as a message
const stepVolume = dir => {
    const value = Math.round(Math.min(1, Math.max(0, mainVideo.volume + dir * 0.05)) * 100) / 100;
    setVolume(value);
    showFeedback(value === 0 ? "fa-volume-xmark" : value < 0.5 ? "fa-volume-low" : "fa-volume-high", `${Math.round(value * 100)}%`);
};
// (a computer: the wheel over the volume - in the video's controls or the audio player's row -
// turns it up and down instead of scrolling the page)
volumeSlider.closest(".volume-group")?.addEventListener("wheel", e => {
    if (!e.deltaY) return;
    e.preventDefault();
    stepVolume(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
// Give focus back to the page so keyboard shortcuts keep working
volumeSlider.addEventListener("change", () => volumeSlider.blur());

// ---------- More menu: the picture's shape and a volume boost

const aspectChips = moreOptions.querySelectorAll("li[data-aspect]"),
aspectCurrent = moreOptions.querySelector(".aspect-current"),
boostChips = moreOptions.querySelectorAll("li[data-boost]"),
boostCurrent = moreOptions.querySelector(".boost-current"),
moreNote = moreOptions.querySelector(".more-note");
const ASPECT_KEY = "cinetab:aspect";
const ASPECTS = { "16:9": 16 / 9, "4:3": 4 / 3, "21:9": 21 / 9 };

// Fit (the whole picture), Fill (cropped to the screen), Stretch, or a fixed shape
const setAspect = (aspect, announce = false) => {
    if (!["fit", "fill", "stretch", ...Object.keys(ASPECTS)].includes(aspect)) aspect = "fit";
    container.classList.toggle("aspect-fill", aspect === "fill");
    container.classList.toggle("aspect-stretch", aspect === "stretch");
    container.classList.toggle("aspect-ratio", aspect in ASPECTS);
    if (aspect in ASPECTS) container.style.setProperty("--aspect", ASPECTS[aspect]);
    aspectChips.forEach(chip => chip.classList.toggle("active", chip.dataset.aspect === aspect));
    aspectCurrent.textContent = aspectChips[[...aspectChips].findIndex(chip => chip.dataset.aspect === aspect)].textContent;
    storage.set(ASPECT_KEY, aspect);
    if (announce) showFeedback("fa-expand", aspectCurrent.textContent);
};
aspectChips.forEach(chip => chip.addEventListener("click", () => setAspect(chip.dataset.aspect, true)));
setAspect(storage.get(ASPECT_KEY) || "fit");

// Louder than 100%: the sound goes through Web Audio with extra gain and a limiter that stops
// it from distorting. Created the first time it's needed (it has to start from a click), and
// then the player's sound keeps going that way. Chrome gives silence for a stream (a room) played
// that way, so a stream's sound is taken from the stream itself instead.
const boost = { level: 1, ctx: null, gain: null, streamVolume: null, stream: null, streamNode: null };

const syncBoostVolume = () => {
    if (boost.streamVolume) boost.streamVolume.gain.value = mainVideo.muted ? 0 : mainVideo.volume;
};

const routeBoost = () => {
    if (!boost.ctx) return;
    const stream = mainVideo.srcObject instanceof MediaStream ? mainVideo.srcObject : null;
    if (stream === boost.stream) return;
    if (boost.streamNode) boost.streamNode.disconnect();
    boost.streamNode = null;
    boost.stream = stream;
    if (stream && stream.getAudioTracks().length) {
        boost.streamNode = boost.ctx.createMediaStreamSource(stream);
        boost.streamNode.connect(boost.streamVolume);
    }
};

// `announce`: say so in the middle of the picture (not while a swipe is changing it)
const setBoost = (level, announce = true) => {
    if (container.classList.contains("youtube")) return;
    if (level > 1 && !boost.ctx) {
        try {
            const ctx = new AudioContext();
            const gain = ctx.createGain();
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -1.5;
            limiter.knee.value = 0;
            limiter.ratio.value = 20;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.2;
            gain.connect(limiter);
            limiter.connect(ctx.destination);
            ctx.createMediaElementSource(mainVideo).connect(gain);
            boost.streamVolume = ctx.createGain();
            boost.streamVolume.connect(gain);
            Object.assign(boost, { ctx, gain });
            syncBoostVolume();
            routeBoost();
        } catch (e) {
            showFeedback("fa-triangle-exclamation", "Boost isn't available here");
            return;
        }
    }
    boost.level = level;
    if (boost.ctx) {
        boost.gain.gain.value = level;
        boost.ctx.resume().catch(() => {});
    }
    renderMoreOptions();
    if (announce) showFeedback(level > 1 ? "fa-volume-high" : "fa-volume-low", level > 1 ? `Boost ${Math.round(level * 100)}%` : "Boost off");
};
boostChips.forEach(chip => chip.addEventListener("click", () => setBoost(+chip.dataset.boost)));
mainVideo.addEventListener("volumechange", syncBoostVolume);
// A room's stream can change at any time
["loadstart", "emptied", "play"].forEach(type => mainVideo.addEventListener(type, routeBoost));

// The menu reflects what applies right now: YouTube's own player keeps its shape and volume
function renderMoreOptions() {
    const youtube = container.classList.contains("youtube");
    // Subtitles: on or off (a file loaded, YouTube's or the host's), or a file to load
    const subsOn = subtitlesBtn.classList.contains("active");
    const hasSubs = youtube || !!together.stream || mainVideo.textTracks.length > 0;
    moreOptions.querySelectorAll(".subs-options li").forEach(chip => {
        const kind = chip.dataset.subs;
        chip.hidden = kind === "load" ? youtube && !together.stream : !hasSubs;
        chip.classList.toggle("active", kind === "on" ? subsOn : kind === "off" ? hasSubs && !subsOn : false);
    });
    const subsCurrent = moreOptions.querySelector(".subs-current");
    if (subsCurrent) subsCurrent.textContent = subsOn ? "On" : hasSubs ? "Off" : "None";
    // YouTube's player fills the picture, so it can be Fit or Fill (not the other shapes)
    aspectChips.forEach(chip => chip.hidden = youtube && !["fit", "fill"].includes(chip.dataset.aspect));
    moreOptions.querySelector(".aspect-options")?.classList.remove("disabled");
    moreOptions.querySelector(".boost-options")?.classList.toggle("disabled", youtube);
    boostChips.forEach(chip => chip.classList.toggle("active", +chip.dataset.boost === boost.level));
    boostCurrent.textContent = youtube ? "—" : boost.level > 1 ? `${Math.round(boost.level * 100)}%` : "Off";
    moreNote.hidden = !youtube;
    moreNote.textContent = youtube ? "YouTube's player keeps its own volume (up to 100%)." : "";
    const menuValues = {
        speed: moreOptions.querySelector(".speed-current")?.textContent || "Normal",
        subtitles: subsCurrent?.textContent || "Off",
        picture: aspectCurrent.textContent,
        ambient: moreOptions.querySelector(".ambient-current")?.textContent || "On",
        boost: boostCurrent.textContent
    };
    moreOptions.querySelectorAll("[data-more-value]").forEach(value => value.textContent = menuValues[value.dataset.moreValue] || "");

    // Synchronize switches in More options
    const ambientToggle = moreOptions.querySelector('[data-more-toggle="ambient"]');
    if (ambientToggle) {
        const ambientIsOn = (moreOptions.querySelector(".ambient-current")?.textContent || "On") === "On";
        ambientToggle.setAttribute("aria-checked", String(ambientIsOn));
    }
    const subsToggle = moreOptions.querySelector('[data-more-toggle="subtitles"]');
    if (subsToggle) {
        subsToggle.setAttribute("aria-checked", String(subsOn));
    }
    const autoplayToggle = moreOptions.querySelector('[data-more-toggle="autoplay"]');
    if (autoplayToggle) {
        const ap = container.querySelector(".yt-autoplay");
        const apOn = ap ? ap.getAttribute("aria-checked") === "true" : true;
        autoplayToggle.setAttribute("aria-checked", String(apOn));
        const apRowVisible = !!(together.solo && (together.solo.active || container.classList.contains("yt-host")));
        autoplayToggle.hidden = !apRowVisible;
    }
    const shuffleToggle = moreOptions.querySelector('[data-more-toggle="shuffle"]');
    if (shuffleToggle) {
        const shuffleButton = container.querySelector(".shuffle-btn");
        const isShuffleOn = together.solo ? !!together.solo.shuffle : (shuffleButton?.getAttribute("aria-pressed") === "true");
        shuffleToggle.setAttribute("aria-checked", String(isShuffleOn));
    }
    const audioAction = moreOptions.querySelector('[data-more-action="audio"]');
    if (audioAction) {
        const active = container.classList.contains("audio-mode-only");
        audioAction.setAttribute("aria-pressed", String(active));
        const value = audioAction.querySelector('[data-more-action-value="audio"]');
        if (value) value.textContent = active ? "Audio" : "Video";
        audioAction.hidden = !window.CineAudioMode?.canToggle;
    }

    if (!playerSheet.hidden) renderSheet();
}
renderMoreOptions();
moreOptions.addEventListener("click", e => {
    const toggleRow = e.target.closest("[data-more-toggle]");
    const actionRow = e.target.closest("[data-more-action]");
    if (actionRow) {
        const action = actionRow.dataset.moreAction;
        if (action === "audio" && window.CineAudioMode) window.CineAudioMode.toggle();
        if (action === "pip") toggleCustomPiP();
        closePopups();
        return;
    }
    if (toggleRow) {
        const toggleType = toggleRow.dataset.moreToggle;
        if (toggleType === "ambient") {
            const ambientChips = moreOptions.querySelectorAll(".ambient-options li");
            const isOn = (moreOptions.querySelector(".ambient-current")?.textContent || "On") === "On";
            const targetChip = [...ambientChips].find(c => c.dataset.ambient === (isOn ? "off" : "on"));
            if (targetChip) targetChip.click();
        } else if (toggleType === "subtitles") {
            toggleSubtitles();
        } else if (toggleType === "autoplay") {
            const ap = container.querySelector(".yt-autoplay");
            if (ap) ap.click();
        } else if (toggleType === "shuffle") {
            const shuffleButton = container.querySelector(".shuffle-btn");
            if (shuffleButton && !shuffleButton.hidden) {
                shuffleButton.click();
            } else if (together.toggleShuffle) {
                together.toggleShuffle();
            } else if (together.solo) {
                together.solo.shuffle = !together.solo.shuffle;
                showFeedback("fa-shuffle", together.solo.shuffle ? "Shuffle on" : "Shuffle off");
            }
        }
        renderMoreOptions();
        return;
    }
    const openFileRow = e.target.closest(".more-open-file");
    if (openFileRow) {
        closePopups();
        fileInput.click();
        return;
    }
    // Stop: the video (or the stream) off, back to "pick a video" - in a room, for everyone
    const stopRow = e.target.closest(".more-stop-video");
    if (stopRow) {
        closePopups();
        onStopClick();
        return;
    }
});
moreOptions.querySelector(".subs-options")?.addEventListener("click", e => {
    const chip = e.target.closest("li[data-subs]");
    if (!chip) return;
    if (chip.dataset.subs === "load") {
        closePopups();
        return subtitleInput.click();
    }
    if ((chip.dataset.subs === "on") !== subtitlesBtn.classList.contains("active")) toggleSubtitles();
    renderMoreOptions();
    // (YouTube's and the host's answer a moment later)
    setTimeout(renderMoreOptions, 400);
});

// ---------- Settings sheet (phones and tablets): speed, picture, boost, subtitles and files
// in one place, like YouTube's. Each choice is the same as the desktop menus' (it clicks them),
// so both always agree. The sheet stays open, and the controls with it, until it's closed.
const settingsBtn = container.querySelector(".settings-btn"),
sheetMain = playerSheet.querySelector('[data-sheet="main"]'),
sheetOptionsView = playerSheet.querySelector('[data-sheet="options"]'),
sheetTitle = playerSheet.querySelector(".sheet-title"),
sheetNote = playerSheet.querySelector(".sheet-note"),
sheetOptions = playerSheet.querySelector(".sheet-options");
const SHEET_LISTS = {
    // A room's YouTube video or stream plays at the room's speed: the choice goes to the room
    speed: { title: "Playback speed", chips: () => speedPresets, current: () => together.stream ? rateLabel(together.stream.rate) : speedCurrent.textContent,
        active: chip => together.stream ? +chip.dataset.speed === together.stream.rate : chip.classList.contains("active"),
        pick: chip => together.stream ? together.stream.request({ rate: +chip.dataset.speed }) : chip.click() },
    aspect: { title: "Picture", chips: () => aspectChips, current: () => aspectCurrent.textContent },
    ambient: { title: "Ambient mode", chips: () => ambientChips, current: () => ambientCurrent.textContent,
        note: () => "The picture's colours glow softly around the player. A YouTube video glows with its thumbnail." },
    boost: { title: "Volume boost", chips: () => boostChips, current: () => boostCurrent.textContent,
        note: () => "Louder than the phone's own maximum. Swiping up on the right side of the picture goes past 100% too." },
    // Background play's options exist only here (computers keep playing in the background anyway)
    background: { title: "Background play", chips: () => backgroundChips, current: () => backgroundLabel(), note: () => BACKGROUND_NOTE }
};
let sheetList = null;
const rateLabel = rate => rate === 1 ? "Normal" : `${rate}x`;

const sheetRow = name => playerSheet.querySelector(`[data-open="${name}"], [data-act="${name}"]`);

function renderSheet() {
    const youtube = container.classList.contains("youtube");
    // The host's stream plays at the host's speed; YouTube keeps its own shape and volume
    sheetRow("boost").hidden = youtube;
    Object.keys(SHEET_LISTS).forEach(name => sheetRow(name).querySelector(".sheet-value").textContent = SHEET_LISTS[name].current());
    const subtitlesOn = subtitlesBtn.classList.contains("active");
    sheetRow("subtitles").querySelector(".sheet-value").textContent = subtitlesOn ? "On" : youtube || together.stream || mainVideo.textTracks.length ? "Off" : "None";
    // Autoplay: a YouTube video watched on your own, or the room's queue (its host decides)
    const autoplayHere = !!together.solo && (together.solo.active || container.classList.contains("yt-host"));
    sheetRow("autoplay").hidden = !autoplayHere;
    if (autoplayHere) sheetRow("autoplay").querySelector(".sheet-value").textContent = together.solo.autoplay ? "On" : "Off";
    // In a room, the room's own rules apply while a phone is away (room.js)
    sheetRow("background").hidden = together.active();
    if (sheetList) showSheetList(sheetList);
}

const showSheetList = name => {
    const list = SHEET_LISTS[name];
    sheetList = name;
    sheetTitle.textContent = list.title;
    const note = list.note ? list.note() : "";
    sheetNote.hidden = !note;
    sheetNote.textContent = note;
    const current = list.current();
    const chips = [...list.chips()].filter(chip => !chip.hidden);
    const isActive = chip => list.active ? list.active(chip) : chip.classList.contains("active");
    sheetOptions.replaceChildren(...chips.map(chip => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "sheet-option";
        option.setAttribute("role", "radio");
        const active = isActive(chip);
        option.setAttribute("aria-checked", String(active));
        option.innerHTML = `<i class="fa-solid fa-check"></i>`;
        option.append(chip.textContent);
        option.addEventListener("click", () => {
            if (list.pick) list.pick(chip);
            else chip.click();
            // Back to the list, which now shows the new choice
            showSheetMain();
        });
        return option;
    }));
    // A value between the presets (a custom speed, or a boost set by swiping)
    if (!chips.some(isActive)) {
        const custom = document.createElement("p");
        custom.className = "sheet-custom";
        custom.textContent = `Now: ${current}`;
        sheetOptions.prepend(custom);
    }
    sheetMain.hidden = true;
    sheetOptionsView.hidden = false;
};

const showSheetMain = () => {
    sheetList = null;
    sheetOptionsView.hidden = true;
    sheetMain.hidden = false;
    renderSheet();
};

const openSheet = () => {
    popupMenus.forEach(menu => menu.classList.remove("show"));
    sheetList = null;
    sheetOptionsView.hidden = true;
    sheetMain.hidden = false;
    playerSheet.hidden = false;
    // Also refreshes what applies now (YouTube: Fit / Fill, no boost) and the sheet with it
    renderMoreOptions();
    container.classList.add("show-controls", "sheet-open");
    settingsBtn.setAttribute("aria-expanded", "true");
    playerSheet.querySelector(".sheet-row:not([hidden])").focus({ preventScroll: true });
};

function closeSheet() {
    if (playerSheet.hidden) return;
    playerSheet.hidden = true;
    container.classList.remove("sheet-open");
    settingsBtn.setAttribute("aria-expanded", "false");
    // The controls hide again a while after the sheet closes
    hideControls();
}

settingsBtn.addEventListener("click", () => playerSheet.hidden ? openSheet() : closeSheet());
// A tap outside the box closes it
playerSheet.addEventListener("click", e => e.target === playerSheet && closeSheet());
playerSheet.querySelector(".sheet-close").addEventListener("click", closeSheet);
playerSheet.querySelector(".sheet-back").addEventListener("click", showSheetMain);
sheetMain.addEventListener("click", e => {
    const row = e.target.closest(".sheet-row");
    if (!row) return;
    if (row.dataset.open) return showSheetList(row.dataset.open);
    const act = row.dataset.act;
    if (act === "subtitles") {
        // Directly: a click on the hidden button would count as a click outside the sheet
        toggleSubtitles();
        return renderSheet();
    }
    if (act === "autoplay") {
        if (together.solo) together.solo.toggleAutoplay();
        return renderSheet();
    }
    // These open something else: the sheet steps aside
    closeSheet();
    if (act === "stop") return onStopClick();
    if (act === "subtitle-file") subtitleInput.click();
    else if (act === "open") openFileBtn.click();
});

// Play / Pause: briefly highlight the actual control rather than raising a separate flyout.
let playFeedbackTimer = null;
const playFeedback = () => {
    clearTimeout(playFeedbackTimer);
    container.classList.remove("play-feedback");
    void container.offsetWidth;
    container.classList.add("play-feedback");
    playFeedbackTimer = setTimeout(() => container.classList.remove("play-feedback"), 700);
};
// When the person last paused (Background play never undoes their own pause)
let userPausedAt = 0;
const togglePlay = () => {
    // The sound playing on its own while the page is away (Background play)
    const sound = handoffMedia();
    if (sound) {
        if (sound.paused) sound.play().catch(() => {});
        else {
            userPausedAt = Date.now();
            sound.pause();
        }
        return;
    }
    if (together.stream) {
        const play = together.stream.paused;
        if (!play) userPausedAt = Date.now();
        if (together.stream.request({ paused: !play })) playFeedback();
        return;
    }
    if(mainVideo.paused) {
        mainVideo.play().catch(() => {});
        playFeedback();
    } else {
        userPausedAt = Date.now();
        mainVideo.pause();
        playFeedback();
    }
};

playPauseBtn.parentNode.addEventListener("click", togglePlay);

const showPlaying = playing => {
    playPauseBtn.className = playing ? "fas fa-pause" : "fas fa-play";
    playPauseBtn.parentNode.title = playing ? "Pause (Space / K)" : "Play (Space / K)";
    const colPlayIcon = document.querySelector(".audio-collapsed-play i");
    if (colPlayIcon) colPlayIcon.className = playing ? "fas fa-pause" : "fas fa-play";
    container.classList.toggle("is-playing", playing);
    if (playing) {
        clearTimeout(idleTimer);
        hideControls();
    }
};
mainVideo.addEventListener("play", () => together.stream || showPlaying(true));
mainVideo.addEventListener("pause", () => together.stream || showPlaying(false));

// Seek; true if it jumped. `feedback`: say so in the middle (double taps show a ripple instead)
const seek = (seconds, feedback = true) => {
    if (!mediaDuration()) return false;
    if (handoffMedia()) handoffMedia().currentTime += seconds;
    else if (together.stream) {
        if (!together.stream.request({ time: together.stream.currentTime() + seconds })) return false;
    } else mainVideo.currentTime += seconds;
    if (feedback) showFeedback(seconds > 0 ? "fa-forward" : "fa-backward", `${seconds > 0 ? '+' : ''}${seconds}s`);
    return true;
};

skipBackward.addEventListener("click", () => seek(-5));
skipForward.addEventListener("click", () => seek(5));

// ---------- Lock screen and notification controls (Media Session)
// Phones show the video's title with play / pause and jumps on the lock screen and in the
// notifications, and treat the page as media whose sound goes on when the browser is left or the
// phone is locked. In a room these controls go to the room, like the player's own.
let mediaKeyAt = 0;
// A play or pause from these controls is the person's own; one while the page isn't on screen
// otherwise comes from the phone (see room.js)
together.fromMediaKeys = () => Date.now() - mediaKeyAt < 1500;
const mediaPaused = () => {
    const hm = handoffMedia ? handoffMedia() : null;
    if (hm) return hm.paused;
    return together.stream ? together.stream.paused : mainVideo.paused;
};
const mediaTime = () => {
    const hm = handoffMedia ? handoffMedia() : null;
    if (hm) return hm.currentTime;
    return together.stream ? together.stream.currentTime() : mainVideo.currentTime;
};

// A thin seekbar along the edge of a small view - the miniplayer's video (room.js), the phone's
// audio strip at the top of the open sheet. It follows whatever plays (your file, YouTube, a
// room's stream) and seeks it: tap, or drag and let go. Its taps don't reach the view under it.
const makeSeekLine = host => {
    const line = document.createElement("div");
    line.className = "seek-line";
    line.setAttribute("role", "slider");
    line.setAttribute("aria-label", "Seek");
    line.innerHTML = '<span class="seek-line-track"><span class="seek-line-fill"></span></span>';
    host.append(line);
    const fill = line.querySelector(".seek-line-fill");
    let dragging = false;
    const ratioAt = e => {
        const box = line.getBoundingClientRect();
        return box.width ? Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) : 0;
    };
    const paint = ratio => fill.style.width = `${(ratio * 100).toFixed(2)}%`;
    const known = () => { const d = mediaDuration(); return Number.isFinite(d) && d > 0 ? d : 0; };
    setInterval(() => {
        if (dragging || !line.getClientRects().length) return;
        const duration = known();
        paint(duration ? Math.min(1, mediaTime() / duration) : 0);
        line.setAttribute("aria-valuenow", String(Math.round(duration ? mediaTime() / duration * 100 : 0)));
    }, 250);
    line.addEventListener("pointerdown", e => {
        e.stopPropagation();
        if (e.button > 0 || !known()) return;
        e.preventDefault();
        dragging = true;
        line.classList.add("dragging");
        line.setPointerCapture?.(e.pointerId);
        paint(ratioAt(e));
    });
    line.addEventListener("pointermove", e => dragging && paint(ratioAt(e)));
    const end = e => {
        if (!dragging) return;
        dragging = false;
        line.classList.remove("dragging");
        if (e.type === "pointerup" && known()) seekTo(ratioAt(e) * known());
    };
    line.addEventListener("pointerup", end);
    line.addEventListener("pointercancel", end);
    line.addEventListener("click", e => e.stopPropagation());
    return line;
};

// The YouTube video in the player (on your own, or the room's), for its picture
const youTubeIdShown = () => (together.solo && together.solo.active && together.solo.videoId) ||
    (together.roomYouTubeId && together.roomYouTubeId()) || null;

// Audio mode keeps playback and room sync untouched. YouTube's cross-origin player doesn't expose
// decoded audio samples. The visualizer equalizer is shown only for local audio files; YouTube Music
// operates in audio mode only without manual switching.
(() => {
    const audioButton = container.querySelector(".audio-mode-toggle");
    const miniButton = container.querySelector(".solo-miniplayer-toggle");
    if (!audioButton || !miniButton) return;
    // A YouTube video's picture for the artwork: the 16:9 one, without the black bars of the
    // 4:3 hqdefault (falls back to mqdefault, also 16:9, when a video doesn't have it - see "load")
    const youTubeArt = id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hq720.jpg`;
    // (the large 16:9 pictures, in turn; mqdefault - also 16:9, smaller - always exists)
    const nextYouTubeArt = src => /\/hq720\.jpg$/.test(src) ? src.replace(/hq720\.jpg$/, "maxresdefault.jpg")
        : /\/maxresdefault\.jpg$/.test(src) ? src.replace(/maxresdefault\.jpg$/, "mqdefault.jpg") : null;
    const micaBg = document.createElement("div");
    micaBg.className = "audio-mode-mica";
    micaBg.setAttribute("aria-hidden", "true");
    container.prepend(micaBg);
    // (the same picture for the phones' details panel: its dynamic mica - style.css --mica-image)
    new MutationObserver(() => playerPage.style.setProperty("--mica-image", micaBg.style.backgroundImage || "none"))
        .observe(micaBg, { attributes: true, attributeFilter: ["style"] });

    const audioView = document.createElement("section");
    // The audio player (2026 redesign). Its parts have their own "ap-" classes and the id
    // #audio-stage, which style.css's "Audio player" block styles on its own - none of the older
    // .audio-mode-* layout rules reach them. The seekbar, the play controls, the volume and the
    // Save button are the video player's own, moved in while it shows (setAudioMode).
    audioView.className = "audio-mode-view";
    audioView.id = "audio-stage";
    audioView.setAttribute("aria-label", "Audio player");
    audioView.innerHTML = `
      <div class="ap">
        <figure class="ap-art">
          <img alt="" />
          <span class="ap-art-icon" aria-hidden="true"><i class="fa-solid fa-music"></i></span>
          <canvas class="ap-viz" aria-hidden="true"></canvas>
        </figure>
        <div class="ap-info">
          <div class="ap-head">
            <div class="ap-text">
              <div class="ap-title-wrap"><h2 class="ap-title"><span class="ap-title-text"></span></h2></div>
              <div class="ap-meta"><span class="ap-meta-line">
                <span class="ap-artist"></span><span class="ap-dot" hidden>·</span><span class="ap-album" hidden></span><span class="ap-dot" hidden>·</span><span class="ap-year" hidden></span>
              </span></div>
            </div>
            <div class="ap-actions"></div>
          </div>
          <div class="ap-timeline"></div>
          <div class="ap-transport"></div>
          <div class="ap-volume"></div>
        </div>
      </div>`;
    container.append(audioView);
    const canvas = audioView.querySelector("canvas");
    // The artwork, touched (a phone's audio player): a double tap saves (or unsaves) - a heart pops
    // on it; a swipe from right to left goes on to the next track (like Next), left to right back
    // to the previous one
    {
        const artBox = audioView.querySelector(".ap-art");
        let lastTap = 0, artTouch = null;
        const popHeart = () => {
            const heart = document.createElement("i");
            heart.className = "fa-solid fa-heart ap-heart-pop";
            artBox.append(heart);
            setTimeout(() => heart.remove(), 800);
        };
        artBox.addEventListener("pointerdown", e => {
            artTouch = { x: e.clientX, y: e.clientY, touch: e.pointerType === "touch" };
        });
        artBox.addEventListener("pointercancel", () => artTouch = null);
        artBox.addEventListener("pointerup", e => {
            if (!artTouch) return;
            const dx = e.clientX - artTouch.x, dy = e.clientY - artTouch.y;
            const touch = artTouch.touch;
            artTouch = null;
            if (touch && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                const next = dx < 0;
                const step = container.querySelector(next ? ".next-track" : ".prev-track");
                if (step && !step.hidden && !step.disabled) {
                    step.click();
                    artBox.animate([{ translate: `${next ? 28 : -28}px 0`, opacity: 0.4 }, { translate: "0 0", opacity: 1 }], { duration: 260, easing: "ease-out" });
                } else showFeedback(next ? "fa-forward-step" : "fa-backward-step", next ? "Nothing after this" : "Nothing before this");
                return;
            }
            if (Math.hypot(dx, dy) > 10) return;
            const now = Date.now();
            if (now - lastTap < 320) {
                lastTap = 0;
                const save = container.querySelector(".player-save-wrap:not([hidden]) .player-save-btn");
                if (!save) return;
                const wasOn = save.classList.contains("on");
                save.click();
                if (!wasOn) popHeart();
            } else lastTap = now;
        });
    }
    const context = canvas.getContext("2d");
    const art = audioView.querySelector("img");
    // The shape of what a picture shows, black bars left out (a thumbnail with a square album cover
    // in it: 1). Null when the page may not read the picture. Snapped: near-square is square.
    const measureArtContent = (src, natural) => new Promise(resolve => {
        if (!src || src.startsWith("data:")) return resolve(null);
        const probe = new Image();
        probe.crossOrigin = "anonymous";
        probe.onerror = () => resolve(null);
        probe.onload = () => {
            try {
                const W = 96, H = Math.max(1, Math.round(96 / natural));
                const c = document.createElement("canvas");
                c.width = W;
                c.height = H;
                const g = c.getContext("2d", { willReadFrequently: true });
                g.drawImage(probe, 0, 0, W, H);
                const d = g.getImageData(0, 0, W, H).data;
                const dark = (x, y) => {
                    const i = (y * W + x) * 4;
                    return Math.max(d[i], d[i + 1], d[i + 2]) < 28;
                };
                // a row / column is a bar when nearly all of it is black
                const colBar = x => { let n = 0; for (let y = 0; y < H; y++) n += dark(x, y); return n >= H * 0.96; };
                const rowBar = y => { let n = 0; for (let x = 0; x < W; x++) n += dark(x, y); return n >= W * 0.96; };
                let left = 0, right = W - 1, top = 0, bottom = H - 1;
                while (left < right && colBar(left)) left++;
                while (right > left && colBar(right)) right--;
                while (top < bottom && rowBar(top)) top++;
                while (bottom > top && rowBar(bottom)) bottom--;
                const w = right - left + 1, h = bottom - top + 1;
                // (an all-dark picture, or bars that leave almost nothing: trust its own shape)
                if (w < W * 0.3 || h < H * 0.3) return resolve(natural);
                const ratio = (w / W * natural) / (h / H);
                resolve(ratio < 1.15 && ratio > 0.87 ? 1 : ratio);
            } catch (e) {
                resolve(null);
            }
        };
        probe.src = src;
    });
    const artIcon = audioView.querySelector(".ap-art-icon i");
    // A local audio file's mica (no picture): the placeholder artwork's violet and blue
    const LOCAL_AUDIO_MICA = "radial-gradient(circle at 25% 30%, rgb(96, 64, 190), transparent 60%), radial-gradient(circle at 80% 75%, rgb(40, 90, 200), transparent 60%), linear-gradient(rgb(46, 30, 92), rgb(20, 24, 60))";
    // A local video's (or a shared screen's) mica: a small picture of its current frame, taken once it
    // shows one and again every few seconds while it plays, and after a jump
    let micaShotAt = 0;
    const captureMica = () => {
        if (container.classList.contains("youtube") || !(currentFile || together.stream) || isLocalAudio()) return;
        if (!mainVideo.videoWidth || mainVideo.readyState < 2) return;
        try {
            const shot = document.createElement("canvas");
            shot.width = 160;
            shot.height = Math.max(1, Math.round(160 * mainVideo.videoHeight / mainVideo.videoWidth));
            shot.getContext("2d").drawImage(mainVideo, 0, 0, shot.width, shot.height);
            micaBg.style.backgroundImage = `url("${shot.toDataURL("image/jpeg", 0.7)}")`;
            micaShotAt = Date.now();
        } catch (e) { /* a picture the page may not read */ }
    };
    mainVideo.addEventListener("loadeddata", captureMica);
    mainVideo.addEventListener("seeked", captureMica);
    mainVideo.addEventListener("timeupdate", () => { if (Date.now() - micaShotAt > 8000) captureMica(); });

    art.addEventListener("load", () => {
        if (!art.naturalWidth || !art.naturalHeight) return;
        // (a video without that picture gets YouTube's 120x90 stand-in: the next one then)
        if (nextYouTubeArt(art.src) && art.naturalWidth <= 120) {
            art.src = nextYouTubeArt(art.src);
            return;
        }
        art.hidden = false;
        tintFrom(art.src);
        if (art.src && micaBg) {
            micaBg.style.backgroundImage = `url("${art.src}")`;
        }
        // (YouTube Music: the frame takes the shape of what the picture really shows - a square album
        // cover stays 1:1, also when it comes inside a 4:3 / 16:9 thumbnail with black bars round it;
        // a landscape picture gets its own ratio. See .audio-art-wide in update() and --ap-art-ratio)
        const setShape = ratio => {
            const wide = ratio > 1.2;
            art.dataset.wide = wide ? "1" : "";
            // (a YouTube video, not music: its picture is always 16:9)
            if (!isMusicTrack()) return art.parentElement.style.removeProperty("--ap-art-ratio");
            art.parentElement.style.setProperty("--ap-art-ratio", wide ? ratio.toFixed(4) : "1");
            if (isMusicTrack()) art.parentElement.classList.toggle("audio-art-wide", wide);
        };
        setShape(art.naturalWidth / art.naturalHeight);
        measureArtContent(art.src, art.naturalWidth / art.naturalHeight).then(ratio => {
            if (ratio && art.complete && art.naturalWidth) setShape(ratio);
        });
        const colThumb = audioCollapsedBar?.querySelector(".audio-collapsed-thumb");
        if (colThumb && art.src) colThumb.src = art.src;
    });
    art.addEventListener("error", () => {
        if (nextYouTubeArt(art.src)) {
            art.src = nextYouTubeArt(art.src);
            return;
        }
        art.hidden = true;
        art.removeAttribute("src");
        tintFrom("");
        micaBg.style.backgroundImage = "";
        const colThumb = audioCollapsedBar?.querySelector(".audio-collapsed-thumb");
        if (colThumb) colThumb.removeAttribute("src");
    });
    let raf = 0, audioContext = null, analyser = null, sourceNode = null, samples = null, analysisTracks = [];
    let currentMusicId = null;
    let resolvedTrackTitle = "";
    const titleWrap = audioView.querySelector(".ap-title-wrap");
    const titleSpan = audioView.querySelector(".ap-title-text");
    const artistSpan = audioView.querySelector(".ap-artist");
    // (the artist · album · year line scrolls as one, like the title, when it's wider than its box)
    const artistTextSpan = audioView.querySelector(".ap-meta-line");
    const artistWrap = audioView.querySelector(".ap-meta");
    const albumSpan = audioView.querySelector(".ap-album");
    const yearSpan = audioView.querySelector(".ap-year");
    const dots = audioView.querySelectorAll(".ap-dot");
    const timelineSlot = audioView.querySelector(".ap-timeline");
    const transportSlot = audioView.querySelector(".ap-transport");
    const volumeSlot = audioView.querySelector(".ap-volume");
    // Up next (a computer's audio player): the queue's next track, a click plays it
    const nextCard = document.createElement("button");
    nextCard.type = "button";
    nextCard.className = "ap-next";
    nextCard.hidden = true;
    nextCard.innerHTML = '<span class="ap-next-cover"><img alt="" /></span><span class="ap-next-text"><small>Up next</small><b></b><span></span></span><i class="fa-solid fa-forward-step" aria-hidden="true"></i>';
    audioView.querySelector(".ap-info").append(nextCard);
    nextCard.addEventListener("click", () => {
        const step = container.querySelector(".next-track");
        if (step && !step.hidden && !step.disabled) step.click();
    });
    let nextKey = "";
    const renderUpNext = () => {
        const next = together.upNext?.() || null;
        const key = next ? `${next.id}|${next.title}|${next.channel}` : "";
        if (key === nextKey) return;
        nextKey = key;
        nextCard.hidden = !next;
        if (nextCard.parentElement?.classList.contains("audio-top-center")) nextCard.parentElement.hidden = !next;
        if (!next) return;
        nextCard.querySelector("img").src = `https://i.ytimg.com/vi/${next.id}/mqdefault.jpg`;
        nextCard.querySelector("b").textContent = next.title || (next.music ? "Next track" : "Next video");
        const sub = nextCard.querySelector(".ap-next-text > span");
        sub.textContent = next.channel || (next.by === "Autoplay" ? "Autoplay" : "");
        sub.hidden = !sub.textContent;
        nextCard.title = `Play next: ${next.title || "the next one"}`;
    };
    // The artwork's own colour: the play button and the seekbar take it (none for a picture the page
    // may not read, or no picture - they stay white)
    const tintFrom = src => {
        if (!src) return audioView.style.removeProperty("--ap-tint");
        const probe = new Image();
        probe.crossOrigin = "anonymous";
        probe.onload = () => {
            try {
                const c = document.createElement("canvas");
                c.width = c.height = 24;
                const g = c.getContext("2d", { willReadFrequently: true });
                g.drawImage(probe, 0, 0, 24, 24);
                const d = g.getImageData(0, 0, 24, 24).data;
                // (the most colourful pixels count the most - not the greys of a background)
                let r = 0, gr = 0, b = 0, w = 0;
                for (let i = 0; i < d.length; i += 4) {
                    const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
                    const weight = (max - min) / 255 + 0.02;
                    r += d[i] * weight; gr += d[i + 1] * weight; b += d[i + 2] * weight; w += weight;
                }
                r /= w; gr /= w; b /= w;
                // as hue / saturation / lightness: kept bright and colourful enough to read as a button
                const mx = Math.max(r, gr, b) / 255, mn = Math.min(r, gr, b) / 255, l = (mx + mn) / 2;
                let h = 0, s = 0;
                if (mx !== mn) {
                    const dd = mx - mn;
                    s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
                    const rr = r / 255, gg = gr / 255, bb = b / 255;
                    h = mx === rr ? (gg - bb) / dd + (gg < bb ? 6 : 0) : mx === gg ? (bb - rr) / dd + 2 : (rr - gg) / dd + 4;
                    h *= 60;
                }
                if (s < 0.12) return audioView.style.removeProperty("--ap-tint");
                audioView.style.setProperty("--ap-tint", `hsl(${Math.round(h)} ${Math.round(Math.max(55, Math.min(90, s * 100)))}% 72%)`);
            } catch (e) {
                audioView.style.removeProperty("--ap-tint");
            }
        };
        probe.onerror = () => audioView.style.removeProperty("--ap-tint");
        probe.src = src;
    };
    const actionsSlot = audioView.querySelector(".ap-actions");
    const timelineContainer = container.querySelector(".timeline-container");
    const timelineParent = timelineContainer?.parentElement;
    const centerControls = container.querySelector(".player-center-controls");
    const centerControlsParent = centerControls?.parentElement;
    const volumeGroup = container.querySelector(".volume-group");
    const volumeParent = volumeGroup?.parentElement;
    const saveWrap = container.querySelector(".player-save-wrap");
    const saveParent = saveWrap?.parentElement;
    const moreContent = container.querySelector(".video-controls .more-content");
    const moreParent = moreContent?.parentElement;
    const topSearch = container.querySelector(".player-search-btn");
    const topSearchParent = topSearch?.parentElement;
    const topRoom = container.querySelector(".share-help-btn");
    const topRoomParent = topRoom?.parentElement;
    const topHome = container.querySelector(".player-home");
    const topHomeParent = topHome?.parentElement;
    const shuffleButton = container.querySelector(".shuffle-btn");
    const shuffleParent = shuffleButton?.parentElement;
    const pipButton = container.querySelector(".pic-in-pic");
    const pipParent = pipButton?.parentElement;

    const placeAudioSave = () => {
        if (!saveWrap) return;
        if (actionsSlot) moveAudioEl(saveWrap, actionsSlot);
    };

    let repeatButton = container.querySelector(".repeat-btn");
    if (!repeatButton) {
        repeatButton = document.createElement("button");
        repeatButton.type = "button";
        repeatButton.className = "repeat-btn";
        repeatButton.setAttribute("title", "Repeat (Loop)");
        repeatButton.setAttribute("aria-label", "Repeat");
        repeatButton.innerHTML = '<i class="fa-solid fa-repeat"></i>';
        repeatButton.addEventListener("click", () => {
            mainVideo.loop = !mainVideo.loop;
            repeatButton.classList.toggle("active", mainVideo.loop);
            repeatButton.setAttribute("aria-pressed", String(mainVideo.loop));
            showToast(mainVideo.loop ? "Repeat: On" : "Repeat: Off");
        });
    }

    let audioCollapsedBar = container.querySelector(".audio-collapsed-bar");
    if (!audioCollapsedBar) {
        audioCollapsedBar = document.createElement("div");
        audioCollapsedBar.className = "audio-collapsed-bar";
        audioCollapsedBar.setAttribute("role", "button");
        audioCollapsedBar.setAttribute("aria-label", "Return to music player");
        audioCollapsedBar.innerHTML = `
          <div class="audio-collapsed-info">
            <img class="audio-collapsed-thumb" alt="" />
            <span class="audio-collapsed-icon" aria-hidden="true" hidden><i class="fa-solid fa-music"></i></span>
            <div class="audio-collapsed-text">
              <span class="audio-collapsed-title"></span>
              <span class="audio-collapsed-artist"></span>
            </div>
          </div>
          <div class="audio-collapsed-controls">
            <button type="button" class="audio-collapsed-play" aria-label="Play or Pause"><i class="fas fa-play"></i></button>
            <button type="button" class="audio-collapsed-next" aria-label="Next track" title="Next track"><i class="fa-solid fa-forward-step"></i></button>
            <button type="button" class="audio-collapsed-expand" aria-label="Return to music player"><i class="fa-solid fa-chevron-down"></i></button>
          </div>
        `;
        container.append(audioCollapsedBar);
        // (the seekbar along its bottom border)
        makeSeekLine(audioCollapsedBar);

        // A swipe along it (a finger): right to left, the next track; left to right, the previous one -
        // as on the open player's artwork. The tap that ends a swipe doesn't close the sheet.
        let stripTouch = null, stripSwiped = 0;
        audioCollapsedBar.addEventListener("pointerdown", e => {
            stripTouch = e.pointerType === "touch" && !e.target.closest(".seek-line") ? { x: e.clientX, y: e.clientY } : null;
        });
        audioCollapsedBar.addEventListener("pointercancel", () => stripTouch = null);
        audioCollapsedBar.addEventListener("pointerup", e => {
            if (!stripTouch) return;
            const dx = e.clientX - stripTouch.x, dy = e.clientY - stripTouch.y;
            stripTouch = null;
            if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            stripSwiped = Date.now();
            const next = dx < 0;
            const step = container.querySelector(next ? ".next-track" : ".prev-track");
            if (step && !step.hidden && !step.disabled) {
                step.click();
                audioCollapsedBar.querySelector(".audio-collapsed-info")?.animate(
                    [{ translate: `${next ? -28 : 28}px 0`, opacity: 0.35 }, { translate: "0 0", opacity: 1 }], { duration: 260, easing: "ease-out" });
            } else showFeedback(next ? "fa-forward-step" : "fa-backward-step", next ? "Nothing after this" : "Nothing before this");
        });
        audioCollapsedBar.addEventListener("click", e => {
            if (Date.now() - stripSwiped < 500) {
                e.stopPropagation();
                return;
            }
            if (e.target.closest(".audio-collapsed-play")) {
                e.stopPropagation();
                togglePlay();
                return;
            }
            // (the player's own Next: the queue's or the playlist's next track)
            if (e.target.closest(".audio-collapsed-next")) {
                e.stopPropagation();
                const next = container.querySelector(".next-track");
                if (next && !next.hidden && !next.disabled) next.click();
                return;
            }
            // (the panel slides back down into its tab bar: room.js)
            if (together.setAudioExtended) together.setAudioExtended(false);
            else playerPage.classList.remove("mobile-audio-extended");
        });
    }

    // One line that scrolls sideways when it doesn't fit (the title; the artist · album · year line).
    // update() calls this every second: it starts over only when the text or the room for it changed,
    // so a long title keeps scrolling instead of jumping back to its start.
    const fitAudioMarquee = (wrapEl, textEl) => {
        if (!wrapEl || !textEl) return;
        const key = `${textEl.textContent}|${wrapEl.clientWidth}`;
        if (textEl._marqueeKey === key) return;
        textEl._marqueeKey = key;
        if (textEl._marqueeAnim) {
            textEl._marqueeAnim.cancel();
            textEl._marqueeAnim = null;
        }
        textEl.style.transform = "none";
        const overflow = textEl.scrollWidth - wrapEl.clientWidth;
        // (style.css fades the line's ends while it scrolls; with reduced motion it's cut off with "…")
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        wrapEl.classList.toggle("is-scrolling", overflow > 4 && !still);
        if (overflow > 4 && wrapEl.clientWidth > 0 && !still) {
            const shift = overflow + 24;
            textEl._marqueeAnim = textEl.animate([
                { transform: "translateX(0px)", offset: 0 },
                { transform: "translateX(0px)", offset: 0.18 },
                { transform: `translateX(-${shift}px)`, offset: 0.78 },
                { transform: `translateX(-${shift}px)`, offset: 0.9 },
                { transform: "translateX(0px)", offset: 1 }
            ], {
                duration: Math.max(7000, shift * 70),
                iterations: Infinity,
                easing: "ease-in-out"
            });
        } else if (!wrapEl.clientWidth) {
            // (measured while hidden: try again next time)
            textEl._marqueeKey = "";
        }
    };
    const showMeta = on => {
        if (!artistWrap) return;
        artistWrap.hidden = !on;
        if (on) requestAnimationFrame(() => fitAudioMarquee(artistWrap, artistTextSpan));
        else if (artistTextSpan?._marqueeAnim) {
            artistTextSpan._marqueeAnim.cancel();
            artistTextSpan._marqueeAnim = null;
            artistTextSpan._marqueeKey = "";
        }
    };

    let audioCorner = playerPage.querySelector(".audio-corner-actions");
    if (!audioCorner) {
        audioCorner = document.createElement("div");
        audioCorner.className = "audio-corner-actions";
        audioCorner.setAttribute("aria-label", "Audio player navigation");
        playerPage.append(audioCorner);
    }
    let audioBrand = playerPage.querySelector(".audio-player-brand");
    if (!audioBrand) {
        audioBrand = document.createElement("div");
        audioBrand.className = "audio-player-brand";
        audioBrand.innerHTML = '<button type="button" class="audio-brand-button" aria-label="Back to home"><img src="logo.svg" alt="" /><span>CineTab</span></button>';
        playerPage.append(audioBrand);
        audioBrand.querySelector(".audio-brand-button")?.addEventListener("click", () => {
            container.querySelector(".player-home")?.click();
        });
    }
    // A-PC, the top row: Up next in its middle, between the brand and the buttons at the top right
    // (back at the bottom of the details column when that row is too narrow for it). The volume is
    // a button among those at the top right - its slider shows while it's pointed at.
    // The Queue button there brings the side panel back once it's been hidden.
    const topVolume = document.createElement("div");
    topVolume.className = "audio-top-center";
    topVolume.hidden = true;
    playerPage.append(topVolume);
    const queueOpen = document.createElement("button");
    queueOpen.type = "button";
    queueOpen.className = "audio-queue-btn";
    queueOpen.title = "Show the queue";
    queueOpen.setAttribute("aria-label", "Show the queue");
    queueOpen.innerHTML = '<i class="fa-solid fa-list-ul"></i>';
    queueOpen.addEventListener("click", () => {
        // (a narrow window: the details are the sheet from below - its Queue tab opens it)
        if (matchMedia("(max-width: 900px)").matches) return playerPage.querySelector('.room-tab-btn[data-tab="queue"]')?.click();
        together.openQueue?.();
    });
    // (with a mouse, at any width: the narrow window's player has the same top row)
    const pcAudio = matchMedia("(hover: hover) and (pointer: fine)");
    const placeTopVolume = () => {
        const on = container.classList.contains("audio-mode-only") && !playerPage.hidden;
        if (!on) {
            topVolume.hidden = true;
            return;
        }
        // the volume and Queue: at the top right on a computer, under the controls elsewhere
        if (volumeGroup) {
            if (pcAudio.matches) {
                if (volumeGroup.parentElement !== audioCorner) audioCorner.prepend(volumeGroup);
            } else if (volumeGroup.parentElement !== volumeSlot) volumeSlot.append(volumeGroup);
        }
        if (queueOpen.parentElement !== audioCorner) audioCorner.prepend(queueOpen);
        const page = playerPage.getBoundingClientRect();
        const corner = audioCorner.getBoundingClientRect();
        const brand = audioBrand.getBoundingClientRect();
        const left = brand.width ? brand.right : page.left;
        const fits = pcAudio.matches && corner.width > 0 && corner.left - left >= 340;
        const info = audioView.querySelector(".ap-info");
        if (!fits) {
            topVolume.hidden = true;
            if (nextCard.parentElement !== info) info.append(nextCard);
            return;
        }
        if (nextCard.parentElement !== topVolume) topVolume.append(nextCard);
        topVolume.hidden = nextCard.hidden;
        topVolume.style.left = `${Math.round((left + corner.left) / 2 - page.left)}px`;
        topVolume.style.top = `${Math.round(corner.top + corner.height / 2 - page.top)}px`;
        topVolume.style.maxWidth = `${Math.round(corner.left - left - 32)}px`;
    };
    new ResizeObserver(() => placeTopVolume()).observe(playerPage);
    new ResizeObserver(() => placeTopVolume()).observe(audioCorner);
    new ResizeObserver(() => placeTopVolume()).observe(audioView);

    const cleanTrackTitle = raw => {
        if (!raw) return "";
        return raw
            .replace(/\s*-\s*Topic$/i, "")
            .replace(/\s*\[(?:Official\s*)?(?:Music\s*)?(?:Video|Audio|Lyric\s*Video|HD|4K|Visualizer|Audio\s*Track)[^\]]*\]/gi, "")
            .replace(/\s*\((?:Official\s*)?(?:Music\s*)?(?:Video|Audio|Lyric\s*Video|HD|4K|Visualizer|Audio\s*Track)[^)]*\)/gi, "")
            .replace(/\s*\|\s*(?:Official\s*)?(?:Music\s*)?(?:Video|Audio|Visualizer)[^|]*$/gi, "")
            .replace(/\s+-\s+topic$/i, "")
            .trim();
    };

    // "Artist - Title" (or – or —): YouTube Music shows the artist on its own line, so the title
    // drops it when it starts with it
    const TITLE_SEP = /\s[-–—]\s/;
    let musicArtist = "";
    const withoutArtist = text => {
        if (!text || !musicArtist) return text;
        const name = musicArtist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rest = text.replace(new RegExp(`^${name}\\s*[-–—:|]\\s*`, "i"), "").trim();
        return rest || text;
    };
    const renderMetaUI = (artist = "", album = "", year = "") => {
        const cleanArtist = (artist || "YouTube Music").replace(/\s*-\s*Topic$/i, "").trim();
        musicArtist = /^YouTube( Music)?$/i.test(cleanArtist) ? "" : cleanArtist;
        // (the title shown so far may still start with the artist, now known)
        if (isMusicTrack() && resolvedTrackTitle && withoutArtist(resolvedTrackTitle) !== resolvedTrackTitle) {
            resolvedTrackTitle = withoutArtist(resolvedTrackTitle);
            if (titleSpan) titleSpan.textContent = resolvedTrackTitle;
            const colTitle = audioCollapsedBar?.querySelector(".audio-collapsed-title");
            if (colTitle) colTitle.textContent = resolvedTrackTitle;
            requestAnimationFrame(() => fitAudioMarquee(titleWrap, titleSpan));
        }
        if (artistSpan) artistSpan.textContent = cleanArtist;
        if (albumSpan) {
            albumSpan.textContent = album;
            albumSpan.hidden = !album;
        }
        if (yearSpan) {
            yearSpan.textContent = year;
            yearSpan.hidden = !year;
        }
        if (dots[0]) dots[0].hidden = !cleanArtist || !album;
        if (dots[1]) dots[1].hidden = !year || (!album && !cleanArtist);

        const colArtist = audioCollapsedBar?.querySelector(".audio-collapsed-artist");
        if (colArtist) colArtist.textContent = cleanArtist;

        const isYTMusic = isMusicTrack();
        showMeta(isYTMusic);
    };

    // The best iTunes result for a track: the same song name (not a live / karaoke / remix / cover
    // version unless the title says so), by the same artist. None good enough: null - the
    // YouTube picture stays rather than another album's cover.
    const bestITunesMatch = (results, title, artist) => {
        const norm = t => (t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
            .replace(/\s*[([].*?[)\]]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
        const want = norm(title), who = norm(artist);
        const variant = /\b(live|karaoke|tribute|remix|instrumental|cover|acoustic|sped up|slowed|8d|version)\b/i;
        const titleIsVariant = variant.test(title || "");
        let best = null, bestScore = 0;
        for (const item of results || []) {
            const name = norm(item.trackName), by = norm(item.artistName);
            let score = 0;
            if (name && want && name === want) score += 4;
            else if (name && want && (want.includes(name) || name.includes(want))) score += 2;
            else continue;
            if (who && by && (by === who || by.includes(who) || who.includes(by))) score += 3;
            if (!titleIsVariant && variant.test(`${item.trackName} ${item.collectionName}`)) score -= 3;
            if (/compilation|greatest hits|best of|hits/i.test(item.collectionName || "")) score -= 1;
            if (score > bestScore) { best = item; bestScore = score; }
        }
        return bestScore >= 4 ? best : null;
    };
    // A channel name that isn't really the artist: none, YouTube's own, or a label's "…VEVO" channel
    // (the "Artist - Title" title, or the album lookup, then says who it is)
    const weakArtist = name => !name || /^YouTube( Music)?$/i.test(name) || /vevo$/i.test(name);
    const fetchYouTubeMusicMeta = async (id, initialMeta = {}) => {
        if (!id) return;
        const setResolvedTitle = value => {
            if (!value || id !== currentMusicId) return;
            const t = withoutArtist(cleanTrackTitle(value));
            resolvedTrackTitle = t;
            if (titleSpan) titleSpan.textContent = t;
            requestAnimationFrame(() => fitAudioMarquee(titleWrap, titleSpan));
            const colTitle = audioCollapsedBar?.querySelector(".audio-collapsed-title");
            if (colTitle) colTitle.textContent = t;
        };

        if (id === currentMusicId) {
            const incomingTitle = cleanTrackTitle(initialMeta.title || "");
            if (incomingTitle && (!resolvedTrackTitle || resolvedTrackTitle !== incomingTitle)) {
                setResolvedTitle(incomingTitle);
            }
            const incomingArtist = (initialMeta.artist || initialMeta.channel || "").replace(/\s*-\s*Topic$/i, "").trim();
            if (incomingArtist && (!artistSpan?.textContent || artistSpan.textContent === "YouTube Music")) {
                renderMetaUI(incomingArtist, albumSpan?.textContent, yearSpan?.textContent);
            }
            return;
        }

        resolvedTrackTitle = "";
        currentMusicId = id;

        let artist = (initialMeta.artist || initialMeta.channel || "").replace(/\s*-\s*Topic$/i, "").trim();
        let album = initialMeta.album || "";
        let year = initialMeta.year || "";
        // (only this track's own title - not the player's title line, which still shows the
        // previous track for a moment: its "Artist - Title" became this track's artist and song,
        // and the album lookup found the previous song's cover. YouTube's own data fills it in.)
        let title = cleanTrackTitle(initialMeta.title || "");

        if (weakArtist(artist) && TITLE_SEP.test(title)) {
            const parts = title.split(TITLE_SEP);
            artist = parts[0].trim();
            title = cleanTrackTitle(parts.slice(1).join(" - ").trim());
        }
        if (!year && initialMeta.ago) {
            const ym = initialMeta.ago.match(/\b(19\d\d|20\d\d)\b/);
            if (ym) year = ym[1];
        }

        if (title) setResolvedTitle(title);
        renderMetaUI(artist || "YouTube Music", album, year);

        // (search results' thumbnails are 4:3 with black bars: YouTube's 16:9 picture instead)
        const immediateArt = initialMeta.artwork || youTubeArt(id);
        if (immediateArt) {
            art.hidden = false;
            art.src = immediateArt;
            // (the key update() compares with, so it doesn't load the picture again)
            art.dataset.src = youTubeArt(id);
            if (micaBg) micaBg.style.backgroundImage = `url("${immediateArt}")`;
        }

        try {
            try {
                const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(2500) });
                if (res.ok) {
                    const data = await res.json();
                    if (data && id === currentMusicId) {
                        if (data.author_name && weakArtist(artist)) {
                            artist = data.author_name.replace(/\s*-\s*Topic$/i, "").trim();
                        }
                        if (data.title) {
                            setResolvedTitle(data.title);
                            // (a pasted link starts without its title: the album search below needs it)
                            const known = cleanTrackTitle(data.title);
                            if (!title || title === "YouTube video" || title === "YouTube") {
                                title = known;
                                if (TITLE_SEP.test(known) && weakArtist(artist)) {
                                    const parts = known.split(TITLE_SEP);
                                    artist = parts[0].trim();
                                    title = cleanTrackTitle(parts.slice(1).join(" - ").trim());
                                }
                            }
                        }
                        renderMetaUI(artist || "YouTube Music", album, year);
                    }
                }
            } catch (e) {}

            // Fast commercial-music lookup: iTunes supplies reliable artist, album,
            // release year, and high-resolution cover art for most YouTube Music tracks.
            if (id === currentMusicId && title && (!album || !year || weakArtist(artist))) {
                try {
                    const cleanTitle = title
                        .replace(/\s*\((?:official|lyric|audio|video|music|4k|hd)[^)]*\)/gi, "")
                        .replace(/\s*[\[(](?:official|lyric|audio|video|music)[\])]$/gi, "")
                        .replace(/\s+-\s+topic$/i, "")
                        .trim();
                    const term = `${!weakArtist(artist) ? `${artist} ` : ""}${cleanTitle}`;
                    const res = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=15&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(3500) });
                    if (res.ok) {
                        const data = await res.json();
                        const results = data.results || [];
                        const match = bestITunesMatch(results, cleanTitle, artist && !/^YouTube( Music)?$/.test(artist) ? artist : "");
                        if (match && id === currentMusicId) {
                            artist = match.artistName || artist;
                            album = album || match.collectionName || "";
                            year = year || (match.releaseDate || "").slice(0, 4);
                            if (match.artworkUrl100) {
                                const artwork = match.artworkUrl100.replace(/\/\d+x\d+bb\.jpg/, "/600x600bb.jpg");
                                art.hidden = false;
                                art.src = artwork;
                                art.dataset.src = youTubeArt(id);
                                micaBg.style.backgroundImage = `url("${artwork}")`;
                            }
                            renderMetaUI(artist || "YouTube Music", album, year);
                        }
                    }
                } catch (e) {}
            }

            const apis = [
                `https://pipedapi.kavin.rocks/streams/${encodeURIComponent(id)}`,
                `https://api.piped.privacydev.net/streams/${encodeURIComponent(id)}`,
                `https://piped-api.lunar.icu/streams/${encodeURIComponent(id)}`
            ];
            for (const url of apis) {
                try {
                    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (data && id === currentMusicId) {
                        if (data.uploader && weakArtist(artist)) {
                            artist = data.uploader.replace(/\s*-\s*Topic$/i, "").trim();
                        }
                        if (data.title) setResolvedTitle(data.title);
                        if (data.musicInfo?.artist) artist = data.musicInfo.artist;
                        if (data.musicInfo?.album) album = data.musicInfo.album;
                        if (data.album) album = data.album;
                        if (!year && data.uploadDate) {
                            const ym = data.uploadDate.match(/\b(19\d\d|20\d\d)\b/);
                            if (ym) year = ym[1];
                        }
                        if (!album && data.description) {
                            const albMatch = data.description.match(/(?:^|\n\n)([^\n·℗\r]+)\r?\n\r?\n℗/);
                            if (albMatch && albMatch[1].trim().length < 60) album = albMatch[1].trim();
                        }
                        if (!year && data.description) {
                            const ym = data.description.match(/(?:Released on:\s*|℗\s*|(?:^|\s))((?:19|20)\d\d)/i);
                            if (ym) year = ym[1];
                        }
                        renderMetaUI(artist || "YouTube Music", album, year);
                        break;
                    }
                } catch (e) {}
            }

            if (together.solo?.details) {
                try {
                    const details = await together.solo.details(id);
                    if (details && id === currentMusicId) {
                        if (weakArtist(artist)) {
                            artist = (details.channel || "").replace(/\s*-\s*Topic$/i, "").trim();
                        }
                        if (details.title) setResolvedTitle(details.title);
                        renderMetaUI(artist || "YouTube Music", album, year);
                    }
                } catch (e) {}
            }

            if (id === currentMusicId && together.solo?.fullDescription) {
                try {
                    const description = await together.solo.fullDescription(id);
                    if (description && id === currentMusicId) {
                        const released = description.match(/(?:released on|release date|℗)\s*:?\s*((?:19|20)\d{2}(?:-\d{1,2}-\d{1,2})?|(?:19|20)\d{2})/i);
                        if (!year && released) year = released[1].match(/(?:19|20)\d{2}/)?.[0] || "";

                        const byLine = description.match(/(?:provided to youtube by|released on)\s+([^\n]+)/i);
                        if (weakArtist(artist)) {
                            const provider = byLine?.[1]?.match(/(?:by\s+)?(.+?)(?:\n|$)/i)?.[1];
                            if (provider) artist = provider.replace(/\s*,\s*(?:under exclusive license|distributed by).*$/i, "").trim();
                        }

                        const supplied = description.match(/(?:provided to youtube by\s+)[^\n]+\n([^\n]+)/i);
                        if (!album && supplied?.[1] && supplied[1].length < 80) album = supplied[1].trim();

                        renderMetaUI(artist || "YouTube Music", album, year);
                    }
                } catch (e) {}
            }

            if (id === currentMusicId && (!album || !year)) {
                try {
                    const cleanTitle = title
                        .replace(/\s*\((?:official|lyric|audio|video|music|4k|hd)[^)]*\)/gi, "")
                        .replace(/\s*[\[(](?:official|lyric|audio|video|music)[\])]$/gi, "")
                        .replace(/\s+-\s+topic$/i, "")
                        .trim();
                    const term = `${!weakArtist(artist) ? `${artist} ` : ""}${cleanTitle}`;
                    const res = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=15&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(3500) });
                    if (res.ok) {
                        const data = await res.json();
                        const results = data.results || [];
                        const match = bestITunesMatch(results, cleanTitle, artist && !/^YouTube( Music)?$/.test(artist) ? artist : "");
                        if (match && id === currentMusicId) {
                            if (weakArtist(artist)) artist = match.artistName || artist;
                            if (!album) album = match.collectionName || "";
                            if (!year && match.releaseDate) year = match.releaseDate.slice(0, 4);
                            renderMetaUI(artist || "YouTube Music", album, year);
                        }
                    }
                } catch (e) {}
            }

            if (id === currentMusicId && (!album || !year)) {
                try {
                    const cleanTitle = title
                        .replace(/\s*\((?:official|lyric|audio|video|music|4k|hd)[^)]*\)/gi, "")
                        .replace(/\s+-\s+topic$/i, "")
                        .trim();
                    const query = new URLSearchParams({
                        query: `recording:"${cleanTitle}"${!weakArtist(artist) ? ` AND artist:"${artist}"` : ""}`,
                        fmt: "json",
                        limit: "5"
                    });
                    const res = await fetch(`https://musicbrainz.org/ws/2/recording/?${query}`, {
                        signal: AbortSignal.timeout(4000),
                        headers: { Accept: "application/json" }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const recording = (data.recordings || []).find(item => {
                            const name = (item["artist-credit"] || []).map(credit => credit.name || "").join(" ").toLowerCase();
                            return !artist || artist === "YouTube Music" || name.includes(artist.toLowerCase()) || artist.toLowerCase().includes(name);
                        }) || (data.recordings || [])[0];
                        if (recording && id === currentMusicId) {
                            if (weakArtist(artist)) {
                                artist = (recording["artist-credit"] || []).map(credit => credit.name || "").filter(Boolean).join(" & ");
                            }
                            if (!year) {
                                year = (recording["first-release-date"] || "").match(/(?:19|20)\d{2}/)?.[0] || "";
                            }
                            if (!album) {
                                album = (recording.releases || []).find(release => release.title)?.title || "";
                            }
                            renderMetaUI(artist || "YouTube Music", album, year);
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}
    };

    // A local file is audio when its type says so, or - for files without a useful type - once
    // the browser has read *this* file's metadata and found no picture. Before that, videoWidth
    // is 0 for every file, so it can't be used to decide.
    let metadataFile = null;
    const isLocalAudio = () => !!(currentFile && !container.classList.contains("youtube") && (
        currentFile.type?.startsWith("audio/") ||
        (metadataFile === currentFile && mainVideo.readyState >= 1 && !mainVideo.videoWidth)
    ));
    // Audio mode the player switched on by itself (music, or a local audio file), as opposed to the
    // listener choosing it; only the automatic kind is switched off again when a video comes next.
    let autoAudio = false;
    // The mode the listener picked with the switch: it holds for every next video too, until they
    // pick the other one (music and audio files are audio regardless)
    let preferAudio = false;
    let queueOpenedForAudio = false;
    let lastAudioExit = null;
    let hiddenBeforeAudio = {};
    const isMusicTrack = () => !!(
        container.classList.contains("youtube") &&
        (together.solo?.ref?.music ||
            together.solo?.meta?.music ||
            together.roomYouTube?.()?.video?.music ||
            (window.CineQueue?.getCurrent?.()?.music) ||
            container.dataset.musicTrack === "true" ||
            window._isYouTubeMusicActive)
    );
    const sourceExists = () => !!(container.classList.contains("youtube") && youTubeIdShown() || currentFile || together.stream);
    const titleText = () => (resolvedTrackTitle || cleanTrackTitle(videoTitle?.textContent) || cleanTrackTitle(audioTitle?.textContent) || (currentFile ? currentFile.name.replace(/\.[a-z0-9]+$/i, "") : "")).trim();
    const update = () => {
        const musicLocked = isMusicTrack();
        const localAudio = isLocalAudio();
        const visible = sourceExists();
        if (!visible && container.classList.contains("audio-mode-only")) {
            autoAudio = false;
            setAudioMode(false);
        }
        if ((musicLocked || localAudio) && !container.classList.contains("audio-mode-only")) {
            setAudioMode(true);
            autoAudio = true;
        } else if (preferAudio && visible && !container.classList.contains("audio-mode-only")) {
            // (a new video, while the listener chose audio: it plays in audio too)
            setAudioMode(true);
            autoAudio = false;
        } else if (autoAudio && !preferAudio && !musicLocked && !localAudio && container.classList.contains("audio-mode-only")) {
            // The music or audio file was replaced by a video: back to the video view
            autoAudio = false;
            setAudioMode(false);
        }
        // Music and local audio files play in audio mode only, but the switch itself stays
        // visible: Video is greyed out while Audio stays active.
        const audioOnly = musicLocked || localAudio;
        audioButton.hidden = !visible;
        miniButton.hidden = !visible || !homePage || container.classList.contains("audio-mode-only");
        const audioActive = container.classList.contains("audio-mode-only");
        audioButton.setAttribute("aria-pressed", String(audioActive));
        audioButton.setAttribute("aria-disabled", String(audioOnly));
        audioButton.setAttribute("aria-label", audioOnly ? "Audio mode (this track has no video)" : audioActive ? "Switch to video mode" : "Switch to audio mode");
        audioButton.title = audioOnly ? "This track plays in audio mode only" : audioActive ? "Switch to video mode (A)" : "Switch to audio mode (A)";
        const videoChoice = audioButton.querySelector(".video-choice");
        const audioChoice = audioButton.querySelector(".audio-choice");
        videoChoice?.classList.toggle("active", !audioActive && !audioOnly);
        videoChoice?.classList.toggle("inactive", audioOnly);
        audioChoice?.classList.toggle("active", audioActive || audioOnly);
        const curTitle = titleText();
        if (titleSpan && titleSpan.textContent !== curTitle) titleSpan.textContent = curTitle;
        requestAnimationFrame(() => fitAudioMarquee(titleWrap, titleSpan));

        const isYTMusic = isMusicTrack();
        container.classList.toggle("is-yt-music", isYTMusic);
        renderUpNext();
        playerPage.classList.toggle("is-yt-music", isYTMusic);

        showMeta(isYTMusic);

        const colTitle = audioCollapsedBar?.querySelector(".audio-collapsed-title");
        if (colTitle) colTitle.textContent = curTitle;
        const colThumb = audioCollapsedBar?.querySelector(".audio-collapsed-thumb");
        if (colThumb && art.src) colThumb.src = art.src;
        // (Next as the player's: dimmed when there's nothing after this track)
        const colNext = audioCollapsedBar?.querySelector(".audio-collapsed-next");
        const playerNext = container.querySelector(".next-track");
        if (colNext) colNext.disabled = !playerNext || playerNext.hidden || playerNext.disabled;
        const colPlayIcon = audioCollapsedBar?.querySelector(".audio-collapsed-play i");
        if (colPlayIcon) {
            const playing = !mediaPaused();
            colPlayIcon.className = playing ? "fas fa-pause" : "fas fa-play";
        }

        // Equalizer for online video removed; show ONLY for local audio file!
        canvas.hidden = !localAudio;

        const id = youTubeIdShown();
        // The artwork's frame: 16:9 for a YouTube video's picture, square for music and files.
        // (The image fills it - YouTube's 4:3 thumbnails have black bars that this crops off.)
        const hasVisualVideo = !!(currentFile || together.stream);
        // (a video file's or a shared screen's own frame is a picture too: 16:9 as well)
        art.parentElement.classList.toggle("audio-art-wide", id ? !musicLocked || art.dataset.wide === "1" : hasVisualVideo && !localAudio);
        const image = id ? youTubeArt(id) : "";
        const sourceKey = image || (currentFile ? `local:${currentFile.name}:${currentFile.size}` : together.stream ? "room-stream" : "");
        // (no picture of its own - a local file, a shared screen: an icon in the frame instead, a
        // video camera for a video, a note for audio)
        artIcon.className = `fa-solid ${!id && hasVisualVideo && !localAudio ? "fa-video" : "fa-music"}`;
        if (art.dataset.src !== sourceKey) {
            art.dataset.src = sourceKey;
            if (image) {
                art.src = image;
                micaBg.style.backgroundImage = `url("${image}")`;
            } else {
                art.removeAttribute("src");
                // the panels' mica: the video's own picture (taken again as it plays), or for audio
                // the artwork placeholder's colours
                micaBg.style.backgroundImage = localAudio ? LOCAL_AUDIO_MICA : "";
                if (hasVisualVideo && !localAudio) captureMica();
            }
            art.hidden = !art.getAttribute("src");
            if (art.hidden) tintFrom("");
        } else if (!image && localAudio && micaBg.style.backgroundImage !== LOCAL_AUDIO_MICA) {
            micaBg.style.backgroundImage = LOCAL_AUDIO_MICA;
        }
        {
            const thumb = audioCollapsedBar?.querySelector(".audio-collapsed-thumb");
            const icon = audioCollapsedBar?.querySelector(".audio-collapsed-icon");
            const hasArt = !art.hidden && !!art.getAttribute("src");
            if (thumb) thumb.hidden = !hasArt;
            if (icon) {
                icon.hidden = hasArt;
                icon.firstElementChild.className = artIcon.className;
            }
        }

        // Album artwork and details are looked up for YouTube Music only: a YouTube video keeps its
        // own (16:9) picture and title, also in audio mode
        if (!musicLocked && currentMusicId) {
            currentMusicId = null;
            resolvedTrackTitle = "";
        }
        if (id && musicLocked && container.classList.contains("audio-mode-only")) {
            // (only what's known about *this* track: while the next one loads, YouTube's player still
            // reports the one before - its title and channel had the album lookup find the
            // previous song's cover and details)
            const roomRaw = together.roomYouTube?.();
            const roomNow = roomRaw?.video && (!roomRaw.video.id || roomRaw.video.id === id) ? roomRaw : null;
            const soloRaw = together.solo?.current?.video;
            const soloNow = soloRaw && soloRaw.id === id ? soloRaw : null;
            fetchYouTubeMusicMeta(id, {
                ...(together.solo?.meta || {}),
                ...(soloNow ? { title: soloNow.title, channel: soloNow.channel } : {}),
                ...(roomNow?.video ? { title: roomNow.video.title, channel: roomNow.video.channel, music: true } : {})
            });
        } else if (localAudio && currentFile) {
            renderMetaUI("Local Audio", currentFile.name, "");
        } else if (id) {
            const meta = together.solo?.meta || {};
            if (!artistSpan.textContent || artistSpan.textContent === "YouTube") {
                renderMetaUI(meta.channel || "YouTube", "", "");
            }
        }
    };
    const setupAnalyser = () => {
        if (!isLocalAudio()) return;
        if (analyser || !mainVideo.captureStream) return;
        try {
            audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
            const captured = mainVideo.captureStream();
            analysisTracks = captured.getAudioTracks().map(track => track.clone());
            if (!analysisTracks.length) {
                captured.addEventListener("addtrack", () => { if (!analyser) setupAnalyser(); }, { once: true });
                return;
            }
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
            sourceNode = audioContext.createMediaStreamSource(new MediaStream(analysisTracks));
            sourceNode.connect(analyser);
            samples = new Uint8Array(analyser.frequencyBinCount);
            audioContext.resume().catch(() => {});
        } catch (e) { analyser = null; }
    };
    mainVideo.addEventListener("loadedmetadata", () => {
        metadataFile = currentFile;
        update();
        if (!analyser) return;
        sourceNode?.disconnect();
        analysisTracks.forEach(track => track.stop());
        analysisTracks = [];
        analyser = sourceNode = samples = null;
        if (container.classList.contains("audio-mode-only") && isLocalAudio()) setupAnalyser();
    });
    mainVideo.addEventListener("playing", () => {
        if (!container.classList.contains("audio-mode-only") || !isLocalAudio()) return;
        if (!analyser) setupAnalyser();
        audioContext?.resume().catch(() => {});
        if (!raf) raf = requestAnimationFrame(draw);
    });
    const draw = now => {
        if (!container.classList.contains("audio-mode-only") || !isLocalAudio()) {
            raf = 0;
            return;
        }
        const box = canvas.getBoundingClientRect();
        const scale = devicePixelRatio || 1;
        if (canvas.width !== Math.round(box.width * scale) || canvas.height !== Math.round(box.height * scale)) {
            canvas.width = Math.max(1, Math.round(box.width * scale));
            canvas.height = Math.max(1, Math.round(box.height * scale));
        }
        const w = canvas.width, h = canvas.height;
        context.clearRect(0, 0, w, h);
        if (analyser && samples) analyser.getByteFrequencyData(samples);
        const bars = 42;
        const gap = Math.max(3 * scale, w * .012), barW = (w - gap * (bars - 1)) / bars;
        const paused = together.solo?.active ? together.solo.paused : mediaPaused();
        for (let i = 0; i < bars; i++) {
            // (the lower two thirds of the spectrum - the top of it is nearly always silent)
            const sample = analyser && samples && !paused ? samples[Math.floor(i / bars * samples.length * 0.68)] / 255 : 0;
            const height = Math.max(3 * scale, sample * h * .78);
            const x = i * (barW + gap), y = (h - height) / 2;
            const gradient = context.createLinearGradient(0, y, 0, y + height);
            gradient.addColorStop(0, "rgba(103, 187, 255, .95)");
            gradient.addColorStop(1, "rgba(151, 110, 255, .58)");
            context.fillStyle = gradient;
            context.beginPath();
            context.roundRect(x, y, Math.max(1, barW), Math.max(1, height), Math.max(0, Math.min(barW / 2, 5 * scale)));
            context.fill();
        }
        raf = requestAnimationFrame(draw);
    };
    const audioPlaceholders = new Map();
    const moveAudioEl = (el, target) => {
        if (!el || !target) return;
        if (!audioPlaceholders.has(el)) {
            const ph = document.createComment("cine-audio-ph");
            el.parentNode?.insertBefore(ph, el);
            audioPlaceholders.set(el, ph);
        }
        target.append(el);
    };
    const restoreAudioEl = (el, fallbackParent) => {
        if (!el) return;
        const ph = audioPlaceholders.get(el);
        if (ph && ph.parentNode) {
            ph.parentNode.insertBefore(el, ph);
            ph.remove();
            audioPlaceholders.delete(el);
        } else if (fallbackParent) {
            fallbackParent.append(el);
        }
    };
    const setAudioMode = active => {
        const on = !!active;
        if ((isMusicTrack() || isLocalAudio()) && !on) return; // Music and local audio have no video view
        if (container.classList.contains("audio-mode-only") === on) return;
        container.classList.toggle("audio-mode-only", on);
        playerPage.classList.toggle("audio-mode-active", on);
        paintTimeLabel();
        paintTime();
        if (on) {
            if (fullscreenElement()) {
                try { exitFullscreen(); } catch (e) {}
            }
            container.classList.remove("fullscreen");
            // On a desktop, the queue opens beside the audio player (closed again on the way back
            // to video, if it was opened only for this)
            // (not when you hid it yourself; and back in audio a moment after leaving it - one track
            // changing to the next - the panel is left as it was)
            const quickReturn = lastAudioExit && Date.now() - lastAudioExit.at < 8000;
            // (a phone: the sheet was open - the player collapsed to its strip - and audio mode
            // went for a moment as one track changed to the next: the sheet stays open)
            if (lastAudioExit && lastAudioExit.extended && Date.now() - lastAudioExit.at < 3000 && matchMedia("(max-width: 900px)").matches) {
                playerPage.classList.add("mobile-audio-extended");
            }
            const wantPanel = quickReturn ? lastAudioExit.panelOpen : !together.audioPanelUserHidden;
            if (wantPanel && matchMedia("(min-width: 901px)").matches && !playerPage.classList.contains("room-open") && together.openQueue && (!together.audioPanelFits || together.audioPanelFits())) {
                together.openQueue();
                queueOpenedForAudio = true;
            }
            if (timelineContainer && timelineSlot) moveAudioEl(timelineContainer, timelineSlot);
            if (centerControls && transportSlot) moveAudioEl(centerControls, transportSlot);
            if (volumeGroup && volumeSlot) moveAudioEl(volumeGroup, volumeSlot);
            requestAnimationFrame(placeTopVolume);
            if (topSearch && audioCorner) moveAudioEl(topSearch, audioCorner);
            if (audioButton && audioCorner) moveAudioEl(audioButton, audioCorner);
            if (moreContent && audioCorner) moveAudioEl(moreContent, audioCorner);
            // (top right: no queue or room button - on a computer the panel beside is always open,
            // and phones have both as tabs of their bottom bar)
            // (how they were in the video view, to put back exactly so - PiP is hidden where unsupported)
            const pipRow = moreOptions.querySelector('[data-more-action="pip"]');
            hiddenBeforeAudio = { pip: pipButton?.hidden, pipRow: pipRow?.hidden };
            // (shown or hidden by room.js, when there's a queue to shuffle)
            if (shuffleButton && centerControls) {
                moveAudioEl(shuffleButton, centerControls);
                centerControls.prepend(shuffleButton);
            }
            if (repeatButton && centerControls) {
                repeatButton.hidden = false;
                centerControls.append(repeatButton);
            }
            if (pipButton) {
                pipButton.hidden = true;
            }
            if (pipRow) {
                pipRow.hidden = true;
                pipRow.style.setProperty("display", "none", "important");
            }
            placeAudioSave();
            moreOptions.classList.add("audio-settings-menu");
            setupAnalyser(); update();
            audioContext?.resume().catch(() => {});
            cancelAnimationFrame(raf);
            if (isLocalAudio()) raf = requestAnimationFrame(draw);
        } else {
            const wasExtended = playerPage.classList.contains("mobile-audio-extended");
            playerPage.classList.remove("mobile-audio-extended");
            if (audioMenuBackdrop) audioMenuBackdrop.hidden = true;
            lastAudioExit = { at: Date.now(), panelOpen: playerPage.classList.contains("room-open"), extended: wasExtended };
            if (queueOpenedForAudio && !together.active() && together.hidePanel) together.hidePanel();
            queueOpenedForAudio = false;
            if (timelineContainer) restoreAudioEl(timelineContainer, timelineParent);
            if (centerControls) restoreAudioEl(centerControls, centerControlsParent);
            if (volumeGroup) restoreAudioEl(volumeGroup, volumeParent);
            placeTopVolume();
            if (topSearch) restoreAudioEl(topSearch, topSearchParent);
            if (topRoom) restoreAudioEl(topRoom, topRoomParent);
            if (topHome) restoreAudioEl(topHome, topHomeParent);
            if (shuffleButton) restoreAudioEl(shuffleButton, shuffleParent);
            if (repeatButton) repeatButton.remove();
            if (pipButton) {
                restoreAudioEl(pipButton, pipParent);
                pipButton.hidden = hiddenBeforeAudio.pip ?? false;
            }
            const pipRow = moreOptions.querySelector('[data-more-action="pip"]');
            if (pipRow) {
                pipRow.hidden = hiddenBeforeAudio.pipRow ?? false;
                pipRow.style.removeProperty("display");
            }
            if (saveWrap) restoreAudioEl(saveWrap, saveParent);
            if (audioButton) restoreAudioEl(audioButton, audioButton.closest(".options.right"));
            if (moreContent) restoreAudioEl(moreContent, moreParent);
            moreOptions.classList.remove("audio-settings-menu");
            moreOptions.style.removeProperty("position");
            moreOptions.style.removeProperty("z-index");
            moreOptions.style.removeProperty("width");
            moreOptions.style.removeProperty("transform");
            moreOptions.style.removeProperty("opacity");
            moreOptions.style.removeProperty("visibility");
            moreOptions.style.removeProperty("top");
            moreOptions.style.removeProperty("right");
            moreOptions.style.removeProperty("bottom");
            moreOptions.style.removeProperty("left");
            if (moreContent && moreOptions.parentElement !== moreContent) moreContent.append(moreOptions);
            cancelAnimationFrame(raf);
            audioContext?.suspend().catch(() => {});
        }
        update();
    };
    const toggleAudioMode = () => {
        if (isMusicTrack() || isLocalAudio()) return;
        autoAudio = false;
        preferAudio = !container.classList.contains("audio-mode-only");
        setAudioMode(preferAudio);
    };
    // Each half of the pill picks its own mode; clicking the active half does nothing
    audioButton.addEventListener("click", e => {
        const active = container.classList.contains("audio-mode-only");
        if (e.target.closest(".video-choice") && !active) return;
        if (e.target.closest(".audio-choice") && active) return;
        toggleAudioMode();
    });
    window.CineAudioMode = {
        // (YouTube Music switches to audio through this: automatic, so a video after it plays as
        // video again - unless the listener picked Audio, see preferAudio)
        enable: () => { if (!container.classList.contains("audio-mode-only")) autoAudio = true; setAudioMode(true); },
        // (the listener's own choice, as with the switch)
        choose: audio => { autoAudio = false; preferAudio = !!audio; setAudioMode(!!audio); },
        disable: () => {
            if (isMusicTrack()) return;
            autoAudio = false;
            setAudioMode(false);
        },
        toggle: toggleAudioMode,
        get canToggle() { return sourceExists() && !isMusicTrack() && !isLocalAudio(); },
        get active() { return container.classList.contains("audio-mode-only"); }
    };
    miniButton.addEventListener("click", () => {
        // (no miniplayer for audio)
        if (!sourceExists() || container.classList.contains("audio-mode-only")) return;
        together.soloMini = !together.active();
        showHome();
    });
    window.addEventListener("resize", () => {
        if (!container.classList.contains("audio-mode-only")) return;
        placeAudioSave();
        // (the title is one line: whether it needs to scroll depends on the width)
        fitAudioMarquee(titleWrap, titleSpan);
    });
    new MutationObserver(update).observe(container, { attributes: true, attributeFilter: ["class"] });
    setInterval(update, 1000);
    update();
})();

// Phones, the audio sheet open: it fits the part of the screen that actually shows - above the
// keyboard while typing in the chat, inside the browser's bars - so the strip on top (the player,
// collapsed) never slides out of view. The page itself never scrolls (a focused box or a new chat
// message could scroll it, taking the strip off the top).
if (window.visualViewport) {
    const vv = window.visualViewport;
    const fitSheet = () => {
        playerPage.style.setProperty("--vv-h", `${Math.round(vv.height)}px`);
        playerPage.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
    };
    vv.addEventListener("resize", fitSheet);
    vv.addEventListener("scroll", fitSheet);
    fitSheet();
}
playerPage.addEventListener("scroll", () => {
    if (playerPage.classList.contains("mobile-audio-extended") && playerPage.scrollTop) playerPage.scrollTop = 0;
});

// Phones: pull down from the top of the player to refresh, the standard way - a round arrow comes
// down with the finger, turning; let go past the line, the page reloads (it lands on home). The
// player is fixed to the screen, so the browser's own pull-to-refresh never had a page to pull.
// Only from the top band (the title bar), not from the seekbar, the call, a menu or a typing box,
// and not while what's under the finger is scrolled down.
{
    const pullTouch = matchMedia("(pointer: coarse)");
    const pullMark = document.createElement("div");
    pullMark.className = "pull-refresh";
    pullMark.setAttribute("aria-hidden", "true");
    pullMark.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
    document.body.appendChild(pullMark);
    const PULL_START_BAND = 110, PULL_LINE = 72, PULL_MAX = 110;
    let pull = null;
    const scrolledAbove = target => {
        for (let node = target; node && node !== document.body; node = node.parentElement) {
            if (node.scrollTop > 0) return true;
        }
        return false;
    };
    const resetPull = () => {
        pull = null;
        pullMark.classList.remove("shown", "ready");
        pullMark.style.removeProperty("transform");
    };
    playerPage.addEventListener("touchstart", e => {
        if (!pullTouch.matches || playerPage.hidden || e.touches.length !== 1) return resetPull();
        const touch = e.touches[0];
        const target = e.target;
        if (touch.clientY > PULL_START_BAND || scrolledAbove(target)
            || target.closest("input, textarea, select, [contenteditable], .timeline-container, .room-call, .room-call-float-menu, .more-options, .player-sheet, .cmd-palette, .room-sheet")) return resetPull();
        pull = { x: touch.clientX, y: touch.clientY, dy: 0, live: false };
    }, { passive: true });
    playerPage.addEventListener("touchmove", e => {
        if (!pull) return;
        const touch = e.touches[0];
        const dx = touch.clientX - pull.x, dy = touch.clientY - pull.y;
        if (!pull.live) {
            if (Math.abs(dy) < 10) return;
            // (a pull down, not sideways or up)
            if (dy < 0 || Math.abs(dx) > Math.abs(dy)) return resetPull();
            pull.live = true;
        }
        pull.dy = Math.max(0, dy);
        const travel = Math.min(PULL_MAX, pull.dy * 0.5);
        pullMark.classList.add("shown");
        pullMark.classList.toggle("ready", travel >= PULL_LINE);
        pullMark.style.transform = `translate(-50%, ${Math.round(travel)}px) rotate(${Math.round(travel * 4)}deg)`;
    }, { passive: true });
    const endPull = () => {
        if (!pull) return;
        const ready = pull.live && Math.min(PULL_MAX, pull.dy * 0.5) >= PULL_LINE;
        if (!ready) return resetPull();
        pull = null;
        pullMark.classList.add("refreshing");
        setTimeout(() => location.reload(), 150);
    };
    playerPage.addEventListener("touchend", endPull, { passive: true });
    playerPage.addEventListener("touchcancel", resetPull, { passive: true });
}

// Previous / next - the keyboard's media keys, the lock screen, the notification: whatever the
// player's own Previous / Next buttons do right now (a queue, a playlist, a Mix, a room's queue for
// whoever may change it); not offered while they can't
const trackActions = { previoustrack: null, nexttrack: null };
const updateTrackActions = () => {
    [["previoustrack", ".prev-track"], ["nexttrack", ".next-track"]].forEach(([action, selector]) => {
        const button = container.querySelector(selector);
        const can = !!button && !button.hidden && !button.disabled;
        if (trackActions[action] === can) return;
        trackActions[action] = can;
        try {
            navigator.mediaSession.setActionHandler(action, can ? () => {
                mediaKeyAt = Date.now();
                const now = container.querySelector(selector);
                if (now && !now.hidden && !now.disabled) now.click();
            } : null);
        } catch (e) {}
    });
};

let mediaArtworkFor = null;
const updateMediaSession = () => {
    const session = navigator.mediaSession;
    if (!session) return;
    updateTrackActions();
    if (!(currentFile || together.active() || (together.solo && together.solo.active))) return;
    const title = videoTitle.textContent;
    const ytId = container.classList.contains("youtube") ? youTubeIdShown() : null;
    if (!session.metadata || session.metadata.title !== title || mediaArtworkFor !== ytId) {
        mediaArtworkFor = ytId;
        session.metadata = new MediaMetadata({
            title,
            artist: together.active() ? "CineTab · watching together" : together.solo && together.solo.active ? "CineTab · YouTube" : "CineTab",
            // A YouTube video shows its own picture on the lock screen
            artwork: ytId ? [
                { src: `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`, sizes: "320x180", type: "image/jpeg" },
                { src: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, sizes: "480x360", type: "image/jpeg" }
            ] : [
                { src: "icon-192.png", sizes: "192x192", type: "image/png" },
                { src: "icon-512.png", sizes: "512x512", type: "image/png" }
            ]
        });
    }
    session.playbackState = mediaPaused() ? "paused" : "playing";
    const duration = mediaDuration();
    const position = mediaTime();
    const rate = (together.stream ? together.stream.rate : mainVideo.playbackRate) || 1;
    try {
        if (Number.isFinite(duration) && duration > 0 && Number.isFinite(position)) {
            session.setPositionState({ duration, position: Math.min(Math.max(0, position), duration), playbackRate: rate });
        }
    } catch (e) {}
};

if ("mediaSession" in navigator) {
    const handle = (action, run) => {
        try {
            navigator.mediaSession.setActionHandler(action, details => {
                mediaKeyAt = Date.now();
                run(details || {});
                updateMediaSession();
            });
        } catch (e) {}
    };
    handle("play", () => mediaPaused() && togglePlay());
    handle("pause", () => !mediaPaused() && togglePlay());
    handle("seekbackward", details => seek(-(details.seekOffset || 10), false));
    handle("seekforward", details => seek(details.seekOffset || 10, false));
    handle("seekto", details => Number.isFinite(details.seekTime) && seekTo(details.seekTime));
    ["play", "pause", "loadedmetadata", "ratechange", "seeked", "emptied"].forEach(type => mainVideo.addEventListener(type, updateMediaSession));
    // A room's YouTube video or stream has no events here; the position also drifts with time
    setInterval(updateMediaSession, 5000);
}

// YouTube plays inside YouTube's own frame, so the browser gave the media keys (a laptop's play /
// pause / next keys), the lock screen and the phone's notification to YouTube's player there - which
// ignores Next, and doesn't know about the queue. While a YouTube video plays, a silent sound plays
// on this page too: the page is then the one the browser hands them to (our handlers above), and a
// phone keeps the page going in the background (Background play's resume, youtube.js).
const sessionKeeper = (() => {
    if (!("mediaSession" in navigator)) return null;
    // 6 seconds of silence (browsers leave sounds under 5 seconds out of their media controls)
    const rate = 8000, seconds = 6, size = rate * seconds;
    const wav = new DataView(new ArrayBuffer(44 + size));
    const text = (at, value) => [...value].forEach((c, i) => wav.setUint8(at + i, c.charCodeAt(0)));
    text(0, "RIFF"); wav.setUint32(4, 36 + size, true); text(8, "WAVE"); text(12, "fmt ");
    wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
    wav.setUint32(24, rate, true); wav.setUint32(28, rate, true); wav.setUint16(32, 1, true); wav.setUint16(34, 8, true);
    text(36, "data"); wav.setUint32(40, size, true);
    for (let i = 0; i < size; i++) wav.setUint8(44 + i, 128);
    const audio = document.createElement("audio");
    audio.src = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    audio.loop = true;
    audio.preload = "auto";
    audio.setAttribute("aria-hidden", "true");
    return audio;
})();
const syncSessionKeeper = () => {
    if (!sessionKeeper || ytSound.on) return;
    const youtube = container.classList.contains("youtube") && !playerPage.hidden || !!(together.soloMini && together.solo && together.solo.active);
    const want = youtube && !mediaPaused();
    if (want && sessionKeeper.paused) {
        sessionKeeper.play().then(updateMediaSession, () => {});
    } else if (!want && !sessionKeeper.paused) {
        sessionKeeper.pause();
        updateMediaSession();
    }
};
// ---------- Background play for a YouTube video (phones and tablets): YouTube's own player falls
// silent once the browser is left or the phone is locked, even where it still seems to play. So
// as the page leaves the screen its sound goes on from the page's own audio player (the one above,
// which phones let play in the background): the video's sound from a Piped server
// (CineYouTube.backgroundSound), from the same moment, while YouTube's player waits. The lock
// screen's buttons work on it; at its end, the next video in the queue or playlist carries on
// the same way. Back on the page, YouTube's player takes over from where the sound got to. Where
// no server can give the sound, YouTube's own player is left to it as before.
const ytSound = { on: false, id: null, silence: sessionKeeper ? sessionKeeper.src : "", token: 0 };
const ytSoundWanted = () => isTouch && document.hidden && background.mode !== "off" && soloMedia() === "youtube" && !floating();
const ytSoundSwitch = async id => {
    const token = ++ytSound.token;
    const src = id && window.CineYouTube && CineYouTube.backgroundSound ? await CineYouTube.backgroundSound(id) : null;
    if (token !== ytSound.token || !ytSoundWanted()) return false;
    if (!src) return false;
    const player = sessionKeeper;
    const from = ytSound.on && ytSound.id !== id ? 0 : (together.solo.currentTime || 0);
    ytSound.on = true;
    ytSound.id = id;
    player.loop = false;
    player.src = src;
    player.muted = false;
    try {
        player.currentTime = from;
    } catch (e) {}
    try {
        await player.play();
    } catch (e) {
        if (token === ytSound.token) ytSoundBack(false);
        return false;
    }
    if (token !== ytSound.token) return true;
    // (YouTube's player waits meanwhile: it would only play silently, or twice)
    if (!together.solo.paused) together.solo.pause();
    updateMediaSession();
    return true;
};
// Back to YouTube's player (`resume`: from where the sound got to, playing if it was)
function ytSoundBack(resume = true) {
    if (!ytSound.on) return;
    const player = sessionKeeper;
    const time = player.currentTime;
    const playing = !player.paused && !player.ended;
    const id = ytSound.id;
    ytSound.on = false;
    ytSound.id = null;
    ytSound.token++;
    player.pause();
    player.src = ytSound.silence;
    player.loop = true;
    if (resume && together.solo && together.solo.active && together.solo.videoId === id) {
        if (Number.isFinite(time) && time > 0) together.solo.seek(time);
        if (playing) together.solo.play();
    }
    updateMediaSession();
}
if (sessionKeeper) {
    // (some phones - iPhones - only let a page's audio player play later, unprompted, if it played
    // once on a tap: on the first tap, it plays silently for a moment)
    let unlocked = false;
    document.addEventListener("touchend", () => {
        if (unlocked || !sessionKeeper.paused) return;
        unlocked = true;
        sessionKeeper.muted = true;
        sessionKeeper.play().then(() => {
            if (!ytSound.on && sessionKeeper.src === ytSound.silence) sessionKeeper.pause();
        }, () => unlocked = false).finally(() => sessionKeeper.muted = false);
    }, { passive: true });
    // (the next video - Next on the lock screen, or the queue going on: its sound too)
    sessionKeeper.addEventListener("timeupdate", () => {
        if (!ytSound.on || !together.solo || !together.solo.active) return;
        const id = together.solo.videoId;
        if (id && id !== ytSound.id) ytSoundSwitch(id);
        else if (!together.solo.paused) together.solo.pause();
    });
    sessionKeeper.addEventListener("ended", () => {
        if (!ytSound.on) return;
        const next = container.querySelector(".next-track");
        if (next && !next.hidden && !next.disabled) next.click();
    });
    ["play", "pause"].forEach(type => sessionKeeper.addEventListener(type, () => ytSound.on && updateMediaSession()));
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) return ytSoundBack(true);
        // (playing as the page leaves)
        if (soloMedia() === "youtube" && !together.solo.paused && ytSoundWanted()) ytSoundSwitch(together.solo.videoId);
    });
    // (ready before it's needed: the sound's link is looked up as a YouTube video starts, on a phone)
    setInterval(() => {
        if (isTouch && !document.hidden && soloMedia() === "youtube" && !together.solo.paused && window.CineYouTube && CineYouTube.backgroundSound) {
            CineYouTube.backgroundSound(together.solo.videoId);
        }
    }, 4000);
}

if (sessionKeeper) {
    setInterval(() => {
        syncSessionKeeper();
        updateTrackActions();
    }, 700);
    // (a first click or key on the page lets it start, where it couldn't before)
    ["pointerdown", "keydown"].forEach(type => document.addEventListener(type, () => setTimeout(syncSessionKeeper, 300), { passive: true }));
}

// Playback Speed (presets, or any value from 0.25x to 4x; browsers mute audio outside that range)
const speedPresets = speedOptions.querySelectorAll("li[data-speed]"),
speedCurrent = speedOptions.querySelector(".speed-current"),
speedSlider = speedOptions.querySelector(".speed-slider"),
speedInput = speedOptions.querySelector(".speed-input");

// Keep every part of the menu in sync with the actual rate, however it was changed
const syncSpeedUI = () => {
    const rate = mainVideo.playbackRate;
    speedPresets.forEach(option => option.classList.toggle("active", +option.dataset.speed === rate));
    speedCurrent.textContent = rate === 1 ? "Normal" : `${rate}x`;
    moreOptions.querySelectorAll('[data-more-value="speed"]').forEach(value => value.textContent = speedCurrent.textContent);
    speedSlider.value = rate;
    paintRange(speedSlider);
    if (document.activeElement !== speedInput) speedInput.value = rate;
    speedBtn.title = `Playback speed: ${speedCurrent.textContent} (Shift + < / >)`;
};

const setSpeed = (rate, feedback = true) => {
    rate = Math.round(Math.min(4, Math.max(0.25, +rate || 1)) * 100) / 100;
    // defaultPlaybackRate keeps the chosen speed when the next file is opened
    mainVideo.defaultPlaybackRate = mainVideo.playbackRate = rate;
    syncSpeedUI();
    if (feedback) showFeedback("fa-gauge-high", `${rate}x`);
};

mainVideo.addEventListener("ratechange", syncSpeedUI);
paintRange(volumeSlider);
paintRange(speedSlider);

speedPresets.forEach(option => option.addEventListener("click", () => setSpeed(option.dataset.speed)));
speedSlider.addEventListener("input", () => setSpeed(speedSlider.value, false));
speedSlider.addEventListener("change", () => {
    showFeedback("fa-gauge-high", `${mainVideo.playbackRate}x`);
    speedSlider.blur();
});
speedInput.addEventListener("change", () => {
    setSpeed(speedInput.value);
    speedInput.value = mainVideo.playbackRate;
});
speedInput.addEventListener("keydown", e => {
    if (e.key === "Enter") speedInput.blur();
});

// ---------- Picture in picture on a computer (Chrome, Edge): a small always-on-top window of the
// page's own, like a video call's. It shows what's playing: your own video or the host's stream
// (the video itself moves into it, and back when it closes), or a YouTube video (a muted copy of
// YouTube's player in step with the one on the page, which keeps the sound: YouTube's player
// can't move without starting over). In a room it also shows everyone, like the call window
// (room.js, together.callPip): a column beside the video, or a row below it once the window is
// taller than wide, with your mic and camera.

// A muted YouTube player in the window, following the page's YouTube video (which, its time,
// paused or not, its speed); returns what stops it. The player is made in yt-pip.html, framed in
// the window: the window has no address of its own, and YouTube's player won't load without one.
const followYouTubeIn = (pipWindow, holder) => {
    const w = pipWindow;
    const state = { player: null, ready: false, id: null, syncedAt: 0, gone: false, frame: null, YT: null };
    const frame = w.document.createElement("iframe");
    frame.src = "yt-pip.html";
    frame.title = "YouTube";
    frame.allow = "autoplay; encrypted-media";
    holder.replaceChildren(frame);
    // Once that page and YouTube's script in it are ready
    let waits = 0;
    const whenReady = () => {
        if (state.gone) return;
        const inner = frame.contentWindow;
        if (inner && inner.YT && inner.YT.Player && inner.document.getElementById("player")) {
            state.YT = inner.YT;
            return create(inner);
        }
        if (++waits < 100) w.setTimeout(whenReady, 150);
    };
    frame.addEventListener("load", whenReady);
    const create = inner => {
        if (state.gone) return;
        state.player = new inner.YT.Player(inner.document.getElementById("player"), {
            host: "https://www.youtube-nocookie.com",
            width: "100%",
            height: "100%",
            playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, mute: 1, origin: location.origin },
            events: {
                onReady: () => {
                    try {
                        state.player.mute();
                        state.player.getIframe().tabIndex = -1;
                    } catch (e) {}
                    state.ready = true;
                    sync();
                }
            }
        });
    };
    const sync = () => {
        const stream = together.stream;
        const id = youTubeIdShown();
        if (!state.ready || !stream || !id) return;
        const player = state.player;
        const S = state.YT.PlayerState;
        try {
            const time = stream.currentTime();
            const paused = stream.paused;
            if (state.id !== id) {
                state.id = id;
                state.syncedAt = performance.now();
                player.mute();
                if (paused) player.cueVideoById({ videoId: id, startSeconds: time });
                else player.loadVideoById({ videoId: id, startSeconds: time });
                return;
            }
            const playing = player.getPlayerState();
            if (player.getPlaybackRate() !== stream.rate) player.setPlaybackRate(stream.rate);
            if (paused && (playing === S.PLAYING || playing === S.BUFFERING)) player.pauseVideo();
            else if (!paused && playing !== S.PLAYING && playing !== S.BUFFERING) player.playVideo();
            // (a moment to settle after each jump; a live stream has no timeline to follow)
            const drift = player.getCurrentTime() - time;
            if (stream.duration && performance.now() - state.syncedAt > 1500 && Math.abs(drift) > (paused ? 0.3 : 0.8)) {
                state.syncedAt = performance.now();
                player.seekTo(time + (paused ? 0 : 0.2), true);
            }
        } catch (e) {}
    };
    const timer = w.setInterval(sync, 500);
    return () => {
        state.gone = true;
        w.clearInterval(timer);
        try {
            if (state.player) state.player.destroy();
        } catch (e) {}
    };
};

// The audio player, in a room: picture in picture shows only everyone's video, stacked, like a
// meeting's window (there's no picture of the music to show)
const openPeoplePiP = async () => {
    if (!together.active() || !together.callPip || !("documentPictureInPicture" in window)) return;
    if (window.documentPictureInPicture.window) {
        window.documentPictureInPicture.window.close();
        return;
    }
    try {
        const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 300, height: 420 });
        const pipDoc = pipWindow.document;
        [...document.styleSheets].forEach(styleSheet => {
            try {
                const style = pipDoc.createElement("style");
                style.textContent = [...styleSheet.cssRules].map(rule => rule.cssText).join("");
                pipDoc.head.appendChild(style);
            } catch (e) {
                const link = pipDoc.createElement("link");
                link.rel = "stylesheet";
                link.href = styleSheet.href;
                pipDoc.head.appendChild(link);
            }
        });
        pipDoc.title = "Everyone - CineTab";
        Object.assign(pipDoc.body.style, { margin: "0", padding: "0", overflow: "hidden", background: "#0b0e15" });
        const wrap = pipDoc.createElement("div");
        wrap.className = "pip-player-container pip-people-only";
        const people = together.callPip();
        if (!people) return pipWindow.close();
        wrap.append(people.el);
        pipDoc.body.appendChild(wrap);
        pipWindow.addEventListener("pagehide", () => people.close());
        showFeedback("fa-clone", "Everyone, in picture in picture");
    } catch (e) {}
};

const toggleCustomPiP = async () => {
    if (container.classList.contains("audio-mode-only")) return openPeoplePiP();
    if ("documentPictureInPicture" in window) {
        if (window.documentPictureInPicture.window) {
            window.documentPictureInPicture.window.close();
            return;
        }

        try {
            const youtubeId = container.classList.contains("youtube") ? youTubeIdShown() : null;
            const inRoom = together.active();
            // In a room: a column of everyone beside the video, so a wider window
            const pipWindow = await window.documentPictureInPicture.requestWindow(inRoom && together.callPip
                ? { width: 720, height: 300 } : { width: 480, height: 270 });
            const pipDoc = pipWindow.document;

            // The page's styles, in the window too
            [...document.styleSheets].forEach((styleSheet) => {
                try {
                    const cssRules = [...styleSheet.cssRules].map(r => r.cssText).join('');
                    const style = pipDoc.createElement('style');
                    style.textContent = cssRules;
                    pipDoc.head.appendChild(style);
                } catch (e) {
                    const link = pipDoc.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = styleSheet.href;
                    pipDoc.head.appendChild(link);
                }
            });
            pipDoc.title = videoTitle.textContent || "CineTab";
            pipDoc.body.style.margin = '0';
            pipDoc.body.style.padding = '0';
            pipDoc.body.style.overflow = 'hidden';
            pipDoc.body.style.background = '#000';

            const pipContainer = pipDoc.createElement('div');
            pipContainer.className = 'pip-player-container';
            // In a room, Close just closes (pausing would pause everyone), and there's no Background play
            pipContainer.innerHTML = `
                <div class="pip-video-wrapper">
                    <div class="pip-overlay">
                        <div class="pip-top-controls">
                            ${inRoom ? "" : `<button id="pip-min-btn" title="Background Play"><i class="fa-solid fa-window-minimize"></i></button>`}
                            <button id="pip-focus-btn" title="Back to Tab"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                            <button id="pip-close-btn" title="${inRoom ? "Close" : "Close (pauses the video)"}"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                        <div class="pip-bottom-controls">
                            <button id="pip-seek-back" title="-5s"><i class="fas fa-backward"></i></button>
                            <button id="pip-play-btn" title="Play/Pause"><i class="${mediaPaused() ? 'fas fa-play' : 'fas fa-pause'}"></i></button>
                            <button id="pip-seek-forward" title="+5s"><i class="fas fa-forward"></i></button>
                            <button id="pip-mute-btn" title="Mute/Unmute"><i class="${mainVideo.volume === 0 ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high'}"></i></button>
                        </div>
                    </div>
                </div>
            `;
            pipDoc.body.appendChild(pipContainer);
            const videoWrapper = pipContainer.querySelector('.pip-video-wrapper');

            // What's playing: YouTube's copy, or the video itself
            let stopYouTube = null;
            if (youtubeId) {
                const holder = pipDoc.createElement('div');
                holder.className = 'pip-yt';
                videoWrapper.insertBefore(holder, videoWrapper.firstChild);
                stopYouTube = followYouTubeIn(pipWindow, holder);
            } else {
                videoWrapper.insertBefore(mainVideo, videoWrapper.firstChild);
            }

            // Everyone in the room (room.js)
            const people = inRoom && together.callPip ? together.callPip() : null;
            if (people) {
                pipContainer.classList.add('with-people');
                pipContainer.append(people.el);
            }

            const pipPlayBtn = pipContainer.querySelector('#pip-play-btn');
            const pipMuteBtn = pipContainer.querySelector('#pip-mute-btn');
            const pipOverlay = pipContainer.querySelector('.pip-overlay');
            // (each one answered at once in the window: its icons, and the controls' hiding)
            const pipAct = action => {
                action();
                updatePipIcons();
                pipWindow.setTimeout(updatePipIcons, 350);
                showPipControls();
            };
            pipPlayBtn.addEventListener('click', () => pipAct(togglePlay));
            pipContainer.querySelector('#pip-seek-back').addEventListener('click', () => pipAct(() => seek(-5)));
            pipContainer.querySelector('#pip-seek-forward').addEventListener('click', () => pipAct(() => seek(5)));
            pipMuteBtn.addEventListener('click', () => pipAct(() => setVolume(mainVideo.volume > 0 ? 0 : 1)));
            // A click on the picture itself (not a button): play or pause, as in the player
            pipOverlay.addEventListener('click', e => {
                if (e.target.closest('button')) return;
                pipAct(togglePlay);
            });
            // The keyboard, while the window has the focus: the player's own keys
            pipWindow.addEventListener('keydown', e => {
                if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return;
                const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
                const keys = {
                    ' ': togglePlay, k: togglePlay,
                    ArrowLeft: () => seek(-5), ArrowRight: () => seek(5), j: () => seek(-10), l: () => seek(10),
                    ArrowUp: () => setVolume(Math.round(Math.min(1, mainVideo.volume + 0.05) * 100) / 100),
                    ArrowDown: () => setVolume(Math.round(Math.max(0, mainVideo.volume - 0.05) * 100) / 100),
                    m: () => setVolume(mainVideo.volume > 0 ? 0 : 1)
                };
                if (!keys[key]) return;
                e.preventDefault();
                pipAct(keys[key]);
            });

            // Background Play: closes the window, the sound goes on
            pipContainer.querySelector('#pip-min-btn')?.addEventListener('click', () => {
                pipWindow.close();
                showFeedback("fa-window-minimize", "Background Play");
            });
            // Back to the tab
            pipContainer.querySelector('#pip-focus-btn').addEventListener('click', () => {
                window.focus();
                pipWindow.close();
            });
            // Close: on your own, the video pauses too
            pipContainer.querySelector('#pip-close-btn').addEventListener('click', () => {
                if (!inRoom && !mediaPaused()) togglePlay();
                pipWindow.close();
            });

            // The buttons as things change (YouTube says nothing to the page: a look twice a second)
            let pipWasPaused = mediaPaused();
            function updatePipIcons() {
                const paused = mediaPaused();
                pipPlayBtn.querySelector('i').className = paused ? 'fas fa-play' : 'fas fa-pause';
                pipPlayBtn.title = paused ? 'Play (Space)' : 'Pause (Space)';
                pipMuteBtn.querySelector('i').className = mainVideo.volume === 0 ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
                // (paused from anywhere - the page, the room, the keyboard: the controls show)
                if (paused !== pipWasPaused) {
                    pipWasPaused = paused;
                    if (paused) {
                        clearTimeout(pipIdleTimer);
                        pipContainer.classList.remove('hide-controls');
                    } else hidePipControls();
                }
            }
            const iconTimer = pipWindow.setInterval(updatePipIcons, 500);
            mainVideo.addEventListener('play', updatePipIcons);
            mainVideo.addEventListener('pause', updatePipIcons);
            mainVideo.addEventListener('volumechange', updatePipIcons);

            // The video's buttons hide while it plays and the pointer rests (paused, they stay);
            // any movement, anywhere in the window (over YouTube's picture too: the overlay keeps
            // the pointer, its buttons only ignore it while hidden), brings them back
            let pipIdleTimer;
            const hidePipControls = () => {
                clearTimeout(pipIdleTimer);
                if (mediaPaused()) return;
                pipIdleTimer = setTimeout(() => {
                    if (!mediaPaused()) pipContainer.classList.add('hide-controls');
                }, 2500);
            };
            function showPipControls() {
                pipContainer.classList.remove('hide-controls');
                hidePipControls();
            }
            hidePipControls();
            pipDoc.addEventListener('pointermove', showPipControls);
            pipDoc.addEventListener('pointerdown', showPipControls);
            videoWrapper.addEventListener('mouseleave', () => {
                if (!mediaPaused()) pipContainer.classList.add('hide-controls');
            });

            // Closed: the video back in the page, everything else stopped
            pipWindow.addEventListener('pagehide', () => {
                if (mainVideo.ownerDocument !== document || !container.contains(mainVideo)) {
                    container.insertBefore(mainVideo, container.querySelector('.wrapper'));
                }
                if (stopYouTube) stopYouTube();
                if (people) people.close();
                clearTimeout(pipIdleTimer);
                pipWindow.clearInterval(iconTimer);
                mainVideo.removeEventListener('play', updatePipIcons);
                mainVideo.removeEventListener('pause', updatePipIcons);
                mainVideo.removeEventListener('volumechange', updatePipIcons);
            });

            showFeedback("fa-clone", people ? "Picture in picture, with everyone" : "Picture in picture");
            return;
        } catch (err) {
            console.warn("Document PiP failed, falling back to Native PiP:", err);
        }
    }

    // Native Browser PiP Fallback (phones: Android's floating window, the iPhone's PiP)
    if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
        return;
    }
    // YouTube's player belongs to YouTube: no floating window of its own from here, but the phone
    // floats it from fullscreen
    if (container.classList.contains("youtube")) {
        const frame = [...container.querySelectorAll(".yt-frame iframe")].find(item => item.getClientRects().length);
        if (!isTouch || !floatFromFullscreen(frame)) showFeedback("fa-clone", "Picture in picture isn't available for YouTube here");
        return;
    }
    if (!mainVideo.currentSrc && !mainVideo.srcObject) return showFeedback("fa-clone", "Open a video first");
    try {
        // The page's own fullscreen and a floating window don't mix: leave fullscreen first
        if (fullscreenElement()) await Promise.resolve(exitFullscreen()).catch(() => {});
        // Background play may have turned off the phone's own floating window on leaving; the
        // button always floats it (see Background play)
        mainVideo.disablePictureInPicture = false;
        if (document.pictureInPictureEnabled) {
            await mainVideo.requestPictureInPicture();
        } else if (mainVideo.webkitSupportsPresentationMode && mainVideo.webkitSupportsPresentationMode("picture-in-picture")) {
            // Older iPhones and iPads
            mainVideo.webkitSetPresentationMode("picture-in-picture");
        } else {
            throw new Error("unsupported");
        }
    } catch (err) {
        // A browser that doesn't let pages float a video (Brave, some others on Android): the
        // video fullscreen on its own, with the browser's controls; going to the home screen
        // floats it, where the phone allows that browser to
        if (!isTouch || !floatFromFullscreen(mainVideo)) showFeedback("fa-clone", "Picture in picture isn't available here");
    }
};

// The video (or YouTube's player) fullscreen on its own, to be floated by the phone. True if
// that could be asked for.
let floatElement = null;
const floatFromFullscreen = item => {
    if (!item) return false;
    const enter = item.requestFullscreen || item.webkitRequestFullscreen;
    if (!enter) {
        // iPhones: the system's own player, which has a picture in picture button
        if (item !== mainVideo || !mainVideo.webkitEnterFullscreen) return false;
        mainVideo.webkitEnterFullscreen();
        return true;
    }
    showFeedback("fa-clone", "Go to your home screen to float it");
    const request = () => Promise.resolve(enter.call(item)).then(() => {
        floatElement = item;
        if (item === mainVideo) mainVideo.controls = true;
    });
    // From the page's own fullscreen, straight into the video's
    request().catch(() => fullscreenElement() && Promise.resolve(exitFullscreen()).then(request).catch(() => {}));
    return true;
};
const endFloatFullscreen = () => {
    if (!floatElement || fullscreenElement() === floatElement) return;
    if (floatElement === mainVideo) mainVideo.controls = false;
    floatElement = null;
};
document.addEventListener("fullscreenchange", endFloatFullscreen);
document.addEventListener("webkitfullscreenchange", endFloatFullscreen);

pipBtn.addEventListener("click", toggleCustomPiP);

// Phones and tablets: Stop isn't beside play / pause in the middle of the picture; it's with the
// buttons along the bottom, before picture in picture. Computers: beside play / pause.
{
    const stopBtn = container.querySelector(".player-stop-btn");
    const playBtn = container.querySelector(".options.center .play-pause");
    const coarse = matchMedia("(pointer: coarse), (max-width: 600px)");
    const placeStop = () => {
        if (!stopBtn || !playBtn) return;
        if (coarse.matches) {
            if (stopBtn.nextElementSibling !== pipBtn) pipBtn.before(stopBtn);
        } else if (playBtn.nextElementSibling !== stopBtn) playBtn.after(stopBtn);
    };
    placeStop();
    coarse.addEventListener("change", placeStop);
}
// (also the call window's button, room.js)
together.pip = toggleCustomPiP;

// The whole player page goes fullscreen, so a room's chat can stay open beside the video.
// Phones turn sideways for a wide video; the iPhone can only show the video itself fullscreen.

// YouTube's player shows its own title bar and buttons (top and bottom) while it catches up after
// a jump, which no setting turns off. From the jump until a little after it plays again, its frame
// runs past the picture's box above and below (.yt-crop, style.css): the video, centred in it,
// stays where it was, and YouTube's bars fall outside, cut off. youtube.js and room.js call this:
// `playing` false at a jump or while it loads, true once it plays.
// The YouTube video's own shape (YouTube's oEmbed answer: 200 x 113 for 16:9, 200 x 150 for 4:3, an
// upright one taller than wide), as --yt-ar on the player: style.css makes YouTube's frame exactly
// as wide as the video, so running past the box above and below (to cut off YouTube's own bars)
// never makes the video bigger - Fit shows all of it, nothing cut. Until it's known: 16:9.
const ytShapes = new Map();
let ytShapeFor = null;
const paintYouTubeShape = () => {
    const id = container.classList.contains("youtube") ? youTubeIdShown() : null;
    if (id === ytShapeFor) return;
    ytShapeFor = id;
    const set = ratio => {
        if (ytShapeFor !== id) return;
        if (ratio) container.style.setProperty("--yt-ar", ratio.toFixed(4));
        else container.style.removeProperty("--yt-ar");
    };
    if (!id) return set(null);
    if (ytShapes.has(id)) return set(ytShapes.get(id));
    set(null);
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`)
        .then(response => response.ok ? response.json() : null)
        .catch(() => null)
        .then(data => {
            let ratio = data && data.width > 0 && data.height > 0 ? data.width / data.height : null;
            // (its numbers are rounded - 200 x 113 for 16:9: the usual shapes, exactly)
            if (ratio) ratio = [16 / 9, 4 / 3, 9 / 16, 3 / 4, 1, 21 / 9].find(shape => Math.abs(ratio / shape - 1) < 0.015) || ratio;
            if (ratio && ratio > 0.3 && ratio < 4) ytShapes.set(id, ratio);
            set(ytShapes.get(id) || null);
        });
};
setInterval(paintYouTubeShape, 400);

let ytCropTimer = null;
const cropYouTube = playing => {
    clearTimeout(ytCropTimer);
    if (!playing) container.classList.add("yt-crop");
    else if (container.classList.contains("yt-crop")) ytCropTimer = setTimeout(() => container.classList.remove("yt-crop"), 2500);
};

// The button where some kind of picture in picture works; phones and tablets always have it (it
// floats the video from fullscreen where the browser has no picture in picture for pages)
pipBtn.hidden = !(isTouch || "documentPictureInPicture" in window || document.pictureInPictureEnabled ||
    (mainVideo.webkitSupportsPresentationMode && mainVideo.webkitSupportsPresentationMode("picture-in-picture")));

const toggleFullscreen = () => {
    if (container.classList.contains("audio-mode-only")) {
        if (fullscreenElement()) {
            try { exitFullscreen(); } catch (e) {}
        }
        return;
    }
    if (fullscreenElement()) return exitFullscreen();
    const enter = playerPage.requestFullscreen || playerPage.webkitRequestFullscreen;
    if (!enter) return mainVideo.webkitEnterFullscreen && mainVideo.webkitEnterFullscreen();
    Promise.resolve(enter.call(playerPage)).then(() => {
        const wide = (mainVideo.videoWidth || 16) >= (mainVideo.videoHeight || 9);
        if (isTouch && wide && screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
    }).catch(() => {});
};

// Keep the button & layout in sync even when leaving fullscreen with Esc
const onFullscreenChange = () => {
    if (container.classList.contains("audio-mode-only")) {
        if (fullscreenElement()) {
            try { exitFullscreen(); } catch (e) {}
        }
        container.classList.remove("fullscreen");
        return;
    }
    const isFullscreen = fullscreenElement() === playerPage;
    container.classList.toggle("fullscreen", isFullscreen);
    fullScreenBtn.className = isFullscreen ? "fa-solid fa-compress" : "fa-solid fa-expand";
    fullScreenBtn.parentNode.title = isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)";
    if (!isFullscreen && screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (e) {}
    }
};
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

fullScreenBtn.parentNode.addEventListener("click", toggleFullscreen);

// ---------- Ambient mode, like YouTube's: a soft, blurred copy of what's playing glows around the
// player, and behind a room's panel too (which lets it through). Your own video is copied as it
// plays, frame by frame and small, into a canvas that the page blurs and spreads. YouTube's player
// can't be read from this page, so a YouTube video gets a second, muted, small YouTube player of
// the same video, kept in step with the real one and blurred the same way (being small, it gets
// YouTube's lowest quality). Until that one shows the video, its thumbnail stands in. Nothing runs
// while there's nothing around the player to glow on (fullscreen, a phone held sideways), or while
// the page isn't on screen.
const AMBIENT_KEY = "cinetab:ambient";
const ambientCanvas = document.querySelector(".ambient"),
ambientChips = moreOptions.querySelectorAll("li[data-ambient]"),
ambientCurrent = moreOptions.querySelector(".ambient-current"),
roomPanel = document.querySelector(".room-panel");
// `kind`: what glows now ("file" or "youtube"); `still`: how many times an unchanging picture
// has been drawn (enough, and it stops)
const ambient = { on: true, ctx: null, shown: false, kind: null, box: "", fresh: true, still: 0, drawnAt: 0, thumbId: null, thumb: null };
try {
    ambient.ctx = ambientCanvas.getContext("2d");
} catch (e) {}

// One small picture of the video into the canvas; a little of the last one stays, so a cut
// doesn't flash
const ambientDraw = image => {
    ambient.ctx.globalAlpha = ambient.fresh ? 1 : 0.55;
    ambient.fresh = false;
    ambient.drawnAt = performance.now();
    try {
        ambient.ctx.drawImage(image, 0, 0, ambientCanvas.width, ambientCanvas.height);
    } catch (e) {}
};

// Your own video, at every new frame it shows (about 30 a second at most)
const ambientFrame = () => {
    if (ambient.shown && ambient.kind === "file" && performance.now() - ambient.drawnAt > 30) ambientDraw(mainVideo);
    mainVideo.requestVideoFrameCallback(ambientFrame);
};
const ambientFrames = typeof mainVideo.requestVideoFrameCallback === "function";
if (ambientFrames) mainVideo.requestVideoFrameCallback(ambientFrame);

// YouTube's own copy: { layer, player, ready, id (its video), syncedAt }
const ambientYT = { layer: document.createElement("div"), player: null, ready: false, creating: null, id: null, syncedAt: 0 };
ambientYT.layer.className = "ambient-yt";
ambientYT.layer.setAttribute("aria-hidden", "true");
ambientCanvas.after(ambientYT.layer);

const ambientPlayer = () => ambientYT.creating ||= window.CineYouTube.api().then(YT => new Promise(resolve => {
    const mount = document.createElement("div");
    ambientYT.layer.replaceChildren(mount);
    const player = new YT.Player(mount, {
        host: "https://www.youtube-nocookie.com",
        width: 320,
        height: 180,
        playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, mute: 1, origin: location.origin },
        events: {
            onReady: () => {
                try {
                    player.mute();
                    const frame = player.getIframe();
                    frame.tabIndex = -1;
                    frame.title = "";
                } catch (e) {}
                ambientYT.player = player;
                ambientYT.ready = true;
                resolve(player);
            }
        }
    });
})).catch(error => {
    ambientYT.creating = null;
    throw error;
});

// Keeps the copy on video `id` and in step with the player (once a second); true while it shows
// that video (not an ad of its own, not loading)
const ambientYouTube = id => {
    const stream = together.stream;
    if (!window.CineYouTube || !stream) return false;
    if (!ambientYT.ready) {
        ambientPlayer().catch(() => {});
        return false;
    }
    const player = ambientYT.player;
    const S = YT.PlayerState;
    try {
        const time = stream.currentTime();
        const paused = stream.paused;
        if (ambientYT.id !== id) {
            ambientYT.id = id;
            ambientYT.syncedAt = performance.now();
            player.mute();
            if (paused) player.cueVideoById({ videoId: id, startSeconds: time });
            else player.loadVideoById({ videoId: id, startSeconds: time });
            return false;
        }
        const state = player.getPlayerState();
        if (performance.now() - ambientYT.syncedAt > 1000) {
            ambientYT.syncedAt = performance.now();
            if (player.getPlaybackRate() !== stream.rate) player.setPlaybackRate(stream.rate);
            if (paused && (state === S.PLAYING || state === S.BUFFERING)) player.pauseVideo();
            else if (!paused && state !== S.PLAYING && state !== S.BUFFERING) player.playVideo();
            // A live stream has no timeline to follow
            const drift = player.getCurrentTime() - time;
            if (stream.duration && Math.abs(drift) > (paused ? 0.5 : 1.5)) player.seekTo(time + (paused ? 0 : 0.3), true);
        }
        const data = player.getVideoData();
        return !!data && data.video_id === id && [S.PLAYING, S.PAUSED, S.BUFFERING].includes(state);
    } catch (e) {
        return false;
    }
};

// Not needed now (nothing shown, the page away; `forget`: no YouTube at all): it stops, using
// no data
const ambientYouTubeRest = (forget = false) => {
    if (!ambientYT.ready) return;
    try {
        const state = ambientYT.player.getPlayerState();
        if (forget && ambientYT.id) ambientYT.player.stopVideo();
        else if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) ambientYT.player.pauseVideo();
    } catch (e) {}
    if (forget) ambientYT.id = null;
};

// A YouTube video's thumbnail, standing in until the copy shows the video
const ambientThumb = id => {
    if (ambient.thumbId !== id) {
        ambient.thumbId = id;
        ambient.still = 0;
        ambient.fresh = true;
        // Read back for the phone's status bar colour (below), so asked for with CORS, which
        // YouTube's image server allows for anyone
        ambient.thumb = new Image();
        ambient.thumb.crossOrigin = "anonymous";
        ambient.thumb.referrerPolicy = "no-referrer";
        ambient.thumb.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    }
    return ambient.thumb.complete && ambient.thumb.naturalWidth ? ambient.thumb : null;
};

const ambientTick = () => {
    if (!ambient.ctx) return;
    const youtube = container.classList.contains("youtube");
    const kind = youtube ? "youtube" : "file";
    let show = ambient.on && !playerPage.hidden && !document.hidden;
    let rect = null, page = null;
    if (show) {
        rect = container.getBoundingClientRect();
        page = playerPage.getBoundingClientRect();
        show = rect.width > 0 && (rect.width < page.width - 8 || rect.height < page.height - 8);
    }
    const id = youtube ? youTubeIdShown() : null;
    if (show) show = youtube ? !!id : !container.classList.contains("audio-mode") && mainVideo.readyState >= 2 && mainVideo.videoWidth > 0;
    // YouTube: its live copy, or the thumbnail meanwhile
    let live = false, thumb = null;
    if (show && youtube) {
        live = ambientYouTube(id);
        thumb = live ? null : ambientThumb(id);
    } else ambientYouTubeRest(!youtube);
    const canvasOn = show && (kind === "file" || !!thumb);
    if (ambient.kind !== kind) {
        ambient.kind = kind;
        ambient.still = 0;
    }
    ambient.shown = canvasOn;
    ambientCanvas.classList.toggle("on", canvasOn);
    ambientYT.layer.classList.toggle("on", show && live);
    // A room's panel lets the glow through
    playerPage.classList.toggle("ambient-on", show && (canvasOn || live));
    if (!show) return;
    // Behind the player, and behind the room's panel while it's open beside or below it
    let [left, top, right, bottom] = [rect.left, rect.top, rect.right, rect.bottom];
    if (roomPanel && !roomPanel.hidden && playerPage.classList.contains("room-open")) {
        const panel = roomPanel.getBoundingClientRect();
        if (panel.width) [left, top, right, bottom] = [Math.min(left, panel.left), Math.min(top, panel.top), Math.max(right, panel.right), Math.max(bottom, panel.bottom)];
    }
    const box = [left - page.left, top - page.top, right - left, bottom - top].map(Math.round);
    if (box.join() !== ambient.box) {
        ambient.box = box.join();
        const [x, y, width, height] = box;
        const place = { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` };
        Object.assign(ambientCanvas.style, place);
        Object.assign(ambientYT.layer.style, place);
        // YouTube's copy keeps its small size (so its low quality), stretched over the box
        ambientYT.layer.style.setProperty("--sx", width / 320);
        ambientYT.layer.style.setProperty("--sy", height / 180);
        const rows = Math.max(4, Math.min(160, Math.round(64 * height / width)));
        if (ambientCanvas.width !== 64 || ambientCanvas.height !== rows) {
            ambientCanvas.width = 64;
            ambientCanvas.height = rows;
            ambient.fresh = true;
        }
        ambient.still = 0;
    }
    if (!canvasOn) return;
    // Your own video while it plays is drawn at each of its frames (above); here only where the
    // browser can't say when a frame changes. Paused: a few times, then not until it changes.
    const moving = kind === "file" && !mainVideo.paused && !mainVideo.ended;
    if (moving && ambientFrames && !ambient.fresh) return;
    if (!moving && ambient.still > 12) return;
    ambient.still = moving ? 0 : ambient.still + 1;
    ambientDraw(kind === "file" ? mainVideo : thumb);
};
setInterval(ambientTick, 150);
// A paused picture that changed (a jump, another file) is drawn again
["seeked", "loadeddata", "play"].forEach(type => mainVideo.addEventListener(type, () => ambient.still = 0));

const setAmbient = (on, announce = false) => {
    ambient.on = on;
    ambient.still = 0;
    ambientChips.forEach(chip => chip.classList.toggle("active", (chip.dataset.ambient === "on") === on));
    ambientCurrent.textContent = on ? "On" : "Off";
    moreOptions.querySelectorAll('[data-more-value="ambient"]').forEach(value => value.textContent = ambientCurrent.textContent);
    if (announce) {
        storage.set(AMBIENT_KEY, on ? "on" : "off");
        showFeedback("fa-lightbulb", on ? "Ambient mode on" : "Ambient mode off");
    }
    ambientTick();
    if (!playerSheet.hidden) renderSheet();
};
ambientChips.forEach(chip => chip.addEventListener("click", () => setAmbient(chip.dataset.ambient === "on", true)));
setAmbient(storage.get(AMBIENT_KEY) !== "off");

// ---------- The phone's status bar joins the glow: an installed app (and a browser whose bar
// follows the page) is coloured by the page's theme-color, as the page can't draw under it. While
// the glow shows, that colour comes from the top edge of the picture, saturated and dimmed like
// the glow itself, easing from one colour to the next as the video changes; otherwise the page's
// own dark. A YouTube video gives its thumbnail's colour (its player can't be read).
const themeMeta = document.querySelector('meta[name="theme-color"]');
const THEME_BASE = [15, 15, 17];
const tint = { ctx: null, now: THEME_BASE.slice(), target: THEME_BASE, written: "", sampledAt: 0 };
try {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 2;
    tint.ctx = canvas.getContext("2d", { willReadFrequently: true });
} catch (e) {}

// The average colour of the top strip of a picture, or null where it can't be read
const tintSample = source => {
    const width = source.videoWidth || source.naturalWidth, height = source.videoHeight || source.naturalHeight;
    if (!tint.ctx || !width || !height) return null;
    try {
        tint.ctx.drawImage(source, 0, 0, width, Math.max(1, height * 0.12), 0, 0, 8, 2);
        const data = tint.ctx.getImageData(0, 0, 8, 2).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
        return sum.map(c => c / (data.length / 4));
    } catch (e) {
        return null;
    }
};

// As the glow shows it: saturated (like its saturate(1.4)), part-way over the page's dark, and
// never so bright that the bar's white clock and icons stop reading
const glowTone = rgb => {
    const luma = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const grey = luma(rgb);
    let tone = rgb.map((c, i) => THEME_BASE[i] + (Math.min(255, Math.max(0, grey + (c - grey) * 1.4)) - THEME_BASE[i]) * 0.55);
    const bright = luma(tone);
    if (bright > 96) tone = tone.map(c => c * 96 / bright);
    return tone;
};

const statusTick = () => {
    if (!themeMeta) return;
    if (!playerPage.classList.contains("ambient-on") || document.hidden) tint.target = THEME_BASE;
    else if (performance.now() - tint.sampledAt > 400) {
        tint.sampledAt = performance.now();
        const youtube = container.classList.contains("youtube");
        const id = youtube ? youTubeIdShown() : null;
        const source = youtube ? id && ambientThumb(id) : mainVideo.readyState >= 2 && mainVideo;
        const color = source ? tintSample(source) : null;
        if (color) tint.target = glowTone(color);
    }
    tint.now = tint.now.map((c, i) => c + (tint.target[i] - c) * 0.3);
    const hex = `#${tint.now.map(c => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
    if (hex !== tint.written) {
        tint.written = hex;
        themeMeta.setAttribute("content", hex);
    }
};
setInterval(statusTick, 150);

// ---------- Background play (phones and tablets): what happens to a video or song playing on your
// own when the browser is left (home button, another app, the screen turned off).
// - Picture in picture: the video floats over other apps where the phone allows it (Chrome does
//   for a fullscreen video, and when it asks the page); otherwise, and for YouTube (another site's
//   player can't float from here), the sound keeps playing
// - Sound only: the sound keeps playing, and the video doesn't float
// - Off: it pauses
// Phones may pause a page's media as it leaves the screen; a pause like that, straight after
// leaving, is undone (never one of the person's own, from the lock screen or headphones, or later
// on, like a call or unplugged headphones). In a room, the room's own rules apply (room.js).
const BACKGROUND_KEY = "cinetab:background";
const BACKGROUND_NOTE = "When you leave the browser or turn the screen off. Picture in picture floats the video over other apps where your phone allows it, and otherwise keeps the sound playing (a YouTube video keeps its sound). Play, pause and skip from the lock screen or the notification." +
    // Brave stops other sites' YouTube players in the background unless its own setting allows it
    (navigator.brave ? " In Brave, a YouTube video keeps playing only with Brave's own Background video playback turned on (Brave's settings, under Media); your own videos and songs play on either way." : "");
const backgroundChips = [["pip", "Picture in picture"], ["audio", "Sound only"], ["off", "Off (pause)"]].map(([mode, label]) => {
    const chip = el("li", null, label);
    chip.dataset.background = mode;
    chip.addEventListener("click", () => setBackground(mode, true));
    return chip;
});
const background = { mode: "pip", hiddenAt: 0, wasPlaying: false, resumes: 0, autoPausedAt: 0, autoPip: false, handoffTimer: null };
const backgroundLabel = () => (backgroundChips.find(chip => chip.dataset.background === background.mode) || backgroundChips[0]).textContent;

// What plays here on its own: "youtube", "file" or nothing (in a room: nothing)
const soloMedia = () => {
    if (together.active()) return null;
    if (together.solo && together.solo.active) return "youtube";
    return currentFile && !together.stream ? "file" : null;
};
const floating = () => !!document.pictureInPictureElement || mainVideo.webkitPresentationMode === "picture-in-picture" ||
    !!(window.documentPictureInPicture && window.documentPictureInPicture.window);

// Floats the video on the way out (without a tap, only where the browser allows it)
const autoPip = () => {
    if (soloMedia() !== "file" || container.classList.contains("audio-mode") || floating() || !document.pictureInPictureEnabled) return;
    mainVideo.disablePictureInPicture = false;
    mainVideo.requestPictureInPicture().then(() => background.autoPip = true, () => {});
};

const setBackground = (mode, announce = false) => {
    if (!backgroundChips.some(chip => chip.dataset.background === mode)) mode = "pip";
    background.mode = mode;
    backgroundChips.forEach(chip => chip.classList.toggle("active", chip.dataset.background === mode));
    if (isTouch) {
        // The phone's own floating window on leaving (a fullscreen video in Chrome) only with
        // Picture in picture; the PiP button floats it whatever this is
        if (!floating()) mainVideo.disablePictureInPicture = mode !== "pip";
        // Chrome asks the page for its floating window as the person leaves
        try {
            navigator.mediaSession.setActionHandler("enterpictureinpicture", mode === "pip" ? autoPip : null);
        } catch (e) {}
    }
    if (announce) {
        storage.set(BACKGROUND_KEY, mode);
        showFeedback(mode === "off" ? "fa-pause" : mode === "audio" ? "fa-headphones" : "fa-clone", `Background play: ${backgroundLabel()}`);
    }
    if (!playerSheet.hidden) renderSheet();
};
setBackground(storage.get(BACKGROUND_KEY) || "pip");
mainVideo.addEventListener("leavepictureinpicture", () => {
    if (isTouch) mainVideo.disablePictureInPicture = background.mode !== "pip";
});

// Whether a pause that just happened is the phone's, as the page left the screen, and is undone
// (`kind`: what paused, "file" or "youtube"); a few times at most, so it never fights the phone
together.keepPlaying = kind => isTouch && background.mode !== "off" && document.hidden && background.wasPlaying &&
    Date.now() - background.hiddenAt < 5000 && Date.now() - userPausedAt > 1500 && Date.now() - mediaKeyAt > 1500 &&
    soloMedia() === kind && background.resumes++ < 3;

// Sound only, the way every phone allows: some browsers (Brave, Safari) stop a page's video once
// it leaves the screen, but not its sound. So the sound goes on in a sound-only player, from the
// same file and the same moment, and the video carries on from where that got to when the page is
// back. Meanwhile the lock screen's buttons work on that player.
const bgAudio = document.createElement("audio");
bgAudio.preload = "auto";
const handoff = { on: false, primed: false };

// A sound-only player some phones (iPhones) only let play later on if it played once on a tap:
// on the first tap with a file open, it plays it silently for a moment
document.addEventListener("touchend", () => {
    if (handoff.primed || handoff.on || !currentURL || together.active()) return;
    handoff.primed = true;
    bgAudio.muted = true;
    bgAudio.src = currentURL;
    bgAudio.play().then(() => bgAudio.pause(), () => handoff.primed = false).finally(() => {
        if (!handoff.on) bgAudio.muted = false;
    });
}, { passive: true });

const handToAudio = () => {
    if (handoff.on || soloMedia() !== "file" || !currentURL || mainVideo.ended || floating()) return;
    handoff.on = true;
    handoff.at = Date.now();
    if (bgAudio.src !== currentURL) bgAudio.src = currentURL;
    bgAudio.currentTime = mainVideo.currentTime;
    bgAudio.playbackRate = mainVideo.playbackRate;
    bgAudio.volume = mainVideo.volume;
    bgAudio.muted = mainVideo.muted;
    bgAudio.play().then(() => {
        if (!handoff.on) return bgAudio.pause();
        // The video waits (and stays where it was, so the sound doesn't play twice)
        mainVideo.pause();
        updateMediaSession();
    }, () => {
        if (!handoff.on) return;
        handoff.on = false;
        // Paused meanwhile (the lock screen): so is the video. Otherwise not allowed: the video's
        // own sound goes on where the browser lets it.
        if (userPausedAt >= handoff.at) mainVideo.pause();
        else if (mainVideo.paused) mainVideo.play().catch(() => {});
    });
};

// Back to the video, from where the sound got to
const backFromAudio = () => {
    if (!handoff.on) return;
    handoff.on = false;
    const playing = !bgAudio.paused && !bgAudio.ended;
    const time = bgAudio.ended ? mainVideo.duration : bgAudio.currentTime;
    bgAudio.pause();
    if (Number.isFinite(time)) mainVideo.currentTime = time;
    if (playing) mainVideo.play().catch(() => {});
    updateMediaSession();
};
// A new file or a room: the sound-only player lets go
["emptied", "loadstart"].forEach(type => mainVideo.addEventListener(type, () => {
    if (!handoff.on) return;
    handoff.on = false;
    bgAudio.pause();
}));
["play", "pause", "ratechange", "seeked"].forEach(type => bgAudio.addEventListener(type, () => handoff.on && updateMediaSession()));
// Where you are, for opening the file again later (as the video does)
bgAudio.addEventListener("pause", () => handoff.on && currentFileKey && storage.set(currentFileKey, bgAudio.currentTime));
// The lock screen's buttons, while the sound plays on its own (see togglePlay, seek, seekTo)
// (and a YouTube video's sound, carried on by the page's own audio player: ytSound)
handoffMedia = () => handoff.on ? bgAudio : ytSound.on ? sessionKeeper : null;

mainVideo.addEventListener("pause", () => {
    if (mainVideo.ended || handoff.on) return;
    if (Date.now() - userPausedAt > 1500) background.autoPausedAt = Date.now();
    // Paused by the phone as the page left the screen: on as sound
    if (together.keepPlaying("file")) handToAudio();
});

document.addEventListener("visibilitychange", () => {
    if (!isTouch) return;
    clearTimeout(background.handoffTimer);
    if (!document.hidden) {
        // Back: a floating window opened on the way out closes again, and the video takes over
        // from the sound
        if (background.autoPip && document.pictureInPictureElement === mainVideo) document.exitPictureInPicture().catch(() => {});
        background.autoPip = false;
        backFromAudio();
        return;
    }
    background.hiddenAt = Date.now();
    background.resumes = 0;
    const what = soloMedia();
    // Some phones pause just before the page is hidden: that counts as playing
    const playing = what === "youtube" ? !together.solo.paused
        : what === "file" && !mainVideo.ended && (!mainVideo.paused || Date.now() - background.autoPausedAt < 1000);
    background.wasPlaying = playing;
    // Floating already (the PiP button): it goes on as it is
    if (!playing || floating()) return;
    if (background.mode === "off") {
        if (what === "youtube") together.solo.pause();
        else mainVideo.pause();
        return;
    }
    if (what !== "file") return;
    // A song (no picture) plays on as it is; a video's sound goes on in the sound-only player:
    // straight away, or with Picture in picture once it's clear the video didn't float
    if (container.classList.contains("audio-mode")) {
        if (mainVideo.paused && together.keepPlaying("file")) mainVideo.play().catch(() => {});
        return;
    }
    if (background.mode === "pip" && document.pictureInPictureEnabled && !/iP(hone|ad|od)/.test(navigator.userAgent)) {
        // (floating where the phone allows it; refused - or not floating soon - the sound goes on)
        autoPip();
        background.handoffTimer = setTimeout(() => document.hidden && !floating() && handToAudio(), 900);
        mainVideo.addEventListener("pause", () => document.hidden && !floating() && handToAudio(), { once: true });
    } else handToAudio();
});

// Touch: a tap shows or hides the controls (play / pause is the big button in the middle); a
// double tap on the left or right third jumps back or forward 10 seconds, while a middle double
// tap enters fullscreen.
let lastTap = { at: 0, x: 0 };
let tapTimer = null;
let touchedAt = 0;
let pinchStartDistance = 0;
let pinchScale = 1;
let pinching = false;
let mobileSwipe = null;
let mobileBrightness = 1;

const toggleControls = () => {
    clearTimeout(idleTimer);
    if (container.classList.contains("show-controls")) {
        hideTooltip();
        container.classList.remove("show-controls");
    } else {
        container.classList.add("show-controls");
        hideControls();
    }
};

// Touch gestures work on the video, and on the layer over a room's YouTube player
const gestureSurfaces = [mainVideo, container.querySelector(".yt-shield")];
const onSurface = (type, handler, options) => gestureSurfaces.forEach(surface => surface.addEventListener(type, handler, options));

// Where a touch started: a finger that moved was a swipe (volume, brightness, fullscreen), not a tap
let touchStart = null;
onSurface("pointerdown", e => {
    if (e.pointerType === "touch") touchStart = { x: e.clientX, y: e.clientY };
});

// Double taps on one side jump 10 seconds; more taps straight after keep going (-20s, -30s…),
// shown as a ripple on that side, like YouTube
const seekRipples = { left: container.querySelector(".seek-ripple.left"), right: container.querySelector(".seek-ripple.right") };
let seekStreak = null;
const rippleSeek = side => {
    const seconds = side === "left" ? -10 : 10;
    if (!seek(seconds, false)) return;
    const streak = seekStreak && seekStreak.side === side ? seekStreak : { side, total: 0 };
    clearTimeout(streak.timer);
    streak.total += seconds;
    streak.until = Date.now() + 650;
    streak.timer = setTimeout(() => {
        ripple.classList.remove("show");
        if (seekStreak === streak) seekStreak = null;
    }, 650);
    seekStreak = streak;
    const ripple = seekRipples[side];
    Object.values(seekRipples).forEach(other => other !== ripple && other.classList.remove("show"));
    ripple.querySelector("span").textContent = `${Math.abs(streak.total)} seconds`;
    // Each tap pulses again
    ripple.classList.remove("show", "pulse");
    void ripple.offsetWidth;
    ripple.classList.add("show", "pulse");
};

onSurface("pointerup", e => {
    if (e.pointerType !== "touch" || pinching) return;
    const moved = touchStart && Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) > 14;
    touchStart = null;
    if (moved) {
        touchedAt = Date.now();
        return;
    }
    touchedAt = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const side = x < rect.width / 3 ? "left" : x > rect.width * 2 / 3 ? "right" : null;
    // Still jumping: every tap on that side is another 10 seconds
    if (seekStreak && side === seekStreak.side && touchedAt < seekStreak.until) {
        clearTimeout(tapTimer);
        lastTap.at = 0;
        return rippleSeek(side);
    }
    if (touchedAt - lastTap.at < 300 && Math.abs(x - lastTap.x) < 60) {
        clearTimeout(tapTimer);
        lastTap.at = 0;
        if (side) rippleSeek(side);
        else toggleFullscreen();
        return;
    }
    lastTap = { at: touchedAt, x };
    tapTimer = setTimeout(toggleControls, 300);
});

const pinchDistance = touches => {
    const [first, second] = touches;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};

// Pinch: spread two fingers to fill the screen, pinch them together to fit the whole picture.
// It's the same setting as Picture in the menus (Fit / Fill), and it's remembered.
onSurface("touchstart", e => {
    if (e.touches.length !== 2) return;
    pinchStartDistance = pinchDistance(e.touches);
    pinchScale = 1;
    pinching = true;
    mobileSwipe = null;
    clearTimeout(tapTimer);
}, { passive: true });

onSurface("touchmove", e => {
    if (!pinching || e.touches.length !== 2) return;
    pinchScale = pinchDistance(e.touches) / pinchStartDistance;
    e.preventDefault();
}, { passive: false });

onSurface("touchend", e => {
    if (!pinching) return;
    // Decided when the fingers lift, once
    if (e.touches.length) return;
    if (pinchScale > 1.08) setAspect("fill", true);
    else if (pinchScale < 0.92) setAspect("fit", true);
    pinchStartDistance = 0;
    pinchScale = 1;
    pinching = false;
    touchedAt = Date.now();
}, { passive: true });

const mobileBrightnessLayer = container.querySelector(".mobile-brightness");
const mobileBrightnessAdjustment = container.querySelector(".mobile-brightness-adjustment");
const mobileVolumeAdjustment = container.querySelector(".mobile-volume-adjustment");
let mobileAdjustmentTimer = null;
const updateMobileBrightness = value => {
    mobileBrightness = Math.max(0.2, Math.min(1, value));
    mobileBrightnessLayer.style.opacity = String(1 - mobileBrightness);
};
// The sound as one number for swipes: 0-1 is the volume, 1-2 the boost from 100% to 300%, so
// swiping up past full volume turns the boost up, and the menus' Volume boost shows it
const soundLevel = () => {
    if (container.classList.contains("youtube")) return mainVideo.volume;
    return boost.level > 1 ? 1 + (boost.level - 1) / 2 : mainVideo.volume;
};
const setSoundLevel = value => {
    const isYouTube = container.classList.contains("youtube");
    const maxLevel = isYouTube ? 1 : 2;
    const level = Math.max(0, Math.min(maxLevel, value));
    if (level <= 1 || isYouTube) {
        if (boost.level > 1) setBoost(1, false);
        setVolume(Math.round(Math.min(1, level) * 100) / 100);
    } else {
        if (mainVideo.volume < 1) setVolume(1);
        // In steps of 5%, so the presets (150%, 200%, 300%) can be landed on
        setBoost(Math.round((1 + (level - 1) * 2) * 20) / 20, false);
    }
};

const showMobileAdjustment = (kind, value) => {
    const adjustment = kind === "brightness" ? mobileBrightnessAdjustment : mobileVolumeAdjustment;
    const icon = adjustment.querySelector("i");
    const fill = adjustment.querySelector(".mobile-adjustment-fill");
    const label = adjustment.querySelector("span");
    const isYouTube = container.classList.contains("youtube");
    const boosted = !isYouTube && kind === "volume" && value > 1;
    let percent = 0;
    if (kind === "brightness") {
        percent = Math.round(value * 100);
        fill.style.height = `${percent}%`;
    } else {
        if (isYouTube) {
            percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
            fill.style.height = `${percent}%`;
        } else {
            percent = Math.round(value <= 1 ? value * 100 : 100 + (value - 1) * 200);
            fill.style.height = `${value * 50}%`;
        }
    }
    icon.className = `fa-solid ${kind === "brightness" ? "fa-sun" : !value ? "fa-volume-xmark" : value < 0.5 ? "fa-volume-low" : "fa-volume-high"}`;
    label.textContent = String(percent);
    adjustment.classList.toggle("boosted", boosted);
    mobileBrightnessAdjustment.classList.toggle("show", kind === "brightness");
    mobileVolumeAdjustment.classList.toggle("show", kind === "volume");
    clearTimeout(mobileAdjustmentTimer);
    mobileAdjustmentTimer = setTimeout(() => {
        mobileBrightnessAdjustment.classList.remove("show");
        mobileVolumeAdjustment.classList.remove("show");
    }, 700);
};

// Fullscreen swipes, like MX Player: up and down on the left half is the brightness, on the right
// half the volume. (No swipe enters or leaves fullscreen: that's the button or a double tap.)
onSurface("touchstart", e => {
    if (e.touches.length !== 1 || !fullscreenElement() || pinching) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const left = touch.clientX - rect.left < rect.width / 2;
    mobileSwipe = {
        x: touch.clientX,
        y: touch.clientY,
        kind: left ? "brightness" : "volume",
        startValue: left ? mobileBrightness : soundLevel(),
        handled: false
    };
}, { passive: true });

onSurface("touchmove", e => {
    if (!mobileSwipe || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - mobileSwipe.x;
    const dy = touch.clientY - mobileSwipe.y;
    if (!mobileSwipe.handled) {
        if (Math.abs(dy) < 12) return;
        // Mostly sideways: not a brightness or volume swipe
        if (Math.abs(dy) < Math.abs(dx) * 1.2) {
            mobileSwipe = null;
            return;
        }
        mobileSwipe.handled = true;
        // Counted from here, so the value doesn't jump by the first 12px
        mobileSwipe.y = touch.clientY;
    }
    const moved = touch.clientY - mobileSwipe.y;
    if (mobileSwipe.kind === "brightness") {
        updateMobileBrightness(mobileSwipe.startValue - moved / 300);
        showMobileAdjustment("brightness", mobileBrightness);
    } else {
        setSoundLevel(mobileSwipe.startValue - moved / 250);
        showMobileAdjustment("volume", soundLevel());
    }
    e.preventDefault();
}, { passive: false });

onSurface("touchend", () => {
    // Lifting the finger is what lets the browser start the boost's sound
    if (mobileSwipe?.handled && boost.ctx && boost.ctx.state !== "running") boost.ctx.resume().catch(() => {});
    mobileSwipe = null;
}, { passive: true });

onSurface("touchcancel", () => {
    mobileSwipe = null;
    pinching = false;
    pinchStartDistance = 0;
    pinchScale = 1;
}, { passive: true });

// A click plays or pauses, a double click is fullscreen (on the video, and the layer over YouTube's)
onSurface("click", () => {
    if (Date.now() - touchedAt < 700) return;
    if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        toggleFullscreen();
    } else {
        clickTimeout = setTimeout(() => {
            clickTimeout = null;
            togglePlay();
        }, 250);
    }
});

// I on the home page while the miniplayer plays: back to the player
document.addEventListener("keydown", e => {
    if (e.code !== "KeyI" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (!playerPage.hidden || !playerPage.classList.contains("miniplayer")) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
    const expand = document.querySelector(".room-home-bar.mini .room-home-expand");
    // (and the player's own shortcuts below don't take this same I as "into the miniplayer" again)
    if (expand) { e.preventDefault(); e.stopImmediatePropagation(); expand.click(); }
});

// Keyboard Shortcuts
document.addEventListener("keydown", e => {
    if (playerPage.hidden) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // A clicked control keeps focus; drop it so Space doesn't also "click" that button
    if (document.activeElement.tagName === "BUTTON") document.activeElement.blur();

    switch(e.code) {
        case "Space":
        case "KeyK":
            e.preventDefault();
            togglePlay();
            break;

        case "ArrowLeft":
            e.preventDefault();
            seek(-5);
            break;

        case "ArrowRight":
            e.preventDefault();
            seek(5);
            break;

        case "KeyJ":
            seek(-10);
            break;

        case "KeyL":
            seek(10);
            break;

        case "ArrowUp":
            e.preventDefault();
            stepVolume(1);
            break;

        case "ArrowDown":
            e.preventDefault();
            stepVolume(-1);
            break;

        case "KeyF":
            toggleFullscreen();
            break;

        // T: the picture's shape - Fit (all of it) / Fill (cropped to the screen)
        case "KeyT":
            if (e.shiftKey || container.classList.contains("audio-mode-only")) break;
            setAspect(container.classList.contains("aspect-fill") ? "fit" : "fill", true);
            break;

        // M: your microphone on/off (in a room); Shift + M: the player's sound on/off, always
        case "KeyM":
            if (!e.shiftKey) {
                if (!together.active() || !together.toggleMic || !together.toggleMic()) showFeedback("fa-microphone-slash", "Not in a room");
                break;
            }
            if (mainVideo.volume > 0) {
                setVolume(0);
                showFeedback("fa-volume-xmark", "Muted");
            } else {
                setVolume(1);
                showFeedback("fa-volume-high", "100%");
            }
            break;

        case "KeyP":
            if (e.shiftKey) {
                if (together.step) together.step(-1);
                break;
            }
            toggleCustomPiP();
            break;

        case "KeyN":
            if (e.shiftKey && together.step) together.step(1);
            break;

        // S: save this video (or its playlist) - the heart's own choices where it has them
        case "KeyS": {
            if (e.shiftKey) break;
            const save = container.querySelector(".player-save-wrap:not([hidden]) .player-save-btn");
            if (save) {
                // (the controls hidden - the heart with them: they come up, and the heart lights up,
                // so you see what S did)
                if (!container.classList.contains("show-controls")) {
                    container.classList.add("show-controls");
                    container.classList.remove("hide-cursor");
                    hideControls();
                }
                save.click();
                save.classList.remove("save-flash");
                void save.offsetWidth;
                save.classList.add("save-flash");
                clearTimeout(save.flashTimer);
                save.flashTimer = setTimeout(() => save.classList.remove("save-flash"), 1300);
            }
            else showFeedback("fa-heart", "Nothing to save here");
            break;
        }

        // H: everyone's video shown / hidden (only while someone's video is on; otherwise nothing)
        case "KeyH":
            if (e.shiftKey) break;
            if (together.toggleCallVideos) together.toggleCallVideos();
            break;

        // U: the call's video pinned / floating
        case "KeyU": {
            if (e.shiftKey || !together.toggleCallFloat) break;
            const refused = together.toggleCallFloat();
            if (refused) showFeedback("fa-video", refused);
            break;
        }

        // Shift + V: your camera on/off (in a room)
        case "KeyV":
            if (!e.shiftKey) break;
            if (!together.active() || !together.toggleCam || !together.toggleCam()) showFeedback("fa-video-slash", "Not in a room");
            break;

        // A: video / audio mode (the listener's choice: it holds for the next videos too)
        case "KeyA": {
            if (e.shiftKey || !window.CineAudioMode) break;
            const mode = window.CineAudioMode;
            if (!mode.canToggle) {
                if (mode.active) showFeedback("fa-headphones", "This plays in audio only");
                break;
            }
            mode.toggle();
            showFeedback(mode.active ? "fa-headphones" : "fa-video", mode.active ? "Audio mode" : "Video mode");
            break;
        }

        // I: into the miniplayer (the video goes on in a corner of the home page); not in audio mode.
        // (I again, from the home page, opens the player back: the listener below)
        case "KeyI": {
            if (e.shiftKey) break;
            const mini = container.querySelector(".solo-miniplayer-toggle");
            if (container.classList.contains("audio-mode-only")) showFeedback("fa-headphones", "No miniplayer in audio mode");
            else if (mini && !mini.hidden) mini.click();
            break;
        }

        case "KeyC":
            toggleSubtitles();
            break;

        // The video call window: pinned to the side, or floating again (a phone: its call bar)
        case "KeyD": {
            if (e.shiftKey) break;
            const refused = together.toggleCallDock ? together.toggleCallDock() : "Not in a room";
            if (refused) showFeedback("fa-video", refused);
            break;
        }

        // Queue panel: show or hide it
        case "KeyQ":
            if (e.shiftKey) break;
            if (together.toggleQueue) together.toggleQueue();
            break;

        // The room's panel: show or hide it (outside a room: the Watch together options)
        case "KeyR":
            if (e.shiftKey) break;
            shareHelpBtn.click();
            break;

        case "Period":
            if (e.shiftKey) setSpeed(mainVideo.playbackRate + 0.25); // Shift + >
            break;

        case "Comma":
            if (e.shiftKey) setSpeed(mainVideo.playbackRate - 0.25); // Shift + <
            break;

        case "Slash":
            if (e.shiftKey) toggleShortcuts(); // ?
            else {
                // Search and commands
                e.preventDefault();
                cmdPalette.open();
            }
            break;
    }

    if (e.code.startsWith("Digit") && !e.shiftKey && mediaDuration()) {
        const digit = parseInt(e.key);
        if (!isNaN(digit)) {
            const target = (digit / 10) * mediaDuration();
            const back = target < mediaTime();
            seekTo(target);
            showFeedback(back ? "fa-backward" : "fa-forward", `${digit * 10}%`);
        }
    }
});

// ---------- Search and commands: the button at the player's top right, Ctrl+K (⌘K) or /. One box
// to search YouTube, play (or, in a room, queue) a pasted link, or run anything the player does:
// fullscreen, subtitles, a speed, a time to jump to, the room's panel, your mic... Typing filters
// the commands (Enter runs the first, or the one chosen with ↑ ↓); words no command has search
// YouTube. "1:23" jumps there, "1.5x" plays at that speed, "40%" jumps to 40%. Phones, tablets and
// computers alike: a sheet from the top on a small screen, a box near the top on a large one.
const cmdPalette = (() => {
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    };
    const iconButton = (className, icon, label) => {
        const button = make("button", className);
        button.type = "button";
        button.title = label;
        button.setAttribute("aria-label", label);
        button.append(make("i", icon));
        return button;
    };
    const searchBtn = container.querySelector(".player-search-btn");
    const youtube = () => !!window.CineYouTube;

    const overlay = make("div", "cmd-overlay");
    overlay.hidden = true;
    const box = make("div", "cmd-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Search and commands");
    const form = make("form", "cmd-form");
    form.noValidate = true;
    form.setAttribute("role", "search");
    const input = make("input", "cmd-input");
    input.type = "search";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = 300;
    input.setAttribute("enterkeyhint", "search");
    input.setAttribute("aria-autocomplete", "list");
    const pasteBtn = iconButton("cmd-icon-btn cmd-paste", "fa-regular fa-paste", "Paste a link you copied");
    const closeBtn = iconButton("cmd-icon-btn cmd-close", "fa-solid fa-xmark", "Close (Esc)");
    form.append(make("i", "fa-solid fa-magnifying-glass cmd-glass"), input, pasteBtn, closeBtn);
    const body = make("div", "cmd-body");
    const note = make("p", "cmd-note");
    note.setAttribute("aria-live", "polite");
    note.hidden = true;
    // A pasted link: what it is, and what to do with it
    const link = make("div", "cmd-link");
    link.hidden = true;
    const linkThumb = make("span", "cmd-link-thumb");
    const linkKind = make("small", "cmd-link-kind");
    const linkTitle = make("b", "cmd-link-title");
    const linkInfo = make("span", "cmd-link-info");
    linkInfo.append(linkKind, linkTitle);
    const linkMain = make("div", "cmd-link-main");
    linkMain.append(linkThumb, linkInfo);
    const linkWhole = make("label", "cmd-link-whole");
    const linkWholeBox = make("input");
    linkWholeBox.type = "checkbox";
    linkWholeBox.checked = true;
    const linkWholeText = make("span");
    linkWhole.append(linkWholeBox, linkWholeText);
    const linkActions = make("div", "cmd-link-actions");
    link.append(linkMain, linkWhole, linkActions);
    // Commands (and "Search YouTube for …")
    const list = make("ul", "cmd-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Commands");
    // Recently played (the last 20) and Saved (YouTube videos and playlists kept with a heart):
    // each a row of pictures with their titles below, scrolling across
    const cardSection = (title, extra = "") => {
        const box = make("section", `cmd-recent${extra}`);
        box.hidden = true;
        box.append(make("p", "cmd-recent-title", title));
        const row = make("div", "cmd-recent-row");
        row.setAttribute("role", "listbox");
        row.setAttribute("aria-label", title);
        // Arrows at its ends (with a mouse): move it a page left or right; each shows while there's
        // more that way
        const rail = make("div", "cmd-recent-rail");
        const arrow = dir => {
            const button = make("button", `cmd-recent-arrow ${dir < 0 ? "prev" : "next"}`);
            button.type = "button";
            button.tabIndex = -1;
            button.title = dir < 0 ? "Scroll left" : "Scroll right";
            button.setAttribute("aria-label", `${button.title}: ${title}`);
            button.append(make("i", `fa-solid ${dir < 0 ? "fa-chevron-left" : "fa-chevron-right"}`));
            button.addEventListener("click", e => {
                e.stopPropagation();
                row.scrollBy({ left: dir * Math.max(160, row.clientWidth * 0.8), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            });
            return button;
        };
        rail.append(arrow(-1), row, arrow(1));
        box.append(rail);
        return [box, row];
    };
    // (an arrow shows while the row goes on that way)
    const paintArrows = row => {
        const rail = row.parentNode;
        const max = row.scrollWidth - row.clientWidth;
        rail.classList.toggle("can-prev", max > 2 && row.scrollLeft > 2);
        rail.classList.toggle("can-next", max > 2 && row.scrollLeft < max - 2);
    };
    const [recentBox, recentRow] = cardSection("Recently played");
    const [savedBox, savedRow] = cardSection("Saved", " cmd-saved");
    const resultsHost = make("div", "yt-results cmd-results");
    body.append(note, link, list, recentBox, savedBox, resultsHost);
    const foot = make("div", "cmd-foot");
    foot.innerHTML = "<span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>Enter</kbd> play or search</span><span><kbd>Esc</kbd> back · close</span>";
    // One row of pills - where to search: YouTube, Music, Playlist - and Clear (only once results show)
    const filterHead = make("div", "yt-results-head");
    const kinds = make("div", "yt-kinds");
    kinds.setAttribute("role", "radiogroup");
    kinds.setAttribute("aria-label", "Show");

    const kindButton = (kind, label, icon, iconBrand = false) => {
        const button = make("button", `yt-kind${kind === "video" ? " active" : ""}`);
        button.type = "button";
        button.dataset.kind = kind;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", kind === "video" ? "true" : "false");
        button.innerHTML = `<i class="${iconBrand ? "fa-brands" : "fa-solid"} ${icon}"></i><span>${label}</span>`;
        return button;
    };

    const ytBtn = kindButton("video", "YouTube", "fa-youtube", true);
    const musicBtn = kindButton("music", "Music", "fa-music", false);
    const playlistBtn = kindButton("playlist", "Playlist", "fa-youtube", true);
    kinds.append(ytBtn, musicBtn, playlistBtn);

    const clearFilterBtn = make("button", "yt-results-close");
    clearFilterBtn.type = "button";
    clearFilterBtn.title = "Clear the search and its results (Esc)";
    clearFilterBtn.setAttribute("aria-label", "Clear the search");
    clearFilterBtn.innerHTML = '<i class="fa-solid fa-xmark"></i><span>Clear</span>';
    // (only once a search has its answer - not while it loads; the pills stay, to search again
    // somewhere else)
    clearFilterBtn.hidden = true;
    const syncClear = () => {
        clearFilterBtn.hidden = !(results && results.open && !results.busy);
    };

    filterHead.append(kinds, clearFilterBtn);

    let activeSearchMode = "video";
    const setSearchPillMode = mode => {
        activeSearchMode = mode;
        [ytBtn, musicBtn, playlistBtn].forEach(btn => {
            const on = btn.dataset.kind === mode;
            btn.classList.toggle("active", on);
            btn.setAttribute("aria-checked", on ? "true" : "false");
        });
        if (results && results.setKind) results.setKind(mode);
        if (mode === "music") {
            input.placeholder = "Search YouTube Music or paste song link…";
        } else if (mode === "playlist") {
            input.placeholder = "Search YouTube playlists…";
        } else {
            input.placeholder = youtube() ? "Search YouTube, paste a link, or pick recent…" : "Paste a link or pick a recent video…";
        }
    };

    kinds.addEventListener("click", e => {
        const btn = e.target.closest(".yt-kind");
        if (!btn) return;
        const mode = btn.dataset.kind;
        setSearchPillMode(mode);
        const val = input.value.trim();
        if (val) {
            searchYouTube(val, mode);
        } else {
            input.focus();
        }
    });

    clearFilterBtn.addEventListener("click", () => {
        backToStart();
    });

    box.append(form, filterHead, body, foot);
    overlay.append(box);
    document.body.append(overlay);

    const showNote = (text = "", error = false) => {
        note.textContent = "";
        note.hidden = true;
        if (text) window.CineToast(text, { key: "launcher-notice", tone: error ? "error" : "info" });
        else window.CineToast.dismiss("launcher-notice");
    };

    // ---------- Recent videos from history
    const recentVideos = () => {
        if (!window.CineHistory) return [];
        const list = CineHistory.list() || [];
        return list.slice(0, 20).map(entry => {
            const isYt = entry.type === "video" || entry.type === "playlist";
            const playlist = entry.type === "playlist";
            const title = entry.title || entry.name || (isYt ? "YouTube video" : "Video file");
            const icon = playlist ? "fa-list" : isYt ? "fa-brands fa-youtube" : "fa-film";
            let meta = "";
            if (playlist) {
                meta = [entry.channel, entry.count ? `${entry.count} videos` : "Playlist"].filter(Boolean).join(" · ");
            }
            const searchMeta = [entry.channel, entry.type === "file" ? "Local file" : "", meta].filter(Boolean).join(" ");
            const durationLabel = !playlist && entry.live ? "LIVE" : !playlist && entry.duration > 0 ? formatTime(entry.duration) : "";
            const thumbId = isYt ? entry.id || null : null;
            return {
                label: title,
                meta,
                searchMeta,
                durationLabel,
                icon,
                recent: true,
                entry,
                thumb: thumbId ? `https://i.ytimg.com/vi/${thumbId}/mqdefault.jpg` : "",
                progress: entry.time > 5 && entry.duration > 0 ? Math.min(1, entry.time / entry.duration) : 0,
                run: async () => {
                    close();
                    if (entry.type === "file") {
                        if (window.CineHistory && CineHistory.handles) {
                            const handle = await CineHistory.getHandle(entry.k);
                            if (handle) {
                                try {
                                    let permission = await handle.queryPermission({ mode: "read" });
                                    if (permission !== "granted") permission = await handle.requestPermission({ mode: "read" });
                                    if (permission === "granted") {
                                        const file = await handle.getFile();
                                        return loadVideoFile(file, handle);
                                    }
                                } catch (e) {}
                            }
                        }
                        fileInput.click();
                    } else if (isYt) {
                        pick({ id: entry.id || null, list: entry.list || null, start: entry.time || 0 }, "play", {
                            title: entry.title,
                            channel: entry.channel
                        });
                    }
                }
            };
        });
    };

    // ---------- Saved YouTube videos and playlists (history.js), newest first: played from the start
    const savedVideos = () => {
        if (!window.CineSaved || !youtube()) return [];
        return (CineSaved.list() || []).slice(0, 40).map(entry => {
            const playlist = entry.type === "playlist";
            const meta = playlist ? [entry.channel, entry.count ? `${entry.count} videos` : "Playlist"].filter(Boolean).join(" · ") : "";
            return {
                label: entry.title || (playlist ? "YouTube playlist" : "YouTube video"),
                meta,
                searchMeta: entry.channel || "",
                durationLabel: !playlist && entry.live ? "LIVE" : !playlist && entry.duration > 0 ? formatTime(entry.duration) : "",
                icon: playlist ? "fa-list" : "fa-brands fa-youtube",
                saved: true,
                entry,
                thumb: entry.id ? `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg` : "",
                progress: 0,
                run: () => pick({ id: entry.id || null, list: playlist ? entry.list : null, start: 0 }, "play", playlist
                    ? { listTitle: entry.title, channel: entry.channel, count: entry.count }
                    : { title: entry.title, channel: entry.channel, live: !!entry.live })
            };
        });
    };

    // ---------- The player's commands, as things are now (and the room's, from room.js)
    const step = dir => container.querySelector(dir > 0 ? ".next-track" : ".prev-track");
    const playerCommands = () => {
        const paused = mediaPaused();
        const inRoom = together.active();
        const canStep = dir => { const button = step(dir); return !!button && !button.hidden && !button.disabled; };
        return [
            { label: paused ? "Play" : "Pause", icon: paused ? "fa-play" : "fa-pause", keys: ["Space"], words: "play pause resume stop", top: true, run: togglePlay },
            { label: "Open a video from this device", icon: "fa-folder-open", words: "open file browse movie local video choose", top: true, run: () => fileInput.click() },
            !container.classList.contains("audio-mode-only") && { label: fullscreenElement() ? "Leave fullscreen" : "Fullscreen", icon: fullscreenElement() ? "fa-compress" : "fa-expand", keys: ["F"], words: "fullscreen full screen big", top: true, run: toggleFullscreen },
            window.CineAudioMode && window.CineAudioMode.canToggle && { label: window.CineAudioMode.active ? "Switch to video mode" : "Switch to audio mode", icon: window.CineAudioMode.active ? "fa-video" : "fa-headphones", keys: ["A"], words: "audio video mode music listen sound only switch", top: true, run: () => window.CineAudioMode.toggle() },
            { label: "Picture in picture", icon: "fa-clone", keys: ["P"], words: "pip picture float mini window popup", top: !isTouch, run: toggleCustomPiP },
            { label: "Subtitles on / off", icon: "fa-closed-captioning", keys: ["C"], words: "subtitles captions cc", top: true, run: toggleSubtitles },
            { label: "Choose a subtitle file", icon: "fa-file-lines", words: "subtitles captions srt vtt file add", run: () => subtitleInput.click() },
            { label: mainVideo.volume > 0 ? "Mute" : "Unmute", icon: mainVideo.volume > 0 ? "fa-volume-xmark" : "fa-volume-high", keys: ["Shift", "M"], words: "mute unmute sound volume silent", run: () => setVolume(mainVideo.volume > 0 ? 0 : 1) },
            { label: "Back 10 seconds", icon: "fa-rotate-left", keys: ["J"], words: "back rewind backward 10 seconds", run: () => seek(-10) },
            { label: "Forward 10 seconds", icon: "fa-rotate-right", keys: ["L"], words: "forward skip ahead 10 seconds", run: () => seek(10) },
            canStep(1) && { label: "Next video", icon: "fa-forward-step", keys: ["Shift", "N"], words: "next video skip queue playlist", top: true, run: () => step(1).click() },
            canStep(-1) && { label: "Previous video", icon: "fa-backward-step", keys: ["Shift", "P"], words: "previous video back queue playlist", run: () => step(-1).click() },
            ...[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => ({
                label: rate === 1 ? "Normal speed" : `Speed ${rate}x`, icon: "fa-gauge-high", speed: true,
                words: `speed rate playback ${rate}x ${rate < 1 ? "slow slower" : rate > 1 ? "fast faster" : "normal"}`, run: () => setSpeed(rate)
            })),
            { label: inRoom ? "The room's panel" : "Watch together", icon: "fa-users", keys: ["R"], words: "watch together room friends party panel chat invite", top: !inRoom, run: () => shareHelpBtn.click() },
            ...(together.roomCommands ? together.roomCommands().map((command, i) => ({ ...command, top: i < 3 })) : []),
            { label: "Keyboard shortcuts", icon: "fa-keyboard", keys: ["?"], words: "keyboard shortcuts keys help", run: toggleShortcuts },
            { label: "Player tour", icon: "fa-route", words: "tour guide help tips walkthrough intro how to start", run: () => setTimeout(() => startPlayerTour(true), 150) },
            { label: "Back to home", icon: "fa-house", words: "home back dashboard exit", run: () => (playerHomeBtn || playerBackBtn).click() }
        ].filter(Boolean);
    };

    // What's typed, as a command of its own: a time ("1:23", "1h2m"), a speed ("1.5x"), a share ("40%")
    const typedCommands = query => {
        const out = [];
        const clock = query.match(/^(?:go\s*to\s*|jump\s*to\s*|at\s*)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/i);
        const units = query.match(/^(?:go\s*to\s*|jump\s*to\s*)?(?:(\d{1,2})h\s*)?(?:(\d{1,3})m\s*)?(?:(\d{1,3})s)?$/i);
        let seconds = null;
        if (clock) seconds = (+(clock[1] || 0)) * 3600 + (+clock[2]) * 60 + (+clock[3]);
        else if (units && (units[1] || units[2] || units[3])) seconds = (+(units[1] || 0)) * 3600 + (+(units[2] || 0)) * 60 + (+(units[3] || 0));
        const duration = mediaDuration();
        if (seconds !== null && Number.isFinite(duration) && duration > 0) {
            const at = Math.min(seconds, duration);
            out.push({ label: `Jump to ${formatTime(at)}`, icon: "fa-clock", run: () => seekTo(at) });
        }
        const speed = query.match(/^(?:speed\s*)?(\d+(?:\.\d+)?)\s*x$/i) || query.match(/^speed\s+(\d+(?:\.\d+)?)$/i);
        if (speed) {
            const rate = +speed[1];
            if (rate >= 0.25 && rate <= 4) out.push({ label: `Play at ${rate}x`, icon: "fa-gauge-high", speed: true, run: () => setSpeed(rate) });
        }
        const share = query.match(/^(?:go\s*to\s*|jump\s*to\s*)?(\d{1,3})\s*%$/);
        if (share && +share[1] <= 100 && Number.isFinite(duration) && duration > 0) {
            out.push({ label: `Jump to ${share[1]}%`, icon: "fa-forward", run: () => seekTo(duration * share[1] / 100) });
        }
        return out;
    };

    // ---------- The list: only recent videos and search (commands work when entered, but do not show)
    let items = [];
    // (what YouTube was last searched for here)
    let searchedFor = "";
    let chosen = 0;
    let freshChoice = true;
    const matches = (command, words) => {
        const hay = `${command.label} ${command.words || ""}`.toLowerCase();
        return words.every(word => hay.includes(word));
    };
    const renderList = () => {
        const query = input.value.trim();
        const allRecent = recentVideos();
        const allSaved = savedVideos();
        let preferred = 0;
        if (!query) {
            items = [...allRecent, ...allSaved];
        } else {
            const words = query.toLowerCase().split(/\s+/).filter(Boolean);
            // (not once its results are showing)
            const shown = results && results.open && searchedFor === query;
            // (where to search - YouTube, Music or Playlists - is the pill bar's choice, and Enter
            // searches there: no "Search YouTube for …" rows. Without the website, nothing to search.)
            const matching = cards => shown ? [] : cards.filter(item => words.every(word => `${item.label} ${item.searchMeta || item.meta}`.toLowerCase().includes(word)));
            items = [...matching(allRecent), ...matching(allSaved)];
        }
        if (freshChoice) chosen = preferred;
        freshChoice = false;
        chosen = Math.min(chosen, Math.max(0, items.length - 1));
        renderRecent();
        const rows = items.map((item, i) => [item, i]).filter(([item]) => !item.recent && !item.saved);
        if (!rows.length) {
            if (!query && !items.length) {
                list.innerHTML = `<li class="cmd-empty"><i class="fa-solid fa-clock-rotate-left"></i><span>No recent or saved videos</span><small>Search YouTube or paste a link above</small></li>`;
                list.hidden = false;
                return;
            }
            list.replaceChildren();
            list.hidden = true;
            markChosen();
            return;
        }
        list.replaceChildren(...rows.map(([item, i]) => {
            const li = make("li", `cmd-item${item.danger ? " danger" : ""}${item.search ? " search" : ""}`);
            li.setAttribute("role", "option");
            li.id = `cmd-item-${i}`;
            li.dataset.i = i;
            li.append(make("i", `${/^fa-(brands|regular)/.test(item.icon) ? "" : "fa-solid "}${item.icon} cmd-item-icon`));
            const info = make("span", "cmd-item-info");
            const label = make("span", "cmd-item-label", item.label);
            label.title = item.label;
            info.append(label);
            if (item.meta) {
                const meta = make("span", "cmd-item-meta", item.meta);
                info.append(meta);
            }
            li.append(info);
            return li;
        }));
        list.hidden = false;
        markChosen();
    };
    // The recent and saved ones: a card each - the video's picture (a film for a file from this
    // device) with how far it got along its bottom, its title below, and where it's from. (Drawn
    // again after a heart or ×: each row stays scrolled where it was.)
    const renderRecent = () => {
        renderCards(recentBox, recentRow, items.map((item, i) => [item, i]).filter(([item]) => item.recent));
        renderCards(savedBox, savedRow, items.map((item, i) => [item, i]).filter(([item]) => item.saved));
    };
    const renderCards = (box, row, cards) => {
        box.hidden = !cards.length;
        const scrolled = row.scrollLeft;
        row.replaceChildren(...cards.map(([item, i]) => {
            const card = make("button", "cmd-card");
            card.type = "button";
            card.setAttribute("role", "option");
            card.id = `cmd-item-${i}`;
            card.dataset.i = i;
            card.title = item.label;
            const thumb = make("span", `cmd-card-thumb${item.thumb ? "" : " blank"}`);
            if (item.thumb) {
                const img = make("img");
                img.src = item.thumb;
                img.alt = "";
                img.loading = "lazy";
                img.decoding = "async";
                img.addEventListener("error", () => {
                    img.remove();
                    thumb.classList.add("blank");
                });
                thumb.append(img);
            }
            thumb.append(make("i", `${/^fa-(brands|regular)/.test(item.icon) ? "" : "fa-solid "}${item.icon} cmd-card-icon`));
            if (item.durationLabel) thumb.append(make("span", "cmd-card-duration", item.durationLabel));
            if (item.progress) {
                const bar = make("span", "cmd-card-progress");
                const fill = make("i");
                fill.style.width = `${Math.round(item.progress * 100)}%`;
                bar.append(fill);
                thumb.append(bar);
            }
            card.append(thumb, make("span", "cmd-card-title", item.label));
            if (item.meta) card.append(make("span", "cmd-card-meta", item.meta));
            // Its buttons, on its picture: take it out of Recently played (×), keep it in Saved (a
            // heart: YouTube), and play it or add it to the queue (YouTube) - showing when it's
            // pointed at or chosen with the arrows, always on a touch screen
            const wrap = make("div", "cmd-card-wrap");
            wrap.dataset.i = i;
            const act = (name, icon, label) => {
                const button = make("button", `cmd-card-act ${name}`);
                button.type = "button";
                button.dataset.act = name;
                button.title = label;
                button.setAttribute("aria-label", `${label}: ${item.label}`);
                button.tabIndex = -1;
                button.append(make("i", `fa-solid ${icon}`));
                return button;
            };
            const entry = item.entry || {};
            const youTube = entry.type === "video" || entry.type === "playlist";
            const acts = make("span", "cmd-card-acts");
            if (item.recent) acts.append(act("forget", "fa-xmark", "Remove from Recently played"));
            const saveItem = savedItemOfEntry(entry);
            const key = saveItem && window.CineSaved && window.CineYouTube && CineYouTube.paintHeart && CineSaved.keyOf(saveItem);
            if (key) {
                const heart = make("button", "cmd-card-act fav");
                heart.type = "button";
                heart.dataset.act = "fav";
                heart.dataset.saveKey = key;
                heart.tabIndex = -1;
                heart.append(make("i"));
                CineYouTube.paintHeart(heart);
                acts.append(heart);
            }
            const run = make("span", "cmd-card-run");
            run.append(act("play", "fa-play", "Play"));
            if (youTube && together.queueYouTube && (!together.canQueueYouTube || together.canQueueYouTube())) run.append(act("queue", "fa-plus", "Add to queue"));
            wrap.append(card, acts, run);
            return wrap;
        }));
        row.scrollLeft = scrolled;
        paintArrows(row);
    };
    // (a recent YouTube video or playlist, as Saved keeps it)
    const savedItemOfEntry = entry => entry.type === "playlist" && entry.list
        ? { kind: "playlist", list: entry.list, id: entry.id, title: entry.title || entry.videoTitle, channel: entry.channel, count: entry.count }
        : entry.type === "video" && entry.id ? { kind: "video", id: entry.id, title: entry.title, channel: entry.channel, duration: entry.duration || null, live: !!entry.live } : null;
    const onCardClick = e => {
        const button = e.target.closest(".cmd-card-act");
        const wrap = e.target.closest(".cmd-card-wrap");
        const item = wrap && items[+wrap.dataset.i];
        if (!item) return;
        if (!button) return runItem(item);
        e.stopPropagation();
        const entry = item.entry || {};
        const name = button.dataset.act;
        if (name === "play") return runItem(item);
        if (name === "fav") {
            const saveItem = savedItemOfEntry(entry);
            const unsaving = item.saved;
            // (a card in Saved leaves its row first)
            if (unsaving) wrap.classList.add("leaving");
            setTimeout(() => {
                // (the Saved row follows the heart: CineSaved.onChange below)
                const saved = CineSaved.toggle(saveItem);
                if (saved !== null) showNote(saved ? "Saved - it's in Saved here and on the home page" : "Taken out of Saved");
            }, unsaving ? 180 : 0);
            return;
        }
        if (name === "queue") {
            const ref = entry.type === "playlist" ? { id: entry.id || null, list: entry.list, start: 0 } : { id: entry.id, list: null, start: 0 };
            const meta = entry.type === "playlist" ? { listTitle: entry.title, channel: entry.channel, count: entry.count } : { title: entry.title, channel: entry.channel };
            const refused = together.queueYouTube(ref, meta);
            // (the queue says so itself)
            if (refused) showNote(refused, true);
            return;
        }
        if (name === "forget" && entry.k) {
            // (gone from the row at once; the rest stay where they are)
            wrap.classList.add("leaving");
            setTimeout(() => {
                CineHistory.remove(entry.k);
                freshChoice = false;
                renderList();
            }, 180);
        }
    };
    // A heart anywhere (a card here, a search result, another tab): the Saved row follows, while
    // open. (Listened to from the first opening: history.js loads after this file.)
    let followingSaved = false;
    const followSaved = () => {
        if (followingSaved || !window.CineSaved) return;
        followingSaved = true;
        CineSaved.onChange(() => {
            if (overlay.hidden) return;
            freshChoice = false;
            renderAll();
        });
    };
    [recentRow, savedRow].forEach(row => {
        row.addEventListener("click", onCardClick);
        // Up and down (a wheel, a trackpad) scrolls the search box as usual; a trackpad's sideways
        // swipe scrolls the row by itself; Shift + the wheel scrolls the row across
        row.addEventListener("wheel", e => {
            if (!e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
            e.preventDefault();
            row.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
        }, { passive: false });
        row.addEventListener("scroll", () => paintArrows(row), { passive: true });
        if ("ResizeObserver" in window) new ResizeObserver(() => paintArrows(row)).observe(row);
        // (no scrollbar: a mouse drags the row across; a drag isn't a click on a card)
        let drag = null;
        row.addEventListener("pointerdown", e => {
            if (e.pointerType !== "mouse" || e.button !== 0 || row.scrollWidth <= row.clientWidth) return;
            drag = { x: e.clientX, left: row.scrollLeft, moved: false, id: e.pointerId };
        });
        row.addEventListener("pointermove", e => {
            if (!drag || e.pointerId !== drag.id) return;
            const dx = e.clientX - drag.x;
            if (!drag.moved && Math.abs(dx) < 6) return;
            if (!drag.moved) {
                drag.moved = true;
                row.classList.add("dragging");
                row.setPointerCapture(drag.id);
            }
            row.scrollLeft = drag.left - dx;
        });
        const endDrag = () => {
            if (!drag) return;
            const moved = drag.moved;
            drag = null;
            row.classList.remove("dragging");
            if (!moved) return;
            // (the click straight after the drag, if any, is swallowed; a later one counts)
            const swallow = e => {
                e.stopImmediatePropagation();
                e.preventDefault();
            };
            row.addEventListener("click", swallow, { capture: true, once: true });
            setTimeout(() => row.removeEventListener("click", swallow, { capture: true }), 0);
        };
        row.addEventListener("pointerup", endDrag);
        row.addEventListener("pointercancel", endDrag);
        row.addEventListener("dragstart", e => e.preventDefault());
    });
    const markChosen = () => {
        body.querySelectorAll(".cmd-item[data-i], .cmd-card[data-i]").forEach(node => {
            const on = +node.dataset.i === chosen;
            node.classList.toggle("chosen", on);
            node.setAttribute("aria-selected", String(on));
        });
        if (items.length) input.setAttribute("aria-activedescendant", `cmd-item-${chosen}`);
        else input.removeAttribute("aria-activedescendant");
    };
    const runItem = item => {
        if (!item) return;
        if (item.search) return searchYouTube(item.search, item.searchKind || "video");
        close();
        // (straight away, while the key press or tap still counts: fullscreen, file pickers)
        item.run();
    };
    list.addEventListener("click", e => {
        const li = e.target.closest(".cmd-item");
        if (li) runItem(items[+li.dataset.i]);
    });
    list.addEventListener("pointermove", e => {
        const li = e.target.closest(".cmd-item");
        if (!li || +li.dataset.i === chosen) return;
        chosen = +li.dataset.i;
        markChosen();
    });

    // ---------- YouTube: results, and a pasted link (play, or in a room play now / add to queue)
    const roomQueue = () => !!together.canQueueYouTube && together.canQueueYouTube();
    const resultActions = [];
    // (the first is what a click on a result does: out of a room it plays, and the box closes; in a
    // room, where playing would change it for everyone, it's added to the queue)
    const setResultActions = () => resultActions.splice(0, resultActions.length, ...(!roomQueue()
        ? [{ key: "play", label: "Play", icon: "fa-play" }]
        : together.active()
        ? [{ key: "end", label: "Add to queue", icon: "fa-plus" }, { key: "play", label: "Play now", icon: "fa-play" }]
        : [{ key: "play", label: "Play", icon: "fa-play" }, { key: "end", label: "Add to queue", icon: "fa-plus" }]));
    setResultActions();
    // Play: here (on your own), or for everyone in a room; Add to queue: stays open for more
    const pick = (ref, where, meta = {}) => {
        const isMusic = !!(ref.music || meta.music || (results && results.kind === "music"));
        const playRef = { ...ref, ...(isMusic ? { music: true } : {}) };
        const playMeta = { ...meta, ...(isMusic ? { music: true } : {}) };
        if (where === "end") {
            const refused = together.queueYouTube(playRef, playMeta);
            if (refused) return showNote(refused, true);
            showNote(ref.list ? "Adding the videos to the queue…" : "Added to the queue. Add more, or close.");
            return;
        }
        const refused = CineYouTube.play(playRef, playMeta);
        if (refused) return showNote(refused, true);
        close();
    };
    // (made the first time it opens: youtube.js loads after this file)
    let results = null;
    resultsHost.hidden = true;
    const ensureResults = () => {
        if (results || !youtube()) return results;
        results = CineYouTube.createResults({
            host: resultsHost,
            head: filterHead,
            input,
            // (what was watched before: the Recently played row, not a long list)
            suggest: false,
            compact: true,
            actions: resultActions,
            onClear: () => backToStart(),
            onSettled: () => syncClear(),
            onPick: (ref, where, item) => pick(ref, where, item.kind === "playlist"
                ? { listTitle: item.title, channel: item.channel, count: item.count }
                : { title: item.title, channel: item.channel, live: !!item.live, music: !!(item.music || item.kind === "music") })
        });
        return results;
    };
    const searchYouTube = (query, kind = activeSearchMode) => {
        ensureResults();
        if (!results) return;
        setSearchPillMode(kind);
        showNote("");
        searchedFor = query;
        resultChosen = -1;
        results.run(query, kind);
        syncClear();
        renderList();
        // On a phone the keyboard steps aside for the results
        if (isTouch) input.blur();
    };

    const linkState = { ref: null, key: "" };
    const renderLink = () => {
        const value = input.value.trim();
        const ref = youtube() && value && !/\s/.test(value) ? CineYouTube.parse(value) : null;
        linkState.ref = ref;
        link.hidden = !ref;
        if (!ref) return linkState.key = "";
        const key = `${ref.id}|${ref.list}|${ref.start}`;
        if (key === linkState.key) return;
        linkState.key = key;
        const mix = /^RD/.test(ref.list || "");
        const kind = !ref.list ? "YouTube video" : !ref.id ? (mix ? "YouTube Mix (radio)" : "YouTube playlist")
            : mix ? "Video, with its Mix (radio)" : "Video in a playlist";
        linkKind.replaceChildren(make("i", `fa-solid ${!ref.list ? "fa-play" : mix ? "fa-tower-broadcast" : "fa-list"}`), ` ${kind}${ref.start ? ` · from ${formatTime(ref.start)}` : ""}`);
        linkWhole.hidden = !(ref.id && ref.list);
        linkWholeBox.checked = true;
        linkWholeText.textContent = mix ? "With the rest of the Mix after it" : "With the rest of the playlist from it";
        linkThumb.replaceChildren();
        if (ref.id) {
            const img = make("img");
            img.src = `https://i.ytimg.com/vi/${ref.id}/mqdefault.jpg`;
            img.alt = "";
            img.referrerPolicy = "no-referrer";
            linkThumb.append(img);
        } else linkThumb.append(make("i", `fa-solid ${mix ? "fa-tower-broadcast" : "fa-list"}`));
        linkTitle.textContent = "Loading…";
        linkTitle.classList.add("loading");
        const fallback = ref.id ? "YouTube video" : mix ? "YouTube Mix" : "YouTube playlist";
        const page = ref.id ? `https://www.youtube.com/watch?v=${ref.id}` : `https://www.youtube.com/playlist?list=${ref.list}`;
        fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`)
            .then(response => response.ok ? response.json() : null)
            .catch(() => null)
            .then(data => {
                if (linkState.key !== key) return;
                linkTitle.classList.remove("loading");
                linkTitle.textContent = data && typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 200) : fallback;
                if (!ref.id && data && typeof data.thumbnail_url === "string" && /^https:\/\/i\d?\.ytimg\.com\//.test(data.thumbnail_url)) {
                    const img = make("img");
                    img.src = data.thumbnail_url;
                    img.alt = "";
                    img.referrerPolicy = "no-referrer";
                    linkThumb.replaceChildren(img);
                }
            });
        // Play (or, in a room, Play now and Add to queue)
        const queue = roomQueue();
        const action = (where, icon, text, primary) => {
            const button = make("button", `cmd-btn${primary ? " primary" : ""}`);
            button.type = "button";
            button.dataset.where = where;
            button.append(make("i", `fa-solid ${icon}`), ` ${text}`);
            return button;
        };
        linkActions.replaceChildren(action("play", "fa-play", queue ? "Play now" : "Play", true), ...(queue ? [action("end", "fa-plus", "Add to queue")] : []));
    };
    const linkRef = () => {
        const ref = linkState.ref && { ...linkState.ref };
        if (ref && ref.id && ref.list && !linkWholeBox.checked) ref.list = null;
        return ref;
    };
    linkActions.addEventListener("click", e => {
        const button = e.target.closest("button[data-where]");
        const ref = button && linkRef();
        if (!ref) return;
        if (button.dataset.where === "end") {
            const meta = { title: linkTitle.textContent !== "Loading…" ? linkTitle.textContent : "" };
            pick(ref, "end", meta);
            input.value = "";
            renderAll();
            return input.focus();
        }
        pick(ref, "play");
    });

    // ---------- Typing, choosing, Enter
    const renderAll = () => {
        // (after the results' own changes too: renderAll runs on every edit and on Clear)
        queueMicrotask(syncClear);
        renderLink();
        // A link: its card is the choice (no commands, no earlier results)
        if (linkState.ref) {
            if (results) results.clear();
            items = [];
            list.replaceChildren();
            list.hidden = true;
            recentBox.hidden = true;
            savedBox.hidden = true;
            return;
        }
        renderList();
    };
    // Enter runs the highlighted video only when it was picked with the arrow keys; otherwise
    // it searches where the pill bar says
    let pickedWithKeys = false;
    input.addEventListener("input", () => {
        chosen = 0;
        freshChoice = true;
        pickedWithKeys = false;
        if (note.classList.contains("error")) showNote("");
        renderAll();
    });
    // The arrow keys: Up / Down go through YouTube's results while they show (Enter plays the one
    // picked); Left / Right go through the Recently played and Saved cards - when nothing is typed,
    // or a card is already picked, and no text is selected (then they move in the text as usual)
    let resultChosen = -1;
    const resultRows = () => [...resultsHost.querySelectorAll(".yt-result")].filter(row => row.getClientRects().length);
    const markResult = () => {
        resultRows().forEach((row, i) => {
            row.classList.toggle("chosen", i === resultChosen);
            row.setAttribute("aria-selected", String(i === resultChosen));
        });
        const row = resultRows()[resultChosen];
        if (row) row.scrollIntoView({ block: "nearest" });
    };
    input.addEventListener("input", () => {
        resultChosen = -1;
        markResult();
    });
    input.addEventListener("keydown", e => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
        const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
        const rows = vertical && !resultsHost.hidden ? resultRows() : [];
        if (vertical && rows.length) {
            e.preventDefault();
            resultChosen = resultChosen < 0
                ? (e.key === "ArrowDown" ? 0 : rows.length - 1)
                : (resultChosen + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
            markResult();
            return;
        }
        const cards = items.map((item, i) => [item, i]).filter(([item]) => item.recent || item.saved).map(([, i]) => i);
        const noSelection = input.selectionStart === input.selectionEnd;
        const onCards = !input.value.trim() || (pickedWithKeys && cards.includes(chosen));
        if (horizontal && !e.shiftKey && noSelection && onCards && cards.length) {
            e.preventDefault();
            const at = cards.indexOf(chosen);
            const to = at < 0 ? 0 : (at + (e.key === "ArrowRight" ? 1 : -1) + cards.length) % cards.length;
            pickedWithKeys = true;
            chosen = cards[to];
            markChosen();
            body.querySelector(`#cmd-item-${chosen}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
            return;
        }
        if (vertical && items.length) {
            e.preventDefault();
            pickedWithKeys = true;
            chosen = (chosen + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            markChosen();
            body.querySelector(`#cmd-item-${chosen}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    });
    form.addEventListener("submit", e => {
        e.preventDefault();
        const ref = linkRef();
        if (ref) return pick(ref, "play");
        // (a YouTube result picked with the arrow keys: Enter plays it - in a room too, where a click
        // on the row adds it to the queue: its own Play now)
        const pickedRow = !resultsHost.hidden && resultChosen >= 0 ? resultRows()[resultChosen] : null;
        if (pickedRow) return (pickedRow.querySelector('[data-act="play"]') || pickedRow.querySelector(".yt-result-main"))?.click();
        const value = input.value.trim();
        if (!value && items[chosen] && pickedWithKeys) return runItem(items[chosen]);
        if (!value) return;
        if (items[chosen] && (pickedWithKeys || !youtube())) return runItem(items[chosen]);

        // "remove all commands, it would work, but will not show":
        // 1. Typed commands (time: 1:23, speed: 1.5x, percent: 50%)
        const typed = typedCommands(value);
        if (typed.length) {
            close();
            return typed[0].run();
        }

        // 2. Keyword commands (play, pause, stop, fullscreen, subtitles, mute, etc.)
        const words = value.toLowerCase().split(/\s+/).filter(Boolean);
        const all = playerCommands();
        const matched = all.find(command => matches(command, words));
        if (matched) {
            close();
            return matched.run();
        }

        // 3. Otherwise search YouTube
        if (youtube()) return searchYouTube(value, activeSearchMode);
        showNote("No video or command matched. Searching YouTube needs the website (with an internet connection).", true);
    });
    pasteBtn.addEventListener("click", async () => {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (!text) return showNote("There's nothing copied to paste.", true);
            input.value = text;
            if (results) results.clear();
            renderAll();
            if (!linkState.ref) showNote("What you copied isn't a YouTube link: Enter searches for it.");
        } catch (error) {
            showNote("This browser didn't allow reading what you copied. Paste with Ctrl+V (or a long press).", true);
        }
        input.focus();
    });

    // ---------- Opening and closing
    let closeToken = 0;
    let closeAnimations = [];
    const cancelCloseMotion = () => {
        closeToken++;
        closeAnimations.forEach(animation => animation.cancel());
        closeAnimations = [];
        overlay.classList.remove("closing");
    };
    const open = (text = "", message = "", search = false, kind = "video") => {
        if (overlay.classList.contains("closing")) cancelCloseMotion();
        if (overlay.hidden) {
            ensureResults();
            followSaved();
            setResultActions();
            // Over a fullscreen player too: only what's inside the fullscreen element shows
            const host = fullscreenElement() || document.body;
            if (overlay.parentElement !== host) host.append(overlay);
            overlay.hidden = false;
            searchBtn.setAttribute("aria-expanded", "true");
            setSearchPillMode(kind === "music" ? "music" : kind === "playlist" ? "playlist" : "video");
            if (results) results.clear();
            linkState.key = "";
            // (both rows from their start again)
            recentRow.scrollLeft = savedRow.scrollLeft = 0;
        }
        input.value = text;
        chosen = 0;
        freshChoice = true;
        showNote(message);
        renderAll();
        input.focus();
        if (search && text.trim() && results && !linkState.ref) searchYouTube(text.trim(), kind);
        else if (!overlay.hidden && !isTouch) input.select();
    };
    // Esc: with something typed or results showing, back to the start (Recently played); then the
    // box closes. (Ahead of the results' own Esc, so the list is drawn again too.)
    const backToStart = () => {
        if (!input.value.trim() && !(results && results.open) && link.hidden) return false;
        input.value = "";
        searchedFor = "";
        if (results) results.clear();
        linkState.key = "";
        chosen = 0;
        freshChoice = true;
        showNote("");
        renderAll();
        body.scrollTop = 0;
        input.focus();
        return true;
    };
    input.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!backToStart()) close();
    }, true);
    const close = () => {
        if (overlay.hidden) return;
        if (overlay.classList.contains("closing")) return;
        searchBtn.setAttribute("aria-expanded", "false");
        input.blur();
        const token = ++closeToken;
        const finish = () => {
            if (token !== closeToken) return;
            overlay.hidden = true;
            overlay.classList.remove("closing");
            closeAnimations.forEach(animation => animation.cancel());
            closeAnimations = [];
            if (results) results.clear();
            searchedFor = "";
            input.value = "";
            linkState.ref = null;
            link.hidden = true;
        };
        if (matchMedia("(prefers-reduced-motion: reduce)").matches || !overlay.animate || !box.animate) return finish();
        overlay.classList.add("closing");
        const overlayOpacity = getComputedStyle(overlay).opacity;
        const boxStyle = getComputedStyle(box);
        closeAnimations = [
            overlay.animate([{ opacity: overlayOpacity }, { opacity: 0 }], {
                duration: 170, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards"
            }),
            box.animate([
                { opacity: boxStyle.opacity, transform: boxStyle.transform },
                { opacity: 0, transform: "translateY(-8px) scale(.98)" }
            ], { duration: 170, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" })
        ];
        Promise.all(closeAnimations.map(animation => animation.finished.catch(() => {}))).then(finish);
    };
    const toggle = () => overlay.hidden ? open() : close();
    searchBtn.setAttribute("aria-haspopup", "dialog");
    searchBtn.setAttribute("aria-expanded", "false");
    searchBtn.addEventListener("click", e => {
        e.stopPropagation();
        toggle();
    });
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("pointerdown", e => e.target === overlay && close());
    // Esc: the results first (youtube.js), then the box; keys typed here aren't the player's
    overlay.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (!backToStart()) close();
            return;
        }
        if (e.key === "Tab") {
            // (focus stays in the box)
            const focusable = [...box.querySelectorAll("input, button, a[href], [tabindex]:not([tabindex='-1'])")].filter(node => node.getClientRects().length && !node.disabled);
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        e.stopPropagation();
    });
    together.openSearch = open;
    together.searchOpen = () => !overlay.hidden;
    window.CineLauncher = { open, close, toggle };
    return { open, close, toggle, get isOpen() { return !overlay.hidden; } };
})();

// Ctrl+K (⌘K on a Mac): search and commands, from anywhere in the player (even while typing in a box)
document.addEventListener("keydown", e => {
    if (playerPage.hidden || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
    e.preventDefault();
    cmdPalette.toggle();
});

// ---------- Saved: the heart in the player's top bar keeps the YouTube video that's on in the
// home page's Saved (history.js) - on your own or in a room. In a playlist it asks which: this
// video, or the whole playlist. (Not in the offline player: it has no home page to keep them on.)
document.addEventListener("DOMContentLoaded", () => {
    const wrap = container.querySelector(".player-save-wrap");
    if (!wrap || !homePage || !window.CineSaved) return;
    const button = wrap.querySelector(".player-save-btn");
    const menu = wrap.querySelector(".player-save-menu");
    const current = () => {
        const inRoom = together.roomYouTube && together.roomYouTube();
        if (inRoom) return inRoom;
        const own = together.solo && together.solo.current;
        // (a playlist played through the queue: its videos remember which playlist they came from)
        if (own && own.video && !own.list && together.queuePlaylist) return { ...own, list: together.queuePlaylist(own.video.id) };
        return own || null;
    };
    const isSaved = item => !!item && CineSaved.has(CineSaved.keyOf(item));
    const closeMenu = () => {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
    };
    const render = () => {
        const now = current();
        wrap.hidden = !now;
        if (!now) return closeMenu();
        const on = isSaved(now.video) || isSaved(now.list);
        button.classList.toggle("on", on);
        button.firstChild.className = `${on ? "fa-solid" : "fa-regular"} fa-heart`;
        button.title = (now.list ? "Save this video or the playlist" : on ? "Saved - take it out of Saved" : "Save this video") + " (S)";
        button.setAttribute("aria-label", button.title);
    };
    const toggle = item => {
        if (item && item.kind !== "playlist" && !item.list && container.classList.contains("is-yt-music")) item = { ...item, music: true };
        const saved = CineSaved.toggle(item);
        if (saved === null) return;
        const what = item.kind === "playlist" ? "Playlist" : "Video";
        showFeedback(saved ? "fa-heart" : "fa-heart-crack", saved ? `${what} saved` : "Taken out of Saved");
    };
    const option = (item, label, icon) => {
        const on = isSaved(item);
        const row = el("button", `player-save-opt${on ? " on" : ""}`);
        row.type = "button";
        row.setAttribute("role", "menuitemcheckbox");
        row.setAttribute("aria-checked", String(on));
        row.append(el("i", `fa-solid ${icon}`), el("span", null, label), el("i", `${on ? "fa-solid" : "fa-regular"} fa-heart player-save-heart`));
        row.addEventListener("click", () => {
            toggle(item);
            closeMenu();
        });
        return row;
    };
    button.addEventListener("click", e => {
        e.stopPropagation();
        const now = current();
        if (!now) return;
        // Just a video: saved (or taken out) straight away
        if (!now.list || !now.video) return toggle(now.video || now.list);
        if (!menu.hidden) return closeMenu();
        menu.replaceChildren(option(now.video, "This video", "fa-play"), option(now.list, now.list.count ? `The playlist · ${now.list.count} videos` : "The whole playlist", "fa-list"));
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
    });
    document.addEventListener("click", e => !menu.hidden && !wrap.contains(e.target) && closeMenu());
    document.addEventListener("keydown", e => e.key === "Escape" && !menu.hidden && (e.stopImmediatePropagation(), closeMenu()), true);
    CineSaved.onChange(render);
    setInterval(() => !playerPage.hidden && render(), 1000);
    render();
});

// ---------- Up next for the video (V-PC, V-PL - not an upright phone): in the last 10% of a video
// with something after it in the queue, a pill with the next video's picture and title; a click
// plays it. It shows from 90% of the way through to the end (back before 90%: gone; forward past it
// again: back), whatever panels are open. Its width follows its title (up to 320px). Where it goes:
// - a computer: centred on the video (the call dock's rule - a side panel open moves it with the
//   video), in the empty space above the video when there is some; otherwise just under the title
//   bar - also when the call's videos are a row above the video
// - a phone held sideways: at the top centre of the picture while the controls are hidden; while
//   they show, just under the title bar
document.addEventListener("DOMContentLoaded", () => {
    const topBar = container.querySelector(".top-bar");
    const title = container.querySelector(".video-title");
    if (!topBar || !title) return;
    const holder = document.createElement("div");
    holder.className = "video-up-next";
    holder.hidden = true;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "vp-next";
    card.innerHTML = '<span class="vp-next-cover"><img alt="" /></span><span class="vp-next-text"><small>Up next</small><b></b></span><i class="fa-solid fa-forward-step" aria-hidden="true"></i>';
    holder.append(card);
    playerPage.append(holder);
    card.addEventListener("click", e => {
        e.stopPropagation();
        const step = container.querySelector(".next-track");
        if (step && !step.disabled) step.click();
    });
    // (its clicks don't reach the picture under it: no play / pause, no double-click fullscreen)
    ["pointerdown", "dblclick"].forEach(type => holder.addEventListener(type, e => e.stopPropagation()));
    const uprightPhone = matchMedia("(max-width: 900px) and (orientation: portrait)");
    const phoneSideways = matchMedia("(max-width: 900px) and (orientation: landscape) and (pointer: coarse)");
    const GAP = 16, H = 44, MAX_W = 320;
    let key = "";
    // (a part's top, as laid out - not where it is while sliding in or out with the controls)
    const restingTop = node => {
        let y = 0;
        for (let n = node; n && n !== container; n = n.offsetParent) y += n.offsetTop;
        return container.getBoundingClientRect().top + y;
    };
    const hide = () => {
        if (!holder.hidden) holder.hidden = true;
    };
    // (what's playing: the room's or your own YouTube video, or a file)
    const currentId = () => together.roomYouTube?.()?.video?.id || together.solo?.current?.video?.id
        || (container.classList.contains("youtube") ? youTubeIdShown() : mainVideo.currentSrc) || "";
    const watching = { id: null, at: 0, time: 0, duration: 0, fresh: false };
    const render = () => {
        if (playerPage.hidden || container.classList.contains("audio-mode-only") || uprightPhone.matches) return hide();
        const next = together.upNext?.() || null;
        const step = container.querySelector(".next-track");
        const { time, duration } = shownTime;
        // (a video just started: the time and length shown can still be the last video's - near its
        // end - for a moment. Until this one's own have come in, it isn't late)
        const id = currentId();
        if (id !== watching.id) Object.assign(watching, { id, at: Date.now(), time, duration, fresh: false });
        if (!watching.fresh && Date.now() - watching.at > 800 && (duration !== watching.duration || time < watching.time - 1)) watching.fresh = true;
        const late = watching.fresh && Number.isFinite(duration) && duration > 0 && time >= duration * 0.9;
        if (!next || !late || !step || step.disabled) return hide();
        const nextKey = `${next.id}|${next.title}`;
        if (nextKey !== key) {
            key = nextKey;
            card.querySelector("img").src = `https://i.ytimg.com/vi/${next.id}/mqdefault.jpg`;
            card.querySelector("b").textContent = next.title || (next.music ? "Next track" : "Next video");
            card.title = `Play next: ${next.title || "the next one"} (Shift + N)`;
            card.setAttribute("aria-label", card.title);
        }
        const page = playerPage.getBoundingClientRect();
        const pic = container.getBoundingClientRect();
        if (pic.width < 160) return hide();
        // (as wide as its title needs, never wider than the picture allows)
        holder.style.maxWidth = `${Math.round(Math.min(MAX_W, pic.width - GAP * 2))}px`;
        const wasHidden = holder.hidden;
        holder.hidden = false;
        const width = holder.offsetWidth;
        // (centred on the video)
        const cx = pic.left + pic.width / 2;
        const barBottom = restingTop(topBar) + topBar.offsetHeight;
        let cy;
        if (phoneSideways.matches) {
            // (the top centre of the picture; under the title bar while the controls show)
            const controls = container.classList.contains("show-controls");
            cy = (controls ? Math.max(barBottom, pic.top) + 8 : pic.top + 10) + H / 2;
        } else {
            // (the empty space above the video, when there is some and nothing else is in it - not
            // the call's videos in a row above it; otherwise just under the title bar)
            const above = pic.top - page.top;
            const railAbove = playerPage.classList.contains("call-dock-rail");
            cy = above >= H + GAP * 2 && !railAbove ? page.top + above / 2 : Math.max(barBottom, pic.top) + 8 + H / 2;
        }
        holder.style.left = `${Math.round(cx - width / 2 - page.left)}px`;
        holder.style.top = `${Math.round(cy - H / 2 - page.top)}px`;
        if (wasHidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
            holder.animate([{ opacity: 0, translate: "0 -6px" }, { opacity: 1, translate: "0 0" }], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        }
    };
    setInterval(render, 300);
    window.addEventListener("resize", render);
    document.addEventListener("fullscreenchange", () => setTimeout(render, 60));
    new MutationObserver(render).observe(container, { attributes: true, attributeFilter: ["class"] });
});
