// CineTab history: what was watched in this browser, for the dashboard on the home page.
// YouTube videos and playlists (where you were in them) and videos from this device (name, size
// and length; the position itself is script.js's `resume:` key). Kept in localStorage and never
// sent anywhere; the dashboard can remove one entry or all of them.
//
// A web page can't open a file on this device by itself. Where the browser has the File System
// Access API (Chrome and Edge on computers), the file's handle is kept in IndexedDB, so one click
// on the dashboard opens it again (the browser asks for permission first). Elsewhere the dashboard
// asks for the file again, and it resumes where it was left.

(() => {
    const KEY = "cinetab:history";
    const MAX = 80;
    const DB_NAME = "cinetab-history";
    const STORE = "handles";
    const listeners = new Set();

    const read = () => {
        try {
            const list = JSON.parse(localStorage.getItem(KEY) || "[]");
            return Array.isArray(list) ? list.filter(entry => entry && typeof entry.k === "string") : [];
        } catch (e) {
            return [];
        }
    };

    const changed = () => listeners.forEach(fn => {
        try {
            fn();
        } catch (e) {}
    });

    const write = list => {
        try {
            localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
        } catch (e) {}
        changed();
    };

    // Adds or updates the entry `k`. `fields` replace the old ones; `top`: it moves to the front
    // (something opened just now), otherwise it stays where it is (progress while it plays)
    const put = (k, fields, top = true) => {
        const list = read();
        const at = list.findIndex(entry => entry.k === k);
        const old = at >= 0 ? list[at] : null;
        const entry = { ...(old || {}), ...fields, k, at: Date.now() };
        if (at >= 0) list.splice(at, 1);
        if (top || at < 0) list.unshift(entry);
        else list.splice(at, 0, entry);
        write(list);
        return entry;
    };

    const fileKey = (name, size) => `file:${name}:${size}`;

    // ---------- File handles (IndexedDB)
    let dbOpening = null;
    const db = () => dbOpening ||= new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            dbOpening = null;
            reject(request.error);
        };
    });
    const tx = (mode, run) => db().then(base => new Promise((resolve, reject) => {
        const t = base.transaction(STORE, mode);
        const result = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
        t.onerror = () => reject(t.error);
    })).catch(() => undefined);

    const saveHandle = (k, handle) => handle && tx("readwrite", store => store.put(handle, k));
    const getHandle = k => tx("readonly", store => store.get(k));
    const deleteHandle = k => tx("readwrite", store => store.delete(k));
    const clearHandles = () => tx("readwrite", store => store.clear());

    window.CineHistory = {
        list: read,
        get: k => read().find(entry => entry.k === k) || null,
        put,
        fileKey,
        // A video from this device: { name, size, title?, duration?, audio? }
        file: (fields, top = true) => put(fileKey(fields.name, fields.size), { type: "file", ...fields }, top),
        remove: k => {
            write(read().filter(entry => entry.k !== k));
            if (k.startsWith("file:")) deleteHandle(k);
        },
        clear: () => {
            write([]);
            clearHandles();
        },
        onChange: fn => listeners.add(fn),
        saveHandle,
        getHandle,
        // Can this browser keep files to open them again?
        handles: typeof window.showOpenFilePicker === "function" && "indexedDB" in window
    };

    // Another tab watched something
    window.addEventListener("storage", e => e.key === KEY && changed());
})();
