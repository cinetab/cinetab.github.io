// CineTab tooltips
// Turns every `title` attribute into a tooltip drawn like a system tooltip but in the page's
// dark theme. Unlike browser title tooltips they look the same everywhere and also show in
// fullscreen. Code elsewhere keeps setting `title` as usual; it's picked up automatically.

const hideTooltip = (() => {
    const SHOW_DELAY = 450;
    // Moving straight from one control to the next shows the next tooltip immediately
    const WARM_WINDOW = 400;

    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.id = "tooltip";
    tip.setAttribute("role", "tooltip");

    let target = null;
    let suppressed = null;
    let showTimer = null;
    let lastHiddenAt = 0;

    const place = () => {
        tip.textContent = target.dataset.tip;
        // Only the fullscreen element and its children are drawn in fullscreen
        const host = document.fullscreenElement || document.body;
        if (tip.parentNode !== host) host.appendChild(tip);
        tip.style.left = "0px";
        tip.style.top = "0px";

        const r = target.getBoundingClientRect();
        const t = tip.getBoundingClientRect();
        const gap = 8;
        // Controls in the lower half get their tooltip above them, the rest below
        const above = r.top + r.height / 2 > window.innerHeight / 2;
        let top = above ? r.top - t.height - gap : r.bottom + gap;
        let left = r.left + r.width / 2 - t.width / 2;
        left = Math.max(gap, Math.min(left, window.innerWidth - t.width - gap));
        top = Math.max(gap, Math.min(top, window.innerHeight - t.height - gap));
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
    };

    const show = (el, delay) => {
        clearTimeout(showTimer);
        target = el;
        showTimer = setTimeout(() => {
            if (target !== el || !el.isConnected || !el.dataset.tip) return;
            place();
            tip.classList.add("show");
            el.setAttribute("aria-describedby", tip.id);
        }, delay);
    };

    const hide = () => {
        clearTimeout(showTimer);
        if (tip.classList.contains("show")) lastHiddenAt = Date.now();
        tip.classList.remove("show");
        if (target) target.removeAttribute("aria-describedby");
        target = null;
    };

    // title -> data-tip, so the browser doesn't draw its own tooltip as well
    const adopt = el => {
        const text = el.getAttribute("title");
        if (text === null) return;
        el.removeAttribute("title");
        el.dataset.tip = text;
        // Icon-only controls lose their accessible name with the title, so give it back
        const iconOnly = !el.textContent.trim() || el.querySelector(".material-symbols-rounded");
        if (iconOnly && (!el.hasAttribute("aria-label") || el.dataset.tipLabel)) {
            el.setAttribute("aria-label", text);
            el.dataset.tipLabel = "1";
        }
        if (el === target && tip.classList.contains("show")) place();
    };

    document.body.querySelectorAll("[title]").forEach(adopt);
    new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "attributes") {
                adopt(record.target);
                continue;
            }
            record.addedNodes.forEach(node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                adopt(node);
                node.querySelectorAll("[title]").forEach(adopt);
            });
        }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });

    document.addEventListener("pointerover", e => {
        if (e.pointerType === "touch") return;
        const el = e.target.closest("[data-tip]");
        if (el === target) return;
        if (el !== suppressed) suppressed = null;
        if (!el || el === suppressed) return hide();
        const warm = tip.classList.contains("show") || Date.now() - lastHiddenAt < WARM_WINDOW;
        if (target) target.removeAttribute("aria-describedby");
        show(el, warm ? 0 : SHOW_DELAY);
    });
    document.addEventListener("pointerout", e => {
        if (!e.relatedTarget) {
            suppressed = null;
            hide();
        }
    });
    // Like system tooltips: clicking hides it until the pointer leaves the control
    document.addEventListener("pointerdown", () => {
        suppressed = target;
        hide();
    }, true);

    document.addEventListener("focusin", e => {
        const el = e.target.closest && e.target.closest("[data-tip]");
        if (el && el.matches(":focus-visible")) show(el, SHOW_DELAY);
    });
    document.addEventListener("focusout", e => {
        if (e.target === target) hide();
    });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" || e.key === "Tab") hide();
    }, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    document.addEventListener("fullscreenchange", hide);

    return hide;
})();
