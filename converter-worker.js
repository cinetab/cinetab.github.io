// CineTab converter worker
// Makes files the browser can't play (AVI, WMV, TS, DTS/AC3 audio, ...) playable by remuxing or
// transcoding them with ffmpeg.wasm. Everything happens on this computer: the input is read
// lazily from the picked File and the output MP4 is written straight to the browser's private
// disk storage (OPFS), so even multi-GB movies never have to fit in memory.

const CORE_VERSION = "0.12.10";
const CORE_BASES = [
    `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
    `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`
];
const CACHE_DIR = "cinetab-converted";
const TEXT_SUBTITLE_CODECS = ["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"];

let core;
let logLines = [];
let onLog = null;

const post = (type, data = {}) => self.postMessage({ type, ...data });

// Download the ~31 MB wasm with progress, then hand it to the ffmpeg core as a blob URL
const loadCore = async () => {
    let lastError;
    for (const base of CORE_BASES) {
        try {
            const res = await fetch(`${base}/ffmpeg-core.wasm`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const total = +res.headers.get("content-length") || 32 * 1024 * 1024;
            const reader = res.body.getReader();
            const chunks = [];
            let received = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                post("status", { stage: "download", ratio: Math.min(received / total, 1) });
            }
            const wasmURL = URL.createObjectURL(new Blob(chunks, { type: "application/wasm" }));
            const coreURL = `${base}/ffmpeg-core.js`;
            importScripts(coreURL);
            core = await self.createFFmpegCore({
                mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL }))}`
            });
            core.setLogger(({ message }) => {
                logLines.push(message);
                if (onLog) onLog(message);
            });
            return;
        } catch (e) {
            lastError = e;
        }
    }
    throw new Error(`Couldn't download the converter (${lastError && lastError.message}). Check your internet connection.`);
};

const run = args => {
    logLines = [];
    core.exec(...args);
    const ret = core.ret;
    core.reset();
    return ret;
};

const toSeconds = (h, m, s) => (+h) * 3600 + (+m) * 60 + parseFloat(s);

