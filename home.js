// CineTab's home page: the dashboard (search YouTube, and what was watched in this browser), and
// installing CineTab as an app (a service worker, sw.js, lets it open like one).

(() => {
    const home = document.querySelector(".home");
    if (!home) return; // The offline player has no home page

    // =================== INSTALLING AS AN APP ===================

    const installButtons = document.querySelectorAll(".install-app");
    const installDialog = home.querySelector(".install-dialog");
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(navigator.userAgent);
    const touch = matchMedia("(pointer: coarse)").matches;
    const installed = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
    // Chrome, Edge and Samsung Internet offer their own install prompt; it's kept for the button
    let installPrompt = null;

    // The button shows where installing is possible: the browser offered it, or on a phone or
    // tablet (Safari and Firefox install from their menus, explained in the dialog)
    const renderInstall = () => {
        const show = !installed() && (!!installPrompt || touch || ios);
        installButtons.forEach(button => button.hidden = !show);
    };

    const showInstallHelp = () => {
        const platform = ios ? "ios" : android || touch ? "android" : "desktop";
        installDialog.querySelectorAll("[data-platform]").forEach(steps => steps.hidden = steps.dataset.platform !== platform);
        installDialog.hidden = false;
        installDialog.querySelector(".install-close").focus();
    };
    const closeInstallHelp = () => installDialog.hidden = true;

    window.addEventListener("beforeinstallprompt", e => {
        e.preventDefault();
        installPrompt = e;
        renderInstall();
    });
    window.addEventListener("appinstalled", () => {
        installPrompt = null;
        renderInstall();
    });
    installButtons.forEach(button => button.addEventListener("click", async () => {
        if (!installPrompt) return showInstallHelp();
        const prompt = installPrompt;
        installPrompt = null;
        try {
            await prompt.prompt();
            await prompt.userChoice;
        } catch (e) {
            showInstallHelp();
        }
        renderInstall();
    }));
    installDialog.querySelector(".install-close").addEventListener("click", closeInstallHelp);
    installDialog.addEventListener("click", e => e.target === installDialog && closeInstallHelp());
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !installDialog.hidden) closeInstallHelp();
    });
    renderInstall();

    // The service worker keeps CineTab's own files, so the installed app opens even offline (only
    // over https, and not for a copy opened from disk)
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }

    // =================== DASHBOARD ===================

    const dashboard = home.querySelector("#dashboard");
    if (!dashboard || !window.CineHistory || !window.CineYouTube) return;
    const hero = home.querySelector(".hero");
    const searchForm = dashboard.querySelector(".yt-search");
    const searchInput = searchForm.querySelector(".yt-search-input");
    const pasteBtn = searchForm.querySelector(".yt-search-paste");
    const note = dashboard.querySelector(".dash-note");
    const historyBox = dashboard.querySelector(".dash-history");
    const filterBtns = historyBox.querySelectorAll(".dash-filter");
    const clearBtn = historyBox.querySelector(".dash-clear");
    const grid = historyBox.querySelector(".dash-grid");
    const empty = historyBox.querySelector(".dash-empty");
    const moreBtn = historyBox.querySelector(".dash-more");
    const FILTER_KEY = "cinetab:dash-filter";
    const SHOWN = 8;
    let filter = storage.get(FILTER_KEY) || "all";
    let showAll = false;

    let noteTimer = null;
    const showNote = (text, error = false) => {
        clearTimeout(noteTimer);
        note.hidden = !text;
        note.textContent = text || "";
        note.classList.toggle("error", error);
        if (text) noteTimer = setTimeout(() => note.hidden = true, 8000);
    };

    // ---------- Searching YouTube, or a pasted link

    const playRef = (ref, meta) => {
        const refused = CineYouTube.play(ref, meta);
        if (refused) showNote(refused, true);
    };

    const results = CineYouTube.createResults({
        host: dashboard.querySelector(".dash-results"),
        actions: [{ key: "play", label: "Play", icon: "fa-play" }],
        onPick: (ref, key, item) => playRef(ref, item.kind === "playlist"
            ? { listTitle: item.title, channel: item.channel, count: item.count }
            : { title: item.title, channel: item.channel, live: !!item.live })
    });

    const submit = () => {
        const value = searchInput.value.trim();
        if (!value) return searchInput.focus();
        showNote("");
        const ref = CineYouTube.parse(value);
        if (ref) {
            searchInput.value = "";
            results.clear();
            return playRef(ref, {});
        }
        results.run(value);
        // On a phone the keyboard steps aside for the results
        if (touch) searchInput.blur();
    };
    searchForm.addEventListener("submit", e => {
        e.preventDefault();
        submit();
    });
    searchInput.addEventListener("keydown", e => {
        if (e.key === "Escape" && results.open) {
            e.preventDefault();
            results.clear();
        }
    });
    pasteBtn.addEventListener("click", async () => {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (!text) return showNote("There's nothing copied to paste.", true);
            searchInput.value = text;
            if (CineYouTube.parse(text)) submit();
            else searchInput.focus();
        } catch (e) {
            showNote("This browser didn't allow reading what you copied. Paste with Ctrl+V (or a long press).", true);
            searchInput.focus();
        }
    });

    // "Search YouTube" links (the hero, an installed app's shortcut) put the cursor in the box
    const focusSearch = () => setTimeout(() => searchInput.focus({ preventScroll: true }), 350);
    home.querySelectorAll('a[href="#dashboard"]').forEach(link => link.addEventListener("click", focusSearch));

    // ---------- What was watched

    const relative = at => {
        const seconds = (Date.now() - at) / 1000;
        try {
            const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
            if (seconds < 60) return "just now";
            if (seconds < 3600) return format.format(-Math.round(seconds / 60), "minute");
            if (seconds < 86400) return format.format(-Math.round(seconds / 3600), "hour");
            if (seconds < 86400 * 30) return format.format(-Math.round(seconds / 86400), "day");
        } catch (e) {}
        return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    };
    const minutes = seconds => {
        const m = Math.round(seconds / 60);
        return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.max(1, m)} min`;
    };

    // Where a file was left: script.js keeps it as `resume:name:size`
    const filePosition = entry => parseFloat(storage.get(`resume:${entry.name}:${entry.size}`)) || 0;
    const progressOf = entry => {
        const time = entry.type === "file" ? filePosition(entry) : entry.time || 0;
        const duration = entry.duration || 0;
        return { time, duration, ratio: duration > 0 ? Math.min(1, time / duration) : 0 };
    };
    // Nearly at the end counts as watched: it opens from the start again
    const finished = ({ time, duration }) => duration > 0 && time >= duration - Math.min(30, duration * 0.05);

    const matches = entry => filter === "all" ? true
        : filter === "youtube" ? entry.type === "video" || entry.type === "playlist"
        : entry.type === filter;

    const titleOf = entry => entry.type === "file"
        ? savedTitle(entry.name, entry.size)
        : entry.type === "playlist" ? entry.title || entry.videoTitle || "YouTube playlist" : entry.title || "YouTube video";

    const card = entry => {
        const li = el("li", `dash-card ${entry.type}`);
        li.dataset.k = entry.k;
        const title = titleOf(entry);
        const progress = progressOf(entry);
        const done = finished(progress);

        const open = el("button", "dash-open");
        open.type = "button";
        open.dataset.act = "open";
        const thumb = el("span", "dash-thumb");
        const youTubeId = entry.type === "video" ? entry.id : entry.type === "playlist" ? entry.id : null;
        if (youTubeId) {
            const img = el("img");
            img.src = CineYouTube.thumbOf(youTubeId);
            img.alt = "";
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            thumb.append(img);
        } else {
            thumb.classList.add("placeholder");
            thumb.append(el("i", entry.type === "file" ? `fa-solid ${entry.audio ? "fa-music" : "fa-film"}` : "fa-solid fa-list"));
            if (entry.type === "file") {
                const extension = (entry.name.match(/\.([a-z0-9]{1,5})$/i) || [])[1];
                if (extension) thumb.append(el("span", "dash-ext", extension.toUpperCase()));
            }
        }
        const badge = el("span", "dash-badge");
        if (entry.type === "file") badge.append(el("i", "fa-solid fa-hard-drive"), " This device");
        else if (entry.type === "playlist") badge.append(el("i", "fa-solid fa-list"), entry.count ? ` ${entry.count} videos` : " Playlist");
        else badge.append(el("i", "fa-brands fa-youtube"), entry.room ? " In a room" : " YouTube");
        thumb.append(badge);
        const play = el("span", "dash-play");
        play.append(el("i", "fa-solid fa-play"));
        thumb.append(play);
        if (progress.ratio > 0 && !done) {
            const bar = el("span", "dash-progress");
            bar.style.setProperty("--p", `${(progress.ratio * 100).toFixed(1)}%`);
            thumb.append(bar);
        }

        const info = el("span", "dash-info");
        const name = el("b", "dash-title", title);
        info.append(name);
        const details = [];
        if (entry.type === "playlist" && entry.videoTitle && entry.videoTitle !== title) {
            details.push(`${Number.isInteger(entry.index) && entry.count ? `${entry.index + 1}/${entry.count}: ` : ""}${entry.videoTitle}`);
        } else if (entry.channel) details.push(entry.channel);
        if (entry.type === "file" && entry.size) details.push(formatBytes(entry.size));
        if (details.length) info.append(el("small", "dash-sub", details.join(" · ")));
        const state = entry.live ? "Live" : done ? "Watched" : progress.ratio > 0 && progress.duration ? `${minutes(progress.duration - progress.time)} left`
            : progress.duration ? minutes(progress.duration) : "";
        info.append(el("small", "dash-when", [state, relative(entry.at)].filter(Boolean).join(" · ")));
        open.append(thumb, info);
        open.title = entry.type === "file"
            ? `${progress.ratio > 0 && !done ? "Continue" : "Play"} “${title}” (${entry.name})`
            : `${progress.ratio > 0 && !done ? "Continue" : "Play"} “${title}”`;

        const remove = el("button", "dash-remove");
        remove.type = "button";
        remove.dataset.act = "remove";
        remove.title = `Remove “${title}” from the dashboard`;
        remove.setAttribute("aria-label", remove.title);
        remove.append(el("i", "fa-solid fa-xmark"));
        li.append(open, remove);
        return li;
    };

    const counts = list => ({
        all: list.length,
        youtube: list.filter(entry => entry.type === "video" || entry.type === "playlist").length,
        playlist: list.filter(entry => entry.type === "playlist").length,
        file: list.filter(entry => entry.type === "file").length
    });

    // Someone who has used CineTab (watched something, or has a saved room) gets the dashboard,
    // their rooms and converted videos first, above the introduction. Only as the home page
    // shows, so the page doesn't jump while it's being used.
    const place = has => {
        const group = [dashboard, home.querySelector("#rooms"), home.querySelector("#saved")].filter(Boolean);
        const first = has || !!home.querySelector(".room-list li");
        const isFirst = !!(dashboard.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (first && !isFirst) group.forEach(section => hero.before(section));
        else if (!first && isFirst) [...group].reverse().forEach(section => hero.after(section));
        dashboard.classList.toggle("first", first);
    };

    const render = (placing = false) => {
        if (homePage.hidden) return;
        const list = CineHistory.list();
        const count = counts(list);
        if (!count[filter]) filter = "all";
        filterBtns.forEach(button => {
            const on = button.dataset.filter === filter;
            button.setAttribute("aria-pressed", on);
            button.classList.toggle("active", on);
            button.hidden = button.dataset.filter !== "all" && !count[button.dataset.filter];
        });
        historyBox.querySelector(".dash-filters").hidden = list.length < 2;
        clearBtn.hidden = !list.length;
        const shown = list.filter(matches);
        grid.replaceChildren(...(showAll ? shown : shown.slice(0, SHOWN)).map(card));
        empty.hidden = list.length > 0;
        moreBtn.hidden = shown.length <= SHOWN;
        moreBtn.textContent = showAll ? "Show less" : `Show all ${shown.length}`;
        if (placing) place(list.length > 0);
    };

    filterBtns.forEach(button => button.addEventListener("click", () => {
        filter = button.dataset.filter;
        storage.set(FILTER_KEY, filter);
        showAll = false;
        render();
    }));
    moreBtn.addEventListener("click", () => {
        showAll = !showAll;
        render();
    });
    clearBtn.addEventListener("click", () => {
        if (!confirm("Clear everything you watched from the dashboard?\nYour files, converted videos and saved rooms aren't touched.")) return;
        CineHistory.clear();
        showNote("History cleared.");
    });

    // ---------- Opening something again

    // A video from this device: the kept file handle where the browser has one (it asks for
    // permission), otherwise the file picker (the video continues where it was left)
    const openFile = async entry => {
        const title = savedTitle(entry.name, entry.size);
        const handle = CineHistory.handles && await CineHistory.getHandle(entry.k);
        if (handle) {
            try {
                let permission = await handle.queryPermission({ mode: "read" });
                if (permission !== "granted") permission = await handle.requestPermission({ mode: "read" });
                if (permission === "granted") {
                    const file = await handle.getFile();
                    return loadVideoFile(file, handle);
                }
                return showNote(`Allow CineTab to open “${title}” to play it from here.`, true);
            } catch (e) {
                showNote(`“${entry.name}” can't be opened from where it was: it may have been moved, renamed or deleted. Pick it again.`, true);
            }
        }
        const at = filePosition(entry);
        showNote(`Pick “${entry.name}” again${at > 5 && !finished(progressOf(entry)) ? `: it continues at ${formatTime(at)}` : ""}.`);
        pickVideo();
    };

    const openEntry = entry => {
        if (entry.type === "file") return openFile(entry);
        const progress = progressOf(entry);
        const start = finished(progress) || progress.time < 5 ? 0 : Math.floor(progress.time);
        if (entry.type === "playlist") {
            return playRef({ id: entry.id || null, list: entry.list, start }, {
                listTitle: entry.title, channel: entry.channel, count: entry.count, videoTitle: entry.videoTitle,
                // Straight to the video it was on (the last video, finished: from the start)
                index: Number.isInteger(entry.index) ? (finished(progress) && entry.count && entry.index >= entry.count - 1 ? 0 : entry.index) : undefined
            });
        }
        playRef({ id: entry.id, list: null, start: entry.live ? 0 : start }, { title: entry.title, channel: entry.channel, live: !!entry.live });
    };

    grid.addEventListener("click", e => {
        const button = e.target.closest("[data-act]");
        const row = button && button.closest("[data-k]");
        const entry = row && CineHistory.get(row.dataset.k);
        if (!entry) return;
        if (button.dataset.act === "remove") return CineHistory.remove(entry.k);
        openEntry(entry);
    });

    // Up to date whenever the home page shows (positions change while watching) and when the
    // history changes (also in another tab)
    CineHistory.onChange(() => render());
    // A video's length is known once it loads (and whether it's music)
    mainVideo.addEventListener("loadedmetadata", () => {
        if (together.stream || !currentSource || !Number.isFinite(mainVideo.duration)) return;
        CineHistory.file({ name: currentSource.name, size: currentSource.size, title: savedTitle(currentSource.name, currentSource.size), duration: mainVideo.duration, audio: !mainVideo.videoWidth }, false);
    });
    new MutationObserver(() => !homePage.hidden && render(true)).observe(homePage, { attributes: true, attributeFilter: ["hidden"] });
    render(true);

    // The player's "Select a movie" box can search YouTube too (outside a room; a room has its own)
    const uploadScroll = uploadOverlay.querySelector(".box-scroll");
    const toSearch = el("button", "secondary-btn upload-yt");
    toSearch.type = "button";
    toSearch.title = "Search YouTube and play a video or playlist here";
    toSearch.append(el("i", "fa-brands fa-youtube"), " Search YouTube");
    uploadScroll.querySelector("#browse-btn").after(toSearch);
    toSearch.addEventListener("click", () => {
        if (together.active()) return together.openPanel && together.openPanel();
        if (location.hash === "#watch") history.back();
        else showHome();
        setTimeout(() => {
            dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
            searchInput.focus({ preventScroll: true });
        }, 100);
    });

    // An installed app's "Search YouTube" shortcut opens /?search
    if (new URLSearchParams(location.search).has("search")) {
        history.replaceState(null, "", location.pathname + location.hash);
        dashboard.scrollIntoView();
        searchInput.focus();
    }
})();
