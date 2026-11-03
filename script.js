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
chooseVideoBtns = document.querySelectorAll(".choose-video"),
dropTargets = [uploadBox, homeDrop];

let idleTimer;
let clickTimeout;
let currentURL = null;
let currentFileKey = null;
let lastSavedAt = 0;

// Hide Controls on Idle
const hideControls = () => {
    if(mainVideo.paused) return;
    idleTimer = setTimeout(() => {
        container.classList.remove("show-controls");
        container.classList.add("hide-cursor");
    }, 3000);
}
hideControls();

container.addEventListener("mousemove", () => {
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

const savePosition = () => {
    if (!currentFileKey || !mainVideo.duration) return;
    storage.set(currentFileKey, mainVideo.currentTime);
};

// Home <-> Player views (one page, so the picked file never has to leave this document)
const showPlayer = () => {
    homePage.hidden = true;
    playerPage.hidden = false;
    document.body.classList.add("watching");
    if (location.hash !== "#watch") history.pushState(null, "", "#watch");
};

const showHome = () => {
    mainVideo.pause();
    if (document.fullscreenElement) document.exitFullscreen();
    playerPage.hidden = true;
    homePage.hidden = false;
    document.body.classList.remove("watching");
};

// Browser back button returns to the home page
window.addEventListener("popstate", () => {
    if (location.hash === "#watch" && mainVideo.getAttribute("src")) showPlayer();
    else showHome();
});

// A reload on #watch has no video any more, so start from home
if (location.hash === "#watch") history.replaceState(null, "", location.pathname);

playerHomeBtn.addEventListener("click", () => history.back());
chooseVideoBtns.forEach(btn => btn.addEventListener("click", () => fileInput.click()));

// Load Video File
const loadVideoFile = (file) => {
    if(!file) return;
    showPlayer();
    if (currentURL) URL.revokeObjectURL(currentURL);
    removeSubtitles();
    currentURL = URL.createObjectURL(file);
    currentFileKey = `resume:${file.name}:${file.size}`;
    mainVideo.src = currentURL;
    previewVideo.src = currentURL;
    videoTitle.innerText = file.name.replace(/\.[^/.]+$/, "");
    uploadOverlay.classList.add("hidden");
    errorOverlay.classList.add("hidden");
    mainVideo.play().catch(() => {});
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

const removeSubtitles = () => {
    mainVideo.querySelectorAll("track").forEach(track => {
        URL.revokeObjectURL(track.src);
        track.remove();
    });
    subtitlesBtn.classList.remove("active");
};

const loadSubtitleFile = async (file) => {
    if (!file) return;
    if (!mainVideo.getAttribute("src")) {
        showFeedback("fa-closed-captioning", "Open a video first");
        return;
    }
    let text = (await file.text()).replace(/^\uFEFF/, "");
    if (!text.startsWith("WEBVTT")) text = srtToVtt(text);
    // Lift cues a few lines up so they don't sit under the control bar
    text = text.replace(/^(.*-->.*)$/gm, line => /line:/.test(line) ? line : `${line} line:-4`);

    removeSubtitles();
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = file.name;
    track.src = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
    track.default = true;
    mainVideo.appendChild(track);
    track.track.mode = "showing";
    subtitlesBtn.classList.add("active");
    showFeedback("fa-closed-captioning", "Subtitles On");
};

const toggleSubtitles = () => {
    const track = mainVideo.textTracks[0];
    if (!track) return subtitleInput.click();
    const show = track.mode !== "showing";
    track.mode = show ? "showing" : "hidden";
    subtitlesBtn.classList.toggle("active", show);
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

// Video Error Handling
mainVideo.addEventListener("error", () => {
    if (!mainVideo.getAttribute("src")) return;
    uploadOverlay.classList.add("hidden");
    errorMessage.innerText = "This browser can't decode this file's video/audio format. Try Chrome or Edge, or convert it to MP4 (H.264 video + AAC audio).";
    errorOverlay.classList.remove("hidden");
});

// Watch Together Help
shareHelpBtn.addEventListener("click", () => {
    mainVideo.pause();
    helpOverlay.classList.remove("hidden");
});
closeHelpBtn.addEventListener("click", () => helpOverlay.classList.add("hidden"));

closeErrorBtn.addEventListener("click", () => {
    errorOverlay.classList.add("hidden");
    uploadOverlay.classList.remove("hidden");
});

mainVideo.addEventListener("loadedmetadata", () => {
    videoDuration.innerText = formatTime(mainVideo.duration);

    const saved = parseFloat(storage.get(currentFileKey));
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
videoTimeline.addEventListener("mousemove", e => {
    if (!mainVideo.duration) return;
    let timelineWidth = videoTimeline.clientWidth;
    let offsetX = e.offsetX;
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
});

videoTimeline.addEventListener("click", e => {
    if (!mainVideo.duration) return;
    let timelineWidth = videoTimeline.clientWidth;
    mainVideo.currentTime = (e.offsetX / timelineWidth) * mainVideo.duration;
});

mainVideo.addEventListener("timeupdate", e => {
    let {currentTime, duration} = e.target;
    let percent = (currentTime / duration) * 100;
    progressBar.style.width = `${percent}%`;
    currentVidTime.innerText = formatTime(currentTime);

    if (Date.now() - lastSavedAt > 5000) {
        lastSavedAt = Date.now();
        savePosition();
    }
});

const draggableProgressBar = e => {
    if (!mainVideo.duration) return;
    let timelineWidth = videoTimeline.clientWidth;
    progressBar.style.width = `${e.offsetX}px`;
    mainVideo.currentTime = (e.offsetX / timelineWidth) * mainVideo.duration;
    currentVidTime.innerText = formatTime(mainVideo.currentTime);
}

// Volume Controls
const setVolume = (value) => {
    mainVideo.volume = value;
    volumeSlider.value = value;
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
    if(mainVideo.paused) {
        mainVideo.play().catch(() => {});
        showFeedback("fa-play", "");
    } else {
        mainVideo.pause();
        showFeedback("fa-pause", "");
    }
};

playPauseBtn.parentNode.addEventListener("click", togglePlay);
mainVideo.addEventListener("play", () => {
    playPauseBtn.className = "fas fa-pause";
    clearTimeout(idleTimer);
    hideControls();
});
mainVideo.addEventListener("pause", () => playPauseBtn.className = "fas fa-play");

// Seek
const seek = (seconds) => {
    if (!mainVideo.duration) return;
    mainVideo.currentTime += seconds;
    showFeedback(seconds > 0 ? "fa-forward" : "fa-backward", `${seconds > 0 ? '+' : ''}${seconds}s`);
};

skipBackward.addEventListener("click", () => seek(-5));
skipForward.addEventListener("click", () => seek(5));

// Playback Speed
speedOptions.querySelectorAll("li[data-speed]").forEach(option => {
    option.addEventListener("click", () => {
        mainVideo.playbackRate = option.dataset.speed;
        speedOptions.querySelector(".active")?.classList.remove("active");
        option.classList.add("active");
        showFeedback("fa-gauge-high", `${option.dataset.speed}x`);
    });
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

const toggleFullscreen = () => {
    if(document.fullscreenElement) return document.exitFullscreen();
    container.requestFullscreen();
};

// Keep the button & layout in sync even when leaving fullscreen with Esc
document.addEventListener("fullscreenchange", () => {
    const isFullscreen = document.fullscreenElement === container;
    container.classList.toggle("fullscreen", isFullscreen);
    fullScreenBtn.className = isFullscreen ? "fa-solid fa-compress" : "fa-solid fa-expand";
});

fullScreenBtn.parentNode.addEventListener("click", toggleFullscreen);

mainVideo.addEventListener("click", () => {
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
            if (e.shiftKey) { // Shift + >
                let speed = Math.min(2, mainVideo.playbackRate + 0.25);
                mainVideo.playbackRate = speed;
                showFeedback("fa-gauge-high", `${speed}x`);
            }
            break;

        case "Comma":
            if (e.shiftKey) { // Shift + <
                let speed = Math.max(0.25, mainVideo.playbackRate - 0.25);
                mainVideo.playbackRate = speed;
                showFeedback("fa-gauge-high", `${speed}x`);
            }
            break;
    }

    if (e.code.startsWith("Digit") && !e.shiftKey && mainVideo.duration) {
        const digit = parseInt(e.key);
        if (!isNaN(digit)) {
            mainVideo.currentTime = (digit / 10) * mainVideo.duration;
            showFeedback("fa-forward", `${digit * 10}%`);
        }
    }
});

videoTimeline.addEventListener("mousedown", () => videoTimeline.addEventListener("mousemove", draggableProgressBar));
document.addEventListener("mouseup", () => videoTimeline.removeEventListener("mousemove", draggableProgressBar));