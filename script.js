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
    active: () => false // in a room: going home keeps the video playing for everyone
};

// Hide Controls on Idle
const hideControls = () => {
    if(together.stream ? together.stream.paused : mainVideo.paused) return;
    idleTimer = setTimeout(() => {
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
    if (location.hash === "#watch" && (currentFile || together.active())) showPlayer();
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
chooseVideoBtns.forEach(btn => btn.addEventListener("click", () => fileInput.click()));

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

const loadVideoFile = async (file) => {
    if(!file) return;
    if (together.onFile) together.onFile(file);
    prepareFor(file.name, file.size);
    currentFile = file;

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

browseBtn.addEventListener("click", () => fileInput.click());
openFileBtn.addEventListener("click", () => fileInput.click());

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
const handleDroppedFiles = files => {
    const list = [...files];
    const video = list.find(file => !isSubtitleFile(file));
    const subtitle = list.find(isSubtitleFile);
    if (video) loadVideoFile(video);
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
    handleDroppedFiles(e.dataTransfer.files);
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
    if (speedOptions.classList.contains("show")) return speedOptions.classList.remove("show");
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

// Speed Menu Toggle
speedBtn.addEventListener("click", () => speedOptions.classList.toggle("show"));

document.addEventListener("click", e => {
    if(!e.target.closest(".popup-menu-wrapper")) {
        speedOptions.classList.remove("show");
    }
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

// Play / Pause
const togglePlay = () => {
    if (together.stream) {
        const play = together.stream.paused;
        if (together.stream.request({ paused: !play })) showFeedback(play ? "fa-play" : "fa-pause", "");
        return;
    }
    if(mainVideo.paused) {
        mainVideo.play().catch(() => {});
        showFeedback("fa-play", "");
    } else {
        mainVideo.pause();
        showFeedback("fa-pause", "");
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

// Seek
const seek = (seconds) => {
    if (!mediaDuration()) return;
    if (together.stream) {
        if (!together.stream.request({ time: together.stream.currentTime() + seconds })) return;
    } else mainVideo.currentTime += seconds;
    showFeedback(seconds > 0 ? "fa-forward" : "fa-backward", `${seconds > 0 ? '+' : ''}${seconds}s`);
};

skipBackward.addEventListener("click", () => seek(-5));
skipForward.addEventListener("click", () => seek(5));

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

    // Native Browser PiP Fallback
    if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
        mainVideo.requestPictureInPicture();
    }
};

pipBtn.addEventListener("click", toggleCustomPiP);

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
    if (!isFullscreen) container.classList.remove("pinch-zoomed");
    fullScreenBtn.className = isFullscreen ? "fa-solid fa-compress" : "fa-solid fa-expand";
    fullScreenBtn.parentNode.title = isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)";
    if (!isFullscreen && screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (e) {}
    }
};
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

fullScreenBtn.parentNode.addEventListener("click", toggleFullscreen);

// Touch: a tap in the middle pauses or resumes; a double tap on the left or right third
// jumps back or forward 10 seconds, while a middle double tap enters fullscreen.
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

mainVideo.addEventListener("pointerup", e => {
    if (e.pointerType !== "touch" || pinching) return;
    if (ignoreNextTouchPointerUp) {
        ignoreNextTouchPointerUp = false;
        return;
    }
    touchedAt = Date.now();
    const rect = mainVideo.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (touchedAt - lastTap.at < 300 && Math.abs(x - lastTap.x) < 60) {
        clearTimeout(tapTimer);
        lastTap.at = 0;
        if (x < rect.width / 3) seek(-10);
        else if (x > rect.width * 2 / 3) seek(10);
        else toggleFullscreen();
        return;
    }
    lastTap = { at: touchedAt, x };
    tapTimer = setTimeout(() => {
        if (x >= rect.width / 3 && x <= rect.width * 2 / 3) togglePlay();
        else toggleControls();
    }, 300);
});

const pinchDistance = touches => {
    const [first, second] = touches;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};

mainVideo.addEventListener("touchstart", e => {
    if (e.touches.length !== 2 || !fullscreenElement()) return;
    pinchStartDistance = pinchDistance(e.touches);
    pinchScale = 1;
    pinching = true;
    clearTimeout(tapTimer);
}, { passive: true });

mainVideo.addEventListener("touchmove", e => {
    if (!pinching || e.touches.length !== 2) return;
    pinchScale = pinchDistance(e.touches) / pinchStartDistance;
    e.preventDefault();
}, { passive: false });

mainVideo.addEventListener("touchend", () => {
    if (!pinching) return;
    if (pinchScale > 1.08) {
        container.classList.add("pinch-zoomed");
        showFeedback("fa-magnifying-glass-plus", "Zoomed to fill");
    } else if (pinchScale < 0.92) {
        container.classList.remove("pinch-zoomed");
        showFeedback("fa-expand", "Fit to screen");
    }
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
const showMobileAdjustment = (kind, value) => {
    const adjustment = kind === "brightness" ? mobileBrightnessAdjustment : mobileVolumeAdjustment;
    const icon = adjustment.querySelector("i");
    const fill = adjustment.querySelector(".mobile-adjustment-fill");
    const label = adjustment.querySelector("span");
    const percent = Math.round(value * 100);
    icon.className = `fa-solid ${kind === "brightness" ? "fa-sun" : value ? "fa-volume-high" : "fa-volume-xmark"}`;
    fill.style.height = `${percent}%`;
    label.textContent = `${percent}%`;
    mobileBrightnessAdjustment.classList.toggle("show", kind === "brightness");
    mobileVolumeAdjustment.classList.toggle("show", kind === "volume");
    clearTimeout(mobileAdjustmentTimer);
    mobileAdjustmentTimer = setTimeout(() => {
        mobileBrightnessAdjustment.classList.remove("show");
        mobileVolumeAdjustment.classList.remove("show");
    }, 700);
};

mainVideo.addEventListener("touchstart", e => {
    const portraitPhone = isTouch && matchMedia("(orientation: portrait)").matches;
    if (e.touches.length !== 1 || (!fullscreenElement() && !portraitPhone) || pinching) return;
    const touch = e.touches[0];
    const rect = mainVideo.getBoundingClientRect();
    const edge = touch.clientX - rect.left;
    const edgeWidth = rect.width * 0.22;
    const isFullscreen = Boolean(fullscreenElement());
    mobileSwipe = {
        x: touch.clientX,
        y: touch.clientY,
        kind: !isFullscreen ? "dismiss" : edge <= edgeWidth ? "brightness" : edge >= rect.width - edgeWidth ? "volume" : "dismiss",
        startValue: edge <= edgeWidth ? mobileBrightness : mainVideo.volume,
        handled: false
    };
}, { passive: true });

mainVideo.addEventListener("touchmove", e => {
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
        setVolume(mobileSwipe.startValue - dy / 300);
        showMobileAdjustment("volume", mainVideo.volume);
    }
    if (mobileSwipe.handled) e.preventDefault();
}, { passive: false });

mainVideo.addEventListener("touchend", () => {
    if (mobileSwipe?.handled) ignoreNextTouchPointerUp = true;
    mobileSwipe = null;
}, { passive: true });

mainVideo.addEventListener("touchcancel", () => {
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
            toggleCustomPiP();
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
