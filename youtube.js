// CineTab and YouTube, outside a room: search YouTube, and play a video or playlist on your own in
// YouTube's own player, driven by CineTab's controls (play / pause, timeline, jumps, speed,
// volume, fullscreen, captions, Shift + N / P in a playlist). What you watch is remembered for the
// dashboard (history.js). Rooms (room.js) use the same search, and a room created while a YouTube
// video plays here carries on with it, for everyone.
//
// Searching: YouTube has no search that works without a key. With a YouTube Data API key below,
// searches go to YouTube itself; otherwise (and if YouTube refuses) they go to public Piped
// servers, open-source YouTube front ends whose API allows any website. Those come and go, so a
// few are tried and the one that answered is remembered. If none answers, the person is offered
// YouTube's own search page, and pasting a link always works.

(() => {
    const frame = document.querySelector(".yt-frame");
    if (!frame || !window.CineHistory) return; // The offline player has no YouTube

    // Optional: a YouTube Data API v3 key. In Google Cloud console restrict it to this site's
    // address (HTTP referrers, e.g. https://cinetab.github.io/*) and to the YouTube Data API.
    // The free quota is about 100 searches a day; after that, Piped answers.
    const YOUTUBE_API_KEY = "";
    const PIPED_APIS = [
        "https://api.piped.private.coffee",
        "https://pipedapi.ducks.party",
        "https://pipedapi.kavin.rocks",
        "https://pipedapi.adminforge.de",
        "https://pipedapi.r4fo.com"
    ];
    const PIPED_KEY = "cinetab:piped";
    const YT_ID = /^[A-Za-z0-9_-]{11}$/;
    const YT_LIST = /^[A-Za-z0-9_-]{2,64}$/;
    const YT_HOST = "https://www.youtube-nocookie.com";
    const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
    const now = () => performance.now();

    // ---------- Links

    // A link to a video, a playlist, or a video in a playlist: { id, list, start } (null if it isn't)
    const parse = text => {
        const raw = String(text || "").trim();
        if (!raw || /\s/.test(raw)) return null;
        let url;
        try {
            url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        } catch (e) {
            return null;
        }
        const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
        const parts = url.pathname.split("/").filter(Boolean);
        let id = null;
        if (host === "youtu.be") id = parts[0];
        else if (host === "youtube.com" || host === "youtube-nocookie.com") {
            if (parts[0] === "watch") id = url.searchParams.get("v");
            else if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1];
            else if (parts[0] !== "playlist") return null;
        } else return null;
        const t = url.searchParams.get("t") || url.searchParams.get("start") || "";
        const hms = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
        id = id && YT_ID.test(id) ? id : null;
        let list = url.searchParams.get("list");
        list = list && YT_LIST.test(list) ? list : null;
        if (!id && !list) return null;
        return { id, list, start: hms ? (+(hms[1] || 0)) * 3600 + (+(hms[2] || 0)) * 60 + (+(hms[3] || 0)) : 0 };
    };

    // ---------- YouTube's player API (shared with room.js)

    const API_SRC = "https://www.youtube.com/iframe_api";
    let apiLoading = null;
    const api = () => apiLoading ||= new Promise((resolve, reject) => {
        if (window.YT && window.YT.Player) return resolve(window.YT);
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof previous === "function") previous();
            resolve(window.YT);
        };
        const script = document.createElement("script");
        script.src = API_SRC;
        script.onerror = () => {
            apiLoading = null;
            script.remove();
            reject(new Error("YouTube can't be reached from this network"));
        };
        document.head.append(script);
    });

    // ---------- Search

    const getJSON = async (url, ms = 8000) => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), ms);
        try {
            const response = await fetch(url, { signal: abort.signal, credentials: "omit" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    };

    // YouTube's API escapes titles as HTML (&amp;, &#39;); this turns them back into text without
    // running or loading anything
    const unescape = text => new DOMParser().parseFromString(String(text || ""), "text/html").documentElement.textContent;
    const thumbOf = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    const text = (value, max = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

    const searchYouTube = async (query, kind, token) => {
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.search = new URLSearchParams({
            part: "snippet", maxResults: "20", q: query, type: kind, key: YOUTUBE_API_KEY,
            ...(kind === "video" ? { videoEmbeddable: "true" } : {}),
            ...(token ? { pageToken: token } : {})
        });
        const data = await getJSON(url);
        const items = (data.items || []).map(item => {
            const s = item.snippet || {};
            const id = item.id && item.id.videoId;
            const list = item.id && item.id.playlistId;
            const thumb = s.thumbnails && (s.thumbnails.medium || s.thumbnails.default);
            return {
                kind: list ? "playlist" : "video",
                id: id && YT_ID.test(id) ? id : null,
                list: list && YT_LIST.test(list) ? list : null,
                title: text(unescape(s.title)),
                channel: text(unescape(s.channelTitle), 100),
                thumb: id ? thumbOf(id) : thumb && /^https:\/\//.test(thumb.url) ? thumb.url : "",
                live: s.liveBroadcastContent === "live",
                published: s.publishedAt ? Date.parse(s.publishedAt) : null
            };
        }).filter(item => item.id || item.list);
        return { items, next: data.nextPageToken ? { provider: "youtube", token: data.nextPageToken } : null };
    };

    const searchPiped = async (base, query, kind, token) => {
        const filter = kind === "playlist" ? "playlists" : "videos";
        const params = new URLSearchParams({ q: query, filter });
        const url = token ? `${base}/nextpage/search?nextpage=${encodeURIComponent(token)}&${params}` : `${base}/search?${params}`;
        const data = await getJSON(url);
        if (!data || !Array.isArray(data.items)) throw new Error("Not a search answer");
        const items = data.items.map(item => {
            let link;
            try {
                link = new URL(item.url, "https://www.youtube.com");
            } catch (e) {
                return null;
            }
            const id = link.searchParams.get("v");
            const list = link.searchParams.get("list");
            if (item.type === "stream" && id && YT_ID.test(id)) {
                return {
                    kind: "video", id, list: null,
                    title: text(item.title), channel: text(item.uploaderName, 100), thumb: thumbOf(id),
                    duration: item.duration > 0 ? item.duration : null, live: item.duration === -1,
                    views: item.views > 0 ? item.views : null, ago: text(item.uploadedDate, 40), short: !!item.isShort
                };
            }
            if (item.type === "playlist" && list && YT_LIST.test(list)) {
                // Piped proxies thumbnails; YouTube's own address loads straight from YouTube
                const video = String(item.thumbnail || "").match(/\/vi\/([A-Za-z0-9_-]{11})\//);
                return {
                    kind: "playlist", id: null, list,
                    title: text(item.name), channel: text(item.uploaderName, 100),
                    thumb: video ? thumbOf(video[1]) : "", count: item.videos > 0 ? item.videos : null
                };
            }
            return null;
        }).filter(Boolean);
        return { items, next: data.nextpage ? { provider: base, token: data.nextpage } : null };
    };

    // { items, next } for `query`; `kind`: "video" or "playlist"; `page`: the `next` of the last answer
    const search = async (query, kind = "video", page = null) => {
        if (page) {
            return page.provider === "youtube" ? searchYouTube(query, kind, page.token) : searchPiped(page.provider, query, kind, page.token);
        }
        const remembered = storage.get(PIPED_KEY);
        const bases = remembered && PIPED_APIS.includes(remembered) ? [remembered, ...PIPED_APIS.filter(base => base !== remembered)] : PIPED_APIS;
        const providers = [...(YOUTUBE_API_KEY ? ["youtube"] : []), ...bases];
        for (const provider of providers) {
            try {
                if (provider === "youtube") return await searchYouTube(query, kind);
                const result = await searchPiped(provider, query, kind);
                storage.set(PIPED_KEY, provider);
                return result;
            } catch (e) {}
        }
        throw new Error("Search isn't available right now");
    };

    // ---------- Search results, on the home page and in a room

    const shortTime = seconds => {
        if (!Number.isFinite(seconds) || seconds <= 0) return "";
        const s = Math.floor(seconds % 60), m = Math.floor(seconds / 60) % 60, h = Math.floor(seconds / 3600);
        return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
    };
    let compactNumber = null;
    try {
        compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
    } catch (e) {}
    const views = n => n ? `${compactNumber ? compactNumber.format(n) : n} views` : "";
    const refOf = item => item.kind === "playlist" ? { id: null, list: item.list, start: 0 } : { id: item.id, list: null, start: 0 };

    // A search box's results: a Videos / Playlists switch, the results and "More results".
    // `actions`: [{ key, label, icon }], the first one is what a click on a result does;
    // `onPick(ref, key, item)` gets the chosen one.
    const createResults = ({ host, actions, onPick, compact = false }) => {
        const head = el("div", "yt-results-head");
        const kinds = el("div", "yt-kinds");
        kinds.setAttribute("role", "radiogroup");
        kinds.setAttribute("aria-label", "Show");
        const kindButton = (kind, label, icon) => {
            const button = el("button", "yt-kind");
            button.type = "button";
            button.dataset.kind = kind;
            button.setAttribute("role", "radio");
            button.append(el("i", `fa-solid ${icon}`), el("span", null, label));
            return button;
        };
        kinds.append(kindButton("video", "Videos", "fa-play"), kindButton("playlist", "Playlists", "fa-list"));
        const onYouTube = el("a", "yt-on-youtube");
        onYouTube.target = "_blank";
        onYouTube.rel = "noopener";
        onYouTube.append(el("span", null, "YouTube"), el("i", "fa-solid fa-arrow-up-right-from-square"));
        const close = el("button", "yt-results-close");
        close.type = "button";
        close.title = "Close the results";
        close.setAttribute("aria-label", close.title);
        close.append(el("i", "fa-solid fa-xmark"));
        head.append(kinds, onYouTube, close);
        const status = el("p", "yt-status");
        status.setAttribute("aria-live", "polite");
        const list = el("ul", `yt-result-list${compact ? " compact" : ""}`);
        const more = el("button", "yt-more", "More results");
        more.type = "button";
        host.replaceChildren(head, status, list, more);
        host.hidden = true;

        const state = { query: "", kind: "video", next: null, items: [], token: 0, busy: false };

        const showStatus = (message, kind = "") => {
            status.replaceChildren();
            status.className = `yt-status ${kind}`.trim();
            status.hidden = !message;
            if (!message) return;
            if (kind === "busy") status.append(el("i", "fa-solid fa-circle-notch fa-spin"), " ");
            status.append(message);
            if (kind === "error") {
                status.append(" ");
                const link = el("a", null, "Search on YouTube instead");
                link.href = onYouTube.href;
                link.target = "_blank";
                link.rel = "noopener";
                status.append(link, ", copy the video's link there and paste it here.");
            }
        };

        const renderKinds = () => kinds.querySelectorAll(".yt-kind").forEach(button => {
            const on = button.dataset.kind === state.kind;
            button.classList.toggle("active", on);
            button.setAttribute("aria-checked", on);
        });

        const itemRow = (item, i) => {
            const li = el("li", "yt-result");
            li.dataset.i = i;
            const main = el("button", "yt-result-main");
            main.type = "button";
            main.dataset.act = actions[0].key;
            main.title = `${actions[0].label}: ${item.title}`;
            const thumb = el("span", "yt-thumb");
            if (item.thumb) {
                const img = el("img");
                img.src = item.thumb;
                img.alt = "";
                img.loading = "lazy";
                img.referrerPolicy = "no-referrer";
                thumb.append(img);
            } else thumb.append(el("i", "fa-brands fa-youtube"));
            const badge = item.kind === "playlist" ? (item.count ? `${item.count} videos` : "Playlist")
                : item.live ? "LIVE" : shortTime(item.duration);
            if (badge) {
                const b = el("span", `yt-badge${item.live ? " live" : ""}`);
                if (item.kind === "playlist") b.append(el("i", "fa-solid fa-list"), " ");
                b.append(badge);
                thumb.append(b);
            }
            const info = el("span", "yt-info");
            info.append(el("b", null, item.title || "YouTube video"));
            const meta = [item.channel, views(item.views), item.ago].filter(Boolean).join(" · ");
            if (meta) info.append(el("small", null, meta));
            main.append(thumb, info);
            li.append(main);
            if (actions.length > 1) {
                const row = el("span", "yt-result-actions");
                actions.forEach((action, n) => {
                    const button = el("button", `yt-act${n === 0 ? " primary" : ""}`);
                    button.type = "button";
                    button.dataset.act = action.key;
                    button.title = action.label;
                    button.setAttribute("aria-label", `${action.label}: ${item.title}`);
                    button.append(el("i", `fa-solid ${action.icon}`), el("span", null, action.label));
                    row.append(button);
                });
                li.append(row);
            }
            return li;
        };

        const run = async (query, kind = state.kind, page = null) => {
            query = text(query, 150);
            if (!query) return;
            const token = ++state.token;
            state.query = query;
            state.kind = kind;
            state.busy = true;
            renderKinds();
            onYouTube.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${kind === "playlist" ? "&sp=EgIQAw%253D%253D" : ""}`;
            onYouTube.title = `See “${query}” on YouTube (opens a new tab)`;
            host.hidden = false;
            if (!page) {
                state.items = [];
                list.replaceChildren();
            }
            more.hidden = true;
            showStatus(page ? "" : `Searching YouTube for “${query}”…`, "busy");
            try {
                const result = await search(query, kind, page);
                if (token !== state.token) return;
                const start = state.items.length;
                state.items.push(...result.items);
                state.next = result.next;
                list.append(...result.items.map((item, i) => itemRow(item, start + i)));
                showStatus(state.items.length ? "" : `Nothing found for “${query}”.`);
                more.hidden = !state.next || !result.items.length;
            } catch (e) {
                if (token !== state.token) return;
                showStatus(page ? "Couldn't load more results." : "YouTube search isn't answering right now.", "error");
            } finally {
                if (token === state.token) state.busy = false;
            }
        };

        kinds.addEventListener("click", e => {
            const button = e.target.closest(".yt-kind");
            if (button && state.query && button.dataset.kind !== state.kind) run(state.query, button.dataset.kind);
        });
        more.addEventListener("click", () => !state.busy && state.next && run(state.query, state.kind, state.next));
        list.addEventListener("click", e => {
            const button = e.target.closest("[data-act]");
            const row = button && button.closest(".yt-result");
            const item = row && state.items[+row.dataset.i];
            if (item) onPick(refOf(item), button.dataset.act, item);
        });
        const clear = () => {
            state.token++;
            state.query = "";
            state.items = [];
            list.replaceChildren();
            host.hidden = true;
        };
        close.addEventListener("click", clear);
        renderKinds();
        return { run, clear, get open() { return !host.hidden; } };
    };

    // ---------- Playing on your own

    const streamWait = document.querySelector(".room-stream-wait");
    const streamWaitText = streamWait && streamWait.querySelector("span");
    const prevTrackBtn = container.querySelector(".prev-track");
    const nextTrackBtn = container.querySelector(".next-track");
    // YouTube's player for watching alone, beside the one a room uses (room.js)
    const mount = el("div", "yt-mount yt-solo");
    frame.append(mount);

    const solo = {
        player: null, ready: false, creating: null,
        active: false, ref: null, meta: {}, intent: false, started: 0, error: null,
        wantId: null, wantStart: 0, cueTimer: null, timer: null,
        shownPlaying: null, savedAt: 0, captions: false, token: 0
    };

    const state = () => {
        if (!solo.ready) return null;
        try {
            return solo.player.getPlayerState();
        } catch (e) {
            return null;
        }
    };
    const playlist = () => {
        try {
            const ids = solo.ready && solo.ref && solo.ref.list ? solo.player.getPlaylist() : null;
            return Array.isArray(ids) && ids.length ? ids : null;
        } catch (e) {
            return null;
        }
    };
    const playlistIndex = () => {
        try {
            return solo.player.getPlaylistIndex();
        } catch (e) {
            return -1;
        }
    };
    // The video that should be on (not an ad)
    const expectedId = () => {
        const ids = playlist();
        if (ids) return ids[playlistIndex()] || null;
        return solo.ref && solo.ref.id;
    };
    const videoData = () => {
        try {
            return solo.player.getVideoData() || {};
        } catch (e) {
            return {};
        }
    };
    // A live stream (YouTube says so once it plays; the search said so before)
    const live = () => {
        const data = solo.ready ? videoData() : {};
        if (typeof data.isLive === "boolean" && data.video_id === expectedId()) return data.isLive;
        return !!solo.meta.live;
    };

    const soloControls = {
        get paused() {
            const s = state();
            if (s === null) return !solo.intent;
            return !(s === S.PLAYING || s === S.BUFFERING || (solo.intent && (s === S.UNSTARTED || s === S.CUED)));
        },
        get rate() {
            try {
                return solo.ready ? solo.player.getPlaybackRate() || 1 : 1;
            } catch (e) {
                return 1;
            }
        },
        // A live stream has no length: the timeline is full and only jumps move in it
        get duration() {
            try {
                return solo.ready && !live() ? solo.player.getDuration() || 0 : 0;
            } catch (e) {
                return 0;
            }
        },
        currentTime: () => {
            try {
                return solo.ready ? solo.player.getCurrentTime() || 0 : 0;
            } catch (e) {
                return 0;
            }
        },
        request: change => {
            if ("paused" in change) solo.intent = !change.paused;
            if (!solo.ready) return true;
            const player = solo.player;
            try {
                if (Number.isFinite(change.rate)) player.setPlaybackRate(Math.min(2, Math.max(0.25, change.rate)));
                // Live: the timeline has no length, so only jumps (← →, double taps) count
                const jump = Number.isFinite(change.time) && (!live() || Math.abs(change.time - soloControls.currentTime()) < 3600);
                if (jump) player.seekTo(Math.max(0, change.time), true);
                if (change.paused === true) player.pauseVideo();
                else if (change.paused === false) {
                    // Play at the end of a video starts it again
                    if (state() === S.ENDED && !Number.isFinite(change.time)) player.seekTo(0, true);
                    player.playVideo();
                }
            } catch (e) {}
            tick();
            return true;
        },
        toggleSubtitles: () => {
            if (!solo.ready) return;
            solo.captions = !solo.captions;
            try {
                if (solo.captions) solo.player.loadModule("captions");
                else solo.player.unloadModule("captions");
            } catch (e) {}
            subtitlesBtn.classList.toggle("active", solo.captions);
            showFeedback("fa-closed-captioning", solo.captions ? "YouTube captions on" : "YouTube captions off");
        },
        loadSubtitles: () => showFeedback("fa-closed-captioning", "Subtitle files are for your own videos")
    };

    const syncVolume = () => {
        if (!solo.ready) return;
        try {
            if (mainVideo.muted || mainVideo.volume === 0) solo.player.mute();
            else {
                solo.player.unMute();
                solo.player.setVolume(Math.round(mainVideo.volume * 100));
            }
        } catch (e) {}
    };
    // The player's volume slider and mute button work on YouTube's player too
    mainVideo.addEventListener("volumechange", () => together.stream === soloControls && syncVolume());

    const ERRORS = {
        2: "This YouTube link doesn't work.",
        5: "YouTube couldn't play this video in the browser.",
        100: "This video is private or was removed.",
        101: "The uploader doesn't allow this video to be played outside YouTube.",
        150: "The uploader doesn't allow this video to be played outside YouTube.",
        153: "YouTube didn't allow this video to be played here."
    };

    const onState = e => {
        if (!solo.active) return;
        if (e.data === S.PLAYING) {
            solo.error = null;
            // A video of a playlist opened at a moment (a link with a time, or from the dashboard)
            const data = videoData();
            if (solo.wantStart && data.video_id && data.video_id === expectedId()) {
                const at = solo.wantStart;
                solo.wantStart = 0;
                try {
                    solo.player.seekTo(at, true);
                } catch (err) {}
            }
        }
        if (e.data === S.ENDED) {
            const ids = playlist();
            if (!ids || playlistIndex() >= ids.length - 1) {
                solo.intent = false;
                save(true);
            }
        }
        tick();
    };

    const onError = e => {
        if (!solo.active) return;
        solo.error = ERRORS[e.data] || "YouTube couldn't play this video.";
        tick();
        // In a playlist, a video that can't be played is skipped
        const ids = playlist();
        if (ids && playlistIndex() < ids.length - 1) {
            const token = solo.token;
            showFeedback("fa-forward-step", "Skipping a video that can't play");
            setTimeout(() => {
                if (!solo.active || solo.token !== token) return;
                solo.error = null;
                try {
                    solo.player.nextVideo();
                } catch (err) {}
            }, 2000);
        }
    };

    const ensurePlayer = () => solo.creating ||= api().then(YT => new Promise(resolve => {
        const holder = el("div");
        mount.replaceChildren(holder);
        solo.player = new YT.Player(holder, {
            host: YT_HOST,
            width: "100%",
            height: "100%",
            // CineTab's controls drive it
            playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, autoplay: 1, origin: location.origin },
            events: {
                onReady: () => {
                    solo.ready = true;
                    resolve(solo.player);
                },
                onStateChange: onState,
                onError
            }
        });
    })).catch(error => {
        solo.creating = null;
        throw error;
    });

    // Remembers where you are, for the dashboard. `ended`: the end of the video (or playlist)
    const save = (ended = false) => {
        if (!solo.ready || !solo.ref) return;
        const data = videoData();
        const id = data.video_id;
        if (!id || !YT_ID.test(id) || id !== expectedId()) return; // nothing loaded yet, or an ad
        solo.savedAt = now();
        // A live stream has no place to come back to: it opens live again
        const isLive = live();
        const duration = isLive ? 0 : soloControls.duration;
        const time = isLive ? 0 : ended ? duration : soloControls.currentTime();
        const title = text(data.title) || solo.meta.title || "";
        const channel = text(data.author, 100) || solo.meta.channel || "";
        if (solo.ref.list) {
            const ids = playlist();
            CineHistory.put(`pl:${solo.ref.list}`, {
                type: "playlist", list: solo.ref.list,
                title: solo.meta.listTitle || "", channel: solo.meta.listChannel || channel,
                id, videoTitle: title, index: Math.max(0, playlistIndex()), count: ids ? ids.length : solo.meta.count || null,
                time, duration
            }, false);
        } else {
            CineHistory.put(`yt:${id}`, { type: "video", id, title, channel, time, duration, live: isLive }, false);
        }
    };

    const showNote = note => {
        if (!streamWait) return;
        streamWait.hidden = !note;
        if (note && streamWaitText.textContent !== note) streamWaitText.textContent = note;
    };

    function tick() {
        if (!solo.active) return;
        // A room took over the player (room.js)
        if (together.stream !== soloControls) return stop(false);
        const s = state();
        const duration = soloControls.duration;
        const time = soloControls.currentTime();
        const isLive = solo.ready && live();
        container.classList.toggle("yt-live", isLive);
        if (isLive) {
            // Live: a full timeline and "LIVE" instead of times
            showProgress(1, 1);
            currentVidTime.innerText = "LIVE";
        } else {
            showProgress(time, duration || Infinity);
            videoDuration.innerText = formatTime(duration);
        }
        const playing = !soloControls.paused;
        if (solo.shownPlaying !== playing) {
            solo.shownPlaying = playing;
            showPlaying(playing);
            if (playing) hideControls();
        }
        const data = solo.ready ? videoData() : {};
        const expected = expectedId();
        // YouTube shows an ad as another video
        const ad = s === S.PLAYING && !!data.video_id && !!expected && data.video_id !== expected;
        const title = !ad && text(data.title);
        if (title && videoTitle.textContent !== title && !videoTitle.querySelector("input")) {
            videoTitle.textContent = audioTitle.textContent = title;
            videoTitle.title = title;
        }
        // A link to one video of a playlist: once YouTube knows the playlist, jump to that video
        if (solo.wantId) {
            const ids = playlist();
            if (ids) {
                const at = ids.indexOf(solo.wantId);
                solo.wantId = null;
                clearTimeout(solo.cueTimer);
                // Not in the playlist (any more): the link's start time isn't for the first video
                if (at < 0) solo.wantStart = 0;
                try {
                    solo.player.playVideoAt(Math.max(0, at));
                } catch (e) {}
            }
        }
        // The previous / next video of a playlist, beside the play button
        const ids = playlist();
        const index = ids ? playlistIndex() : -1;
        prevTrackBtn.hidden = nextTrackBtn.hidden = !ids || ids.length < 2;
        if (ids) {
            prevTrackBtn.disabled = index <= 0;
            nextTrackBtn.disabled = index >= ids.length - 1;
        }
        // Still loading, an error, or a browser that wants a tap on YouTube's player first. On a
        // phone the layer over the player steps aside (as during an ad), so it can be tapped.
        const blocked = solo.ready && solo.intent && !solo.error && (s === S.UNSTARTED || s === S.CUED) && now() - solo.started > 4000;
        container.classList.toggle("yt-ad", ad || blocked);
        showNote(solo.error || (!solo.ready ? "Loading YouTube…" : blocked ? (isTouch ? "Tap the video to start it" : "Click the video to start it") : null));
        if (playing && !ad && now() - solo.savedAt > 5000) save();
    }

    // A playlist's title (for the dashboard), from YouTube's oEmbed
    const fetchListTitle = list => fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/playlist?list=${list}`)}`)
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (!data || !solo.active || !solo.ref || solo.ref.list !== list) return;
            solo.meta.listTitle = solo.meta.listTitle || text(data.title);
            solo.meta.listChannel = solo.meta.listChannel || text(data.author_name, 100);
            save();
        })
        .catch(() => {});

    // Plays `ref` ({ id, list, start }) here. `meta`: what's known about it already, e.g. from the
    // search ({ title, channel, listTitle, count, index }). In a room it goes to the room instead.
    // Returns null, or why it couldn't.
    const play = (ref, meta = {}) => {
        if (!ref || (!ref.id && !ref.list)) return "That isn't a YouTube video or playlist.";
        if (together.active()) {
            if (!together.shareYouTube) return "You're in a room.";
            const refused = together.shareYouTube(ref);
            if (refused) return refused;
            showPlayer();
            return null;
        }
        const wasPlaying = solo.active;
        // Your own video gives way
        if (!wasPlaying) {
            savePosition();
            if (currentFile) releaseMedia();
            cancelConversion();
            [uploadOverlay, errorOverlay, compatBanner].forEach(item => item.classList.add("hidden"));
            container.classList.remove("audio-mode");
            container.classList.add("remote", "youtube", "solo-yt");
            together.stream = soloControls;
        } else save();
        const token = ++solo.token;
        solo.active = true;
        solo.ref = { id: ref.id || null, list: ref.list || null, start: ref.start || 0 };
        solo.meta = { ...meta };
        solo.intent = true;
        solo.error = null;
        solo.captions = false;
        solo.wantId = solo.wantStart = null;
        solo.started = now();
        solo.shownPlaying = null;
        solo.savedAt = now();
        subtitlesBtn.classList.remove("active");
        const title = meta.title || meta.videoTitle || meta.listTitle || "YouTube";
        videoTitle.textContent = audioTitle.textContent = title;
        videoTitle.title = title;
        progressBar.style.width = "0%";
        currentVidTime.innerText = videoDuration.innerText = formatTime(0);
        // Straight away, while the click still counts (fullscreen on phones needs one)
        showPlayer();
        enterMobileImmersive();
        // Remembered at once, with what's known; playing fills in the rest
        if (solo.ref.list) {
            CineHistory.put(`pl:${solo.ref.list}`, {
                type: "playlist", list: solo.ref.list,
                ...(meta.listTitle ? { title: meta.listTitle } : {}),
                ...(meta.channel ? { channel: meta.channel } : {}),
                ...(meta.count ? { count: meta.count } : {}),
                ...(solo.ref.id ? { id: solo.ref.id } : {})
            });
            if (!meta.listTitle) fetchListTitle(solo.ref.list);
        } else {
            CineHistory.put(`yt:${solo.ref.id}`, { type: "video", id: solo.ref.id, ...(meta.title ? { title: meta.title } : {}), ...(meta.channel ? { channel: meta.channel } : {}) });
        }
        clearInterval(solo.timer);
        solo.timer = setInterval(tick, 250);
        tick();
        ensurePlayer().then(player => {
            if (!solo.active || solo.token !== token) return;
            const r = solo.ref;
            syncVolume();
            try {
                if (r.list && Number.isInteger(meta.index) && meta.index >= 0) {
                    // From the dashboard: straight to the video it was on
                    player.loadPlaylist({ list: r.list, listType: "playlist", index: meta.index, startSeconds: r.start });
                } else if (r.list && r.id) {
                    // A link to one video in a playlist: open the playlist, then that video
                    player.cuePlaylist({ list: r.list, listType: "playlist", index: 0 });
                    solo.wantId = r.id;
                    solo.wantStart = r.start;
                    // A playlist YouTube won't open (private): just the video
                    clearTimeout(solo.cueTimer);
                    solo.cueTimer = setTimeout(() => {
                        if (!solo.active || solo.token !== token || !solo.wantId) return;
                        solo.wantId = null;
                        solo.ref = { id: r.id, list: null, start: r.start };
                        player.loadVideoById({ videoId: r.id, startSeconds: r.start });
                    }, 6000);
                } else if (r.list) {
                    player.loadPlaylist({ list: r.list, listType: "playlist", index: 0, startSeconds: r.start });
                } else {
                    player.loadVideoById({ videoId: r.id, startSeconds: r.start });
                }
            } catch (e) {
                solo.error = "YouTube couldn't play this video.";
            }
            tick();
        }, () => {
            if (!solo.active || solo.token !== token) return;
            solo.error = "YouTube can't be reached from this network.";
            tick();
        });
        return null;
    };

    // Back to no YouTube. `reset`: this player was still showing it (not when a room took over)
    function stop(reset = true) {
        if (!solo.active) return;
        save();
        solo.active = false;
        solo.token++;
        solo.intent = false;
        solo.wantId = null;
        clearInterval(solo.timer);
        clearTimeout(solo.cueTimer);
        try {
            if (solo.ready) solo.player.stopVideo();
        } catch (e) {}
        container.classList.remove("solo-yt", "yt-live");
        prevTrackBtn.hidden = nextTrackBtn.hidden = true;
        if (!reset || together.stream !== soloControls) return;
        together.stream = null;
        container.classList.remove("remote", "youtube", "yt-ad");
        showNote(null);
        videoTitle.textContent = audioTitle.textContent = "No Video Loaded";
        videoTitle.title = "No video loaded";
        subtitlesBtn.classList.remove("active");
        progressBar.style.width = "0%";
        currentVidTime.innerText = videoDuration.innerText = formatTime(0);
        showPlaying(false);
        uploadOverlay.classList.remove("hidden");
    }

    // The previous / next video of a playlist (buttons beside play, and Shift + P / N)
    const step = n => {
        const ids = playlist();
        if (!ids) return false;
        const index = playlistIndex() + n;
        if (index < 0 || index >= ids.length) return false;
        save();
        solo.intent = true;
        try {
            if (n > 0) solo.player.nextVideo();
            else solo.player.previousVideo();
        } catch (e) {}
        return true;
    };
    prevTrackBtn.addEventListener("click", () => solo.active && step(-1));
    nextTrackBtn.addEventListener("click", () => solo.active && step(1));

    // What script.js and room.js ask of it (see `together.solo` in script.js)
    together.solo = {
        get active() { return solo.active; },
        stop: () => stop(true),
        pause: () => solo.active && soloControls.request({ paused: true }),
        // Shift + N / P (room.js passes them on outside a room)
        step: n => {
            if (solo.active && step(n)) showFeedback(n > 0 ? "fa-forward-step" : "fa-backward-step", n > 0 ? "Next video" : "Previous video");
        },
        // A room is starting here: it takes over what's playing (from where it is now)
        handOff: () => {
            if (!solo.active || !solo.ref) return null;
            const data = solo.ready ? videoData() : {};
            const id = data.video_id && YT_ID.test(data.video_id) && data.video_id === expectedId() ? data.video_id : solo.ref.id;
            const ref = { id: id || null, list: solo.ref.list, start: Math.floor(soloControls.currentTime()) };
            stop(true);
            return ref.id || ref.list ? ref : null;
        }
    };
    together.step = n => together.solo.step(n);
    window.addEventListener("pagehide", () => solo.active && save());

    window.CineYouTube = { parse, search, api, play, createResults, thumbOf };
})();
