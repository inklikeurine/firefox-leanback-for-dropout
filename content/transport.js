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
  const PANEL_SLIDE_MS = 250;

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
    let hideTimer = 0;
    let panel = null; // { kind, items, index, depth, vendor }
    let raf = 0;

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

    // -- the settings panel -------------------------------------------------
    // Full height, flown in from the right, and its own element rather than a
    // sheet under the row.
    const panelEl = doc.createElement("aside");
    panelEl.className = "tenfoot-settings";
    panelEl.hidden = true;
    panelEl.setAttribute("role", "menu");
    panelEl.setAttribute("aria-label", "Settings");
    const panelTitle = doc.createElement("p");
    panelTitle.className = "tenfoot-settings-title";
    panelTitle.textContent = "Settings";
    const panelList = doc.createElement("div");
    panelList.className = "tenfoot-settings-list";
    panelEl.append(panelTitle, panelList);
    doc.documentElement.appendChild(panelEl);

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
      if (raf || !open) return;
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
    // background, window) lives inside CC/subtitles.
    const ROWS = [
      // Only after the video picked up where it was left: back to 0:00.
      { id: "restart", label: "Start Over", kind: "restart" },
      { id: "quality", label: "Quality", kind: "vendor", match: /quality|resolution/i },
      { id: "speed", label: "Speed", kind: "vendor", match: /speed|rate/i },
      // Not a toggle: it takes you to the next episode. Whether one plays by
      // itself at the end is a Leanback setting, and lives in that submenu.
      { id: "next", label: "Play Next Episode", kind: "action" },
      // Captions are the player's: setting a TextTrack's mode draws nothing,
      // because the player keeps its own state.
      { id: "captions", label: "Closed Captions", kind: "vendor", match: /cc|subtitle|caption/i },
      { id: "leanback", label: "Leanback Settings", kind: "leanback" }
    ];

    // Leanback's own settings, as a submenu of the panel.
    const LEANBACK_ROWS = [
      { id: "theater", label: "Theater Layout", kind: "choice", setting: "theater",
        values: () => ["auto", "manual", "off"], show: (v) => ({ auto: "Automatic", manual: "Manual", off: "Off" })[v] || String(v) },
      { id: "autoplayNext", label: "Autoplay Next Episode", kind: "toggle", setting: "autoplayNext" },
      { id: "startMuted", label: "Start Videos Muted", kind: "toggle", setting: "startMuted" },
      { id: "hintBar", label: "Button Hints", kind: "toggle", setting: "hintBar" },
      { id: "seekStep", label: "Seek Step", kind: "choice", setting: "seekStep",
        values: () => (Settings && Settings.SEEK_STEPS) || [10], show: (v) => `${v}s` },
      { id: "focusZoom", label: "Selected Item Zoom", kind: "choice", setting: "focusZoom",
        values: () => [0, 3, 5, 8, 10, 15, 20, 25], show: (v) => `${v}%` },
      { id: "ringWidth", label: "Selection Outline", kind: "choice", setting: "ringWidth",
        values: () => [2, 3, 4, 6, 8, 10, 12], show: (v) => `${v}px` },
      { id: "skipMarketingSite", label: "Skip Marketing Site", kind: "toggle", setting: "skipMarketingSite" },
      { id: "exitHook", label: "Back On Home", kind: "choice", setting: "exitHook",
        values: () => ["none", "close-tab"], show: (v) => (v === "close-tab" ? "Closes The Tab" : "Does Nothing") }
    ];

    function visibleRows() {
      return ROWS.filter((r) => {
        // A vendor row exists only if the player reported something to put in
        // it, so a menu that changes shape cannot leave a dead row behind.
        if (r.kind === "vendor") return Boolean(panel && panel.vendor && panel.vendor[r.id]);
        if (r.kind === "action") return Boolean(nextEpisode());
        if (r.kind === "restart") return typeof o.resumed === "function" && Boolean(o.resumed());
        return true;
      });
    }

    function settingText(r) {
      if (r.kind === "toggle") return settings()[r.setting] ? "On" : "Off";
      if (r.kind === "choice") return r.show(settings()[r.setting]);
      return "";
    }

    function rowValue(r) {
      if (r.kind === "toggle" || r.kind === "choice") return settingText(r);
      if (r.kind === "action") {
        const n = nextEpisode();
        return n && n.title ? n.title : "";
      }
      if (r.kind === "vendor") {
        const hit = panel && panel.vendor ? panel.vendor[r.id] : null;
        return hit ? hit.value : "";
      }
      return "";
    }

    function mapVendor(items) {
      const found = {};
      for (const r of ROWS) {
        if (r.kind !== "vendor") continue;
        const hit = (items || []).find((it) => r.match.test(it.label));
        if (hit) found[r.id] = hit;
      }
      return found;
    }

    // ▶ steps one value on and stops at the last; OK goes round, so every
    // value is reachable with OK alone.
    function nextValue(r, delta) {
      const values = r.values();
      const at = Math.max(0, values.indexOf(settings()[r.setting]));
      if (delta === 0) return values[(at + 1) % values.length];
      return values[Math.min(values.length - 1, Math.max(0, at + delta))];
    }

    // -- panel rendering ----------------------------------------------------
    // The panel is the top-level rows plus a stack of submenus: Leanback's own
    // settings, or as many levels of the player's menu as it has.
    let itemButtons = [];
    const level = () => (panel && panel.stack.length ? panel.stack[panel.stack.length - 1] : null);
    const firstChecked = (items) => Math.max(0, items.findIndex((i) => i.checked));

    function entriesOf(lvl) {
      if (!lvl) {
        return panel.rows.map((r) => ({
          label: r.label,
          value: rowValue(r),
          arrow: r.kind === "vendor" || r.kind === "leanback"
        }));
      }
      if (lvl.kind === "leanback") return lvl.items.map((r) => ({ label: r.label, value: settingText(r) }));
      return lvl.items.map((it) => ({
        label: it.label,
        value: it.value,
        checked: it.kind === "option" && it.checked,
        arrow: it.kind === "drill" || it.kind === "expand",
        group: it.group
      }));
    }

    function renderPanel() {
      while (panelList.firstChild) panelList.removeChild(panelList.firstChild);
      itemButtons = [];
      if (!panel) return;
      const lvl = level();
      panelTitle.textContent = lvl ? lvl.title : "Settings";
      const index = lvl ? lvl.index : panel.index;
      let group = "";
      entriesOf(lvl).forEach((entry, i) => {
        // A heading wherever a new group of options starts, so a run of
        // colours, sizes and opacities says which is which.
        if (entry.group && entry.group !== group) {
          const h = doc.createElement("p");
          h.className = "tenfoot-settings-group";
          h.textContent = entry.group;
          panelList.appendChild(h);
        }
        group = entry.group || "";
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "tenfoot-settings-item";
        b.setAttribute("role", "menuitem");
        b.dataset.tenfootSettingsItem = String(i);
        if (i === index) b.dataset.tenfootCurrent = "true";
        const label = doc.createElement("span");
        label.className = "tenfoot-settings-label";
        label.textContent = entry.label;
        b.appendChild(label);
        const val = doc.createElement("span");
        val.className = "tenfoot-settings-value";
        val.textContent = entry.value || "";
        b.appendChild(val);
        const mark = doc.createElement("span");
        mark.className = "tenfoot-settings-mark";
        if (entry.checked) mark.appendChild(svgIcon(doc, "check"));
        else if (entry.arrow) mark.appendChild(svgIcon(doc, "chevron"));
        b.appendChild(mark);
        panelList.appendChild(b);
        itemButtons.push(b);
      });
      const cur = itemButtons[index];
      if (cur) {
        try {
          cur.focus({ preventScroll: true });
        } catch (_err) { /* the stamp marks it either way */ }
      }
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
      panelEl.hidden = false;
      // Commit the off-screen start state before asking for the end state, or
      // the panel simply appears. Reading a layout property is what forces it.
      void panelEl.offsetWidth;
      doc.documentElement.classList.add("tenfoot-settings-open");
      renderPanel();
      schedulePaint();
      return true;
    }

    function closePanel() {
      if (!panel) return false;
      const resume = panel.resume;
      panel = null;
      // Let it roll back out before it goes away.
      doc.documentElement.classList.remove("tenfoot-settings-open");
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = 0;
        if (!panel) {
          panelEl.hidden = true;
          while (panelList.firstChild) panelList.removeChild(panelList.firstChild);
        }
      }, PANEL_SLIDE_MS);
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
      panel.stack.push({ title: read.title, vendorTitle: read.title, kind: "vendor", items: read.items, index: firstChecked(read.items) });
      renderPanel();
      return true;
    }

    async function drillInto(item, title) {
      const before = readVendorMenu();
      try {
        item.node.click();
      } catch (_err) {
        return false;
      }
      const read = await readAfter(before);
      if (!panel || !read) return false;
      panel.stack.push({ title, vendorTitle: read.title, kind: "vendor", items: read.items, index: firstChecked(read.items) });
      renderPanel();
      return true;
    }

    // ▶ or OK on a row with a submenu.
    async function enterRow() {
      if (!panel) return false;
      const row = panel.rows[panel.index];
      if (!row) return false;
      if (row.kind === "leanback") {
        panel.stack.push({ title: row.label, kind: "leanback", items: LEANBACK_ROWS.slice(), index: 0 });
        renderPanel();
        return true;
      }
      if (row.kind !== "vendor") return false;
      const hit = panel.vendor[row.id];
      return hit ? drillInto(hit, row.label) : false;
    }

    // ◀ or Back: one level up. In the player's menu that is its own Back
    // button; without one, the menu is started over at its root.
    async function leaveSub() {
      const lvl = level();
      if (!lvl) return false;
      if (lvl.kind === "leanback") {
        panel.stack.pop();
        refreshRows();
        return true;
      }
      const before = readVendorMenu();
      if (pressVendorBack()) {
        const read = await readAfter(before);
        if (!panel) return false;
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

    function stepSub(delta) {
      const lvl = level();
      if (!lvl || lvl.kind !== "leanback") return false;
      const r = lvl.items[lvl.index];
      if (!r) return false;
      if (r.kind === "toggle") {
        if (delta !== 0) return false;
        saveSetting(r.setting, !settings()[r.setting]);
      } else if (r.kind === "choice") {
        saveSetting(r.setting, nextValue(r, delta));
      }
      renderPanel();
      return true;
    }

    // OK inside a submenu.
    async function takeSubItem() {
      const lvl = level();
      if (!lvl) return false;
      if (lvl.kind === "leanback") return stepSub(0);
      const it = lvl.items[lvl.index];
      if (!it) return false;
      if (it.kind === "drill") return drillInto(it, it.label);
      const before = readVendorMenu();
      try {
        it.node.click();
      } catch (_err) { /* re-read anyway */ }
      return follow(await readAfter(before), it);
    }

    function stepRow(delta) {
      if (!panel) return false;
      const row = panel.rows[panel.index];
      if (!row || row.kind !== "choice") return false;
      saveSetting(row.setting, nextValue(row, delta));
      renderPanel();
      return true;
    }

    function takeRow() {
      if (!panel) return false;
      const row = panel.rows[panel.index];
      if (!row) return false;
      if (row.kind === "toggle") {
        saveSetting(row.setting, !settings()[row.setting]);
        renderPanel();
        return true;
      }
      if (row.kind === "choice") return stepRow(0);
      if (row.kind === "action") {
        if (typeof o.onNext === "function") o.onNext();
        return true;
      }
      if (row.kind === "restart") {
        if (typeof o.onRestart === "function") o.onRestart();
        return true;
      }
      if (row.kind === "vendor" || row.kind === "leanback") {
        enterRow();
        return true;
      }
      return false;
    }

    function movePanel(delta) {
      if (!panel) return false;
      const lvl = level();
      if (lvl) {
        lvl.index = Math.min(lvl.items.length - 1, Math.max(0, lvl.index + delta));
      } else {
        panel.index = Math.min(panel.rows.length - 1, Math.max(0, panel.index + delta));
      }
      renderPanel();
      return true;
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

    return Object.freeze({
      element: el,
      panel: panelEl,
      get isOpen() { return open; },
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
        open = true;
        el.hidden = false;
        doc.documentElement.classList.add("tenfoot-transport-open");
        bind(getVideo());
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
            case "select": return lvl ? (takeSubItem(), true) : takeRow();
            case "right": {
              // ▶ goes into whatever has something below it; on a Leanback
              // value it steps the value on.
              if (lvl && lvl.kind === "leanback") {
                stepSub(1);
                return true;
              }
              if (lvl) {
                const it = lvl.items[lvl.index];
                if (it && (it.kind === "drill" || it.kind === "expand")) takeSubItem();
                return true;
              }
              const row = panel.rows[panel.index];
              if (row && (row.kind === "vendor" || row.kind === "leanback")) {
                enterRow();
                return true;
              }
              stepRow(1);
              return true;
            }
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
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = 0;
        unbind(getVideo());
        el.remove();
        panelEl.remove();
        open = false;
        panel = null;
        doc.documentElement.classList.remove("tenfoot-transport-open");
        doc.documentElement.classList.remove("tenfoot-settings-open");
      }
    });
  }

  globalThis.TenfootTransport = Object.freeze({ createTransport, clock });
})();
