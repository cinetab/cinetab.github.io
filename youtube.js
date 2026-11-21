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
        "https://pipedapi.r4fo.com",
        "https://api.piped.projectsegfau.lt",
        "https://pipedapi.drgns.space"
    ];
    const INVIDIOUS_APIS = [
        "https://inv.nadeko.net",
        "https://invidious.nerdvpn.de",
        "https://vid.priv.au",
        "https://invidious.drgns.space"
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

    // A heart for Saved (history.js): filled when it's saved. Every heart on the page follows
    // when something is saved or taken out (here, or in another tab)
    const paintHeart = heart => {
        const on = !!window.CineSaved && CineSaved.has(heart.dataset.saveKey);
        heart.classList.toggle("on", on);
        heart.firstChild.className = `${on ? "fa-solid" : "fa-regular"} fa-heart`;
        heart.title = on
            ? "Remove from your library"
            : heart.dataset.saveKey.startsWith("pl:") ? "Save this playlist to your library" : "Save this video to your library";
        heart.setAttribute("aria-label", heart.title);
        heart.setAttribute("aria-pressed", String(on));
    };
    if (window.CineSaved) CineSaved.onChange(() => document.querySelectorAll("[data-save-key]").forEach(paintHeart));
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
                    views: item.views > 0 ? item.views : null, ago: text(item.uploadedDate, 40), short: !!item.isShort,
                    uploaded: item.uploaded > 0 ? item.uploaded : null, verified: item.uploaderVerified === true,
                    description: text(item.shortDescription, 300)
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

    // Piped servers, the one that answered last time first
    const pipedBases = () => {
        const remembered = storage.get(PIPED_KEY);
        return remembered && PIPED_APIS.includes(remembered) ? [remembered, ...PIPED_APIS.filter(base => base !== remembered)] : PIPED_APIS;
    };

    // { items, next } for `query`; `kind`: "video" or "playlist"; `page`: the `next` of the last answer
    const search = async (query, kind = "video", page = null) => {
        if (page) {
            return page.provider === "youtube" ? searchYouTube(query, kind, page.token) : searchPiped(page.provider, query, kind, page.token);
        }
        const providers = [...(YOUTUBE_API_KEY ? ["youtube"] : []), ...pipedBases()];
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

    const cleanChannelName = name => String(name || "")
        .toLowerCase()
        .replace(/\s*-\s*topic$/i, "")
        .replace(/\s*(vevo|official|music|channel)$/i, "")
        .replace(/[^a-z0-9]/g, "");

    const cleanTitleText = raw => String(raw || "")
        .replace(/\s*[\(\[](official\s*(music\s*)?video|official\s*audio|official|audio|lyrics?(\s*video)?|visualizer|hd|4k|mv|remastered)[\)\]]/gi, "")
        .trim();

    // A video to play after `id` that isn't in `skip` ({ id, title, channel }, or null).
    // Autoplay suggests videos like YouTube recommend or design mix, strictly avoiding
    // videos from the same channel/artist so recommendations are fresh and diverse.
    // Tries in order:
    // 1. YouTube Related Streams (Up Next / Recommendations) via Piped & Invidious instances
    // 2. YouTube Mix Playlist (RD<id>) via Piped
    // 3. Smart "Design Mix" search (e.g. "<title> <artist> mix", "<title> mix", "<artist> radio")
    const suggestedAfter = async (id, skip = [], about = {}) => {
        let artist = String(about.channel || "").replace(/\s*-\s*Topic$/i, "").trim();
        let rawTitle = String(about.title || "").trim();
        const cleanT = cleanTitleText(rawTitle);

        // If title is in "Artist - Track" format, parse both
        const dashMatch = cleanT.match(/^([^-–—]+)\s*[-–—]\s*(.+)$/);
        let trackName = cleanT;
        if (dashMatch) {
            if (!artist || artist === "YouTube" || /topic$/i.test(about.channel || "")) {
                artist = dashMatch[1].trim();
            }
            trackName = dashMatch[2].trim();
        }

        const curCh = cleanChannelName(about.channel);
        const curArt = cleanChannelName(artist);

        const isSameChannelOrArtist = (candCh, candTitle) => {
            const cand = cleanChannelName(candCh);
            if (cand) {
                if (curCh && (cand === curCh || cand.includes(curCh) || curCh.includes(cand))) return true;
                if (curArt && (cand === curArt || cand.includes(curArt) || curArt.includes(cand))) return true;
            }
            if (curArt && curArt.length >= 3 && candTitle) {
                const candTitleClean = cleanChannelName(candTitle);
                if (candTitleClean.startsWith(curArt)) return true;
            }
            return false;
        };

        const isUsable = (nextId, item, allowSame = false) => {
            if (!nextId || !YT_ID.test(nextId) || nextId === id) return false;
            if (skip && skip.includes(nextId)) return false;
            if (item && (item.live || item.short)) return false;
            const candChannel = (item && (item.channel || item.uploaderName || item.author)) || "";
            const candTitle = (item && (item.title || item.name)) || "";
            if (!allowSame && isSameChannelOrArtist(candChannel, candTitle)) return false;
            return true;
        };

        // 1. YouTube Related Streams (Up Next / Recommended) via Piped APIs
        for (const base of pipedBases()) {
            try {
                const data = await getJSON(`${base}/streams/${id}`, 3500);
                const related = (data && data.relatedStreams) || [];
                for (const item of related) {
                    let next = null;
                    try {
                        next = new URL(item.url, "https://www.youtube.com").searchParams.get("v");
                    } catch (e) {}
                    if (item.type === "stream" && item.duration > 0 && isUsable(next, { ...item, channel: item.uploaderName }, false)) {
                        storage.set(PIPED_KEY, base);
                        return { id: next, title: text(item.title), channel: text(item.uploaderName, 100) };
                    }
                }
            } catch (e) {}
        }

        // 2. YouTube Mix Playlist (RD<id>) via Piped APIs
        for (const base of pipedBases().slice(0, 3)) {
            try {
                const data = await getJSON(`${base}/playlists/RD${id}`, 3500);
                const items = (data && (data.relatedStreams || data.items)) || [];
                for (const item of items) {
                    let next = item.id;
                    if (!next && item.url) {
                        try { next = new URL(item.url, "https://www.youtube.com").searchParams.get("v"); } catch (e) {}
                    }
                    const candChannel = item.uploaderName || item.channel;
                    if (isUsable(next, { ...item, channel: candChannel }, false)) {
                        return { id: next, title: text(item.title || item.name), channel: text(candChannel, 100) };
                    }
                }
            } catch (e) {}
        }

        // 3. Invidious Recommended Videos
        for (const base of INVIDIOUS_APIS) {
            try {
                const data = await getJSON(`${base}/api/v1/videos/${id}`, 3500);
                const recs = (data && data.recommendedVideos) || [];
                for (const item of recs) {
                    if (isUsable(item.videoId, { ...item, channel: item.author }, false)) {
                        return { id: item.videoId, title: text(item.title), channel: text(item.author, 100) };
                    }
                }
            } catch (e) {}
        }

        // 4. Smart "Design Mix" searches (simulates YouTube Mix / radio, different channel)
        const queries = [];
        if (trackName && artist && artist !== "YouTube") {
            queries.push(`${trackName} ${artist} mix`);
            queries.push(`${trackName} mix`);
            queries.push(`${artist} mix`);
            queries.push(`${artist} radio`);
        } else if (trackName) {
            queries.push(`${trackName} mix`);
            queries.push(`${trackName} song`);
        } else if (artist) {
            queries.push(`${artist} mix`);
            queries.push(`${artist} radio`);
        }

        for (const query of queries) {
            try {
                const { items } = await search(query, "video");
                const found = items.find(item => isUsable(item.id, item, false));
                if (found) return { id: found.id, title: found.title, channel: found.channel };
            } catch (e) {}
        }

        // 5. Fallback only if no video from a different channel was found anywhere
        for (const query of queries) {
            try {
                const { items } = await search(query, "video");
                const found = items.find(item => isUsable(item.id, item, true));
                if (found) return { id: found.id, title: found.title, channel: found.channel };
            } catch (e) {}
        }

        return null;
    };

    // A video's details for the space below the player on phones (script.js): { title, channel,
    // verified, views, ago, uploaded, description }, or null. YouTube's own player only says the
    // title and channel, so the rest comes from a search for the video itself; kept per video.
    const detailsCache = new Map();
    const details = id => {
        if (!YT_ID.test(id || "")) return Promise.resolve(null);
        if (!detailsCache.has(id)) {
            detailsCache.set(id, search(id, "video")
                .then(result => result.items.find(item => item.id === id) || null)
                .catch(() => {
                    detailsCache.delete(id);
                    return null;
                }));
        }
        return detailsCache.get(id);
    };

    // A video's whole description, as plain text with its line breaks ("" when it has none, null
    // when no server answered). A search only gives its first line or two. Piped sends it as HTML
    // (<br>, links), read here as text without running or loading anything; Invidious as text.
    const descriptionCache = new Map();
    const fullDescription = id => {
        if (!YT_ID.test(id || "")) return Promise.resolve(null);
        if (!descriptionCache.has(id)) {
            descriptionCache.set(id, (async () => {
                for (const base of pipedBases()) {
                    try {
                        const data = await getJSON(`${base}/streams/${id}`, 6000);
                        if (!data || typeof data.description !== "string") continue;
                        const html = data.description.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
                        const doc = new DOMParser().parseFromString(html, "text/html");
                        // Its links' text is cut short ("https://example.com/pa..."): the whole address
                        doc.querySelectorAll("a[href]").forEach(link => {
                            if (!/(\.\.\.|…)$/.test(link.textContent.trim())) return;
                            try {
                                link.textContent = new URL(link.getAttribute("href"), "https://www.youtube.com").href;
                            } catch (e) {}
                        });
                        storage.set(PIPED_KEY, base);
                        return doc.documentElement.textContent.trim().slice(0, 10000);
                    } catch (e) {}
                }
                for (const base of INVIDIOUS_APIS) {
                    try {
                        const data = await getJSON(`${base}/api/v1/videos/${id}?fields=description`, 6000);
                        if (data && typeof data.description === "string") return data.description.trim().slice(0, 10000);
                    } catch (e) {}
                }
                descriptionCache.delete(id);
                return null;
            })());
        }
        return descriptionCache.get(id);
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

    let relativeFormat = null;
    try {
        relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    } catch (e) {}
    const watchedAgo = at => {
        const seconds = (Date.now() - at) / 1000;
        if (!relativeFormat || seconds < 60) return "Watched just now";
        const [value, unit] = seconds < 3600 ? [seconds / 60, "minute"] : seconds < 86400 ? [seconds / 3600, "hour"]
            : seconds < 86400 * 30 ? [seconds / 86400, "day"] : [seconds / (86400 * 30), "month"];
        return `Watched ${relativeFormat.format(-Math.round(value), unit)}`;
    };

    // YouTube videos and playlists watched before in this browser (history.js) whose title or
    // channel has every word of `filter`, most recent first, as search results
    const watchedBefore = (filter = "", max = 8) => {
        const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
        return CineHistory.list()
            .filter(entry => (entry.type === "video" && entry.id) || (entry.type === "playlist" && entry.list))
            .filter(entry => {
                const haystack = `${entry.title || ""} ${entry.videoTitle || ""} ${entry.channel || ""}`.toLowerCase();
                return words.every(word => haystack.includes(word));
            })
            .slice(0, max)
            .map(entry => entry.type === "playlist" ? {
                kind: "playlist", id: entry.id || null, list: entry.list,
                title: entry.title || entry.videoTitle || "YouTube playlist", channel: entry.channel || "",
                thumb: entry.id ? thumbOf(entry.id) : "", count: entry.count || null, ago: watchedAgo(entry.at),
                // The playlist from the video it was on (in a room, the rest of it goes around that one)
                ref: { id: entry.id || null, list: entry.list, start: 0 }
            } : {
                kind: "video", id: entry.id, list: null,
                title: entry.title || "YouTube video", channel: entry.channel || "", thumb: thumbOf(entry.id),
                duration: entry.duration || null, live: !!entry.live, ago: watchedAgo(entry.at),
                ref: { id: entry.id, list: null, start: 0 }
            });
    };

    // A search box's results: a Videos / Playlists switch, the results and "More results".
    // `actions`: [{ key, label, icon }], the first one is what a click on a result does;
    // `onPick(ref, key, item)` gets the chosen one. `input`: the search box; Clear empties it,
    // and emptying it (or Esc in it) clears the results. `suggest`: while the box is empty or
    // being typed in, it suggests what was watched before (matching what's typed); Enter searches.
    // `save`: a heart on each result, to keep it in Saved (history.js) - a video, or a whole playlist
    const createResults = ({ host, actions, onPick, input = null, compact = false, suggest = false, save = !!window.CineSaved }) => {
        const head = el("div", "yt-results-head");
        const label = el("span", "yt-results-label");
        label.append(el("i", "fa-solid fa-clock-rotate-left"), el("span", null, "Watched before"));
        label.hidden = true;
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
        close.title = input ? "Clear the search and its results (Esc)" : "Clear the results";
        close.append(el("i", "fa-solid fa-xmark"), el("span", null, "Clear"));
        head.append(label, kinds, onYouTube, close);
        const status = el("p", "yt-status");
        status.setAttribute("aria-live", "polite");
        const list = el("ul", `yt-result-list${compact ? " compact" : ""}`);
        const more = el("button", "yt-more", "More results");
        more.type = "button";
        host.replaceChildren(head, status, list, more);
        host.hidden = true;

        // `mode`: "search" (YouTube's results) or "history" (watched before)
        const state = { query: "", kind: "video", next: null, items: [], token: 0, busy: false, mode: "search" };

        const setMode = mode => {
            state.mode = mode;
            const history = mode === "history";
            label.hidden = !history;
            kinds.hidden = onYouTube.hidden = history;
            close.lastChild.textContent = history ? "Hide" : "Clear";
            close.title = history ? "Hide what you watched before (Esc)" : input ? "Clear the search and its results (Esc)" : "Clear the results";
        };

        const showStatus = (message, kind = "") => {
            status.replaceChildren();
            status.className = `yt-status ${kind}`.trim();
            if (kind === "error" && window.CineToast) {
                status.hidden = true;
                window.CineToast(message, { key: "youtube-search-error", tone: "error", duration: 5000 });
                return;
            }
            if (window.CineToast) window.CineToast.dismiss("youtube-search-error");
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
            const meta = state.mode === "history" && item.kind === "video" ? ""
                : [item.channel, views(item.views), item.ago].filter(Boolean).join(" · ");
            if (meta) info.append(el("small", null, meta));
            main.append(thumb, info);
            li.append(main);
            const savedKey = save && window.CineSaved ? CineSaved.keyOf(item) : null;
            if (savedKey) {
                const heart = el("button", "yt-save");
                heart.type = "button";
                heart.dataset.saveKey = savedKey;
                heart.append(el("i"));
                paintHeart(heart);
                li.append(heart);
            }
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
            setMode("search");
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
            const heart = e.target.closest(".yt-save");
            if (heart) {
                const row = heart.closest(".yt-result");
                const item = row && state.items[+row.dataset.i];
                if (item) CineSaved.toggle(item);
                return;
            }
            const button = e.target.closest("[data-act]");
            const row = button && button.closest(".yt-result");
            const item = row && state.items[+row.dataset.i];
            if (item) onPick(item.ref || refOf(item), button.dataset.act, item);
        });
        // `empty`: the search box too (the Clear button, Esc)
        const clear = (empty = false) => {
            state.token++;
            state.query = "";
            state.items = [];
            state.next = null;
            list.replaceChildren();
            host.hidden = true;
            if (empty && input) input.value = "";
        };

        // What was watched before, matching `filter` (nothing to show: no list)
        const showWatched = (filter = "") => {
            const items = watchedBefore(filter);
            state.token++;
            state.query = "";
            state.next = null;
            state.items = items;
            setMode("history");
            list.replaceChildren(...items.map(itemRow));
            more.hidden = true;
            showStatus("");
            host.hidden = !items.length;
        };

        // The button hides suggestions, and clears a search; focusing the box afterwards doesn't
        // bring the suggestions straight back
        let quietFocus = false;
        close.addEventListener("click", () => {
            const history = state.mode === "history";
            clear(!history);
            if (!input) return;
            quietFocus = true;
            input.focus();
            quietFocus = false;
        });
        if (input && suggest) {
            input.addEventListener("focus", () => {
                if (!quietFocus && host.hidden && !input.value.trim()) showWatched();
            });
        }
        if (input) {
            // Typing: what was watched before that matches (Enter searches YouTube). The box
            // emptied (by hand, or its own ×): everything watched before, or nothing.
            input.addEventListener("input", () => {
                const value = input.value.trim();
                if (!value) return suggest ? showWatched() : !host.hidden && clear();
                if (!suggest) return;
                if (parse(value)) return state.mode === "history" && clear();
                showWatched(value);
            });
            // Esc clears the results first (and only then does what the box does with Esc, like
            // closing the room's YouTube box)
            input.addEventListener("keydown", e => {
                if (e.key !== "Escape" || host.hidden) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                clear(true);
            }, true);
        }
        renderKinds();
        return { run, clear, showWatched, get open() { return !host.hidden; } };
    };

    // ---------- Playing on your own

    const streamWait = document.querySelector(".room-stream-wait");
    const streamWaitText = streamWait && streamWait.querySelector("span");
    const prevTrackBtn = container.querySelector(".prev-track");
    const nextTrackBtn = container.querySelector(".next-track");
    // YouTube's player for watching alone, beside the one a room uses (room.js)
    const mount = el("div", "yt-mount yt-solo");
    frame.append(mount);

    // `mix`: the video a YouTube Mix playing now was made from (Autoplay), `wantAfter`: a Mix being
    // opened, to play on after that video; `played`: videos played lately (newest first), which
    // Autoplay doesn't pick again; `captionsFor`: the video captions were last set for
    const solo = {
        player: null, ready: false, creating: null,
        active: false, ref: null, meta: {}, intent: false, started: 0, error: null,
        wantId: null, wantStart: 0, cueTimer: null, timer: null,
        shownPlaying: null, savedAt: 0, captions: false, captionsFor: null, token: 0,
        mix: null, wantAfter: null, cuedAt: 0, mixBroken: false, finding: false, about: null, played: []
    };

    // Autoplay: when a video ends (or the last of a playlist or Mix), the YouTube Mix made from it
    // plays next, as on YouTube. On unless turned off; remembered.
    const AUTOPLAY_KEY = "cinetab:yt-autoplay";
    let autoplay = storage.get(AUTOPLAY_KEY) !== "off";
    const autoplayBtn = container.querySelector(".yt-autoplay");

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
                if (jump) {
                    cropYouTube(false);
                    player.seekTo(Math.max(0, change.time), true);
                }
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
        // On or off is remembered, for the next videos too (see subtitlePref in script.js)
        toggleSubtitles: () => {
            if (!solo.ready) return;
            solo.captions = !solo.captions;
            subtitlePref.set(solo.captions);
            youTubeCaptions(solo.player, solo.captions);
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
        // YouTube's own bars, while it catches up and a moment after (script.js)
        if (e.data === S.BUFFERING) cropYouTube(false);
        else if (e.data === S.PLAYING) cropYouTube(true);
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
            const id = data.video_id;
            if (id && YT_ID.test(id) && id === expectedId()) {
                if (together.onSoloVideoChange) together.onSoloVideoChange(id, text(data.title));
                if (solo.played[0] !== id) solo.played = [id, ...solo.played.filter(other => other !== id)].slice(0, 200);
                // Each new video: captions as the remembered setting says
                if (solo.captionsFor !== id) {
                    solo.captionsFor = id;
                    youTubeCaptions(solo.player, solo.captions);
                }
            }
        }
        if (e.data === S.ENDED) {
            save(true);
            if (together.playNextSoloQueue && together.playNextSoloQueue()) return;
            const ids = playlist();
            if (!ids || playlistIndex() >= ids.length - 1) {
                // Autoplay: on with the YouTube Mix of the video that ended
                if (!(autoplay && !solo.wantAfter && autoplayAfter(currentId()))) solo.intent = false;
            }
        }
        // Paused by the phone (or by YouTube) as the page left the screen: Background play
        // carries on (script.js decides; never a pause of the person's own)
        if (e.data === S.PAUSED && solo.intent && together.keepPlaying("youtube")) {
            try {
                solo.player.playVideo();
            } catch (err) {}
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
            playerVars: {
                controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, autoplay: 1, origin: location.origin,
                ...(subtitlePref.wants(true) ? { cc_load_policy: 1 } : {})
            },
            events: {
                onReady: () => {
                    solo.ready = true;
                    resolve(solo.player);
                },
                onStateChange: onState,
                onError,
                // YouTube loaded (or dropped) its captions by itself: as the setting says instead
                onApiChange: () => solo.active && youTubeCaptions(solo.player, solo.captions)
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
        // A Mix that Autoplay is playing is remembered video by video
        if (solo.ref.list && !solo.mix) {
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
            // The lock screen and notification show the new video (and its picture) at once
            updateMediaSession();
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
        // Autoplay opened a Mix: once it's ready, on with the first video after the one that
        // ended (one not played lately). An empty list: YouTube didn't open it here (it may
        // not, in an embedded player), so another video like it, and no more Mixes this time.
        if (solo.wantAfter) {
            let raw = null;
            try {
                raw = solo.player.getPlaylist();
            } catch (e) {}
            const ids = s === S.CUED ? playlist() : null;
            const empty = Array.isArray(raw) && !raw.length && now() - solo.cuedAt > 1500;
            if (ids || empty) {
                const after = solo.wantAfter;
                solo.wantAfter = null;
                clearTimeout(solo.cueTimer);
                let at = ids ? ids.findIndex(other => other !== after && !solo.played.includes(other)) : -1;
                if (ids && at < 0) at = ids.findIndex(other => other !== after);
                if (at >= 0) {
                    try {
                        solo.player.playVideoAt(at);
                    } catch (e) {}
                } else {
                    if (empty) solo.mixBroken = true;
                    solo.mix = null;
                    solo.ref = { id: after, list: null, start: 0 };
                    suggest(after, solo.token);
                }
            }
        }
        // The previous / next video of a playlist, beside the play button (with Autoplay, Next
        // also goes past the end, to the Mix)
        const queueHasTracks = together.hasSoloQueue && together.hasSoloQueue();
        const ids = playlist();
        prevTrackBtn.hidden = (!queueHasTracks && (!ids || ids.length < 2));
        nextTrackBtn.hidden = (!queueHasTracks && !autoplay && (!ids || ids.length < 2));
        prevTrackBtn.disabled = !canStep(-1);
        nextTrackBtn.disabled = !canStep(1);
        if (together.renderShuffle) together.renderShuffle();
        // Still loading, an error, or a browser that wants a tap on YouTube's player first. The
        // layer over the player steps aside so YouTube's player can be clicked: on a computer for an
        // ad (its Skip) or to start; on a touch screen never for an ad (only CineTab's controls show
        // there), and to start only on an iPhone or iPad, which need it (elsewhere ▶ starts it).
        const blocked = solo.ready && solo.intent && !solo.error && (s === S.UNSTARTED || s === S.CUED) && now() - solo.started > 4000;
        container.classList.toggle("yt-ad", ad || (blocked && !isTouch));
        container.classList.toggle("yt-tap", blocked && isTouch && mustTapYouTube);
        showNote(solo.error || (!solo.ready ? "Loading YouTube…" : solo.finding ? "Autoplay: finding what's next…"
            : blocked ? (!isTouch ? "Click the video to start it" : mustTapYouTube ? "Tap the video to start it" : "Tap ▶ to start it") : null));
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
    const play = (ref, meta = {}, opts = {}) => {
        if (!ref || (!ref.id && !ref.list)) return "That isn't a YouTube video or playlist.";
        if (together.active()) {
            if (!together.shareYouTube) return "You're in a room.";
            const refused = together.shareYouTube(ref);
            if (refused) return refused;
            showPlayer();
            return null;
        }
        if (together.onSoloPlay && !opts.fromQueue) {
            together.onSoloPlay(ref, meta, opts);
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
        if (window.updatePlayerStop) window.updatePlayerStop();
        solo.ref = { id: ref.id || null, list: ref.list || null, start: ref.start || 0 };
        // (a new playlist starts in its own order)
        solo.shuffle = false;
        solo.meta = { ...meta };
        solo.intent = true;
        solo.error = null;
        // YouTube's captions as the remembered setting says (off until turned on)
        solo.captions = subtitlePref.wants(true);
        solo.captionsFor = null;
        solo.wantId = solo.wantStart = null;
        solo.mix = solo.wantAfter = null;
        solo.finding = false;
        solo.started = now();
        solo.shownPlaying = null;
        solo.savedAt = now();
        subtitlesBtn.classList.toggle("active", solo.captions);
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
                if (opts.fromQueue && r.id) {
                    player.loadVideoById({ videoId: r.id, startSeconds: r.start || 0 });
                } else if (r.list && Number.isInteger(meta.index) && meta.index >= 0) {
                    // From the dashboard: straight to the video it was on
                    player.loadPlaylist({ list: r.list, listType: "playlist", index: meta.index, startSeconds: r.start });
                } else if (r.list && r.id) {
                    player.loadVideoById({ videoId: r.id, startSeconds: r.start || 0 });
                } else if (r.list) {
                    player.loadPlaylist({ list: r.list, listType: "playlist", index: 0, startSeconds: r.start });
                } else {
                    player.loadVideoById({ videoId: r.id, startSeconds: r.start || 0 });
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
        solo.wantId = solo.mix = solo.wantAfter = null;
        solo.finding = false;
        clearInterval(solo.timer);
        clearTimeout(solo.cueTimer);
        try {
            if (solo.ready) solo.player.stopVideo();
        } catch (e) {}
        container.classList.remove("solo-yt", "yt-live");
        prevTrackBtn.hidden = nextTrackBtn.hidden = true;
        if (!reset || together.stream !== soloControls) return;
        together.stream = null;
        container.classList.remove("remote", "youtube", "yt-ad", "yt-tap", "yt-crop");
        showNote(null);
        videoTitle.textContent = audioTitle.textContent = "No Video Loaded";
        videoTitle.title = "No video loaded";
        subtitlesBtn.classList.remove("active");
        progressBar.style.width = "0%";
        currentVidTime.innerText = videoDuration.innerText = formatTime(0);
        showPlaying(false);
        uploadOverlay.classList.remove("hidden");
        if (window.updatePlayerStop) window.updatePlayerStop();
    }

    // ---------- Autoplay

    // The video on now (not an ad), or the one being opened
    const currentId = () => {
        const data = solo.ready ? videoData() : {};
        const id = data.video_id && YT_ID.test(data.video_id) && data.video_id === expectedId() ? data.video_id : expectedId();
        return id || (solo.ref && solo.ref.id) || null;
    };

    // Plays a video like `after` (a Mix that couldn't be opened, or ran out). `about`: its
    // { title, channel }, for finding one.
    const suggest = async (after, token, about = solo.about) => {
        solo.finding = true;
        tick();
        const next = await suggestedAfter(after, solo.played, about || {});
        if (!solo.active || solo.token !== token) return;
        solo.finding = false;
        // Autoplay was turned off meanwhile
        if (!autoplay) {
            solo.intent = false;
            return tick();
        }
        if (!next) {
            solo.intent = false;
            showFeedback("fa-circle-info", "Autoplay found nothing to play next");
            return tick();
        }
        solo.mix = null;
        solo.ref = { id: next.id, list: null, start: 0 };
        solo.meta = { title: next.title, channel: next.channel };
        solo.intent = true;
        solo.started = now();
        if (together.onSoloAutoplay) together.onSoloAutoplay(next);
        try {
            solo.player.loadVideoById({ videoId: next.id, startSeconds: 0 });
        } catch (e) {}
        tick();
    };

    // On after `after` with Autoplay: a recommended video or design mix (as on YouTube),
    // strictly avoiding videos from the same channel. True if something's on its way.
    const autoplayAfter = after => {
        if (!solo.active || !solo.ready || !after || together.active()) return false;
        const token = solo.token;
        // What it was, while YouTube still says (for finding another like it)
        const data = videoData();
        solo.about = data.video_id === after ? { title: text(data.title), channel: text(data.author, 100) } : { title: solo.meta.title || "", channel: solo.meta.channel || "" };
        solo.intent = true;
        solo.error = null;
        solo.wantId = null;
        solo.wantStart = 0;
        solo.started = now();
        clearTimeout(solo.cueTimer);
        showFeedback("fa-forward-step", "Autoplay: up next");
        solo.mix = solo.wantAfter = null;
        suggest(after, token);
        return true;
    };

    const renderAutoplay = () => {
        if (!autoplayBtn) return;
        autoplayBtn.setAttribute("aria-checked", String(autoplay));
        const room = together.active();
        autoplayBtn.title = autoplay ? (room ? "Autoplay is on: when the queue ends, a video like the last one plays next, for everyone" : "Autoplay is on: when this ends, its YouTube Mix plays next")
            : room ? "Autoplay is off: the room stops at the end of the queue" : "Autoplay is off: playback stops at the end";
        autoplayBtn.querySelector(".yt-autoplay-track i").className = `fa-solid ${autoplay ? "fa-play" : "fa-pause"}`;
    };

    const setAutoplay = on => {
        autoplay = on;
        storage.set(AUTOPLAY_KEY, on ? "on" : "off");
        renderAutoplay();
        showFeedback(on ? "fa-toggle-on" : "fa-toggle-off", on ? "Autoplay on" : "Autoplay off");
        // A room's host: the room's queue goes on (or not) the same way (room.js)
        if (together.onAutoplay) together.onAutoplay(on);
        if (on || !solo.active || !solo.ready) return tick();
        // Off: the Mix that Autoplay is playing stops with the video on now. It goes on as that
        // one video, from where it is (a playlist of your own still plays to its end).
        const waiting = solo.wantAfter;
        if (solo.mix || waiting) {
            const id = waiting || currentId();
            const time = waiting ? 0 : soloControls.currentTime();
            const paused = waiting || soloControls.paused;
            clearTimeout(solo.cueTimer);
            solo.mix = solo.wantAfter = null;
            solo.ref = { id, list: null, start: 0 };
            if (paused) solo.intent = false;
            try {
                if (paused) solo.player.cueVideoById({ videoId: id, startSeconds: time });
                else solo.player.loadVideoById({ videoId: id, startSeconds: time });
            } catch (e) {}
        }
        tick();
    };
    autoplayBtn.addEventListener("click", () => setAutoplay(!autoplay));
    renderAutoplay();

    // Whether there's a previous (-1) / next (1) video: in a playlist or Mix, and with Autoplay,
    // next after the end too
    const canStep = n => {
        if (!solo.active) return false;
        if (together.canStepSoloQueue && together.canStepSoloQueue(n)) return true;
        const ids = playlist();
        const index = ids ? playlistIndex() : -1;
        if (n < 0) return !!ids && index > 0;
        return (!!ids && index < ids.length - 1) || (autoplay && !together.active());
    };

    // The previous / next video of a playlist (buttons beside play, Shift + P / N, the lock screen)
    const step = n => {
        if (!canStep(n)) return false;
        if (!together.active()) {
            if (n > 0 && together.playNextSoloQueue && together.playNextSoloQueue()) return true;
            if (n < 0 && together.playPrevSoloQueue && together.playPrevSoloQueue()) return true;
        }
        const ids = playlist();
        const index = ids ? playlistIndex() + n : -1;
        save();
        solo.intent = true;
        if (!ids || index >= ids.length) return autoplayAfter(currentId());
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
        get paused() { return soloControls.paused; },
        get duration() { return soloControls.duration; },
        get currentTime() { return soloControls.currentTime(); },
        // The video that should be on (its picture: ambient mode, the lock screen)
        get videoId() { return solo.active ? expectedId() : null; },
        // What's on, to save it (the player's heart): the video, and its playlist if it's in one
        // (not a Mix Autoplay made)
        get current() {
            if (!solo.active || !solo.ref) return null;
            const id = expectedId();
            const data = solo.ready ? videoData() : {};
            const same = data.video_id && data.video_id === id;
            const video = id ? { kind: "video", id, title: (same && text(data.title)) || solo.meta.title || "", channel: (same && text(data.author, 100)) || solo.meta.channel || "", live: live() } : null;
            const ids = playlist();
            const list = solo.ref.list && !solo.mix ? { kind: "playlist", list: solo.ref.list, id: (ids && ids[0]) || id, title: solo.meta.listTitle || "", channel: solo.meta.listChannel || "", count: ids ? ids.length : solo.meta.count || null } : null;
            return video || list ? { video, list } : null;
        },
        get autoplay() { return autoplay; },
        toggleAutoplay: () => setAutoplay(!autoplay),
        // A YouTube playlist on: YouTube's player shuffles what's left of it (or stops shuffling)
        get isList() {
            const ids = solo.active && solo.ref && solo.ref.list ? playlist() : null;
            return !!ids && ids.length > 2;
        },
        get shuffled() { return together.isSoloShuffled ? together.isSoloShuffled() : !!solo.shuffle; },
        setShuffle: on => {
            solo.shuffle = !!on;
            try {
                solo.player.setShuffle(!!on);
            } catch (e) {}
        },
        renderAutoplay,
        canStep,
        stop: () => stop(true),
        pause: () => solo.active && soloControls.request({ paused: true }),
        seek: time => solo.active && Number.isFinite(time) && soloControls.request({ time }),
        // Shift + N / P (room.js passes them on outside a room)
        step: n => {
            if (solo.active && step(n)) showFeedback(n > 0 ? "fa-forward-step" : "fa-backward-step", n > 0 ? "Next video" : "Previous video");
        },
        // A room is starting here: it takes over what's playing (from where it is now)
        handOff: () => {
            if (!solo.active || !solo.ref) return null;
            const data = solo.ready ? videoData() : {};
            const id = data.video_id && YT_ID.test(data.video_id) && data.video_id === expectedId() ? data.video_id : solo.ref.id;
            // A Mix from Autoplay is this browser's own: the room gets the video
            const ref = { id: id || null, list: solo.mix ? null : solo.ref.list, start: Math.floor(soloControls.currentTime()) };
            stop(true);
            return ref.id || ref.list ? ref : null;
        }
    };
    together.step = n => together.solo.step(n);
    window.addEventListener("pagehide", () => solo.active && save());

    window.CineYouTube = { parse, search, api, play, stop: () => stop(true), createResults, thumbOf, suggestedAfter, details, fullDescription, views, paintHeart };
})();
