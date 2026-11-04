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
    solo: null,       // youtube.js: a YouTube video watched on your own ({ active, stop, pause, handOff })
    active: () => false // in a room: going home keeps the video playing for everyone
};

// Hide Controls on Idle (not while a menu or the settings sheet is open, or the timeline is
// being dragged: they wait until it's closed)
const controlsInUse = () => scrubbing || popupMenus.some(menu => menu.classList.contains("show")) || !playerSheet.hidden;
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
const showFeedback = (iconClass, text = "") => {
    feedbackIcon.className = `fa-solid ${iconClass}`;
    feedbackText.innerText = text;
    centerFeedback.classList.add("show");
    
    setTimeout(() => {
        centerFeedback.classList.remove("show");
    }, 700);
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
const showPlayer = () => {
    if (!homePage) return;
    homePage.hidden = true;
    playerPage.hidden = false;
    document.body.classList.add("watching");
    if (together.onPlayer) together.onPlayer();
    if (location.hash !== "#watch") history.pushState(null, "", "#watch");
};

const showHome = () => {
    // A room keeps going while you look at the home page
    if (!together.active()) mainVideo.pause();
    if (together.solo) together.solo.pause();
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
const goHome = () => {
    if (together.beforeHome) return together.beforeHome();
    history.back();
};
if (homePage) {
    playerHomeBtn.addEventListener("click", goHome);
    playerBackBtn.addEventListener("click", goHome);
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

const renameTitle = () => {
    if (!currentSource || together.stream || videoTitle.querySelector("input")) return;
    const { name, size } = currentSource;
    const previous = videoTitle.textContent;
    const input = document.createElement("input");
    input.className = "title-input";
    input.value = previous;
    input.maxLength = 120;
    input.setAttribute("aria-label", "Video title");
    videoTitle.replaceChildren(input);
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
videoTitle.addEventListener("click", renameTitle);

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
    enterMobileImmersive();
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
};

// On phones, opening a file is already a user gesture: use it to create an app-like
// player and request the widest available layout.
const enterMobileImmersive = () => {
    if (!isTouch || fullscreenElement() || !playerPage.requestFullscreen) return;
    Promise.resolve(playerPage.requestFullscreen()).then(() => {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock("landscape").catch(() => {});
        }
    }).catch(() => {});
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
    showFeedback("fa-play", "Playing");
};

browseBtn.addEventListener("click", pickVideo);
openFileBtn.addEventListener("click", pickVideo);

fileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    loadVideoFile(file);
    fileInput.value = "";
});

// Subtitles (.srt / .vtt)
const isSubtitleFile = file => /\.(srt|vtt)$/i.test(file.name);

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

const applySubtitles = (text, label) => {
    text = text.replace(/^\uFEFF/, "");
    if (!text.startsWith("WEBVTT")) text = srtToVtt(text);
    // Lift cues a few lines up so they don't sit under the control bar
    text = text.replace(/^(.*-->.*)$/gm, line => /line:/.test(line) ? line : `${line} line:-4`);

    removeSubtitles();
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = label;
    track.src = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
    track.default = true;
    mainVideo.appendChild(track);
    track.track.mode = "showing";
    subtitlesBtn.classList.add("active");
    updateSubtitlesTitle();
    showFeedback("fa-closed-captioning", "Subtitles On");
};

const loadSubtitleFile = async (file) => {
    if (!file) return;
    if (together.stream) return together.stream.loadSubtitles(await file.text());
    if (!currentFile) {
        showFeedback("fa-closed-captioning", "Open a video first");
        return;
    }
    applySubtitles(await file.text(), file.name);
};