// Read container, duration and streams from `ffmpeg -i` output
const probe = input => {
    run(["-hide_banner", "-i", input]);
    const log = logLines.join("\n");
    const duration = log.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const streams = [];
    const re = /Stream #0:(\d+)[^:\n]*: (Video|Audio|Subtitle): (\w+)([^\n]*)/g;
    let m;
    while ((m = re.exec(log))) {
        streams.push({ index: +m[1], kind: m[2], codec: m[3], details: m[4], isDefault: /\(default\)/.test(m[4]) });
    }
    return {
        format: (log.match(/Input #0, ([^,\n]+)/) || [])[1] || "",
        duration: duration ? toSeconds(duration[1], duration[2], duration[3]) : 0,
        video: streams.find(s => s.kind === "Video" && !/attached pic/.test(s.details)),
        audio: streams.find(s => s.kind === "Audio" && s.isDefault) || streams.find(s => s.kind === "Audio"),
        subtitle: streams.find(s => s.kind === "Subtitle" && TEXT_SUBTITLE_CODECS.includes(s.codec)),
        log
    };
};

const isTenBit = details => /p1[02](le|be)/.test(details);

const canCopyVideo = (video, caps) => {
    switch (video.codec) {
        case "h264": return !isTenBit(video.details);
        case "hevc": return isTenBit(video.details) ? caps.hevc10 : caps.hevc;
        case "vp9": return caps.vp9;
        case "av1": return caps.av1;
        default: return false;
    }
};

const canCopyAudio = audio => ["aac", "mp3"].includes(audio.codec);

// An ffmpeg output "file" that is really a seekable window onto an OPFS sync access handle
const mountOutputDevice = (path, handle) => {
    const FS = core.FS;
    let size = 0;
    const dev = FS.makedev(64, 0);
    FS.registerDevice(dev, {
        open() {},
        close() {},
        read(stream, buffer, offset, length, position) {
            return handle.read(buffer.subarray(offset, offset + length), { at: position });
        },
        write(stream, buffer, offset, length, position) {
            const written = handle.write(buffer.subarray(offset, offset + length), { at: position });
            size = Math.max(size, position + written);
            return written;
        },
        llseek(stream, offset, whence) {
            let pos = offset;
            if (whence === 1) pos += stream.position;
            else if (whence === 2) pos += size;
            if (pos < 0) throw new FS.ErrnoError(28);
            return pos;
        }
    });
    try { FS.unlink(path); } catch (e) {}
    FS.mkdev(path, dev);
};

const writeTextFile = async (dir, name, text) => {
    const handle = await (await dir.getFileHandle(name, { create: true })).createSyncAccessHandle();
    handle.truncate(0);
    handle.write(new TextEncoder().encode(text), { at: 0 });
    handle.flush();
    handle.close();
};

const convert = async ({ file, key, caps, forceVideoTranscode }) => {
    if (!core) {
        post("status", { stage: "download", ratio: 0 });
        await loadCore();
    }
    post("status", { stage: "probe" });

    const FS = core.FS;
    try { FS.mkdir("/in"); } catch (e) {}
    FS.mount(FS.filesystems.WORKERFS, { files: [file] }, "/in");
    const input = `/in/${file.name}`;

    const info = probe(input);
    if (!info.video && !info.audio) {
        throw new Error("This file doesn't contain any video or audio that CineTab can read.");
    }

    const copyVideo = info.video && !forceVideoTranscode && canCopyVideo(info.video, caps);
    const copyAudio = info.audio && canCopyAudio(info.audio);
    const plan = {
        format: info.format,
        duration: info.duration,
        video: info.video && { codec: info.video.codec, copy: !!copyVideo },
        audio: info.audio && { codec: info.audio.codec, copy: !!copyAudio },
        subtitles: !!info.subtitle
    };
    post("plan", { plan });

    const args = ["-hide_banner", "-nostdin", "-y", "-fflags", "+genpts", "-i", input];
    if (info.video) {
        args.push("-map", `0:${info.video.index}`);
        if (copyVideo) {
            args.push("-c:v", "copy");
            if (info.video.codec === "hevc") args.push("-tag:v", "hvc1");
        } else {
            // Re-encoding in wasm is slow, so favour speed: ultrafast x264, at most 720p
            args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
                "-vf", "scale=-2:min(720\\,trunc(ih/2)*2)");
        }
    }
    if (info.audio) {
        args.push("-map", `0:${info.audio.index}`);
        if (copyAudio) args.push("-c:a", "copy");
        else args.push("-c:a", "aac", "-b:a", "192k", "-ac", "2");
    }

    // Output goes to OPFS when available (not in some private windows), otherwise to memory
    let dir = null;
    let outHandle = null;
    try {
        const root = await navigator.storage.getDirectory();
        dir = await root.getDirectoryHandle(CACHE_DIR, { create: true });
        // Drop the "complete" marker first so a failed re-conversion never looks reusable
        try { await dir.removeEntry(`${key}.json`); } catch (e) {}
        outHandle = await (await dir.getFileHandle(`${key}.mp4`, { create: true })).createSyncAccessHandle();
        outHandle.truncate(0);
        mountOutputDevice("/out.mp4", outHandle);
    } catch (e) {
        outHandle = null;
    }
    const useOPFS = !!outHandle;
    args.push("-f", "mp4", "/out.mp4");
    if (info.subtitle) args.push("-map", `0:${info.subtitle.index}`, "-c:s", "webvtt", "-f", "webvtt", "/subs.vtt");

    post("status", { stage: "convert", ratio: 0 });
    let lastReport = 0;
    onLog = message => {
        const t = message.match(/time=\s*(\d+):(\d+):([\d.]+)/);
        if (!t || !info.duration) return;
        const now = Date.now();
        if (now - lastReport < 250) return;
        lastReport = now;
        post("status", { stage: "convert", ratio: Math.min(toSeconds(t[1], t[2], t[3]) / info.duration, 1) });
    };

    let ret;
    try {
        ret = run(args);
    } finally {
        onLog = null;
        if (outHandle) {
            outHandle.flush();
            outHandle.close();
        }
        FS.unmount("/in");
    }
    if (ret !== 0) {
        const tail = logLines.filter(l => !/^\s*(frame|size)=/.test(l)).slice(-4).join(" ");
        const memoryHint = useOPFS ? "" : " This copy of CineTab can't use disk storage (e.g. the offline file or a private window), so it converts in memory and very large movies may not fit. Try the CineTab website in a normal window.";
        throw new Error(`Conversion failed.${memoryHint} ${tail}`);
    }

    let subtitles = null;
    if (info.subtitle) {
        try { subtitles = FS.readFile("/subs.vtt", { encoding: "utf8" }); FS.unlink("/subs.vtt"); } catch (e) {}
    }

    let bytes = null;
    if (useOPFS) {
        if (subtitles) await writeTextFile(dir, `${key}.vtt`, subtitles);
        // Written last: its presence marks a complete, reusable conversion
        await writeTextFile(dir, `${key}.json`, JSON.stringify({ name: file.name, sourceSize: file.size, created: Date.now(), plan }));
    } else {
        bytes = FS.readFile("/out.mp4");
        FS.unlink("/out.mp4");
    }
    self.postMessage({ type: "done", plan, subtitles, bytes }, bytes ? [bytes.buffer] : []);
};

self.onmessage = async ({ data }) => {
    if (data.type !== "convert") return;
    try {
        await convert(data);
    } catch (e) {
        post("error", { message: e && e.message ? e.message : String(e) });
    }
};
