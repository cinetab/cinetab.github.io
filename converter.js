// CineTab format support
// Spots files the browser can't play (or would play silently) and converts them on this computer
// with converter-worker.js. Finished conversions are kept in the browser's private storage (OPFS)
// so reopening the same file is instant.

const Converter = (() => {
    const CACHE_DIR = "cinetab-converted";
    const MAX_SAVED = 3;

    const probeEl = document.createElement("video");
    const canPlay = type => probeEl.canPlayType(type) !== "";

    // Video codecs this browser can play from an MP4, so they can be copied instead of re-encoded
    const caps = {
        hevc: canPlay('video/mp4; codecs="hvc1.1.6.L120.90"'),
        hevc10: canPlay('video/mp4; codecs="hvc1.2.4.L120.90"'),
        vp9: canPlay('video/mp4; codecs="vp09.00.40.08"'),
        av1: canPlay('video/mp4; codecs="av01.0.08M.08"')
    };

    // Sound formats browsers tend to play *silently* instead of failing, as named inside
    // Matroska (CodecID) and MP4 (sample entry) files
    const SILENT_AUDIO = [
        { name: "DTS", mkv: ["A_DTS"], mp4: ["dtsc", "dtsh", "dtsl", "dtse"], type: 'audio/mp4; codecs="dtsc"' },
        { name: "Dolby TrueHD", mkv: ["A_TRUEHD", "A_MLP"], mp4: ["mlpa"], type: 'audio/mp4; codecs="mlpa"' },
        { name: "Dolby Digital Plus (E-AC3)", mkv: ["A_EAC3"], mp4: ["ec-3"], type: 'audio/mp4; codecs="ec-3"' },
        { name: "Dolby Digital (AC3)", mkv: ["A_AC3"], mp4: ["ac-3"], type: 'audio/mp4; codecs="ac-3"' }
    ];
    const PLAYABLE_AUDIO = {
        mkv: ["A_AAC", "A_MPEG/L3", "A_OPUS", "A_VORBIS", "A_FLAC"],
        mp4: ["mp4a", "Opus", "fLaC"]
    };

    const CODEC_NAMES = {
        h264: "H.264", hevc: "HEVC (H.265)", vp8: "VP8", vp9: "VP9", av1: "AV1",
        mpeg4: "MPEG-4 (Xvid/DivX)", msmpeg4v3: "DivX 3", msmpeg4v2: "MS MPEG-4", wmv1: "WMV", wmv2: "WMV", wmv3: "WMV 9",
        vc1: "VC-1", mpeg2video: "MPEG-2", mpeg1video: "MPEG-1", flv1: "Flash video", h263: "H.263", theora: "Theora",
        aac: "AAC", mp3: "MP3", ac3: "Dolby Digital (AC3)", eac3: "Dolby Digital Plus (E-AC3)", dts: "DTS",
        truehd: "Dolby TrueHD", wmav1: "WMA", wmav2: "WMA", wmapro: "WMA Pro", flac: "FLAC", opus: "Opus", vorbis: "Vorbis"
    };
    const codecName = codec => CODEC_NAMES[codec] || (codec.startsWith("pcm_") ? "PCM" : codec.toUpperCase());

    const isSupported = typeof Worker !== "undefined" && typeof WebAssembly === "object";

    // Stable id for a picked file, used to find its saved conversion
    const keyFor = file => {
        const s = `${file.name}|${file.size}|${file.lastModified}`;
        let h1 = 0x811c9dc5, h2 = 0x9e3779b9 ^ s.length;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 16777619);
            h2 = Math.imul(h2 ^ c, 2246822507);
        }
        return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
    };

    const getDir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(CACHE_DIR, { create: true });

    const readText = async (dir, name) => (await (await dir.getFileHandle(name)).getFile()).text();

    const readEntry = async (dir, key) => {
        const meta = JSON.parse(await readText(dir, `${key}.json`));
        const file = await (await dir.getFileHandle(`${key}.mp4`)).getFile();
        let subtitles = null;
        try { subtitles = await readText(dir, `${key}.vtt`); } catch (e) {}
        return { key, file, subtitles, plan: meta.plan, name: meta.name, sourceSize: meta.sourceSize, cached: true };
    };

    const removeEntry = async key => {
        try {
            const dir = await getDir();
            for (const ext of ["json", "vtt", "mp4"]) {
                try { await dir.removeEntry(`${key}.${ext}`); } catch (e) {}
            }
        } catch (e) {}
    };

    // Completed conversions (newest first) with the disk space each one uses. `bytes` also
    // counts leftovers such as a conversion that is still running.
    const listSaved = async () => {
        try {
            const dir = await getDir();
            const groups = {};
            for await (const [name, handle] of dir.entries()) {
                if (handle.kind !== "file") continue;
                const key = name.replace(/\.[^.]+$/, "");
                const group = groups[key] || (groups[key] = { key, bytes: 0, meta: null });
                const file = await handle.getFile();
                group.bytes += file.size;
                if (name.endsWith(".json")) {
                    try { group.meta = JSON.parse(await file.text()); } catch (e) {}
                }
            }
            const all = Object.values(groups);
            const items = all.filter(group => group.meta).map(({ key, bytes, meta }) => ({
                key, bytes, name: meta.name, created: meta.created || 0, plan: meta.plan
            }));
            items.sort((a, b) => b.created - a.created);
            return { items, bytes: all.reduce((sum, group) => sum + group.bytes, 0) };
        } catch (e) {
            return { items: [], bytes: 0 };
        }
    };

    // Keep only the most recent conversions so movies don't quietly fill the disk
    const trimSaved = async keepKey => {
        const { items } = await listSaved();
        items.filter(item => item.key !== keepKey)
            .slice(MAX_SAVED - 1)
            .forEach(item => removeEntry(item.key));
    };

    const getCached = async file => {
        try { return await readEntry(await getDir(), keyFor(file)); } catch (e) { return null; }
    };

    const openSaved = async key => {
        try { return await readEntry(await getDir(), key); } catch (e) { return null; }
    };

    // Entry by entry, so a conversion that's still running (its file is locked) is left alone
    const clearSaved = async () => {
        try {
            const dir = await getDir();
            const names = [];
            for await (const name of dir.keys()) names.push(name);
            for (const name of names) {
                try { await dir.removeEntry(name); } catch (e) {}
            }
        } catch (e) {}
    };

    // Finds the top-level "moov" box of an MP4/MOV, where its track codecs are listed
    const findMp4Moov = async file => {
        let pos = 0;
        for (let i = 0; i < 64 && pos + 8 <= file.size; i++) {
            const head = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
            let size = head.getUint32(0);
            const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
            if (size === 1 && head.byteLength >= 16) size = Number(head.getBigUint64(8));
            else if (size === 0) size = file.size - pos;
            if (size < 8) return null;
            if (type === "moov") return file.slice(pos, pos + Math.min(size, 32 * 1024 * 1024));
            pos += size;
        }
        return null;
    };

    // Name of a sound format this browser would play silently, if that's the file's only sound
    const findSilentAudio = async file => {
        try {
            const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
            let container = null, region = null;
            if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
                container = "mkv";
                region = file.slice(0, 2 * 1024 * 1024);
            } else if (/^(ftyp|moov|mdat|free|wide|skip)$/.test(String.fromCharCode(...head.slice(4, 8)))) {
                container = "mp4";
                region = await findMp4Moov(file);
            }
            if (!region) return null;
            const text = new TextDecoder("latin1").decode(await region.arrayBuffer());
            if (PLAYABLE_AUDIO[container].some(tag => text.includes(tag))) return null;
            const found = SILENT_AUDIO.find(codec => codec[container].some(tag => text.includes(tag)));
            return found && !canPlay(found.type) ? found.name : null;
        } catch (e) {
            return null;
        }
    };

    const convert = (file, { onStatus, onPlan, forceVideoTranscode = false }) => {
        const key = keyFor(file);
        const worker = new Worker("converter-worker.js");
        let settled = false;
        const finish = () => {
            settled = true;
            worker.terminate();
        };
        const promise = new Promise((resolve, reject) => {
            worker.onmessage = async ({ data }) => {
                if (settled) return;
                if (data.type === "status") onStatus(data);
                else if (data.type === "plan") onPlan(data.plan);
                else if (data.type === "error") {
                    finish();
                    reject(new Error(data.message));
                } else if (data.type === "done") {
                    finish();
                    try {
                        if (data.bytes) {
                            resolve({ file: new Blob([data.bytes], { type: "video/mp4" }), subtitles: data.subtitles, plan: data.plan });
                        } else {
                            resolve(await readEntry(await getDir(), key));
                            trimSaved(key);
                        }
                    } catch (e) {
                        reject(e);
                    }
                }
            };
            worker.onerror = e => {
                finish();
                reject(new Error(e.message || "The converter stopped unexpectedly."));
            };
        });
        worker.postMessage({ type: "convert", file, key, caps, forceVideoTranscode });

        const cancel = () => {
            if (settled) return;
            finish();
            // The worker's file lock is released asynchronously after terminate()
            setTimeout(() => removeEntry(key), 500);
        };
        return { promise, cancel };
    };

    return { isSupported, convert, getCached, findSilentAudio, listSaved, openSaved, removeSaved: removeEntry, clearSaved, codecName };
})();
