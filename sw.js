// CineTab's service worker: lets CineTab be installed as an app and open without a connection.
// CineTab's own files come from the network first (so an update shows at once) and from the
// cache when there's no connection; its icon font and fonts are kept once loaded. Nothing else
// is touched: videos play from the device, and YouTube, rooms and the converter go straight out.
// Change VERSION with each release, so installed apps pick up the new files.

const VERSION = "1.4.0";
const CACHE = `cinetab-${VERSION}`;
const SHELL = [
    "./", "index.html", "style.css", "manifest.webmanifest",
    "tooltips.js", "converter.js", "converter-worker.js", "script.js", "history.js", "youtube.js",
    "vendor/qrcode-generator.js", "signaling.js", "room.js", "home.js",
    "logo.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"
];
// Kept once loaded: the icon font and Poppins
const ASSET_HOSTS = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(key => key.startsWith("cinetab-") && key !== CACHE).map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

const fromNetwork = async request => {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
};

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        // The single-file offline player is a download, not part of the app
        if (url.pathname.endsWith("/cinetab-offline.html")) return;
        event.respondWith(fromNetwork(request).catch(async () => {
            // Invite links (?room=…) and #watch are the same page
            const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
            if (cached) return cached;
            if (request.mode === "navigate") return caches.match("index.html");
            return Response.error();
        }));
        return;
    }

    if (ASSET_HOSTS.includes(url.hostname)) {
        event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
            if (response.ok || response.type === "opaque") {
                const copy = response.clone();
                caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
            }
            return response;
        })));
    }
});