const toggleSubtitles = () => {
    if (together.stream) return together.stream.toggleSubtitles();
    const track = mainVideo.textTracks[0];
    if (!track) return subtitleInput.click();
    const show = track.mode !== "showing";
    track.mode = show ? "showing" : "hidden";
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
    errorOverlay.classList.remove("hidden");
};

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
        return showError("This browser can't play this file and can't run CineTab's converter. Try the latest Chrome or Edge.");
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
    convertTitle.innerText = reason === "audio" ? "Fixing the sound" : "Making this file playable";
    convertReason.innerText = {
        format: `Your browser can't play ${ext || "this kind of"} files directly, so CineTab is converting it to MP4.`,
        audio: `This file's sound${detail ? ` (${detail})` : ""} isn't supported by your browser, so it would play silently. CineTab is converting just the sound and keeping the video as is.`,
        video: "Your browser can't show this file's video, so CineTab is converting it."
    }[reason];
    convertPlan.innerText = "";
    convertSkipBtn.hidden = reason !== "audio";
    setConvertProgress(null, "Starting…");
    uploadOverlay.classList.add("hidden");
    errorOverlay.classList.add("hidden");
    convertOverlay.classList.remove("hidden");

    let convertStartedAt = 0;
    const job = Converter.convert(file, {
        forceVideoTranscode,
        onPlan: plan => convertPlan.innerText = describePlan(plan),
        onStatus: ({ stage, ratio }) => {
            if (stage === "download") {
                setConvertProgress(ratio, `Downloading the converter (31 MB, first time only)… ${Math.round(ratio * 100)}%`);
            } else if (stage === "probe") {
                setConvertProgress(null, "Reading the file…");
            } else if (stage === "convert") {
                if (!convertStartedAt) convertStartedAt = Date.now();
                setConvertProgress(ratio, `Converting… ${Math.round(ratio * 100)}%${timeLeft(ratio, convertStartedAt)}`);
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
    showError("Sorry, CineTab couldn't play this file, even after converting it.");
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
    videoTitle.innerText = audioTitle.innerText = "No Video Loaded";
    progressBar.style.width = "0%";
    currentVidTime.innerText = videoDuration.innerText = formatTime(0);
    showPlaying(false);
};

const unloadPlayer = () => {
    releaseMedia();
    uploadOverlay.classList.remove("hidden");
};

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
    if (!confirm("Delete all converted videos from this browser?\nYour original files are not touched, and anything can be converted again later.")) return;
    if (currentSavedKey) unloadPlayer();
    await Converter.clearSaved();
    renderSavedList();
});

renderSavedList();

// Watch Together Help
shareHelpBtn.addEventListener("click", () => {
    if (together.openPanel) return together.openPanel();
    mainVideo.pause();
    helpOverlay.classList.remove("hidden");
});
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
closeButton(convertOverlay).addEventListener("click", () => {
    if (confirm("Stop converting this file?")) convertCancelBtn.click();
});
// The empty player's "Select a movie" box: back to the home page (in a room, just out of the way)
closeButton(uploadOverlay).hidden = !homePage;
closeButton(uploadOverlay).addEventListener("click", () => {
    if (homePage && !together.active()) history.back();
    else uploadOverlay.classList.add("hidden");
});

// Keyboard shortcuts list (button, or ?)
const toggleShortcuts = () => shortcutsOverlay.classList.toggle("hidden");
shortcutsBtn.addEventListener("click", toggleShortcuts);

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
const popupMenus = [speedOptions, moreOptions];
const togglePopup = menu => {
    const open = !menu.classList.contains("show");
    popupMenus.forEach(other => other.classList.toggle("show", other === menu && open));
    if (open && menu === moreOptions) renderMoreOptions();
};
const playerSheet = container.querySelector(".player-sheet");
const closePopups = () => {
    const open = popupMenus.some(menu => menu.classList.contains("show")) || !playerSheet.hidden;
    popupMenus.forEach(menu => menu.classList.remove("show"));
    closeSheet();
    return open;
};
speedBtn.addEventListener("click", () => togglePopup(speedOptions));
moreBtn.addEventListener("click", () => togglePopup(moreOptions));

document.addEventListener("click", e => {
    if (!e.target.closest(".popup-menu-wrapper, .settings-btn, .player-sheet")) closePopups();
});

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

// In a room's stream the timeline shows, and jumps in, the host's video
const mediaDuration = () => together.stream ? together.stream.duration : mainVideo.duration;

const seekTo = time => {
    if (together.stream) return together.stream.request({ time });
    mainVideo.currentTime = time;
};

// Seeking: click, or drag along the timeline with the mouse or a finger
let scrubbing = false;
const timelineRatio = e => {
    const rect = videoTimeline.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
};
const scrub = e => {
    const ratio = timelineRatio(e);
    progressBar.style.width = `${ratio * 100}%`;
    currentVidTime.innerText = formatTime(ratio * mediaDuration());
    if (!together.stream) mainVideo.currentTime = ratio * mainVideo.duration;
    if (e.pointerType === "touch") showPreview(e);
};
videoTimeline.addEventListener("pointerdown", e => {
    if (!mediaDuration() || e.button > 0) return;
    scrubbing = true;
    videoTimeline.setPointerCapture(e.pointerId);
    videoTimeline.classList.add("scrubbing");
    scrub(e);
});
videoTimeline.addEventListener("pointermove", e => scrubbing && scrub(e));
const endScrub = e => {
    if (!scrubbing) return;
    scrubbing = false;
    videoTimeline.classList.remove("scrubbing");
    // The host's stream jumps once, where the mouse or finger let go
    if (together.stream && e.type === "pointerup") together.stream.request({ time: timelineRatio(e) * mediaDuration() });
};
videoTimeline.addEventListener("pointerup", endScrub);
videoTimeline.addEventListener("pointercancel", endScrub);

const showProgress = (currentTime, duration) => {
    if (scrubbing) return;
    let percent = (currentTime / duration) * 100;
    progressBar.style.width = `${percent}%`;
    currentVidTime.innerText = formatTime(currentTime);
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
    volumeBtn.parentNode.title = value == 0 ? "Unmute (M)" : "Mute (M)";
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
    // On a touch screen YouTube's player fills the picture, so it can be Fit or Fill (not the
    // other shapes); on a computer it keeps its own shape between the title bar and the controls
    const ytShapes = youtube && matchMedia("(pointer: coarse)").matches;
    aspectChips.forEach(chip => chip.hidden = ytShapes && !["fit", "fill"].includes(chip.dataset.aspect));
    moreOptions.querySelector(".aspect-options").classList.toggle("disabled", youtube && !ytShapes);
    moreOptions.querySelector(".boost-options").classList.toggle("disabled", youtube);
    boostChips.forEach(chip => chip.classList.toggle("active", +chip.dataset.boost === boost.level));
    boostCurrent.textContent = youtube ? "—" : boost.level > 1 ? `${Math.round(boost.level * 100)}%` : "Off";
    moreNote.hidden = !youtube;
    moreNote.textContent = !youtube ? "" : ytShapes ? "YouTube's player keeps its own volume (up to 100%)." : "YouTube's player keeps its own shape and volume (up to 100%).";
    if (!playerSheet.hidden) renderSheet();
}
renderMoreOptions();

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
    boost: { title: "Volume boost", chips: () => boostChips, current: () => boostCurrent.textContent }
};
let sheetList = null;
const rateLabel = rate => rate === 1 ? "Normal" : `${rate}x`;

