// CineTab rooms: watch together without a video call
// The host's browser is the hub. Each guest connects straight to the host over WebRTC (guests
// never connect to each other, so they don't see each other's IP addresses). The host lets people
// in, relays chat, keeps everyone's playback in step and, unless it's switched off, streams the
// video it's playing to guests who don't have their own copy. WebRTC encrypts everything between
// browsers and nothing is stored anywhere. signaling.js covers how the browsers find each other.

(() => {
    const panel = document.querySelector(".room-panel");
    if (!panel) return; // The offline player has no rooms

    // STUN servers tell each browser its public address. Some networks (certain mobile carriers,
    // strict office or school Wi-Fi) also need a TURN server, which relays the still-encrypted
    // traffic. To add one, put it here with its credentials, for example from Metered's or
    // Cloudflare's free tier: { urls: "turns:turn.example.com:443?transport=tcp", username: "…", credential: "…" }
    const ICE_SERVERS = [
        { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
    ];
    // Or an address that hands out short-lived TURN credentials as a list of ICE servers, so no
    // password sits in this file. Metered's free tier gives one:
    // "https://<your-app>.metered.live/api/v1/turn/credentials?apiKey=<your key>"
    const TURN_CREDENTIALS_URL = "";
    const hasTurn = servers => servers.some(server => [].concat(server.urls).some(url => /^turns?:/.test(url)));
    let iceServers = ICE_SERVERS;
    let relayAvailable = hasTurn(ICE_SERVERS);
    // Without TURN, two networks that both block direct connections can't connect over WebRTC at
    // all. The room's messages then go through the relays that found the room (see newTunnel).
    // Messages are cut into smaller parts there, so each fits in one relay message.
    const TUNNEL_CHUNK = 5000;
    // How long a direct connection gets to open before the room goes through the relays instead
    const DIRECT_WAIT = 10000;
    const MAX_GUESTS = 12;
    const QUALITY = {
        saver: { height: 480, bitrate: 1200000 },
        standard: { height: 720, bitrate: 2500000 },
        high: { height: 1080, bitrate: 5000000 },
        // Guests on the same network as the host get full quality (unless Data saver is chosen)
        lan: { height: 1080, bitrate: 8000000 }
    };
    // Reactions offered on every chat message
    const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🍿"];
    const ROUTE_LABEL = { lan: "same network", direct: "direct connection", relay: "through a relay", tunnel: "through the room's relay" };
    // Data channel messages above this size are sent in parts
    const CHUNK = 16000;
    const NAME_KEY = "cinetab:room-name";
    const AVATAR_KEY = "cinetab:room-avatar";
    const ROOMS_KEY = "cinetab:rooms";
    const APPROVED_KEY = "cinetab:room-approved";
    const HOST_SUBTITLES = "Host's subtitles";
    // YouTube video and playlist ids; the privacy-enhanced player (no cookies until a video plays)
    const YT_ID = /^[A-Za-z0-9_-]{11}$/;
    const YT_LIST = /^[A-Za-z0-9_-]{2,64}$/;
    const YT_HOST = "https://www.youtube-nocookie.com";
    const YT = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

    // Avatars: your initial on one of these colours ("c0"…"c7"), or one of these emoji.
    // Only these values are accepted from other browsers.
    const AVATAR_COLORS = [["blue", 212], ["purple", 262], ["pink", 330], ["red", 4], ["orange", 30], ["green", 142], ["teal", 178], ["violet", 290]];
    const AVATAR_EMOJI = ["😀", "😎", "🤓", "🥳", "🤠", "😺", "🐶", "🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🦄", "🐙", "🐧", "🦉", "🍿", "🎬", "🎮", "🌟", "🔥", "🍕"];
    const AVATARS = [...AVATAR_COLORS.map((color, i) => `c${i}`), ...AVATAR_EMOJI];

    const supported = "RTCPeerConnection" in window && window.isSecureContext && !!(window.crypto && crypto.subtle);
    const canStream = typeof mainVideo.captureStream === "function";

    const overlay = document.querySelector("#room-overlay"),
    overlayClose = overlay.querySelector(".box-close"),
    views = overlay.querySelectorAll(".room-view"),
    createForm = overlay.querySelector('[data-view="create"]'),
    joinForm = overlay.querySelector('[data-view="join"]'),
    joinError = joinForm.querySelector(".room-error"),
    statusIcon = overlay.querySelector(".room-status-icon"),
    statusTitle = overlay.querySelector(".room-status-title"),
    statusText = overlay.querySelector(".room-status-text"),
    statusList = overlay.querySelector(".room-status-list"),
    statusProgress = overlay.querySelector(".room-status-progress"),
    statusActions = overlay.querySelector(".room-status-actions"),
    cueBox = document.querySelector(".room-cue"),
    streamWait = document.querySelector(".room-stream-wait"),
    streamWaitText = streamWait.querySelector("span"),
    toasts = document.querySelector(".room-toasts"),
    roomTitle = panel.querySelector(".room-title"),
    roomNameInput = panel.querySelector(".room-name-input"),
    createTitle = createForm.querySelector(".room-create-title"),
    createText = createForm.querySelector(".room-create-text"),
    roomsSection = document.querySelector("#rooms"),
    roomList = document.querySelector(".room-list"),
    homeBar = document.querySelector(".room-home-bar"),
    forgetAllBtn = document.querySelector(".room-forget-all"),
    rememberSwitch = panel.querySelector(".room-remember"),
    stateText = panel.querySelector(".room-state"),
    // Phones held upright: the room's name at the top of the player (the video's title is below it)
    topRoomName = document.querySelector(".top-room-name"),
    hidePanelBtn = panel.querySelector(".room-hide-btn"),
    tabButtons = panel.querySelectorAll(".room-tab-btn"),
    tabPanels = panel.querySelectorAll(".room-tab"),
    chatBadge = panel.querySelector('.room-tab-btn[data-tab="chat"] .room-tab-badge'),
    peopleBadge = panel.querySelector('.room-tab-btn[data-tab="people"] .room-tab-badge'),
    codeText = panel.querySelector(".room-code"),
    passwordText = panel.querySelector(".room-password"),
    qrBox = panel.querySelector(".room-qr"),
    linkPasswordBox = panel.querySelector(".room-link-password"),
    copyLinkBtn = panel.querySelector(".room-copy-link"),
    requestList = panel.querySelector(".room-requests"),
    peopleCount = panel.querySelector(".room-count"),
    peopleList = panel.querySelector(".room-people"),
    hostSettings = panel.querySelector(".room-host-settings"),
    guestSettings = panel.querySelector(".room-guest-settings"),
    nowBar = panel.querySelector(".room-now"),
    nowTitle = nowBar.querySelector(".room-now-title"),
    nowMeta = nowBar.querySelector(".room-now-meta"),
    nowShareBtn = nowBar.querySelector(".room-now-share"),
    nowIcon = nowBar.querySelector(".room-now-icon i"),
    nowYtBtn = nowBar.querySelector(".room-now-yt"),
    nowList = nowBar.querySelector(".room-now-list"),
    nowCount = nowBar.querySelector(".room-now-count"),
    nowPrevBtn = nowBar.querySelector(".room-now-prev"),
    nowNextBtn = nowBar.querySelector(".room-now-next"),
    ytForm = nowBar.querySelector(".room-yt-form"),
    ytInput = ytForm.querySelector(".room-yt-input"),
    ytHint = ytForm.querySelector(".room-yt-hint"),
    ytMount = document.querySelector(".yt-mount"),
    queueTabBtn = panel.querySelector('.room-tab-btn[data-tab="queue"]'),
    queueTitle = panel.querySelector(".room-queue-title"),
    queueTab = panel.querySelector(".room-tab-queue"),
    queueAddForm = queueTab.querySelector(".queue-add-form"),
    queueAddInput = queueTab.querySelector(".queue-add-input"),
    queueMoreBtn = queueTab.querySelector(".room-queue-more"),
    queueEmpty = queueTab.querySelector(".room-queue-empty"),
    queueCount = queueTab.querySelector(".room-queue-count"),
    queueList = queueTab.querySelector(".room-queue"),
    playerStopBtns = document.querySelectorAll(".player-stop-btn"),
    prevTrackBtn = document.querySelector(".container .prev-track"),
    nextTrackBtn = document.querySelector(".container .next-track"),
    settingInputs = hostSettings.querySelectorAll("[data-setting]"),
    qualityField = hostSettings.querySelector(".room-quality"),
    streamNote = panel.querySelector(".room-stream-note"),
    streamChoice = guestSettings.querySelector('[data-watch="stream"]'),
    ownChoice = guestSettings.querySelector('[data-watch="own"]'),
    chatList = panel.querySelector(".room-chat"),
    chatForm = panel.querySelector(".room-chat-form"),
    chatInput = panel.querySelector(".room-chat-input"),
    replyBar = panel.querySelector(".room-reply-bar"),
    meBtn = panel.querySelector(".room-me"),
    leaveWrap = panel.querySelector(".room-leave-wrap"),
    leavePopover = panel.querySelector(".room-leave-popover"),
    leaveJustBtn = panel.querySelector(".leave-just"),
    leaveEndBtn = panel.querySelector(".leave-end"),
    leaveBtn = panel.querySelector(".room-leave-btn"),
    leaveLabel = leaveBtn.querySelector("span"),
    micBtn = panel.querySelector(".room-mic-btn"),
    camBtn = panel.querySelector(".room-cam-btn"),
    flipBtn = panel.querySelector(".room-flip-btn"),
    profileSheet = panel.querySelector(".room-sheet"),
    shareCount = shareHelpBtn.querySelector(".share-help-count"),
    badge = el("b", "room-badge");

    badge.hidden = true;
    shareHelpBtn.append(badge);
    const showRelayOption = () => overlay.querySelectorAll(".room-relay").forEach(label => label.hidden = !relayAvailable);
    showRelayOption();

    // TURN credentials from TURN_CREDENTIALS_URL, fetched once (and again after a failure)
    let turnLoad = null;
    const loadTurn = () => {
        if (!TURN_CREDENTIALS_URL) return Promise.resolve();
        turnLoad ||= fetch(TURN_CREDENTIALS_URL)
            .then(response => response.ok ? response.json() : null)
            .then(list => {
                const servers = (Array.isArray(list) ? list : list && list.iceServers || [])
                    .filter(server => server && (typeof server.urls === "string" || Array.isArray(server.urls)));
                if (!servers.length) throw new Error("No TURN servers");
                iceServers = [...ICE_SERVERS, ...servers];
                relayAvailable = hasTurn(iceServers);
                showRelayOption();
            })
            .catch(() => turnLoad = null);
        // Never holds up a room for long
        return Promise.race([turnLoad, new Promise(resolve => setTimeout(resolve, 4000))]);
    };
    loadTurn();

    let room = null;
    let captured = null;
    let openedFromHome = false;
    let activeTab = "chat";
    let chatUnread = 0;
    let lastMessage = null;
    let replyTo = null;
    // Chat messages on screen by id: for reactions and replies
    const chatItems = new Map();
    let closeAction = null;
    let micStream = null;
    let micEnabled = false;
    let micBusy = false;
    // The mic and camera buttons: the side panel's, and the call window's (added with it below)
    const micButtons = [micBtn];
    const camButtons = [camBtn];
    let syncHoverControls = null;
    const remoteVoiceAudio = new Map();
    let reopening = null;
    let homeBarDismissed = false;
    const createIntro = createText.textContent;
    // (a phone held upright, or a window made as narrow as one)
    const uprightTouch = matchMedia("(pointer: coarse) and (orientation: portrait), (max-width: 600px) and (orientation: portrait)");
    const isUprightPhone = () => uprightTouch.matches || playerPage.classList.contains("title-below") || (playerPage.classList.contains("room-open") && matchMedia("(max-width: 900px) and (orientation: portrait)").matches);

    // ---------- Small helpers

    const now = () => performance.now();
    // A fingerprint of a secret (a ticket, the owner's key): shows it's the same one without
    // giving it away, so whoever hosts next can recognise people without knowing their tickets
    const fingerprint = async text => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`cinetab:${text}`))),
        byte => byte.toString(16).padStart(2, "0")).join("");
    const FINGERPRINT = /^[0-9a-f]{64}$/;
    const finite = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
    // Names and messages: one line of plain text without control or direction-changing characters
    const clean = (text, max) => String(text ?? "")
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, " ")
        .replace(/\s+/g, " ").trim().slice(0, max);
    const hue = name => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    const fileKey = file => `${file.name}|${file.size}`;
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const field = (form, name) => form.elements.namedItem(name);
    const hasMedia = () => (!!mainVideo.getAttribute("src") || !!mainVideo.srcObject) &&
        mainVideo.readyState > 0 && playbackMode !== "converting";
    // The video in the room: who shared it and which file it is
    const mediaKey = file => file ? `${file.from || ""}|${fileKey(file)}` : null;
    const clock = at => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const allow = (peer, kind, max, perMs) => {
        const times = (peer.rate[kind] ||= []);
        const at = Date.now();
        while (times.length && at - times[0] > perMs) times.shift();
        if (times.length >= max) return false;
        times.push(at);
        return true;
    };

    // ---------- Avatars

    const validAvatar = avatar => typeof avatar === "string" && AVATARS.includes(avatar) ? avatar : "";

    const paintAvatar = (node, name, avatar) => {
        const emoji = AVATAR_EMOJI.includes(avatar);
        const color = /^c[0-7]$/.test(avatar) ? AVATAR_COLORS[avatar[1]][1] : hue(name || "?");
        node.classList.toggle("emoji", emoji);
        node.textContent = emoji ? avatar : ([...name.trim()][0] || "?").toUpperCase();
        node.style.setProperty("--hue", color);
    };

    const makeAvatar = (name, avatar, size = "") => {
        const node = el("span", `room-avatar ${size}`.trim());
        paintAvatar(node, name, avatar);
        return node;
    };

    // A grid of every avatar, previewed with the name being typed
    const avatarPicker = (grid, nameInput, previews) => {
        let value = "";
        const paint = () => {
            const name = nameInput.value;
            previews.forEach(preview => paintAvatar(preview, name, value));
            grid.querySelectorAll("button").forEach(button => {
                paintAvatar(button.firstChild, name, button.dataset.avatar);
                button.classList.toggle("selected", button.dataset.avatar === value);
                button.setAttribute("aria-pressed", button.dataset.avatar === value);
            });
        };
        grid.replaceChildren(...AVATARS.map(avatar => {
            const button = el("button", "room-avatar-option");
            button.type = "button";
            button.dataset.avatar = avatar;
            button.title = avatar.startsWith("c") ? `Your initial on ${AVATAR_COLORS[avatar[1]][0]}` : `${avatar} avatar`;
            button.append(el("span", "room-avatar"));
            return button;
        }));
        grid.addEventListener("click", e => {
            const button = e.target.closest("button");
            if (!button) return;
            value = button.dataset.avatar;
            paint();
        });
        nameInput.addEventListener("input", paint);
        return {
            get value() { return value; },
            set value(avatar) { value = validAvatar(avatar); paint(); }
        };
    };

    // ---------- Dialogs over the player

    // ---------- In the player, out of a room: Create a room and Join a room aren't a dialog over the
    // video - the form comes into the side panel's Watch together tab (compact: no intro, the
    // options' details in their tooltips), with a Back button. Elsewhere it's the dialog.
    const panelFormSlot = panel.querySelector(".together-form");
    const togetherTab = panel.querySelector(".room-tab-together");
    const statusView = overlay.querySelector('[data-view="status"]');
    let panelForm = null;
    const closePanelForm = () => {
        if (!panelForm) return;
        panelForm.classList.remove("in-panel");
        panelForm.hidden = true;
        statusView.before(panelForm);
        panelForm = null;
        panelFormSlot.hidden = true;
        togetherTab.classList.remove("form-open");
    };
    const showPanelForm = form => {
        if (panelForm !== form) closePanelForm();
        panelForm = form;
        form.classList.add("in-panel");
        form.hidden = false;
        if (form.parentNode !== panelFormSlot) panelFormSlot.append(form);
        panelFormSlot.querySelector(".together-form-title").textContent = form === createForm ? createTitle.textContent : "Join a room";
        panelFormSlot.hidden = false;
        togetherTab.classList.add("form-open");
        togetherTab.scrollTop = 0;
        hideOverlay();
        showTab("together");
        if (panel.hidden || panelClosing) showPanel(true);
    };
    panel.querySelector(".together-back")?.addEventListener("click", () => closeDialog());
    // (Esc: back, before the player's own Esc handling - unless the avatar choice is open)
    document.addEventListener("keydown", e => {
        if (e.key !== "Escape" || !panelForm || panel.hidden || playerPage.hidden) return;
        if (!panel.contains(document.activeElement) && document.activeElement !== document.body) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const avatars = panelForm.querySelector(".room-avatar-grid");
        if (avatars && !avatars.hidden) avatars.hidden = true;
        else closeDialog();
    }, true);

    // `onClose` runs for the × button and Esc
    const showView = (name, onClose = hideOverlay) => {
        const form = name === "create" ? createForm : name === "join" ? joinForm : null;
        if (form && panelFormSlot && !room && !playerPage.hidden) {
            closeAction = onClose;
            return showPanelForm(form);
        }
        closePanelForm();
        views.forEach(view => view.hidden = view.dataset.view !== name);
        closeAction = onClose;
        // On small screens a dialog gets the whole screen, unless the room's chat is open beside it
        overlay.classList.toggle("room-modal", panel.hidden);
        overlay.classList.remove("hidden");
    };
    const hideOverlay = () => overlay.classList.add("hidden");
    overlayClose.addEventListener("click", () => (closeAction || hideOverlay)());
    overlay.addEventListener("click", e => {
        if (e.target === overlay) (closeAction || hideOverlay)();
    });

    const showStatus = ({ icon = "fa-satellite-dish", title, text = "", busy = false, actions = [], list = [], onClose }) => {
        statusIcon.className = `room-status-icon fa-solid ${icon}`;
        statusTitle.textContent = title;
        statusText.textContent = text;
        statusText.hidden = !text;
        statusList.replaceChildren(...list.map(({ ok, title, text }) => {
            const item = el("li", ok === true ? "ok" : ok === false ? "bad" : "info");
            item.append(el("i", `fa-solid ${ok === true ? "fa-circle-check" : ok === false ? "fa-circle-xmark" : "fa-circle-info"}`));
            const body = el("span");
            body.append(el("b", null, title), el("small", null, text));
            item.append(body);
            return item;
        }));
        statusList.hidden = !list.length;
        statusProgress.hidden = !busy;
        statusActions.replaceChildren(...actions.map(action => {
            const button = el("button", action.secondary ? "secondary-btn" : null);
            button.type = "button";
            if (action.icon) button.append(el("i", action.icon.startsWith("fa-brands") ? action.icon : `fa-solid ${action.icon}`), " ");
            button.append(action.label);
            button.addEventListener("click", action.onClick);
            return button;
        }));
        statusActions.hidden = !actions.length;
        showView("status", onClose);
    };

    // Pop-ups go wherever they can be seen: the player (also in fullscreen) or the home page.
    // Switching between them clears old ones, so none is left covering the other view.
    // Pop-ups for people asking to join (by their id); they stay until answered
    const knockToasts = new Map();
    const placeToasts = () => {
        const host = playerPage.hidden ? document.body : playerPage;
        if (toasts.parentNode !== host) {
            toasts.replaceChildren(...knockToasts.values());
            host.append(toasts);
        }
        placeToastBox();
    };

    // Where they show in the player: never over the room's panel, the call's column or its bar.
    // Phones: centred on the video, just below its top bar (the panel is below the video held
    // upright, beside it held sideways). Computers: the bottom left, clear of a column pinned
    // left of the video. (style.css places them from these numbers.)
    const toastPhone = matchMedia("(pointer: coarse) and (max-width: 900px), screen and (max-width: 600px)");
    const placeToastBox = () => {
        const inPlayer = toasts.parentNode === playerPage && !playerPage.hidden;
        const box = inPlayer ? container.getBoundingClientRect() : null;
        toasts.classList.toggle("placed", !!(box && box.width));
        if (!box || !box.width) return;
        const style = toasts.style;
        if (toastPhone.matches) {
            const bar = container.querySelector(".top-bar");
            const barBox = bar && bar.getBoundingClientRect();
            const below = barBox && barBox.height && barBox.bottom <= box.top + box.height / 2 ? barBox.bottom : box.top;
            style.setProperty("--toast-x", `${Math.round(box.left + box.width / 2)}px`);
            style.setProperty("--toast-y", `${Math.round(Math.max(below + 6, 8))}px`);
            style.setProperty("--toast-w", `${Math.round(Math.max(200, box.width - 24))}px`);
        } else {
            style.setProperty("--toast-left", `${Math.round(Math.max(24, box.left + 12))}px`);
        }
    };
    window.addEventListener("resize", () => toasts.parentNode === playerPage && placeToastBox());
    toastPhone.addEventListener("change", placeToastBox);
    // (the panel opening or closing, the call docking, fullscreen: the video moves)
    new MutationObserver(() => toasts.parentNode === playerPage && toasts.childElementCount && placeToastBox())
        .observe(playerPage, { attributes: true, attributeFilter: ["class"] });

    const toast = (text, name = null, avatar = "", onClick = null) => {
        placeToasts();
        const item = el(onClick ? "button" : "div", `room-toast${onClick ? " clickable" : ""}`);
        if (name) {
            const body = el("span", "room-toast-body");
            body.append(el("b", null, name), el("span", "room-toast-text", text));
            item.append(makeAvatar(name, avatar, "small"), body);
        } else {
            item.append(text);
        }
        if (onClick) {
            item.title = "Open the chat";
            item.addEventListener("click", () => {
                item.remove();
                onClick();
            });
        }
        toasts.append(item);
        // At most three at once, not counting people waiting to be let in
        const plain = [...toasts.children].filter(child => !child.classList.contains("room-knock"));
        plain.slice(0, Math.max(0, plain.length - 3)).forEach(child => child.remove());
        setTimeout(() => item.remove(), onClick ? 7000 : 5000);
    };

    // A short two-note chime, made on the spot (no sound file to load)
    let chimeContext = null;
    const playChime = () => {
        try {
            chimeContext ||= new (window.AudioContext || window.webkitAudioContext)();
            if (chimeContext.state === "suspended") chimeContext.resume();
            const start = chimeContext.currentTime + 0.03;
            [[784, 0], [1175, 0.17]].forEach(([frequency, at]) => {
                const tone = chimeContext.createOscillator();
                const gain = chimeContext.createGain();
                tone.type = "sine";
                tone.frequency.value = frequency;
                gain.gain.setValueAtTime(0.0001, start + at);
                gain.gain.exponentialRampToValueAtTime(0.3, start + at + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.7);
                tone.connect(gain).connect(chimeContext.destination);
                tone.start(start + at);
                tone.stop(start + at + 0.75);
            });
        } catch (e) {}
    };

    const clearKnock = id => {
        const item = knockToasts.get(id);
        if (item) item.remove();
        knockToasts.delete(id);
    };

    // Someone asks to join: a chime and a pop-up. Clicking it shows Accept and Deny.
    const announceKnock = peer => {
        playChime();
        placeToasts();
        clearKnock(peer.id);
        const item = el("div", "room-toast room-knock");
        item.setAttribute("role", "alert");
        const head = el("button", "room-knock-head");
        head.type = "button";
        head.setAttribute("aria-expanded", "false");
        const body = el("span", "room-toast-body");
        const text = el("span", "room-toast-text", "wants to join · tap to answer");
        body.append(el("b", null, peer.name), text);
        head.append(makeAvatar(peer.name, peer.avatar, "small"), body, el("i", "fa-solid fa-bell room-knock-bell"));
        const actions = el("span", "room-knock-actions");
        actions.hidden = true;
        const deny = el("button", "room-small-btn", "Deny");
        deny.type = "button";
        deny.dataset.deny = peer.id;
        deny.title = `Don't let ${peer.name} in`;
        const accept = el("button", "room-small-btn primary", "Accept");
        accept.type = "button";
        accept.dataset.admit = peer.id;
        accept.title = `Let ${peer.name} into the room`;
        actions.append(deny, accept);
        item.append(head, actions);
        head.addEventListener("click", () => {
            actions.hidden = !actions.hidden;
            head.setAttribute("aria-expanded", String(!actions.hidden));
            text.textContent = actions.hidden ? "wants to join · tap to answer" : "wants to join the room";
            if (!actions.hidden) accept.focus();
        });
        actions.addEventListener("click", e => {
            const button = e.target.closest("button");
            if (!button || !room || room.role !== "host") return;
            clearKnock(peer.id);
            const waiting = room.peers.get(peer.id);
            if (!waiting || waiting.status !== "waiting") return;
            if (button.dataset.admit) admit(waiting);
            else refuse(waiting, "denied");
        });
        knockToasts.set(peer.id, item);
        toasts.append(item);
        // In a background tab, the tab's title says so too
        if (document.hidden) {
            const title = document.title;
            const asking = document.title = `🔔 ${peer.name} wants to join`;
            document.addEventListener("visibilitychange", () => document.title === asking && (document.title = title), { once: true });
        }
    };

    const openChat = () => {
        if (!room) return;
        if (playerPage.hidden) showPlayer();
        showPanel(true);
        showTab("chat");
        chatInput.focus();
    };

    const copy = async (text, what) => {
        try {
            await navigator.clipboard.writeText(text);
            toast(`${what} copied`);
        } catch (e) {
            prompt(`Copy the ${what.toLowerCase()}:`, text);
        }
    };

    // ---------- Room panel: one tab at a time

    const waitingCount = () => room && room.role === "host" ? [...room.peers.values()].filter(peer => peer.status === "waiting").length : 0;

    // (the call dock's chat button: its own badge, made with the call window below)
    let callChatBadge = null;
    const updateBadges = () => {
        const waiting = waitingCount();
        if (callChatBadge) {
            const unseen = panel.hidden ? chatUnread + waiting : 0;
            callChatBadge.hidden = !unseen;
            callChatBadge.textContent = unseen > 9 ? "9+" : unseen;
        }
        chatBadge.hidden = !chatUnread;
        chatBadge.textContent = chatUnread > 9 ? "9+" : chatUnread;
        peopleBadge.hidden = !waiting;
        peopleBadge.textContent = waiting;
        const total = panel.hidden ? chatUnread + waiting : 0;
        badge.hidden = !total;
        badge.textContent = total > 9 ? "9+" : total;
        roomToggleBadge.hidden = !total;
        roomToggleBadge.textContent = badge.textContent;
        renderHomeBar();
    };

    const scrollChat = () => chatList.scrollTop = chatList.scrollHeight;

    const showTab = tab => {
        activeTab = tab;
        // For the panel's layout (e.g. no Previous / Next beside the queue, which has them)
        panel.dataset.tab = tab;
        tabButtons.forEach(button => {
            button.classList.toggle("active", button.dataset.tab === tab);
            button.setAttribute("aria-selected", button.dataset.tab === tab);
        });
        tabPanels.forEach(section => section.hidden = section.dataset.tab !== tab);
        playerPage.classList.toggle("queue-open", !panel.hidden && tab === "queue");
        // (not in a room: the Watch together button shows pressed while its tab is open)
        playerPage.classList.toggle("together-open", !panel.hidden && !room && tab === "together");
        if (!room) {
            roomTitle.textContent = tab === "together" ? "Watch together" : "Queue";
            if (stateText) stateText.textContent = tab === "together" ? "Create or join a room" : "Upcoming videos";
        }
        if (tab === "chat") {
            chatUnread = 0;
            scrollChat();
        }
        updateBadges();
    };

    const setPanel = show => {
        panel.hidden = !show;
        playerPage.classList.toggle("room-open", show);
        playerPage.classList.toggle("queue-open", show && activeTab === "queue");
        playerPage.classList.toggle("together-open", show && !room && activeTab === "together");
        playerPage.classList.toggle("solo-panel", !room);
        roomToggle.setAttribute("aria-expanded", String(show));
        roomToggle.title = show ? "Hide the panel" : "Show the panel";
        if (show && !room) {
            // Out of a room the panel has two tabs: the queue, and Watch together
            panel.classList.add("solo-queue");
            showTab(activeTab === "together" ? "together" : "queue");
            renderQueue();
            renderTogetherRooms();
        } else if (show && room) {
            panel.classList.remove("solo-queue");
            if (activeTab === "chat") {
                chatUnread = 0;
                scrollChat();
            }
        }
        if (!show) closeProfile();
        updateBadges();
        placeDock();
    };

    // ---------- Phones held upright: what's playing, under its title. The video's title is below
    // the picture there and the room's name at the top of the player (script.js), so the Now
    // playing bar (who shared it, YouTube, share / change, previous / next, remove) moves just
    // below the title, with a Room button in front that opens and closes the panel; the panel
    // then starts straight with its tabs. Elsewhere the bar stays at the top of the panel.
    const roomToggle = el("button", "room-small-btn room-toggle");
    roomToggle.type = "button";
    roomToggle.setAttribute("aria-expanded", "false");
    const roomToggleLabel = el("span", "room-toggle-label");
    const roomToggleBadge = el("b", "room-toggle-badge");
    roomToggleBadge.hidden = true;
    roomToggle.append(el("i", "fa-solid fa-users"), roomToggleLabel, roomToggleBadge, el("i", "fa-solid fa-chevron-up room-toggle-arrow"));
    roomToggle.addEventListener("click", () => together.openPanel && together.openPanel());
    nowBar.prepend(roomToggle);

    const metaBox = document.querySelector(".player-meta");
    const nowHome = nowBar.nextElementSibling;
    // The call bar (you, mic, camera, leave) stays at the bottom of the screen there, with the
    // panel open or closed
    const roomFoot = panel.querySelector(".room-foot");
    const footHome = roomFoot.nextElementSibling;
    // On a phone the call bar is part of the call window (the call window section sets this to
    // give the window, or null elsewhere)
    let footInCall = null;
    const placeNowBar = () => {
        const below = !!room && !!metaBox && playerPage.classList.contains("title-below");
        if (below && nowBar.parentNode !== metaBox) metaBox.append(nowBar);
        else if (!below && nowBar.parentNode !== panel) panel.insertBefore(nowBar, nowHome);
        const footTo = (footInCall && footInCall()) || (below ? playerPage : panel);
        if (roomFoot.parentNode !== footTo) {
            if (footTo === panel) panel.insertBefore(roomFoot, footHome);
            else footTo.append(roomFoot);
        }
        playerPage.classList.toggle("now-below", below);
    };
    new MutationObserver(placeNowBar).observe(playerPage, { attributes: true, attributeFilter: ["class"] });

    // ---------- Opening and closing the panel, in motion: it slides in from the side (or up from
    // below, on a phone held upright) as it fades in, and the player moves and resizes smoothly to
    // make room; closing is the same backwards. Instant for people who asked for less motion.
    const PANEL_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    let panelClosing = null;
    const calmer = () => matchMedia("(prefers-reduced-motion: reduce)").matches || typeof panel.animate !== "function";
    // Where the panel comes from: below the player when they're stacked, beside it otherwise
    const panelOffset = () => isUprightPhone() ? "translateY(28px)" : "translateX(28px)";
    // The player glides from where it was (`before`) to where the new layout puts it
    const glidePlayer = before => {
        const after = container.getBoundingClientRect();
        if (!before.width || !after.width) return;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        const sx = before.width / after.width;
        const sy = before.height / after.height;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return;
        if (isNaN(sx) || isNaN(sy) || sx < 0.2 || sx > 5 || sy < 0.2 || sy > 5) return;
        container.animate([
            { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
            { transformOrigin: "0 0", transform: "none" }
        ], { duration: 250, easing: PANEL_EASE });
    };

    // `from`: where a swipe down left it (a transform and opacity), to close from there
    const showPanel = (show, from = null) => {
        const open = !panel.hidden && !panelClosing;
        const move = show !== open && !playerPage.hidden && !calmer();
        // Opened again while it was going: it stays
        if (panelClosing) {
            panelClosing.cancel();
            panelClosing = null;
        }
        if (!move) return setPanel(show);
        if (!show) {
            const offset = from ? "translateY(100%)" : panelOffset();
            const start = from || { opacity: 1, transform: "none" };
            const going = panelClosing = panel.animate([start, { opacity: 0, transform: offset }], { duration: from ? 220 : 200, easing: from ? "cubic-bezier(0.2, 0.6, 0.4, 1)" : "cubic-bezier(0.4, 0, 1, 1)" });
            going.onfinish = () => {
                if (panelClosing !== going) return;
                panelClosing = null;
                const before = container.getBoundingClientRect();
                setPanel(false);
                glidePlayer(before);
            };
            return;
        }
        const before = container.getBoundingClientRect();
        setPanel(true);
        glidePlayer(before);
        panel.animate([{ opacity: 0, transform: panelOffset() }, { opacity: 1, transform: "none" }], { duration: 320, easing: PANEL_EASE });
    };

    // One message: what it replies to, the text, its reactions, and React / Reply buttons
    const messageLine = (id, text, reply) => {
        const line = el("div", "room-msg-line");
        if (reply) {
            const quote = el("button", "room-msg-quote");
            quote.dataset.goto = reply.id;
            quote.title = "Show the original message";
            quote.append(el("b", null, reply.name), el("span", null, reply.text));
            line.append(quote);
        }
        line.append(el("p", "room-msg-text", text));
        const reactions = el("div", "room-reactions");
        line.append(reactions);
        if (id) {
            line.dataset.id = id;
            const tools = el("div", "room-msg-tools");
            const react = el("button", null, "☺");
            react.dataset.react = "";
            react.title = "React";
            const answer = el("button");
            answer.dataset.reply = "";
            answer.title = "Reply";
            answer.append(el("i", "fa-solid fa-reply"));
            tools.append(react, answer);
            line.append(tools);
        }
        return { line, reactions };
    };

    // Chat in the usual meeting style: avatar, name and time, then the messages that person sent
    // in a row
    const addMessage = ({ id = null, from = null, name = "", avatar = "", text, self = false, system = false, at = Date.now(), reply = null }) => {
        const atBottom = chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 60;
        if (system) {
            chatList.append(el("li", "room-msg system", text));
            lastMessage = null;
        } else {
            const { line, reactions } = messageLine(id, text, reply);
            if (lastMessage && lastMessage.from === from && lastMessage.name === name && at - lastMessage.at < 120000) {
                lastMessage.body.append(line);
                lastMessage.at = at;
            } else {
                const item = el("li", `room-msg${self ? " self" : ""}`);
                const body = el("div", "room-msg-body");
                const head = el("p", "room-msg-head");
                head.append(el("b", null, self ? "You" : name), el("time", null, clock(at)));
                body.append(head, line);
                item.append(makeAvatar(name, avatar, "small"), body);
                chatList.append(item);
                lastMessage = { from, name, at, body };
            }
            if (id) {
                chatItems.set(id, { line, reactions, name: self ? "You" : name, text });
                if (chatItems.size > 400) chatItems.delete(chatItems.keys().next().value);
            }
        }
        while (chatList.children.length > 300) chatList.firstChild.remove();
        if (atBottom || self) scrollChat();
        // Unread, with a pop-up, unless the chat is on screen
        if (!system && !self && (panel.hidden || playerPage.hidden || activeTab !== "chat")) {
            chatUnread++;
            updateBadges();
            toast(reply ? `↩ ${text}` : text, name, avatar, openChat);
        }
    };

    const renderReactions = (id, list) => {
        const item = chatItems.get(id);
        if (!item) return;
        item.reactions.replaceChildren(...list.map(({ e, ids, names }) => {
            const chip = el("button", `room-chip${room && ids.includes(room.id) ? " mine" : ""}`, `${e} ${ids.length}`);
            chip.dataset.chip = e;
            chip.title = names.join(", ");
            return chip;
        }));
    };

    // Reacting toggles: the same emoji again takes it back
    const react = (id, emoji) => {
        if (!room || !REACTIONS.includes(emoji)) return;
        if (room.role === "host") applyReaction(room.id, room.name, id, emoji);
        else send(room.peer, { t: "react", id, emoji });
    };

    const closePickers = () => chatList.querySelectorAll(".room-react-picker").forEach(picker => picker.remove());

    const showPicker = line => {
        const open = line.querySelector(".room-react-picker");
        closePickers();
        if (open) return;
        const picker = el("div", "room-react-picker");
        REACTIONS.forEach(emoji => {
            const button = el("button", null, emoji);
            button.dataset.emoji = emoji;
            button.title = `React with ${emoji}`;
            picker.append(button);
        });
        line.append(picker);
    };

    const startReply = id => {
        const item = chatItems.get(id);
        if (!item) return;
        replyTo = { id, name: item.name, text: item.text };
        replyBar.querySelector("b").textContent = item.name;
        replyBar.querySelector(".room-reply-text").textContent = item.text;
        replyBar.hidden = false;
        chatInput.focus();
    };

    const cancelReply = () => {
        replyTo = null;
        replyBar.hidden = true;
    };

    chatList.addEventListener("click", e => {
        const button = e.target.closest("button");
        const line = e.target.closest(".room-msg-line");
        if (!button) {
            // Touch screens have no hover: a tap shows the message's buttons
            if (line && line.dataset.id) line.classList.toggle("show-tools");
            return;
        }
        const id = line && line.dataset.id;
        if ("react" in button.dataset) showPicker(line);
        else if ("emoji" in button.dataset) {
            closePickers();
            react(id, button.dataset.emoji);
        } else if ("chip" in button.dataset) react(id, button.dataset.chip);
        else if ("reply" in button.dataset) startReply(id);
        else if ("goto" in button.dataset) {
            const target = chatItems.get(button.dataset.goto);
            if (!target) return;
            target.line.scrollIntoView({ block: "center", behavior: "smooth" });
            target.line.classList.remove("flash");
            void target.line.offsetWidth;
            target.line.classList.add("flash");
        }
    });
    document.addEventListener("click", e => {
        if (!e.target.closest(".room-react-picker, [data-react]")) closePickers();
    });
    replyBar.querySelector("button").addEventListener("click", () => {
        cancelReply();
        chatInput.focus();
    });

    const renderPeople = members => {
        room.memberCount = members.length;
        peopleCount.textContent = members.length;
        renderRoomButton();
        // The button under the title: people and how many (its tooltip and label say "Room")
        roomToggleLabel.textContent = members.length;
        roomToggle.setAttribute("aria-label", `Room, ${members.length} ${members.length === 1 ? "person" : "people"}`);
        const file = room.file;
        peopleList.replaceChildren(...members.map(member => {
            const item = el("li", "room-person");
            const info = el("span", "room-person-info");
            const you = member.id === room.id;
            const name = el("span", "room-person-name", member.name);
            if (you) name.append(el("span", "room-person-you", " (you)"));
            const route = room.role === "host" ? member.route : you ? room.peer && room.peer.route : null;
            const watching = member.sharing ? file && file.yt ? "shared the video" : "sharing the video"
                : member.host || !file ? null
                : file.yt ? "watching on YouTube"
                : member.stream && streamable() ? "watching the stream" : "playing their own copy";
            const meta = [member.host && "Host", watching, ROUTE_LABEL[route]].filter(Boolean).join(" · ");
            const metaText = meta.charAt(0).toUpperCase() + meta.slice(1);
            info.append(name, el("span", "room-person-meta", metaText));
            item.append(makeAvatar(member.name, member.avatar), info);
            if (you) {
                const edit = el("button", "room-icon-btn");
                edit.dataset.edit = "";
                edit.title = "Change your name or avatar";
                edit.append(el("i", "fa-solid fa-pen"));
                item.append(edit);
            } else if (room.role === "host" && !member.host) {
                const remove = el("button", "room-icon-btn danger");
                remove.dataset.remove = member.id;
                remove.title = `Remove ${member.name} from the room`;
                remove.append(el("i", "fa-solid fa-user-xmark"));
                item.append(remove);
            }
            return item;
        }));
        renderHomeBar();
    };

    // The Room button at the top of the player: the room's name and how many are in it (the
    // panel itself starts with what's playing)
    const renderRoomButton = () => {
        if (!room) return;
        // (an icon and how many are in the room: no words on the player's top bar)
        shareCount.textContent = String(room.memberCount || 1);
        shareCount.hidden = false;
        shareHelpBtn.setAttribute("aria-label", `${room.title || "Room"}, ${room.memberCount || 1} in the room: show or hide the room panel (R)`);
    };

    const renderState = () => {
        if (!room) return;
        const code = Signaling.formatCode(room.code);
        roomTitle.textContent = room.title;
        if (room.role === "host") {
            const count = guests().length;
            stateText.textContent = `${code} · ` + (!room.signal || !room.signal.connected ? "connecting… people can't join yet"
                : count ? `you're hosting · ${plural(count, "guest")}` : "you're hosting · invite people");
        } else {
            const route = room.peer && ROUTE_LABEL[room.peer.route];
            stateText.textContent = `${code} · ` + (room.phase === "in" ? `hosted by ${room.hostName}${route ? ` · ${route}` : ""}` : "reconnecting…");
        }
        // The heading is just the room's name; the rest (code, who hosts, the connection) is in
        // Invite and People, and here when pointed at
        roomTitle.title = stateText.textContent;
        renderRoomButton();
        topRoomName.textContent = room.title;
        topRoomName.hidden = false;
        placeNowBar();
        renderHomeBar();
    };

    const renderMe = () => {
        paintAvatar(meBtn.querySelector(".room-avatar"), room.name, room.avatar);
        meBtn.querySelector(".room-me-name").textContent = room.name;
    };

    const inviteLink = () => {
        const params = new URLSearchParams({ join: Signaling.formatCode(room.code) });
        if (linkPasswordBox.checked) params.set("pw", room.password);
        return `${location.origin}${location.pathname}#${params}`;
    };

    const renderQr = text => {
        if (typeof qrcode !== "function") return;
        const qr = qrcode(0, "M");
        qr.addData(text);
        qr.make();
        const size = qr.getModuleCount();
        let path = "";
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                if (qr.isDark(row, col)) path += `M${col + 3},${row + 3}h1v1h-1z`;
            }
        }
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", `0 0 ${size + 6} ${size + 6}`);
        svg.setAttribute("shape-rendering", "crispEdges");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "QR code with the invite link");
        const background = document.createElementNS(ns, "rect");
        background.setAttribute("width", "100%");
        background.setAttribute("height", "100%");
        background.setAttribute("fill", "#fff");
        const dots = document.createElementNS(ns, "path");
        dots.setAttribute("d", path);
        dots.setAttribute("fill", "#000");
        svg.append(background, dots);
        qrBox.replaceChildren(svg);
    };

    const renderInvite = () => {
        codeText.textContent = Signaling.formatCode(room.code);
        passwordText.textContent = room.password;
        renderQr(inviteLink());
    };

    // `keepChat`: the same room carrying on (another host took it over, or this browser did)
    const enterRoomUI = (keepChat = false) => {
        roomNameInput.value = room.title;
        hostSettings.hidden = room.role !== "host";
        guestSettings.hidden = room.role === "host";
        // Leaving doesn't end the room: it goes on with everyone else. Its owner can end it.
        leaveLabel.textContent = "Leave";
        leaveBtn.title = "Leave or end the room";
        chatInput.disabled = false;
        if (!keepChat) {
            chatList.replaceChildren();
            chatItems.clear();
        }
        cancelReply();
        lastMessage = null;
        chatUnread = 0;
        requestList.replaceChildren();
        linkPasswordBox.checked = true;
        rememberSwitch.checked = !!room.remember;
        renderInvite();
        renderMe();
        panel.classList.remove("solo-queue");
        together.following = room.role === "guest";
        // (pressed again while it's closing: it opens again)
        together.openPanel = () => showPanel(panel.hidden || !!panelClosing);
        shareHelpBtn.title = "Show or hide the room panel (R)";
        together.beforeHome = askBeforeHome;
        together.onTitle = room.role === "host" ? shareFile : () => room && room.presenting && sendPresent();
        together.active = () => !!room;
        together.onFile = room.role === "host" ? onHostFile : onGuestFile;
        renderNow();
        // A new host starts on People (who's in, and the invite details below), a guest on the chat
        showTab(room.role === "host" ? "people" : "chat");
        renderCameras();
        showPanel(true);
        renderState();
        openedFromHome = false;
    };

    const toggleLeaveMenu = show => {
        if (!leavePopover) return;
        const open = typeof show === "boolean" ? show : leavePopover.hidden;
        leavePopover.hidden = !open;
        leaveBtn.setAttribute("aria-expanded", String(open));
    };

    const closeRoomUI = () => {
        together.openPanel = null;
        // Picture in picture with everyone: out of the room, it closes
        if (pipCall && window.documentPictureInPicture && window.documentPictureInPicture.window) window.documentPictureInPicture.window.close();
        toggleLeaveMenu(false);
        showPanel(false);
        panel.classList.add("solo-queue");
        chatUnread = 0;
        updateBadges();
        shareCount.textContent = "";
        shareCount.hidden = true;
        shareHelpBtn.setAttribute("aria-label", "Watch together");
        shareHelpBtn.title = "How to watch together (R)";
        chatList.replaceChildren();
        lastMessage = null;
        requestList.replaceChildren();
        peopleList.replaceChildren();
        nowBar.classList.remove("live");
        nowList.hidden = true;
        closeYouTubeForm();
        prevTrackBtn.hidden = nextTrackBtn.hidden = true;
        queueList.replaceChildren();
        if (activeTab === "queue") showTab("chat");
    };

    tabButtons.forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab)));
    hidePanelBtn.addEventListener("click", () => showPanel(false));

    // ---------- The panel's width (with a mouse): its left edge, dragged to make it wider or
    // narrower, the video beside it following (arrow keys too, once it has focus; a double-click
    // goes back to its own width). Remembered; never more than half the screen.
    const PANEL_KEY = "cinetab:panel-w";
    const PANEL_MIN = 280;
    const panelMax = () => Math.max(PANEL_MIN, Math.min(640, playerPage.getBoundingClientRect().width * 0.5));
    let panelW = (() => {
        const saved = +storage.get(PANEL_KEY);
        return finite(saved, 200, 4000) ? saved : null;
    })();
    const applyPanelW = () => {
        if (!panelW) return playerPage.style.removeProperty("--panel-w");
        playerPage.style.setProperty("--panel-w", `${Math.round(Math.max(PANEL_MIN, Math.min(panelW, panelMax())))}px`);
    };
    const panelInMotion = () => {
        if (calmer()) return;
        playerPage.classList.add("panel-moving");
        clearTimeout(panelInMotion.timer);
        panelInMotion.timer = setTimeout(() => playerPage.classList.remove("panel-moving"), 400);
    };
    const savePanelW = () => storage.set(PANEL_KEY, panelW ? String(Math.round(panelW)) : "");
    const panelEdge = el("button", "room-panel-edge");
    panelEdge.type = "button";
    panelEdge.title = "Drag to make the panel wider or narrower (double-click: back to its size)";
    panelEdge.setAttribute("aria-label", "Panel width (drag, or arrow keys)");
    panel.append(panelEdge);
    let panelSizing = null;
    panelEdge.addEventListener("pointerdown", e => {
        if (e.button > 0) return;
        e.preventDefault();
        e.stopPropagation();
        panelEdge.setPointerCapture(e.pointerId);
        panelSizing = { id: e.pointerId, x0: e.clientX, w: panel.offsetWidth };
        playerPage.classList.add("dock-sizing");
        panel.classList.add("sizing");
    });
    panelEdge.addEventListener("pointermove", e => {
        if (!panelSizing || panelSizing.id !== e.pointerId) return;
        // (its left edge: dragged left, it's wider)
        panelW = Math.round(Math.max(PANEL_MIN, Math.min(panelSizing.w - (e.clientX - panelSizing.x0), panelMax())));
        applyPanelW();
    });
    const endPanelSizing = e => {
        if (!panelSizing || panelSizing.id !== e.pointerId) return;
        panelSizing = null;
        playerPage.classList.remove("dock-sizing");
        panel.classList.remove("sizing");
        savePanelW();
    };
    panelEdge.addEventListener("pointerup", endPanelSizing);
    panelEdge.addEventListener("pointercancel", endPanelSizing);
    panelEdge.addEventListener("dblclick", () => {
        panelW = null;
        panelInMotion();
        applyPanelW();
        savePanelW();
    });
    panelEdge.addEventListener("keydown", e => {
        const step = { ArrowLeft: 10, ArrowRight: -10 }[e.key];
        if (!step) return;
        e.preventDefault();
        e.stopPropagation();
        panelW = Math.round(Math.max(PANEL_MIN, Math.min(panel.offsetWidth + step * (e.shiftKey ? 3 : 1), panelMax())));
        applyPanelW();
        savePanelW();
    });
    window.addEventListener("resize", applyPanelW);
    applyPanelW();

    // ---------- Swipes on a phone or tablet: left and right on the panel go to the next or previous
    // tab (Chat, Search, Queue, People, Settings); down closes it, like a bottom sheet, on a phone
    // held upright (from its tabs, or anywhere once what's under the finger is scrolled to the top);
    // up on the title bar under the video opens it again. Only once the finger has clearly picked
    // a direction, so taps, scrolling and typing work as before.
    const touchOnly = matchMedia("(pointer: coarse)");
    const SLOP = 10;
    // Something under the finger that scrolls that way itself, and isn't at its end yet
    const scrollsAlong = (target, root, axis, towardStart) => {
        for (let node = target; node && node !== root.parentNode; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (axis === "x") {
                if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
            } else if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
                if (towardStart ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
            }
        }
        return false;
    };
    const swipeIgnored = target => !!target.closest("input, textarea, select, [contenteditable], .room-sheet, .room-react-picker, .room-leave-popover");
    const visibleTabs = () => [...tabButtons].filter(button => !button.hidden).map(button => button.dataset.tab);
    const openSection = () => [...tabPanels].find(section => !section.hidden);

    let swipe = null;
    panel.addEventListener("touchstart", event => {
        swipe = null;
        if (!touchOnly.matches || event.touches.length !== 1 || panel.hidden || panelClosing || swipeIgnored(event.target)) return;
        const touch = event.touches[0];
        swipe = { x: touch.clientX, y: touch.clientY, at: performance.now(), axis: null, target: event.target, dx: 0, dy: 0 };
    }, { passive: true });

    panel.addEventListener("touchmove", event => {
        if (!swipe || event.touches.length !== 1) return;
        const touch = event.touches[0];
        const dx = touch.clientX - swipe.x;
        const dy = touch.clientY - swipe.y;
        if (!swipe.axis) {
            if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
            const sideways = Math.abs(dx) > Math.abs(dy) * 1.2;
            const down = !sideways && dy > 0 && playerPage.classList.contains("now-below");
            // Not ours: the page (or a list) scrolls as usual
            if ((!sideways && !down) || !event.cancelable ||
                (sideways && (visibleTabs().length < 2 || scrollsAlong(swipe.target, panel, "x"))) ||
                (down && scrollsAlong(swipe.target, panel, "y", true))) {
                swipe = null;
                return;
            }
            swipe.axis = sideways ? "x" : "y";
            swipe.section = openSection();
            // From here on, relative to where the finger was when it picked a direction
            swipe.x = touch.clientX;
            swipe.y = touch.clientY;
            swipe.at = performance.now();
            panel.classList.add("swiping");
        }
        event.preventDefault();
        swipe.dx = touch.clientX - swipe.x;
        swipe.dy = touch.clientY - swipe.y;
        if (swipe.axis === "y") {
            // The panel follows the finger down (a little resistance going up)
            const y = swipe.dy > 0 ? swipe.dy : swipe.dy / 4;
            panel.style.transform = `translateY(${y}px)`;
            panel.style.opacity = String(Math.max(0.35, 1 - Math.max(0, y) / (panel.offsetHeight * 1.4)));
        } else if (swipe.section) {
            // The tab follows the finger, held back at the first and last tab
            const tabs = visibleTabs();
            const index = tabs.indexOf(activeTab);
            const edge = (swipe.dx > 0 && index <= 0) || (swipe.dx < 0 && index >= tabs.length - 1);
            const x = edge ? swipe.dx / 4 : swipe.dx * 0.6;
            swipe.section.style.transform = `translateX(${x}px)`;
            swipe.section.style.opacity = String(Math.max(0.4, 1 - Math.abs(x) / 320));
        }
    }, { passive: false });

    const endSwipe = cancelled => {
        const done = swipe;
        swipe = null;
        if (!done || !done.axis) return;
        panel.classList.remove("swiping");
        const time = Math.max(1, performance.now() - done.at);
        if (done.axis === "y") {
            const fast = done.dy / time > 0.5 && done.dy > 30;
            const from = { transform: panel.style.transform || "none", opacity: panel.style.opacity || "1" };
            panel.style.transform = panel.style.opacity = "";
            if (!cancelled && (done.dy > Math.min(120, panel.offsetHeight * 0.25) || fast)) showPanel(false, from);
            else if (!calmer()) panel.animate([from, { transform: "none", opacity: 1 }], { duration: 220, easing: PANEL_EASE });
            return;
        }
        const section = done.section;
        if (!section) return;
        const from = { transform: section.style.transform || "none", opacity: section.style.opacity || "1" };
        section.style.transform = section.style.opacity = "";
        const tabs = visibleTabs();
        const index = tabs.indexOf(activeTab);
        const fast = Math.abs(done.dx) / time > 0.4 && Math.abs(done.dx) > 30;
        const next = cancelled || !(Math.abs(done.dx) > 70 || fast) ? -1 : index + (done.dx < 0 ? 1 : -1);
        if (next < 0 || next >= tabs.length) {
            if (!calmer()) section.animate([from, { transform: "none", opacity: 1 }], { duration: 200, easing: PANEL_EASE });
            return;
        }
        showTab(tabs[next]);
        // The new tab comes in from the side the finger went toward
        const incoming = openSection();
        if (incoming && !calmer()) incoming.animate([
            { transform: `translateX(${done.dx < 0 ? 40 : -40}px)`, opacity: 0 },
            { transform: "none", opacity: 1 }
        ], { duration: 240, easing: PANEL_EASE });
        // Its tab button in view (the row of tabs can be narrower than all of them)
        panel.querySelector(`.room-tab-btn[data-tab="${tabs[next]}"]`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };
    panel.addEventListener("touchend", () => endSwipe(false));
    panel.addEventListener("touchcancel", () => endSwipe(true));

    // Up on the title bar under the video (the panel closed): the room opens
    if (metaBox) {
        let lift = null;
        metaBox.addEventListener("touchstart", event => {
            lift = touchOnly.matches && room && event.touches.length === 1 && panel.hidden && !swipeIgnored(event.target) &&
                !event.target.closest(".room-yt-form") ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
        }, { passive: true });
        metaBox.addEventListener("touchmove", event => {
            if (!lift) return;
            const dx = event.touches[0].clientX - lift.x;
            const dy = event.touches[0].clientY - lift.y;
            if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
            // Upward and clearly so: open (anything else isn't ours)
            if (dy < -30 && Math.abs(dy) > Math.abs(dx) * 1.5) {
                lift = null;
                showPanel(true);
            } else if (dy > 0 || Math.abs(dx) > Math.abs(dy)) lift = null;
        }, { passive: true });
        metaBox.addEventListener("touchend", () => lift = null);
    }
    panel.querySelector('[data-copy="code"]').addEventListener("click", () => copy(Signaling.formatCode(room.code), "Room code"));
    panel.querySelector('[data-copy="password"]').addEventListener("click", () => copy(room.password, "Password"));
    copyLinkBtn.addEventListener("click", () => copy(inviteLink(), "Invite link"));
    linkPasswordBox.addEventListener("change", () => renderQr(inviteLink()));

    leaveBtn.addEventListener("click", e => {
        e.stopPropagation();
        toggleLeaveMenu();
    });

    if (leaveJustBtn) {
        leaveJustBtn.addEventListener("click", e => {
            e.stopPropagation();
            toggleLeaveMenu(false);
            leaveRoom(false, false, false);
        });
    }

    if (leaveEndBtn) {
        leaveEndBtn.addEventListener("click", e => {
            e.stopPropagation();
            toggleLeaveMenu(false);
            leaveRoom(false, false, true);
        });
    }

    document.addEventListener("click", e => {
        if (leavePopover && !leavePopover.hidden && leaveWrap && !leaveWrap.contains(e.target)) {
            toggleLeaveMenu(false);
        }
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && leavePopover && !leavePopover.hidden) {
            e.stopPropagation();
            toggleLeaveMenu(false);
        }
    });

    chatForm.addEventListener("submit", e => {
        e.preventDefault();
        const text = clean(chatInput.value, 500);
        if (!text || !room) return;
        const reply = replyTo ? replyTo.id : undefined;
        if (room.role === "host") shareChat(room.id, room.name, room.avatar, text, reply);
        else if (room.phase === "in") send(room.peer, { t: "chat", text, reply });
        else return;
        chatInput.value = "";
        cancelReply();
    });
    // Esc cancels a reply, then leaves the message box (and doesn't close anything else)
    chatInput.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        if (replyTo) cancelReply();
        else chatInput.blur();
    });

    // ---------- Your name and avatar, changeable at any time

    const profileName = field(profileSheet, "name");
    const profilePicker = avatarPicker(profileSheet.querySelector(".room-avatar-grid"), profileName, [profileSheet.querySelector(".room-profile-avatar")]);

    const openProfile = () => {
        if (!room) return;
        // (from a phone's call bar, with the room's panel closed: it opens, the editor is in it)
        if (panel.hidden) showPanel(true);
        profileName.value = room.name;
        profilePicker.value = room.avatar;
        profileSheet.hidden = false;
        profileName.focus();
    };
    const closeProfile = () => profileSheet.hidden = true;

    meBtn.addEventListener("click", openProfile);
    peopleList.addEventListener("click", e => e.target.closest("button[data-edit]") && openProfile());
    profileSheet.querySelector(".box-close").addEventListener("click", closeProfile);
    profileSheet.querySelector(".room-sheet-cancel").addEventListener("click", closeProfile);
    profileSheet.addEventListener("click", e => {
        if (e.target === profileSheet) closeProfile();
    });

    // Swiped down (a phone or tablet): the card follows the finger and, far or fast enough, slides
    // away and closes; otherwise it springs back. Only from the top of what it scrolls, and not
    // from the name field, so scrolling the avatars and typing work as before.
    const profileCard = profileSheet.querySelector(".room-sheet-card");
    let sheetSwipe = null;
    profileCard.addEventListener("touchstart", e => {
        sheetSwipe = e.touches.length === 1 && !e.target.closest("input") ? { y: e.touches[0].clientY, x: e.touches[0].clientX, at: performance.now(), on: false, dy: 0 } : null;
    }, { passive: true });
    profileCard.addEventListener("touchmove", e => {
        if (!sheetSwipe || e.touches.length !== 1) return;
        const dy = e.touches[0].clientY - sheetSwipe.y;
        const dx = e.touches[0].clientX - sheetSwipe.x;
        if (!sheetSwipe.on) {
            if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
            // Down, at the top of the card, and still ours to take: a swipe; anything else isn't
            if (dy <= 0 || Math.abs(dx) > dy || profileCard.scrollTop > 0 || !e.cancelable) {
                sheetSwipe = null;
                return;
            }
            sheetSwipe.on = true;
            sheetSwipe.y = e.touches[0].clientY;
            sheetSwipe.at = performance.now();
        }
        e.preventDefault();
        sheetSwipe.dy = Math.max(0, e.touches[0].clientY - sheetSwipe.y);
        profileCard.style.transform = `translateY(${sheetSwipe.dy}px)`;
        profileSheet.style.backgroundColor = `rgba(10, 10, 13, ${0.6 * Math.max(0.2, 1 - sheetSwipe.dy / profileCard.offsetHeight)})`;
    }, { passive: false });
    const endSheetSwipe = cancelled => {
        const done = sheetSwipe;
        sheetSwipe = null;
        if (!done || !done.on) return;
        const fast = done.dy / Math.max(1, performance.now() - done.at) > 0.5 && done.dy > 30;
        const from = profileCard.style.transform || "none";
        const reset = () => {
            profileCard.style.transform = "";
            profileSheet.style.backgroundColor = "";
        };
        if (cancelled || !(done.dy > Math.min(120, profileCard.offsetHeight * 0.3) || fast)) {
            reset();
            if (!calmer()) profileCard.animate([{ transform: from }, { transform: "none" }], { duration: 200, easing: PANEL_EASE });
            return;
        }
        if (calmer()) {
            reset();
            return closeProfile();
        }
        profileCard.animate([{ transform: from }, { transform: "translateY(calc(100% + 16px))" }], { duration: 200, easing: "cubic-bezier(0.4, 0, 1, 1)" }).onfinish = () => {
            reset();
            closeProfile();
        };
    };
    profileCard.addEventListener("touchend", () => endSheetSwipe(false));
    profileCard.addEventListener("touchcancel", () => endSheetSwipe(true));
    profileSheet.addEventListener("submit", e => {
        e.preventDefault();
        const name = clean(profileName.value, 30);
        if (!name || !room) return;
        const oldName = room.name;
        room.name = name;
        room.avatar = profilePicker.value;
        storage.set(NAME_KEY, name);
        storage.set(AVATAR_KEY, room.avatar);
        renderMe();
        closeProfile();
        if (room.role === "host") updateHostProfile(oldName);
        else send(room.peer, { t: "profile", name, avatar: room.avatar });
    });

    // ---------- WebRTC

    const newConnection = relay => {
        const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: relay && relayAvailable ? "relay" : "all" });
        return { pc, channel: pc.createDataChannel("room", { negotiated: true, id: 0 }), rate: {} };
    };

    // ---------- When the two networks don't allow a direct connection
    // Mobile data behind carrier-grade NAT, and strict campus, office or hostel firewalls, often let
    // neither side connect directly, and without a TURN server WebRTC then gives up. Both browsers
    // can still reach the relays that found the room, so the room's messages go through them
    // instead: sealed with the key only this guest and the host share (see Signaling.pairSecret),
    // numbered so they arrive in order and only once. It acts like a data channel. Chat, sync,
    // YouTube and own copies all work this way; only streaming a video needs a direct connection.
    const newTunnel = (signal, key, myId, theirId) => {
        const channel = { isTunnel: true, readyState: "connecting", onmessage: null, onclose: null, onopen: null };
        let sent = 0, next = 1, lastHeard = Date.now(), lastSent = 0, gapTimer = null;
        const early = new Map();
        let chain = Promise.resolve();
        const frame = body => {
            lastSent = Date.now();
            const n = ++sent;
            chain = chain.then(async () => {
                const d = await Signaling.sealText(key, JSON.stringify({ n, ...body }));
                await signal.send({ t: "tun", from: myId, to: theirId, d });
            }).catch(() => {});
            return chain;
        };
        const timer = setInterval(() => {
            if (channel.readyState !== "open") return;
            // Silence for this long means the other side has gone (closed the tab, lost its network)
            if (Date.now() - lastHeard > 35000) return shut(true);
            if (Date.now() - lastSent > 10000) frame({ k: 1 });
        }, 5000);
        const shut = notify => {
            if (channel.readyState === "closed") return;
            channel.readyState = "closed";
            clearInterval(timer);
            clearTimeout(gapTimer);
            if (notify && channel.onclose) channel.onclose();
        };
        const flush = () => {
            while (early.has(next)) {
                const body = early.get(next);
                early.delete(next++);
                if (typeof body.d === "string" && channel.readyState === "open" && channel.onmessage) channel.onmessage({ data: body.d });
            }
            clearTimeout(gapTimer);
            // A message lost on every relay: move on rather than wait forever
            if (early.size) gapTimer = setTimeout(() => {
                next = Math.min(...early.keys());
                flush();
            }, 3000);
        };
        channel.open = () => {
            if (channel.readyState !== "connecting") return;
            channel.readyState = "open";
            lastHeard = Date.now();
            if (channel.onopen) channel.onopen();
            flush();
        };
        channel.send = text => {
            if (channel.readyState === "open") frame({ d: text });
        };
        channel.close = () => shut(false);
        // A sealed message from the relays
        channel.deliver = async sealed => {
            if (channel.readyState === "closed") return;
            let body;
            try {
                body = JSON.parse(await Signaling.unsealText(key, sealed));
            } catch (e) {
                return;
            }
            const n = body && body.n;
            // Each number counts once, so a message replayed later is ignored
            if (!Number.isInteger(n) || n < next || early.has(n) || n > next + 2000) return;
            lastHeard = Date.now();
            early.set(n, body);
            if (channel.readyState === "open") flush();
        };
        return channel;
    };

    const attachRemoteVoice = (peer, track) => {
        const oldAudio = remoteVoiceAudio.get(peer);
        if (oldAudio) oldAudio.remove();
        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = new MediaStream([track]);
        remoteVoiceAudio.set(peer, audio);
        audio.play().catch(() => {});
    };

    // Collects every network address before sending connection details, so one message is enough
    const gathered = pc => new Promise(resolve => {
        if (pc.iceGatheringState === "complete") return resolve();
        const done = () => {
            clearTimeout(timer);
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
        };
        const check = () => pc.iceGatheringState === "complete" && done();
        const timer = setTimeout(done, 4000);
        pc.addEventListener("icegatheringstatechange", check);
    });

    // Movie sound: stereo at a music bitrate instead of WebRTC's voice defaults
    const tuneAudio = sdp => {
        const opus = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
        if (!opus) return sdp;
        return sdp.replace(new RegExp(`a=fmtp:${opus[1]} (.*)`), (line, params) => {
            const extra = ["stereo=1", "sprop-stereo=1", "maxaveragebitrate=256000"]
                .filter(param => !params.includes(param.split("=")[0] + "="));
            return extra.length ? `${line};${extra.join(";")}` : line;
        });
    };

    const isPrivate = address => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc|fd|fe80)/i.test(address) || address.endsWith(".local");

    // From the connection's statistics: "lan" (same network), "direct" (over the internet) or "relay"
    const routeOf = async pc => {
        try {
            const stats = await pc.getStats();
            let pair = null;
            stats.forEach(report => {
                if (report.type === "transport" && report.selectedCandidatePairId) pair = stats.get(report.selectedCandidatePairId);
            });
            if (!pair) stats.forEach(report => {
                if (report.type === "candidate-pair" && report.nominated && report.state === "succeeded") pair = report;
            });
            const local = pair && stats.get(pair.localCandidateId);
            const remote = pair && stats.get(pair.remoteCandidateId);
            if (!local || !remote) return null;
            if (local.candidateType === "relay" || remote.candidateType === "relay") return "relay";
            const nearby = candidate => candidate.candidateType === "host" || (candidate.candidateType === "prflx" && isPrivate(candidate.address || ""));
            return nearby(local) && nearby(remote) ? "lan" : "direct";
        } catch (e) {
            return null;
        }
    };

    // Checks now and then, since a connection can switch to a better route
    const watchRoute = (peer, onRoute) => {
        const check = async () => {
            const route = await routeOf(peer.pc);
            if (route && route !== peer.route) {
                peer.route = route;
                onRoute(route);
            }
        };
        peer.routeTimer = setInterval(check, 15000);
        setTimeout(check, 1500);
    };

    const closePeer = peer => {
        if (!peer) return;
        clearInterval(peer.routeTimer);
        clearTimeout(peer.timer);
        clearTimeout(peer.lostTimer);
        try {
            if (peer.pc) peer.pc.close();
            else if (peer.channel) peer.channel.close();
        } catch (e) {}
        const audio = remoteVoiceAudio.get(peer);
        if (audio) {
            audio.srcObject = null;
            audio.remove();
            remoteVoiceAudio.delete(peer);
        }
    };

    const renderMic = () => {
        micButtons.forEach(button => {
            button.classList.toggle("active", micEnabled);
            button.setAttribute("aria-pressed", String(micEnabled));
            button.title = micEnabled ? "Turn microphone off" : "Turn microphone on";
            button.setAttribute("aria-label", micEnabled ? "Microphone on" : "Microphone off");
            button.querySelector("i").className = `fa-solid ${micEnabled ? "fa-microphone" : "fa-microphone-slash"}`;
            const label = button.querySelector("span");
            if (label) label.textContent = micEnabled ? "Mic on" : "Mic off";
        });
        if (syncHoverControls) syncHoverControls();
    };

    const syncMicrophonePeer = peer => {
        if (!peer?.voiceSender) return;
        const track = micEnabled && micStream ? micStream.getAudioTracks()[0] : null;
        peer.voiceSender.replaceTrack(track).catch(() => {});
    };

    const syncMicrophone = () => {
        if (!room) return;
        if (room.role === "host") room.peers.forEach(syncMicrophonePeer);
        else syncMicrophonePeer(room.peer);
        reportMicrophone();
    };

    // Whether each mic is on, for everyone's call window: a guest tells the host, and the host
    // tells everyone (with the people in the room)
    const reportMicrophone = () => {
        if (!room) return;
        if (room.role === "host") return room.peers.size ? shareMembers() : renderCameras();
        const peer = room.peer;
        if (peer && peer.micSaid !== micEnabled && room.phase === "in") {
            peer.micSaid = micEnabled;
            send(peer, { t: "mic", on: micEnabled });
        }
        renderCameras();
    };

    // ---------- The mic while the page isn't on screen
    // Switching to another app keeps the mic on: people can still hear you, and the browser shows
    // that it's in use. Locking the phone turns it off. A web page can't tell those two apart
    // except through Idle Detection (Chrome and Edge), which reports a locked screen; on a phone or
    // tablet it asks for that permission once, together with the mic.
    let lockWatch = null;
    let micOffByLock = false;
    const watchScreenLock = async () => {
        if (lockWatch || !("IdleDetector" in window)) return;
        lockWatch = "starting";
        try {
            let state = "prompt";
            try {
                state = (await navigator.permissions.query({ name: "idle-detection" })).state;
            } catch (e) {}
            // Asked only where a locked phone is likely; computers use it if it was already allowed
            if (state === "prompt" && matchMedia("(pointer: coarse)").matches) state = await IdleDetector.requestPermission();
            if (state !== "granted") {
                lockWatch = null;
                return;
            }
            const detector = new IdleDetector();
            detector.addEventListener("change", () => {
                if (detector.screenState !== "locked" || !micEnabled) return;
                micOffByLock = true;
                disableMicrophone();
            });
            await detector.start({ threshold: 60000 });
            lockWatch = detector;
        } catch (e) {
            lockWatch = null;
        }
    };
    // Back on the phone after it was locked: say why the mic is off
    document.addEventListener("visibilitychange", () => {
        if (document.hidden || !micOffByLock) return;
        micOffByLock = false;
        if (room) toast("Your mic was turned off when the phone locked. Tap Mic to turn it on again.");
    });

    const enableMicrophone = async () => {
        if (micBusy || micEnabled || !room) return;
        micBusy = true;
        micButtons.forEach(button => button.disabled = true);
        // Straight from the click: asking for a permission needs one
        watchScreenLock();
        try {
            // Noise suppression is off: on phones and laptop mics it often cuts quiet or distant
            // speech, so people couldn't be heard. Echo cancellation stays on, or the movie's sound
            // from the speakers would go back to everyone through the mic.
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 }
            });
            micStream.getAudioTracks().forEach(track => {
                track.contentHint = "speech";
                // The browser or the phone took the mic away (some do while another app is open)
                track.addEventListener("ended", () => micStream && micStream.getAudioTracks()[0] === track && disableMicrophone());
            });
            micEnabled = true;
            renderMic();
            syncMicrophone();
            toast("Microphone on");
        } catch (e) {
            toast(e.name === "NotAllowedError" ? "Microphone permission was denied" : "Couldn't access the microphone");
        } finally {
            micBusy = false;
            micButtons.forEach(button => button.disabled = false);
        }
    };

    const disableMicrophone = () => {
        if (!micEnabled) return;
        micEnabled = false;
        syncMicrophone();
        micStream?.getTracks().forEach(track => track.stop());
        micStream = null;
        renderMic();
        toast("Microphone off");
    };

    const toggleMicrophone = () => micEnabled ? disableMicrophone() : enableMicrophone();
    micBtn.addEventListener("click", toggleMicrophone);
    renderMic();

    // ---------- Cameras, like a meeting: everyone whose camera is on is seen by everyone, in the
    // call window (below). Guests are connected to the host only, so the host's browser passes
    // each guest's camera on to the others (up to CAM_SLOTS other guests for each guest, besides
    // the host's own). Each guest's connection has those video channels from the start (they cost
    // nothing until used), after its own camera's and before the shared video's, so a host on an
    // older CineTab still finds the shared video where it expects it. Cameras are small and at a
    // modest rate, so they never get in the way of the movie. Through the relays (no direct
    // connection), there's no video at all, cameras included.
    const CAM_SLOTS = 3;
    const CAM_BITRATE = 250000;
    let camStream = null;
    let camEnabled = false;
    let camBusy = false;
    // Which camera: "user" (front) or "environment" (back, on a phone); and how many the device
    // has, once the browser says (after the camera's permission)
    let camFacing = "user";
    let camCount = 0;
    const cameraConstraints = facing => ({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 24 }, facingMode: facing }
    });
    // On screen, by who: { el, video, label, track }
    const camTiles = new Map();
    const camTrack = () => camEnabled && camStream ? camStream.getVideoTracks()[0] || null : null;

    // VP8 for the camera channels, or null where a browser can't limit a channel's codecs
    const cameraCodecList = () => {
        try {
            if (!("setCodecPreferences" in RTCRtpTransceiver.prototype)) return null;
            const codecs = RTCRtpReceiver.getCapabilities("video").codecs.filter(codec => /^video\/(vp8|rtx)$/i.test(codec.mimeType));
            return codecs.some(codec => /vp8/i.test(codec.mimeType)) ? codecs : null;
        } catch (e) {
            return null;
        }
    };

    // `track` (or nothing) on `sender`, at a camera's rate
    const sendCamera = (sender, track) => {
        if (!sender || sender.track === track) return;
        sender.replaceTrack(track).then(() => {
            if (!track) return;
            const params = sender.getParameters();
            if (!params.encodings || !params.encodings.length) return;
            params.encodings.forEach(encoding => {
                encoding.maxBitrate = CAM_BITRATE;
                encoding.maxFramerate = 15;
            });
            return sender.setParameters(params);
        }).catch(() => {});
    };

    // ---------- The call window: everyone in the room, like a video call, in a small window over
    // the player that can be dragged anywhere (computer or phone; fullscreen too). Each person is
    // their camera, or their avatar while it's off, with their name and whether their mic is on.
    // Its title bar is just how many are in the room, your mic and camera, and its buttons.
    // At first it fits everyone: one under another on a computer or a phone held sideways, side by
    // side on a phone held upright. With a mouse, any edge or corner resizes it to any shape (like
    // a computer's window; double-click its title bar for the size that fits everyone again); on a
    // touch screen, two fingers. The pictures share the window, as many across as makes them
    // largest for its shape. It can fold up to its title bar. Where it was left, folded and its
    // size are remembered (where as a share of the screen; the size for sideways and upright).
    // It can also be docked as a panel instead of floating over the picture: a column on the left
    // of the video (computers, phones held sideways), everyone one under another and scrolling up
    // and down; or, on a phone held upright, a strip under the video's details (or the room's
    // chat), just above the call bar, everyone side by side and scrolling across.
    // On a phone, the call bar (you, mic, camera, leave) and the call window are one: in a room it's
    // always there, docked by default: at the bottom of the screen held upright, the bar with
    // everyone's video in a row above it; on the left held sideways, everyone one under another
    // with the bar's buttons below them (the room's panel then has no bar of its own). Folded up,
    // it's just the bar (sideways, a slim column of its buttons). Floating, the whole of it moves.
    // Computers get a Leave button in the call window's title bar.
    const CALL_KEY = "cinetab:call";
    // `sizes`: the size (px) it was resized to, { landscape, portrait } (none: fits everyone)
    // `docked`: chosen to be a panel; `dock`: how it's docked now ("side", "strip", or null while
    // floating; a phone held upright in fullscreen, with the room's panel closed, floats it);
    // `dockW`: the docked column's width (px) dragged to by its long edge (none: its own)
    // `unitFloat`: on a phone, floating instead of docked
    // Computers: `docked` false floats it; docked, `dockPos` is where - "bottom" (the dock over the
    // bottom of the video, the usual) or "side" (pinned left of the video; with the room's panel
    // open, the videos go above the panel and the buttons below the video: "rail")
    const call = { x: 0, y: 0, pos: null, collapsed: false, drag: null, tiles: new Map(), sizes: {}, touches: new Map(), pinch: null, sizing: null, docked: true, dock: null, dockPos: "bottom", dockable: true, dockW: null, unitFloat: false };
    try {
        const saved = JSON.parse(storage.get(CALL_KEY) || "null");
        if (saved && typeof saved === "object") {
            if (finite(saved.x, 0, 1) && finite(saved.y, 0, 1)) call.pos = { x: saved.x, y: saved.y };
            call.collapsed = saved.collapsed === true;
            call.unitFloat = saved.unitFloat === true;
            // (from before the dock: it starts in the dock once)
            if (saved.v === 2) {
                call.docked = saved.docked !== false;
                if (["bottom", "side"].includes(saved.dockPos)) call.dockPos = saved.dockPos;
                // (pinned above the video, which is gone: pinned left)
                else if (saved.dockPos === "top") call.dockPos = "side";
            }
            if (finite(saved.dockW, 100, 2000)) call.dockW = saved.dockW;
            if (saved.sizes && typeof saved.sizes === "object") ["landscape", "portrait"].forEach(key => {
                const size = saved.sizes[key];
                if (size && finite(size.w, 60, 6000) && finite(size.h, 60, 6000)) call.sizes[key] = { w: size.w, h: size.h };
            });
        }
    } catch (e) {}
    const saveCall = () => storage.set(CALL_KEY, JSON.stringify({ v: 2, ...(call.pos || {}), collapsed: call.collapsed, docked: call.docked, dockPos: call.dockPos, unitFloat: call.unitFloat, sizes: call.sizes, ...(call.dockW ? { dockW: call.dockW } : {}) }));

    const callWin = el("section", "room-call");
    callWin.hidden = true;
    callWin.setAttribute("aria-label", "People in the room");
    const callBar = el("div", "room-call-bar");
    // How many are in the room: a number
    const callTitle = el("span", "room-call-title");
    const callCount = el("b");
    callTitle.append(el("i", "fa-solid fa-user-group"), callCount);
    const callButton = (className, label) => {
        const button = el("button", `room-call-btn ${className}`);
        button.type = "button";
        button.title = label;
        button.setAttribute("aria-label", label);
        button.append(el("i"));
        return button;
    };
    // Computers (Chrome, Edge): picture in picture, the video and everyone in a small window on
    // top of everything (script.js)
    const callPipBtn = callButton("room-call-pip", "Picture in picture: the video and everyone, in a small window on top");
    callPipBtn.firstChild.className = "fa-solid fa-clone";
    callPipBtn.hidden = !("documentPictureInPicture" in window) || isTouch;
    callPipBtn.addEventListener("click", () => together.pip && together.pip());
    const callFoldBtn = callButton("room-call-fold", "Minimize");
    callFoldBtn.firstChild.className = "fa-solid fa-minus";
    // Computers: one Layout button for where the call goes - a window floating over the video, a
    // column pinned at the side (phones have their own call bar: below)
    const CALL_LAYOUTS = [
        { mode: "bottom", icon: "fa-arrows-down-to-line", text: "Dock on the video" },
        { mode: "side", icon: "fa-table-columns", text: "Pin to the side" },
        { mode: "float", icon: "fa-window-restore", text: "Floating window" }
    ];
    const callLayoutBtn = callButton("room-call-layout", "Call layout");
    callLayoutBtn.setAttribute("aria-haspopup", "menu");
    callLayoutBtn.setAttribute("aria-expanded", "false");
    const callLayoutMenu = el("div", "room-call-menu room-call-layout-menu");
    callLayoutMenu.hidden = true;
    callLayoutMenu.setAttribute("role", "menu");
    callLayoutMenu.setAttribute("aria-label", "Call layout");
    const layoutOptions = CALL_LAYOUTS.map(layout => {
        const button = el("button", "room-call-menu-opt");
        button.type = "button";
        button.dataset.mode = layout.mode;
        button.setAttribute("role", "menuitemradio");
        button.append(el("i", `fa-solid ${layout.icon}`), el("span", null, layout.text), el("i", "fa-solid fa-check room-call-menu-check"));
        callLayoutMenu.append(button);
        return button;
    });
    const callLayout = () => call.docked ? call.dockPos : "float";
    // (a computer's floating window: its pill of buttons stays while one of its menus is open)
    const keepPill = () => {
        if (callWin.classList.contains("unit")) return;
        callWin.classList.toggle("bar-open", !callLayoutMenu.hidden || !callLeaveMenu.hidden);
    };
    // (below the button; above it when there's no room below)
    const showCallLayout = open => {
        callLayoutMenu.hidden = !open;
        callLayoutBtn.setAttribute("aria-expanded", String(open));
        // (the dock, or the floating window's pill, stays up while it's open)
        setTimeout(() => placeBottomDock());
        keepPill();
        if (!open) return;
        callLayoutMenu.classList.remove("up");
        const box = callLayoutBtn.getBoundingClientRect();
        const page = playerPage.getBoundingClientRect();
        callLayoutMenu.classList.toggle("up", box.bottom + 8 + callLayoutMenu.offsetHeight > page.bottom - 4 && box.top - 8 - callLayoutMenu.offsetHeight >= page.top);
    };
    const setCallLayout = mode => {
        if (mode === "float") call.docked = false;
        else {
            call.docked = true;
            call.dockPos = mode;
            call.collapsed = false;
        }
        saveCall();
        placeDock(true);
    };
    callLayoutBtn.addEventListener("click", e => {
        e.stopPropagation();
        showCallLeave(false);
        showCallLayout(callLayoutMenu.hidden);
    });
    layoutOptions.forEach(option => option.addEventListener("click", e => {
        e.stopPropagation();
        showCallLayout(false);
        if (option.dataset.mode !== callLayout()) setCallLayout(option.dataset.mode);
    }));
    document.addEventListener("click", e => !callLayoutMenu.hidden && !callLayoutMenu.contains(e.target) && showCallLayout(false));
    document.addEventListener("keydown", e => e.key === "Escape" && !callLayoutMenu.hidden && showCallLayout(false));
    // Folded up: a camera with a live dot in front of the number, so the small pill stands out
    const callLive = el("span", "room-call-live");
    callLive.setAttribute("aria-hidden", "true");
    callLive.append(el("i", "fa-solid fa-video"));
    // Your mic, camera, and camera switching controls
    const callMicBtn = callButton("room-call-media room-call-mic-btn", "Turn microphone on");
    const callCamBtn = callButton("room-call-media room-call-cam-btn", "Turn camera on");
    const callFlipBtn = callButton("room-call-media room-call-flip-btn", "Switch camera (front / back)");
    callFlipBtn.firstChild.className = "fa-solid fa-camera-rotate";
    callFlipBtn.hidden = true;
    callFlipBtn.addEventListener("click", () => flipCamera());
    if (flipBtn) flipBtn.addEventListener("click", () => flipCamera());
    callMicBtn.addEventListener("click", toggleMicrophone);
    micButtons.push(callMicBtn);
    camButtons.push(callCamBtn);
    renderMic();
    const callControls = el("div", "room-call-controls");
    callControls.append(callMicBtn, callCamBtn, callFlipBtn);
    // Leave: just leave, or end the room (the call bar's own choices)
    const callLeaveBtn = callButton("room-call-leave", "Leave or end the room");
    callLeaveBtn.firstChild.className = "fa-solid fa-phone-slash";
    callLeaveBtn.setAttribute("aria-haspopup", "true");
    callLeaveBtn.setAttribute("aria-expanded", "false");
    const callLeaveMenu = el("div", "room-call-leave-menu");
    callLeaveMenu.hidden = true;
    const showCallLeave = open => {
        callLeaveMenu.hidden = !open;
        callLeaveBtn.setAttribute("aria-expanded", String(open));
        setTimeout(() => placeBottomDock());
        keepPill();
    };
    const callLeaveOption = (className, icon, text, target) => {
        const button = el("button", `room-leave-opt ${className}`);
        button.type = "button";
        button.append(el("i", `fa-solid ${icon}`), el("span", null, text));
        button.addEventListener("click", e => {
            e.stopPropagation();
            showCallLeave(false);
            target.click();
        });
        return button;
    };
    callLeaveMenu.append(callLeaveOption("leave-just", "fa-right-from-bracket", "Just leave", leaveJustBtn),
        callLeaveOption("leave-end", "fa-door-closed", "End room", leaveEndBtn));
    callLeaveBtn.addEventListener("click", e => {
        e.stopPropagation();
        showCallLayout(false);
        showCallLeave(callLeaveMenu.hidden);
    });
    document.addEventListener("click", e => !callLeaveMenu.hidden && !callLeaveMenu.contains(e.target) && showCallLeave(false));
    document.addEventListener("keydown", e => e.key === "Escape" && !callLeaveMenu.hidden && showCallLeave(false));
    // The title bar (computers): how many, your mic and camera; then the window's own buttons
    // Chat (and the room's panel): opens it on Chat, or closes it; unread messages and people
    // waiting show on it while it's closed
    const callChatBtn = callButton("room-call-chat", "Chat and the room (R)");
    callChatBtn.firstChild.className = "fa-solid fa-message";
    callChatBadge = el("b", "room-call-badge");
    callChatBadge.hidden = true;
    callChatBtn.append(callChatBadge);
    callChatBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (panel.hidden || panelClosing) {
            showTab(chatUnread || !waitingCount() ? "chat" : "people");
            showPanel(true);
        } else showPanel(false);
    });
    const callWinBtns = el("div", "room-call-winbtns");
    callWinBtns.append(callChatBtn, callPipBtn, callLayoutBtn, callFoldBtn, callLeaveBtn);
    callBar.append(callLive, callTitle, callControls, callWinBtns);
    callWin.classList.toggle("has-pip", !callPipBtn.hidden);

    // On a phone, in the call bar: everyone's video shown or folded away (with how many are in
    // the room), and docked or floating
    const unitPeopleBtn = el("button", "room-unit-only room-unit-people");
    unitPeopleBtn.type = "button";
    const unitCount = el("b", null, "1");
    const unitChevron = el("i", "fa-solid fa-chevron-down room-unit-chevron");
    unitPeopleBtn.append(el("i", "fa-solid fa-user-group"), unitCount, unitChevron);
    const unitFloatBtn = el("button", "room-unit-only room-mic-btn room-unit-float");
    unitFloatBtn.type = "button";
    unitFloatBtn.append(el("i"));
    roomFoot.insertBefore(unitPeopleBtn, leaveWrap);
    roomFoot.insertBefore(unitFloatBtn, leaveWrap);
    // (also a computer's window made as narrow as a phone: the phone's call window)
    const phoneUpright = matchMedia("(pointer: coarse) and (orientation: portrait) and (max-width: 900px), (orientation: portrait) and (max-width: 600px)");
    const phoneSideways = matchMedia("(pointer: coarse) and (orientation: landscape) and (max-height: 500px)");
    const unitMode = () => !!room && (phoneUpright.matches || phoneSideways.matches);
    footInCall = () => unitMode() ? callWin : null;

    // A phone's floating call window: how many at the top, with ⋮ for its options (pin it to the
    // side or the bottom, minimize it, or show everyone again); just mic, camera and end call below
    const callMoreBtn = callButton("room-call-more", "More: pin it, or minimize it");
    callMoreBtn.firstChild.className = "fa-solid fa-ellipsis-vertical";
    callMoreBtn.setAttribute("aria-haspopup", "true");
    callMoreBtn.setAttribute("aria-expanded", "false");
    const callMoreMenu = el("div", "room-call-more-menu");
    callMoreMenu.hidden = true;
    callMoreMenu.setAttribute("role", "menu");
    const moreOption = className => {
        const button = el("button", `room-call-more-opt ${className}`);
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.append(el("i"), el("span"));
        return button;
    };
    const morePin = moreOption("pin");
    const moreFold = moreOption("fold");
    callMoreMenu.append(morePin, moreFold);
    const showCallMore = open => {
        callMoreMenu.hidden = !open;
        callMoreBtn.setAttribute("aria-expanded", String(open));
        // (downwards from its top, or below the minimized pill; upwards only when there's no room
        // below and there is above)
        if (open) {
            callMoreMenu.classList.remove("up");
            const box = callWin.getBoundingClientRect();
            const page = playerPage.getBoundingClientRect();
            const tall = callMoreMenu.offsetHeight;
            const bottom = (call.collapsed ? box.bottom + 6 : box.top + 38) + tall;
            callMoreMenu.classList.toggle("up", bottom > page.bottom - 4 && box.top - 6 - tall >= page.top);
        }
    };
    callMoreBtn.addEventListener("click", e => {
        e.stopPropagation();
        showCallMore(callMoreMenu.hidden);
    });
    morePin.addEventListener("click", e => {
        e.stopPropagation();
        showCallMore(false);
        unitFloatBtn.click();
    });
    moreFold.addEventListener("click", e => {
        e.stopPropagation();
        showCallMore(false);
        callFoldBtn.click();
    });
    document.addEventListener("click", e => !callMoreMenu.hidden && !callMoreMenu.contains(e.target) && showCallMore(false));
    document.addEventListener("keydown", e => e.key === "Escape" && !callMoreMenu.hidden && showCallMore(false));
    callBar.append(callMoreBtn);
    const callGrid = el("div", "room-call-grid");
    // With a mouse: every edge and corner resizes it; the bottom right corner shows a grip (and
    // takes the arrow keys, once it has focus). On a touch screen, two fingers do it (below).
    const callEdges = ["n", "s", "e", "w", "ne", "nw", "sw"].map(edge => {
        const handle = el("span", `room-call-edge ${edge}`);
        handle.dataset.edge = edge;
        handle.setAttribute("aria-hidden", "true");
        return handle;
    });
    const callResize = el("button", "room-call-resize room-call-edge se");
    callResize.type = "button";
    callResize.dataset.edge = "se";
    callResize.title = "Drag to resize";
    callResize.setAttribute("aria-label", "Resize (drag, or arrow keys)");
    // Docked beside the video (with a mouse): its long right edge, dragged to make it wider or
    // narrower (arrow keys too, once it has focus; a double-click goes back to the set width)
    const callDockEdge = el("button", "room-call-dock-edge");
    callDockEdge.type = "button";
    callDockEdge.title = "Drag to make the panel wider or narrower (double-click: back to its size)";
    callDockEdge.setAttribute("aria-label", "Panel width (drag, or arrow keys)");
    // (its menus open from its buttons: computers' Layout and Leave menus beside them)
    callWinBtns.append(callLayoutMenu, callLeaveMenu);
    callWin.append(callBar, callGrid, ...callEdges, callResize, callDockEdge, callMoreMenu);
    playerPage.append(callWin);

    // ---------- Its size, and the pictures inside it
    const CALL_GAP = 6;
    const CALL_PAD = 6;
    // (with the picture in picture button, one more in the title bar); on a phone, the call bar's
    // width, upright
    const CALL_MIN_W = 140;
    // (a phone's floating one: its three buttons below everyone)
    // (a phone's: as wide as its call bar, so none of its buttons are cut off)
    const footWidth = () => {
        if (roomFoot.parentNode !== callWin) return 0;
        const style = getComputedStyle(roomFoot);
        const shown = [...roomFoot.children].filter(child => child.getClientRects().length);
        return shown.reduce((sum, child) => {
            const own = getComputedStyle(child);
            return sum + child.offsetWidth + parseFloat(own.marginLeft) + parseFloat(own.marginRight);
        }, parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + Math.max(0, shown.length - 1) * (parseFloat(style.columnGap) || 0)) + 2;
    };
    // The smallest it can be resized to: everyone's video stays big enough to see, and the buttons
    // on your own video inside it. (Floating with everyone's video - "mini" - its buttons are a pill
    // outside it; otherwise as wide as its bar.)
    const callMinW = () => {
        const mini = callWin.classList.contains("mini");
        if (!callWin.classList.contains("unit")) return mini ? 160 : CALL_MIN_W;
        return mini ? 112 : Math.max(150, Math.ceil(footWidth()));
    };
    const CALL_MIN_H = 88;
    const callMinH = () => !callWin.classList.contains("mini") ? CALL_MIN_H : callWin.classList.contains("unit") ? 100 : 120;
    // (pinned left: wide enough for its buttons on two rows)
    const DOCK_MIN_W = 180;
    const dockMaxW = () => Math.max(DOCK_MIN_W, Math.min(560, playerPage.getBoundingClientRect().width * 0.45));
    const within = (value, min, max) => Math.max(min, Math.min(value, max));
    const callOrient = page => page.width >= page.height ? "landscape" : "portrait";
    // Around the pictures: its sides and bottom, its border, and the title bar (on a phone, the
    // call bar below them) - as it is now, while the pictures show
    const callChrome = () => {
        // (just the videos: its padding and border; the buttons are a pill outside it)
        if (callWin.classList.contains("mini")) return { x: 10, y: 10 };
        if (!callWin.hidden && callGrid.offsetHeight && callGrid.offsetWidth) {
            return { x: callWin.offsetWidth - callGrid.offsetWidth, y: callWin.offsetHeight - callGrid.offsetHeight };
        }
        return callWin.classList.contains("unit") ? { x: 18, y: (roomFoot.offsetHeight || 56) + 10 }
            : { x: CALL_PAD * 2 + 2, y: (callBar.offsetHeight || 30) + CALL_PAD + 2 };
    };
    // The shape of everyone's cameras (width / height): a phone's upright is tall, a laptop's wide.
    // From the videos themselves (each tile learns its own), 4:3 until one says.
    const callRatio = () => {
        const ratios = [...call.tiles.values()].filter(tile => tile.ratio && tile.el.classList.contains("camera")).map(tile => tile.ratio);
        return ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : 4 / 3;
    };
    // The size that fits everyone: one under another when the screen is wider than tall (a
    // computer, a phone held sideways), side by side when it's taller (a phone held upright). Each
    // picture in its camera's shape, about as large as a 4:3 one would be.
    const fittingCallSize = (page, count, landscape) => {
        const base = !isTouch && !callWin.classList.contains("unit") ? 232 : landscape ? Math.min(150, page.width * 0.2) : Math.min(112, (page.width - 48) / 3);
        const ratio = callRatio();
        const tall = Math.sqrt(base * base * 3 / 4 / ratio);
        const tile = tall * ratio;
        const chrome = callChrome();
        return landscape
            ? { w: tile + chrome.x, h: count * tall + (count - 1) * CALL_GAP + chrome.y }
            : { w: count * tile + (count - 1) * CALL_GAP + chrome.x, h: tall + chrome.y };
    };
    // How many across: whatever makes everyone's picture largest (in their cameras' shape) here
    const fitCall = (count, width, height) => {
        const ratio = callRatio();
        let best = { cols: 1, rows: count, size: -1 };
        for (let cols = 1; cols <= count; cols++) {
            const rows = Math.ceil(count / cols);
            const across = (width - (cols - 1) * CALL_GAP) / cols;
            const down = (height - (rows - 1) * CALL_GAP) / rows;
            const size = Math.min(across, down * ratio);
            if (size > best.size + 0.5) best = { cols, rows, size };
        }
        return best;
    };
    // Floating: its size (the one it was given, within the screen) and the grid of pictures;
    // folded up or docked, the page's styles size it
    const layoutCall = () => {
        if (callWin.hidden || call.dock || call.collapsed || callWin.classList.contains("no-people")) {
            ["width", "height", "--tile", "--cols", "--rows"].forEach(name => callWin.style.removeProperty(name));
            // Docked beside the video: the width its edge was dragged to, within what leaves the
            // video room
            const side = call.dock === "side";
            const width = side && call.dockW ? Math.round(within(call.dockW, DOCK_MIN_W, dockMaxW())) : 0;
            if (width) callWin.style.setProperty("--dock-w", `${width}px`);
            else callWin.style.removeProperty("--dock-w");
            callWin.classList.toggle("big", width >= 250);
            return;
        }
        const page = playerPage.getBoundingClientRect();
        if (!page.width || !page.height) return;
        const count = Math.max(1, callGrid.children.length);
        const orient = callOrient(page);
        const size = call.sizes[orient] || fittingCallSize(page, count, orient === "landscape");
        const minW = callMinW();
        const width = Math.round(within(size.w, minW, Math.max(minW, page.width - 16)));
        const height = Math.round(within(size.h, callMinH(), Math.max(callMinH(), page.height - 16)));
        callWin.style.width = `${width}px`;
        callWin.style.height = `${height}px`;
        const chrome = callChrome();
        const fit = fitCall(count, width - chrome.x, height - chrome.y);
        callWin.style.setProperty("--cols", fit.cols);
        callWin.style.setProperty("--rows", fit.rows);
        callWin.style.setProperty("--tile", `${Math.max(40, Math.round(fit.size))}px`);
        // Large pictures always show names
        callWin.classList.toggle("big", fit.size >= 150);
    };

    // ---------- The dock (computers): centred over the bottom of the video. While the player's
    // controls show (or it's pointed at, or one of its menus is open) it sits just above them;
    // when they hide, so do its buttons - and with nobody's camera on, the whole dock - leaving
    // only everyone's video, low on the picture. Placed by the page's styles from these numbers,
    // so it moves (and grows upwards) on the compositor, without work here every frame.
    const dockAwake = () => container.classList.contains("show-controls") || callWin.matches(":hover")
        || !!callWin.querySelector(":focus-visible") || !callLayoutMenu.hidden || !callLeaveMenu.hidden;
    const placeBottomDock = () => {
        if (callWin.hidden || call.dock !== "bottom") return;
        const page = playerPage.getBoundingClientRect();
        const picture = container.getBoundingClientRect();
        if (!picture.width || !page.width) return;
        const awake = dockAwake();
        const controls = container.querySelector(".wrapper");
        const style = callWin.style;
        callWin.classList.toggle("asleep", !awake);
        style.setProperty("--dock-cx", `${Math.round(picture.left - page.left + picture.width / 2)}px`);
        style.setProperty("--dock-b", `${Math.round(page.bottom - picture.bottom + 14)}px`);
        style.setProperty("--dock-lift", `${awake && controls ? controls.offsetHeight : 0}px`);
        style.setProperty("--dock-maxw", `${Math.max(260, Math.round(picture.width - 28))}px`);
        style.setProperty("--dock-tile-h", `${Math.round(within(picture.height * 0.19, 72, 150))}px`);
    };
    new MutationObserver(placeBottomDock).observe(container, { attributes: true, attributeFilter: ["class"] });
    if ("ResizeObserver" in window) new ResizeObserver(() => placeBottomDock()).observe(container);
    ["pointerenter", "pointerleave", "focusin", "focusout"].forEach(type => callWin.addEventListener(type, () => setTimeout(placeBottomDock)));
    // Pointed at, it keeps the player's controls up too (so it doesn't drop below them)
    callWin.addEventListener("pointermove", e => {
        if (call.dock === "bottom" && e.pointerType !== "touch") container.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse" }));
    });

    // Where it is: where it was left (as a share of the room it has to move in), or at first the
    // top right of the picture, below its title bar
    const placeCall = () => {
        if (call.dock === "bottom") return placeBottomDock();
        // (while it's pinched or resized, it stays where the gesture holds it; placed again after;
        // docked, the page's layout places it)
        if (callWin.hidden || call.pinch || call.sizing || call.dock) return;
        const page = playerPage.getBoundingClientRect();
        const width = callWin.offsetWidth;
        const height = callWin.offsetHeight;
        const margin = 8;
        let x, y;
        if (call.pos) {
            x = call.pos.x * (page.width - width);
            y = call.pos.y * (page.height - height);
        } else if (callWin.classList.contains("mini") && callWin.classList.contains("unit")) {
            // (a phone's small window: the bottom right corner, like picture in picture)
            x = page.width - width - 12;
            y = page.height - height - 16;
        } else if (callWin.classList.contains("unit")) {
            x = (page.width - width) / 2;
            y = page.height - height - 12;
        } else {
            // At first: the top right of the picture, below its title bar, and within the picture
            // (on a phone held upright, not over the title below it)
            const picture = container.getBoundingClientRect();
            x = picture.right - page.left - width - 12;
            y = Math.max(picture.top - page.top + 8, Math.min(picture.top - page.top + 72, picture.bottom - page.top - height - 8));
        }
        call.x = Math.max(margin, Math.min(x, page.width - width - margin));
        call.y = Math.max(margin, Math.min(y, page.height - height - margin));
        callWin.style.transform = `translate(${Math.round(call.x)}px, ${Math.round(call.y)}px)`;
    };
    window.addEventListener("resize", () => {
        layoutCall();
        placeCall();
    });
    if ("ResizeObserver" in window) new ResizeObserver(placeCall).observe(callWin);

    // Where it is, as a share of the room it has to move in
    const keepCallPlace = () => {
        const page = playerPage.getBoundingClientRect();
        const roomX = page.width - callWin.offsetWidth;
        const roomY = page.height - callWin.offsetHeight;
        call.pos = { x: roomX > 0 ? Math.min(1, Math.max(0, call.x / roomX)) : 0, y: roomY > 0 ? Math.min(1, Math.max(0, call.y / roomY)) : 0 };
        saveCall();
    };

    // A new size and place (px): remembered for the way the screen is held
    const resizeCall = (x, y, width, height) => {
        const page = playerPage.getBoundingClientRect();
        call.sizes[callOrient(page)] = { w: Math.round(width), h: Math.round(height) };
        call.x = x;
        call.y = y;
        layoutCall();
        callWin.style.transform = `translate(${Math.round(call.x)}px, ${Math.round(call.y)}px)`;
    };

    // An edge or corner, dragged with a mouse: that side moves, the opposite one stays put
    const startCallResize = (e, handle) => {
        if (e.button > 0 || call.collapsed || call.dock) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        call.sizing = { id: e.pointerId, edge: handle.dataset.edge, x0: e.clientX, y0: e.clientY, x: call.x, y: call.y, w: callWin.offsetWidth, h: callWin.offsetHeight };
        callWin.classList.add("resizing");
        showCallNames();
    };
    const moveCallResize = e => {
        const s = call.sizing;
        if (!s || s.id !== e.pointerId) return;
        const page = playerPage.getBoundingClientRect();
        const margin = 8;
        const dx = e.clientX - s.x0;
        const dy = e.clientY - s.y0;
        let { x, y, w, h } = s;
        const minW = callMinW();
        if (s.edge.includes("e")) w = within(s.w + dx, minW, page.width - margin - s.x);
        if (s.edge.includes("w")) {
            w = within(s.w - dx, minW, s.x + s.w - margin);
            x = s.x + s.w - w;
        }
        if (s.edge.includes("s")) h = within(s.h + dy, callMinH(), page.height - margin - s.y);
        if (s.edge.includes("n")) {
            h = within(s.h - dy, callMinH(), s.y + s.h - margin);
            y = s.y + s.h - h;
        }
        resizeCall(x, y, w, h);
    };
    const endCallResize = e => {
        if (!call.sizing || call.sizing.id !== e.pointerId) return;
        call.sizing = null;
        callWin.classList.remove("resizing");
        keepCallPlace();
        placeDeskPill();
    };
    [...callEdges, callResize].forEach(handle => {
        handle.addEventListener("pointerdown", e => startCallResize(e, handle));
        handle.addEventListener("pointermove", moveCallResize);
        handle.addEventListener("pointerup", endCallResize);
        handle.addEventListener("pointercancel", endCallResize);
    });
    // The grip, with the keyboard: arrows make it wider / narrower and taller / shorter
    callResize.addEventListener("keydown", e => {
        const step = { ArrowRight: [8, 0], ArrowLeft: [-8, 0], ArrowDown: [0, 8], ArrowUp: [0, -8] }[e.key];
        if (!step || call.collapsed || call.dock) return;
        e.preventDefault();
        e.stopPropagation();
        const page = playerPage.getBoundingClientRect();
        const times = e.shiftKey ? 3 : 1;
        const w = within(callWin.offsetWidth + step[0] * times, callMinW(), page.width - 8 - call.x);
        const h = within(callWin.offsetHeight + step[1] * times, callMinH(), page.height - 8 - call.y);
        resizeCall(call.x, call.y, w, h);
        keepCallPlace();
    });
    // Double-clicking the title bar: back to the size that fits everyone (the window holds the
    // pointer for dragging, so the click is the window's: where it was decides)
    callWin.addEventListener("dblclick", e => {
        const bar = callBar.getBoundingClientRect();
        if (e.clientY < bar.top || e.clientY > bar.bottom || call.collapsed || call.dock) return;
        if ([...callBar.querySelectorAll("button")].some(button => {
            const box = button.getBoundingClientRect();
            return e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
        })) return;
        delete call.sizes[callOrient(playerPage.getBoundingClientRect())];
        layoutCall();
        placeCall();
        saveCall();
    });

    // Pinched with two fingers (a phone or tablet): larger or smaller around its middle, keeping
    // its shape, from small up to as large as the screen holds it
    const pinchGap = () => {
        const [a, b] = [...call.touches.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const pinchTo = scale => {
        const pinch = call.pinch;
        const page = playerPage.getBoundingClientRect();
        const most = Math.min((page.width - 16) / pinch.w, (page.height - 16) / pinch.h);
        const least = Math.max(callMinW() / pinch.w, callMinH() / pinch.h);
        const s = within(scale, Math.min(least, most), Math.max(least, most));
        const w = pinch.w * s;
        const h = pinch.h * s;
        resizeCall(within(pinch.cx - w / 2, 8, page.width - w - 8), within(pinch.cy - h / 2, 8, page.height - h - 8), w, h);
    };

    // Dragged by any part of it but its buttons, with a mouse or a finger (docked, it stays put
    // and a finger scrolls it)
    callWin.addEventListener("pointerdown", e => {
        if (call.dock) return;
        if (e.pointerType === "touch") {
            call.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            // A second finger: a pinch instead of a drag (not while it's folded up to its title)
            if (call.touches.size === 2 && !call.collapsed && callGrid.firstElementChild && !callWin.classList.contains("no-people")) {
                if (call.drag) {
                    call.drag = null;
                    callWin.classList.remove("dragging");
                }
                try {
                    callWin.setPointerCapture(e.pointerId);
                } catch (err) {}
                const w = callWin.offsetWidth;
                const h = callWin.offsetHeight;
                call.pinch = { gap: Math.max(1, pinchGap()), w, h, cx: call.x + w / 2, cy: call.y + h / 2 };
                callWin.classList.add("resizing");
                showCallNames();
                return;
            }
            if (call.touches.size > 2 || call.pinch) return;
        }
        if (e.button > 0 || e.target.closest(".room-call-edge")) return;
        // On a button (a phone's call bar is nearly all buttons): a drag once it moves a little,
        // and then the button isn't pressed
        const onButton = !!e.target.closest("button");
        call.drag = { id: e.pointerId, dx: e.clientX - call.x, dy: e.clientY - call.y, x0: e.clientX, y0: e.clientY, live: !onButton, target: e.target };
        if (onButton) return;
        callWin.setPointerCapture(e.pointerId);
        callWin.classList.add("dragging");
    });
    callWin.addEventListener("pointermove", e => {
        if (call.touches.has(e.pointerId)) call.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (call.pinch) {
            if (call.touches.size >= 2) pinchTo(pinchGap() / call.pinch.gap);
            return;
        }
        if (!call.drag || call.drag.id !== e.pointerId) return;
        if (!call.drag.live) {
            if (Math.hypot(e.clientX - call.drag.x0, e.clientY - call.drag.y0) < 10) return;
            call.drag.live = true;
            call.drag.fromButton = true;
            try {
                callWin.setPointerCapture(e.pointerId);
            } catch (err) {}
            callWin.classList.add("dragging");
        }
        const page = playerPage.getBoundingClientRect();
        const margin = 8;
        call.x = Math.max(margin, Math.min(e.clientX - call.drag.dx, page.width - callWin.offsetWidth - margin));
        call.y = Math.max(margin, Math.min(e.clientY - call.drag.dy, page.height - callWin.offsetHeight - margin));
        callWin.style.transform = `translate(${Math.round(call.x)}px, ${Math.round(call.y)}px)`;
    });
    const endCallDrag = e => {
        call.touches.delete(e.pointerId);
        // A finger lifted: the pinch ends (the other one doesn't start dragging it)
        if (call.pinch) {
            if (call.touches.size < 2) {
                call.pinch = null;
                callWin.classList.remove("resizing");
                keepCallPlace();
            }
            return;
        }
        if (!call.drag || call.drag.id !== e.pointerId) return;
        const drag = call.drag;
        call.drag = null;
        if (!drag.live) return;
        callWin.classList.remove("dragging");
        placeDeskPill();
        // A tap (not a drag) on a phone's small floating window: its call bar shows, or hides
        if (e.type === "pointerup" && callWin.classList.contains("mini") && !roomFoot.contains(drag.target)
            && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) showUnitBar(!callWin.classList.contains("bar-open"));
        // Dragged from a button: not a press
        if (drag.fromButton) {
            call.swallowClick = true;
            setTimeout(() => call.swallowClick = false, 400);
        }
        keepCallPlace();
    };
    callWin.addEventListener("pointerup", endCallDrag);
    callWin.addEventListener("pointercancel", endCallDrag);
    callWin.addEventListener("click", e => {
        if (!call.swallowClick) return;
        call.swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    // ---------- A phone's floating call, with everyone's video: a small picture in picture window,
    // just the videos. A tap on it shows its call bar as a pill below it (above it, low on the
    // screen) for a few seconds; minimized, or with nobody's video yet, it's the bar itself.
    let unitBarTimer = null;
    // The pill below the window (above it when it's low on the screen), kept on the screen: moved
    // across when the window is near an edge
    const placePill = () => {
        const pill = callWin.classList.contains("unit") ? roomFoot : callBar;
        const box = callWin.getBoundingClientRect();
        const page = playerPage.getBoundingClientRect();
        const tall = (pill.offsetHeight || 50) + 16;
        callWin.classList.toggle("bar-up", box.bottom + tall > page.bottom && box.top - tall > page.top);
        const wide = pill.offsetWidth;
        const left = box.left + box.width / 2 - wide / 2;
        const fits = Math.max(page.left + 8, Math.min(left, page.right - 8 - wide));
        callWin.style.setProperty("--bar-dx", `${Math.round(fits - left)}px`);
    };
    // (a computer's: placed as it's pointed at, and as it's dragged or resized)
    const placeDeskPill = () => callWin.classList.contains("mini") && !callWin.classList.contains("unit") && placePill();
    callWin.addEventListener("pointerenter", e => e.pointerType !== "touch" && placeDeskPill());
    const showUnitBar = open => {
        clearTimeout(unitBarTimer);
        if (open) {
            placePill();
            unitBarTimer = setTimeout(function hide() {
                if (leavePopover && !leavePopover.hidden) unitBarTimer = setTimeout(hide, 2000);
                else showUnitBar(false);
            }, 4500);
        }
        callWin.classList.toggle("bar-open", open);
    };
    // (its buttons used: it stays a while longer)
    roomFoot.addEventListener("pointerdown", () => callWin.classList.contains("bar-open") && showUnitBar(true));

    const renderCallButtons = () => {
        // Docked, it doesn't fold up (it can float again, and fold up there); a phone's does
        const unit = callWin.classList.contains("unit");
        const folded = call.collapsed && (!call.dock || unit);
        const alone = callWin.classList.contains("no-people");
        // Floating with everyone's video (phones and computers): just the videos; the buttons are
        // a pill outside it - a tap shows it on a phone, pointing at it on a computer
        const mini = !call.dock && !call.collapsed && !alone;
        if (mini !== callWin.classList.contains("mini")) {
            callWin.classList.toggle("mini", mini);
            showUnitBar(false);
        }
        // Your camera on and your video showing: your mic and camera buttons are on your video
        // (pointed at, on a computer; always, on a touch screen), not in the bar
        const ownOnVideo = camEnabled && !alone && (call.dock === "bottom" ? callWin.classList.contains("has-video") && !call.collapsed : !folded);
        callWin.classList.toggle("own-ctl", ownOnVideo);
        unitPeopleBtn.disabled = alone;
        unitChevron.className = `fa-solid ${call.collapsed ? "fa-chevron-up" : "fa-chevron-down"} room-unit-chevron`;
        unitPeopleBtn.title = alone ? "Just you: turn your camera on to see yourself" : call.collapsed ? "Show everyone's video" : "Fold everyone's video away";
        unitPeopleBtn.setAttribute("aria-label", `${unitCount.textContent} in the room. ${unitPeopleBtn.title}`);
        unitPeopleBtn.setAttribute("aria-expanded", String(!call.collapsed && !alone));
        unitFloatBtn.firstChild.className = `fa-solid ${call.dock ? "fa-up-down-left-right" : "fa-thumbtack"}`;
        unitFloatBtn.title = call.dock ? "Float it: drag it anywhere" : phoneSideways.matches ? "Dock it on the left" : "Dock it at the bottom";
        unitFloatBtn.setAttribute("aria-label", unitFloatBtn.title);
        unitFloatBtn.hidden = !call.dock && !call.dockable;
        // Hide 3-dot more menu; pin and minimize buttons are shown directly in the bar
        callMoreBtn.hidden = true;
        showCallMore(false);
        callWin.classList.toggle("collapsed", folded);
        // The dock (computers): everyone's video above its buttons once a camera is on; its
        // minimize button folds them away (and shows them again)
        const bottom = call.dock === "bottom";
        const videos = callWin.classList.contains("has-video");
        callWin.classList.toggle("expanded", bottom && videos && !call.collapsed);
        callFoldBtn.hidden = bottom ? !videos : !!call.dock;
        callFoldBtn.firstChild.className = `fa-solid ${bottom ? (call.collapsed ? "fa-chevron-up" : "fa-chevron-down")
            : call.collapsed ? "fa-up-right-and-down-left-from-center" : "fa-minus"}`;
        callFoldBtn.title = bottom ? (call.collapsed ? "Show everyone's video" : "Hide everyone's video") : call.collapsed ? "Show everyone" : "Minimize";
        callFoldBtn.setAttribute("aria-label", callFoldBtn.title);
        callFoldBtn.setAttribute("aria-expanded", String(!call.collapsed));
        callChatBtn.hidden = unit;
        // Layout (computers): the button shows where it is now; the menu ticks it. Where it can't be
        // docked (a tablet held upright), only floating is offered.
        const layout = callLayout();
        const current = CALL_LAYOUTS.find(item => item.mode === layout);
        callLayoutBtn.hidden = unit;
        callLayoutBtn.firstChild.className = `fa-solid ${current.icon}`;
        callLayoutBtn.title = `Layout: ${current.text.toLowerCase()} (D)`;
        callLayoutBtn.setAttribute("aria-label", `Call layout: ${current.text}`);
        layoutOptions.forEach(option => {
            option.setAttribute("aria-checked", String(option.dataset.mode === layout));
            option.hidden = option.dataset.mode === "side" && !call.dockable && option.dataset.mode !== layout;
        });
        callWin.dataset.layout = layout;
        if (unit) showCallLayout(false);
    };
    // Small pictures show names for a few seconds (when it appears, someone joins or leaves, or
    // it's touched or pointed at), then just the pictures and mics; large ones always show them
    let callNamesTimer = null;
    const showCallNames = () => {
        callWin.classList.remove("quiet");
        clearTimeout(callNamesTimer);
        callNamesTimer = setTimeout(() => callWin.classList.add("quiet"), 4000);
    };
    callWin.addEventListener("pointerenter", showCallNames);
    callWin.addEventListener("pointerdown", showCallNames);

    unitPeopleBtn.addEventListener("click", () => callFoldBtn.click());
    callFoldBtn.addEventListener("click", () => {
        call.collapsed = !call.collapsed;
        renderCallButtons();
        layoutCall();
        saveCall();
        placeCall();
        // (minimized on a phone sideways: it may step aside in a while)
        wakeCall();
    });
    // The docked column's width back to its own, in motion (a double-click on its long edge)
    const dockInMotion = () => {
        if (calmer() || call.dock !== "side") return;
        callWin.classList.add("dock-moving");
        clearTimeout(call.motionTimer);
        call.motionTimer = setTimeout(() => callWin.classList.remove("dock-moving"), 400);
    };

    // Its long edge, dragged with a mouse: the column follows it, and the video beside it
    callDockEdge.addEventListener("pointerdown", e => {
        if (e.button > 0 || call.dock !== "side") return;
        e.preventDefault();
        e.stopPropagation();
        callDockEdge.setPointerCapture(e.pointerId);
        call.dockSizing = { id: e.pointerId, x0: e.clientX, w: callWin.offsetWidth };
        callWin.classList.add("dock-sizing");
        playerPage.classList.add("dock-sizing");
    });
    callDockEdge.addEventListener("pointermove", e => {
        const sizing = call.dockSizing;
        if (!sizing || sizing.id !== e.pointerId) return;
        call.dockW = Math.round(within(sizing.w + e.clientX - sizing.x0, DOCK_MIN_W, dockMaxW()));
        layoutCall();
    });
    const endDockSizing = e => {
        if (!call.dockSizing || call.dockSizing.id !== e.pointerId) return;
        call.dockSizing = null;
        callWin.classList.remove("dock-sizing");
        playerPage.classList.remove("dock-sizing");
        renderCallButtons();
        saveCall();
    };
    callDockEdge.addEventListener("pointerup", endDockSizing);
    callDockEdge.addEventListener("pointercancel", endDockSizing);
    callDockEdge.addEventListener("dblclick", () => {
        call.dockW = null;
        dockInMotion();
        renderCallButtons();
        layoutCall();
        saveCall();
    });
    callDockEdge.addEventListener("keydown", e => {
        const step = { ArrowRight: 10, ArrowLeft: -10 }[e.key];
        if (!step || call.dock !== "side") return;
        e.preventDefault();
        e.stopPropagation();
        call.dockW = Math.round(within(callWin.offsetWidth + step * (e.shiftKey ? 3 : 1), DOCK_MIN_W, dockMaxW()));
        layoutCall();
        renderCallButtons();
        saveCall();
    });

    // Docked or floating, by the page's layout: beside the video when the player and the room's
    // panel sit side by side, under it when they're stacked (a phone held upright). A phone held
    // upright with the video filling the screen has no room for it, so it floats there.
    // `motion`: docked or floated by its button, so it moves there smoothly: the video glides to
    // its new place, a docked column slides in from its side (a strip up from below), a floating
    // window fades in where it lands
    let inPlaceDock = false;
    const placeDock = (motion = false) => {
        if (inPlaceDock) return;
        inPlaceDock = true;
        try {
            const moving = motion === true && !calmer() && !callWin.hidden;
            const videoWas = moving ? container.getBoundingClientRect() : null;
            const unit = unitMode();
            callWin.classList.toggle("unit", unit);
            const upright = isUprightPhone();
            call.dockable = upright || !uprightTouch.matches;
            const wanted = unit ? !call.unitFloat : call.docked;
            let dock = null;
            if (!unit) {
                // Computers: the dock over the bottom of the video, or pinned left of it or above
                // it (where the page has room for that, and there's someone to show: else the dock)
                // Pinned, with the room's panel open: every bit of the screen used - the video in the
                // middle, everyone's video in a row above the panel, the buttons as a dock below the
                // video ("rail"); with the panel closed, a column left of the video ("side")
                const pinned = call.dockPos === "side" && call.dockable && !callWin.classList.contains("no-people");
                const panelOpen = !panel.hidden && playerPage.classList.contains("room-open");
                if (wanted && !callWin.hidden && !playerPage.hidden) dock = !pinned ? "bottom" : panelOpen ? "rail" : "side";
            } else if (wanted && !callWin.hidden && !playerPage.hidden && call.dockable) {
                // Phones: a strip at the bottom held upright, a column on the left held sideways
                dock = upright ? "strip" : "side";
            }
            callWin.classList.toggle("bottom", dock === "bottom");
            callWin.classList.toggle("docked", !!dock && dock !== "bottom");
            callWin.classList.toggle("side", dock === "side");
            callWin.classList.toggle("top", dock === "top");
            callWin.classList.toggle("strip", dock === "strip");
            callWin.classList.toggle("rail", dock === "rail");
            playerPage.classList.toggle("call-dock-rail", dock === "rail");
            playerPage.classList.toggle("call-dock-side", dock === "side");
            playerPage.classList.toggle("call-dock-top", dock === "top");
            playerPage.classList.toggle("call-dock-below", dock === "strip");
            const was = call.dock;
            call.dock = dock;
            renderCallButtons();
            if (was !== dock) {
                // Docked, the page's layout places it (not where it floated)
                if (dock) callWin.style.removeProperty("transform");
                layoutCall();
                placeCall();
                setTimeout(() => wakeCall());
                if (moving && videoWas && videoWas.width > 0) {
                    glidePlayer(videoWas);
                    const at = callWin.style.transform || "translate(0px, 0px)";
                    // (the dock keeps its own transform: it rises in with scale and opacity)
                    if (dock === "bottom") callWin.animate([{ opacity: 0, scale: "0.92" }, { opacity: 1, scale: "1" }], { duration: 260, easing: PANEL_EASE });
                    else callWin.animate(dock === "side" ? [{ opacity: 0, transform: "translateX(-24px)" }, { opacity: 1, transform: "none" }]
                        : dock === "top" ? [{ opacity: 0, transform: "translateY(-16px)" }, { opacity: 1, transform: "none" }]
                        : dock === "strip" ? [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }]
                        : [{ opacity: 0, transform: `${at} scale(0.94)` }, { opacity: 1, transform: `${at} scale(1)` }],
                        { duration: 250, easing: PANEL_EASE });
                }
            }
        } finally {
            inPlaceDock = false;
        }
    };
    window.addEventListener("resize", () => placeDock());
    // (the room's panel opening or closing, the title moving below the picture, fullscreen)
    new MutationObserver(mutations => {
        if (inPlaceDock) return;
        const hasRelevant = mutations.some(m => {
            if (m.type === "attributes" && m.attributeName === "hidden") return true;
            if (m.type === "attributes" && m.attributeName === "class") {
                const oldVal = (m.oldValue || "").replace(/\bcall-dock-\S+/g, "").trim();
                const newVal = (playerPage.className || "").replace(/\bcall-dock-\S+/g, "").trim();
                return oldVal !== newVal;
            }
            return false;
        });
        if (hasRelevant) placeDock();
    }).observe(playerPage, { attributes: true, attributeOldValue: true, attributeFilter: ["class", "hidden"] });
    unitFloatBtn.addEventListener("click", () => {
        call.unitFloat = !!call.dock;
        // Floated from the bottom of the screen: from where it was, not where it floated before
        if (call.unitFloat) call.pos = null;
        saveCall();
        placeDock(true);
    });
    renderCallButtons();

    // Keep hover overlay buttons on the own tile in sync with mic/cam state
    syncHoverControls = () => {
        const canFlip = camEnabled && (isTouch || camCount > 1 || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches));
        if (flipBtn) flipBtn.hidden = !canFlip;
        if (callFlipBtn) callFlipBtn.hidden = !canFlip;
        call.tiles.forEach(tile => {
            if (tile.hoverMic) {
                tile.hoverMic.firstChild.className = `fa-solid ${micEnabled ? "fa-microphone" : "fa-microphone-slash"}`;
                tile.hoverMic.classList.toggle("active", micEnabled);
                tile.hoverMic.classList.toggle("off", !micEnabled);
                tile.hoverMic.title = micEnabled ? "Turn microphone off" : "Turn microphone on";
                tile.hoverMic.setAttribute("aria-label", tile.hoverMic.title);
            }
            if (tile.hoverCam) {
                tile.hoverCam.firstChild.className = `fa-solid ${camEnabled ? "fa-video" : "fa-video-slash"}`;
                tile.hoverCam.classList.toggle("active", camEnabled);
                tile.hoverCam.classList.toggle("off", !camEnabled);
                tile.hoverCam.title = camEnabled ? "Turn camera off" : "Turn camera on";
                tile.hoverCam.setAttribute("aria-label", tile.hoverCam.title);
            }
            if (tile.hoverFlip) {
                tile.hoverFlip.hidden = !canFlip;
            }
        });
    };

    // D (script.js) and the search's command: pinned to the side, or floating again (a phone:
    // the call bar docked, or floating). Returns why it couldn't, or null.
    together.toggleCallDock = () => {
        if (!room) return "Not in a room";
        if (callWin.hidden) return "Turn your camera on to see the call window";
        if (callWin.classList.contains("unit")) {
            if (!call.dock && !call.dockable) return "It can't be pinned here (fullscreen, held upright)";
            unitFloatBtn.click();
        } else setCallLayout(call.docked ? "float" : call.dockPos);
        return null;
    };
    together.callDocked = () => !callWin.hidden && !!call.dock;

    // ---------- A phone, sideways or fullscreen, with the call minimized: after a few seconds
    // without a touch it steps aside (a slim column slides away, the video taking its place; a
    // floating pill fades out), like a video call's buttons; a touch anywhere brings it back
    const CALL_IDLE_MS = 4000;
    let callIdleTimer = null;
    const callIdleWanted = () => !callWin.hidden && callWin.classList.contains("unit") && call.collapsed && call.dock !== "strip"
        && (phoneSideways.matches || !!(document.fullscreenElement || document.webkitFullscreenElement))
        && callMoreMenu.hidden && (!leavePopover || leavePopover.hidden);
    const setCallIdle = idle => {
        callWin.classList.toggle("idle", idle);
        playerPage.classList.toggle("call-idle", idle && call.dock === "side");
    };
    const wakeCall = () => {
        clearTimeout(callIdleTimer);
        if (callWin.classList.contains("idle")) setCallIdle(false);
        if (callIdleWanted()) callIdleTimer = setTimeout(() => callIdleWanted() && setCallIdle(true), CALL_IDLE_MS);
    };
    playerPage.addEventListener("pointerdown", wakeCall, true);
    document.addEventListener("keydown", wakeCall, true);
    document.addEventListener("fullscreenchange", wakeCall);
    document.addEventListener("webkitfullscreenchange", wakeCall);

    // Everyone in the room: { key, name, avatar, mic, track (their camera, or null), me }, the
    // others first (the host first of them), then you. Alone, only once your camera is on (to see
    // yourself); whoever joins then comes in beside you
    const callPeople = () => {
        if (!room) return [];
        const me = { key: "me", name: room.name || "You", avatar: room.avatar, mic: micEnabled, track: camTrack(), me: true, mirror: camFacing === "user" };
        if (room.role === "host") {
            const others = guests().map(peer => ({
                key: peer.id, name: peer.name, avatar: peer.avatar, mic: !!peer.micOn,
                track: peer.camOn && peer.camTransceiver ? peer.camTransceiver.receiver.track : null
            }));
            return others.length || me.track ? [...others, me] : [];
        }
        if (room.phase !== "in" || !Array.isArray(room.members)) return [];
        const peer = room.peer;
        const cams = room.cams;
        const others = room.members.filter(member => member.id !== room.id).map(member => {
            let track = null;
            if (peer && peer.camTransceiver && cams) {
                if (member.host && cams.host) track = peer.camTransceiver.receiver.track;
                const slot = !member.host && cams.slots.find(item => item.id === member.id);
                if (slot && peer.camSlots[slot.i]) track = peer.camSlots[slot.i].receiver.track;
            }
            return { key: member.id, name: member.name, avatar: member.avatar, mic: member.mic === true, track, host: member.host };
        });
        return others.length || me.track ? [...others, me] : [];
    };

    // ---------- Picture in picture (script.js, a computer's Chrome or Edge): everyone in the room
    // in its window too, like the call window: how many, your mic and camera, and each person's
    // camera (or avatar) with their name and mic. Kept up to date with the call window.
    let pipCall = null;
    const renderPipCall = () => {
        if (!pipCall || !room) return;
        const people = callPeople();
        // (on your own with the camera off, the call window is hidden; here, you)
        if (!people.length) people.push({ key: "me", name: room.name || "You", avatar: room.avatar, mic: micEnabled, track: camTrack(), me: true, mirror: camFacing === "user" });
        pipCall.count.textContent = String(people.length);
        pipCall.title.title = people.length === 1 ? "Just you in the room" : `${people.length} in the room`;
        const keep = new Set(people.map(person => person.key));
        pipCall.tiles.forEach((tile, key) => {
            if (keep.has(key)) return;
            tile.video.srcObject = null;
            tile.el.remove();
            pipCall.tiles.delete(key);
        });
        people.forEach(person => {
            let tile = pipCall.tiles.get(person.key);
            if (!tile) {
                const figure = el("figure", "room-call-tile");
                const video = el("video");
                video.muted = true;
                video.autoplay = true;
                video.playsInline = true;
                const face = el("span", "room-call-face");
                const mic = el("span", "room-call-mic");
                mic.append(el("i"));
                const name = el("figcaption", "room-call-name");
                figure.append(video, face, mic, name);
                tile = { el: figure, video, face, mic, name, track: null, look: "" };
                pipCall.tiles.set(person.key, tile);
            }
            tile.el.classList.toggle("mirror", !!person.mirror);
            tile.el.classList.toggle("camera", !!person.track);
            const label = person.me ? `${person.name} (you)` : person.host ? `${person.name} (host)` : person.name;
            if (tile.name.textContent !== label) tile.name.textContent = label;
            tile.mic.classList.toggle("off", !person.mic);
            tile.mic.firstChild.className = `fa-solid ${person.mic ? "fa-microphone" : "fa-microphone-slash"}`;
            const look = `${person.name}|${person.avatar || ""}`;
            if (tile.look !== look) {
                tile.look = look;
                tile.face.replaceChildren(makeAvatar(person.name, person.avatar));
            }
            if (tile.track !== person.track) {
                tile.track = person.track;
                tile.video.srcObject = person.track ? new MediaStream([person.track]) : null;
                if (person.track) tile.video.play().catch(() => {});
            }
        });
        const order = people.map(person => pipCall.tiles.get(person.key).el);
        if (order.length !== pipCall.grid.children.length || order.some((item, i) => pipCall.grid.children[i] !== item)) pipCall.grid.replaceChildren(...order);
    };
    // The panel for the window: { el, close }, or null outside a room
    together.callPip = () => {
        if (!room) return null;
        const box = el("aside", "pip-people");
        box.setAttribute("aria-label", "People in the room");
        const bar = el("div", "pip-people-bar");
        const title = el("span", "room-call-title");
        const count = el("b");
        title.append(el("i", "fa-solid fa-user-group"), count);
        const mic = callButton("room-call-media", "Turn microphone on");
        const cam = callButton("room-call-media", "Turn camera on");
        mic.addEventListener("click", toggleMicrophone);
        cam.addEventListener("click", () => camEnabled ? disableCamera() : enableCamera());
        const controls = el("div", "room-call-controls");
        controls.append(mic, cam);
        bar.append(title, controls);
        const grid = el("div", "pip-people-grid");
        box.append(bar, grid);
        micButtons.push(mic);
        camButtons.push(cam);
        renderMic();
        renderCam();
        pipCall = { grid, count, title, tiles: new Map() };
        renderPipCall();
        return {
            el: box,
            close: () => {
                [micButtons, camButtons].forEach(list => list.splice(0, list.length, ...list.filter(button => button !== mic && button !== cam)));
                if (pipCall) pipCall.tiles.forEach(tile => tile.video.srcObject = null);
                pipCall = null;
            }
        };
    };

    const setTileRatio = (tile, ratio) => {
        tile.ratio = ratio;
        if (ratio) tile.el.style.setProperty("--ar", ratio.toFixed(4));
        else tile.el.style.removeProperty("--ar");
        tile.el.classList.toggle("portrait", !!ratio && ratio < 1);
    };

    const renderCameras = () => {
        const people = callPeople();
        // On a phone: the call bar in it, and it's there all through a room
        placeNowBar();
        const unit = unitMode();
        callWin.classList.toggle("unit", unit);
        callWin.classList.toggle("no-people", !people.length);
        unitCount.textContent = String(Math.max(1, people.length));
        const wasHidden = callWin.hidden;
        // (a computer's is the dock all through a room too: your mic, camera and the rest)
        callWin.hidden = !people.length && !unit && !room;
        callWin.classList.toggle("has-video", people.some(person => !!person.track));
        // Someone came or went: everyone's name again for a moment
        const who = people.map(person => person.key).join();
        if (people.length && (wasHidden || who !== call.who)) showCallNames();
        call.who = who;
        callCount.textContent = String(Math.max(1, people.length));
        callTitle.title = people.length === 1 ? "Just you in the room" : `${people.length} in the room`;
        callTitle.setAttribute("aria-label", callTitle.title);
        const keep = new Set(people.map(person => person.key));
        call.tiles.forEach((tile, key) => {
            if (keep.has(key)) return;
            tile.video.srcObject = null;
            tile.el.remove();
            call.tiles.delete(key);
        });
        people.forEach(person => {
            let tile = call.tiles.get(person.key);
            if (!tile) {
                const figure = el("figure", "room-call-tile");
                const video = el("video");
                video.muted = true;
                video.autoplay = true;
                video.playsInline = true;
                video.setAttribute("playsinline", "");
                const face = el("span", "room-call-face");
                const mic = el("span", "room-call-mic");
                mic.append(el("i"));
                const name = el("figcaption", "room-call-name");
                figure.append(video, face, mic, name);
                tile = { el: figure, video, face, mic, name, track: null, look: "", ratio: 0 };
                // The camera's shape (a phone's upright is tall, a laptop's wide): the tile takes it
                // where it's sized by its height (strips), and the window's size fits it
                const own = tile;
                const fitTile = () => {
                    const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 0;
                    if (Math.abs(own.ratio - ratio) < 0.01) return;
                    setTileRatio(own, ratio);
                    layoutCall();
                };
                video.addEventListener("loadedmetadata", fitTile);
                video.addEventListener("resize", fitTile);
                // Your own: hover overlay with mic, camera, and camera switching controls
                if (person.me) {
                    // Hover overlay: mic, cam, flip — shown on hover, hidden otherwise
                    const hoverOverlay = el("div", "room-call-tile-hover");
                    const hoverMic = el("button", "room-call-hover-btn room-call-hover-mic");
                    hoverMic.type = "button";
                    hoverMic.title = "Toggle microphone";
                    hoverMic.setAttribute("aria-label", "Toggle microphone");
                    hoverMic.append(el("i"));
                    hoverMic.addEventListener("click", e => { e.stopPropagation(); toggleMicrophone(); });

                    const hoverCam = el("button", "room-call-hover-btn room-call-hover-cam");
                    hoverCam.type = "button";
                    hoverCam.title = "Toggle camera";
                    hoverCam.setAttribute("aria-label", "Toggle camera");
                    hoverCam.append(el("i"));
                    hoverCam.addEventListener("click", e => { e.stopPropagation(); camEnabled ? disableCamera() : enableCamera(); });

                    const hoverFlip = el("button", "room-call-hover-btn room-call-hover-flip");
                    hoverFlip.type = "button";
                    hoverFlip.title = "Switch camera (front / back)";
                    hoverFlip.setAttribute("aria-label", "Switch camera");
                    hoverFlip.append(el("i", "fa-solid fa-camera-rotate"));
                    hoverFlip.addEventListener("click", e => { e.stopPropagation(); flipCamera(); });

                    hoverOverlay.append(hoverMic, hoverCam, hoverFlip);
                    figure.append(hoverOverlay);
                    tile.hoverOverlay = hoverOverlay;
                    tile.hoverMic = hoverMic;
                    tile.hoverCam = hoverCam;
                    tile.hoverFlip = hoverFlip;

                    // Desktop hover: pointer enter/leave. On mobile/touch devices, controls are in the control bar instead of covering the video
                    if (!isTouch && !(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) {
                        figure.addEventListener("pointerenter", () => figure.classList.add("hover-active"));
                        figure.addEventListener("pointerleave", () => figure.classList.remove("hover-active"));
                    }
                }
                call.tiles.set(person.key, tile);
            }
            tile.el.classList.toggle("me", !!person.me);
            tile.el.classList.toggle("mirror", !!person.mirror);
            tile.el.classList.toggle("camera", !!person.track);
            const label = person.me ? `${person.name} (you)` : person.host ? `${person.name} (host)` : person.name;
            if (tile.name.textContent !== label) tile.name.textContent = label;
            // Mic on or off, for each person
            tile.mic.classList.toggle("off", !person.mic);
            tile.mic.firstChild.className = `fa-solid ${person.mic ? "fa-microphone" : "fa-microphone-slash"}`;
            tile.mic.title = person.mic ? "Mic on" : "Muted";
            // (your own: no tooltip over your buttons)
            if (person.me) tile.el.removeAttribute("title");
            else tile.el.title = `${label} · ${person.mic ? "mic on" : "muted"}${person.track ? "" : " · camera off"}`;
            if (syncHoverControls) syncHoverControls();
            // Their avatar while their camera is off
            const look = `${person.name}|${person.avatar || ""}`;
            if (tile.look !== look) {
                tile.look = look;
                tile.face.replaceChildren(makeAvatar(person.name, person.avatar));
            }
            if (tile.track !== person.track) {
                tile.track = person.track;
                tile.video.srcObject = person.track ? new MediaStream([person.track]) : null;
                if (person.track) tile.video.play().catch(() => {});
                else setTileRatio(tile, 0);
            }
        });
        // In order (moved only when it changed, so nothing playing is interrupted)
        const order = people.map(person => call.tiles.get(person.key).el);
        if (order.length !== callGrid.children.length || order.some((item, i) => callGrid.children[i] !== item)) callGrid.replaceChildren(...order);
        placeDock();
        renderCallButtons();
        layoutCall();
        placeCall();
        renderPipCall();
    };
    // A phone turned: docked at the bottom, or on the left
    [phoneUpright, phoneSideways].forEach(query => query.addEventListener && query.addEventListener("change", () => {
        renderCameras();
        wakeCall();
    }));

    // The host: its own camera to every guest, and each guest gets the others' cameras passed on
    // (and is told whose is where)
    const syncCameras = () => {
        if (!room || room.role !== "host") return;
        const own = camTrack();
        const on = guests().filter(peer => peer.camOn && peer.camTransceiver);
        guests().forEach(peer => {
            if (!peer.camTransceiver) return;
            sendCamera(peer.camTransceiver.sender, own);
            const others = on.filter(other => other !== peer).slice(0, peer.camSlots.length);
            peer.camSlots.forEach((slot, i) => sendCamera(slot.sender, others[i] ? others[i].camTransceiver.receiver.track : null));
            const info = { t: "cams", host: !!own, slots: others.map((other, i) => ({ i, id: other.id, name: other.name })) };
            const said = JSON.stringify(info);
            if (peer.camSaid === said) return;
            peer.camSaid = said;
            send(peer, info);
        });
        renderCameras();
    };

    // A guest: their camera to the host, who's told whether it's on
    const syncCameraGuest = () => {
        const peer = room && room.peer;
        if (!peer) return;
        if (peer.camTransceiver) sendCamera(peer.camTransceiver.sender, camTrack());
        const on = !!camTrack() && !!peer.camTransceiver;
        if (peer.camSaid !== on) {
            peer.camSaid = on;
            send(peer, { t: "cam", on });
        }
        renderCameras();
    };

    const syncCamera = () => {
        if (!room) return renderCameras();
        if (room.role === "host") syncCameras();
        else syncCameraGuest();
    };

    const renderCam = () => {
        camButtons.forEach(button => {
            button.classList.toggle("active", camEnabled);
            button.setAttribute("aria-pressed", String(camEnabled));
            button.title = camEnabled ? "Turn camera off" : "Turn camera on";
            button.setAttribute("aria-label", camEnabled ? "Camera on" : "Camera off");
            button.querySelector("i").className = `fa-solid ${camEnabled ? "fa-video" : "fa-video-slash"}`;
            const label = button.querySelector("span");
            if (label) label.textContent = camEnabled ? "Cam on" : "Cam off";
        });
        if (syncHoverControls) syncHoverControls();
    };

    const enableCamera = async () => {
        if (camBusy || camEnabled || !room) return;
        if (room.role === "guest" && room.peer && room.peer.channel && room.peer.channel.isTunnel) {
            return toast("Cameras need a direct connection to the host; you're connected through the room's relay");
        }
        camBusy = true;
        camButtons.forEach(button => button.disabled = true);
        try {
            camStream = await navigator.mediaDevices.getUserMedia(cameraConstraints(camFacing));
            watchCamera();
            if (!room) {
                camStream.getTracks().forEach(track => track.stop());
                camStream = null;
                return;
            }
            camEnabled = true;
            renderCam();
            syncCamera();
            toast("Camera on");
            countCameras();
        } catch (e) {
            toast(e.name === "NotAllowedError" ? "Camera permission was denied" : "Couldn't access the camera");
        } finally {
            camBusy = false;
            camButtons.forEach(button => button.disabled = false);
        }
    };

    // The browser or the phone taking the camera away turns it off here too
    const watchCamera = () => camStream.getVideoTracks().forEach(track => {
        track.addEventListener("ended", () => camStream && camStream.getVideoTracks()[0] === track && disableCamera());
    });

    const countCameras = async () => {
        try {
            camCount = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput").length;
        } catch (e) {
            camCount = 0;
        }
        renderCameras();
    };

    // Phones: the front camera or the back one. The one in use stops first (many phones can't
    // open both at once); everyone gets the new one straight away. If the other can't be opened,
    // the one before comes back.
    const flipCamera = async () => {
        if (!camEnabled || camBusy || !room) return;
        camBusy = true;
        const was = camFacing;
        const facing = was === "user" ? "environment" : "user";
        camStream?.getTracks().forEach(track => track.stop());
        const open = async want => {
            try {
                return await navigator.mediaDevices.getUserMedia(cameraConstraints({ exact: want }));
            } catch (e) {
                return navigator.mediaDevices.getUserMedia(cameraConstraints(want));
            }
        };
        try {
            camStream = await open(facing);
            camFacing = facing;
            toast(facing === "environment" ? "Back camera" : "Front camera");
        } catch (e) {
            try {
                camStream = await open(was);
                toast("Couldn't switch to the other camera");
            } catch (error) {
                camStream = null;
                camBusy = false;
                disableCamera();
                return;
            }
        }
        if (!camEnabled || !room) {
            camStream.getTracks().forEach(track => track.stop());
            camStream = null;
        } else {
            watchCamera();
            syncCamera();
        }
        camBusy = false;
    };

    const disableCamera = (quiet = false) => {
        if (!camEnabled) return;
        camEnabled = false;
        syncCamera();
        camStream?.getTracks().forEach(track => track.stop());
        camStream = null;
        renderCam();
        if (!quiet) toast("Camera off");
    };

    camButtons.forEach(button => button.addEventListener("click", () => camEnabled ? disableCamera() : enableCamera()));
    renderCam();

    const wirePeer = (peer, onMessage, onGone, allowParts) => {
        peer.channel.onmessage = e => receive(peer, e.data, onMessage, allowParts);
        peer.channel.onclose = onGone;
        if (!peer.pc) return;
        peer.pc.onconnectionstatechange = () => {
            const state = peer.pc.connectionState;
            if (state === "failed" || state === "closed") onGone();
            // A short network hiccup can recover by itself
            if (state === "disconnected") {
                clearTimeout(peer.lostTimer);
                peer.lostTimer = setTimeout(() => peer.pc.connectionState === "disconnected" && onGone(), 10000);
            }
        };
    };

    const send = (peer, message) => {
        if (!peer || !peer.channel || peer.channel.readyState !== "open") return;
        const text = JSON.stringify(message);
        const size = peer.channel.isTunnel ? TUNNEL_CHUNK : CHUNK;
        if (text.length <= size) return peer.channel.send(text);
        const id = Signaling.newId();
        const count = Math.ceil(text.length / size);
        for (let i = 0; i < count; i++) {
            peer.channel.send(JSON.stringify({ t: "part", id, i, n: count, d: text.slice(i * size, (i + 1) * size) }));
        }
    };

    const receive = (peer, data, onMessage, allowParts, whole = false) => {
        if (typeof data !== "string" || (!whole && data.length > CHUNK * 2)) return;
        let message;
        try {
            message = JSON.parse(data);
        } catch (e) {
            return;
        }
        if (!message || typeof message !== "object" || typeof message.t !== "string") return;
        if (message.t !== "part") return onMessage(message);

        const { id, i, n, d } = message;
        const parts = typeof allowParts === "function" ? allowParts() : allowParts;
        if (!parts || typeof id !== "string" || !Number.isInteger(n) || n < 2 || n > 400 ||
            !Number.isInteger(i) || i < 0 || i >= n || typeof d !== "string") return;
        peer.parts ||= new Map();
        let entry = peer.parts.get(id);
        if (!entry) {
            if (peer.parts.size > 3) peer.parts.clear();
            entry = { n, got: 0, pieces: [] };
            peer.parts.set(id, entry);
        }
        if (entry.n !== n || entry.pieces[i] !== undefined) return;
        entry.pieces[i] = d;
        if (++entry.got < n) return;
        peer.parts.delete(id);
        receive(peer, entry.pieces.join(""), onMessage, false, true);
    };

    // =================== HOST ===================

    const guests = () => room && room.role === "host" ? [...room.peers.values()].filter(peer => peer.status === "admitted") : [];
    const broadcast = message => guests().forEach(peer => send(peer, message));

    const publicSettings = () => ({
        control: room.settings.control,
        streaming: room.settings.streaming && canStream,
        media: room.settings.media === true,
        title: room.title
    });

    // The file open in this browser's player (not a stream it's watching)
    const fileInfo = () => hasMedia() && !together.stream && currentSource ? {
        name: currentSource.name,
        size: currentSource.size,
        duration: Number.isFinite(mainVideo.duration) ? mainVideo.duration : 0,
        title: savedTitle(currentSource.name, currentSource.size),
        audio: container.classList.contains("audio-mode")
    } : null;

    // The room's video: the host's own file, or the one a guest is sharing from their device.
    // `stream`: whether guests can watch it as a stream (a guest's video always comes that way).
    const currentMedia = () => {
        if (room.yt) {
            // Each video in the queue is its own item, even the same video added twice
            const y = room.yt;
            return {
                name: `youtube:${y.queue[y.index].k}:${y.id}`, size: 0, duration: y.duration, title: y.title || "YouTube video", audio: false,
                from: y.by.id, fromName: y.by.name, stream: false,
                yt: { id: y.id, index: y.index, count: y.queue.length }
            };
        }
        if (room.presenter) return { ...room.presentFile, from: room.presenter.id, fromName: room.presenter.name, stream: true };
        const file = fileInfo();
        return file && { ...file, from: room.id, fromName: room.name, stream: room.settings.streaming && canStream };
    };

    // Tells everyone which video is on, and announces a new one in the chat
    const shareFile = () => {
        if (!room || room.role !== "host") return;
        const file = room.file = currentMedia();
        broadcast({ t: "file", file });
        const key = mediaKey(file);
        if (key !== room.mediaKey) {
            room.mediaKey = key;
            shareMembers();
        }
        // A YouTube video is announced once its title is known
        if (file && room.announced !== key && (!room.yt || room.yt.title)) {
            room.announced = key;
            const place = file.yt && file.yt.count > 1 ? ` (${file.yt.index + 1} of ${file.yt.count})` : "";
            notice(`${file.fromName} is playing “${file.title}”${place}`);
        }
        renderNow();
    };

    // Where the room's video is: the host's player, or the last report from the guest sharing it
    const playback = () => (room.presenter || room.yt) && room.state ? {
        paused: room.state.paused,
        time: Math.min(expectedTime(), (room.file && room.file.duration) || Infinity),
        rate: room.state.rate
    } : {
        paused: !hasMedia() || together.stream ? true : mainVideo.paused,
        time: together.stream ? 0 : mainVideo.currentTime || 0,
        rate: mainVideo.playbackRate
    };

    // Who caused the next play/pause/seek: the host, the guest sharing the video, or a guest
    // whose request is being applied
    const stateMessage = (cause = null, by = null) => {
        by ||= room.attribution && Date.now() < room.attribution.until ? room.attribution
            : room.presenter ? { name: room.presenter.name, id: room.presenter.id } : { name: room.name, id: room.id };
        return {
            t: "state",
            ...playback(),
            at: now(),
            cause,
            by: cause ? by.name : null,
            byId: cause ? by.id : null
        };
    };

    const subtitleCues = () => {
        const track = mainVideo.textTracks[0];
        if (!hasMedia() || !track || !track.cues || !track.cues.length) return null;
        return Array.from(track.cues).slice(0, 5000)
            .map(cue => [+cue.startTime.toFixed(3), +cue.endTime.toFixed(3), String(cue.text).slice(0, 500)]);
    };
    // The subtitles of the room's video, for everyone but the guest sharing it
    const sendSubtitles = peer => {
        const message = { t: "subs", cues: room.presenter ? room.presentCues : subtitleCues() };
        if (peer) return send(peer, message);
        guests().forEach(guest => guest !== room.presenter && send(guest, message));
    };

    const notice = text => {
        addMessage({ system: true, text });
        broadcast({ t: "notice", text });
    };

    // The host keeps recent messages to quote replies and count reactions; nothing is stored
    const shareChat = (fromId, name, avatar, text, replyId) => {
        const original = typeof replyId === "string" && room.chatLog.get(replyId);
        const reply = original ? { id: replyId, name: original.name, text: original.text.slice(0, 140) } : null;
        const message = { t: "chat", id: Signaling.newId().slice(0, 16), from: fromId, name, avatar, text, reply, at: Date.now() };
        room.chatLog.set(message.id, { name, text, reactions: new Map() });
        if (room.chatLog.size > 300) room.chatLog.delete(room.chatLog.keys().next().value);
        broadcast(message);
        addMessage({ ...message, self: fromId === room.id });
    };

    const applyReaction = (personId, name, id, emoji) => {
        const entry = room.chatLog.get(id);
        if (!entry || !REACTIONS.includes(emoji)) return;
        const people = entry.reactions.get(emoji) || new Map();
        if (people.has(personId)) people.delete(personId);
        else people.set(personId, name);
        if (people.size) entry.reactions.set(emoji, people);
        else entry.reactions.delete(emoji);
        const list = [...entry.reactions].map(([e, who]) => ({ e, ids: [...who.keys()], names: [...who.values()] }));
        broadcast({ t: "reactions", id, list });
        renderReactions(id, list);
    };

    const shareMembers = () => {
        const sharer = room.file ? room.file.from : null;
        const members = [
            { id: room.id, name: room.name, avatar: room.avatar, host: true, sharing: sharer === room.id, mic: micEnabled },
            ...guests().map(peer => ({ id: peer.id, name: peer.name, avatar: peer.avatar, stream: peer.wantsStream, sharing: sharer === peer.id, route: peer.route, mic: !!peer.micOn }))
        ];
        broadcast({ t: "members", members });
        shareSuccession();
        renderPeople(members);
        renderState();
        // Who sees whose camera follows who's in the room (and their names)
        syncCameras();
    };

    const renderRequests = () => {
        const waiting = [...room.peers.values()].filter(peer => peer.status === "waiting");
        // Answered in the People tab, or gone: its pop-up goes too
        [...knockToasts.keys()].filter(id => !waiting.some(peer => peer.id === id)).forEach(clearKnock);
        requestList.replaceChildren(...waiting.map(peer => {
            const item = el("li", "room-request");
            const text = el("p");
            text.append(el("b", null, peer.name), el("small", null, "wants to join"));
            item.append(makeAvatar(peer.name, peer.avatar, "small"));
            const admitBtn = el("button", "room-small-btn primary", "Let in");
            admitBtn.dataset.admit = peer.id;
            admitBtn.title = `Let ${peer.name} into the room`;
            const denyBtn = el("button", "room-small-btn", "Deny");
            denyBtn.dataset.deny = peer.id;
            denyBtn.title = `Don't let ${peer.name} in`;
            item.append(text, denyBtn, admitBtn);
            return item;
        }));
        updateBadges();
    };

    const updateHostProfile = oldName => {
        if (room.file && room.file.from === room.id) shareFile();
        shareMembers();
        if (oldName !== room.name) notice(`${oldName} is now ${room.name}`);
    };

    // ---------- Streaming the host's video

    // The picture and sound of this browser's player. The host streams it to guests; a guest
    // sharing a video sends it to the host, who passes it on.
    const onCaptureChange = () => room && (room.role === "host" ? updateStreams() : syncPresenterTracks());
    // When the player's source changes, Chrome adds the new picture and sound to the capture
    // without always removing the old ones, so the newest track is the one that's playing
    const newest = tracks => tracks.filter(track => track.readyState === "live").pop() || null;
    const captureSource = () => {
        if (!captured && canStream) {
            captured = mainVideo.captureStream();
            captured.addEventListener("addtrack", onCaptureChange);
            captured.addEventListener("removetrack", onCaptureChange);
        }
        return captured;
    };

    const stopCapture = () => {
        if (!captured) return;
        captured.getTracks().forEach(track => track.stop());
        captured = null;
    };

    const tuneSender = async (sender, kind, peer) => {
        try {
            const params = sender.getParameters();
            if (!params.encodings || !params.encodings.length) return;
            if (kind === "video") {
                // A guest sends their video to the host only, so it goes in high quality
                const chosen = room.role === "host" ? room.settings.quality : "high";
                const quality = peer.route === "lan" && chosen !== "saver" ? QUALITY.lan : QUALITY[chosen] || QUALITY.standard;
                params.encodings[0].maxBitrate = quality.bitrate;
                params.encodings[0].scaleResolutionDownBy = Math.max(1, (mainVideo.videoHeight || quality.height) / quality.height);
            } else {
                params.encodings[0].maxBitrate = 256000;
            }
            await sender.setParameters(params);
        } catch (e) {}
    };

    const setTrack = (sender, track, kind, peer) => {
        if (!sender) return;
        const done = () => track && tuneSender(sender, kind, peer);
        if (sender.track === track) return done();
        sender.replaceTrack(track).then(done).catch(() => {});
    };

    // Each guest who wants the stream gets the room's video: the host's own picture and sound, or
    // the video a guest is sharing, passed on as it arrives. The guest sharing it gets nothing back.
    const updateStreams = () => {
        if (!room || room.role !== "host") return;
        const presenter = room.presenter;
        const source = presenter ? presenter.mediaStream
            : room.settings.streaming && canStream && !together.stream && hasMedia() && guests().some(peer => peer.wantsStream) ? captureSource() : null;
        const video = source ? newest(source.getVideoTracks()) : null;
        const audio = source ? newest(source.getAudioTracks()) : null;
        if (video) video.contentHint = "motion";
        if (audio) audio.contentHint = "music";
        for (const peer of room.peers.values()) {
            const on = peer.status === "admitted" && peer.wantsStream && peer !== presenter;
            setTrack(peer.senders.video, on ? video : null, "video", peer);
            setTrack(peer.senders.mediaAudio, on ? audio : null, "audio", peer);
        }
    };

    // ---------- A guest sharing a video from their device
    // Their browser plays the file and is in charge of it: it sends the picture and sound to the
    // host, reports play/pause/jumps, and gets everyone else's requests passed on by the host.

    const setPresenter = (peer, file, message) => {
        const previous = room.presenter;
        const same = previous === peer && room.presentFile && fileKey(room.presentFile) === fileKey(file);
        // A YouTube video gives way (enterStream switches the player over)
        room.yt = room.ytToken = null;
        if (previous && previous !== peer) send(previous, { t: "present-end", reason: "replaced", by: peer.name });
        room.presenter = peer;
        room.presentFile = file;
        room.state = { ...validState(message), at: now() };
        if (!same) room.presentCues = null;
        room.cues = room.presentCues;
        // The host's own video gives way, and the host watches like everyone else
        if (!together.stream) releaseMedia();
        stopCapture();
        room.remote = peer.mediaStream;
        shareFile();
        enterStream();
        broadcast(stateMessage());
        if (!same) sendSubtitles();
        updateStreams();
        shareMembers();
    };

    // Back to no video (the host's player shows "Select a movie")
    const clearPresenter = () => {
        if (!room.presenter) return;
        room.presenter = room.presentFile = room.presentCues = room.state = room.cues = room.remote = null;
        leaveStream();
        uploadOverlay.classList.remove("hidden");
        shareFile();
        broadcast(stateMessage());
        sendSubtitles();
        updateStreams();
        shareMembers();
    };

    const onPresenterState = (peer, message) => {
        const previous = room.state;
        room.state = { ...validState(message), at: now() };
        if (finite(message.duration, 1, 1e7) && Math.abs(message.duration - room.presentFile.duration) > 1) {
            room.presentFile.duration = message.duration;
            shareFile();
        }
        const cause = ["play", "pause", "seek", "rate"].includes(message.cause) ? message.cause : null;
        // A change someone asked for is theirs, not the presenter's
        const asker = message.by === room.id ? { id: room.id, name: room.name } : guests().find(guest => guest.id === message.by);
        const by = asker ? { id: asker.id, name: asker.name } : { id: peer.id, name: peer.name };
        broadcast(stateMessage(cause, by));
        if (cause && by.id !== room.id) stateFeedback(previous, room.state, cause, by.name);
        streamTick();
        renderHomeBar();
    };

    // Play, pause, jumps and speed for a guest's video happen in that guest's browser
    const controlPresenter = (by, change) => {
        const message = { t: "pcontrol", by: by.id };
        if (finite(change.rate, 0.25, 4)) message.rate = Math.round(change.rate * 100) / 100;
        if (finite(change.time, 0, 1e7)) message.time = change.time;
        if (typeof change.paused === "boolean") message.paused = change.paused;
        send(room.presenter, message);
    };

    // Takes the room's video off for everyone. `by`: the host or a guest
    const removeMedia = by => {
        const file = room.file;
        if (!file) return;
        if (room.yt) {
            clearYouTube();
        } else if (room.presenter) {
            if (room.presenter !== by) send(room.presenter, { t: "present-end", reason: "removed", by: by.name });
            clearPresenter();
        } else {
            unloadPlayer();
            shareFile();
            broadcast(stateMessage());
            updateStreams();
        }
        notice(`${by.name} removed “${file.title}”`);
    };

    // The host opening a video replaces a guest's for everyone
    const onHostFile = () => {
        if (!room) return;
        room.ytToken = null;
        if (room.yt) return clearYouTube();
        if (!room.presenter) return;
        send(room.presenter, { t: "present-end", reason: "replaced", by: room.name });
        clearPresenter();
    };

    const syncSettingsUI = () => {
        settingInputs.forEach(input => {
            const value = room.settings[input.dataset.setting];
            if (input.type === "checkbox") input.checked = value;
            else input.value = value;
        });
        const streaming = hostSettings.querySelector('[data-setting="streaming"]');
        streaming.disabled = !canStream;
        qualityField.hidden = !room.settings.streaming;
        streamNote.hidden = canStream;
        streamNote.textContent = "Streaming needs Chrome or Edge on this computer. Guests can still play their own copy of the movie in sync.";
    };

    roomNameInput.addEventListener("change", () => {
        if (!room || room.role !== "host") return;
        room.title = clean(roomNameInput.value, 40) || `${room.name}'s room`;
        roomNameInput.value = room.title;
        broadcast({ t: "settings", ...publicSettings() });
        renderState();
        rememberRoom();
    });
    roomNameInput.addEventListener("keydown", e => e.key === "Enter" && roomNameInput.blur());

    hostSettings.addEventListener("change", e => {
        const key = e.target.dataset.setting;
        if (!key || !room || room.role !== "host") return;
        room.settings[key] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        qualityField.hidden = !room.settings.streaming;
        shareSuccession();
        if (key === "streaming" || key === "quality") updateStreams();
        if (key === "control" || key === "streaming" || key === "media") {
            broadcast({ t: "settings", ...publicSettings() });
            if (key === "streaming") shareFile();
            shareMembers();
        }
        // Turning the lobby off lets in everyone who's waiting
        if (key === "lobby" && !room.settings.lobby) {
            [...room.peers.values()].filter(peer => peer.status === "waiting").forEach(peer => admit(peer));
        }
    });

    // ---------- People coming and going

    const dropPeer = (peer, quietly = false) => {
        if (!room || room.role !== "host" || room.peers.get(peer.id) !== peer) return;
        const wasIn = peer.status === "admitted";
        room.peers.delete(peer.id);
        closePeer(peer);
        renderRequests();
        if (wasIn) {
            const sharing = room.presenter === peer;
            if (sharing) clearPresenter();
            shareMembers();
            updateStreams();
            if (!quietly) notice(sharing ? `${peer.name} left, so their video stopped` : `${peer.name} left`);
        } else if (room.presenter === peer) {
            clearPresenter();
        }
    };

    // Turns someone away (lobby denied, removed, locked or full room)
    const refuse = (peer, reason) => {
        const wasIn = peer.status === "admitted";
        send(peer, { t: "denied", reason });
        peer.status = "refused";
        renderRequests();
        if (room.presenter === peer) clearPresenter();
        if (wasIn) {
            shareMembers();
            updateStreams();
        }
        setTimeout(() => dropPeer(peer, true), 500);
    };

    const admit = (peer, rejoined = false) => {
        if (peer.status !== "waiting" && peer.status !== "connecting") return;
        // Someone reconnecting replaces their old, broken connection
        for (const other of room.peers.values()) {
            if (other !== peer && other.ticket && other.ticket === peer.ticket) {
                other.status = "refused";
                dropPeer(other, true);
            }
        }
        peer.status = "admitted";
        peer.ticket ||= Signaling.newId();
        room.tickets.add(peer.ticket);
        trackTicket(peer.ticket);
        if (!room.approved.includes(peer.ticket)) {
            room.approved.push(peer.ticket);
            saveApprovedTickets(room.code, room.approved);
        }
        send(peer, {
            ...stateMessage(),
            t: "welcome",
            ticket: peer.ticket,
            host: room.name,
            hostId: room.id,
            settings: publicSettings(),
            file: currentMedia()
        });
        sendSubtitles(peer);
        if (room.yt) send(peer, queueMessage());
        renderRequests();
        shareMembers();
        updateStreams();
        notice(rejoined ? `${peer.name} reconnected` : `${peer.name} joined`);
    };

    requestList.addEventListener("click", e => {
        const button = e.target.closest("button");
        if (!button || !room) return;
        const peer = room.peers.get(button.dataset.admit || button.dataset.deny);
        if (!peer || peer.status !== "waiting") return;
        if (button.dataset.admit) admit(peer);
        else refuse(peer, "denied");
    });

    peopleList.addEventListener("click", e => {
        const button = e.target.closest("button[data-remove]");
        if (!button || !room || room.role !== "host") return;
        const peer = room.peers.get(button.dataset.remove);
        if (!peer || peer.status !== "admitted" || !confirm(`Remove ${peer.name} from the room?`)) return;
        room.tickets.delete(peer.ticket);
        room.hashes.delete(peer.ticket);
        if (peer.ticket) fingerprint(peer.ticket).then(hash => {
            if (!room || room.role !== "host") return;
            room.inherited.delete(hash);
            shareSuccession();
        });
        refuse(peer, "removed");
        notice(`${peer.name} was removed from the room`);
    });

    // A guest's playback request (when guests may control playback)
    const applyControl = (peer, message) => {
        if (room.yt) return controlYouTube(peer, message);
        if (room.presenter) return room.presenter !== peer && controlPresenter(peer, message);
        if (!hasMedia() || together.stream) return;
        room.attribution = { name: peer.name, id: peer.id, until: Date.now() + 1500 };
        if (finite(message.rate, 0.25, 4)) mainVideo.defaultPlaybackRate = mainVideo.playbackRate = Math.round(message.rate * 100) / 100;
        if (finite(message.time, 0, 1e7)) mainVideo.currentTime = Math.min(message.time, mainVideo.duration || message.time);
        if (message.paused === true) mainVideo.pause();
        else if (message.paused === false) mainVideo.play().catch(() => {});
    };

    // Someone saying hello: straight in with a ticket from this host or one before it, or the
    // owner's key; otherwise the room's rules (locked, full, the lobby)
    const greet = async (peer, message) => {
        const host = room;
        const ticket = typeof message.ticket === "string" ? message.ticket.slice(0, 64) : null;
        let known = !!ticket && (host.tickets.has(ticket) || host.approved.includes(ticket));
        if (!known && ticket && host.inherited.size) known = host.inherited.has(await fingerprint(ticket));
        const owner = typeof message.owner === "string" && !!host.ownerTag && await fingerprint(message.owner.slice(0, 128)) === host.ownerTag;
        if (room !== host || peer.status !== "connecting") return;
        if (owner) peer.owner = true;
        if (known || owner) {
            if (ticket) peer.ticket = ticket;
            return admit(peer, true);
        }
        if (host.settings.locked) return refuse(peer, "locked");
        if (guests().length >= MAX_GUESTS) return refuse(peer, "full");
        if (!host.settings.lobby) return admit(peer);
        peer.status = "waiting";
        send(peer, { t: "waiting" });
        renderRequests();
        announceKnock(peer);
    };

    const hostHandle = (peer, message) => {
        if (message.t === "ping") {
            if (finite(message.c, -1e13, 1e13)) send(peer, { t: "pong", c: message.c, h: now() });
            return;
        }
        if (message.t === "hello") {
            if (peer.status !== "connecting") return;
            clearTimeout(peer.timer);
            peer.name = clean(message.name, 30) || "Guest";
            peer.avatar = validAvatar(message.avatar);
            // Video can't go through the relays, only messages
            peer.wantsStream = !peer.channel.isTunnel && message.stream !== false;
            return greet(peer, message);
        }
        if (peer.status !== "admitted") return;
        if (message.t === "chat") {
            const text = clean(message.text, 500);
            if (text && allow(peer, "chat", 5, 5000)) shareChat(peer.id, peer.name, peer.avatar, text, message.reply);
        } else if (message.t === "react") {
            if (typeof message.id === "string" && allow(peer, "react", 20, 10000)) applyReaction(peer.id, peer.name, message.id, message.emoji);
        } else if (message.t === "control") {
            if (room.settings.control && allow(peer, "control", 12, 5000)) applyControl(peer, message);
        } else if (message.t === "present") {
            // A guest shares a video from their device (or updates the one they're sharing)
            if (!allow(peer, "present", 6, 10000) || !peer.mediaStream) return;
            const file = validFile(message.file);
            if (!file) return;
            if (room.settings.media !== true && room.presenter !== peer) return send(peer, { t: "present-end", reason: "off" });
            setPresenter(peer, file, message);
        } else if (message.t === "pstate") {
            if (room.presenter === peer && allow(peer, "pstate", 80, 10000)) onPresenterState(peer, message);
        } else if (message.t === "psubs") {
            if (room.presenter !== peer || !allow(peer, "psubs", 4, 10000)) return;
            room.presentCues = room.cues = validCues(message.cues);
            if (together.stream) subtitlesBtn.classList.toggle("active", !!room.cues && room.cuesOn);
            sendSubtitles();
        } else if (message.t === "unpresent") {
            if (room.presenter !== peer) return;
            const title = room.presentFile.title;
            clearPresenter();
            notice(`${peer.name} stopped sharing “${title}”`);
        } else if (message.t === "youtube") {
            // A guest shares a YouTube video or playlist
            if (room.settings.media !== true || !allow(peer, "youtube", 5, 10000)) return;
            const ref = validYouTube(message);
            if (ref) setYouTube(peer, ref, ["now", "end", "play"].includes(message.where) ? message.where : "now");
        } else if (message.t === "ytstep") {
            if (room.yt && room.settings.control && allow(peer, "ytstep", 6, 5000) && (message.step === 1 || message.step === -1)) ytStep(message.step);
        } else if (message.t === "queue-op") {
            // Play one now, move one, or take one out of the YouTube queue
            if (room.settings.media === true && allow(peer, "queue-op", 20, 10000)) queueOp(peer, message);
        } else if (message.t === "remove") {
            if (room.settings.media === true && allow(peer, "remove", 4, 10000)) removeMedia(peer);
        } else if (message.t === "want") {
            peer.wantsStream = !peer.channel.isTunnel && message.stream === true;
            updateStreams();
            shareMembers();
        } else if (message.t === "end") {
            // A participant or owner ends the room for everyone
            if (!allow(peer, "end", 3, 10000)) return;
            const host = room;
            if (typeof message.owner === "string" && host.ownerTag) {
                fingerprint(message.owner.slice(0, 128)).then(hash => {
                    if (room !== host || hash !== host.ownerTag) return;
                    endedByOwner(message.by || peer.name);
                });
            } else {
                endedByOwner(message.by || peer.name);
            }
        } else if (message.t === "mic") {
            if (peer.status !== "admitted" || !allow(peer, "mic", 10, 10000)) return;
            const on = message.on === true;
            if (on === !!peer.micOn) return;
            peer.micOn = on;
            shareMembers();
        } else if (message.t === "cam") {
            if (peer.status !== "admitted" || !allow(peer, "cam", 10, 10000)) return;
            const on = message.on === true && !!peer.camTransceiver;
            if (on === !!peer.camOn) return;
            peer.camOn = on;
            syncCameras();
        } else if (message.t === "profile") {
            if (!allow(peer, "profile", 5, 10000)) return;
            const old = peer.name;
            peer.name = clean(message.name, 30) || old;
            peer.avatar = validAvatar(message.avatar);
            if (room.presenter === peer) shareFile();
            shareMembers();
            if (peer.name !== old) notice(`${old} is now ${peer.name}`);
        } else if (message.t === "bye") {
            dropPeer(peer);
        }
    };

    const acceptOffer = async (id, pub, sealedSdp) => {
        const host = room;
        const peer = { id, name: "Someone", avatar: "", status: "connecting", wantsStream: true, senders: {}, rate: {} };
        host.peers.set(id, peer);
        try {
            const key = await Signaling.pairSecret(host.pair, pub, host.signal.salt);
            const sdp = await Signaling.unsealText(key, sealedSdp);
            Object.assign(peer, newConnection(host.relay));
            const pendingTracks = [];
            peer.pc.ontrack = event => {
                pendingTracks.push(event);
            };
            // Long messages (a shared video's subtitles) only from people who are in
            wirePeer(peer, message => room === host && hostHandle(peer, message), () => dropPeer(peer), () => peer.status === "admitted");
            watchRoute(peer, () => {
                updateStreams();
                shareMembers();
            });
            await peer.pc.setRemoteDescription({ type: "offer", sdp });
            const transceivers = peer.pc.getTransceivers();
            // Video: the shared video's is always the last; before it (a newer guest's), their
            // camera and the cameras passed on to them
            const videos = transceivers.filter(transceiver => transceiver.receiver.track.kind === "video");
            peer.camSlots = [];
            for (const transceiver of transceivers) {
                if (transceiver.receiver.track.kind === "video") {
                    transceiver.direction = "sendrecv";
                    if (transceiver === videos[videos.length - 1]) peer.senders.video = transceiver.sender;
                    else if (transceiver === videos[0]) peer.camTransceiver = transceiver;
                    else if (peer.camSlots.length < CAM_SLOTS) peer.camSlots.push(transceiver);
                } else if (!peer.senders.mediaAudio) {
                    transceiver.direction = "sendrecv";
                    peer.senders.mediaAudio = transceiver.sender;
                } else {
                    transceiver.direction = "sendrecv";
                    peer.voiceTransceiver = transceiver;
                    peer.voiceSender = transceiver.sender;
                }
            }
            // The picture and sound of a video this guest shares (silent until they do)
            peer.mediaStream = new MediaStream();
            peer.pc.ontrack = event => {
                if (event.transceiver === peer.voiceTransceiver) return attachRemoteVoice(peer, event.track);
                // Cameras are shown in the strip, not as the video
                if (event.transceiver === peer.camTransceiver || peer.camSlots.includes(event.transceiver)) return;
                if (!peer.mediaStream.getTracks().includes(event.track)) peer.mediaStream.addTrack(event.track);
            };
            pendingTracks.forEach(event => peer.pc.ontrack(event));
            syncMicrophonePeer(peer);
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription({ type: "answer", sdp: tuneAudio(answer.sdp) });
            await gathered(peer.pc);
            if (room !== host || host.peers.get(id) !== peer) return;
            peer.answer = { t: "answer", from: host.id, to: id, sdp: await Signaling.sealText(key, peer.pc.localDescription.sdp) };
            host.signal.send(peer.answer);
            // Give up on anyone who never finishes connecting
            peer.timer = setTimeout(() => peer.status === "connecting" && dropPeer(peer, true), 30000);
        } catch (e) {
            peer.status = "refused";
            dropPeer(peer, true);
        }
    };

    // A guest whose direct connection didn't open: the room goes through the relays for them
    const acceptTunnel = async (id, pub) => {
        const host = room;
        const key = await Signaling.pairSecret(host.pair, pub, host.signal.salt);
        if (room !== host || host.peers.has(id)) return;
        const peer = { id, name: "Someone", avatar: "", status: "connecting", wantsStream: false, senders: {}, rate: {}, route: "tunnel", pc: null };
        peer.channel = newTunnel(host.signal, key, host.id, id);
        host.peers.set(id, peer);
        wirePeer(peer, message => room === host && hostHandle(peer, message), () => dropPeer(peer), () => peer.status === "admitted");
        peer.channel.open();
        host.signal.send({ t: "tunnel-ok", from: host.id, to: id });
        peer.timer = setTimeout(() => peer.status === "connecting" && dropPeer(peer, true), 30000);
    };

    const hostSignal = message => {
        const host = room;
        const { t, from } = message;
        if (typeof from !== "string" || from.length > 40 || from === host.id) return;
        if (t === "tun") {
            const peer = message.to === host.id && typeof message.d === "string" && host.peers.get(from);
            if (peer && peer.channel && peer.channel.isTunnel) peer.channel.deliver(message.d);
            return;
        }
        if (t === "tunnel" && message.to === host.id) {
            const existing = host.peers.get(from);
            // Asked again: the reply got lost
            if (existing && existing.channel && existing.channel.isTunnel) return host.signal.send({ t: "tunnel-ok", from: host.id, to: from });
            const pub = host.knocks.get(from);
            if (!pub || (existing && existing.status !== "connecting")) return;
            // The direct connection that never opened gives way
            if (existing) dropPeer(existing, true);
            if (host.peers.size < MAX_GUESTS + 6) acceptTunnel(from, pub);
            return;
        }
        // Another browser hosting this room: the newest claim wins (more hosts before it; between
        // equals, the smaller id); the other one hears straight away that it should give way
        if (t === "host") {
            if (!finite(message.epoch, 0, 1e6) || host.yielding) return;
            if (message.epoch > host.epoch || (message.epoch === host.epoch && from < host.id)) return yieldTo();
            if (now() - (host.claimedAt || 0) > 1000) {
                host.claimedAt = now();
                host.signal.send({ t: "host", from: host.id, epoch: host.epoch });
            }
            return;
        }
        if (t === "knock") {
            if (typeof message.pub !== "string" || message.pub.length > 200) return;
            const reason = host.settings.locked && !message.rejoin ? "locked" : guests().length >= MAX_GUESTS ? "full" : null;
            if (reason) return host.signal.send({ t: "refuse", from: host.id, to: from, reason });
            if (host.knocks.size > 100) host.knocks.clear();
            host.knocks.set(from, message.pub);
            host.signal.send({ t: "hi", from: host.id, to: from, pub: host.pair.pub });
        } else if (t === "offer" && message.to === host.id && typeof message.sdp === "string" && message.sdp.length < 40000) {
            const existing = host.peers.get(from);
            // A repeated offer means our answer got lost: send it again
            if (existing) return existing.answer && host.signal.send(existing.answer);
            const pub = host.knocks.get(from);
            if (pub && host.peers.size < MAX_GUESTS + 6) acceptOffer(from, pub, message.sdp);
        }
    };

    // `owner`: this browser's key to the room it created (its owner can always end it, and is let
    // straight in); `ownerTag`: the key's fingerprint, known to everyone; `ticket`: this browser's
    // ticket in the room, if it was let in before. `takeover`: a guest carrying the room on after
    // its host left (see takeOver): what it knew of the room.
    const startHost = async ({ name, avatar, password, relay, title, code, remember, owner = null, ownerTag = null, ticket = null, takeover = null }) => {
        const hostCode = code || Signaling.newCode();
        const ownerSecret = takeover ? takeover.ownerSecret : owner || (ownerTag ? null : Signaling.newId() + Signaling.newId());
        const host = room = {
            role: "host",
            code: hostCode,
            title: title || `${name}'s room`,
            password, name, avatar, relay, remember,
            id: Signaling.newId(),
            // Who hosts the room after whom: each host that carries it on counts one more
            epoch: takeover ? takeover.epoch : 0,
            ownerSecret,
            ownerTag: (takeover ? takeover.ownerTag : ownerTag) || null,
            myTicket: takeover ? takeover.ticket : ticket,
            // Fingerprints of the tickets of people let in by the hosts before (see succession)
            inherited: new Set(takeover ? takeover.tickets : []),
            hashes: new Map(),
            settings: { lobby: true, control: true, streaming: canStream, media: true, quality: "standard", locked: false, ...(takeover ? takeover.settings : {}) },
            approved: approvedTickets(hostCode),
            // The room's video (see currentMedia) and, while a guest shares one, their playback
            file: null, mediaKey: null, announced: null,
            presenter: null, presentFile: null, presentCues: null,
            // A YouTube video or playlist; the host keeps its clock in `state`
            yt: null, ytToken: null,
            state: null, offset: 0, remote: null, cues: null, cuesOn: subtitlePref.wants(),
            peers: new Map(),
            knocks: new Map(),
            tickets: new Set(),
            chatLog: new Map(),
            attribution: null,
            timers: []
        };
        if (!takeover) showStatus({ icon: "fa-door-open", title: "Creating your room…", busy: true, onClose: () => leaveRoom(false) });
        try {
            if (!host.ownerTag && ownerSecret) host.ownerTag = await fingerprint(ownerSecret);
            await loadTurn();
            host.pair = await Signaling.newPairKey();
            host.signal = await Signaling.join({
                code: host.code, password,
                onMessage: message => room === host && hostSignal(message),
                onChange: () => room === host && renderState()
            });
        } catch (e) {
            if (room === host) room = null;
            return showStatus({
                icon: "fa-triangle-exclamation", title: "Couldn't create the room", text: e.message,
                actions: [{ label: "Close", onClick: closeDialog }],
                onClose: closeDialog
            });
        }
        if (room !== host) return host.signal.close();
        // Saying it hosts the room, now and then: another browser hosting it too (its connection
        // came back, or it's the owner opening it again) gives way to the newest (see hostSignal)
        const announce = () => room === host && host.signal.send({ t: "host", from: host.id, epoch: host.epoch });
        host.timers.push(setInterval(announce, 4000));
        announce();
        host.approved.forEach(trackTicket);
        // Regular updates keep guests' timelines and sync accurate
        host.timers.push(setInterval(() => broadcast(stateMessage()), 3000));
        host.timers.push(setInterval(() => room === host && hostYouTubeTick(), 1000));
        syncSettingsUI();
        // A YouTube video watched alone carries on in the room, from where it is (youtube.js)
        const fromSolo = together.solo && together.solo.handOff();
        // A video that's already open becomes the room's video
        host.file = currentMedia();
        host.mediaKey = host.announced = mediaKey(host.file);
        // Carrying the room on: its chat stays on screen
        enterRoomUI(!!takeover);
        rememberRoom();
        renderPeople([{ id: host.id, name: host.name, avatar: host.avatar, host: true }]);
        hideOverlay();
        if (takeover) {
            addMessage({ system: true, text: `${takeover.from} left, so you're hosting the room now. Everyone carries on with you.` });
            if (takeover.yt) continueYouTube(takeover.yt);
            else if (!currentFile) uploadOverlay.classList.remove("hidden");
            return;
        }
        addMessage({ system: true, text: "Room created. Invite people with the link, the QR code, or the room code and password. Messages aren't saved anywhere." });
        if (fromSolo) setYouTube({ id: host.id, name: host.name }, fromSolo, "now");
        else if (!currentFile) uploadOverlay.classList.remove("hidden");
    };

    // The YouTube video (and queue) the room was watching goes on from where it was
    const continueYouTube = kit => {
        const items = kit.items.map(item => ({ k: item.k, id: item.id, title: item.title, by: { id: "", name: item.by } }));
        if (!items.length) return;
        const index = Math.min(kit.index, items.length - 1);
        room.yt = { queue: items, index, id: null, title: "", by: items[index].by, duration: 0 };
        room.state = room.cues = null;
        playQueued(index, kit.time);
        if (kit.paused) {
            room.state = { ...room.state, paused: true, time: kit.time, at: now() };
            broadcast(stateMessage());
        }
        enterYouTube();
        updateStreams();
        shareMembers();
        fetchTitles();
    };

    // ---------- Who carries the room on: everyone hears, with the people in the room, what
    // the next host needs to let them straight back in: the fingerprints of their tickets and of
    // the owner's key, the room's settings, and how many hosts it has had (the "epoch")
    const trackTicket = ticket => {
        const host = room;
        if (!host || host.role !== "host" || !ticket || host.hashes.has(ticket)) return;
        host.hashes.set(ticket, null);
        fingerprint(ticket).then(hash => {
            if (room !== host || !host.hashes.has(ticket)) return;
            host.hashes.set(ticket, hash);
            shareSuccession();
        });
    };

    const shareSuccession = () => {
        if (!room || room.role !== "host") return;
        const tickets = [...new Set([...room.inherited, ...[...room.hashes.values()].filter(Boolean)])].slice(-200);
        const message = { t: "succession", epoch: room.epoch, owner: room.ownerTag, tickets, lobby: room.settings.lobby, locked: room.settings.locked, quality: room.settings.quality };
        const said = JSON.stringify(message);
        guests().forEach(peer => {
            if (peer.successionSaid === said) return;
            peer.successionSaid = said;
            send(peer, message);
        });
    };

    // Another browser hosts this room with a newer claim (see hostSignal): those connected here
    // go over to it, and this browser joins it as a participant
    const yieldTo = () => {
        const host = room;
        if (!host || host.role !== "host" || host.yielding) return;
        host.yielding = true;
        host.peers.forEach(peer => send(peer, { t: "moved" }));
        const again = { code: host.code, password: host.password, name: host.name, avatar: host.avatar, relay: host.relay, remember: host.remember,
            ticket: host.myTicket, owner: host.ownerSecret, ownerTag: host.ownerTag, rejoining: true };
        setTimeout(() => {
            if (room !== host) return;
            teardown();
            startGuest(again);
        }, 600);
    };

    // =================== GUEST ===================

    const hostNow = () => now() + (room.offset ?? 0);

    // Where the host's video is now, from its last update and the time since
    const expectedTime = () => {
        const state = room.state;
        if (!state) return 0;
        if (state.paused || state.at === null || room.offset === null) return state.time;
        return state.time + Math.max(0, hostNow() - state.at) / 1000 * state.rate;
    };

    const validFile = file => file && typeof file === "object" && typeof file.name === "string" && finite(file.size, 0, 1e15) ? {
        name: clean(file.name, 255),
        size: file.size,
        duration: finite(file.duration, 0, 1e7) ? file.duration : 0,
        title: clean(file.title, 255) || clean(file.name, 255),
        audio: file.audio === true,
        // Who shared it, and whether it comes as a stream (older hosts don't say)
        from: typeof file.from === "string" ? file.from.slice(0, 40) : null,
        fromName: clean(file.fromName, 30),
        stream: typeof file.stream === "boolean" ? file.stream : null,
        yt: file.yt && typeof file.yt === "object" && YT_ID.test(file.yt.id) ? {
            id: file.yt.id,
            list: typeof file.yt.list === "string" && YT_LIST.test(file.yt.list) ? file.yt.list : null,
            index: Number.isInteger(file.yt.index) && file.yt.index >= 0 ? file.yt.index : 0,
            count: Number.isInteger(file.yt.count) && file.yt.count > 0 ? Math.min(file.yt.count, 5000) : 1
        } : null
    } : null;

    // The room's video can be watched as a stream
    // (not through the relays, which only carry messages)
    const streamable = () => !!room.file && !tunneled() && (room.file.stream ?? room.settings.streaming === true);
    // Name of whoever shared the room's video
    const sharerName = () => room.file && room.file.fromName || room.hostName || "The host";

    const validState = message => ({
        paused: message.paused !== false,
        time: finite(message.time, 0, 1e7) ? message.time : 0,
        rate: finite(message.rate, 0.25, 4) ? message.rate : 1,
        at: finite(message.at, -1e13, 1e13) ? message.at : null
    });

    const validCues = cues => Array.isArray(cues) ? cues
        .filter(cue => Array.isArray(cue) && finite(cue[0], 0, 1e7) && finite(cue[1], 0, 1e7) && typeof cue[2] === "string")
        .slice(0, 5000).map(([start, end, text]) => [start, end, text.slice(0, 500)]) : null;

    const ownMatches = () => !!(room.file && currentSource && room.ownFor === fileKey(room.file));

    // ---------- Subtitles

    const vttTime = time => {
        const pad = (n, size = 2) => String(n).padStart(size, "0");
        const ms = Math.round(time * 1000);
        return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
    };
    const toVtt = cues => "WEBVTT\n\n" + cues.map(([start, end, text]) =>
        `${vttTime(start)} --> ${vttTime(end)}\n${text.replace(/-->/g, "→").replace(/\n\s*\n/g, "\n")}`).join("\n\n");

    const parseSubtitles = text => {
        const time = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;
        const seconds = m => (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
        return text.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n{2,}/).map(block => {
            const lines = block.split("\n");
            const at = lines.findIndex(line => line.includes("-->"));
            if (at < 0) return null;
            const [from, to] = lines[at].split("-->").map(part => part.match(time));
            return from && to ? [seconds(from), seconds(to), lines.slice(at + 1).join("\n")] : null;
        }).filter(Boolean).slice(0, 5000);
    };

    // A guest playing their own copy gets the host's subtitles unless they loaded their own
    const applyHostSubtitles = () => {
        if (together.stream || room.presenting || !ownMatches() || !hasMedia()) return;
        const track = mainVideo.textTracks[0];
        if (track && track.label !== HOST_SUBTITLES) return;
        if (room.cues) applySubtitles(toVtt(room.cues), HOST_SUBTITLES);
        else if (track) removeSubtitles();
    };

    const renderCue = time => {
        const cue = room.cuesOn && room.cues && room.cues.find(([start, end]) => time >= start && time < end);
        const text = cue ? cue[2].replace(/<[^>]*>/g, "") : "";
        if (cueBox.textContent !== text) cueBox.textContent = text;
        cueBox.hidden = !text;
    };

    // ---------- Watching the host's stream

    const streamTick = () => {
        if (!together.stream || !room) return;
        const duration = room.file ? room.file.duration : 0;
        const time = duration ? Math.min(expectedTime(), duration) : expectedTime();
        showProgress(time, duration);
        videoDuration.innerText = formatTime(duration);
        const playing = !!room.state && !room.state.paused;
        if (room.shownPlaying !== playing) {
            room.shownPlaying = playing;
            showPlaying(playing);
        }
        renderCue(time);
        const live = room.remote.getTracks().some(track => !track.muted);
        streamWait.hidden = live;
        if (!live) streamWaitText.textContent = `Connecting to ${sharerName()}'s video…`;
    };

    // What the player's controls do while watching the stream (see `together` in script.js)
    const streamControls = {
        get paused() { return !room || !room.state || room.state.paused; },
        get rate() { return room && room.state ? room.state.rate : 1; },
        get duration() { return room && room.file ? room.file.duration : 0; },
        currentTime: () => expectedTime(),
        request: change => request(change),
        toggleSubtitles: () => {
            if (!room.cues) return showFeedback("fa-closed-captioning", "No subtitles");
            room.cuesOn = !room.cuesOn;
            subtitlePref.set(room.cuesOn);
            subtitlesBtn.classList.toggle("active", room.cuesOn);
            showFeedback("fa-closed-captioning", room.cuesOn ? "Subtitles On" : "Subtitles Off");
            streamTick();
        },
        loadSubtitles: text => {
            const cues = parseSubtitles(text);
            if (!cues.length) return showFeedback("fa-closed-captioning", "No subtitles found");
            room.cues = cues;
            room.ownCues = true;
            room.cuesOn = true;
            subtitlePref.set(true);
            subtitlesBtn.classList.add("active");
            showFeedback("fa-closed-captioning", "Subtitles On");
        }
    };

    const needsTap = () => showStatus({
        icon: "fa-circle-play",
        title: "Ready to watch",
        text: "Your browser needs a tap before it plays sound.",
        actions: [{ label: "Start watching", icon: "fa-play", onClick: () => {
            mainVideo.play().catch(() => {});
            hideOverlay();
        } }]
    });
    // Only the browser's autoplay rule needs a tap; a play() cut short by a pause is normal
    const playBlocked = error => error && error.name === "NotAllowedError" && needsTap();

    // Chrome ends the tracks a <video> was playing when it switches to another source, once
    // captureStream() has been called on it (to stream or share a video). The connection's tracks
    // have to outlive that, so the player only ever gets copies of them.
    let shownRemote = null, shownCopy = null;
    const showRemote = stream => {
        const old = shownCopy;
        shownRemote = stream;
        shownCopy = stream ? new MediaStream(stream.getTracks().map(track => track.clone())) : null;
        mainVideo.srcObject = shownCopy;
        if (old) old.getTracks().forEach(track => track.stop());
    };

    const enterStream = () => {
        if (together.stream === ytControls) leaveStream();
        const file = room.file;
        videoTitle.textContent = audioTitle.textContent = file.title;
        container.classList.toggle("audio-mode", file.audio);
        if (together.stream) {
            // Another person's video, or a new connection: same player, new source
            if (shownRemote !== room.remote) {
                showRemote(room.remote);
                mainVideo.play().catch(playBlocked);
            }
            subtitlesBtn.classList.toggle("active", !!room.cues && room.cuesOn);
            return streamTick();
        }
        cancelConversion();
        mainVideo.pause();
        removeSubtitles();
        [uploadOverlay, errorOverlay, compatBanner].forEach(item => item.classList.add("hidden"));
        together.stream = streamControls;
        container.classList.add("remote");
        showRemote(room.remote);
        mainVideo.play().catch(playBlocked);
        room.shownPlaying = null;
        subtitlesBtn.classList.toggle("active", !!room.cues && room.cuesOn);
        clearInterval(room.streamTimer);
        room.streamTimer = setInterval(streamTick, 250);
        streamTick();
    };

    const leaveStream = () => {
        if (!together.stream) return;
        const wasYouTube = together.stream === ytControls;
        together.stream = null;
        if (room) clearInterval(room.streamTimer);
        container.classList.remove("remote", "audio-mode", "youtube", "yt-ad", "yt-tap", "yt-crop", "yt-host");
        cueBox.hidden = streamWait.hidden = true;
        // Falls back to this browser's own file, if one is open
        if (wasYouTube) ytStop();
        else showRemote(null);
        videoTitle.textContent = audioTitle.textContent = currentSource ? savedTitle(currentSource.name, currentSource.size) : "No Video Loaded";
        subtitlesBtn.classList.remove("active");
        progressBar.style.width = "0%";
        currentVidTime.innerText = videoDuration.innerText = formatTime(0);
        showPlaying(false);
    };

    // ---------- A YouTube video or playlist, watched together
    // Everyone plays it in YouTube's own player, loaded from YouTube. Nothing goes through the
    // host's connection: the host keeps the room's clock (play, pause, position, speed, which
    // video of a playlist) and every player follows it, like a copy of a file does. YouTube shows
    // its ads as usual; whoever gets one catches up as soon as it ends.

    // A link to a video, a playlist, or a video in a playlist: { id, list, start }
    const parseYouTube = text => {
        let url;
        try {
            url = new URL(/^https?:\/\//i.test(text.trim()) ? text.trim() : `https://${text.trim()}`);
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
        return validYouTube({
            id, list: url.searchParams.get("list"),
            start: hms ? (+(hms[1] || 0)) * 3600 + (+(hms[2] || 0)) * 60 + (+(hms[3] || 0)) : 0
        });
    };

    const validYouTube = ref => {
        const id = typeof ref.id === "string" && YT_ID.test(ref.id) ? ref.id : null;
        const list = typeof ref.list === "string" && YT_LIST.test(ref.list) ? ref.list : null;
        return id || list ? { id, list, start: finite(ref.start, 0, 1e6) ? ref.start : 0 } : null;
    };

    // YouTube's player API, loaded the first time a room plays a YouTube video (youtube.js loads
    // it for both, so the script isn't added twice)
    let ytApiLoading = null;
    const ytApi = () => window.CineYouTube ? CineYouTube.api() : ytApiLoading ||= new Promise((resolve, reject) => {
        if (window.YT && window.YT.Player) return resolve(window.YT);
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof previous === "function") previous();
            resolve(window.YT);
        };
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.onerror = () => {
            ytApiLoading = null;
            script.remove();
            reject(new Error("YouTube can't be reached from this network"));
        };
        document.head.append(script);
    });

    // This browser's YouTube player. `loaded`: the video it has; `selfUntil`: changes until then
    // are ours, not a click on YouTube's player
    const yt = { player: null, ready: false, creating: null, loaded: null, cuedAt: 0, started: 0, lastSeek: 0, selfUntil: 0, error: null, captions: false, captionsFor: null };

    const ytPlayer = () => yt.creating ||= ytApi().then(api => new Promise(resolve => {
        const mount = el("div");
        ytMount.replaceChildren(mount);
        yt.player = new api.Player(mount, {
            host: YT_HOST,
            width: "100%",
            height: "100%",
            // CineTab's controls drive it, so everyone's player does the same
            playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, origin: location.origin },
            events: {
                onReady: () => {
                    yt.ready = true;
                    syncYouTubeVolume();
                    resolve(yt.player);
                },
                onStateChange: onYouTubeState,
                onError: onYouTubeError,
                // YouTube loaded (or dropped) its captions by itself: as the setting says instead
                onApiChange: () => together.stream === ytControls && youTubeCaptions(yt.player, yt.captions)
            }
        });
    })).catch(error => {
        yt.creating = null;
        throw error;
    });

    const ytMine = () => yt.selfUntil = now() + 1500;

    const syncYouTubeVolume = () => {
        if (!yt.ready) return;
        if (mainVideo.muted || mainVideo.volume === 0) yt.player.mute();
        else {
            yt.player.unMute();
            yt.player.setVolume(Math.round(mainVideo.volume * 100));
        }
    };
    // The player's volume slider and mute button work on YouTube's player too
    mainVideo.addEventListener("volumechange", () => together.stream === ytControls && syncYouTubeVolume());

    const ytStop = () => {
        yt.loaded = null;
        if (!yt.ready) return;
        ytMine();
        try {
            yt.player.stopVideo();
        } catch (e) {}
    };

    // What the player's controls do while the room watches YouTube (see `together` in script.js)
    const ytControls = {
        get paused() { return !room || !room.state || room.state.paused; },
        get rate() { return room && room.state ? room.state.rate : 1; },
        get duration() { return room && room.file ? room.file.duration : 0; },
        currentTime: () => expectedTime(),
        request: change => request(change),
        toggleSubtitles: () => {
            // Subtitles loaded from a file come first, then YouTube's own captions
            if (room.cues) return streamControls.toggleSubtitles();
            if (!yt.ready) return;
            yt.captions = !yt.captions;
            subtitlePref.set(yt.captions);
            youTubeCaptions(yt.player, yt.captions);
            subtitlesBtn.classList.toggle("active", yt.captions);
            showFeedback("fa-closed-captioning", yt.captions ? "YouTube captions on" : "YouTube captions off");
        },
        loadSubtitles: text => streamControls.loadSubtitles(text)
    };
    // Its picture (ambient mode, the lock screen; script.js)
    together.roomYouTubeId = () => together.stream === ytControls && room && room.file && room.file.yt ? room.file.yt.id || null : null;

    const enterYouTube = () => {
        const file = room.file;
        videoTitle.textContent = audioTitle.textContent = file.title;
        if (together.stream !== ytControls) {
            leaveStream();
            cancelConversion();
            if (hasMedia()) mainVideo.pause();
            removeSubtitles();
            [uploadOverlay, errorOverlay, compatBanner].forEach(item => item.classList.add("hidden"));
            container.classList.remove("audio-mode");
            together.stream = ytControls;
            container.classList.add("remote", "youtube");
            room.shownPlaying = null;
            yt.error = null;
            // Subtitles from a file, or YouTube's own captions as the remembered setting says
            yt.captions = !room.cues && subtitlePref.wants(true);
            subtitlesBtn.classList.toggle("active", room.cues ? room.cuesOn : yt.captions);
            clearInterval(room.streamTimer);
            room.streamTimer = setInterval(ytTick, 250);
        }
        ytPlayer().then(ytTick, () => {
            yt.error = "YouTube can't be reached from this network.";
            ytTick();
        });
        ytTick();
    };

    // Keeps this browser's YouTube player where the room's clock is
    const ytFollow = () => {
        if (!yt.ready || !room.state || !room.file || !room.file.yt) return;
        const player = yt.player;
        const id = room.file.yt.id;
        const state = room.state;
        const end = room.file.duration || Infinity;
        const target = Math.max(0, Math.min(expectedTime(), end));
        const playing = !state.paused;
        if (yt.loaded !== id) {
            yt.loaded = id;
            yt.error = null;
            // YouTube's captions as the remembered setting says (not with a room's subtitle file)
            yt.captions = !room.cues && subtitlePref.wants(true);
            yt.captionsFor = null;
            if (!room.cues) subtitlesBtn.classList.toggle("active", yt.captions);
            yt.started = yt.lastSeek = now();
            yt.cuedAt = target;
            ytMine();
            if (playing) player.loadVideoById({ videoId: id, startSeconds: target });
            else player.cueVideoById({ videoId: id, startSeconds: target });
            syncYouTubeVolume();
            return;
        }
        if (yt.error) return;
        const current = player.getPlayerState();
        const at = player.getCurrentTime() || 0;
        if (player.getPlaybackRate() !== state.rate) player.setPlaybackRate(state.rate);
        if (playing) {
            if (current === YT.PAUSED || current === YT.CUED || (current === YT.ENDED && target < end - 1)) {
                ytMine();
                player.playVideo();
            } else if (current === YT.PLAYING && Math.abs(at - target) > 2 && now() - yt.lastSeek > 4000) {
                // Behind after an ad or a slow connection (or ahead): jump to where everyone is.
                // While an ad plays the jump does nothing, and it's tried again a little later.
                yt.lastSeek = now();
                ytMine();
                cropYouTube(false);
                player.seekTo(target, true);
            }
        } else if (current === YT.PLAYING || current === YT.BUFFERING) {
            ytMine();
            player.pauseVideo();
        } else if (current === YT.PAUSED && Math.abs(at - target) > 0.5 && now() - yt.lastSeek > 1000) {
            yt.lastSeek = now();
            ytMine();
            cropYouTube(false);
            player.seekTo(target, true);
        } else if ((current === YT.CUED || current === YT.UNSTARTED) && Math.abs(yt.cuedAt - target) > 0.5) {
            yt.cuedAt = target;
            ytMine();
            player.cueVideoById({ videoId: id, startSeconds: target });
        }
    };

    const ytTick = () => {
        if (together.stream !== ytControls || !room || !room.file || !room.file.yt) return;
        // The host has the Autoplay switch: it decides whether the room goes on after the queue
        if (container.classList.contains("yt-host") !== (room.role === "host")) {
            container.classList.toggle("yt-host", room.role === "host");
            if (together.solo) together.solo.renderAutoplay();
        }
        // The title of the video on now (the queue moved on to one whose title was known already)
        const shownTitle = room.file.title;
        if (shownTitle && videoTitle.textContent !== shownTitle && !videoTitle.querySelector("input")) {
            videoTitle.textContent = audioTitle.textContent = shownTitle;
            videoTitle.title = shownTitle;
        }
        const duration = room.file.duration;
        const time = duration ? Math.min(expectedTime(), duration) : expectedTime();
        showProgress(time, duration || Infinity);
        videoDuration.innerText = formatTime(duration);
        const playing = !!room.state && !room.state.paused;
        if (room.shownPlaying !== playing) {
            room.shownPlaying = playing;
            showPlaying(playing);
        }
        renderCue(time);
        ytFollow();
        // Remembered for the dashboard on the home page (history.js)
        const file = room.file;
        if (window.CineHistory && file.yt.id && now() - (yt.historyAt || 0) > 5000) {
            yt.historyAt = now();
            // The title, once YouTube has said it (until then the room calls it "YouTube video")
            const title = file.title && file.title !== "YouTube video" ? { title: file.title } : {};
            CineHistory.put(`yt:${file.yt.id}`, { type: "video", id: file.yt.id, ...title, time, duration, room: true }, yt.historyId !== file.yt.id);
            yt.historyId = file.yt.id;
        }
        // An ad plays when YouTube's player has another video than the room's: on a phone the layer
        // over the player steps aside so YouTube's Skip button can be tapped
        let ad = false;
        try {
            const data = yt.ready && yt.loaded && yt.player.getPlayerState() === YT.PLAYING && yt.player.getVideoData();
            ad = !!(data && data.video_id && data.video_id !== yt.loaded);
        } catch (e) {}
        // Still loading, an error, or a browser that wants a click before playing sound
        const blocked = yt.ready && playing && !yt.error && yt.player.getPlayerState() === YT.UNSTARTED && now() - yt.started > 5000;
        // The layer over YouTube's player steps aside, so its Skip button (or its player, to
        // start) can be clicked: on a touch screen never for an ad (only CineTab's controls show
        // there), and to start only on an iPhone or iPad, which need it (elsewhere ▶ starts it)
        container.classList.toggle("yt-ad", ad || (blocked && !isTouch));
        container.classList.toggle("yt-tap", blocked && isTouch && mustTapYouTube);
        const note = yt.error || (!yt.ready ? "Loading YouTube…" : !blocked ? null
            : !isTouch ? "Click the video to start it" : mustTapYouTube ? "Tap the video to start it" : "Tap ▶ to start it");
        streamWait.hidden = !note;
        if (note && streamWaitText.textContent !== note) streamWaitText.textContent = note;
    };

    const onYouTubeState = e => {
        if (!room || together.stream !== ytControls) return;
        // YouTube's own bars, while it catches up and a moment after (script.js)
        if (e.data === YT.BUFFERING) cropYouTube(false);
        else if (e.data === YT.PLAYING) cropYouTube(true);
        if (e.data === YT.PLAYING) yt.error = null;
        // Each new video: captions as the remembered setting says
        if (e.data === YT.PLAYING && yt.loaded && yt.captionsFor !== yt.loaded) {
            yt.captionsFor = yt.loaded;
            youTubeCaptions(yt.player, yt.captions);
        }
        // The host's player reaching the end moves the room on
        if (room.role === "host" && e.data === YT.ENDED && room.yt && yt.loaded === room.yt.id && room.state && !room.state.paused) ytFinished();
        if (now() < yt.selfUntil || !room.state) return;
        // YouTube pausing itself because the page left the screen (phones) isn't anyone's choice
        if (pageAway()) return;
        // Someone clicked YouTube's player itself: that's play or pause for everyone
        const at = yt.player.getCurrentTime();
        const time = Number.isFinite(at) && Math.abs(at - expectedTime()) < 3 ? at : undefined;
        let asked = true;
        if (e.data === YT.PAUSED && !room.state.paused) asked = request({ paused: true, time });
        else if (e.data === YT.PLAYING && room.state.paused) asked = request({ paused: false, time });
        if (!asked) ytFollow();
    };

    const YT_ERRORS = {
        2: "This YouTube link doesn't work.",
        5: "YouTube couldn't play this video in the browser.",
        100: "This video is private or was removed.",
        101: "The uploader doesn't allow this video to be played outside YouTube.",
        150: "The uploader doesn't allow this video to be played outside YouTube.",
        153: "YouTube didn't allow this video to be played here."
    };

    const onYouTubeError = e => {
        if (!room || together.stream !== ytControls) return;
        yt.error = YT_ERRORS[e.data] || "YouTube couldn't play this video.";
        ytTick();
        // The host skips a video that can't be played to the next one in the queue
        if (room.role !== "host" || !room.yt || yt.loaded !== room.yt.id) return;
        const y = room.yt;
        const title = y.title || "a video";
        if (y.index + 1 < y.queue.length) {
            notice(`Skipped ${title === "a video" ? title : `“${title}”`} in the queue: ${yt.error.toLowerCase()}`);
            const id = y.id;
            setTimeout(() => room && room.yt === y && y.id === id && ytStep(1), 2000);
        } else {
            notice(`${yt.error} (YouTube)`);
        }
    };

    // ---------- The host's side of a YouTube video: the clock, the queue, titles
    // The room watches a queue of YouTube videos. Anyone who may share videos can add links (a
    // playlist adds all its videos), reorder, remove, or play one straight away. `room.yt.index` is
    // the video that's on; `id`, `title` and `by` describe it.

    const QUEUE_MAX = 500;

    // The video ids of a public or unlisted playlist, from a hidden player (null if it can't be read)
    const resolvePlaylist = list => ytApi().then(api => new Promise(resolve => {
        const holder = el("div");
        holder.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none";
        holder.setAttribute("aria-hidden", "true");
        const mount = el("div");
        holder.append(mount);
        document.body.append(holder);
        let helper = null;
        let poll = null;
        const finish = ids => {
            clearInterval(poll);
            clearTimeout(timer);
            try {
                helper.destroy();
            } catch (e) {}
            holder.remove();
            resolve(ids && ids.length ? ids.filter(id => YT_ID.test(id)).slice(0, QUEUE_MAX) : null);
        };
        const timer = setTimeout(() => finish(null), 15000);
        helper = new api.Player(mount, {
            host: YT_HOST,
            width: 320,
            height: 180,
            playerVars: { listType: "playlist", list, controls: 0, mute: 1 },
            events: {
                onReady: () => {
                    poll = setInterval(() => {
                        const ids = helper.getPlaylist && helper.getPlaylist();
                        if (Array.isArray(ids) && ids.length) finish(ids);
                    }, 300);
                },
                onError: () => finish(null)
            }
        });
    }), () => null);

    const queueItem = (id, by) => ({ k: Signaling.newId().slice(0, 10), id, title: "", by });

    // The queue as guests get it
    const queueMessage = () => ({
        t: "queue",
        index: room.yt ? room.yt.index : 0,
        items: room.yt ? room.yt.queue.map(item => ({ k: item.k, id: item.id, title: item.title, by: item.by.name })) : []
    });

    // Changes to the queue go out together, a moment later
    const shareQueue = () => {
        clearTimeout(room.queueTimer);
        const host = room;
        room.queueTimer = setTimeout(() => {
            if (room !== host) return;
            const message = queueMessage();
            broadcast(message);
            room.queue = { index: message.index, items: message.items };
            renderQueue();
        }, 120);
    };

    // Titles of queued videos, from YouTube's oEmbed (a few at a time)
    const fetchTitles = () => {
        const host = room;
        const y = host && host.role === "host" && host.yt;
        if (!y) return;
        while ((host.titleFetches || 0) < 4) {
            const item = y.queue.find(entry => !entry.title && !entry.asked);
            if (!item) return;
            item.asked = true;
            host.titleFetches = (host.titleFetches || 0) + 1;
            fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${item.id}`)}`)
                .then(response => response.ok ? response.json() : null)
                .then(data => {
                    const title = data && clean(data.title, 200);
                    const channel = data && clean(data.author_name, 100);
                    if (data && room === host) {
                        if (channel && !item.channel) item.channel = channel;
                        if (title && !item.title) titleKnown(item, title, channel);
                    }
                })
                .catch(() => {})
                .finally(() => {
                    host.titleFetches--;
                    if (room === host) fetchTitles();
                });
        }
    };

    const titleKnown = (item, title, channel = "") => {
        item.title = title;
        if (channel && !item.channel) item.channel = channel;
        const y = room.yt;
        if (y && y.queue[y.index] === item) {
            y.title = title;
            if (channel && !y.channel) y.channel = channel;
            shareFile();
            if (together.stream === ytControls) videoTitle.textContent = audioTitle.textContent = title;
        }
        shareQueue();
    };

    // The video at `index` becomes the one everyone watches, from the start (or `start` seconds)
    const playQueued = (index, start = 0) => {
        const y = room.yt;
        const item = y && y.queue[index];
        if (!item) return;
        y.index = index;
        y.id = item.id;
        y.title = item.title;
        y.by = item.by;
        y.duration = 0;
        y.autoFor = null;
        // Clean up any unplayed autoplay items after this video so the next video matches this one
        const oldAutoIndex = y.queue.findIndex((entry, i) => i > y.index && entry.auto);
        if (oldAutoIndex >= 0) y.queue.splice(oldAutoIndex);
        room.state = { paused: false, time: start, rate: room.state ? room.state.rate : 1, at: now() };
        shareFile();
        broadcast(stateMessage());
        shareQueue();
        ytTick();
        if (autoplayOn() && y.index === y.queue.length - 1) {
            autoplayNext();
        }
    };

    // A YouTube link from `by` (the host or a guest). `where`: "end" of the queue, "play" (right
    // after the current video, and straight away), or "now" (a new queue; also when nothing's on)
    // A video's playlist or Mix that couldn't be read: YouTube doesn't open some Mixes (and private
    // playlists) in an embedded player, so the video goes on its own
    const listMissed = ref => /^RD/.test(ref.list)
        ? `YouTube didn't open this video's Mix here, so just the video was added.${autoplayOn() ? " Autoplay carries on with videos like it." : " Turn on Autoplay to carry on with videos like it, like a radio."}`
        : "Couldn't open the video's playlist (it may be private), so just the video was added.";

    const setYouTube = async (by, ref, where = "now") => {
        const sharer = { id: by.id, name: by.name };
        if (!room.yt) where = "now";
        if (where === "now") {
            const token = room.ytToken = Signaling.newId();
            if (ref.id) startYouTube([queueItem(ref.id, sharer)], ref.start);
            else addMessage({ system: true, text: "Opening the YouTube playlist…" });
            if (!ref.list) return;
            const ids = await resolvePlaylist(ref.list);
            if (!room || room.role !== "host" || room.ytToken !== token) return;
            if (!ids) {
                if (!ref.id) notice(`Couldn't open the YouTube playlist ${sharer.name} shared. It may be private, or YouTube didn't answer.`);
                else notice(listMissed(ref));
                return;
            }
            if (!ref.id) return startYouTube(ids.map(id => queueItem(id, sharer)), 0);
            // Already playing the linked video: the rest of the playlist goes around it
            const y = room.yt;
            const at = ids.indexOf(ref.id);
            const before = at > 0 ? ids.slice(0, at) : [];
            const after = (at >= 0 ? ids.slice(at + 1) : ids).slice(0, QUEUE_MAX - y.queue.length - before.length);
            y.queue.splice(y.index + 1, 0, ...after.map(id => queueItem(id, sharer)));
            y.queue.splice(y.index, 0, ...before.map(id => queueItem(id, sharer)));
            y.index += before.length;
            shareFile();
            shareQueue();
            if (autoplayOn() && y.index === y.queue.length - 1) autoplayNext();
            return fetchTitles();
        }
        // Into the queue of what's on
        const y = room.yt;
        let ids = ref.list ? await resolvePlaylist(ref.list) : null;
        const missed = !ids && !!ref.id && !!ref.list;
        if (!ids && ref.id) ids = [ref.id];
        if (!room || room.role !== "host" || room.yt !== y) return;
        if (missed) notice(listMissed(ref));
        if (!ids) return notice(`Couldn't open the YouTube playlist ${sharer.name} added. It may be private, or YouTube didn't answer.`);
        // A video in a playlist or a Mix: the list from that video on (it plays first)
        if (ref.id && ids.includes(ref.id)) ids = ids.slice(ids.indexOf(ref.id));
        else if (ref.id && ref.list) ids = [ref.id, ...ids];
        // User is adding video(s): remove any unplayed autoplay items after current video so user's video is next
        const autoAt = y.queue.findIndex((item, i) => i > y.index && item.auto);
        if (autoAt >= 0) y.queue.splice(autoAt);
        const space = QUEUE_MAX - y.queue.length;
        if (space <= 0) return notice(`The queue is full (${QUEUE_MAX} videos).`);
        const items = ids.slice(0, space).map(id => queueItem(id, sharer));
        const at = where === "end" ? y.queue.length : y.index + 1;
        y.queue.splice(at, 0, ...items);
        if (where === "play") playQueued(at, items[0].id === ref.id ? ref.start : 0);
        else {
            notice(items.length > 1 ? `${sharer.name} added ${items.length} videos to the queue` : `${sharer.name} added a video to the queue`);
            shareFile();
            shareQueue();
            if (autoplayOn() && y.index === y.queue.length - 1) autoplayNext();
        }
        fetchTitles();
    };

    const startYouTube = (items, start = 0) => {
        // Whatever was playing gives way: a guest's video, or the host's own file
        if (room.presenter) {
            send(room.presenter, { t: "present-end", reason: "replaced", by: items[0].by.name });
            room.presenter = room.presentFile = room.presentCues = room.remote = null;
        }
        if (!together.stream) releaseMedia();
        stopCapture();
        room.yt = { queue: items, index: 0, id: null, title: "", by: items[0].by, duration: 0 };
        room.state = room.cues = null;
        playQueued(0, start);
        enterYouTube();
        sendSubtitles();
        updateStreams();
        shareMembers();
        fetchTitles();
    };

    // Back to no video (the host's player shows "Select a movie")
    const clearYouTube = () => {
        room.ytToken = null;
        if (!room.yt) return;
        room.yt = room.state = room.cues = null;
        leaveStream();
        uploadOverlay.classList.remove("hidden");
        shareFile();
        shareQueue();
        broadcast(stateMessage());
        sendSubtitles();
        updateStreams();
        shareMembers();
    };

    // Someone's change to the queue: play one now, move one, or take one out
    const queueOp = (by, message) => {
        const y = room.yt;
        if (!y || typeof message.k !== "string") return;
        const at = y.queue.findIndex(item => item.k === message.k);
        if (at < 0) return;
        if (message.op === "play") {
            if (at !== y.index) playQueued(at);
        } else if (message.op === "remove") {
            const [item] = y.queue.splice(at, 1);
            if (!y.queue.length) {
                clearYouTube();
                return notice(`${by.name} removed “${item.title || "the last video"}”, the end of the queue`);
            }
            if (at < y.index) y.index--;
            else if (at === y.index) return playQueued(Math.min(at, y.queue.length - 1));
            shareFile();
            shareQueue();
            if (autoplayOn() && y.index === y.queue.length - 1) autoplayNext();
        } else if (message.op === "move" && Number.isInteger(message.to)) {
            const to = Math.max(0, Math.min(y.queue.length - 1, message.to));
            if (to === at) return;
            const current = y.queue[y.index];
            const [item] = y.queue.splice(at, 1);
            y.queue.splice(to, 0, item);
            y.index = y.queue.indexOf(current);
            shareFile();
            shareQueue();
            if (autoplayOn() && y.index === y.queue.length - 1) autoplayNext();
        }
    };

    // Someone's play, pause, jump or speed change, for everyone
    const controlYouTube = (by, change) => {
        const previous = room.state;
        const duration = room.yt.duration;
        const state = { ...previous, time: expectedTime(), at: now() };
        let cause = null;
        if (finite(change.rate, 0.25, 2)) {
            state.rate = Math.round(change.rate * 100) / 100;
            cause = "rate";
        }
        if (finite(change.time, 0, 1e7)) {
            state.time = duration ? Math.min(change.time, duration) : change.time;
            cause = "seek";
        }
        if (change.paused === true && !previous.paused) {
            state.paused = true;
            cause = "pause";
        } else if (change.paused === false && previous.paused) {
            state.paused = false;
            cause = "play";
            // Play at the end starts it again
            if (duration && state.time >= duration - 0.5) state.time = 0;
        }
        if (duration) state.time = Math.min(state.time, duration);
        room.state = state;
        broadcast(stateMessage(cause, { id: by.id, name: by.name }));
        if (by.id !== room.id) stateFeedback(previous, state, cause, by.name);
        ytTick();
        renderHomeBar();
    };

    // ---------- Autoplay (the host's switch at the top of the player, youtube.js): while the
    // queue is on its last video, a video like it is added after it ("Added by Autoplay"), so the
    // next video is always ready in the queue, and the next button stays active always.
    const AUTOPLAY_BY = { id: "autoplay", name: "Autoplay" };
    const autoplayOn = () => !!(together.solo && together.solo.autoplay);

    // Adds the next video after the last one; true if one was added. `again`: try even if
    // it was tried for this video already.
    const autoplayNext = async (again = false) => {
        const host = room;
        const y = host && host.role === "host" && host.yt;
        if (!y || !autoplayOn() || !window.CineYouTube || y.index < y.queue.length - 1 || y.queue.length >= QUEUE_MAX) return false;
        const item = y.queue[y.index];
        if (y.autoFetching) return false;
        if (y.autoFor === item.k && !again) return false;
        y.autoFor = item.k;
        y.autoFetching = true;
        try {
            const next = await CineYouTube.suggestedAfter(item.id, y.queue.map(entry => entry.id), { title: item.title, channel: y.channel || item.channel || "" });
            // Still the last video, and still wanted
            if (!next || room !== host || host.yt !== y || y.queue[y.queue.length - 1] !== item || !autoplayOn()) return false;
            const added = queueItem(next.id, AUTOPLAY_BY);
            added.title = next.title;
            added.channel = next.channel;
            added.auto = true;
            y.queue.push(added);
            shareFile();
            shareQueue();
            return true;
        } finally {
            if (host && host.yt === y) y.autoFetching = false;
        }
    };

    // The previous or next video in the queue
    const ytStep = step => {
        const y = room.yt;
        if (!y) return;
        if (y.index + step >= 0 && y.index + step < y.queue.length) {
            return playQueued(y.index + step);
        }
        if (step > 0 && autoplayOn()) {
            const current = y.queue[y.index];
            showFeedback("fa-forward-step", "Loading next video…");
            autoplayNext(true).then(added => {
                if (added && room && room.yt === y && y.queue[y.index] === current && y.index + 1 < y.queue.length) {
                    playQueued(y.index + 1);
                }
            });
        }
    };

    // The switch turned: on, what's next is found now; off, what Autoplay added (not yet played) goes
    together.onAutoplay = on => {
        const y = room && room.role === "host" && room.yt;
        if (!y) return;
        if (on) {
            if (y.index === y.queue.length - 1) autoplayNext(true);
            renderNow();
            return;
        }
        const kept = y.queue.filter((item, i) => i <= y.index || !item.auto);
        if (kept.length !== y.queue.length) {
            y.queue = kept;
            shareFile();
            shareQueue();
        }
        renderNow();
    };

    // The end of a video: the next one in the queue, or (with Autoplay) one like it, or stop
    const ytFinished = () => {
        const y = room.yt;
        if (y.index + 1 < y.queue.length) return ytStep(1);
        room.state = { paused: true, time: y.duration || expectedTime(), rate: room.state.rate, at: now() };
        broadcast(stateMessage());
        ytTick();
        if (autoplayOn()) {
            const ended = y.queue[y.index];
            autoplayNext(true).then(added => {
                if (added && room && room.yt === y && y.queue[y.index] === ended && room.state.paused && y.index + 1 < y.queue.length) {
                    playQueued(y.index + 1);
                }
            });
        }
    };

    // Once a second: the title and length from the host's player, and the end of the video
    const hostYouTubeTick = () => {
        if (!room || room.role !== "host" || !room.yt) return;
        const y = room.yt;
        if (yt.ready && yt.loaded === y.id) {
            let changed = false;
            try {
                const data = yt.player.getVideoData();
                if (data && data.video_id === y.id) {
                    const title = clean(data.title, 200);
                    if (title && title !== y.title) {
                        titleKnown(y.queue[y.index], title);
                        changed = true;
                    }
                    // Its channel, for Autoplay to find another like it
                    y.channel = clean(data.author || "", 100);
                    // The last video in the queue is playing: Autoplay finds what's next
                    if (autoplayOn() && y.index === y.queue.length - 1 && yt.player.getPlayerState() === YT.PLAYING) autoplayNext();
                    // Only while the video itself plays, not an ad
                    const length = yt.player.getDuration();
                    if (yt.player.getPlayerState() === YT.PLAYING && yt.player.getCurrentTime() > 1 && length > 1 && Math.abs(length - y.duration) > 1) {
                        y.duration = length;
                        changed = true;
                    }
                }
            } catch (e) {}
            if (changed) shareFile();
        }
        if (y.duration && room.state && !room.state.paused && expectedTime() >= y.duration - 0.3) ytFinished();
    };

    // ---------- Following the host with this browser's own copy

    const followHost = () => {
        if (!room || room.role !== "guest" || room.phase !== "in" || together.stream || room.presenting || !ownMatches() || !hasMedia() || !room.state) return;
        const state = room.state;
        if (mainVideo.playbackRate !== state.rate) mainVideo.playbackRate = state.rate;
        const end = Number.isFinite(mainVideo.duration) ? mainVideo.duration : Infinity;
        const target = Math.min(expectedTime(), end);
        // Past the end of this copy (a shorter version of the movie): stay at the end
        if (target >= end - 0.5 && mainVideo.ended) return;
        const drift = mainVideo.currentTime - target;
        if (!mainVideo.seeking && Math.abs(drift) > (state.paused ? 0.3 : 0.8)) {
            room.seekStarted = now();
            mainVideo.currentTime = Math.max(0, Math.min(end, target + (state.paused ? 0 : room.seekLead)));
        }
        if (state.paused && !mainVideo.paused) mainVideo.pause();
        else if (!state.paused && mainVideo.paused) mainVideo.play().catch(playBlocked);
    };

    // Asks for play, pause, a jump or a speed change; acts right away and whoever's video it is
    // confirms. A guest asks the host; the host asks the guest who's sharing the video.
    const request = change => {
        if (!room || !room.file) return false;
        if (room.role === "host") {
            if (room.yt) {
                controlYouTube({ id: room.id, name: room.name }, change);
                return true;
            }
            if (!room.presenter) return false;
            controlPresenter({ id: room.id, name: room.name }, change);
        } else {
            if (room.phase !== "in") return false;
            if (!room.settings.control) {
                showFeedback("fa-lock", "Host only");
                return false;
            }
            send(room.peer, { t: "control", ...change });
        }
        const state = room.state || { paused: true, time: 0, rate: 1 };
        room.state = {
            paused: change.paused ?? state.paused,
            time: change.time ?? expectedTime(),
            rate: change.rate ?? state.rate,
            at: room.offset === null ? null : hostNow()
        };
        if (together.stream === ytControls) ytTick();
        else if (together.stream) streamTick();
        return true;
    };

    // While the page isn't on screen (another app, or the phone locked), the phone itself may pause
    // or resume the video. That isn't anyone's choice, so it doesn't go to the room; the lock
    // screen's own play / pause buttons do. Coming back, the video catches up with the room.
    let shownAt = 0;
    document.addEventListener("visibilitychange", () => document.hidden || (shownAt = Date.now()));
    const pageAway = () => (document.hidden || Date.now() - shownAt < 1500) && !together.fromMediaKeys();

    // Play/pause/seek/speed on a guest's own copy: the guest's own action, or the effect of following?
    const guestMediaEvent = type => {
        if (room.phase !== "in" || together.stream || !room.state || !ownMatches() || mainVideo.readyState < 1) return;
        if ((type === "play" || type === "pause") && pageAway()) return;
        if (type === "seeked" && room.seekStarted) {
            // Seeking takes a moment; aim that much ahead next time
            room.seekLead = Math.min(1, Math.max(0.05, (now() - room.seekStarted) / 1000));
            room.seekStarted = 0;
            return;
        }
        const state = room.state;
        let change = null;
        if (type === "play" && state.paused) change = { paused: false, time: mainVideo.currentTime };
        else if (type === "pause" && !state.paused && !mainVideo.ended) change = { paused: true, time: mainVideo.currentTime };
        else if (type === "seeked" && Math.abs(mainVideo.currentTime - expectedTime()) > 1) change = { time: mainVideo.currentTime };
        else if (type === "ratechange" && mainVideo.playbackRate !== state.rate) change = { rate: mainVideo.playbackRate };
        // Not allowed: go back to the host's playback
        if (change && !request(change)) setTimeout(followHost, 0);
    };

    // Settings tab for guests: the stream or their own copy
    const renderGuestWatch = () => {
        const file = room.file;
        const by = sharerName();
        const sharing = !!room.presenting;
        if (file && file.yt && !sharing) {
            streamChoice.disabled = ownChoice.disabled = true;
            streamChoice.classList.remove("active");
            ownChoice.classList.remove("active");
            streamChoice.querySelector("b").textContent = "The stream";
            streamChoice.querySelector("small").textContent = ownChoice.querySelector("small").textContent = "Everyone watches this one on YouTube";
            return;
        }
        const streaming = streamable();
        const own = !together.stream && !sharing && ownMatches();
        streamChoice.disabled = !streaming || sharing;
        streamChoice.classList.toggle("active", !!together.stream);
        streamChoice.querySelector("b").textContent = file && !sharing ? `${by}'s stream` : "The stream";
        streamChoice.querySelector("small").textContent = sharing ? "You're sharing the video from this device"
            : !file ? "Available when someone starts a video"
            : !streaming ? tunneled() ? "Needs a direct connection to the host" : `${by} isn't streaming right now`
            : together.stream ? "Watching now · nothing to download" : "Watch as it plays · nothing to download";
        ownChoice.disabled = !file || sharing;
        ownChoice.classList.toggle("active", own || sharing);
        ownChoice.querySelector("small").textContent = sharing ? "Everyone watches the video playing here"
            : !file ? "Available when someone starts a video"
            : own ? `Playing now, in step with ${by} · choose another file` : "The same movie on this device · sharpest picture";
    };

    // The file picker opens either a copy of the room's video (`share` false) or a video to share
    const pickFile = share => {
        if (room && room.role === "guest") room.sharePending = share;
        fileInput.click();
    };
    fileInput.addEventListener("cancel", () => room && (room.sharePending = false));

    const canShare = () => !!room && (room.role === "host" || (room.phase === "in" && room.settings.media === true && canStream && !tunneled()));

    const shareVideo = () => {
        if (!room) return;
        if (!canShare()) return showFeedback("fa-lock", tunneled() ? "Needs a direct connection" : canStream ? "Host only" : "Needs Chrome or Edge");
        pickFile(true);
    };

    streamChoice.addEventListener("click", () => room && room.role === "guest" && !together.stream && setWatching("stream"));
    ownChoice.addEventListener("click", () => room && room.role === "guest" && pickFile(false));

    const setWatching = mode => {
        room.watching = mode;
        send(room.peer, { t: "want", stream: mode === "stream" });
        refreshGuestView();
    };

    // Decides what a guest sees: their own shared video, the stream, their own copy, or a prompt
    const refreshGuestView = () => {
        if (!room || room.role !== "guest" || room.phase !== "in") return;
        const file = room.file;
        const by = sharerName();
        // Guests get the room's own prompts instead of "Select a movie"
        uploadOverlay.classList.add("hidden");
        if (room.presenting) {
            // Sharing: the video plays here and everyone else follows it
            leaveStream();
            hideOverlay();
        } else if (file && file.yt) {
            // YouTube: everyone's own YouTube player, on the room's clock
            hideOverlay();
            enterYouTube();
        } else if (!file) {
            leaveStream();
            if (hasMedia()) mainVideo.pause();
            const share = canShare();
            const youtube = canShareYouTube();
            showStatus({
                icon: "fa-couch",
                title: "Nothing is playing yet",
                text: share ? "Share a video from this device or a YouTube link, or wait for someone to start one. Chat with everyone in the meantime."
                    : youtube ? "Share a YouTube link, or wait for someone to start a video. Chat with everyone in the meantime."
                    : `Waiting for ${room.hostName} to start a video. Chat with everyone in the meantime.`,
                actions: [
                    share && { label: "Share a video", icon: "fa-folder-open", onClick: shareVideo },
                    youtube && { label: "YouTube link", icon: "fa-brands fa-youtube", secondary: share, onClick: () => {
                        hideOverlay();
                        showPanel(true);
                        if (ytForm.hidden) nowYtBtn.click();
                    } }
                ].filter(Boolean)
            });
        } else if (streamable() && (room.watching === "stream" || !ownMatches())) {
            // A new video plays straight away as a stream, unless this browser has its own copy open
            if (room.watching !== "stream") {
                room.watching = "stream";
                send(room.peer, { t: "want", stream: true });
            }
            hideOverlay();
            enterStream();
        } else if (ownMatches()) {
            leaveStream();
            hideOverlay();
            followHost();
        } else {
            leaveStream();
            if (hasMedia()) mainVideo.pause();
            const details = [formatBytes(file.size), file.duration && formatTime(file.duration)].filter(Boolean).join(", ");
            showStatus({
                icon: "fa-film",
                title: `Open your copy of “${file.title}”`,
                text: tunneled() && file.stream
                    ? `${by} is playing ${file.name} (${details}). Your connection goes through the room's relay because your networks don't allow a direct one, and video can't stream that way. Choose the same movie on this device and CineTab keeps it in step with ${by}. YouTube links play for everyone as usual.`
                    : `${by} is playing ${file.name} (${details}) but isn't streaming it right now. Choose the same movie on this device and CineTab keeps it in step with ${by}.`,
                actions: [{ label: "Choose my copy", icon: "fa-folder-open", onClick: () => pickFile(false) }]
            });
        }
        renderGuestWatch();
        renderNow();
    };

    // A guest opening a file: a video to share with everyone, or their own copy of the room's video
    const onGuestFile = file => {
        if (!room || room.phase !== "in") return;
        const share = (room.sharePending || room.presenting || !room.file) && canShare();
        room.sharePending = false;
        if (share) {
            // `from`: the file open until now. Leaving the stream briefly loads it again, and it
            // may be the same movie, so sharing waits for the newly chosen one (see sendPresent).
            room.presenting = { key: fileKey(file), live: false, from: mainVideo.getAttribute("src") };
            room.ownFor = fileKey(file);
            room.checkedFor = null;
            together.following = false;
            if (room.watching !== "own") {
                room.watching = "own";
                send(room.peer, { t: "want", stream: false });
            }
            leaveStream();
            hideOverlay();
            renderGuestWatch();
            renderNow();
            // Sent once the video is ready to play (see loadedmetadata)
            return;
        }
        if (room.presenting) stopPresenting(true);
        room.ownFor = room.file ? fileKey(room.file) : null;
        room.checkedFor = null;
        if (room.watching !== "own") {
            room.watching = "own";
            send(room.peer, { t: "want", stream: false });
        }
        leaveStream();
        hideOverlay();
        renderGuestWatch();
        if (room.file && file.name !== room.file.name) {
            const by = sharerName();
            addMessage({ system: true, text: `Your file's name is different from ${by}'s (${room.file.name}). If it's the same movie it will play in step; if not, watch ${by}'s stream instead.` });
        }
        renderNow();
    };

    // ---------- Sharing a video from this guest's device

    const presenterPlayback = () => ({
        paused: mainVideo.paused,
        time: mainVideo.currentTime || 0,
        rate: mainVideo.playbackRate,
        duration: Number.isFinite(mainVideo.duration) ? mainVideo.duration : 0
    });

    // The picture and sound go to the host, who passes them on to everyone else
    const syncPresenterTracks = () => {
        const peer = room && room.role === "guest" ? room.peer : null;
        if (!peer) return;
        const source = room.presenting && room.presenting.live ? captured : null;
        const video = source ? newest(source.getVideoTracks()) : null;
        const audio = source ? newest(source.getAudioTracks()) : null;
        if (video) video.contentHint = "motion";
        if (audio) audio.contentHint = "music";
        setTrack(peer.mediaVideoSender, video, "video", peer);
        setTrack(peer.mediaAudioSender, audio, "audio", peer);
    };

    const sendPresenterSubs = () => {
        if (room && room.role === "guest" && room.presenting && room.presenting.live) send(room.peer, { t: "psubs", cues: subtitleCues() });
    };

    // Starts (or updates) sharing once the chosen video is ready to play
    const sendPresent = () => {
        const sharing = room && room.role === "guest" && room.presenting;
        if (!sharing || !room.peer || room.phase !== "in" || together.stream || !hasMedia() ||
            !currentSource || fileKey(currentSource) !== sharing.key) return;
        if (sharing.from) {
            if (mainVideo.getAttribute("src") === sharing.from) return;
            sharing.from = null;
        }
        if (!captureSource()) {
            stopPresenting(true);
            refreshGuestView();
            return showFeedback("fa-triangle-exclamation", "Needs Chrome or Edge");
        }
        sharing.live = true;
        syncPresenterTracks();
        send(room.peer, {
            t: "present",
            file: {
                name: currentSource.name,
                size: currentSource.size,
                duration: Number.isFinite(mainVideo.duration) ? mainVideo.duration : 0,
                title: savedTitle(currentSource.name, currentSource.size),
                audio: container.classList.contains("audio-mode")
            },
            ...presenterPlayback()
        });
        sendPresenterSubs();
        renderNow();
    };

    // Play, pause, jumps and speed changes go to the host, who tells everyone. A change someone
    // else asked for (within the last moment) carries their id.
    const sendPstate = (cause = null) => {
        if (!room || room.role !== "guest" || !room.presenting || !room.presenting.live || !hasMedia()) return;
        // Dragging along the timeline seeks many times a second: send the latest, a few times a second
        clearTimeout(room.pstateTimer);
        const wait = 150 - (now() - (room.pstateAt || 0));
        if (wait > 0) {
            room.pstateTimer = setTimeout(() => sendPstate(cause), wait);
            return;
        }
        room.pstateAt = now();
        const asked = cause && room.asked && now() < room.asked.until ? room.asked.by : undefined;
        send(room.peer, { t: "pstate", cause, by: asked, ...presenterPlayback() });
    };

    // Someone asked for a change to the video playing here
    const applyAsked = message => {
        if (!room.presenting || !room.presenting.live || !hasMedia()) return;
        room.asked = { by: typeof message.by === "string" ? message.by.slice(0, 40) : undefined, until: now() + 2000 };
        if (finite(message.rate, 0.25, 4)) mainVideo.defaultPlaybackRate = mainVideo.playbackRate = message.rate;
        if (finite(message.time, 0, 1e7)) mainVideo.currentTime = Math.min(message.time, mainVideo.duration || message.time);
        if (message.paused === true) mainVideo.pause();
        else if (message.paused === false) mainVideo.play().catch(playBlocked);
    };

    // Stops sharing. `tell`: let the host know (not needed when the host ended it)
    const stopPresenting = tell => {
        if (!room || room.role !== "guest" || !room.presenting) return;
        if (tell) send(room.peer, { t: "unpresent" });
        room.presenting = null;
        room.ownFor = null;
        room.asked = null;
        together.following = true;
        syncPresenterTracks();
        stopCapture();
        if (hasMedia() && !together.stream) mainVideo.pause();
        renderNow();
    };

    // ---------- Now playing: what everyone watches, and sharing another video or removing it

    const renderNow = () => {
        if (!room) return;
        const host = room.role === "host";
        const file = room.file;
        const sharing = !host && room.presenting;
        const mine = sharing || (!!file && file.from === room.id);
        const on = !!file || !!sharing;
        const youtube = !sharing && file && file.yt;
        nowBar.classList.toggle("live", on);
        nowIcon.className = youtube ? "fa-brands fa-youtube" : "fa-solid fa-film";
        if (sharing) {
            nowTitle.textContent = currentSource ? savedTitle(currentSource.name, currentSource.size) : "Your video";
            nowMeta.textContent = sharing.live ? "You're sharing it" : "Getting your video ready…";
        } else if (youtube) {
            nowTitle.textContent = file.title;
            nowMeta.textContent = mine ? "You shared it" : `Shared by ${sharerName()}`;
        } else if (file) {
            nowTitle.textContent = file.title;
            nowMeta.textContent = mine ? "You're sharing it" : `Shared by ${sharerName()}`;
        } else {
            nowTitle.textContent = "Nothing is playing";
            nowMeta.textContent = canShare() ? "Share a video from your device" : `Waiting for ${room.hostName || "the host"} to start a video`;
        }
        nowTitle.title = nowTitle.textContent;
        const allowed = host || room.settings.media === true;
        nowShareBtn.hidden = !allowed;
        nowShareBtn.disabled = !canShare();
        nowShareBtn.title = !canStream && !host ? "Sharing a video needs Chrome or Edge"
            : on ? "Play a different video from this device for everyone" : "Play a video from this device for everyone";
        nowShareBtn.setAttribute("aria-label", nowShareBtn.title);
        const shareSpan = nowShareBtn.querySelector("span");
        if (shareSpan) shareSpan.remove();
        // Stop: only the player's own button, beside play / pause
        updateStopButtons(on && (allowed || mine), mine && !youtube ? "Stop sharing your video" : "Stop video for everyone");
        // YouTube links: for anyone who may share videos (no Chrome or Edge needed)
        nowYtBtn.hidden = !allowed;
        if (!allowed) closeYouTubeForm();
        // A playlist or queue: which video, and the previous / next one for everyone
        const control = host || room.settings.control;
        const hasNext = youtube ? (file.yt.index + 1 < file.yt.count || autoplayOn()) : false;
        const hasPrev = youtube ? (file.yt.index > 0) : false;

        // In the player controls: Next button is active whenever YouTube is on and there is a next video or autoplay is on
        nextTrackBtn.hidden = !youtube;
        nextTrackBtn.disabled = !control || !hasNext;
        nextTrackBtn.title = hasNext ? "Next video in the queue (Shift + N)" : "Next video";

        prevTrackBtn.hidden = !youtube;
        prevTrackBtn.disabled = !control || !hasPrev;
        prevTrackBtn.title = "Previous video in the queue (Shift + P)";

        // Playlist / queue indicator in the Now Playing bar
        const showNowList = youtube && (file.yt.count > 1 || autoplayOn());
        nowList.hidden = !showNowList;
        if (showNowList) {
            nowCount.textContent = file.yt.count > 1 ? `${file.yt.index + 1} of ${file.yt.count}` : (autoplayOn() ? "Autoplay on" : "");
            nowPrevBtn.disabled = !control || !hasPrev;
            nowNextBtn.disabled = !control || !hasNext;
        }
        // The queue's tab is always there; it opens when YouTube starts (unless someone is in the
        // middle of chatting or picking more videos in the search)
        queueMoreBtn.hidden = room ? !allowed : false;
        if (youtube && !room.queueShown) {
            room.queueShown = true;
            if (document.activeElement !== chatInput && !(together.searchOpen && together.searchOpen())) {
                showPanel(true);
                showTab("queue");
            }
        } else if (!youtube && room.queueShown) room.queueShown = false;
        renderQueue();
    };

    // ---------- Pasting a YouTube link

    const canShareYouTube = () => !!room && (room.role === "host" || (room.phase === "in" && room.settings.media === true));

    // Closing the box also clears its search (opening it again starts afresh)
    const closeYouTubeForm = () => {
        ytForm.hidden = true;
        nowYtBtn.setAttribute("aria-expanded", "false");
        if (nowResults) nowResults.clear(true);
    };

    const ytHintText = ytHint.textContent;
    const showYouTubeHint = (text = ytHintText, error = false) => {
        ytHint.textContent = text;
        ytHint.classList.toggle("error", error);
    };

    // YouTube's button (and Find more videos, under the queue) opens the player's search (script.js):
    // one place to find, play and queue videos
    const openSearch = (query) => {
        if (room && !canShareYouTube()) return;
        closeYouTubeForm();
        if (together.openSearch) together.openSearch(query);
    };
    nowYtBtn.addEventListener("click", () => openSearch());
    queueMoreBtn.addEventListener("click", () => openSearch());
    ytInput.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        closeYouTubeForm();
    });

    // A YouTube video or playlist for everyone: "play" (after the current one, straight away) or
    // "end" (of the queue). Returns why it couldn't, or null.
    const shareYouTubeRef = (ref, where) => {
        if (!room) return "You're not in a room.";
        if (!canShareYouTube()) return `${room.hostName || "The host"} isn't letting guests share videos right now.`;
        if (room.role === "host") {
            setYouTube({ id: room.id, name: room.name }, ref, where);
            return null;
        }
        if (where === "play" && room.presenting) {
            stopPresenting(true);
            if (room.file && room.file.from === room.id) room.file = null;
        }
        send(room.peer, { t: "youtube", ...ref, where });
        return null;
    };
    // The home page's search and dashboard play YouTube here while in a room (youtube.js)
    together.shareYouTube = ref => shareYouTubeRef(ref, "play");

    // Searching YouTube (youtube.js): typing words instead of a link shows results to pick from
    const nowResults = window.CineYouTube && ytForm.querySelector(".yt-results") && CineYouTube.createResults({
        host: ytForm.querySelector(".yt-results"),
        input: ytInput,
        suggest: true,
        compact: true,
        actions: [{ key: "play", label: "Play for everyone", icon: "fa-play" }],
        onPick: ref => {
            const refused = shareYouTubeRef(ref, "play");
            if (refused) return showYouTubeHint(refused, true);
            ytInput.value = "";
            nowResults.clear();
            closeYouTubeForm();
        }
    });

    ytForm.addEventListener("submit", e => {
        e.preventDefault();
        if (!room) return;
        const ref = parseYouTube(ytInput.value);
        if (!ref) {
            if (nowResults && ytInput.value.trim()) {
                showYouTubeHint();
                return nowResults.run(ytInput.value);
            }
            return showYouTubeHint("That isn't a link to a YouTube video or playlist.", true);
        }
        // While YouTube is on, it plays right after the current video and keeps the queue
        const refused = shareYouTubeRef(ref, "play");
        if (refused) return showYouTubeHint(refused, true);
        ytInput.value = "";
        if (nowResults) nowResults.clear();
        closeYouTubeForm();
    });

    // ---------- The YouTube queue tab

    // (a link dropped on the queue: how that went)
    const showQueueHint = text => text && toast(text);
    const SOLO_QUEUE_KEY = "cinetab:solo-queue";
    const loadSoloQueue = () => {
        try {
            const raw = localStorage.getItem(SOLO_QUEUE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.items)) {
                    parsed.index = Math.max(0, Math.min(parsed.index || 0, Math.max(0, parsed.items.length - 1)));
                    return parsed;
                }
            }
        } catch (e) {}
        return { index: 0, items: [] };
    };
    const saveSoloQueue = () => {
        try {
            localStorage.setItem(SOLO_QUEUE_KEY, JSON.stringify(soloQueue));
        } catch (e) {}
    };
    const soloQueue = loadSoloQueue();

    // Card encouraging room creation when viewing queue solo
    const soloRoomCard = el("div", "queue-solo-card");
    const soloRoomText = el("p");
    soloRoomText.append(el("i", "fa-solid fa-users"), " Watch together with friends");
    const soloRoomBtn = el("button", "btn btn-primary btn-sm");
    soloRoomBtn.type = "button";
    soloRoomBtn.append(el("i", "fa-solid fa-plus"), " Create room");
    soloRoomBtn.addEventListener("click", () => openCreate());
    soloRoomCard.append(soloRoomText, soloRoomBtn);
    queueTab.append(soloRoomCard);

    // (the queue's search, set up further down; the queue may be drawn before that)
    let filterQueueHook = () => {};
    const renderQueue = () => {
        const queue = room ? (room.file && room.file.yt && room.queue || { index: 0, items: [] }) : soloQueue;
        const edit = room ? canShareYouTube() : true;
        const items = queue.items;
        soloRoomCard.hidden = !!room;
        // Nothing queued: what it's for, and (for whoever may share) the search to fill it
        queueEmpty.hidden = !!items.length;
        queueEmpty.querySelector(".room-queue-empty-text").textContent = !room
            ? "Search YouTube or paste a link to add videos to your queue."
            : edit
            ? "Search YouTube or paste a link, then Add to queue: everyone watches the videos in turn."
            : `YouTube videos ${room.hostName || "the host"} and others line up show here.`;
        queueMoreBtn.hidden = room ? !edit : false;
        queueMoreBtn.querySelector("span").textContent = items.length ? "Find more videos" : "Find videos";
        // No "Queue" heading over an empty queue (searching before anything plays)
        queueTitle.hidden = !items.length;
        queueCount.textContent = items.length ? `${Math.min(queue.index + 1, items.length)} of ${items.length}` : "";
        const scrolledTo = queueList.dataset.current;
        queueList.replaceChildren(...items.map((item, i) => {
            const current = i === queue.index;
            const li = el("li", `room-queue-item${current ? " current" : i < queue.index ? " played" : ""}`);
            li.dataset.k = item.k;
            li.dataset.i = i;
            li.draggable = edit;
            if (edit) {
                const grip = el("span", "room-queue-grip");
                grip.title = "Drag to move";
                grip.append(el("i", "fa-solid fa-grip-vertical"));
                li.append(grip);
            }
            const thumb = el("img", "room-queue-thumb");
            thumb.src = `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
            thumb.alt = "";
            thumb.loading = "lazy";
            thumb.draggable = false;
            // The one playing: equalizer bars over its picture, moving while it plays (style.css)
            const cover = el("span", "room-queue-cover");
            cover.append(thumb);
            if (current) {
                const eq = el("span", "room-eq");
                eq.setAttribute("aria-hidden", "true");
                eq.append(el("i"), el("i"), el("i"), el("i"));
                cover.append(eq);
            }
            const info = el("span", "room-queue-info");
            const title = el("b", null, item.title || "YouTube video");
            title.title = item.title || item.id;
            info.append(title, el("small", null, current ? "Now playing" : `Added by ${item.by || "You"}`));
            li.append(cover, info);
            if (edit) {
                const actions = el("span", "room-queue-actions");
                const action = (op, icon, label, disabled = false) => {
                    const button = el("button", "room-icon-btn");
                    button.type = "button";
                    button.dataset.q = op;
                    button.title = label;
                    button.setAttribute("aria-label", label);
                    button.disabled = disabled;
                    button.append(el("i", `fa-solid ${icon}`));
                    return button;
                };
                if (!current) actions.append(action("play", "fa-play", "Play this now"));
                actions.append(
                    action("up", "fa-arrow-up", "Move up", i === 0),
                    action("down", "fa-arrow-down", "Move down", i === items.length - 1),
                    action("remove", "fa-xmark", "Remove from the queue")
                );
                li.append(actions);
            }
            return li;
        }));
        // (searching the queue: still only what matches)
        filterQueueHook();
        // Keep the current video in view when it changes
        const now = items[queue.index];
        if (now && scrolledTo !== now.k) {
            queueList.dataset.current = now.k;
            const row = queueList.children[queue.index];
            if (row && activeTab === "queue") row.scrollIntoView({ block: "nearest" });
        }
        if (!room && items.length && window.together && together.solo && together.solo.active) {
            const hasNext = queue.index + 1 < items.length;
            const hasPrev = queue.index > 0;
            nextTrackBtn.hidden = false;
            nextTrackBtn.disabled = !hasNext;
            nextTrackBtn.title = hasNext ? "Next video in queue (Shift + N)" : "Next video";
            prevTrackBtn.hidden = false;
            prevTrackBtn.disabled = !hasPrev;
            prevTrackBtn.title = hasPrev ? "Previous video in queue (Shift + P)" : "Previous video";
        }
    };

    const sendQueueOp = op => {
        if (!room) return;
        if (room.role === "host") queueOp({ id: room.id, name: room.name }, op);
        else send(room.peer, { t: "queue-op", ...op });
    };

    queueList.addEventListener("click", e => {
        const button = e.target.closest("button[data-q]");
        const row = button && button.closest("li[data-k]");
        if (!row) return;
        const k = row.dataset.k;
        const at = +row.dataset.i;
        const op = button.dataset.q;
        if (!room) {
            if (op === "play") {
                const target = soloQueue.items[at];
                if (target && target.id && window.CineYouTube) {
                    soloQueue.index = at;
                    CineYouTube.play({ id: target.id }, { title: target.title });
                    saveSoloQueue();
                    renderQueue();
                }
            } else if (op === "up" && at > 0) {
                const [item] = soloQueue.items.splice(at, 1);
                soloQueue.items.splice(at - 1, 0, item);
                if (soloQueue.index === at) soloQueue.index = at - 1;
                else if (soloQueue.index === at - 1) soloQueue.index = at;
                saveSoloQueue();
                renderQueue();
            } else if (op === "down" && at < soloQueue.items.length - 1) {
                const [item] = soloQueue.items.splice(at, 1);
                soloQueue.items.splice(at + 1, 0, item);
                if (soloQueue.index === at) soloQueue.index = at + 1;
                else if (soloQueue.index === at + 1) soloQueue.index = at;
                saveSoloQueue();
                renderQueue();
            } else if (op === "remove") {
                soloQueue.items.splice(at, 1);
                if (soloQueue.index >= soloQueue.items.length) soloQueue.index = Math.max(0, soloQueue.items.length - 1);
                saveSoloQueue();
                renderQueue();
            }
            return;
        }
        if (op === "up" || op === "down") sendQueueOp({ op: "move", k, to: at + (op === "up" ? -1 : 1) });
        else sendQueueOp({ op, k });
    });

    // ---------- The queue's search box: typing finds videos in the queue (the rest step aside, and
    // how many match shows); Enter searches YouTube for it, and a pasted link is added
    const queueFilterNote = el("div", "room-queue-filter");
    queueFilterNote.hidden = true;
    const queueFilterText = el("span");
    const queueFilterSearch = el("button", "room-link-btn room-queue-filter-yt");
    queueFilterSearch.type = "button";
    queueFilterNote.append(queueFilterText, queueFilterSearch);
    queueList.after(queueFilterNote);
    queueFilterSearch.addEventListener("click", () => {
        const val = queueAddInput.value.trim();
        if (val) openSearch(val);
    });
    const filterQueue = () => {
        if (!queueAddInput) return;
        const value = queueAddInput.value.trim();
        const words = value && !parseYouTube(value) ? value.toLowerCase().split(/\s+/).filter(Boolean) : [];
        const rows = [...queueList.children];
        let found = 0;
        rows.forEach(row => {
            const title = (row.querySelector(".room-queue-info b") || {}).textContent || "";
            const hit = words.every(word => title.toLowerCase().includes(word));
            row.hidden = !hit;
            if (hit) found++;
            // (not dragged while searched: what shows isn't the whole queue)
            if (row.dataset.drag === undefined) row.dataset.drag = row.draggable ? "1" : "";
            row.draggable = !words.length && !!row.dataset.drag;
        });
        const filtering = words.length > 0;
        queueList.classList.toggle("filtered", filtering);
        queueFilterNote.hidden = !filtering;
        if (filtering) {
            queueFilterText.textContent = !rows.length ? "Nothing in the queue yet"
                : found ? `${found} of ${rows.length} in the queue` : "Nothing in the queue matches";
            queueFilterSearch.replaceChildren(el("i", "fa-brands fa-youtube"), ` Search YouTube for “${value}”`);
            queueEmpty.hidden = true;
        } else queueEmpty.hidden = !!rows.length;
    };
    filterQueueHook = filterQueue;
    if (queueAddInput) {
        queueAddInput.placeholder = "Search the queue, or paste a YouTube link";
        queueAddInput.setAttribute("aria-label", "Search the queue, or paste a YouTube link to add it");
        queueAddInput.addEventListener("input", filterQueue);
    }

    if (queueAddForm && queueAddInput) {
        queueAddForm.addEventListener("submit", e => {
            e.preventDefault();
            const val = queueAddInput.value.trim();
            if (!val) return;
            const ref = parseYouTube(val);
            if (ref) {
                const refused = together.queueYouTube(ref);
                if (!refused) {
                    queueAddInput.value = "";
                    filterQueue();
                } else showQueueHint(refused);
            } else {
                openSearch(val);
            }
        });
    }

    // Adding a video or playlist: to the end of the queue, or to play right away
    const addRefToQueue = (ref, where) => {
        if (!room) {
            together.queueYouTube(ref);
            return true;
        }
        const refused = shareYouTubeRef(ref, where);
        if (refused) {
            showQueueHint(refused, true);
            return false;
        }
        const starting = !(room.file && room.file.yt);
        showQueueHint(starting || where === "play" ? (ref.list ? "Opening it for everyone…" : "Playing it now for everyone…")
            : ref.list ? "Adding the videos to the queue…" : "Added to the queue.");
        return true;
    };
    const addToQueue = (text, where) => {
        const ref = parseYouTube(text);
        if (!ref) {
            showQueueHint("That isn't a link to a YouTube video or playlist.", true);
            return false;
        }
        return addRefToQueue(ref, where);
    };

    // ---------- For the player's search and commands (script.js): a link or a result queued for
    // everyone (or starting, when nothing's on), whether that's allowed, and the room's own commands
    together.canQueueYouTube = () => room ? canShareYouTube() : true;
    together.queueYouTube = (ref, meta = {}) => {
        if (room) return shareYouTubeRef(ref, "end");
        if (!ref || !ref.id) return "That isn't a link to a YouTube video.";
        const item = {
            k: Math.random().toString(36).slice(2),
            id: ref.id,
            title: meta.title || meta.listTitle || "YouTube video",
            by: "You"
        };
        soloQueue.items.push(item);
        saveSoloQueue();
        renderQueue();
        toast("Added to queue");
        if (!meta.title && window.CineYouTube && CineYouTube.details) {
            CineYouTube.details(ref.id).then(info => {
                if (info && info.title) {
                    item.title = info.title;
                    saveSoloQueue();
                    renderQueue();
                }
            }).catch(() => {});
        }
        return null;
    };
    together.roomCommands = () => {
        if (!room) return [];
        const host = room.role === "host";
        const panelTo = tab => () => {
            showPanel(true);
            showTab(tab);
            if (tab === "chat") chatInput.focus();
        };
        return [
            { label: micEnabled ? "Turn the microphone off" : "Turn the microphone on", icon: micEnabled ? "fa-microphone-slash" : "fa-microphone", words: "mic microphone mute unmute talk voice", run: toggleMicrophone },
            { label: camEnabled ? "Turn the camera off" : "Turn the camera on", icon: camEnabled ? "fa-video-slash" : "fa-video", words: "camera cam video webcam face", run: () => camEnabled ? disableCamera() : enableCamera() },
            !callWin.hidden && { label: call.dock ? "Float the video call window" : "Dock the video call window", icon: call.dock ? "fa-up-right-from-square" : "fa-arrows-down-to-line", keys: ["D"], words: "pin unpin dock float call video window side panel", run: () => together.toggleCallDock() },
            { label: "Invite people: copy the room's link", icon: "fa-link", words: "invite share link copy friends join", run: () => copy(inviteLink(), "Invite link") },
            { label: "Chat", icon: "fa-message", words: "chat message talk write", run: panelTo("chat") },
            { label: "People in the room", icon: "fa-user-group", words: "people members guests who invite qr code", run: panelTo("people") },
            room.file && room.file.yt && { label: "The queue", icon: "fa-list-ol", words: "queue playlist next up list", run: panelTo("queue") },
            host && { label: "Room settings", icon: "fa-sliders", words: "settings options lobby lock quality", run: panelTo("settings") },
            { label: "Leave the room", icon: "fa-right-from-bracket", words: "leave exit quit hang up go", run: () => leaveJustBtn.click() },
            { label: "End the room for everyone", icon: "fa-door-closed", words: "end close stop room everyone", danger: true, run: () => leaveEndBtn.click() }
        ].filter(Boolean);
    };

    // Drag to reorder, or drop a link (from YouTube's page in another window) onto the queue
    let draggedK = null;
    const clearDrop = () => queueList.querySelectorAll(".drop-before, .drop-after").forEach(row => row.classList.remove("drop-before", "drop-after"));
    queueList.addEventListener("dragstart", e => {
        const row = e.target.closest && e.target.closest("li[data-k]");
        if (!row) return;
        draggedK = row.dataset.k;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-cinetab-queue", draggedK);
    });
    queueList.addEventListener("dragend", () => {
        draggedK = null;
        clearDrop();
        queueList.querySelectorAll(".dragging").forEach(row => row.classList.remove("dragging"));
    });
    const dropSpot = e => {
        const row = e.target.closest && e.target.closest("li[data-k]");
        if (!row) return null;
        const rect = row.getBoundingClientRect();
        return { row, after: e.clientY > rect.top + rect.height / 2 };
    };
    queueTab.addEventListener("dragover", e => {
        const link = !draggedK && [...e.dataTransfer.types].some(type => type === "text/uri-list" || type === "text/plain");
        if (!draggedK && !link) return;
        e.preventDefault();
        e.stopPropagation();
        if (link) {
            e.dataTransfer.dropEffect = "copy";
            return queueTab.classList.add("drop-link");
        }
        clearDrop();
        const spot = dropSpot(e);
        if (spot) spot.row.classList.add(spot.after ? "drop-after" : "drop-before");
    });
    queueTab.addEventListener("dragleave", e => {
        if (!queueTab.contains(e.relatedTarget)) {
            queueTab.classList.remove("drop-link");
            clearDrop();
        }
    });
    queueTab.addEventListener("drop", e => {
        e.preventDefault();
        e.stopPropagation();
        queueTab.classList.remove("drop-link");
        if (!draggedK) {
            const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
            const link = text.split(/\s+/).find(part => /youtu/i.test(part)) || text;
            if (link) addToQueue(link, "end");
            return;
        }
        const spot = dropSpot(e);
        const from = room && room.queue ? room.queue.items.findIndex(item => item.k === draggedK)
            : soloQueue.items.findIndex(item => item.k === draggedK);
        clearDrop();
        if (!spot || from < 0) return;
        let to = +spot.row.dataset.i + (spot.after ? 1 : 0);
        if (from < to) to--;
        if (to === from) return;
        if (!room) {
            const [item] = soloQueue.items.splice(from, 1);
            soloQueue.items.splice(to, 0, item);
            if (soloQueue.index === from) soloQueue.index = to;
            else if (from < soloQueue.index && to >= soloQueue.index) soloQueue.index--;
            else if (from > soloQueue.index && to <= soloQueue.index) soloQueue.index++;
            saveSoloQueue();
            renderQueue();
            return;
        }
        sendQueueOp({ op: "move", k: draggedK, to });
    });

    // YouTube's own links in its player ("More videos", the title) open YouTube in a new tab, and
    // the browser doesn't tell CineTab which video. When someone comes back from there, the queue
    // is ready for the link.
    let leftForYouTube = false;
    window.addEventListener("blur", () => {
        if (together.stream !== ytControls) return;
        setTimeout(() => {
            const frame = document.activeElement;
            if (document.hidden && frame && frame.tagName === "IFRAME" && ytMount.contains(frame)) leftForYouTube = true;
        }, 400);
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden || !leftForYouTube) return;
        leftForYouTube = false;
        if (!room || together.stream !== ytControls || !canShareYouTube() || !together.openSearch) return;
        together.openSearch("", "Back from YouTube? Copy the video's link there, then paste it here to play it or add it to the queue.");
    });

    const playNextSoloQueue = () => {
        if (room || !soloQueue.items.length) return false;
        if (soloQueue.index + 1 < soloQueue.items.length) {
            soloQueue.index++;
            const target = soloQueue.items[soloQueue.index];
            if (target && target.id && window.CineYouTube) {
                CineYouTube.play({ id: target.id }, { title: target.title });
                saveSoloQueue();
                renderQueue();
                return true;
            }
        }
        return false;
    };
    const playPrevSoloQueue = () => {
        if (room || !soloQueue.items.length) return false;
        if (soloQueue.index > 0) {
            soloQueue.index--;
            const target = soloQueue.items[soloQueue.index];
            if (target && target.id && window.CineYouTube) {
                CineYouTube.play({ id: target.id }, { title: target.title });
                saveSoloQueue();
                renderQueue();
                return true;
            }
        }
        return false;
    };
    together.playNextSoloQueue = playNextSoloQueue;
    together.playPrevSoloQueue = playPrevSoloQueue;

    const updateStopButtons = (visible, title = "Stop video") => {
        playerStopBtns.forEach(btn => {
            btn.hidden = !visible;
            if (title) {
                btn.title = title;
                btn.setAttribute("aria-label", title);
            }
        });
    };
    together.updateStop = (hasMedia) => {
        if (room) {
            const file = room.file;
            const sharing = room.role !== "host" && room.presenting;
            const mine = sharing || (!!file && file.from === room.id);
            const on = !!file || !!sharing;
            const youtube = !sharing && file && file.yt;
            const allowed = room.role === "host" || room.settings.media === true;
            const stopAllowed = on && (allowed || mine);
            const stopTitle = mine && !youtube ? "Stop sharing your video" : "Stop video for everyone";
            updateStopButtons(stopAllowed, stopTitle);
        } else {
            updateStopButtons(!!hasMedia, "Stop video");
        }
    };

    // A playlist's previous / next video, for everyone
    const stepPlaylist = step => {
        if (!room) return;
        if (room.role === "host") return room.yt && ytStep(step);
        if (!room.settings.control) return showFeedback("fa-lock", "Host only");
        send(room.peer, { t: "ytstep", step });
    };
    nowPrevBtn.addEventListener("click", () => stepPlaylist(-1));
    nowNextBtn.addEventListener("click", () => stepPlaylist(1));
    prevTrackBtn.addEventListener("click", () => {
        if (!room) return together.step(-1);
        stepPlaylist(-1);
    });
    nextTrackBtn.addEventListener("click", () => {
        if (!room) return together.step(1);
        stepPlaylist(1);
    });
    // Shift + N / P (see script.js)
    together.step = step => {
        // Outside a room: a YouTube playlist watched alone (youtube.js) or solo queue
        if (!room) {
            if (step > 0 && playNextSoloQueue()) return;
            if (step < 0 && playPrevSoloQueue()) return;
            return together.solo && together.solo.step(step);
        }
        const file = room && room.file;
        if (!file || !file.yt || file.yt.count < 2) return;
        const index = file.yt.index + step;
        if (index < 0 || index >= file.yt.count) return;
        stepPlaylist(step);
        showFeedback(step > 0 ? "fa-forward-step" : "fa-backward-step", step > 0 ? "Next video" : "Previous video");
    };

    const stopVideo = () => {
        if (!room) {
            if (window.unloadPlayer) window.unloadPlayer();
            updateStopButtons(false);
            return;
        }
        if (room.role === "guest" && room.presenting) {
            stopPresenting(true);
            if (room.file && room.file.from === room.id) room.file = null;
            return refreshGuestView();
        }
        const file = room.file;
        if (!file || !confirm(`Stop “${file.title}” for everyone?`)) return;
        if (room.role === "host") removeMedia({ id: room.id, name: room.name });
        else send(room.peer, { t: "remove" });
    };

    nowShareBtn.addEventListener("click", shareVideo);
    together.stopVideo = stopVideo;

    renderQueue();

    // ---------- Clock: the host's time on this computer

    const startPings = () => {
        room.samples = [];
        let count = 0;
        const ping = () => {
            if (!room || room.role !== "guest" || !room.peer) return;
            send(room.peer, { t: "ping", c: now() });
            clearTimeout(room.pingTimer);
            room.pingTimer = setTimeout(ping, ++count < 6 ? 400 : 10000);
        };
        ping();
    };

    const onPong = message => {
        const received = now();
        if (!finite(message.c, -1e13, 1e13) || !finite(message.h, -1e13, 1e13)) return;
        const roundTrip = received - message.c;
        if (roundTrip < 0 || roundTrip > 10000) return;
        room.samples.push({ roundTrip, offset: message.h - (message.c + received) / 2 });
        if (room.samples.length > 10) room.samples.shift();
        // The quickest round trip gives the most accurate estimate
        room.offset = room.samples.reduce((best, sample) => sample.roundTrip < best.roundTrip ? sample : best).offset;
    };

    // ---------- Messages from the host

    // Shows who played, paused, jumped or changed the speed
    const stateFeedback = (previous, state, cause, by) => {
        if (!previous || !cause) return;
        if (cause === "play" && previous.paused && !state.paused) showFeedback("fa-play", by);
        else if (cause === "pause" && !previous.paused && state.paused) showFeedback("fa-pause", by);
        else if (cause === "seek") showFeedback(state.time >= previous.time ? "fa-forward" : "fa-backward", by);
        else if (cause === "rate" && previous.rate !== state.rate) showFeedback("fa-gauge-high", `${state.rate}x`);
    };

    const applyState = message => {
        const previous = room.state;
        const state = room.state = validState(message);
        if (message.byId !== room.id) stateFeedback(previous, state, message.cause, clean(message.by, 30));
        if (together.stream === ytControls) ytTick();
        else if (together.stream) streamTick();
        else followHost();
        renderHomeBar();
    };

    const guestHandle = message => {
        const guest = room;
        switch (message.t) {
            case "pong":
                return onPong(message);
            case "waiting":
                guest.phase = "waiting";
                return showStatus({
                    icon: "fa-hourglass-half",
                    title: "Waiting for the host to let you in…",
                    text: `You're at the door of room ${Signaling.formatCode(guest.code)}. The host has been asked to let you in.`,
                    busy: true,
                    actions: [{ label: "Cancel", secondary: true, onClick: () => leaveRoom(false) }],
                    onClose: () => leaveRoom(false)
                });
            case "denied":
                return ended({
                    denied: ["Not let in", "The host didn't let you into the room."],
                    removed: ["Removed from the room", "The host removed you from the room."],
                    locked: ["This room is locked", "The host isn't letting anyone new in right now."],
                    full: ["This room is full", `A room can have up to ${MAX_GUESTS} guests.`]
                }[message.reason] || ["Not let in", "The host didn't let you into the room."]);
            case "bye":
                // The host left: the room goes on (see lost). Or it ended, for good.
                if (message.next && guest.phase === "in" && guest.peer) {
                    addMessage({ system: true, text: `${guest.hostName || "The host"} left the room.` });
                    guest.hostLeft = true;
                    return lost(guest.peer);
                }
                forgetRoom(guest.code, false);
                return ended(["The room has ended", message.by ? `${clean(message.by, 30)} ended the room.` : `${guest.hostName || "The host"} ended the room.`]);
            case "moved":
                // Another browser hosts the room now: over to it (nobody here takes over)
                if (guest.phase !== "in" || !guest.peer) return;
                guest.noTakeover = true;
                return lost(guest.peer);
            case "welcome": {
                if (guest.phase === "in") return;
                guest.phase = "in";
                guest.retries = 0;
                clearTimeout(guest.connectTimer);
                guest.ticket = typeof message.ticket === "string" ? message.ticket.slice(0, 64) : null;
                guest.hostName = clean(message.host, 30) || "The host";
                guest.settings = {
                    control: message.settings?.control !== false,
                    streaming: message.settings?.streaming === true,
                    media: message.settings?.media === true
                };
                guest.title = clean(message.settings?.title, 40) || `${guest.hostName}'s room`;
                guest.file = validFile(message.file);
                guest.state = validState(message);
                if (!guest.joinedOnce) {
                    guest.joinedOnce = true;
                    enterRoomUI();
                    addMessage({ system: true, text: `You joined ${guest.hostName}'s room. Messages aren't saved anywhere.` });
                    if (tunneled()) addMessage({ system: true, text: `Your network and ${guest.hostName}'s don't allow a direct connection, so you're connected through the room's relay (still encrypted). Chat, sync, YouTube and playing your own copy all work; ${guest.hostName}'s video can't stream to you this way. A phone hotspot on either side usually gives a direct connection.` });
                } else {
                    // A host that gave way to another: a participant's view of the same room
                    if (guest.rejoining) {
                        guest.rejoining = false;
                        enterRoomUI(true);
                    }
                    addMessage({ system: true, text: guest.hostName !== guest.hostBefore ? `Reconnected. ${guest.hostName} is hosting the room now.` : "Reconnected." });
                    // Nobody's ending the room: it goes on with this host
                    guest.hostLeft = false;
                }
                guest.hostBefore = guest.hostName;
                renderState();
                rememberRoom();
                // Back after a dropped connection while sharing: share again, unless someone else
                // started a video in the meantime
                if (guest.presenting) {
                    if (guest.presenting.live && guest.file) stopPresenting(false);
                    else {
                        guest.presenting.live = false;
                        sendPresent();
                    }
                }
                return refreshGuestView();
            }
        }
        if (guest.phase !== "in") return;
        switch (message.t) {
            case "succession": {
                // What's needed to carry the room on if its host goes (see takeOver)
                if (!finite(message.epoch, 0, 1e6)) return;
                guest.succession = {
                    epoch: message.epoch,
                    owner: typeof message.owner === "string" && FINGERPRINT.test(message.owner) ? message.owner : null,
                    tickets: Array.isArray(message.tickets) ? message.tickets.filter(hash => typeof hash === "string" && FINGERPRINT.test(hash)).slice(-200) : [],
                    lobby: message.lobby !== false,
                    locked: message.locked === true,
                    quality: ["saver", "standard", "high"].includes(message.quality) ? message.quality : "standard"
                };
                guest.ownerTag = guest.succession.owner;
                return rememberRoom();
            }
            case "state":
                return applyState(message);
            case "file": {
                const file = validFile(message.file);
                const old = guest.file;
                const other = mediaKey(file) !== mediaKey(old);
                const changed = other || (!!file && (file.duration !== old.duration || file.stream !== old.stream));
                guest.file = file;
                // Subtitles belong to the video they were loaded for
                if (other) {
                    guest.cues = null;
                    guest.ownCues = false;
                }
                if (changed) refreshGuestView();
                else {
                    // Just renamed
                    if (together.stream && file) videoTitle.textContent = audioTitle.textContent = file.title;
                    renderGuestWatch();
                    renderNow();
                }
                if (guest.members) renderPeople(guest.members);
                return;
            }
            case "pcontrol":
                return applyAsked(message);
            case "queue": {
                // The YouTube queue, from the host
                if (!Array.isArray(message.items)) return;
                const items = message.items.slice(0, 500)
                    .filter(item => item && typeof item.k === "string" && YT_ID.test(item.id))
                    .map(item => ({ k: item.k.slice(0, 16), id: item.id, title: clean(item.title, 200), by: clean(item.by, 30) || "someone" }));
                const index = Number.isInteger(message.index) ? Math.max(0, Math.min(items.length - 1, message.index)) : 0;
                guest.queue = items.length ? { index, items } : null;
                return renderQueue();
            }
            case "present-end": {
                // The host ended this guest's sharing: someone else's video, removed, or not allowed
                if (!guest.presenting) return;
                stopPresenting(false);
                const by = clean(message.by, 30) || guest.hostName;
                toast(message.reason === "off" ? `${guest.hostName} isn't letting guests share videos right now`
                    : message.reason === "replaced" ? `${by} started another video` : `${by} removed your video`);
                // The new video (or none) follows in a moment; only a refusal changes nothing else
                if (message.reason === "off") refreshGuestView();
                return;
            }
            case "settings":
                guest.settings = {
                    control: message.control !== false,
                    streaming: message.streaming === true,
                    media: message.media === true
                };
                if (clean(message.title, 40) && clean(message.title, 40) !== guest.title) {
                    guest.title = clean(message.title, 40);
                    renderState();
                    rememberRoom();
                }
                renderQueue();
                return refreshGuestView();
            case "cams": {
                const slots = Array.isArray(message.slots) ? message.slots : [];
                guest.cams = {
                    host: message.host === true,
                    slots: slots.slice(0, CAM_SLOTS)
                        .filter(slot => slot && Number.isInteger(slot.i) && slot.i >= 0 && slot.i < CAM_SLOTS && typeof slot.id === "string")
                        .map(slot => ({ i: slot.i, id: slot.id.slice(0, 64), name: clean(slot.name, 30) || "Guest" }))
                };
                return renderCameras();
            }
            case "members": {
                if (!Array.isArray(message.members)) return;
                const members = message.members.slice(0, MAX_GUESTS + 1)
                    .filter(member => member && typeof member.id === "string")
                    .map(member => ({ id: member.id, name: clean(member.name, 30) || "Guest", avatar: validAvatar(member.avatar), host: member.host === true, stream: member.stream === true, sharing: member.sharing === true, mic: member.mic === true }));
                guest.members = members;
                // In the room: the host hears whether this mic and camera are on
                reportMicrophone();
                syncCameraGuest();
                const host = members.find(member => member.host);
                if (host && host.name !== guest.hostName) {
                    guest.hostName = host.name;
                    renderState();
                    renderGuestWatch();
                }
                return renderPeople(members);
            }
            case "chat": {
                const text = clean(message.text, 500);
                const reply = message.reply && typeof message.reply.id === "string"
                    ? { id: message.reply.id.slice(0, 32), name: clean(message.reply.name, 30), text: clean(message.reply.text, 140) } : null;
                if (text) addMessage({
                    id: typeof message.id === "string" ? message.id.slice(0, 32) : null,
                    reply,
                    from: typeof message.from === "string" ? message.from : null,
                    name: clean(message.name, 30) || "Guest",
                    avatar: validAvatar(message.avatar),
                    text,
                    self: message.from === guest.id,
                    at: finite(message.at, 0, 1e14) ? message.at : Date.now()
                });
                return;
            }
            case "reactions": {
                if (typeof message.id !== "string" || !Array.isArray(message.list)) return;
                const list = message.list.slice(0, REACTIONS.length)
                    .filter(item => item && REACTIONS.includes(item.e) && Array.isArray(item.ids) && Array.isArray(item.names))
                    .map(item => ({ e: item.e, ids: item.ids.filter(id => typeof id === "string").slice(0, 20), names: item.names.map(name => clean(name, 30)).slice(0, 20) }));
                return renderReactions(message.id, list);
            }
            case "notice": {
                const text = clean(message.text, 300);
                if (text) addMessage({ system: true, text });
                return;
            }
            case "subs":
                if (guest.ownCues && together.stream) return;
                guest.cues = validCues(message.cues);
                guest.ownCues = false;
                if (together.stream) subtitlesBtn.classList.toggle("active", !!guest.cues && guest.cuesOn);
                return applyHostSubtitles();
        }
    };

    // ---------- Connecting to the host

    const lost = peer => {
        const guest = room;
        if (!guest || guest.role !== "guest" || guest.peer !== peer) return;
        // A direct connection that never opened: the networks don't allow one, so the room goes
        // through the relays instead (the host already answered there)
        if (!peer.channel.isTunnel && !peer.opened && guest.hostId && guest.pairKey) return useTunnel(peer);
        closePeer(peer);
        guest.peer = null;
        clearTimeout(guest.pingTimer);
        clearTimeout(guest.connectTimer);
        clearInterval(guest.offerTimer);
        if (guest.phase === "in" && guest.ticket && guest.retries < 3) {
            // The room carries on without its host: the first in line hosts it straight away, the
            // others look for them (the next in line takes over if nobody's hosting after a while).
            // Or just the connection dropped: try again quietly; the host lets them straight back in.
            const rank = guest.noTakeover ? -1 : successionRank(guest);
            guest.noTakeover = false;
            if (rank === 0) return takeOver();
            guest.retries++;
            guest.phase = "reconnecting";
            guest.id = Signaling.newId();
            renderState();
            if (!guest.hostLeft) addMessage({ system: true, text: `Lost the connection to ${guest.hostName}. Reconnecting…` });
            guest.knockLimit = 9 + Math.max(0, rank) * 5;
            clearTimeout(guest.takeoverTimer);
            if (rank > 0) guest.takeoverTimer = setTimeout(() => room === guest && !guest.hostId && takeOver(), rank * 12000);
            knock();
        } else if (guest.joinedOnce) {
            ended(["Connection lost", `The connection to ${guest.hostName} dropped. They may have closed CineTab or lost their internet connection.`]);
        } else {
            cantConnect();
        }
    };

    // Where this guest is in line to host the room: 0 is next; -1: not in line (no word from the
    // host about it: an older CineTab)
    const successionRank = guest => {
        if (!guest.succession || !Array.isArray(guest.members)) return -1;
        return guest.members.filter(member => !member.host).findIndex(member => member.id === guest.id);
    };

    // This guest carries the room on as its host: the same code and password, its settings, the
    // people in it (let straight back in), and the YouTube video or queue from where it was
    const takeOver = async () => {
        const guest = room;
        if (!guest || guest.role !== "guest" || guest.takingOver || !guest.succession) return;
        guest.takingOver = true;
        const youtube = guest.file && guest.file.yt && guest.queue && guest.queue.items.length;
        const kit = {
            from: guest.hostName || "The host",
            epoch: guest.succession.epoch + 1,
            ownerTag: guest.succession.owner,
            ownerSecret: guest.ownerSecret || null,
            tickets: guest.succession.tickets,
            ticket: guest.ticket,
            settings: { ...guest.settings, lobby: guest.succession.lobby, locked: guest.succession.locked, quality: guest.succession.quality },
            yt: youtube ? { items: guest.queue.items, index: guest.queue.index, time: expectedTime(), paused: !guest.state || guest.state.paused } : null
        };
        [guest.knockTimer, guest.offerTimer].forEach(clearInterval);
        [guest.takeoverTimer, guest.pingTimer, guest.connectTimer, guest.pstateTimer].forEach(clearTimeout);
        guest.timers.forEach(clearInterval);
        closePeer(guest.peer);
        // The old host's video stream is gone with it. A YouTube video goes on: the same player,
        // which the new host takes up again (see continueYouTube)
        clearInterval(guest.streamTimer);
        if (youtube) together.stream = null;
        else if (together.stream) leaveStream();
        room = null;
        if (guest.signal) guest.signal.close();
        await startHost({ name: guest.name, avatar: guest.avatar, password: guest.password, relay: guest.relay, title: guest.title, code: guest.code, remember: guest.remember, takeover: kit });
    };

    // A room this browser hosted before, opened again, that nobody's hosting now: it hosts it
    const hostAgain = () => {
        const guest = room;
        const again = { name: guest.name, avatar: guest.avatar, password: guest.password, relay: guest.relay, title: guest.hostIfAlone.title, code: guest.code,
            remember: guest.remember, owner: guest.ownerSecret, ownerTag: guest.ownerTag, ticket: guest.ticket };
        teardown();
        startHost(again);
    };

    // The owner ends the room for everyone (as its host, or from a participant's seat through it)
    const endedByOwner = name => {
        if (!room || room.role !== "host") return;
        room.peers.forEach(peer => send(peer, { t: "bye", by: name }));
        forgetRoom(room.code, false);
        ended(["The room has ended", `${name} ended the room.`]);
    };

    // ---------- Same Wi-Fi
    // Browsers hide this device's local network address behind a random name ("….local") that
    // other devices on the network look up by multicast. Campus, office and hostel Wi-Fi often
    // blocks that, and their firewalls don't loop traffic back to the shared public address, so
    // devices on the same Wi-Fi can't find each other. Browsers use the real local address for
    // sites allowed to use the microphone, so asking once (and stopping the microphone straight
    // away) lets them connect directly. One side of a connection is enough.
    const LOCALNET_KEY = "cinetab:room-localnet";

    const micPermission = async () => {
        try {
            return (await navigator.permissions.query({ name: "microphone" })).state;
        } catch (e) {
            return "unknown";
        }
    };

    // Needs a click or a key press; true if the microphone is allowed
    const allowLocalNetwork = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            storage.set(LOCALNET_KEY, "1");
            renderLocalNetwork();
            return true;
        } catch (e) {
            toast(e.name === "NotAllowedError"
                ? "The microphone wasn't allowed, so devices on this Wi-Fi may not find each other"
                : "Couldn't turn on local network connections in this browser");
            return false;
        }
    };

    const localnetSwitch = panel.querySelector(".room-localnet-switch");
    const localnetNote = panel.querySelector(".room-localnet-note");
    const localnetText = localnetNote.textContent;
    async function renderLocalNetwork() {
        const granted = await micPermission() === "granted";
        localnetSwitch.checked = granted;
        localnetSwitch.disabled = granted;
        localnetNote.textContent = granted
            ? "On: the microphone is allowed for this site (it stays off unless you turn it on). Undo it in the browser's site settings."
            : localnetText;
        [createForm, joinForm].forEach(form => {
            const box = field(form, "localnet");
            if (granted) box.checked = true;
        });
    }
    localnetSwitch.addEventListener("change", async () => {
        if (!localnetSwitch.checked) return;
        localnetSwitch.checked = await allowLocalNetwork();
        if (localnetSwitch.checked) toast("Devices on this Wi-Fi can now find this one");
    });
    renderLocalNetwork();

    // What this network allows: reaching the relays, direct connections, a TURN relay, and
    // whether this device shows its local network address
    const iceCheck = () => new Promise(resolve => {
        const found = { host: false, srflx: false, relay: false, local: false };
        const pc = new RTCPeerConnection({ iceServers });
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            pc.close();
            resolve(found);
        };
        const timer = setTimeout(finish, 6000);
        pc.onicecandidate = e => {
            if (!e.candidate) return finish();
            found[e.candidate.type] = true;
            const address = e.candidate.address || e.candidate.candidate.split(" ")[4] || "";
            if (e.candidate.type === "host" && address && !address.endsWith(".local")) found.local = true;
        };
        pc.createDataChannel("check");
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(finish);
    });

    const checkNetwork = async back => {
        showStatus({ icon: "fa-stethoscope", title: "Checking this network…", text: "Takes a few seconds.", busy: true, onClose: back });
        await loadTurn();
        const [relays, ice] = await Promise.all([Signaling.check(), iceCheck()]);
        const reached = relays.filter(relay => relay.ok);
        const webOnly = reached.length && reached.every(relay => relay.port443);
        const list = [
            reached.length
                ? { ok: true, title: `Finding rooms works (${reached.length} of ${relays.length} relays)`, text: webOnly ? "Only through the relays on the normal web port; this network blocks the others, which is fine." : "Rooms can be created and joined from here." }
                : { ok: false, title: "This network blocks the relays used to find rooms", text: "Rooms can't be created or joined from here. Try mobile data or a phone hotspot." },
            ice.srflx
                ? { ok: true, title: "Direct connections over the internet work", text: "People on other networks can connect to you directly." }
                : { ok: false, title: "This network blocks direct connections over the internet", text: relayAvailable ? "People on other networks can still connect through the TURN relay." : "People on other networks still get into the room through the room's relay: chat, sync, YouTube and playing their own copy work, but the host's video can't stream to them. A phone hotspot, or a TURN relay set up for CineTab (see its README), fixes that." },
            !ice.host ? { ok: false, title: "Same Wi-Fi", text: "This browser doesn't offer local connections." }
                : ice.local ? { ok: true, title: "Same Wi-Fi: devices can find this one", text: "People on this network can connect to you directly, the fastest way, unless the Wi-Fi keeps devices apart altogether (some campus and hotel Wi-Fi does; then a phone hotspot for everyone works)." }
                : { ok: null, title: "Same Wi-Fi: this device is hidden", text: "Browsers hide this device behind a name that campus, office and hostel Wi-Fi often can't look up, so people on the same Wi-Fi may not connect. “Help devices find this one” below fixes that (the browser asks for the microphone; it stays off)." }
        ];
        if (relayAvailable) list.push(ice.relay
            ? { ok: true, title: "The TURN relay is reachable", text: "Connections work even where direct ones are blocked." }
            : { ok: false, title: "The TURN relay can't be reached", text: "Check its address and credentials in room.js." });
        const good = reached.length && (ice.srflx || ice.relay);
        showStatus({
            icon: good ? "fa-circle-check" : "fa-triangle-exclamation",
            title: good ? "This network looks good for rooms" : "This network blocks some of what rooms need",
            list,
            actions: [
                ice.host && !ice.local && { label: "Help devices find this one", icon: "fa-wifi", onClick: async () => {
                    if (await allowLocalNetwork()) checkNetwork(back);
                } },
                { label: "Back", icon: "fa-arrow-left", secondary: ice.host && !ice.local, onClick: back }
            ].filter(Boolean),
            onClose: back
        });
    };

    overlay.querySelectorAll(".room-check-network").forEach(button => button.addEventListener("click", () => {
        const view = button.closest(".room-view").dataset.view;
        checkNetwork(() => showView(view, closeDialog));
    }));

    const cantConnect = () => failedToJoin(
        "Couldn't connect to the host",
        "The room was found, but the host's browser stopped answering, directly or through the relay. Their CineTab tab may have been closed, or put to sleep (phones pause tabs in the background): ask them to keep it open in front, then try again. If it keeps happening, try a phone hotspot or home Wi-Fi on either side.",
        true
    );

    const notFound = () => failedToJoin(
        "Couldn't find this room",
        "Check the room code and password. The host's CineTab tab also has to be open."
    );

    const failedToJoin = async (title, text, offerLocal = false) => {
        const guest = room;
        if (guest.joinedOnce) return ended(["Connection lost", `Couldn't reconnect to ${guest.hostName}.`]);
        const retry = { code: Signaling.formatCode(guest.code), password: guest.password };
        teardown();
        // Joining again with the real local address, unless this browser already shows it
        const local = offerLocal && await micPermission() !== "granted";
        showStatus({
            icon: "fa-triangle-exclamation", title, text,
            actions: [
                local && { label: "Same Wi-Fi: try again", icon: "fa-wifi", onClick: async () => {
                    if (!await allowLocalNetwork()) return;
                    openJoin(retry);
                    joinForm.requestSubmit();
                } },
                { label: "Try again", icon: "fa-rotate-right", secondary: local, onClick: () => openJoin(retry) },
                { label: "Check my network", icon: "fa-stethoscope", secondary: true, onClick: () => checkNetwork(() => openJoin(retry)) }
            ].filter(Boolean),
            onClose: closeDialog
        });
    };

    const offer = async () => {
        const guest = room;
        guest.phase = "connecting";
        if (!guest.joinedOnce) showStatus({
            title: "Connecting to the host…", busy: true,
            actions: [{ label: "Cancel", secondary: true, onClick: () => leaveRoom(false) }],
            onClose: () => leaveRoom(false)
        });
        const peer = guest.peer = { id: guest.hostId, ...newConnection(guest.relay) };
        // Whose camera is where comes again from the host, for this connection
        guest.cams = null;
        const { pc, channel } = peer;
        // Cameras first: this guest's own (and the host's back), then the others the host passes on.
        // VP8 only (every browser has it): with every codec listed, the connection details grow
        // past what the host accepts and the relays carry. A browser that can't say so goes
        // without cameras, so its video always connects.
        const cameraCodecs = cameraCodecList();
        peer.camSlots = [];
        if (cameraCodecs) {
            peer.camTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
            for (let i = 0; i < CAM_SLOTS; i++) peer.camSlots.push(pc.addTransceiver("video", { direction: "recvonly" }));
            [peer.camTransceiver, ...peer.camSlots].forEach(transceiver => transceiver.setCodecPreferences(cameraCodecs));
        }
        peer.mediaVideoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
        peer.mediaVideoSender = peer.mediaVideoTransceiver.sender;
        peer.mediaAudioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
        peer.mediaAudioSender = peer.mediaAudioTransceiver.sender;
        peer.voiceTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
        peer.voiceSender = peer.voiceTransceiver.sender;
        pc.ontrack = event => {
            if (event.transceiver !== peer.voiceTransceiver) return;
            attachRemoteVoice(peer, event.track);
        };
        syncMicrophonePeer(peer);
        if (peer.camTransceiver) sendCamera(peer.camTransceiver.sender, camTrack());
        // A slightly bigger buffer: smoother playback matters more than a second of delay here
        pc.getReceivers().forEach(receiver => {
            try {
                receiver.jitterBufferTarget = 400;
            } catch (e) {}
        });
        const cameraReceivers = [peer.camTransceiver, ...peer.camSlots].filter(Boolean).map(transceiver => transceiver.receiver);
        guest.remote = new MediaStream(pc.getReceivers()
            .filter(receiver => receiver !== peer.voiceTransceiver.receiver && !cameraReceivers.includes(receiver))
            .map(receiver => receiver.track));
        if (together.stream) showRemote(guest.remote);
        wirePeer(peer, message => room === guest && guestHandle(message), () => lost(peer), true);
        watchRoute(peer, () => {
            renderState();
            if (guest.members) renderPeople(guest.members);
        });
        channel.onopen = () => {
            peer.opened = true;
            clearTimeout(guest.connectTimer);
            sayHello(peer);
        };
        const description = await pc.createOffer();
        await pc.setLocalDescription({ type: "offer", sdp: tuneAudio(description.sdp) });
        await gathered(pc);
        if (room !== guest || guest.peer !== peer) return;
        const sdp = await Signaling.sealText(guest.pairKey, pc.localDescription.sdp);
        guest.answered = false;
        let tries = 0;
        const sendOffer = () => {
            if (room !== guest || guest.answered || guest.peer !== peer) return clearInterval(guest.offerTimer);
            if (++tries > 6) {
                clearInterval(guest.offerTimer);
                return lost(peer);
            }
            guest.signal.send({ t: "offer", from: guest.id, to: guest.hostId, sdp });
        };
        guest.offerTimer = setInterval(sendOffer, 4000);
        sendOffer();
    };

    const guestSignal = async message => {
        const guest = room;
        if (message.to !== guest.id || typeof message.from !== "string") return;
        if (message.t === "hi" && !guest.hostId && typeof message.pub === "string") {
            guest.hostId = message.from;
            clearInterval(guest.knockTimer);
            clearTimeout(guest.takeoverTimer);
            try {
                guest.pairKey = await Signaling.pairSecret(guest.pair, message.pub, guest.signal.salt);
                await offer();
            } catch (e) {
                if (room === guest) cantConnect();
            }
        } else if (message.t === "refuse" && !guest.hostId) {
            clearInterval(guest.knockTimer);
            guestHandle({ t: "denied", reason: message.reason });
        } else if (message.t === "answer" && message.from === guest.hostId && guest.peer && !guest.answered && typeof message.sdp === "string") {
            guest.answered = true;
            clearInterval(guest.offerTimer);
            const peer = guest.peer;
            try {
                await peer.pc.setRemoteDescription({ type: "answer", sdp: await Signaling.unsealText(guest.pairKey, message.sdp) });
                // Direct connections open within a few seconds where the networks allow them
                guest.connectTimer = setTimeout(() => room === guest && guest.peer === peer && peer.channel.readyState !== "open" && lost(peer), DIRECT_WAIT);
            } catch (e) {
                if (room === guest) lost(peer);
            }
        } else if (message.t === "tunnel-ok" && message.from === guest.hostId && guest.peer && guest.peer.channel.isTunnel) {
            clearInterval(guest.offerTimer);
            guest.peer.channel.open();
        } else if (message.t === "tun" && message.from === guest.hostId && typeof message.d === "string" && guest.peer && guest.peer.channel.isTunnel) {
            guest.peer.channel.deliver(message.d);
        }
    };

    const sayHello = peer => {
        const guest = room;
        // Video can't come through the relays, so a guest connected that way plays their own copy
        const stream = !peer.channel.isTunnel && guest.watching === "stream";
        send(peer, { t: "hello", name: guest.name, avatar: guest.avatar, ticket: guest.ticket, stream, owner: guest.ownerSecret || undefined });
        startPings();
    };

    // The room through the relays, when a direct connection couldn't be made (see newTunnel)
    const useTunnel = direct => {
        const guest = room;
        closePeer(direct);
        clearTimeout(guest.connectTimer);
        clearInterval(guest.offerTimer);
        if (!guest.joinedOnce) showStatus({
            title: "Connecting through the relay…",
            text: "Your network and the host's don't allow a direct connection, so the room goes through the relay that found it.",
            busy: true,
            actions: [{ label: "Cancel", secondary: true, onClick: () => leaveRoom(false) }],
            onClose: () => leaveRoom(false)
        });
        const peer = guest.peer = { id: guest.hostId, rate: {}, route: "tunnel", pc: null };
        peer.channel = newTunnel(guest.signal, guest.pairKey, guest.id, guest.hostId);
        guest.remote = new MediaStream();
        wirePeer(peer, message => room === guest && guestHandle(message), () => lost(peer), true);
        peer.channel.onopen = () => {
            peer.opened = true;
            sayHello(peer);
            // Whatever was showing the stream switches to what works through the relay
            refreshGuestView();
            renderState();
            if (guest.members) renderPeople(guest.members);
        };
        let tries = 0;
        const ask = () => {
            if (room !== guest || guest.peer !== peer || peer.channel.readyState !== "connecting") return clearInterval(guest.offerTimer);
            if (++tries > 6) {
                clearInterval(guest.offerTimer);
                return lost(peer);
            }
            guest.signal.send({ t: "tunnel", from: guest.id, to: guest.hostId });
        };
        guest.offerTimer = setInterval(ask, 3000);
        ask();
    };

    const tunneled = () => !!(room && room.role === "guest" && room.peer && room.peer.channel.isTunnel);

    // Asks the room's host to say hello; repeats for a while in case the host is still connecting
    const knock = () => {
        const guest = room;
        guest.hostId = null;
        guest.pairKey = null;
        let tries = 0;
        clearInterval(guest.knockTimer);
        const send = () => {
            if (room !== guest || guest.hostId) return clearInterval(guest.knockTimer);
            if (++tries > (guest.hostIfAlone ? 3 : guest.knockLimit || 9)) {
                clearInterval(guest.knockTimer);
                if (guest.hostIfAlone) return hostAgain();
                return notFound();
            }
            guest.signal.send({ t: "knock", from: guest.id, pub: guest.pair.pub, rejoin: guest.ticket || guest.ownerSecret ? true : undefined });
        };
        guest.knockTimer = setInterval(send, 3000);
        send();
    };

    // `owner` / `ownerTag`: this browser's key to the room (it created it) and its fingerprint;
    // `rejoining`: the same room carrying on (no "looking for the room", the chat stays);
    // `hostIfAlone`: a room this browser hosted before: if nobody's hosting it now, it does
    const startGuest = async ({ code, password, name, avatar, relay, remember, ticket = null, owner = null, ownerTag = null, rejoining = false, hostIfAlone = null }) => {
        const guest = room = {
            role: "guest", code, password, name, avatar, relay, remember,
            title: "",
            id: Signaling.newId(),
            ticket,
            ownerSecret: owner, ownerTag, hostIfAlone,
            joinedOnce: rejoining, rejoining,
            phase: "finding",
            settings: { control: true, streaming: false, media: false },
            state: null, file: null, cues: null, cuesOn: true, ownCues: false,
            watching: "stream", ownFor: null,
            // A video this guest shares: { key, live } (see onGuestFile)
            presenting: null, sharePending: false, asked: null,
            offset: null, samples: [], seekLead: 0.15, seekStarted: 0,
            retries: 0, timers: []
        };
        if (together.solo) together.solo.stop();
        if (!rejoining) showStatus({
            title: hostIfAlone ? "Opening your room…" : "Looking for the room…",
            text: `Room ${Signaling.formatCode(code)}`,
            busy: true,
            actions: [{ label: "Cancel", secondary: true, onClick: () => leaveRoom(false) }],
            onClose: () => leaveRoom(false)
        });
        together.active = () => !!room;
        try {
            await loadTurn();
            guest.pair = await Signaling.newPairKey();
            guest.signal = await Signaling.join({ code, password, onMessage: message => room === guest && guestSignal(message) });
        } catch (e) {
            if (room === guest) failedToJoin("Couldn't look for the room", e.message);
            return;
        }
        if (room !== guest) return guest.signal.close();
        // While sharing a video, regular updates keep everyone's timeline and sync accurate
        guest.timers.push(setInterval(() => room === guest && sendPstate(), 2000));
        knock();
    };

    // =================== Both ===================

    ["play", "pause", "seeked", "ratechange"].forEach(type => mainVideo.addEventListener(type, () => {
        if (!room) return;
        renderHomeBar();
        const cause = { play: "play", pause: "pause", seeked: "seek", ratechange: "rate" }[type];
        if (room.role === "guest") return room.presenting ? sendPstate(cause) : guestMediaEvent(type);
        // The host watching a guest's video: the player only shows it, the guest's browser plays it
        if (together.stream) return;
        const byGuest = room.attribution && Date.now() < room.attribution.until;
        if (byGuest && type !== "ratechange") {
            showFeedback({ play: "fa-play", pause: "fa-pause", seeked: "fa-forward" }[type], room.attribution.name);
        }
        broadcast(stateMessage(cause));
    }));

    mainVideo.addEventListener("loadedmetadata", () => {
        if (!room || together.stream) return;
        if (room.role === "host") {
            shareFile();
            broadcast(stateMessage());
            sendSubtitles();
            updateStreams();
            return;
        }
        if (room.presenting) return sendPresent();
        if (room.phase !== "in" || !ownMatches()) return;
        // Warn once if this copy is a different length from the host's
        const key = fileKey(room.file);
        if (room.checkedFor !== key && room.file.duration && Math.abs(mainVideo.duration - room.file.duration) > 3) {
            addMessage({ system: true, text: `Your copy is ${formatTime(mainVideo.duration)} long and ${room.hostName}'s is ${formatTime(room.file.duration)}, so it may be a different version and scenes may not line up.` });
        }
        room.checkedFor = key;
        followHost();
        applyHostSubtitles();
        renderGuestWatch();
    });

    mainVideo.addEventListener("emptied", () => {
        if (room && room.role === "host" && !together.stream) {
            shareFile();
            updateStreams();
        }
    });

    // Subtitles loaded or removed for the room's video go to everyone: the host's, or those of the
    // guest sharing the video (through the host)
    const subtitlesChanged = () => {
        if (!room) return;
        if (room.role === "host") sendSubtitles();
        else sendPresenterSubs();
    };
    mainVideo.addEventListener("load", e => e.target.tagName === "TRACK" && subtitlesChanged(), true);
    mainVideo.textTracks.addEventListener("removetrack", subtitlesChanged);

    // Guests following with their own copy check in once a second
    setInterval(() => room && room.role === "guest" && followHost(), 1000);

    // ---------- Leaving

    // A host leaving passes the room on (`next`; older CineTabs end it); `ending`: the owner ends
    // it for everyone
    const sayBye = (ending = false) => {
        if (!room) return;
        const isEnding = ending === true;
        if (room.role === "host") room.peers.forEach(peer => send(peer, isEnding ? { t: "bye", by: room.name } : { t: "bye", next: true }));
        else send(room.peer, { t: "bye" });
    };

    // Stops everything network-related; the chat stays visible until the panel is closed
    const teardown = () => {
        toggleLeaveMenu(false);
        const old = room;
        if (!old) return;
        leaveStream();
        disableMicrophone();
        disableCamera(true);
        room = null;
        renderCameras();
        topRoomName.hidden = true;
        placeNowBar();
        clearInterval(old.knockTimer);
        clearInterval(old.offerTimer);
        clearInterval(old.streamTimer);
        clearTimeout(old.pingTimer);
        clearTimeout(old.pstateTimer);
        clearTimeout(old.queueTimer);
        clearTimeout(old.connectTimer);
        clearTimeout(old.takeoverTimer);
        old.timers.forEach(clearInterval);
        [...knockToasts.keys()].forEach(clearKnock);
        // A goodbye going through the relays (see newTunnel) needs a moment to go out
        const tunnels = old.role === "host" ? [...old.peers.values()].some(peer => peer.channel && peer.channel.isTunnel)
            : !!(old.peer && old.peer.channel && old.peer.channel.isTunnel);
        if (old.role === "host") old.peers.forEach(closePeer);
        else closePeer(old.peer);
        stopCapture();
        if (old.signal) setTimeout(() => old.signal.close(), tunnels ? 1500 : 0);
        together.following = false;
        together.onFile = null;
        together.openPanel = null;
        together.beforeHome = null;
        together.onTitle = null;
        together.active = () => false;
        chatInput.disabled = true;
        renderHomeBar();
    };

    const closeDialog = () => {
        // (the form in the side panel: back to Watch together - or home, if that's where it began)
        if (panelForm) {
            closePanelForm();
            if (!openedFromHome || currentFile) return;
        }
        hideOverlay();
        closeRoomUI();
        if (playerPage.hidden) return;
        if (openedFromHome && !currentFile) {
            openedFromHome = false;
            history.back();
        } else if (!hasMedia()) {
            openedFromHome = false;
            uploadOverlay.classList.remove("hidden");
        } else {
            openedFromHome = false;
        }
    };

    const ended = ([title, text]) => {
        if (!room) return;
        teardown();
        if (hasMedia()) mainVideo.pause();
        stateText.textContent = "The room has ended";
        showStatus({
            icon: "fa-door-closed", title, text,
            actions: [{ label: "Close", onClick: closeDialog }],
            onClose: closeDialog
        });
    };

    // `ask`: gives the user two options — just leave the room (it goes on) or end the room completely
    const leaveRoom = (ask, home = false, end = false) => {
        if (room && ask) return askLeave(home);
        if (room) {
            if (end && room.role === "guest") send(room.peer, { t: "end", by: room.name, owner: room.ownerSecret || undefined });
            if (end) forgetRoom(room.code, false);
            sayBye(end === true);
            teardown();
        }
        if (!home) return closeDialog();
        hideOverlay();
        closeRoomUI();
        history.back();
    };

    const askLeave = home => {
        const back = () => room && room.role === "guest" ? refreshGuestView() : hideOverlay();
        const isHost = room && room.role === "host";
        const hasOthers = isHost ? guests().length > 0 : true;
        showStatus({
            icon: "fa-right-from-bracket",
            title: "Leave or end room?",
            text: hasOthers
                ? "You can just leave the room while it carries on with others, or end the room completely."
                : "You can just leave the room, or end the room completely.",
            actions: [
                { label: "Just leave the room", icon: "fa-right-from-bracket", onClick: () => leaveRoom(false, home, false) },
                { label: "End the room", icon: "fa-door-closed", secondary: true, onClick: () => leaveRoom(false, home, true) }
            ],
            onClose: back
        });
    };

    // The player's back arrow (or logo) in a room: going home doesn't have to end it
    const askBeforeHome = () => {
        const host = room.role === "host";
        const restore = () => host ? hideOverlay() : refreshGuestView();
        showStatus({
            icon: "fa-house",
            title: "Go to the home page?",
            text: host
                ? "Your room stays open while you're on the home page: the video keeps playing for everyone, and you can come back any time. If you close this tab, the room goes on with everyone else."
                : "You stay in the room and can come back any time from the home page. Closing this tab takes you out of the room.",
            actions: [
                { label: host ? "Go home, keep the room open" : "Go home, stay in the room", icon: "fa-house", onClick: () => {
                    restore();
                    history.back();
                } },
                { label: "Leave the room", secondary: true, onClick: () => leaveRoom(true, true) }
            ],
            onClose: restore
        });
    };

    window.addEventListener("beforeunload", e => {
        if (!room || (room.role === "guest" && room.phase !== "in")) return;
        e.preventDefault();
        e.returnValue = "";
    });
    window.addEventListener("pagehide", () => sayBye(false));

    // ---------- Remembered rooms (in this browser only) and the home page bar

    const savedRooms = () => {
        try {
            const list = JSON.parse(storage.get(ROOMS_KEY) || "[]");
            return Array.isArray(list) ? list.filter(item => item && typeof item.code === "string" && Signaling.isValidCode(item.code) &&
                typeof item.password === "string" && (item.role === "host" || item.role === "guest")) : [];
        } catch (e) {
            return [];
        }
    };

    const approvedTickets = code => {
        try {
            const all = JSON.parse(storage.get(APPROVED_KEY) || "{}");
            return Array.isArray(all[code]) ? all[code].filter(ticket => typeof ticket === "string").slice(0, MAX_GUESTS * 3) : [];
        } catch (e) {
            return [];
        }
    };

    const saveApprovedTickets = (code, tickets) => {
        try {
            const all = JSON.parse(storage.get(APPROVED_KEY) || "{}");
            all[code] = tickets.slice(-MAX_GUESTS * 3);
            storage.set(APPROVED_KEY, JSON.stringify(all));
        } catch (e) {}
    };

    const deleteApprovedTickets = code => {
        try {
            const all = JSON.parse(storage.get(APPROVED_KEY) || "{}");
            delete all[code];
            storage.set(APPROVED_KEY, JSON.stringify(all));
        } catch (e) {}
    };

    const writeRooms = list => {
        storage.set(ROOMS_KEY, JSON.stringify(list.slice(0, 6)));
        renderRooms();
    };

    const rememberRoom = () => {
        if (!room || !room.remember || !room.title) return;
        const entry = { code: room.code, password: room.password, title: room.title, role: room.role, ticket: room.ticket || room.myTicket || null,
            owner: room.ownerSecret || null, ownerTag: room.ownerTag || null, at: Date.now() };
        writeRooms([entry, ...savedRooms().filter(item => item.code !== room.code)]);
    };

    const roomLabel = item => item.title || `Room ${Signaling.formatCode(item.code)}`;

    // Deletes a remembered room's code, password and name from this browser. If it's the room
    // you're in, it also stops being saved again.
    const forgetRoom = (code, ask = true) => {
        const item = savedRooms().find(saved => saved.code === code);
        if (item && ask && !confirm(`Delete “${roomLabel(item)}” from this browser?\n\nIts code and password are erased here. You can still join again with an invite link.`)) return false;
        writeRooms(savedRooms().filter(saved => saved.code !== code));
        deleteApprovedTickets(code);
        if (room && room.code === code) {
            room.remember = false;
            rememberSwitch.checked = false;
        }
        return true;
    };

    forgetAllBtn?.addEventListener("click", () => {
        if (!confirm("Delete all remembered rooms from this browser?\n\nTheir codes and passwords are erased here. You can still join again with an invite link.")) return;
        writeRooms([]);
        storage.remove(APPROVED_KEY);
        if (room) {
            room.remember = false;
            rememberSwitch.checked = false;
        }
    });

    rememberSwitch.addEventListener("change", () => {
        if (!room) return;
        room.remember = rememberSwitch.checked;
        if (room.remember) rememberRoom();
        else forgetRoom(room.code, false);
    });

    // Hosts open their room again with the same code and password; guests join it
    const reopen = item => {
        const name = storage.get(NAME_KEY);
        if (!name || !supported) return item.role === "host" ? openCreate(item) : openJoin({ code: item.code, password: item.password, remember: true });
        const avatar = storage.get(AVATAR_KEY) || "";
        if (item.role === "host") {
            toPlayer();
            // A room that went on without this browser: it joins it (its owner, or a former
            // host, is let straight in), and hosts it again if nobody's hosting it now
            if (item.owner || item.ownerTag) return startGuest({ code: item.code, password: item.password, name, avatar, remember: true, ticket: item.ticket,
                owner: item.owner, ownerTag: item.ownerTag, hostIfAlone: { title: item.title } });
            return startHost({ name, avatar, password: item.password, title: item.title, code: item.code, remember: true });
        }
        toPlayer();
        // The room's owner hosts it again if nobody's hosting it now
        return startGuest({ code: item.code, password: item.password, name, avatar, remember: true, ticket: item.ticket,
            owner: item.owner || null, ownerTag: item.ownerTag || null, hostIfAlone: item.owner ? { title: item.title } : null });
    };

    const renderRooms = () => {
        if (!roomList) return;
        const list = savedRooms();
        roomsSection.hidden = !list.length;
        roomList.replaceChildren(...list.map(item => {
            const host = item.role === "host";
            const li = el("li", "saved-item");
            const icon = el("span", "saved-icon");
            icon.append(el("i", `fa-solid ${host ? "fa-crown" : "fa-door-open"}`));
            const info = el("div", "saved-info");
            const date = new Date(item.at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
            info.append(el("p", "saved-name", roomLabel(item)),
                el("p", "saved-meta", `${Signaling.formatCode(item.code)} · ${host ? "you host it" : "you joined"} · last used ${date}`));
            const open = el("button", "btn btn-primary btn-sm saved-play");
            open.dataset.room = item.code;
            open.title = host ? "Open this room again with the same code and password" : "Join this room (its host needs to have it open)";
            open.append(el("i", `fa-solid ${host ? "fa-play" : "fa-right-to-bracket"}`), el("span", null, host ? "Open" : "Join"));
            const forget = el("button", "icon-btn saved-remove");
            forget.dataset.room = item.code;
            forget.dataset.forget = "";
            forget.title = `Delete “${roomLabel(item)}” from this browser (its code and password)`;
            forget.setAttribute("aria-label", forget.title);
            forget.append(el("i", "fa-solid fa-trash-can"));
            li.append(icon, info, open, forget);
            return li;
        }));
        renderHomeBar();
        renderTogetherRooms();
    };

    // ---------- The panel's Watch together tab (not in a room): create a room, join one with its
    // code or invite link, or open a remembered one again with one click
    function renderTogetherRooms() {
        const recent = panel.querySelector(".together-recent");
        const list = panel.querySelector(".together-rooms");
        if (!recent || !list || room) return;
        const rooms = savedRooms().slice(0, 4);
        recent.hidden = !rooms.length;
        list.replaceChildren(...rooms.map(item => {
            const host = item.role === "host";
            const button = el("button", "together-room");
            button.type = "button";
            button.dataset.room = item.code;
            button.title = host ? "Open this room again with the same code and password" : "Join this room (its host needs to have it open)";
            const text = el("span", "together-room-text");
            text.append(el("b", null, roomLabel(item)), el("small", null, `${Signaling.formatCode(item.code)} · ${host ? "you host it" : "you joined"}`));
            const icon = el("span", `together-room-icon${host ? " host" : ""}`);
            icon.append(el("i", `fa-solid ${host ? "fa-crown" : "fa-door-open"}`));
            button.append(icon, text, el("span", "together-room-go", host ? "Open" : "Join"));
            const li = el("li");
            li.append(button);
            return li;
        }));
    }
    panel.querySelector(".together-rooms")?.addEventListener("click", e => {
        const button = e.target.closest("button[data-room]");
        const item = button && savedRooms().find(saved => saved.code === button.dataset.room);
        if (item) reopen(item);
        else renderTogetherRooms();
    });
    const togetherJoin = panel.querySelector(".together-join");
    if (togetherJoin) {
        const codeInput = field(togetherJoin, "code");
        // A code (typed or pasted, any case, with or without dashes), or a whole invite link
        // (its password comes along too)
        const readJoin = text => {
            text = text.trim();
            const hash = text.includes("#") ? text.split("#")[1] : text.includes("join=") ? text : "";
            if (hash) {
                const params = new URLSearchParams(hash);
                if (params.get("join")) return { code: params.get("join"), password: params.get("pw") || "" };
            }
            return { code: text, password: "" };
        };
        codeInput.addEventListener("input", () => {
            const value = codeInput.value;
            if (/[#=/:]/.test(value)) return;
            const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (raw.length > 9) return;
            const formatted = raw.length > 6 ? `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6)}` : raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
            if (formatted !== value) codeInput.value = formatted;
        });
        togetherJoin.addEventListener("submit", e => {
            e.preventDefault();
            const join = readJoin(codeInput.value);
            codeInput.value = "";
            openJoin(join);
        });
    }
    panel.querySelector(".together-other")?.addEventListener("click", () => {
        const help = document.querySelector("#help-overlay");
        if (!help) return;
        mainVideo.pause();
        help.classList.remove("hidden");
    });

    roomList?.addEventListener("click", e => {
        const button = e.target.closest("button[data-room]");
        if (!button) return;
        const item = savedRooms().find(saved => saved.code === button.dataset.room);
        if (!item) return renderRooms();
        if ("forget" in button.dataset) forgetRoom(item.code);
        else reopen(item);
    });

    // On the home page: the room you're in (it keeps going), or the last room to get back into
    function renderHomeBar() {
        if (!homeBar) return;
        const [title, detail] = homeBar.querySelectorAll("b, small");
        const action = homeBar.querySelector(".room-home-action");
        const forget = homeBar.querySelector(".room-home-forget");
        const close = homeBar.querySelector(".room-home-dismiss");
        if (room) {
            const playing = room.role === "host" && !room.presenter && !room.yt ? hasMedia() && !mainVideo.paused
                : room.presenting ? hasMedia() && !mainVideo.paused : !!room.state && !room.state.paused;
            homeBar.hidden = false;
            homeBar.classList.add("live");
            title.textContent = room.title || "Joining a room…";
            detail.textContent = [
                room.role === "host" ? "You're hosting" : room.hostName && `${room.hostName} is hosting`,
                room.memberCount && plural(room.memberCount, "person").replace("persons", "people"),
                playing && "the video is playing",
                chatUnread && plural(chatUnread, "new message")
            ].filter(Boolean).join(" · ");
            action.textContent = "Return to room";
            forget.hidden = close.hidden = true;
            homeBar.dataset.code = "";
            return;
        }
        const last = savedRooms()[0];
        homeBar.classList.remove("live");
        homeBar.hidden = !last || homeBarDismissed;
        if (!last) return;
        const host = last.role === "host";
        title.textContent = `Welcome back! ${host ? "Open" : "Rejoin"} “${roomLabel(last)}”?`;
        detail.textContent = `Room ${Signaling.formatCode(last.code)} · ${host ? "you host it" : "its host needs to have it open"}`;
        action.textContent = host ? "Open room" : "Join room";
        forget.hidden = close.hidden = false;
        homeBar.dataset.code = last.code;
    }

    homeBar?.querySelector(".room-home-action").addEventListener("click", () => {
        if (room) {
            showPlayer();
            return showPanel(true);
        }
        const item = savedRooms().find(saved => saved.code === homeBar.dataset.code);
        if (item) reopen(item);
    });
    homeBar?.querySelector(".room-home-dismiss").addEventListener("click", () => {
        homeBarDismissed = true;
        renderHomeBar();
    });
    homeBar?.querySelector(".room-home-forget").addEventListener("click", () => forgetRoom(homeBar.dataset.code));

    // ---------- Opening the dialogs

    const unsupported = () => showStatus({
        icon: "fa-triangle-exclamation",
        title: "Rooms don't work in this browser",
        text: "Use a recent version of Chrome, Edge, Firefox or Safari, on the CineTab website (https).",
        actions: [{ label: "Close", onClick: closeDialog }],
        onClose: closeDialog
    });

    const toPlayer = () => {
        if (homePage && !homePage.hidden) openedFromHome = true;
        if (helpOverlay) helpOverlay.classList.add("hidden");
        if (uploadOverlay) uploadOverlay.classList.add("hidden");
        showPlayer();
    };

    // Name and avatar in the create and join dialogs: the avatar button opens the choice of avatars
    const formPicker = form => {
        const grid = form.querySelector(".room-avatar-grid");
        const button = form.querySelector(".room-avatar-btn");
        const picker = avatarPicker(grid, field(form, "name"), [button.querySelector(".room-avatar")]);
        button.addEventListener("click", () => grid.hidden = !grid.hidden);
        grid.addEventListener("click", e => e.target.closest("button") && (grid.hidden = true));
        return picker;
    };
    const createPicker = formPicker(createForm);
    const joinPicker = formPicker(joinForm);

    const fillProfile = (form, picker) => {
        field(form, "name").value = storage.get(NAME_KEY) || "";
        picker.value = storage.get(AVATAR_KEY) || "";
        form.querySelector(".room-avatar-grid").hidden = true;
        field(form, "localnet").checked = false;
        renderLocalNetwork();
    };

    // "Same Wi-Fi" ticked: the microphone permission first (it stays off), then the room
    const prepareLocalNetwork = async form => {
        if (field(form, "localnet").checked && await micPermission() !== "granted") await allowLocalNetwork();
    };

    // `saved`: a remembered room to open again with the same code and password
    const openCreate = (saved = null) => {
        toPlayer();
        if (room) return showPanel(true);
        if (!supported) return unsupported();
        fillProfile(createForm, createPicker);
        reopening = saved;
        createTitle.textContent = saved ? "Open your room again" : "Create a room";
        createText.textContent = saved ? `“${roomLabel(saved)}” (${Signaling.formatCode(saved.code)}) opens with the same code and password, so anyone who saved it can join again.` : createIntro;
        field(createForm, "title").value = saved ? saved.title || "" : "";
        const password = field(createForm, "password");
        password.value = saved ? saved.password : Signaling.newPassword();
        password.readOnly = !!saved;
        createForm.querySelector(".room-new-password").hidden = !!saved;
        field(createForm, "remember").checked = true;
        showView("create", closeDialog);
        field(createForm, "name").focus();
    };

    const openJoin = ({ code = "", password = "", remember = true, ticket = null } = {}) => {
        toPlayer();
        if (room) return showPanel(true);
        if (!supported) return unsupported();
        field(joinForm, "remember").checked = remember;
        const normalized = Signaling.normalizeCode(code);
        field(joinForm, "code").value = Signaling.isValidCode(normalized) ? Signaling.formatCode(normalized) : code;
        field(joinForm, "password").value = password;
        fillProfile(joinForm, joinPicker);
        joinError.hidden = true;
        showView("join", closeDialog);
        const empty = ["code", "password", "name"].map(name => field(joinForm, name)).find(input => !input.value);
        (empty || joinForm.querySelector('button[type="submit"]')).focus();
    };

    // Handle all create and join room triggers seamlessly via delegation
    document.addEventListener("click", e => {
        const createBtn = e.target.closest(".room-create-open");
        if (createBtn) {
            e.preventDefault();
            e.stopPropagation();
            openCreate();
            return;
        }
        const joinBtn = e.target.closest(".room-join-open");
        if (joinBtn) {
            e.preventDefault();
            e.stopPropagation();
            openJoin();
            return;
        }
    });

    const joinCodeInput = field(joinForm, "code");
    if (joinCodeInput) {
        joinCodeInput.addEventListener("input", () => {
            joinError.hidden = true;
            const raw = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
            let formatted = raw;
            if (raw.length > 6) formatted = `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 9)}`;
            else if (raw.length > 3) formatted = `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;
            if (joinCodeInput.value !== formatted && raw.length <= 9) {
                joinCodeInput.value = formatted;
            }
        });
        joinCodeInput.addEventListener("paste", () => {
            setTimeout(() => {
                const text = joinCodeInput.value.trim();
                if (text.includes("join=") || text.includes("#")) {
                    const params = new URLSearchParams(text.includes("#") ? text.split("#")[1] : text);
                    const code = params.get("join");
                    const pw = params.get("pw");
                    if (code) {
                        const norm = Signaling.normalizeCode(code);
                        joinCodeInput.value = Signaling.isValidCode(norm) ? Signaling.formatCode(norm) : code;
                    }
                    if (pw) field(joinForm, "password").value = pw;
                }
            }, 0);
        });
    }
    const joinPasswordInput = field(joinForm, "password");
    if (joinPasswordInput) {
        joinPasswordInput.addEventListener("input", () => joinError.hidden = true);
    }
    overlay.querySelectorAll(".room-cancel").forEach(button => button.addEventListener("click", closeDialog));
    createForm.querySelector(".room-new-password").addEventListener("click", () => field(createForm, "password").value = Signaling.newPassword());

    createForm.addEventListener("submit", async e => {
        e.preventDefault();
        const name = clean(field(createForm, "name").value, 30);
        const password = field(createForm, "password").value.trim();
        if (!name || password.length < 4) return;
        storage.set(NAME_KEY, name);
        storage.set(AVATAR_KEY, createPicker.value);
        await prepareLocalNetwork(createForm);
        startHost({
            name, avatar: createPicker.value, password,
            title: clean(field(createForm, "title").value, 40),
            code: reopening ? reopening.code : null,
            relay: field(createForm, "relay").checked,
            remember: field(createForm, "remember").checked
        });
    });

    joinForm.addEventListener("submit", async e => {
        e.preventDefault();
        const code = Signaling.normalizeCode(field(joinForm, "code").value);
        const password = field(joinForm, "password").value.trim();
        const name = clean(field(joinForm, "name").value, 30);
        const error = !Signaling.isValidCode(code) ? "Room codes have 9 letters and digits, like ABC-DEF-GHJ (there's no 0, 1, I, L or O)."
            : !password ? "Enter the room's password." : !name ? "Enter your name." : null;
        joinError.textContent = error || "";
        joinError.hidden = !error;
        if (error) return;
        storage.set(NAME_KEY, name);
        storage.set(AVATAR_KEY, joinPicker.value);
        await prepareLocalNetwork(joinForm);
        const saved = savedRooms().find(item => item.code === code);
        startGuest({ code, password, name, avatar: joinPicker.value, relay: field(joinForm, "relay").checked,
            remember: field(joinForm, "remember").checked, ticket: saved?.ticket || null });
    });

    // Invite links (#join=CODE&pw=PASSWORD): the part after # never reaches the web server, and
    // it's removed from the address bar straight away
    const joinFromLink = () => {
        const params = new URLSearchParams(location.hash.slice(1));
        const code = params.get("join");
        if (!code) return;
        history.replaceState(null, "", location.pathname + location.search);
        openJoin({ code, password: params.get("pw") || "" });
    };
    window.addEventListener("hashchange", joinFromLink);
    together.onHome = () => {
        placeToasts();
        renderRooms();
    };
    together.onPlayer = placeToasts;
    together.openPanel = null;
    together.toggleQueue = () => {
        if (panel.hidden || panelClosing) {
            if (!room) panel.classList.add("solo-queue");
            showTab("queue");
            showPanel(true);
        } else if (activeTab === "queue") {
            showPanel(false);
        } else {
            showTab("queue");
        }
    };
    together.openQueue = () => {
        if (!room) panel.classList.add("solo-queue");
        showTab("queue");
        showPanel(true);
    };
    // Not in a room, the Watch together button: the panel's Watch together tab (pressed again
    // while it's showing, the panel closes)
    together.toggleTogether = () => {
        if (room) return showPanel(true);
        panel.classList.add("solo-queue");
        if (!panel.hidden && !panelClosing && activeTab === "together") return showPanel(false);
        showTab("together");
        if (panel.hidden || panelClosing) showPanel(true);
        else renderTogetherRooms();
    };
    // Initialize right panel as solo-queue outside room
    panel.classList.add("solo-queue");

    // On a phone, fullscreen means the whole screen for the video: the panel steps aside (the Room
    // button brings it back, and new messages still pop up)
    const onFullscreen = () => {
        if (room && fullscreenElement() && matchMedia("(max-height: 500px), (max-width: 600px)").matches) showPanel(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    renderRooms();
    const openedInvite = new URLSearchParams(location.hash.slice(1)).has("join");
    joinFromLink();
    if (!openedInvite && !location.hash && savedRooms().length && storage.get(NAME_KEY)) {
        setTimeout(() => !room && reopen(savedRooms()[0]), 0);
    }
})();
