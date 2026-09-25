// Leanback for Dropout — the transport bar.
//
// Drawn by the extension, not borrowed from the player. Every round of fighting
// Vimeo's own control bar came from the same place: hashed class names, its
// idle-hide timer, its popover living *inside* the bar while its overlay play
// button lives outside it, and a keep-list that had to be re-derived whenever
// Vimeo shipped. This draws the row instead, and drives the <video> directly.
//
//   [ play/pause | position (display only) | CC | settings | fullscreen ]
//
// Position is deliberately not a stop on the row: ◀ ▶ seek whenever the row is
// not holding a button, which is the rule the rest of the extension follows.
//
// The two panels are the one place the player is still asked anything. Captions
// and quality are the player's to know, so the panels *proxy* its menus: open
// the real menu out of sight, read its entries, draw them in our own UI, and
// click the original when one is taken. Nothing about how Vimeo lays its menu
// out reaches the screen. Captions fall back to the video's own TextTracks when
// the menu cannot be read.
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
      if (icon === "CC") {
        const t = doc.createElement("span");
        t.className = "tenfoot-tc-cc";
        t.textContent = "CC";
        b.appendChild(t);
      } else {
        b.appendChild(svgIcon(doc, icon));
      }
      buttons[id] = b;
      return b;
    }

    row.appendChild(makeButton("playpause", "Play or pause", "play"));

    // Position: shown, never selected. ◀ ▶ seek whenever the row is not
    // holding a button, so there is nothing here to walk onto.
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
    const time = doc.createElement("p");
    time.className = "tenfoot-scrub-time";
    time.textContent = "0:00 / 0:00";
    scrub.append(track, time);
    row.appendChild(scrub);

    // Captions live in the settings panel: one button, one panel. A separate
    // CC button opened the same list, which is one control too many on a row
    // walked with arrows.
    row.appendChild(makeButton("settings", "Settings", "gear"));
    row.appendChild(makeButton("fullscreen", "Full screen", "fullscreen"));

    doc.documentElement.appendChild(el);

    // -- the settings panel -------------------------------------------------
    // Full height, flown in from the right, and its own element rather than a
    // sheet under the row: a menu that opened below the bar was the thing to
    // read last and the thing you were pointing at first.
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
      time.textContent = `${clock(cur)} / ${clock(dur)}`;
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
    // ever on screen.
    function readVendorMenu() {
      const menu = qs(rules.menu);
      if (!menu) return null;
      const body = qs(rules.menuPanel, menu) || menu;
      const nodes = qsa(rules.menuItem, body);
      if (!nodes.length) return null;
      return nodes.map((node) => {
        const texts = qsa(rules.menuText, node)
          .map((t) => (t.textContent || "").trim())
          .filter(Boolean);
        const label = texts[0] || (node.getAttribute("aria-label") || "").trim() || (node.textContent || "").trim();
        return {
          label: label.slice(0, 60),
          value: (texts[1] || "").slice(0, 30),
          checked: node.getAttribute("aria-checked") === "true",
          node
        };
      }).filter((it) => it.label);
    }

    function wait(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    async function openVendorRoot() {
      if (typeof o.wake === "function") o.wake();
      // The button is a toggle. Pressing it while the menu is already open
      // shut it, the read came back empty, and the Quality row disappeared
      // until the panel was opened again.
      const already = readVendorMenu();
      if (already) return already;
      const button = qs(rules.prefsButton);
      if (!button) return null;
      try {
        button.click();
      } catch (_err) {
        return null;
      }
      const deadline = Date.now() + VENDOR_MENU_TIMEOUT_MS;
      for (;;) {
        const items = readVendorMenu();
        if (items) return items;
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
    // Fixed order, as asked for. Vendor rows take their value and their
    // submenu from the player; the rest are Leanback's own.
    const ROWS = [
      // Verified against the live player, 2026-09-24: the settings popover holds
      // exactly three entries — Quality, Speed and CC/subtitles — and each opens
      // a submenu. Caption font, background and window live *inside*
      // CC/subtitles, not beside it, so they are reached by opening that row
      // rather than by rows of their own.
      { id: "quality", label: "Quality", kind: "vendor", match: /quality|resolution/i },
      { id: "speed", label: "Speed", kind: "vendor", match: /speed|rate/i },
      { id: "seekStep", label: "Seek Step", kind: "choice", setting: "seekStep",
        values: () => (Settings && Settings.SEEK_STEPS) || [10], show: (v) => `${v}s` },
      // Not a toggle: it takes you to the next episode. Whether one plays by
      // itself at the end is a Leanback setting, and lives in that submenu.
      { id: "next", label: "Play Next Episode", kind: "action" },
      { id: "hintBar", label: "Button Hints", kind: "toggle", setting: "hintBar" },
      // The player's own captions entry. Turning captions on by setting a
      // TextTrack's mode drew nothing — the player keeps its own state — so this
      // opens its menu instead, which is also where the caption appearance
      // options are.
      { id: "captions", label: "Closed Captions", kind: "vendor", match: /cc|subtitle|caption/i },
      { id: "leanback", label: "Leanback Settings", kind: "leanback" }
    ];

    // Leanback's own settings, as a submenu of the panel. The options button
    // reaches these from anywhere; during playback they sit under the player's.
    const LEANBACK_ROWS = [
      { id: "theater", label: "Theater Layout", kind: "choice", setting: "theater",
        values: () => ["auto", "manual", "off"], show: (v) => ({ auto: "Automatic", manual: "Manual", off: "Off" })[v] || String(v) },
      { id: "playerChrome", label: "Player Controls", kind: "choice", setting: "playerChrome",
        values: () => ["leanback", "site"], show: (v) => (v === "site" ? "The Site's Own" : "Leanback's") },
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
      { id: "exitHook", label: "Back On Browse", kind: "choice", setting: "exitHook",
        values: () => ["none", "close-tab"], show: (v) => (v === "close-tab" ? "Closes The Tab" : "Does Nothing") }
    ];

    function visibleRows() {
      return ROWS.filter((r) => {
        // A vendor row exists only if the player reported something to put in
        // it, so a menu that changes shape cannot leave a dead row behind.
        if (r.kind === "vendor") return Boolean(panel && panel.vendor && panel.vendor[r.id]);
        if (r.kind === "action") return Boolean(nextEpisode());
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
      if (r.kind === "leanback") return "";
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

    // -- panel rendering ----------------------------------------------------
    function renderPanel() {
      while (panelList.firstChild) panelList.removeChild(panelList.firstChild);
      if (!panel) return;
      const sub = panel.sub;
      panelTitle.textContent = sub ? sub.title : "Settings";
      const entries = sub
        ? (sub.kind === "leanback"
          ? sub.items.map((r) => ({ label: r.label, value: settingText(r), checked: false, arrow: false }))
          : sub.items.map((it) => ({ label: it.label, value: "", checked: it.checked, arrow: false })))
        : panel.rows.map((r) => ({
          label: r.label,
          value: rowValue(r),
          checked: false,
          arrow: r.kind === "vendor" || r.kind === "leanback"
        }));
      const index = sub ? sub.index : panel.index;
      entries.forEach((entry, i) => {
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
        val.textContent = entry.value;
        b.appendChild(val);
        const mark = doc.createElement("span");
        mark.className = "tenfoot-settings-mark";
        if (entry.checked) mark.appendChild(svgIcon(doc, "check"));
        else if (entry.arrow) mark.appendChild(svgIcon(doc, "chevron"));
        b.appendChild(mark);
        panelList.appendChild(b);
      });
      const cur = panelList.children[index];
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
      // One retry: the player's menu can be busy at the moment the panel opens —
      // something else driving it, a re-render mid-click — and a read that came
      // back empty used to drop Quality, Speed and Closed Captions for the whole
      // life of the panel, leaving only Leanback's own rows behind.
      let items = await openVendorRoot();
      if (!items || !items.length) {
        await wait(220);
        items = await openVendorRoot();
      }
      panel = { vendor: mapVendor(items), rows: [], index: 0, sub: null, resume: wasPlaying };
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

    // ▶ enters a submenu, ◀ leaves it.
    async function enterRow() {
      if (!panel) return false;
      const row = panel.rows[panel.index];
      if (!row) return false;
      if (row.kind === "leanback") {
        panel.sub = { title: row.label, kind: "leanback", items: LEANBACK_ROWS.slice(), index: 0, row };
        renderPanel();
        return true;
      }
      if (row.kind !== "vendor") return false;
      const hit = panel.vendor[row.id];
      if (!hit) return false;
      try {
        hit.node.click();
      } catch (_err) {
        return false;
      }
      await wait(160);
      const items = readVendorMenu();
      if (!items || !items.length) return false;
      panel.sub = { title: row.label, kind: "vendor", items, index: Math.max(0, items.findIndex((i) => i.checked)), row };
      renderPanel();
      return true;
    }

    async function leaveSub() {
      if (!panel || !panel.sub) return false;
      const wasVendor = panel.sub.kind === "vendor";
      panel.sub = null;
      if (!wasVendor) {
        refreshRows();
        return true;
      }
      // Re-open the player's menu at its root, so the values shown are current.
      closeVendorMenu();
      await wait(80);
      panel.vendor = mapVendor(await openVendorRoot());
      refreshRows();
      return true;
    }

    function stepSub(delta) {
      if (!panel || !panel.sub || panel.sub.kind !== "leanback") return false;
      const r = panel.sub.items[panel.sub.index];
      if (!r) return false;
      if (r.kind === "toggle") {
        if (delta === 0) saveSetting(r.setting, !settings()[r.setting]);
        else return false;
      } else if (r.kind === "choice") {
        const values = r.values();
        const at = values.indexOf(settings()[r.setting]);
        const step = delta === 0 ? 1 : delta;
        const next = values[Math.min(values.length - 1, Math.max(0, (at < 0 ? 0 : at) + step))];
        if (next === undefined) return true;
        saveSetting(r.setting, next);
      }
      renderPanel();
      return true;
    }

    async function takeSubItem() {
      if (!panel || !panel.sub) return false;
      if (panel.sub.kind === "leanback") return stepSub(0);
      const it = panel.sub.items[panel.sub.index];
      if (!it) return false;
      try {
        it.node.click();
      } catch (_err) { /* fall through and re-read anyway */ }
      await wait(200);
      return leaveSub();
    }

    function stepRow(delta) {
      if (!panel) return false;
      const row = panel.rows[panel.index];
      if (!row || row.kind !== "choice") return false;
      const values = row.values();
      const at = values.indexOf(settings()[row.setting]);
      const next = values[Math.min(values.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta))];
      if (next === undefined) return true;
      saveSetting(row.setting, next);
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
      if (row.kind === "choice") return stepRow(1);
      if (row.kind === "action") {
        if (typeof o.onNext === "function") o.onNext();
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
      if (panel.sub) {
        const n = panel.sub.items.length;
        panel.sub.index = Math.min(n - 1, Math.max(0, panel.sub.index + delta));
      } else {
        const n = panel.rows.length;
        panel.index = Math.min(n - 1, Math.max(0, panel.index + delta));
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
          switch (action) {
            case "up": return movePanel(-1);
            case "down": return movePanel(1);
            case "select": return panel.sub ? (takeSubItem(), true) : takeRow();
            case "right": {
              // ▶ enters a submenu. A row that has no submenu steps its value
              // instead — there is nothing below it to go into.
              if (panel.sub) {
                stepSub(1);
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
              // ◀ always means "leave this submenu" — one rule, whichever kind
              // of submenu it is. Values are stepped with ▶ and with OK.
              if (panel.sub) {
                leaveSub();
                return true;
              }
              return stepRow(-1) || true;
            case "back":
              if (panel.sub) {
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
