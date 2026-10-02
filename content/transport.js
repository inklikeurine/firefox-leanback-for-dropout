// Leanback for Dropout — the transport bar.
//
// Drawn by the extension, not borrowed from the player, and it drives the
// <video> directly. The player's own bar has hashed class names, an idle-hide
// timer and a popover inside it, none of which suit a remote.
//
//   [ play/pause | position (display only) | settings | fullscreen ]
//
// Position is not a stop on the row: ◀ ▶ seek whenever the row is not holding
// a button, which is the rule the rest of the extension follows.
//
// Over the top left of the picture, the title: the show's name, then
// "S9 · E3 · Whodunnit". It shows whenever the bar does, and on its own for a
// moment when a video starts. The bar can also "peek": shown for a moment
// without holding the selection, so the keys keep doing what they do in
// playback (on pause, on a skip). A skip also puts ⏪ / ⏩ and the new time
// in the middle of the picture. Near the end of an episode, the "Up next"
// card sits over the bottom right: the next episode's picture inside a
// countdown ring, "UP NEXT · 0:08", "S9 · E4" and the show.
//
// The settings panel is the one place the player is still asked anything.
// Quality, speed and captions are the player's to know, so the panel proxies
// its menu: it reads the real menu out of sight, draws the entries in
// Leanback's own list, and clicks the original when one is taken — as many
// levels deep as the player's menu goes. Nothing about how the player lays its
// menu out reaches the screen.
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VENDOR_MENU_TIMEOUT_MS = 1200;
  const VENDOR_MENU_POLL_MS = 60;

  // Simple stroked glyphs: legible across a room, and no icon font to ship.
  const ICONS = {
    play: { fill: "M8 5v14l11-7z" },
    pause: { fill: "M6 5h3.5v14H6zm8.5 0H18v14h-3.5z" },
    gear: {
      stroke: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4z"
    },
    fullscreen: { stroke: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5" },
    fullscreenExit: { stroke: "M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5" },
    check: { stroke: "M5 13l4 4L19 7" },
    rewind: { fill: "M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" },
    forward: { fill: "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" },
    chevron: { stroke: "M9 6l6 6-6 6" }
  };

  function svgIcon(doc, name) {
    const spec = ICONS[name];
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", spec.fill || spec.stroke);
    if (spec.fill) {
      path.setAttribute("fill", "currentColor");
    } else {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    }
    svg.appendChild(path);
    return svg;
  }

  function clock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const s = Math.floor(seconds % 60);
    const m = Math.floor(seconds / 60) % 60;
    const h = Math.floor(seconds / 3600);
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
  }

  /**
   * @param {Document} doc         the player frame's document
   * @param {object}   opts
   *   video()      -> the current <video>, or null
   *   rules        -> the site rules' `player` block
   *   settings     -> the extension settings (ring colour and width)
   *   onClose()    -> the row closed; ◀ ▶ go back to seeking
   *   onPageFocus()-> ▼ again: hand the focus to the page below
   */
  function createTransport(doc, opts) {
    const o = opts || {};
    const rules = o.rules || {};
    const getVideo = typeof o.video === "function" ? o.video : () => null;
    const ids = ["playpause", "settings", "fullscreen"];

    let open = false;
    let index = 0;
    // Set while we send the player a key of our own. That event bubbles to the
    // window, where the extension's own handler would read it as the viewer
    // pressing back a second time and close the whole row.
    let echoing = false;
    let panel = null; // { kind, items, index, depth, vendor }
    let raf = 0;
    let peeking = false; // shown for a moment, not holding the selection
    let peekReason = "";
    let peekTimer = 0;
    let titleTimer = 0;
    let seekTimer = 0;

    // -- the row ------------------------------------------------------------
    const el = doc.createElement("div");
    el.className = "tenfoot-transport";
    el.hidden = true;
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-label", "Playback controls");

    const row = doc.createElement("div");
    row.className = "tenfoot-transport-row";
    el.appendChild(row);

    const buttons = {};
    function makeButton(id, label, icon) {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "tenfoot-tc";
      b.dataset.tenfootTc = id;
      b.setAttribute("aria-label", label);
      b.appendChild(svgIcon(doc, icon));
      buttons[id] = b;
      return b;
    }

    row.appendChild(makeButton("playpause", "Play or pause", "play"));
    buttons.playpause.classList.add("tenfoot-tc-main");

    // Position: shown, never selected. ◀ ▶ seek whenever the row is not
    // holding a button, so there is nothing here to walk onto. The time so
    // far sits under the start of the bar and the length under its end.
    const scrub = doc.createElement("div");
    scrub.className = "tenfoot-scrub";
    const track = doc.createElement("div");
    track.className = "tenfoot-scrub-track";
    const buffered = doc.createElement("div");
    buffered.className = "tenfoot-scrub-buffered";
    const played = doc.createElement("div");
    played.className = "tenfoot-scrub-played";
    const head = doc.createElement("div");
    head.className = "tenfoot-scrub-head";
    track.append(buffered, played, head);
    const times = doc.createElement("div");
    times.className = "tenfoot-scrub-times";
    const elapsed = doc.createElement("span");
    elapsed.className = "tenfoot-scrub-elapsed";
    elapsed.textContent = "0:00";
    const total = doc.createElement("span");
    total.className = "tenfoot-scrub-total";
    total.textContent = "0:00";
    times.append(elapsed, total);
    scrub.append(track, times);
    row.appendChild(scrub);

    // Captions live in the settings panel, so the row has no CC button.
    row.appendChild(makeButton("settings", "Settings", "gear"));
    row.appendChild(makeButton("fullscreen", "Full screen", "fullscreen"));

    doc.documentElement.appendChild(el);

    // -- the title ----------------------------------------------------------
    const osd = doc.createElement("div");
    osd.className = "tenfoot-osd";
    osd.hidden = true;
    const osdShow = doc.createElement("p");
    osdShow.className = "tenfoot-osd-show";
    const osdEpisode = doc.createElement("p");
    osdEpisode.className = "tenfoot-osd-episode";
    osd.append(osdShow, osdEpisode);
    doc.documentElement.appendChild(osd);

    // -- the skip feedback ---------------------------------------------------
    // ⏪ / ⏩ and the new time, in the middle of the picture.
    const seekEl = doc.createElement("div");
    seekEl.className = "tenfoot-seek";
    seekEl.hidden = true;
    seekEl.setAttribute("role", "status");
    const seekIcon = doc.createElement("span");
    seekIcon.className = "tenfoot-seek-icon";
    const seekTime = doc.createElement("span");
    seekTime.className = "tenfoot-seek-time";
    seekEl.append(seekIcon, seekTime);
    doc.documentElement.appendChild(seekEl);

    // -- the up-next card -----------------------------------------------------
    const RING_R = 15;
    const RING_C = 2 * Math.PI * RING_R;
    const upEl = doc.createElement("div");
    upEl.className = "tenfoot-upnext";
    upEl.hidden = true;
    upEl.setAttribute("role", "status");
    const upThumb = doc.createElement("div");
    upThumb.className = "tenfoot-upnext-thumb";
    const upImg = doc.createElement("img");
    upImg.className = "tenfoot-upnext-img";
    upImg.alt = "";
    const ring = doc.createElementNS(SVG_NS, "svg");
    ring.setAttribute("viewBox", "0 0 36 36");
    ring.setAttribute("class", "tenfoot-upnext-ring");
    ring.setAttribute("aria-hidden", "true");
    const ringBack = doc.createElementNS(SVG_NS, "circle");
    const ringFill = doc.createElementNS(SVG_NS, "circle");
    for (const [c, cls] of [[ringBack, "tenfoot-upnext-ring-back"], [ringFill, "tenfoot-upnext-ring-fill"]]) {
      c.setAttribute("cx", "18");
      c.setAttribute("cy", "18");
      c.setAttribute("r", String(RING_R));
      c.setAttribute("class", cls);
      ring.appendChild(c);
    }
    ringFill.setAttribute("stroke-dasharray", RING_C.toFixed(2));
    const upPlay = doc.createElement("span");
    upPlay.className = "tenfoot-upnext-play";
    upPlay.appendChild(svgIcon(doc, "play"));
    upThumb.append(upImg, ring, upPlay);
    const upText = doc.createElement("div");
    upText.className = "tenfoot-upnext-text";
    const upLabel = doc.createElement("p");
    upLabel.className = "tenfoot-upnext-label";
    const upLine = doc.createElement("p");
    upLine.className = "tenfoot-upnext-line";
    const upShow = doc.createElement("p");
    upShow.className = "tenfoot-upnext-show";
    const upKeys = doc.createElement("p");
    upKeys.className = "tenfoot-upnext-keys";
    for (const [k, label] of [["OK", "Play now"], ["◀", "Hide"]]) {
      const key = doc.createElement("kbd");
      key.textContent = k;
      const span = doc.createElement("span");
      span.textContent = label;
      upKeys.append(key, span);
    }
    upText.append(upLabel, upLine, upShow, upKeys);
    upEl.append(upThumb, upText);
    doc.documentElement.appendChild(upEl);

    /**
     * The card, or null to take it away.
     * {image, line ("S9 · E4"), show, seconds (null: no countdown), fraction
     *  (how much of the countdown is left, 0–1)}
     */
    function showUpNext(c) {
      if (!c) {
        upEl.hidden = true;
        return;
      }
      const img = typeof c.image === "string" && /^https:\/\//.test(c.image) ? c.image : "";
      if (upImg.getAttribute("src") !== (img || null)) {
        if (img) upImg.setAttribute("src", img);
        else upImg.removeAttribute("src");
      }
      const counting = typeof c.seconds === "number" && Number.isFinite(c.seconds);
      const label = counting ? `Up next · ${clock(c.seconds)}` : "Up next";
      if (upLabel.textContent !== label) upLabel.textContent = label;
      if (upLine.textContent !== (c.line || "")) upLine.textContent = c.line || "";
      if (upShow.textContent !== (c.show || "")) upShow.textContent = c.show || "";
      upShow.hidden = !c.show;
      const left = counting ? Math.min(1, Math.max(0, Number(c.fraction) || 0)) : 1;
      ringFill.setAttribute("stroke-dashoffset", (RING_C * (1 - left)).toFixed(2));
      upEl.dataset.tenfootCounting = counting ? "true" : "false";
      upEl.hidden = false;
    }

    // {series, season, episode, title}: what the page knows about this video.
    function setInfo(info) {
      const i = info || {};
      const has = (n) => typeof n === "number" && Number.isFinite(n);
      const line = [has(i.season) ? `S${i.season}` : "", has(i.episode) ? `E${i.episode}` : "", i.title || ""]
        .filter(Boolean).join(" · ");
      osdShow.textContent = i.series || "";
      osdShow.hidden = !i.series;
      osdEpisode.textContent = line;
      osdEpisode.hidden = !line;
    }

    function titleShown() {
      return !osd.hidden;
    }

    function showTitle(ms) {
      if (titleTimer) clearTimeout(titleTimer);
      titleTimer = 0;
      if (!osdShow.textContent && !osdEpisode.textContent) return;
      osd.hidden = false;
      if (ms) titleTimer = setTimeout(hideTitle, ms);
    }

    function hideTitle() {
      if (titleTimer) clearTimeout(titleTimer);
      titleTimer = 0;
      // The bar on screen keeps its title.
      if (open || peeking) return;
      osd.hidden = true;
    }

    // -- the settings panel -------------------------------------------------
    // Full height, flown in from the right: nav/panel.js draws it, the same
    // panel as Leanback's settings on a page.
    const view = globalThis.TenfootPanel.createPanel(doc, { label: "Settings", onPick: (i) => pickEntry(i) });
    const panelEl = view.element;

    // -- selectors ----------------------------------------------------------
    const Rules = globalThis.TenfootSiteRules;
    const Settings = globalThis.TenfootSettings;
    const sel = (v) => (Rules && Rules.selector ? Rules.selector(v) : (Array.isArray(v) ? v.join(", ") : v)) || null;
    function qs(value, scope) {
      const s = sel(value);
      if (!s) return null;
      try {
        return (scope || doc).querySelector(s);
      } catch (_err) {
        return null;
      }
    }
    function qsa(value, scope) {
      const s = sel(value);
      if (!s) return [];
      try {
        return Array.from((scope || doc).querySelectorAll(s));
      } catch (_err) {
        return [];
      }
    }

    const settings = () => (typeof o.settings === "function" ? o.settings() : {}) || {};
    const nextEpisode = () => (typeof o.nextEpisode === "function" ? o.nextEpisode() : null);
    function saveSetting(id, value) {
      if (typeof o.onSetting === "function") o.onSetting({ [id]: value });
    }

    // -- live state ---------------------------------------------------------
    function paint() {
      raf = 0;
      const v = getVideo();
      const playing = Boolean(v) && !v.paused && !v.ended;
      const b = buttons.playpause;
      const want = playing ? "pause" : "play";
      if (b.dataset.tenfootIcon !== want) {
        b.dataset.tenfootIcon = want;
        while (b.firstChild) b.removeChild(b.firstChild);
        b.appendChild(svgIcon(doc, want));
        b.setAttribute("aria-label", playing ? "Pause" : "Play");
      }
      const fs = buttons.fullscreen;
      const fsWant = doc.fullscreenElement ? "fullscreenExit" : "fullscreen";
      if (fs.dataset.tenfootIcon !== fsWant) {
        fs.dataset.tenfootIcon = fsWant;
        while (fs.firstChild) fs.removeChild(fs.firstChild);
        fs.appendChild(svgIcon(doc, fsWant));
      }
      const dur = v && Number.isFinite(v.duration) ? v.duration : 0;
      const cur = v ? v.currentTime || 0 : 0;
      const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
      played.style.width = `${pct}%`;
      head.style.left = `${pct}%`;
      let buf = 0;
      try {
        if (v && v.buffered && v.buffered.length) buf = v.buffered.end(v.buffered.length - 1);
      } catch (_err) { /* buffered throws in some states; the bar just shows less */ }
      buffered.style.width = dur > 0 ? `${Math.min(100, (buf / dur) * 100)}%` : "0%";
      if (elapsed.textContent !== clock(cur)) elapsed.textContent = clock(cur);
      if (total.textContent !== clock(dur)) total.textContent = clock(dur);
      scrub.setAttribute("aria-label", `${clock(cur)} of ${clock(dur)}`);
    }

    // Opening settings stops the picture, and it stays stopped until the panel
    // closes. Reading the player's menus means clicking the player's own
    // controls, and those wake its click-to-play; rather than chase every path
    // that could start it, the panel simply holds it.
    function holdPaused() {
      if (!panel) return;
      const v = getVideo();
      if (v && !v.paused && !v.ended) v.pause();
    }

    function schedulePaint() {
      if (raf || !(open || peeking)) return;
      const w = doc.defaultView;
      raf = w && w.requestAnimationFrame ? w.requestAnimationFrame(paint) : setTimeout(paint, 60);
    }

    // -- the player's own menu ----------------------------------------------
    // Opened out of sight, read, and drawn as ours. Nothing of its markup is
    // ever on screen. The popover shows one panel at a time: the root, which
    // has no header, or a submenu, whose header holds its title and a Back
    // button. Collapsed accordions keep their options in the DOM marked
    // `hidden`, and group headings ("Color", "Size") sit outside the options,
    // named by each radio group's aria-labelledby.

    function textOf(node) {
      return (node && node.textContent ? node.textContent : "").replace(/\s+/g, " ").trim();
    }

    function isShown(node, menu) {
      for (let n = node; n && n !== menu; n = n.parentElement) {
        if (n.hidden) return false;
      }
      return true;
    }

    function groupOf(node) {
      const g = node.closest ? node.closest("[role='radiogroup'][aria-labelledby]") : null;
      if (!g) return "";
      return (g.getAttribute("aria-labelledby") || "").split(/\s+/)
        .map((id) => (id ? textOf(doc.getElementById(id)) : ""))
        .filter(Boolean)
        .join(" ")
        .slice(0, 40);
    }

    // drill: opens a submenu. expand: opens an accordion in place. option: one
    // of a set (a track, a colour, a size). action: anything else ("Reset all").
    function kindOf(node) {
      const role = node.getAttribute("role");
      if (role === "button" && node.hasAttribute("aria-expanded")) return "expand";
      if (node.getAttribute("aria-haspopup") === "true" || node.getAttribute("data-menu-item") === "true") return "drill";
      if (role === "menuitemradio" || role === "radio") return "option";
      return "action";
    }

    function readVendorMenu() {
      const menu = qs(rules.menu);
      if (!menu) return null;
      const body = qs(rules.menuPanel, menu) || menu;
      const seen = new Set();
      const items = [];
      for (const node of qsa(rules.menuItem, body)) {
        if (seen.has(node) || !isShown(node, menu)) continue;
        seen.add(node);
        const kind = kindOf(node);
        const texts = qsa(rules.menuText, node).map(textOf).filter(Boolean);
        const label = textOf(qs(rules.menuLabel, node)) || (node.getAttribute("aria-label") || "").trim() || texts[0] || textOf(node);
        if (!label) continue;
        const value = kind === "option" || kind === "action" ? "" : (textOf(qs(rules.menuValue, node)) || texts[1] || "");
        items.push({
          kind,
          label: label.slice(0, 60),
          value: value.slice(0, 30),
          checked: node.getAttribute("aria-checked") === "true",
          group: groupOf(node),
          node
        });
      }
      if (!items.length) return null;
      return { title: textOf(qs(rules.menuTitle, menu)) || null, items };
    }

    const signature = (read) => (read
      ? `${read.title}|${read.items.map((i) => `${i.label}:${i.checked}:${i.value}`).join(",")}`
      : "");

    function wait(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    // The player redraws its menu a moment after a click: wait for a read
    // that differs from the one before, or take what is there at the deadline.
    async function readAfter(before) {
      const deadline = Date.now() + VENDOR_MENU_TIMEOUT_MS;
      const was = signature(before);
      await wait(VENDOR_MENU_POLL_MS * 2);
      for (;;) {
        const now = readVendorMenu();
        if (now && signature(now) !== was) return now;
        if (Date.now() > deadline) return now;
        await wait(VENDOR_MENU_POLL_MS);
      }
    }

    function pressVendorBack() {
      const menu = qs(rules.menu);
      const back = menu ? qs(rules.menuBack, menu) : null;
      if (!back) return false;
      try {
        back.click();
        return true;
      } catch (_err) {
        return false;
      }
    }

    // The root's entries. The popover is always in the DOM, so it can be read
    // without opening it; if it was left on a submenu, it is walked back first.
    // The gear is a toggle, so it is only pressed when there is nothing to read.
    async function openVendorRoot() {
      if (typeof o.wake === "function") o.wake();
      let read = readVendorMenu();
      for (let i = 0; read && read.title && i < 4; i += 1) {
        if (!pressVendorBack()) break;
        read = await readAfter(read);
      }
      if (read && !read.title) return read.items;
      const button = qs(rules.prefsButton);
      if (!button) return read ? read.items : null;
      try {
        button.click();
      } catch (_err) {
        return null;
      }
      const deadline = Date.now() + VENDOR_MENU_TIMEOUT_MS;
      for (;;) {
        read = readVendorMenu();
        if (read) return read.items;
        if (Date.now() > deadline) return null;
        await wait(VENDOR_MENU_POLL_MS);
      }
    }

    function closeVendorMenu() {
      const menu = qs(rules.menu);
      if (!menu) return;
      echoing = true;
      try {
        sendVendorClose(menu);
      } finally {
        echoing = false;
      }
    }

    function sendVendorClose(menu) {
      const w = doc.defaultView;
      try {
        menu.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } catch (_err) { /* the button below is the fallback */ }
    }

    // -- the rows -----------------------------------------------------------
    // Vendor rows take their value and their submenus from the player; the
    // rest are Leanback's own. The player's popover holds three entries —
    // Quality, Speed and CC/subtitles — and the caption appearance (font,
    // background, window) lives inside CC/subtitles, under Customize.
    const ROWS = [
      // Only after the video picked up where it was left: back to 0:00.
      { id: "restart", label: "Start Over", kind: "restart" },
      { id: "quality", label: "Quality", kind: "vendor", match: /quality|resolution/i },
      { id: "speed", label: "Speed", kind: "vendor", match: /speed|rate/i },
      // Not a toggle: it takes you to the next episode. Whether one plays by
      // itself at the end is a Leanback setting, and lives in that submenu.
      { id: "next", label: "Play Next Episode", kind: "action" },
      // Captions are the player's: setting a TextTrack's mode draws nothing,
      // because the player keeps its own state. A switch here; ▶ opens the
      // player's own captions menu (its tracks, and Customize).
      { id: "captions", label: "Closed Captions", kind: "captions", match: /cc|subtitle|caption/i },
      { id: "captionStyle", label: "Caption Style", kind: "captionStyle" },
      { id: "leanback", label: "Leanback Settings", kind: "leanback" }
    ];
    const VENDOR_ROWS = ROWS.filter((r) => r.match);
    const OFF = /^\s*off\s*$/i;
    const CUSTOMIZE = /customi[sz]e|style|appearance|settings/i;

    function visibleRows() {
      const vendor = panel && panel.vendor ? panel.vendor : {};
      return ROWS.filter((r) => {
        // A vendor row exists only if the player reported something to put in
        // it, so a menu that changes shape cannot leave a dead row behind.
        if (r.kind === "vendor" || r.kind === "captions") return Boolean(vendor[r.id]);
        if (r.kind === "captionStyle") return Boolean(vendor.captions);
        if (r.kind === "action") return Boolean(nextEpisode());
        if (r.kind === "restart") return typeof o.resumed === "function" && Boolean(o.resumed());
        return true;
      });
    }

    function captionsOn() {
      const hit = panel && panel.vendor ? panel.vendor.captions : null;
      return Boolean(hit && hit.value && !OFF.test(hit.value));
    }

    function rowEntry(r) {
      const vendor = panel && panel.vendor ? panel.vendor : {};
      switch (r.kind) {
        case "vendor":
          return { id: r.id, label: r.label, kind: "drill", value: vendor[r.id] ? vendor[r.id].value : "" };
        case "captions":
          return { id: r.id, label: r.label, kind: "toggle", on: captionsOn() };
        case "captionStyle":
          return { id: r.id, label: r.label, kind: "drill" };
        case "leanback":
          return { id: r.id, label: r.label, kind: "drill", separator: true };
        case "action": {
          const n = nextEpisode();
          return { id: r.id, label: r.label, kind: "action", value: n && n.title ? n.title : "" };
        }
        default:
          return { id: r.id, label: r.label, kind: "action" };
      }
    }

    function mapVendor(items) {
      const found = {};
      for (const r of VENDOR_ROWS) {
        const hit = (items || []).find((it) => r.match.test(it.label));
        if (hit) found[r.id] = hit;
      }
      return found;
    }

    // Leanback's own settings: the one list (lib/settings.js), then Clear
    // Continue Watching (OK twice) and Turn Leanback Off.
    function leanbackEntries(lvl) {
      const s = settings();
      const rows = (Settings && Settings.ROWS) || [];
      const entries = rows.map((r) => (r.kind === "toggle"
        ? { id: r.id, label: r.label, kind: "toggle", on: Boolean(s[r.id]) }
        : { id: r.id, label: r.label, kind: "choice", value: Settings.valueText(r, s[r.id]) }));
      entries.push({ id: "forget", label: "Clear Continue Watching", kind: "action", value: lvl && lvl.armed ? "OK again to clear" : lvl && lvl.cleared ? "Cleared" : "", separator: true });
      entries.push({ id: "disable", label: "Turn Leanback Off", kind: "action" });
      return entries;
    }

    // -- panel rendering ----------------------------------------------------
    // The panel is the top-level rows plus a stack of levels: Leanback's own
    // settings, a setting's choices, or as many levels of the player's menu
    // as it has.
    const level = () => (panel && panel.stack.length ? panel.stack[panel.stack.length - 1] : null);
    const firstChecked = (items) => Math.max(0, items.findIndex((i) => i.checked));

    function entriesOf(lvl) {
      if (!lvl) return panel.rows.map(rowEntry);
      if (lvl.kind === "leanback") return leanbackEntries(lvl);
      if (lvl.kind === "choice") {
        const cur = settings()[lvl.row.id];
        return lvl.values.map((v) => ({ id: String(v), label: Settings.valueText(lvl.row, v), kind: "option", checked: v === cur }));
      }
      return lvl.items.map((it) => ({
        label: it.label,
        value: it.value,
        kind: it.kind === "drill" || it.kind === "expand" ? "drill" : it.kind === "option" ? "option" : "action",
        checked: it.kind === "option" && it.checked,
        group: it.group
      }));
    }

    function renderPanel() {
      if (!panel) return;
      const lvl = level();
      view.render({ title: lvl ? lvl.title : "Settings", index: lvl ? lvl.index : panel.index, entries: entriesOf(lvl) });
    }

    async function openPanel() {
      const v = getVideo();
      // Settings pauses the picture: you are reading, not watching.
      const wasPlaying = Boolean(v) && !v.paused && !v.ended;
      if (wasPlaying) {
        if (typeof o.onPlayback === "function") o.onPlayback(true);
        v.pause();
      }
      // One retry: the player's menu can be busy at the moment the panel opens
      // (something else driving it, a re-render mid-click), and an empty read
      // would drop Quality, Speed and Closed Captions for the life of the panel.
      let items = await openVendorRoot();
      if (!items || !items.length) {
        await wait(220);
        items = await openVendorRoot();
      }
      panel = { vendor: mapVendor(items), rows: [], index: 0, stack: [], resume: wasPlaying };
      panel.rows = visibleRows();
      view.open();
      renderPanel();
      schedulePaint();
      return true;
    }

    function closePanel() {
      if (!panel) return false;
      const resume = panel.resume;
      panel = null;
      view.close();
      closeVendorMenu();
      const v = getVideo();
      if (resume && v && v.paused && !v.ended) {
        if (typeof o.onPlayback === "function") o.onPlayback(false);
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => { /* OK on play starts it */ });
      }
      focus(index);
      schedulePaint();
      return true;
    }

    function refreshRows() {
      if (!panel) return;
      panel.rows = visibleRows();
      if (panel.index >= panel.rows.length) panel.index = Math.max(0, panel.rows.length - 1);
      renderPanel();
    }

    // Show whichever panel the player's menu is on now: after a pick it may
    // stay (a caption colour), go back up (a quality), or return to the root.
    function follow(read, taken) {
      if (!panel) return false;
      if (!read || !read.title) {
        panel.stack = panel.stack.filter((l) => l.kind !== "vendor");
        if (read) panel.vendor = mapVendor(read.items);
        refreshRows();
        return true;
      }
      for (let i = panel.stack.length - 1; i >= 0; i -= 1) {
        const l = panel.stack[i];
        if (l.kind !== "vendor" || l.vendorTitle !== read.title) continue;
        panel.stack.length = i + 1;
        l.items = read.items;
        const keep = taken ? l.items.findIndex((x) => x.label === taken.label && x.group === taken.group) : -1;
        l.index = keep >= 0 ? keep : Math.min(l.index, l.items.length - 1);
        renderPanel();
        return true;
      }
      panel.stack.push({ title: read.title, vendorTitle: read.title, kind: "vendor", items: read.items, index: firstChecked(read.items), backs: 1 });
      renderPanel();
      return true;
    }

    // Click an entry of the player's menu and read where it went.
    async function clickVendor(item) {
      const before = readVendorMenu();
      try {
        item.node.click();
      } catch (_err) {
        return null;
      }
      return readAfter(before);
    }

    async function drillInto(item, title) {
      const read = await clickVendor(item);
      if (!panel || !read) return false;
      panel.stack.push({ title, vendorTitle: read.title, kind: "vendor", items: read.items, index: firstChecked(read.items), backs: 1 });
      renderPanel();
      return true;
    }

    // The captions switch: into the player's captions menu, Off or its first
    // track, and back to the root (the player goes back up by itself after a
    // track; the root is read again either way).
    async function toggleCaptions() {
      const hit = panel && panel.vendor.captions;
      if (!hit) return false;
      const want = !captionsOn();
      const sub = await clickVendor(hit);
      if (!panel || !sub) return false;
      const options = sub.items.filter((i) => i.kind === "option");
      const target = want ? options.find((i) => !OFF.test(i.label)) : options.find((i) => OFF.test(i.label));
      if (target) await clickVendor(target);
      if (!panel) return false;
      panel.vendor = mapVendor(await openVendorRoot());
      refreshRows();
      return true;
    }

    // Caption Style: the player's Customize (font, background, window), two
    // levels down; ◀ comes back up both at once. Without a Customize, the
    // captions menu itself.
    async function openCaptionStyle() {
      const hit = panel && panel.vendor.captions;
      if (!hit) return false;
      const sub = await clickVendor(hit);
      if (!panel || !sub) return false;
      const custom = sub.items.find((i) => (i.kind === "drill" || i.kind === "expand") && CUSTOMIZE.test(i.label));
      if (!custom) {
        panel.stack.push({ title: "Caption Style", vendorTitle: sub.title, kind: "vendor", items: sub.items, index: firstChecked(sub.items), backs: 1 });
        renderPanel();
        return true;
      }
      const read = await clickVendor(custom);
      if (!panel || !read) return false;
      panel.stack.push({ title: "Caption Style", vendorTitle: read.title, kind: "vendor", items: read.items, index: 0, backs: 2 });
      renderPanel();
      return true;
    }

    // ▶ or OK on a top row with something below it.
    async function enterRow(byRight) {
      if (!panel) return false;
      const row = panel.rows[panel.index];
      if (!row) return false;
      if (row.kind === "leanback") {
        panel.stack.push({ title: row.label, kind: "leanback", index: 0 });
        renderPanel();
        return true;
      }
      if (row.kind === "captionStyle") return openCaptionStyle();
      if (row.kind === "captions") return byRight ? drillInto(panel.vendor.captions, row.label) : toggleCaptions();
      if (row.kind !== "vendor") return false;
      const hit = panel.vendor[row.id];
      return hit ? drillInto(hit, row.label) : false;
    }

    // ◀ or Back: one level up. In the player's menu that is its own Back
    // button, as many times as the level went down; without one, the menu is
    // started over at its root.
    async function leaveSub() {
      const lvl = level();
      if (!lvl) return false;
      if (lvl.kind !== "vendor") {
        panel.stack.pop();
        refreshRows();
        return true;
      }
      let read = null;
      let pressed = 0;
      for (let i = 0; i < (lvl.backs || 1); i += 1) {
        const before = readVendorMenu();
        if (!pressVendorBack()) break;
        pressed += 1;
        read = await readAfter(before);
        if (!panel) return false;
      }
      if (pressed) {
        panel.stack.pop();
        return follow(read, null);
      }
      panel.stack = panel.stack.filter((l) => l.kind !== "vendor");
      closeVendorMenu();
      await wait(80);
      if (!panel) return false;
      panel.vendor = mapVendor(await openVendorRoot());
      refreshRows();
      return true;
    }

    // OK (or ▶, which never runs an action) in Leanback's own settings: an
    // on/off flips, a choice opens its values.
    function takeLeanback(lvl, byRight) {
      const entry = leanbackEntries(lvl)[lvl.index];
      if (!entry) return false;
      const row = Settings && Settings.rowOf(entry.id);
      lvl.armed = lvl.armed && entry.id === "forget";
      if (row && row.kind === "toggle") {
        saveSetting(row.id, !settings()[row.id]);
      } else if (row && row.kind === "choice") {
        const values = Settings.choicesOf(row, settings()[row.id]);
        panel.stack.push({ title: row.label, kind: "choice", row, values, index: Math.max(0, values.indexOf(settings()[row.id])) });
      } else if (!byRight && entry.id === "forget") {
        // Clearing cannot be undone, so it takes OK twice.
        if (lvl.armed) {
          lvl.armed = false;
          lvl.cleared = true;
          if (typeof o.onAction === "function") o.onAction("forget");
        } else lvl.armed = true;
      } else if (!byRight && entry.id === "disable") {
        saveSetting("enabled", false);
        return true;
      }
      renderPanel();
      return true;
    }

    // OK inside a submenu.
    async function takeSubItem(byRight) {
      const lvl = level();
      if (!lvl) return false;
      if (lvl.kind === "leanback") return takeLeanback(lvl, byRight);
      if (lvl.kind === "choice") {
        saveSetting(lvl.row.id, lvl.values[lvl.index]);
        panel.stack.pop();
        renderPanel();
        return true;
      }
      const it = lvl.items[lvl.index];
      if (!it) return false;
      if (byRight && it.kind !== "drill" && it.kind !== "expand") return true;
      if (it.kind === "drill") return drillInto(it, it.label);
      return follow(await clickVendor(it), it);
    }

    function takeRow(byRight) {
      if (!panel) return false;
      const row = panel.rows[panel.index];
      if (!row) return false;
      if (row.kind === "vendor" || row.kind === "leanback" || row.kind === "captions" || row.kind === "captionStyle") {
        enterRow(byRight);
        return true;
      }
      if (byRight) return true;
      if (row.kind === "action") {
        if (typeof o.onNext === "function") o.onNext();
        return true;
      }
      if (row.kind === "restart") {
        if (typeof o.onRestart === "function") o.onRestart();
        return true;
      }
      return false;
    }

    function movePanel(delta) {
      if (!panel) return false;
      const lvl = level();
      if (lvl) {
        const n = entriesOf(lvl).length;
        lvl.index = Math.min(n - 1, Math.max(0, lvl.index + delta));
        if (lvl.kind === "leanback") lvl.cleared = false;
        if (lvl.kind === "leanback" && leanbackEntries(lvl)[lvl.index].id !== "forget") lvl.armed = false;
      } else {
        panel.index = Math.min(panel.rows.length - 1, Math.max(0, panel.index + delta));
      }
      renderPanel();
      return true;
    }

    // A click on an entry (a mouse): as moving there and pressing OK.
    function pickEntry(i) {
      if (!panel) return;
      const lvl = level();
      if (lvl) {
        lvl.index = i;
        takeSubItem(false);
      } else {
        panel.index = i;
        takeRow(false);
      }
    }

    // -- the row's own focus ------------------------------------------------
    function focus(i) {
      const id = ids[Math.min(ids.length - 1, Math.max(0, i))];
      index = ids.indexOf(id);
      for (const key of ids) {
        if (key === id) buttons[key].dataset.tenfootCurrent = "true";
        else delete buttons[key].dataset.tenfootCurrent;
      }
      try {
        buttons[id].focus({ preventScroll: true });
      } catch (_err) { /* the stamp marks it either way */ }
      return buttons[id];
    }

    function toggleFullscreen() {
      try {
        if (doc.fullscreenElement) doc.exitFullscreen();
        else doc.documentElement.requestFullscreen();
      } catch (_err) {
        // Firefox refuses without a gesture, or without allowfullscreen on the
        // frame; the player's own button is the fallback.
        const b = qs(rules.fullscreenButton);
        if (b) {
          try {
            b.click();
          } catch (_err2) { /* nothing more to try */ }
        }
      }
      setTimeout(schedulePaint, 120);
    }

    function activate() {
      const id = ids[index];
      if (id === "playpause") {
        const v = getVideo();
        if (!v) return false;
        const resuming = v.paused || v.ended;
        // Tell content/player.js whose decision this was: the autoplay rescue
        // must never restart a video the viewer chose to stop.
        if (typeof o.onPlayback === "function") o.onPlayback(!resuming);
        if (resuming) {
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => { /* the next press tries again */ });
        } else {
          v.pause();
        }
        schedulePaint();
        return true;
      }
      if (id === "fullscreen") {
        toggleFullscreen();
        return true;
      }
      openPanel();
      return true;
    }

    // -- lifecycle ----------------------------------------------------------
    const onTimeUpdate = () => {
      holdPaused();
      schedulePaint();
    };
    const MEDIA_EVENTS = ["timeupdate", "progress", "play", "pause", "ended", "durationchange", "ratechange"];

    function bind(v) {
      if (!v) return;
      for (const ev of MEDIA_EVENTS) v.addEventListener(ev, onTimeUpdate);
    }
    function unbind(v) {
      if (!v) return;
      for (const ev of MEDIA_EVENTS) v.removeEventListener(ev, onTimeUpdate);
    }

    // The bar and the title for `ms`, without the selection: the keys stay
    // playback's. Opening the bar for real takes over from a peek. `reason`
    // ("pause", "seek") lets the caller end only the peek it started.
    function peek(ms, withBar, reason) {
      if (open || panel) return false;
      peekReason = reason || "";
      if (withBar && !peeking) {
        peeking = true;
        el.hidden = false;
        el.dataset.tenfootPeek = "true";
        for (const key of ids) delete buttons[key].dataset.tenfootCurrent;
        bind(getVideo());
        paint();
      }
      showTitle(0);
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = setTimeout(endPeek, ms);
      return true;
    }

    function endPeek(reason) {
      if (!peekTimer && !peeking) return;
      if (reason && reason !== peekReason) return;
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = 0;
      peekReason = "";
      if (peeking && !open) {
        el.hidden = true;
        unbind(getVideo());
      }
      peeking = false;
      delete el.dataset.tenfootPeek;
      hideTitle();
    }

    // A skip: the glyph and the time it landed on, and the bar for `ms`. Each
    // skip restarts the clock rather than hiding and showing again, so quick
    // presses hold everything steady instead of flickering.
    function seekFeedback(delta, at, ms, reason) {
      const dir = delta < 0 ? "rewind" : "forward";
      if (seekEl.dataset.tenfootDir !== dir) {
        seekEl.dataset.tenfootDir = dir;
        while (seekIcon.firstChild) seekIcon.removeChild(seekIcon.firstChild);
        seekIcon.appendChild(svgIcon(doc, dir));
      }
      seekTime.textContent = clock(at);
      seekEl.hidden = false;
      if (seekTimer) clearTimeout(seekTimer);
      seekTimer = setTimeout(() => {
        seekTimer = 0;
        seekEl.hidden = true;
      }, ms);
      if (open) schedulePaint();
      else peek(ms, true, reason);
      return true;
    }

    return Object.freeze({
      element: el,
      panel: panelEl,
      title: osd,
      seekIndicator: seekEl,
      seekFeedback,
      upNext: upEl,
      showUpNext,
      get upNextShown() { return !upEl.hidden; },
      get isOpen() { return open; },
      get peeking() { return peeking; },
      get titleShown() { return titleShown(); },
      setInfo,
      peek,
      endPeek,
      // The title alone, for a moment (a video starting).
      flashTitle(ms) {
        if (open || peeking || panel) return false;
        showTitle(ms);
        return true;
      },
      get panelOpen() { return Boolean(panel); },
      get currentId() { return panel ? `panel:${panel.index}` : ids[index]; },

      setStyle(s) {
        if (!s) return;
        for (const node of [el, panelEl]) {
          node.style.setProperty("--tenfoot-ring-color", s.ringColor || "#feea3b");
          node.style.setProperty("--tenfoot-ring-width", `${s.ringWidth || 4}px`);
        }
      },

      open() {
        if (open) return true;
        const wasPeeking = peeking;
        if (peekTimer) clearTimeout(peekTimer);
        peekTimer = 0;
        peeking = false;
        delete el.dataset.tenfootPeek;
        open = true;
        el.hidden = false;
        doc.documentElement.classList.add("tenfoot-transport-open");
        if (!wasPeeking) bind(getVideo());
        showTitle(0);
        focus(0);
        paint();
        return true;
      },

      close() {
        if (!open) return false;
        closePanel();
        open = false;
        el.hidden = true;
        doc.documentElement.classList.remove("tenfoot-transport-open");
        unbind(getVideo());
        hideTitle();
        if (typeof o.onClose === "function") o.onClose();
        return true;
      },

      // Every key the row understands. Anything it returns false for is left
      // to the caller, which is how ▼ reaches the page below.
      dispatch(action) {
        if (!open) return false;
        // Our own key, on its way back from the player. Absorbed, not declined:
        // declining hands it to content/player.js, which would read it as back
        // pressed twice and close the whole row.
        if (echoing) return true;
        if (panel) {
          const lvl = level();
          switch (action) {
            case "up": return movePanel(-1);
            case "down": return movePanel(1);
            case "select":
              if (lvl) takeSubItem(false);
              else takeRow(false);
              return true;
            case "right":
              // ▶ opens what has something below it, and flips an on/off of
              // Leanback's; it never runs an action.
              if (lvl) takeSubItem(true);
              else takeRow(true);
              return true;
            case "left":
            case "back":
              // ◀ and Back leave the submenu, one level at a time; at the top,
              // either one closes the panel.
              if (lvl) {
                leaveSub();
                return true;
              }
              return closePanel();
            default: return false;
          }
        }
        switch (action) {
          case "left": focus(index - 1); return true;
          case "right": focus(index + 1); return true;
          case "select": return activate();
          case "up":
          case "back": this.close(); return true;
          default: return false;
        }
      },

      // The options button goes straight here: the row opens and the panel with
      // it, so one press reaches the settings from anywhere in playback.
      openSettings() {
        this.open();
        if (!panel) openPanel();
        return true;
      },

      refresh() {
        if (open) schedulePaint();
      },

      destroy() {
        for (const t of [peekTimer, titleTimer, seekTimer]) if (t) clearTimeout(t);
        peekTimer = 0;
        titleTimer = 0;
        seekTimer = 0;
        unbind(getVideo());
        el.remove();
        osd.remove();
        seekEl.remove();
        upEl.remove();
        view.destroy();
        open = false;
        panel = null;
        doc.documentElement.classList.remove("tenfoot-transport-open");
        doc.documentElement.classList.remove("tenfoot-settings-open");
      }
    });
  }

  globalThis.TenfootTransport = Object.freeze({ createTransport, clock });
})();
