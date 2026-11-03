// CineTab rooms: how browsers find each other
// Browsers in a room talk directly over WebRTC, but first they need a go-between to swap
// connection details. That's free public relays: MQTT brokers, and Nostr relays, which use the
// normal HTTPS port (443) and so also get through networks that block everything else. Every
// message is encrypted with a key derived from the room code and password and sent on a topic
// derived the same way, so a relay (or anyone listening on it) only sees random-looking bytes.
// It never learns the code, the password or anything said in the room, and can't forge messages.

const Signaling = (() => {
    // Several relays at once, so the room keeps working when one is down or blocked
    const BROKERS = [
        "wss://broker.emqx.io:8084/mqtt",
        "wss://broker.hivemq.com:8884/mqtt"
    ];
    const NOSTR_RELAYS = [
        "wss://nos.lol",
        "wss://relay.primal.net",
        "wss://nostr.mom",
        "wss://relay.snort.social"
    ];
    // "Ephemeral" event kind: relays pass these on without storing them
    const NOSTR_KIND = 25050;
    // OWASP's recommendation for PBKDF2-SHA256: makes guessing a password from captured
    // messages very slow, while joining still takes well under a second
    const ITERATIONS = 600000;
    // No 0/O, 1/I/L: easy to read out and type
    const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
    const MAX_MESSAGE = 65536;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const randomString = (alphabet, length) => {
        // Bytes above the largest multiple of the alphabet size are skipped, so every
        // character is equally likely
        const limit = 256 - (256 % alphabet.length);
        let out = "";
        while (out.length < length) {
            for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
                if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
            }
        }
        return out;
    };

    const toBase64 = bytes => {
        let text = "";
        for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(text);
    };
    const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
    const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

    const concat = (...parts) => {
        const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
        let at = 0;
        for (const part of parts) {
            out.set(part, at);
            at += part.length;
        }
        return out;
    };

    // Room codes: 9 characters shown as ABC-DEF-GHJ (about 44 bits)
    const newCode = () => randomString(CODE_ALPHABET, 9);
    const normalizeCode = text => String(text).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const isValidCode = code => code.length === 9 && [...code].every(c => CODE_ALPHABET.includes(c));
    const formatCode = code => code.match(/.{1,3}/g).join("-");
    const newPassword = () => randomString(PASSWORD_ALPHABET, 8);
    const newId = () => toHex(crypto.getRandomValues(new Uint8Array(12)));

    // AES-GCM: authenticated, so a changed or forged message fails to open
    const seal = async (key, bytes) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        return concat(iv, new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes)));
    };
    const unseal = async (key, bytes) =>
        new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)));

    const sealText = async (key, text) => toBase64(await seal(key, encoder.encode(text)));
    const unsealText = async (key, text) => decoder.decode(await unseal(key, fromBase64(text)));

    // Code + password -> broker topic and message key
    const deriveRoom = async (code, password) => {
        const base = await crypto.subtle.importKey("raw", encoder.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits(
            { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(`cinetab-room-v1:${code}`), iterations: ITERATIONS }, base, 256);
        const master = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveBits", "deriveKey"]);
        const purpose = info => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode(info) });
        const topicId = new Uint8Array(await crypto.subtle.deriveBits(purpose("cinetab topic"), master, 128));
        const key = await crypto.subtle.deriveKey(purpose("cinetab signal"), master, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        return { topic: `cinetab/v1/${toHex(topicId)}`, key, salt: topicId };
    };

    // Pair keys (ECDH): connection details sent between a guest and the host are readable only by
    // those two, not by other people who know the room password
    const newPairKey = async () => {
        const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
        return { privateKey: pair.privateKey, pub: toBase64(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))) };
    };
    const pairSecret = async (mine, theirPub, salt) => {
        const theirs = await crypto.subtle.importKey("raw", fromBase64(theirPub), { name: "ECDH", namedCurve: "P-256" }, false, []);
        const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, mine.privateKey, 256);
        const shared = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
        return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("cinetab pair") },
            shared, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    };

    // Minimal MQTT 3.1.1 over WebSocket: connect, subscribe to one topic, publish at QoS 0
    const mqttString = text => {
        const bytes = encoder.encode(text);
        return concat(new Uint8Array([bytes.length >> 8, bytes.length & 255]), bytes);
    };
    const mqttPacket = (header, body) => {
        const length = [];
        let n = body.length;
        do {
            let digit = n % 128;
            n = Math.floor(n / 128);
            if (n) digit |= 128;
            length.push(digit);
        } while (n);
        return concat(new Uint8Array([header, ...length]), body);
    };

    const connectBroker = (url, topic, onPayload, onChange) => {
        let ws = null;
        let buffer = new Uint8Array(0);
        let ready = false;
        let closed = false;
        let attempt = 0;
        let pingTimer = null;
        let retryTimer = null;
        // Messages sent before the subscription is up go out as soon as it is
        let queue = [];
        const sendNow = bytes => ws.send(mqttPacket(0x30, concat(mqttString(topic), bytes)));

        const handle = (type, flags, body) => {
            if (type === 2) { // CONNACK
                if (body[1] !== 0) return ws.close();
                ws.send(mqttPacket(0x82, concat(new Uint8Array([0, 1]), mqttString(topic), new Uint8Array([0]))));
            } else if (type === 9) { // SUBACK
                ready = true;
                attempt = 0;
                pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(new Uint8Array([0xc0, 0])), 20000);
                queue.forEach(sendNow);
                queue = [];
                onChange();
            } else if (type === 3) { // PUBLISH
                const topicLength = (body[0] << 8) | body[1];
                const qos = (flags >> 1) & 3;
                onPayload(body.subarray(2 + topicLength + (qos ? 2 : 0)));
            }
        };

        // A WebSocket message may hold several MQTT packets or part of one
        const parse = () => {
            while (buffer.length >= 2) {
                let length = 0, multiplier = 1, i = 1, digit;
                do {
                    if (i >= buffer.length) return;
                    digit = buffer[i++];
                    length += (digit & 127) * multiplier;
                    multiplier *= 128;
                } while (digit & 128 && i < 5);
                if (length > MAX_MESSAGE * 2) return ws.close();
                if (buffer.length < i + length) return;
                handle(buffer[0] >> 4, buffer[0] & 15, buffer.subarray(i, i + length));
                buffer = buffer.slice(i + length);
            }
        };

        const start = () => {
            ws = new WebSocket(url, "mqtt");
            ws.binaryType = "arraybuffer";
            ws.onopen = () => {
                const clientId = mqttString(`cinetab-${newId()}`);
                // Protocol "MQTT" level 4, clean session, keep-alive 30 s
                ws.send(mqttPacket(0x10, concat(mqttString("MQTT"), new Uint8Array([4, 2, 0, 30]), clientId)));
            };
            ws.onmessage = e => {
                buffer = concat(buffer, new Uint8Array(e.data));
                parse();
            };
            ws.onclose = () => {
                const wasReady = ready;
                ready = false;
                buffer = new Uint8Array(0);
                clearInterval(pingTimer);
                if (!closed) retryTimer = setTimeout(start, Math.min(30000, 1000 * 2 ** attempt++));
                if (wasReady) onChange();
            };
        };
        start();

        return {
            name: url.replace("wss://", "").replace("/mqtt", ""),
            get ready() { return ready; },
            publish: bytes => {
                if (ready) sendNow(bytes);
                else if (queue.length < 20) queue.push(bytes);
            },
            close: () => {
                closed = true;
                clearTimeout(retryTimer);
                clearInterval(pingTimer);
                if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0xe0, 0]));
                ws.close();
            }
        };
    };

    // ---------- Nostr relays
    // Relays only pass on events signed with a Schnorr key (BIP-340 on secp256k1), which Web Crypto
    // doesn't offer, hence this small implementation. Each session signs with a throwaway key: the
    // signature only satisfies the relay; the room's AES-GCM encryption is what protects messages.
    const Schnorr = (() => {
        const P = 2n ** 256n - 0x1000003D1n;
        const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
        const GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
        const GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
        const mod = (a, m = P) => ((a % m) + m) % m;
        const pow = (base, exp) => {
            let result = 1n;
            base = mod(base);
            for (; exp > 0n; exp >>= 1n) {
                if (exp & 1n) result = result * base % P;
                base = base * base % P;
            }
            return result;
        };
        // Points in Jacobian coordinates [X, Y, Z]; null is the point at infinity
        const double = point => {
            if (!point || point[1] === 0n) return null;
            const [X, Y, Z] = point;
            const YY = Y * Y % P, S = 4n * X * YY % P, M = 3n * X * X % P;
            const X3 = mod(M * M - 2n * S);
            return [X3, mod(M * (S - X3) - 8n * YY * YY), 2n * Y * Z % P];
        };
        const add = (p, q) => {
            if (!p) return q;
            if (!q) return p;
            const [X1, Y1, Z1] = p, [X2, Y2, Z2] = q;
            const Z1Z1 = Z1 * Z1 % P, Z2Z2 = Z2 * Z2 % P;
            const U1 = X1 * Z2Z2 % P, U2 = X2 * Z1Z1 % P;
            const S1 = Y1 * Z2 % P * Z2Z2 % P, S2 = Y2 * Z1 % P * Z1Z1 % P;
            if (U1 === U2) return S1 === S2 ? double(p) : null;
            const H = mod(U2 - U1), R = mod(S2 - S1);
            const HH = H * H % P, HHH = H * HH % P, V = U1 * HH % P;
            const X3 = mod(R * R - HHH - 2n * V);
            return [X3, mod(R * (V - X3) - S1 * HHH), Z1 * Z2 % P * H % P];
        };
        // k·G as affine [x, y]
        const multiply = k => {
            let result = null;
            for (let point = [GX, GY, 1n]; k > 0n; k >>= 1n, point = double(point)) {
                if (k & 1n) result = add(result, point);
            }
            const zInv = pow(result[2], P - 2n), zInv2 = zInv * zInv % P;
            return [result[0] * zInv2 % P, result[1] * zInv2 % P * zInv % P];
        };
        const toBytes = n => {
            const out = new Uint8Array(32);
            for (let i = 31; i >= 0; i--, n >>= 8n) out[i] = Number(n & 255n);
            return out;
        };
        const toNumber = bytes => bytes.reduce((n, byte) => (n << 8n) | BigInt(byte), 0n);
        const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const taggedHash = async (tag, ...parts) => {
            const hash = await sha256(encoder.encode(tag));
            return sha256(concat(hash, hash, ...parts));
        };

        const newKey = () => {
            let d;
            do d = toNumber(crypto.getRandomValues(new Uint8Array(32))); while (d === 0n || d >= N);
            const [x, y] = multiply(d);
            return { d: y & 1n ? N - d : d, pub: toBytes(x) };
        };

        const sign = async (key, message) => {
            const aux = await taggedHash("BIP0340/aux", crypto.getRandomValues(new Uint8Array(32)));
            const t = toBytes(key.d ^ toNumber(aux));
            const k0 = mod(toNumber(await taggedHash("BIP0340/nonce", t, key.pub, message)), N);
            const [rx, ry] = multiply(k0);
            const k = ry & 1n ? N - k0 : k0;
            const r = toBytes(rx);
            const e = mod(toNumber(await taggedHash("BIP0340/challenge", r, key.pub, message)), N);
            return concat(r, toBytes(mod(k + e * key.d, N)));
        };

        return { newKey, sign, sha256 };
    })();

    const connectRelay = (url, topic, onPayload, onChange) => {
        // The topic's random part is the event's tag; relays send us events with that tag
        const tag = topic.split("/").pop();
        const subscription = toHex(crypto.getRandomValues(new Uint8Array(8)));
        const key = Schnorr.newKey();
        const pubkey = toHex(key.pub);
        let ws = null;
        let ready = false;
        let closed = false;
        let attempt = 0;
        let retryTimer = null;
        let queue = [];

        const sendNow = async bytes => {
            const event = { pubkey, created_at: Math.floor(Date.now() / 1000), kind: NOSTR_KIND, tags: [["t", tag]], content: toBase64(bytes) };
            const id = await Schnorr.sha256(encoder.encode(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])));
            event.id = toHex(id);
            event.sig = toHex(await Schnorr.sign(key, id));
            if (ready && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(["EVENT", event]));
        };

        const start = () => {
            ws = new WebSocket(url);
            ws.onopen = () => ws.send(JSON.stringify(["REQ", subscription, { kinds: [NOSTR_KIND], "#t": [tag], since: Math.floor(Date.now() / 1000) - 30 }]));
            ws.onmessage = e => {
                let message;
                try {
                    message = JSON.parse(e.data);
                } catch (error) {
                    return;
                }
                if (!Array.isArray(message)) return;
                if (message[0] === "EOSE" && message[1] === subscription && !ready) {
                    ready = true;
                    attempt = 0;
                    queue.forEach(sendNow);
                    queue = [];
                    onChange();
                } else if (message[0] === "EVENT" && message[1] === subscription) {
                    const event = message[2];
                    if (!event || event.kind !== NOSTR_KIND || typeof event.content !== "string" || event.content.length > MAX_MESSAGE * 2) return;
                    try {
                        onPayload(fromBase64(event.content));
                    } catch (error) {}
                }
            };
            ws.onclose = () => {
                const wasReady = ready;
                ready = false;
                if (!closed) retryTimer = setTimeout(start, Math.min(30000, 1000 * 2 ** attempt++));
                if (wasReady) onChange();
            };
        };
        start();

        return {
            name: url.replace("wss://", ""),
            get ready() { return ready; },
            publish: bytes => {
                if (ready) sendNow(bytes);
                else if (queue.length < 20) queue.push(bytes);
            },
            close: () => {
                closed = true;
                clearTimeout(retryTimer);
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(["CLOSE", subscription]));
                ws.close();
            }
        };
    };

    const connectAll = (topic, onPayload, onChange) => [
        ...BROKERS.map(url => connectBroker(url, topic, onPayload, onChange)),
        ...NOSTR_RELAYS.map(url => connectRelay(url, topic, onPayload, onChange))
    ];

    // For the network check: which relays this network can reach, and how fast
    const check = (timeout = 7000) => new Promise(resolve => {
        const startedAt = Date.now();
        const topic = `cinetab/check/${newId()}`;
        const results = new Map();
        const links = connectAll(topic, () => {}, () => links.forEach(link => {
            if (link.ready && !results.has(link)) results.set(link, Date.now() - startedAt);
        }));
        const finish = () => {
            clearInterval(poll);
            links.forEach(link => link.close());
            resolve(links.map(link => ({ name: link.name, port443: !link.name.includes(":"), ok: results.has(link), ms: results.get(link) })));
        };
        const poll = setInterval(() => (results.size === links.length || Date.now() - startedAt > timeout) && finish(), 200);
    });

    // Joins a room's channel. Messages are plain objects; each gets a timestamp, and copies that
    // arrive through more than one relay are delivered once.
    const join = async ({ code, password, onMessage, onChange = () => {} }) => {
        const room = await deriveRoom(code, password);
        const seen = new Set();
        const receive = async payload => {
            if (payload.length > MAX_MESSAGE) return;
            const id = toHex(payload.subarray(0, 12));
            if (seen.has(id)) return;
            let message;
            try {
                message = JSON.parse(decoder.decode(await unseal(room.key, payload)));
            } catch (e) {
                return; // Not for this room, or tampered with
            }
            if (seen.has(id)) return;
            seen.add(id);
            if (seen.size > 1000) seen.delete(seen.values().next().value);
            // Old messages replayed by someone else are ignored
            if (!message || typeof message !== "object" || Math.abs(Date.now() - message.ts) > 10 * 60 * 1000) return;
            onMessage(message);
        };
        const brokers = connectAll(room.topic, receive, () => onChange(brokers.filter(b => b.ready).length));

        return {
            salt: room.salt,
            get connected() { return brokers.some(b => b.ready); },
            send: async message => {
                const bytes = await seal(room.key, encoder.encode(JSON.stringify({ ...message, ts: Date.now() })));
                brokers.forEach(broker => broker.publish(bytes));
            },
            close: () => brokers.forEach(broker => broker.close())
        };
    };

    return {
        newCode, normalizeCode, isValidCode, formatCode, newPassword, newId,
        newPairKey, pairSecret, sealText, unsealText, join, check
    };
})();
