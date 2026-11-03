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
        { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }
    ];
    const RELAY_AVAILABLE = ICE_SERVERS.some(server => [].concat(server.urls).some(url => /^turns?:/.test(url)));
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
    const ROUTE_LABEL = { lan: "same network", direct: "direct connection", relay: "through a relay" };
    // Data channel messages above this size are sent in parts
    const CHUNK = 16000;
    const NAME_KEY = "cinetab:room-name";
    const AVATAR_KEY = "cinetab:room-avatar";
    const ROOMS_KEY = "cinetab:rooms";
    const HOST_SUBTITLES = "Host's subtitles";

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
    leaveBtn = panel.querySelector(".room-leave-btn"),
    leaveLabel = leaveBtn.querySelector("span"),
    profileSheet = panel.querySelector(".room-sheet"),
    shareLabel = shareHelpBtn.querySelector("span"),
    badge = el("b", "room-badge");

    badge.hidden = true;
    shareHelpBtn.append(badge);
    overlay.querySelectorAll(".room-relay").forEach(label => label.hidden = !RELAY_AVAILABLE);

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
    let reopening = null;
    let homeBarDismissed = false;
    const createIntro = createText.textContent;

    // ---------- Small helpers

    const now = () => performance.now();
    const finite = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
    // Names and messages: one line of plain text without control or direction-changing characters
    const clean = (text, max) => String(text ?? "")
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, " ")
        .replace(/\s+/g, " ").trim().slice(0, max);
    const hue = name => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    const fileKey = file => `${file.name}|${file.size}`;
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const field = (form, name) => form.elements.namedItem(name);
    const hasMedia = () => !!mainVideo.getAttribute("src") && mainVideo.readyState > 0 && playbackMode !== "converting";
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

    // `onClose` runs for the × button and Esc
    const showView = (name, onClose = hideOverlay) => {
        views.forEach(view => view.hidden = view.dataset.view !== name);
        closeAction = onClose;
        // On small screens a dialog gets the whole screen, unless the room's chat is open beside it
        overlay.classList.toggle("room-modal", panel.hidden);
        overlay.classList.remove("hidden");
    };
    const hideOverlay = () => overlay.classList.add("hidden");
    overlayClose.addEventListener("click", () => (closeAction || hideOverlay)());

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
            if (action.icon) button.append(el("i", `fa-solid ${action.icon}`), " ");
            button.append(action.label);
            button.addEventListener("click", action.onClick);
            return button;
        }));
        statusActions.hidden = !actions.length;
        showView("status", onClose);
    };

    // Pop-ups go wherever they can be seen: the player (also in fullscreen) or the home page.
    // Switching between them clears old ones, so none is left covering the other view.
    const placeToasts = () => {
        const host = playerPage.hidden ? document.body : playerPage;
        if (toasts.parentNode === host) return;
        toasts.replaceChildren();
        host.append(toasts);
    };

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
        while (toasts.children.length > 3) toasts.firstChild.remove();
        setTimeout(() => item.remove(), onClick ? 7000 : 5000);
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

    const updateBadges = () => {
        const waiting = waitingCount();
        chatBadge.hidden = !chatUnread;
        chatBadge.textContent = chatUnread > 9 ? "9+" : chatUnread;
        peopleBadge.hidden = !waiting;
        peopleBadge.textContent = waiting;
        const total = panel.hidden ? chatUnread + waiting : 0;
        badge.hidden = !total;
        badge.textContent = total > 9 ? "9+" : total;
        renderHomeBar();
    };

    const scrollChat = () => chatList.scrollTop = chatList.scrollHeight;

    const showTab = tab => {
        activeTab = tab;
        tabButtons.forEach(button => {
            button.classList.toggle("active", button.dataset.tab === tab);
            button.setAttribute("aria-selected", button.dataset.tab === tab);
        });
        tabPanels.forEach(section => section.hidden = section.dataset.tab !== tab);
        if (tab === "chat") {
            chatUnread = 0;
            scrollChat();
        }
        updateBadges();
    };

    const showPanel = show => {
        panel.hidden = !show;
        playerPage.classList.toggle("room-open", show);
        if (show && activeTab === "chat") {
            chatUnread = 0;
            scrollChat();
        }
        if (!show) closeProfile();
        updateBadges();
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
        shareLabel.textContent = `Room · ${members.length}`;
        const streaming = room.role === "host" ? room.settings.streaming && canStream : room.settings.streaming;
        peopleList.replaceChildren(...members.map(member => {
            const item = el("li", "room-person");
            const info = el("span", "room-person-info");
            const you = member.id === room.id;
            const name = el("span", "room-person-name", member.name);
            if (you) name.append(el("span", "room-person-you", " (you)"));
            const route = room.role === "host" ? member.route : you ? room.peer && room.peer.route : null;
            const meta = [member.host ? "Host" : member.stream && streaming ? "Watching the stream" : "Playing their own copy", ROUTE_LABEL[route]]
                .filter(Boolean).join(" · ");
            info.append(name, el("span", "room-person-meta", meta));
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

    const enterRoomUI = () => {
        roomNameInput.value = room.title;
        hostSettings.hidden = room.role !== "host";
        guestSettings.hidden = room.role === "host";
        leaveLabel.textContent = room.role === "host" ? "End room" : "Leave";
        leaveBtn.title = room.role === "host" ? "End the room for everyone" : "Leave the room";
        chatInput.disabled = false;
        chatList.replaceChildren();
        chatItems.clear();
        cancelReply();
        lastMessage = null;
        chatUnread = 0;
        requestList.replaceChildren();
        linkPasswordBox.checked = true;
        rememberSwitch.checked = !!room.remember;
        renderInvite();
        renderMe();
        together.following = room.role === "guest";
        together.openPanel = () => showPanel(panel.hidden);
        together.beforeHome = askBeforeHome;
        together.onTitle = room.role === "host" ? () => broadcast({ t: "file", file: fileInfo() }) : null;
        together.active = () => !!room;
        together.onFile = room.role === "guest" ? onGuestFile : null;
        // A new host starts on the invite details, a guest on the chat
        showTab(room.role === "host" ? "invite" : "chat");
        showPanel(true);
        renderState();
    };

    const closeRoomUI = () => {
        showPanel(false);
        chatUnread = 0;
        updateBadges();
        shareLabel.textContent = "Watch together";
        chatList.replaceChildren();
        lastMessage = null;
        requestList.replaceChildren();
        peopleList.replaceChildren();
    };

    tabButtons.forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab)));
    panel.querySelector(".room-invite-more").addEventListener("click", () => showTab("invite"));
    hidePanelBtn.addEventListener("click", () => showPanel(false));
    panel.querySelector('[data-copy="code"]').addEventListener("click", () => copy(Signaling.formatCode(room.code), "Room code"));
    panel.querySelector('[data-copy="password"]').addEventListener("click", () => copy(room.password, "Password"));
    copyLinkBtn.addEventListener("click", () => copy(inviteLink(), "Invite link"));
    linkPasswordBox.addEventListener("change", () => renderQr(inviteLink()));
    leaveBtn.addEventListener("click", () => leaveRoom(true));

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
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceTransportPolicy: relay && RELAY_AVAILABLE ? "relay" : "all" });
        return { pc, channel: pc.createDataChannel("room", { negotiated: true, id: 0 }), rate: {} };
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
            peer.pc.close();
        } catch (e) {}
    };

    const wirePeer = (peer, onMessage, onGone, allowParts) => {
        peer.channel.onmessage = e => receive(peer, e.data, onMessage, allowParts);
        peer.channel.onclose = onGone;
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
        if (text.length <= CHUNK) return peer.channel.send(text);
        const id = Signaling.newId();
        const count = Math.ceil(text.length / CHUNK);
        for (let i = 0; i < count; i++) {
            peer.channel.send(JSON.stringify({ t: "part", id, i, n: count, d: text.slice(i * CHUNK, (i + 1) * CHUNK) }));
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
        if (!allowParts || typeof id !== "string" || !Number.isInteger(n) || n < 2 || n > 200 ||
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

    const publicSettings = () => ({ control: room.settings.control, streaming: room.settings.streaming && canStream, title: room.title });

    const fileInfo = () => hasMedia() && currentSource ? {
        name: currentSource.name,
        size: currentSource.size,
        duration: Number.isFinite(mainVideo.duration) ? mainVideo.duration : 0,
        title: videoTitle.textContent,
        audio: container.classList.contains("audio-mode")
    } : null;

    // Who caused the next play/pause/seek: the host, or a guest whose request is being applied
    const stateMessage = (cause = null) => {
        const by = room.attribution && Date.now() < room.attribution.until ? room.attribution : { name: room.name, id: room.id };
        return {
            t: "state",
            paused: !hasMedia() || mainVideo.paused,
            time: mainVideo.currentTime || 0,
            rate: mainVideo.playbackRate,
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
    const sendSubtitles = peer => {
        const message = { t: "subs", cues: subtitleCues() };
        peer ? send(peer, message) : broadcast(message);
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
        const members = [
            { id: room.id, name: room.name, avatar: room.avatar, host: true },
            ...guests().map(peer => ({ id: peer.id, name: peer.name, avatar: peer.avatar, stream: peer.wantsStream, route: peer.route }))
        ];
        broadcast({ t: "members", members });
        renderPeople(members);
        renderState();
    };

    const renderRequests = () => {
        const waiting = [...room.peers.values()].filter(peer => peer.status === "waiting");
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
        shareMembers();
        if (oldName !== room.name) notice(`${oldName} is now ${room.name}`);
    };

    // ---------- Streaming the host's video

    const captureSource = () => {
        if (!captured && canStream) {
            captured = mainVideo.captureStream();
            captured.addEventListener("addtrack", updateStreams);
            captured.addEventListener("removetrack", updateStreams);
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
                const chosen = room.settings.quality;
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

    // Each guest who wants the stream gets the host's picture and sound; the rest get nothing
    const updateStreams = () => {
        if (!room || room.role !== "host") return;
        const source = room.settings.streaming && guests().some(peer => peer.wantsStream) ? captureSource() : null;
        const video = source && hasMedia() ? source.getVideoTracks()[0] || null : null;
        const audio = source && hasMedia() ? source.getAudioTracks()[0] || null : null;
        if (video) video.contentHint = "motion";
        if (audio) audio.contentHint = "music";
        for (const peer of room.peers.values()) {
            const on = peer.status === "admitted" && peer.wantsStream;
            setTrack(peer.senders.video, on ? video : null, "video", peer);
            setTrack(peer.senders.audio, on ? audio : null, "audio", peer);
        }
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
        if (key === "streaming" || key === "quality") updateStreams();
        if (key === "control" || key === "streaming") {
            broadcast({ t: "settings", ...publicSettings() });
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
            shareMembers();
            updateStreams();
            if (!quietly) notice(`${peer.name} left`);
        }
    };

    // Turns someone away (lobby denied, removed, locked or full room)
    const refuse = (peer, reason) => {
        const wasIn = peer.status === "admitted";
        send(peer, { t: "denied", reason });
        peer.status = "refused";
        renderRequests();
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
        send(peer, {
            ...stateMessage(),
            t: "welcome",
            ticket: peer.ticket,
            host: room.name,
            hostId: room.id,
            settings: publicSettings(),
            file: fileInfo()
        });
        sendSubtitles(peer);
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
        refuse(peer, "removed");
        notice(`${peer.name} was removed from the room`);
    });

    // A guest's playback request (when guests may control playback)
    const applyControl = (peer, message) => {
        if (!hasMedia()) return;
        room.attribution = { name: peer.name, id: peer.id, until: Date.now() + 1500 };
        if (finite(message.rate, 0.25, 4)) mainVideo.defaultPlaybackRate = mainVideo.playbackRate = Math.round(message.rate * 100) / 100;
        if (finite(message.time, 0, 1e7)) mainVideo.currentTime = Math.min(message.time, mainVideo.duration || message.time);
        if (message.paused === true) mainVideo.pause();
        else if (message.paused === false) mainVideo.play().catch(() => {});
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
            peer.wantsStream = message.stream !== false;
            if (typeof message.ticket === "string" && room.tickets.has(message.ticket)) {
                peer.ticket = message.ticket;
                return admit(peer, true);
            }
            if (room.settings.locked) return refuse(peer, "locked");
            if (guests().length >= MAX_GUESTS) return refuse(peer, "full");
            if (!room.settings.lobby) return admit(peer);
            peer.status = "waiting";
            send(peer, { t: "waiting" });
            renderRequests();
            toast("wants to join", peer.name, peer.avatar);
            return;
        }
        if (peer.status !== "admitted") return;
        if (message.t === "chat") {
            const text = clean(message.text, 500);
            if (text && allow(peer, "chat", 5, 5000)) shareChat(peer.id, peer.name, peer.avatar, text, message.reply);
        } else if (message.t === "react") {
            if (typeof message.id === "string" && allow(peer, "react", 20, 10000)) applyReaction(peer.id, peer.name, message.id, message.emoji);
        } else if (message.t === "control") {
            if (room.settings.control && allow(peer, "control", 12, 5000)) applyControl(peer, message);
        } else if (message.t === "want") {
            peer.wantsStream = message.stream === true;
            updateStreams();
            shareMembers();
        } else if (message.t === "profile") {
            if (!allow(peer, "profile", 5, 10000)) return;
            const old = peer.name;
            peer.name = clean(message.name, 30) || old;
            peer.avatar = validAvatar(message.avatar);
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
            wirePeer(peer, message => room === host && hostHandle(peer, message), () => dropPeer(peer), false);
            watchRoute(peer, () => {
                updateStreams();
                shareMembers();
            });
            await peer.pc.setRemoteDescription({ type: "offer", sdp });
            for (const transceiver of peer.pc.getTransceivers()) {
                transceiver.direction = "sendonly";
                peer.senders[transceiver.receiver.track.kind] = transceiver.sender;
            }
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

    const hostSignal = message => {
        const host = room;
        const { t, from } = message;
        if (typeof from !== "string" || from.length > 40 || from === host.id) return;
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

    const startHost = async ({ name, avatar, password, relay, title, code, remember }) => {
        const host = room = {
            role: "host",
            code: code || Signaling.newCode(),
            title: title || `${name}'s room`,
            password, name, avatar, relay, remember,
            id: Signaling.newId(),
            settings: { lobby: true, control: true, streaming: canStream, quality: "standard", locked: false },
            peers: new Map(),
            knocks: new Map(),
            tickets: new Set(),
            chatLog: new Map(),
            attribution: null,
            timers: []
        };
        showStatus({ icon: "fa-door-open", title: "Creating your room…", busy: true, onClose: () => leaveRoom(false) });
        try {
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
        // Regular updates keep guests' timelines and sync accurate
        host.timers.push(setInterval(() => broadcast(stateMessage()), 3000));
        syncSettingsUI();
        enterRoomUI();
        rememberRoom();
        renderPeople([{ id: host.id, name: host.name, avatar: host.avatar, host: true }]);
        hideOverlay();
        addMessage({ system: true, text: "Room created. Invite people with the link, the QR code, or the room code and password. Messages aren't saved anywhere." });
        if (!currentFile) uploadOverlay.classList.remove("hidden");
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
        audio: file.audio === true
    } : null;

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
        if (together.stream || !ownMatches() || !hasMedia()) return;
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
        if (!live) streamWaitText.textContent = `Connecting to ${room.hostName}'s stream…`;
    };

    // What the player's controls do while watching the stream (see `together` in script.js)
    const streamControls = {
        get paused() { return !room || !room.state || room.state.paused; },
        get duration() { return room && room.file ? room.file.duration : 0; },
        currentTime: () => expectedTime(),
        request: change => request(change),
        toggleSubtitles: () => {
            if (!room.cues) return showFeedback("fa-closed-captioning", "No subtitles");
            room.cuesOn = !room.cuesOn;
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

    const enterStream = () => {
        const file = room.file;
        videoTitle.textContent = audioTitle.textContent = file.title;
        container.classList.toggle("audio-mode", file.audio);
        if (together.stream) return;
        cancelConversion();
        mainVideo.pause();
        removeSubtitles();
        [uploadOverlay, errorOverlay, compatBanner].forEach(item => item.classList.add("hidden"));
        together.stream = streamControls;
        container.classList.add("remote");
        mainVideo.srcObject = room.remote;
        mainVideo.play().catch(playBlocked);
        room.shownPlaying = null;
        subtitlesBtn.classList.toggle("active", !!room.cues && room.cuesOn);
        clearInterval(room.streamTimer);
        room.streamTimer = setInterval(streamTick, 250);
        streamTick();
    };

    const leaveStream = () => {
        if (!together.stream) return;
        together.stream = null;
        if (room) clearInterval(room.streamTimer);
        container.classList.remove("remote", "audio-mode");
        cueBox.hidden = streamWait.hidden = true;
        // Falls back to this browser's own file, if one is open
        mainVideo.srcObject = null;
        videoTitle.textContent = audioTitle.textContent = currentSource ? savedTitle(currentSource.name, currentSource.size) : "No Video Loaded";
        subtitlesBtn.classList.remove("active");
        progressBar.style.width = "0%";
        currentVidTime.innerText = videoDuration.innerText = formatTime(0);
        showPlaying(false);
    };

    // ---------- Following the host with this browser's own copy

    const followHost = () => {
        if (!room || room.role !== "guest" || room.phase !== "in" || together.stream || !ownMatches() || !hasMedia() || !room.state) return;
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

    // Asks the host to play, pause, jump or change speed; acts right away and the host confirms
    const request = change => {
        if (!room || room.role !== "guest" || room.phase !== "in" || !room.file) return false;
        if (!room.settings.control) {
            showFeedback("fa-lock", "Host only");
            return false;
        }
        send(room.peer, { t: "control", ...change });
        const state = room.state || { paused: true, time: 0, rate: 1 };
        room.state = {
            paused: change.paused ?? state.paused,
            time: change.time ?? expectedTime(),
            rate: change.rate ?? state.rate,
            at: room.offset === null ? null : hostNow()
        };
        if (together.stream) streamTick();
        return true;
    };

    // Play/pause/seek/speed on a guest's own copy: the guest's own action, or the effect of following?
    const guestMediaEvent = type => {
        if (room.phase !== "in" || together.stream || !room.state || !ownMatches() || mainVideo.readyState < 1) return;
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

    // Settings tab for guests: the host's stream or their own copy
    const renderGuestWatch = () => {
        const host = room.hostName;
        const file = room.file;
        const streaming = room.settings.streaming && !!file;
        const own = !together.stream && ownMatches();
        streamChoice.disabled = !streaming;
        streamChoice.classList.toggle("active", !!together.stream);
        streamChoice.querySelector("b").textContent = `${host}'s stream`;
        streamChoice.querySelector("small").textContent = !file ? `Available when ${host} starts a video`
            : !room.settings.streaming ? `${host} isn't streaming right now`
            : together.stream ? "Watching now · nothing to download" : "Watch as it plays · nothing to download";
        ownChoice.disabled = !file;
        ownChoice.classList.toggle("active", own);
        ownChoice.querySelector("small").textContent = !file ? `Available when ${host} starts a video`
            : own ? "Playing now, in step with the host · choose another file" : "The same movie on this device · sharpest picture";
    };

    streamChoice.addEventListener("click", () => room && room.role === "guest" && !together.stream && setWatching("stream"));
    ownChoice.addEventListener("click", () => room && room.role === "guest" && fileInput.click());

    const setWatching = mode => {
        room.watching = mode;
        send(room.peer, { t: "want", stream: mode === "stream" });
        refreshGuestView();
    };

    // Decides what a guest sees: the host's stream, their own copy, or a prompt
    const refreshGuestView = () => {
        if (!room || room.role !== "guest" || room.phase !== "in") return;
        const host = room.hostName;
        const file = room.file;
        // Guests get the room's own prompts instead of "Select a movie"
        uploadOverlay.classList.add("hidden");
        if (!file) {
            leaveStream();
            if (hasMedia()) mainVideo.pause();
            showStatus({
                icon: "fa-couch",
                title: `Waiting for ${host} to start a video`,
                text: "Chat with everyone in the meantime. The video shows up here as soon as it starts."
            });
        } else if (room.watching === "stream" && room.settings.streaming) {
            hideOverlay();
            enterStream();
        } else {
            leaveStream();
            if (ownMatches()) {
                hideOverlay();
                followHost();
            } else {
                if (hasMedia()) mainVideo.pause();
                const details = [formatBytes(file.size), file.duration && formatTime(file.duration)].filter(Boolean).join(", ");
                showStatus({
                    icon: "fa-film",
                    title: `Open your copy of “${file.title}”`,
                    text: `${host} is playing ${file.name} (${details}). Choose the same movie on this device and CineTab keeps it in step with ${host}.` +
                        (room.settings.streaming ? "" : ` ${host} isn't streaming it right now.`),
                    actions: [
                        { label: "Choose my copy", icon: "fa-folder-open", onClick: () => fileInput.click() },
                        room.settings.streaming && { label: `Watch ${host}'s stream`, secondary: true, onClick: () => setWatching("stream") }
                    ].filter(Boolean)
                });
            }
        }
        renderGuestWatch();
    };

    // A guest opening a file switches to their own copy of the host's movie
    const onGuestFile = file => {
        if (!room || room.phase !== "in") return;
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
            addMessage({ system: true, text: `Your file's name is different from ${room.hostName}'s (${room.file.name}). If it's the same movie it will play in step; if not, watch ${room.hostName}'s stream instead.` });
        }
    };

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

    const applyState = message => {
        const previous = room.state;
        const state = room.state = validState(message);
        if (previous && message.cause && message.byId !== room.id) {
            const by = clean(message.by, 30);
            if (message.cause === "play" && previous.paused && !state.paused) showFeedback("fa-play", by);
            else if (message.cause === "pause" && !previous.paused && state.paused) showFeedback("fa-pause", by);
            else if (message.cause === "seek") showFeedback(state.time >= previous.time ? "fa-forward" : "fa-backward", by);
            else if (message.cause === "rate" && previous.rate !== state.rate) showFeedback("fa-gauge-high", `${state.rate}x`);
        }
        if (together.stream) streamTick();
        else followHost();
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
                return ended(["The room has ended", `${guest.hostName || "The host"} ended the room.`]);
            case "welcome": {
                if (guest.phase === "in") return;
                guest.phase = "in";
                guest.retries = 0;
                clearTimeout(guest.connectTimer);
                guest.ticket = typeof message.ticket === "string" ? message.ticket.slice(0, 64) : null;
                guest.hostName = clean(message.host, 30) || "The host";
                guest.settings = { control: message.settings?.control !== false, streaming: message.settings?.streaming === true };
                guest.title = clean(message.settings?.title, 40) || `${guest.hostName}'s room`;
                guest.file = validFile(message.file);
                guest.state = validState(message);
                if (!guest.joinedOnce) {
                    guest.joinedOnce = true;
                    enterRoomUI();
                    addMessage({ system: true, text: `You joined ${guest.hostName}'s room. Messages aren't saved anywhere.` });
                } else {
                    addMessage({ system: true, text: "Reconnected." });
                }
                renderState();
                rememberRoom();
                return refreshGuestView();
            }
        }
        if (guest.phase !== "in") return;
        switch (message.t) {
            case "state":
                return applyState(message);
            case "file": {
                const file = validFile(message.file);
                const changed = !file || !guest.file || fileKey(file) !== fileKey(guest.file) || file.duration !== guest.file.duration;
                guest.file = file;
                if (!file) guest.cues = guest.ownCues ? guest.cues : null;
                // Just renamed by the host
                if (changed) refreshGuestView();
                else if (together.stream) videoTitle.textContent = audioTitle.textContent = file.title;
                return;
            }
            case "settings":
                guest.settings = { control: message.control !== false, streaming: message.streaming === true };
                if (clean(message.title, 40) && clean(message.title, 40) !== guest.title) {
                    guest.title = clean(message.title, 40);
                    renderState();
                    rememberRoom();
                }
                return refreshGuestView();
            case "members": {
                if (!Array.isArray(message.members)) return;
                const members = message.members.slice(0, MAX_GUESTS + 1)
                    .filter(member => member && typeof member.id === "string")
                    .map(member => ({ id: member.id, name: clean(member.name, 30) || "Guest", avatar: validAvatar(member.avatar), host: member.host === true, stream: member.stream === true }));
                guest.members = members;
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
        closePeer(peer);
        guest.peer = null;
        clearTimeout(guest.pingTimer);
        clearTimeout(guest.connectTimer);
        clearInterval(guest.offerTimer);
        if (guest.phase === "in" && guest.ticket && guest.retries < 3) {
            // Try again quietly; the host recognises this guest and lets them straight back in
            guest.retries++;
            guest.phase = "reconnecting";
            guest.id = Signaling.newId();
            renderState();
            addMessage({ system: true, text: `Lost the connection to ${guest.hostName}. Reconnecting…` });
            knock();
        } else if (guest.joinedOnce) {
            ended(["Connection lost", `The connection to ${guest.hostName} dropped. They may have closed CineTab or lost their internet connection.`]);
        } else {
            cantConnect();
        }
    };

    // What this network allows: reaching the relays, direct connections, a TURN relay
    const iceCheck = () => new Promise(resolve => {
        const found = { host: false, srflx: false, relay: false };
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            pc.close();
            resolve(found);
        };
        const timer = setTimeout(finish, 6000);
        pc.onicecandidate = e => e.candidate ? found[e.candidate.type] = true : finish();
        pc.createDataChannel("check");
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(finish);
    });

    const checkNetwork = async back => {
        showStatus({ icon: "fa-stethoscope", title: "Checking this network…", text: "Takes a few seconds.", busy: true, onClose: back });
        const [relays, ice] = await Promise.all([Signaling.check(), iceCheck()]);
        const reached = relays.filter(relay => relay.ok);
        const webOnly = reached.length && reached.every(relay => relay.port443);
        const list = [
            reached.length
                ? { ok: true, title: `Finding rooms works (${reached.length} of ${relays.length} relays)`, text: webOnly ? "Only through the relays on the normal web port; this network blocks the others, which is fine." : "Rooms can be created and joined from here." }
                : { ok: false, title: "This network blocks the relays used to find rooms", text: "Rooms can't be created or joined from here. Try mobile data or a phone hotspot." },
            ice.srflx
                ? { ok: true, title: "Direct connections over the internet work", text: "People on other networks can connect to you directly." }
                : { ok: false, title: "This network blocks direct connections over the internet", text: RELAY_AVAILABLE ? "People on other networks can still connect through the TURN relay." : "People on other networks can't connect to you unless a TURN relay is set up for CineTab (see its README). Mobile data or a hotspot usually works." },
            { ok: ice.host ? null : false, title: "Same Wi-Fi", text: ice.host ? "People on this same network connect to each other directly, which is the fastest, unless the network keeps devices apart (some campus and hotel Wi-Fi does). If they can't connect, use a phone hotspot for everyone." : "This browser doesn't offer local connections." }
        ];
        if (RELAY_AVAILABLE) list.push(ice.relay
            ? { ok: true, title: "The TURN relay is reachable", text: "Connections work even where direct ones are blocked." }
            : { ok: false, title: "The TURN relay can't be reached", text: "Check its address and credentials in room.js." });
        const good = reached.length && (ice.srflx || ice.relay);
        showStatus({
            icon: good ? "fa-circle-check" : "fa-triangle-exclamation",
            title: good ? "This network looks good for rooms" : "This network blocks some of what rooms need",
            list,
            actions: [{ label: "Back", icon: "fa-arrow-left", onClick: back }],
            onClose: back
        });
    };

    overlay.querySelectorAll(".room-check-network").forEach(button => button.addEventListener("click", () => {
        const view = button.closest(".room-view").dataset.view;
        checkNetwork(() => showView(view, closeDialog));
    }));

    const cantConnect = () => failedToJoin(
        "Couldn't connect to the host",
        "The room was found, but your two networks didn't allow a direct connection. Some mobile data and office or school networks block it. Try again on a different network (home Wi-Fi or a phone hotspot) on either side."
    );

    const notFound = () => failedToJoin(
        "Couldn't find this room",
        "Check the room code and password. The host's CineTab tab also has to be open."
    );

    const failedToJoin = (title, text) => {
        const guest = room;
        if (guest.joinedOnce) return ended(["Connection lost", `Couldn't reconnect to ${guest.hostName}.`]);
        const retry = { code: Signaling.formatCode(guest.code), password: guest.password };
        teardown();
        showStatus({
            icon: "fa-triangle-exclamation", title, text,
            actions: [
                { label: "Try again", icon: "fa-rotate-right", onClick: () => openJoin(retry) },
                { label: "Check my network", icon: "fa-stethoscope", secondary: true, onClick: () => checkNetwork(() => openJoin(retry)) }
            ],
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
        const { pc, channel } = peer;
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
        // A slightly bigger buffer: smoother playback matters more than a second of delay here
        pc.getReceivers().forEach(receiver => {
            try {
                receiver.jitterBufferTarget = 400;
            } catch (e) {}
        });
        guest.remote = new MediaStream(pc.getReceivers().map(receiver => receiver.track));
        if (together.stream) mainVideo.srcObject = guest.remote;
        wirePeer(peer, message => room === guest && guestHandle(message), () => lost(peer), true);
        watchRoute(peer, () => {
            renderState();
            if (guest.members) renderPeople(guest.members);
        });
        channel.onopen = () => {
            send(peer, { t: "hello", name: guest.name, avatar: guest.avatar, ticket: guest.ticket, stream: guest.watching === "stream" });
            startPings();
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
                guest.connectTimer = setTimeout(() => room === guest && guest.peer === peer && peer.channel.readyState !== "open" && lost(peer), 20000);
            } catch (e) {
                if (room === guest) lost(peer);
            }
        }
    };

    // Asks the room's host to say hello; repeats for a while in case the host is still connecting
    const knock = () => {
        const guest = room;
        guest.hostId = null;
        guest.pairKey = null;
        let tries = 0;
        clearInterval(guest.knockTimer);
        const send = () => {
            if (room !== guest || guest.hostId) return clearInterval(guest.knockTimer);
            if (++tries > 9) {
                clearInterval(guest.knockTimer);
                return notFound();
            }
            guest.signal.send({ t: "knock", from: guest.id, pub: guest.pair.pub, rejoin: guest.ticket ? true : undefined });
        };
        guest.knockTimer = setInterval(send, 3000);
        send();
    };

    const startGuest = async ({ code, password, name, avatar, relay, remember }) => {
        const guest = room = {
            role: "guest", code, password, name, avatar, relay, remember,
            title: "",
            id: Signaling.newId(),
            phase: "finding",
            settings: { control: true, streaming: false },
            state: null, file: null, cues: null, cuesOn: true, ownCues: false,
            watching: "stream", ownFor: null,
            offset: null, samples: [], seekLead: 0.15, seekStarted: 0,
            retries: 0, timers: []
        };
        showStatus({
            title: "Looking for the room…",
            text: `Room ${Signaling.formatCode(code)}`,
            busy: true,
            actions: [{ label: "Cancel", secondary: true, onClick: () => leaveRoom(false) }],
            onClose: () => leaveRoom(false)
        });
        together.active = () => !!room;
        try {
            guest.pair = await Signaling.newPairKey();
            guest.signal = await Signaling.join({ code, password, onMessage: message => room === guest && guestSignal(message) });
        } catch (e) {
            if (room === guest) failedToJoin("Couldn't look for the room", e.message);
            return;
        }
        if (room !== guest) return guest.signal.close();
        knock();
    };

    // =================== Both ===================

    ["play", "pause", "seeked", "ratechange"].forEach(type => mainVideo.addEventListener(type, () => {
        if (!room) return;
        renderHomeBar();
        if (room.role === "guest") return guestMediaEvent(type);
        const cause = { play: "play", pause: "pause", seeked: "seek", ratechange: "rate" }[type];
        const byGuest = room.attribution && Date.now() < room.attribution.until;
        if (byGuest && type !== "ratechange") {
            showFeedback({ play: "fa-play", pause: "fa-pause", seeked: "fa-forward" }[type], room.attribution.name);
        }
        broadcast(stateMessage(cause));
    }));

    mainVideo.addEventListener("loadedmetadata", () => {
        if (!room || together.stream) return;
        if (room.role === "host") {
            broadcast({ t: "file", file: fileInfo() });
            broadcast(stateMessage());
            sendSubtitles();
            updateStreams();
            return;
        }
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
        if (room && room.role === "host") {
            broadcast({ t: "file", file: null });
            updateStreams();
        }
    });

    // Subtitles the host loads or removes go to everyone
    mainVideo.addEventListener("load", e => {
        if (e.target.tagName === "TRACK" && room && room.role === "host") sendSubtitles();
    }, true);
    mainVideo.textTracks.addEventListener("removetrack", () => {
        if (room && room.role === "host") sendSubtitles();
    });

    // Guests following with their own copy check in once a second
    setInterval(() => room && room.role === "guest" && followHost(), 1000);

    // ---------- Leaving

    const sayBye = () => {
        if (!room) return;
        if (room.role === "host") room.peers.forEach(peer => send(peer, { t: "bye" }));
        else send(room.peer, { t: "bye" });
    };

    // Stops everything network-related; the chat stays visible until the panel is closed
    const teardown = () => {
        const old = room;
        if (!old) return;
        leaveStream();
        room = null;
        clearInterval(old.knockTimer);
        clearInterval(old.offerTimer);
        clearInterval(old.streamTimer);
        clearTimeout(old.pingTimer);
        clearTimeout(old.connectTimer);
        old.timers.forEach(clearInterval);
        if (old.role === "host") {
            old.peers.forEach(closePeer);
            stopCapture();
        } else {
            closePeer(old.peer);
        }
        if (old.signal) old.signal.close();
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
        hideOverlay();
        closeRoomUI();
        if (playerPage.hidden) return;
        if (openedFromHome && !currentFile) history.back();
        else if (!hasMedia()) uploadOverlay.classList.remove("hidden");
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

    const leaveRoom = (ask, home = false) => {
        if (room) {
            if (ask && room.role === "host" && guests().length && !confirm("End the room for everyone?")) return;
            sayBye();
            teardown();
        }
        if (!home) return closeDialog();
        hideOverlay();
        closeRoomUI();
        history.back();
    };

    // The player's back arrow (or logo) in a room: going home doesn't have to end it
    const askBeforeHome = () => {
        const host = room.role === "host";
        const restore = () => host ? hideOverlay() : refreshGuestView();
        showStatus({
            icon: "fa-house",
            title: "Go to the home page?",
            text: host
                ? "Your room stays open while you're on the home page: the video keeps playing for everyone, and you can come back any time. Closing this tab ends the room for everyone."
                : "You stay in the room and can come back any time from the home page. Closing this tab takes you out of the room.",
            actions: [
                { label: host ? "Go home, keep the room open" : "Go home, stay in the room", icon: "fa-house", onClick: () => {
                    restore();
                    history.back();
                } },
                { label: host ? "End the room" : "Leave the room", secondary: true, onClick: () => leaveRoom(false, true) }
            ],
            onClose: restore
        });
    };

    window.addEventListener("beforeunload", e => {
        if (!room || (room.role === "guest" && room.phase !== "in")) return;
        e.preventDefault();
        e.returnValue = "";
    });
    window.addEventListener("pagehide", sayBye);

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

    const writeRooms = list => {
        storage.set(ROOMS_KEY, JSON.stringify(list.slice(0, 6)));
        renderRooms();
    };

    const rememberRoom = () => {
        if (!room || !room.remember || !room.title) return;
        const entry = { code: room.code, password: room.password, title: room.title, role: room.role, at: Date.now() };
        writeRooms([entry, ...savedRooms().filter(item => item.code !== room.code)]);
    };

    const roomLabel = item => item.title || `Room ${Signaling.formatCode(item.code)}`;

    // Deletes a remembered room's code, password and name from this browser. If it's the room
    // you're in, it also stops being saved again.
    const forgetRoom = (code, ask = true) => {
        const item = savedRooms().find(saved => saved.code === code);
        if (item && ask && !confirm(`Delete “${roomLabel(item)}” from this browser?\n\nIts code and password are erased here. You can still join again with an invite link.`)) return false;
        writeRooms(savedRooms().filter(saved => saved.code !== code));
        if (room && room.code === code) {
            room.remember = false;
            rememberSwitch.checked = false;
        }
        return true;
    };

    forgetAllBtn?.addEventListener("click", () => {
        if (!confirm("Delete all remembered rooms from this browser?\n\nTheir codes and passwords are erased here. You can still join again with an invite link.")) return;
        writeRooms([]);
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
    const reopen = item => item.role === "host" ? openCreate(item)
        : openJoin({ code: item.code, password: item.password, remember: true });

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
    };

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
            const playing = room.role === "host" ? hasMedia() && !mainVideo.paused : !!room.state && !room.state.paused;
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
        openedFromHome = !!homePage && !homePage.hidden;
        helpOverlay.classList.add("hidden");
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

    const openJoin = ({ code = "", password = "", remember = true } = {}) => {
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

    document.querySelectorAll(".room-create-open").forEach(button => button.addEventListener("click", () => openCreate()));
    document.querySelectorAll(".room-join-open").forEach(button => button.addEventListener("click", () => openJoin()));
    overlay.querySelectorAll(".room-cancel").forEach(button => button.addEventListener("click", closeDialog));
    createForm.querySelector(".room-new-password").addEventListener("click", () => field(createForm, "password").value = Signaling.newPassword());

    createForm.addEventListener("submit", e => {
        e.preventDefault();
        const name = clean(field(createForm, "name").value, 30);
        const password = field(createForm, "password").value.trim();
        if (!name || password.length < 4) return;
        storage.set(NAME_KEY, name);
        storage.set(AVATAR_KEY, createPicker.value);
        startHost({
            name, avatar: createPicker.value, password,
            title: clean(field(createForm, "title").value, 40),
            code: reopening ? reopening.code : null,
            relay: field(createForm, "relay").checked,
            remember: field(createForm, "remember").checked
        });
    });

    joinForm.addEventListener("submit", e => {
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
        startGuest({ code, password, name, avatar: joinPicker.value, relay: field(joinForm, "relay").checked, remember: field(joinForm, "remember").checked });
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

    // On a phone, fullscreen means the whole screen for the video: the panel steps aside (the Room
    // button brings it back, and new messages still pop up)
    const onFullscreen = () => {
        if (room && fullscreenElement() && matchMedia("(max-height: 500px), (max-width: 600px)").matches) showPanel(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    renderRooms();
    joinFromLink();
})();