const sheetRow = name => playerSheet.querySelector(`[data-open="${name}"], [data-act="${name}"]`);

function renderSheet() {
    const youtube = container.classList.contains("youtube");
    // The host's stream plays at the host's speed; YouTube keeps its own shape and volume
    sheetRow("boost").hidden = youtube;
    sheetRow("aspect").hidden = youtube && !isTouch;
    Object.keys(SHEET_LISTS).forEach(name => sheetRow(name).querySelector(".sheet-value").textContent = SHEET_LISTS[name].current());
    const subtitlesOn = subtitlesBtn.classList.contains("active");
    sheetRow("subtitles").querySelector(".sheet-value").textContent = subtitlesOn ? "On" : youtube || together.stream || mainVideo.textTracks.length ? "Off" : "None";
    if (sheetList) showSheetList(sheetList);
}

const showSheetList = name => {
    const list = SHEET_LISTS[name];
    sheetList = name;
    sheetTitle.textContent = list.title;
    sheetNote.hidden = name !== "boost";
    sheetNote.textContent = name === "boost" ? "Louder than the phone's own maximum. Swiping up on the right side of the picture goes past 100% too." : "";
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
    // These open something else: the sheet steps aside
    closeSheet();
    if (act === "subtitle-file") subtitleInput.click();
    else if (act === "open") openFileBtn.click();
});

// Play / Pause. On a touch screen with the controls showing, the big button itself shows it.
const playFeedback = icon => {
    if (!(isTouch && container.classList.contains("show-controls"))) showFeedback(icon, "");
};
const togglePlay = () => {
    if (together.stream) {
        const play = together.stream.paused;
        if (together.stream.request({ paused: !play })) playFeedback(play ? "fa-play" : "fa-pause");
        return;
    }
    if(mainVideo.paused) {
        mainVideo.play().catch(() => {});
        playFeedback("fa-play");
    } else {
        mainVideo.pause();
        playFeedback("fa-pause");
    }
};

