// Builds cinetab-offline.html: the CineTab player (without the website's home page) in one
// self-contained HTML file that runs straight from disk (file://) with no server and no
// internet. Fonts, icons, styles, scripts and the logo are all inlined; the converter worker
// becomes a blob URL.
//
// Usage (Node 18+, no dependencies):  node tools/build-offline.mjs
// Re-run it after changing index.html, style.css or any script, and commit the result.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => readFile(path.join(root, name), "utf8");

const FONT_AWESOME = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0";
const POPPINS_CSS = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap";
// Google Fonts only serves woff2 to browsers it recognises
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const download = async (url, as = "text") => {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return as === "text" ? res.text() : Buffer.from(await res.arrayBuffer());
};
const dataURI = (mime, buffer) => `data:${mime};base64,${buffer.toString("base64")}`;

// Poppins: only the latin + latin-ext subsets the page actually uses
const poppinsCSS = async () => {
    const css = await download(POPPINS_CSS);
    const blocks = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*(@font-face\s*\{[^}]*\})/g)]
        .filter(([, subset]) => subset === "latin" || subset === "latin-ext")
        .map(([, , block]) => block);
    if (!blocks.length) throw new Error("No Poppins font faces found");
    return (await Promise.all(blocks.map(async block => {
        const url = block.match(/url\((https:[^)]+)\)/)[1];
        return block.replace(url, dataURI("font/woff2", await download(url, "binary")));
    }))).join("\n");
};

// Font Awesome: keep the solid + regular woff2 fonts (no brand icons are used)
const fontAwesomeCSS = async () => {
    let css = await download(`${FONT_AWESOME}/css/all.min.css`);
    const fonts = {};
    for (const name of ["fa-solid-900", "fa-regular-400"]) {
        fonts[name] = dataURI("font/woff2", await download(`${FONT_AWESOME}/webfonts/${name}.woff2`, "binary"));
    }
    return css.replace(/@font-face\{[^}]*\}/g, face => {
        const used = Object.keys(fonts).find(name => face.includes(`${name}.woff2`));
        if (!used) return "";
        return face.replace(/src:[^;}]*/, `src:url(${fonts[used]}) format("woff2")`);
    });
};

// Removes everything from the line holding `start` up to (not including) the line holding `end`
const cutSection = (text, start, end) => {
    const startAt = text.indexOf(start);
    const endAt = text.indexOf(end);
    if (startAt < 0 || endAt < startAt) throw new Error(`Section not found: ${start}`);
    const from = text.lastIndexOf("\n", startAt) + 1;
    const to = text.lastIndexOf("\n", endAt) + 1;
    return text.slice(0, from) + text.slice(to);
};

// The website's stylesheet minus the home page, its converted-videos list and download links
const playerStyles = styles => {
    let css = styles.replace(/@import url\([^)]*fonts\.googleapis[^)]*\);\s*/, "");
    css = cutSection(css, "/* =================== HOME PAGE", "/* =================== FORMAT SUPPORT");
    css = cutSection(css, "/* Home: converted videos */", "/* =================== TOOLTIPS");
    return css;
};

// Inline scripts must not contain a closing script tag
const inlineScript = code => code.replace(/<\/script/gi, "<\\/script");

const build = async () => {
    const [html, styles, tooltips, converter, worker, script, logo, touchIcon, pkg] = await Promise.all([
        read("index.html"), read("style.css"), read("tooltips.js"), read("converter.js"),
        read("converter-worker.js"), read("script.js"), read("logo.svg"),
        readFile(path.join(root, "apple-touch-icon.png")), read("package.json")
    ]);

    // package.json holds the version; the website must show the same one
    const { version } = JSON.parse(pkg);
    for (const expected of [`<meta name="version" content="${version}">`, `>v${version}</span>`, `"softwareVersion": "${version}"`]) {
        if (!html.includes(expected)) throw new Error(`index.html is not at version ${version}: missing ${expected}`);
    }
    const [poppins, fontAwesome] = await Promise.all([poppinsCSS(), fontAwesomeCSS()]);
    const logoURI = dataURI("image/svg+xml", Buffer.from(logo));

    let out = html;
    const swap = (from, to) => {
        if (!out.includes(from)) throw new Error(`Not found in index.html: ${from}`);
        out = out.split(from).join(to);
    };

    // Just the player: no home page, and it starts open
    out = cutSection(out, "<!-- ============ HOME PAGE ============ -->", "<!-- ============ PLAYER ============ -->");
    swap(`<title>CineTab – Watch videos together on Google Meet, Zoom &amp; Teams</title>`, `<title>CineTab Player</title>`);
    swap(`<body>`, `<body class="watching">`);
    swap(`<div class="player-page" hidden>`, `<div class="player-page">`);
    swap(`<button class="player-home" title="Back to home"><img src="logo.svg" alt="CineTab home" width="26" height="26"></button>`,
        `<span class="player-home" title="CineTab Player v${version}"><img src="logo.svg" alt="CineTab" width="26" height="26"></span>`);

    // Search and sharing tags belong to the website only; a copy of the player found online
    // (e.g. this file on GitHub Pages) should never compete with it in search results
    out = cutSection(out, "<!-- ============ SEO ============ -->", "<!-- ============ /SEO ============ -->");
    swap(`  <!-- ============ /SEO ============ -->\n`, `  <meta name="robots" content="noindex">\n`);

    swap(`<link rel="icon" href="logo.svg" type="image/svg+xml"/>`, `<link rel="icon" href="${logoURI}" type="image/svg+xml"/>`);
    swap(`<link rel="apple-touch-icon" href="apple-touch-icon.png"/>`, `<link rel="apple-touch-icon" href="${dataURI("image/png", touchIcon)}"/>`);
    swap(`src="logo.svg"`, `src="${logoURI}"`);

    const css = [
        `/* Poppins (SIL Open Font License) */\n${poppins}`,
        fontAwesome,
        playerStyles(styles)
    ].join("\n");
    swap(`<link rel="stylesheet" href="style.css">`, `<style>\n${css}\n</style>`);
    swap(`<link rel="stylesheet" href="${FONT_AWESOME}/css/all.min.css">\n`, "");

    swap(`<script src="tooltips.js"></script>`, `<script>\n${inlineScript(tooltips)}\n</script>`);
    swap(`<script src="converter.js"></script>`, [
        `<script type="text/plain" id="converter-worker-src">\n${inlineScript(worker)}\n</script>`,
        `<script>\nwindow.CINETAB_WORKER_URL = URL.createObjectURL(new Blob([document.getElementById("converter-worker-src").textContent], { type: "text/javascript" }));\n</script>`,
        `<script>\n${inlineScript(converter)}\n</script>`
    ].join("\n  "));
    swap(`<script src="script.js"></script>`, `<script>\n${inlineScript(script)}\n</script>`);

    swap(`<meta name="theme-color" content="#0f0f11">`, [
        `<meta name="theme-color" content="#0f0f11">`,
        `  <!-- CineTab Player v${version}, offline single-file build. MIT License, https://github.com/cinetab/cinetab.github.io`,
        `       Generated by tools/build-offline.mjs: edit the source files instead. -->`
    ].join("\n"));

    const leftovers = out.match(/(src|href)="(?!data:|#|https:\/\/github\.com)[^"]+\.(js|css|svg|png|html)"/g);
    if (leftovers) throw new Error(`External references left: ${leftovers.join(", ")}`);

    await writeFile(path.join(root, "cinetab-offline.html"), out);
    console.log(`cinetab-offline.html written (${(Buffer.byteLength(out) / 1024).toFixed(0)} KB)`);
};

build().catch(err => {
    console.error(err.message);
    process.exit(1);
});