playPauseBtn.parentNode.addEventListener("click", togglePlay);

const showPlaying = playing => {
    playPauseBtn.className = playing ? "fas fa-pause" : "fas fa-play";
    playPauseBtn.parentNode.title = playing ? "Pause (Space / K)" : "Play (Space / K)";
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
    if (together.stream) {
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
const mediaPaused = () => together.stream ? together.stream.paused : mainVideo.paused;
const mediaTime = () => together.stream ? together.stream.currentTime() : mainVideo.currentTime;

const updateMediaSession = () => {
    const session = navigator.mediaSession;
    if (!session || !(currentFile || together.active() || (together.solo && together.solo.active))) return;
    const title = videoTitle.textContent;
    if (!session.metadata || session.metadata.title !== title) {
        session.metadata = new MediaMetadata({
            title,
            artist: together.active() ? "CineTab · watching together" : together.solo && together.solo.active ? "CineTab · YouTube" : "CineTab",
            artwork: [
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

// MINIMALIST DOCUMENT PICTURE-IN-PICTURE IMPLEMENTATION
const toggleCustomPiP = async () => {
    if ("documentPictureInPicture" in window) {
        if (window.documentPictureInPicture.window) {
            window.documentPictureInPicture.window.close();
            return;
        }

        try {
            const pipWindow = await window.documentPictureInPicture.requestWindow({
                width: 480,
                height: 270,
            });

            // Inject CSS stylesheets into PiP window
            [...document.styleSheets].forEach((styleSheet) => {
                try {
                    const cssRules = [...styleSheet.cssRules].map(r => r.cssText).join('');
                    const style = document.createElement('style');
                    style.textContent = cssRules;
                    pipWindow.document.head.appendChild(style);
                } catch (e) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = styleSheet.href;
                    pipWindow.document.head.appendChild(link);
                }
            });

            // Reset body margins in PiP window
            pipWindow.document.body.style.margin = '0';
            pipWindow.document.body.style.padding = '0';
            pipWindow.document.body.style.overflow = 'hidden';

            // Construct Overlay HTML
            const pipContainer = document.createElement('div');
            pipContainer.className = 'pip-player-container';
            pipContainer.innerHTML = `
                <div class="pip-video-wrapper">
                    <div class="pip-overlay">
                        <div class="pip-top-controls">
                            <button id="pip-min-btn" title="Background Play"><i class="fa-solid fa-window-minimize"></i></button>
                            <button id="pip-focus-btn" title="Back to Tab"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                            <button id="pip-close-btn" title="Close"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                        <div class="pip-bottom-controls">
                            <button id="pip-seek-back" title="-5s"><i class="fas fa-backward"></i></button>
                            <button id="pip-play-btn" title="Play/Pause"><i class="${mainVideo.paused ? 'fas fa-play' : 'fas fa-pause'}"></i></button>
                            <button id="pip-seek-forward" title="+5s"><i class="fas fa-forward"></i></button>
                            <button id="pip-mute-btn" title="Mute/Unmute"><i class="${mainVideo.volume === 0 ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high'}"></i></button>
                        </div>
                    </div>
                </div>
            `;

            pipWindow.document.body.appendChild(pipContainer);

            // Append Video Element inside Wrapper
            const videoWrapper = pipWindow.document.querySelector('.pip-video-wrapper');
            videoWrapper.insertBefore(mainVideo, videoWrapper.firstChild);

            // Get Controls Elements
            const pipPlayBtn = pipWindow.document.querySelector('#pip-play-btn');
            const pipMuteBtn = pipWindow.document.querySelector('#pip-mute-btn');
            const pipMinBtn = pipWindow.document.querySelector('#pip-min-btn');
            const pipFocusBtn = pipWindow.document.querySelector('#pip-focus-btn');
            const pipCloseBtn = pipWindow.document.querySelector('#pip-close-btn');

            // Play / Pause / Seek / Mute Actions
            pipPlayBtn.addEventListener('click', togglePlay);
            pipWindow.document.querySelector('#pip-seek-back').addEventListener('click', () => seek(-5));
            pipWindow.document.querySelector('#pip-seek-forward').addEventListener('click', () => seek(5));

            pipMuteBtn.addEventListener('click', () => {
                if (mainVideo.volume > 0) {
                    setVolume(0);
                } else {
                    setVolume(1);
                }
            });

            // Top Right Corner Actions
            // 1. Background Play (Close PiP window without pausing, audio continues playing)
            pipMinBtn.addEventListener('click', () => {
                pipWindow.close();
                showFeedback("fa-window-minimize", "Background Play");
            });

            // 2. Back to Tab (Focus parent window and close PiP)
            pipFocusBtn.addEventListener('click', () => {
                window.focus();
                pipWindow.close();
            });

            // 3. Close (Pause video and close PiP)
            pipCloseBtn.addEventListener('click', () => {
                mainVideo.pause();
                pipWindow.close();
            });

            // Sync Control Icons
            const updatePipIcons = () => {
                pipPlayBtn.querySelector('i').className = mainVideo.paused ? 'fas fa-play' : 'fas fa-pause';
                pipMuteBtn.querySelector('i').className = mainVideo.volume === 0 ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
            };

            mainVideo.addEventListener('play', updatePipIcons);
            mainVideo.addEventListener('pause', updatePipIcons);
            mainVideo.addEventListener('volumechange', updatePipIcons);

            // Auto-Hide Controls Logic for PiP
            let pipIdleTimer;
            const hidePipControls = () => {
                if (mainVideo.paused) return;
                pipIdleTimer = setTimeout(() => {
                    pipContainer.classList.add('hide-controls');
                }, 2500);
            };
            hidePipControls();

            pipWindow.document.addEventListener('mousemove', () => {
                pipContainer.classList.remove('hide-controls');
                clearTimeout(pipIdleTimer);
                hidePipControls();
            });

            pipWindow.document.addEventListener('mouseleave', () => {
                pipContainer.classList.add('hide-controls');
            });

            // Restore Video back to Main Web Page on Close
            pipWindow.addEventListener('pagehide', () => {
                container.insertBefore(mainVideo, container.querySelector('.wrapper'));
                mainVideo.removeEventListener('play', updatePipIcons);
                mainVideo.removeEventListener('pause', updatePipIcons);
                mainVideo.removeEventListener('volumechange', updatePipIcons);
            });

            showFeedback("fa-clone", "Custom PiP Mode");
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
    if (!mainVideo.currentSrc && !mainVideo.srcObject) return showFeedback("fa-clone", "Open a video first");
    try {
        // The page's own fullscreen and a floating window don't mix: leave fullscreen first
        if (fullscreenElement()) await Promise.resolve(exitFullscreen()).catch(() => {});
        if (document.pictureInPictureEnabled && !mainVideo.disablePictureInPicture) {
            await mainVideo.requestPictureInPicture();
        } else if (mainVideo.webkitSupportsPresentationMode && mainVideo.webkitSupportsPresentationMode("picture-in-picture")) {
            // Older iPhones and iPads
            mainVideo.webkitSetPresentationMode("picture-in-picture");
        } else {
            throw new Error("unsupported");
        }
    } catch (err) {
        showFeedback("fa-clone", "Picture in picture isn't available here");
    }
};

pipBtn.addEventListener("click", toggleCustomPiP);
// The button only where some kind of picture in picture works
pipBtn.hidden = !("documentPictureInPicture" in window || document.pictureInPictureEnabled ||
    (mainVideo.webkitSupportsPresentationMode && mainVideo.webkitSupportsPresentationMode("picture-in-picture")));

// The whole player page goes fullscreen, so a room's chat can stay open beside the video.
// Phones turn sideways for a wide video; the iPhone can only show the video itself fullscreen.
const isTouch = matchMedia("(pointer: coarse)").matches;

const toggleFullscreen = () => {
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
let ignoreNextTouchPointerUp = false;
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
    if (ignoreNextTouchPointerUp || moved) {
        ignoreNextTouchPointerUp = false;
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
const soundLevel = () => boost.level > 1 ? 1 + (boost.level - 1) / 2 : mainVideo.volume;
const setSoundLevel = value => {
    const level = Math.max(0, Math.min(2, value));
    if (level <= 1 || container.classList.contains("youtube")) {
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
    // Volume: the lower half of the bar is 0-100%, the upper half the boost up to 300%
    const boosted = kind === "volume" && value > 1;
    const percent = kind === "volume" ? Math.round(value <= 1 ? value * 100 : 100 + (value - 1) * 200) : Math.round(value * 100);
    icon.className = `fa-solid ${kind === "brightness" ? "fa-sun" : value ? "fa-volume-high" : "fa-volume-xmark"}`;
    fill.style.height = `${kind === "volume" ? value * 50 : percent}%`;
    label.textContent = `${percent}%`;
    adjustment.classList.toggle("boosted", boosted);
    mobileBrightnessAdjustment.classList.toggle("show", kind === "brightness");
    mobileVolumeAdjustment.classList.toggle("show", kind === "volume");
    clearTimeout(mobileAdjustmentTimer);
    mobileAdjustmentTimer = setTimeout(() => {
        mobileBrightnessAdjustment.classList.remove("show");
        mobileVolumeAdjustment.classList.remove("show");
    }, 700);
};

onSurface("touchstart", e => {
    const portraitPhone = isTouch && matchMedia("(orientation: portrait)").matches;
    if (e.touches.length !== 1 || (!fullscreenElement() && !portraitPhone) || pinching) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const edge = touch.clientX - rect.left;
    const edgeWidth = rect.width * 0.22;
    const isFullscreen = Boolean(fullscreenElement());
    mobileSwipe = {
        x: touch.clientX,
        y: touch.clientY,
        kind: !isFullscreen ? "dismiss" : edge <= edgeWidth ? "brightness" : edge >= rect.width - edgeWidth ? "volume" : "dismiss",
        startValue: edge <= edgeWidth ? mobileBrightness : soundLevel(),
        handled: false
    };
}, { passive: true });

onSurface("touchmove", e => {
    if (!mobileSwipe || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - mobileSwipe.x;
    const dy = touch.clientY - mobileSwipe.y;
    if (Math.abs(dy) < 12 && !mobileSwipe.handled) return;

    const verticalSwipe = Math.abs(dy) > Math.abs(dx) * 1.2;
    if (mobileSwipe.kind === "dismiss" && !fullscreenElement() && dy < -80 && verticalSwipe) {
        mobileSwipe.handled = true;
        ignoreNextTouchPointerUp = true;
        toggleFullscreen();
        showFeedback("fa-up-long", "Entered fullscreen");
    } else if (mobileSwipe.kind === "dismiss" && fullscreenElement() && dy > 80 && verticalSwipe) {
        mobileSwipe.handled = true;
        ignoreNextTouchPointerUp = true;
        exitFullscreen();
        showFeedback("fa-down-long", "Exited fullscreen");
    } else if (mobileSwipe.kind === "brightness" && Math.abs(dy) > 12) {
        mobileSwipe.handled = true;
        updateMobileBrightness(mobileSwipe.startValue - dy / 300);
        showMobileAdjustment("brightness", mobileBrightness);
    } else if (mobileSwipe.kind === "volume" && Math.abs(dy) > 12) {
        mobileSwipe.handled = true;
        setSoundLevel(mobileSwipe.startValue - dy / 250);
        showMobileAdjustment("volume", soundLevel());
    }
    if (mobileSwipe.handled) e.preventDefault();
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

mainVideo.addEventListener("click", () => {
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
            let volUp = Math.min(1, mainVideo.volume + 0.1);
            setVolume(volUp);
            showFeedback("fa-volume-high", `${Math.round(volUp * 100)}%`);
            break;

        case "ArrowDown":
            e.preventDefault();
            let volDown = Math.max(0, mainVideo.volume - 0.1);
            setVolume(volDown);
            showFeedback(volDown === 0 ? "fa-volume-xmark" : "fa-volume-low", `${Math.round(volDown * 100)}%`);
            break;

        case "KeyF":
            toggleFullscreen();
            break;

        case "KeyM":
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

        case "KeyC":
            toggleSubtitles();
            break;

        case "Period":
            if (e.shiftKey) setSpeed(mainVideo.playbackRate + 0.25); // Shift + >
            break;

        case "Comma":
            if (e.shiftKey) setSpeed(mainVideo.playbackRate - 0.25); // Shift + <
            break;

        case "Slash":
            if (e.shiftKey) toggleShortcuts(); // ?
            break;
    }

    if (e.code.startsWith("Digit") && !e.shiftKey && mediaDuration()) {
        const digit = parseInt(e.key);
        if (!isNaN(digit)) {
            seekTo((digit / 10) * mediaDuration());
            showFeedback("fa-forward", `${digit * 10}%`);
        }
    }
});
