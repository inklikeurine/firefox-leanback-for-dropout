// Leanback for Dropout — Leanback's own settings as a menu: the one list
// (lib/settings.js → ROWS, under its groups' headings), with Theme This Page
// at the head of Look where the page has choices of its own, then
// Accessibility (a menu of its own) and Clear Continue Watching. The toolbar
// button turns Leanback off. The same menu on a page (content/page.js) and in
// the playback panel (content/transport.js), so its entries, order, words and
// keys are the same everywhere. Logic only: the owner draws view() with
// nav/panel.js and hands it the keys.
//
// ▲ ▼ move. OK (or ▶, which never runs an action) takes an entry: an on/off
// flips, a choice opens its values, where OK picks one (ticked) and goes back
// up, a menu opens its entries. Moving through the values of a choice about
// the look shows each at once (preview); Back leaves it as it was. Clearing
// cannot be undone, so it takes OK twice. ◀ or Back go back up a level; from
// the top they are the owner's to handle (key() says "out").
//
// Remote Buttons (in Accessibility): the jobs a button can be taught, each
// with the buttons that do it. OK on a job lists them (OK on one removes it)
// and *Teach a button*, which waits for a press: the owner hands that press
// over raw (learnKey(event)) while learning() is true. Leanback names it and
// asks *Use this button* / *Try again*. Back cancels at every step. *Reset
// Buttons* takes OK twice.

(function () {
  const Settings = () => globalThis.TenfootSettings;
  const MENUS = { accessibility: "Accessibility" };
  const Keys = () => globalThis.TenfootKeymap;
  const BUTTONS_ENTRY = { id: "buttons", label: "Remote Buttons", kind: "drill", group: "Remote" };
  // Why a pressed button can't be taught, in the viewer's words.
  const REFUSED = {
    modifier: "Press one button on its own.",
    typing: "Keys that type can't be taught. Try another button.",
    system: "That button belongs to the system. Try another.",
    unknown: "That button sends nothing Leanback can tell apart. Try another."
  };

  /**
   * @param {{
   *   settings: () => object,       // the current settings
   *   save: (patch: object) => void,
   *   onClear: () => void,          // Clear Continue Watching, confirmed
   *   showCleared?: boolean,        // the entry reads "Cleared" after a clear, until the next move
   *   pageLook?: () => ({key: string, title: string}|null), // Theme This Page: the page's kind of look, or none
   *   preview?: (patch: object|null) => void, // a look shown before it is picked; null: as saved
   *   cookies?: () => (() => void)|null // Cookie Preferences: what opens them on this page, or none
   * }} opts
   */
  function create(opts) {
    const o = opts || {};
    const settings = () => (typeof o.settings === "function" && o.settings()) || {};
    let levels = [];
    let armed = false;
    let cleared = false;
    let resetArmed = false;

    function level() {
      return levels[levels.length - 1] || null;
    }

    function preview(patch) {
      if (typeof o.preview === "function") o.preview(patch);
    }

    function cookies() {
      return typeof o.cookies === "function" ? o.cookies() : null;
    }

    function pageLook() {
      const p = typeof o.pageLook === "function" ? o.pageLook() : null;
      return p && Settings().PAGE_LOOKS[p.key] ? p : null;
    }

    function rowEntry(r, s) {
      return r.kind === "toggle"
        ? { id: r.id, label: r.label, kind: "toggle", group: r.group, on: Boolean(s[r.id]) }
        : { id: r.id, label: r.label, kind: "choice", group: r.group, value: Settings().valueText(r, s[r.id]) };
    }

    // The top level: the settings, Theme This Page first under Look, then the
    // menus and Clear Continue Watching.
    function entries() {
      const S = Settings();
      const s = settings();
      const list = [];
      const look = pageLook();
      for (const r of S.ROWS) {
        if (r.panel === false || r.menu) continue;
        if (look && r.group === "Look" && !list.some((e) => e.id === "look")) {
          list.push({ id: "look", label: "Theme This Page", kind: "drill", group: "Look", value: look.title });
        }
        list.push(rowEntry(r, s));
      }
      for (const [id, label] of Object.entries(MENUS)) list.push({ id: `menu:${id}`, label, kind: "drill", separator: true });
      if (cookies()) list.push({ id: "cookies", label: "Cookie Preferences", kind: "action", separator: true });
      list.push({ id: "forget", label: "Clear Continue Watching", kind: "action", value: armed ? "OK again to clear" : cleared ? "Cleared" : "", separator: true });
      return list;
    }

    function menuRows(id) {
      return Settings().ROWS.filter((r) => r.menu === id && r.panel !== false);
    }

    // Remote Buttons ------------------------------------------------------

    function learned() {
      const b = settings().buttons;
      return b && typeof b === "object" ? b : {};
    }

    function jobOf(id) {
      return Settings().BUTTON_JOBS.find((j) => j.id === id) || null;
    }

    function jobLabel(id) {
      const j = jobOf(id);
      return j ? j.label : id;
    }

    // The buttons taught for a job, as their keys.
    function keysFor(job) {
      return Object.keys(learned()).filter((k) => learned()[k] === job);
    }

    function buttonsList() {
      const list = Settings().BUTTON_JOBS.map((j) => ({
        id: `job:${j.id}`, label: j.label, kind: "drill",
        group: j.own ? "The remote's own buttons" : "Jobs for spare buttons",
        value: keysFor(j.id).map((k) => Keys().keyName(k)).join(", ")
      }));
      list.push({ id: "reset", label: "Reset Buttons", kind: "action", value: resetArmed ? "OK again to reset" : "", separator: true });
      return list;
    }

    function jobList(job) {
      return [{ id: "teach", label: "Teach a button", kind: "action" }]
        .concat(keysFor(job).map((k) => ({ id: `remove:${k}`, label: `Remove ${Keys().keyName(k)}`, kind: "action" })));
    }

    function saveButtons(next) {
      o.save({ buttons: next });
    }

    /** Waiting for a button to be pressed: the owner hands presses to learnKey(). */
    function learning() {
      const l = level();
      return Boolean(l && l.kind === "learn");
    }

    /**
     * A key press while learning. True when it was taken (draw view() again);
     * false for Back (Escape or BrowserBack), which the owner handles as Back.
     */
    function learnKey(event) {
      const l = level();
      if (!l || l.kind !== "learn" || !event) return false;
      if (event.key === "Escape" || event.key === "BrowserBack") return false;
      if (event.repeat) return true;
      const r = Keys().learnable(event, learned());
      if (!r.ok) {
        if (r.reason === "builtin" || r.reason === "taught") {
          l.note = `That button is already ${jobLabel(r.action)}.${r.reason === "taught" ? " Remove it there first." : ""}`;
        } else l.note = REFUSED[r.reason] || REFUSED.unknown;
        return true;
      }
      levels.push({ kind: "confirm", job: l.job, key: r.id, name: r.name, index: 0 });
      return true;
    }

    function takeButtons(l) {
      if (l.kind === "buttons") {
        const e = buttonsList()[l.index];
        if (!e) return true;
        if (e.id === "reset") {
          if (resetArmed) {
            resetArmed = false;
            saveButtons({});
          } else resetArmed = true;
          return true;
        }
        levels.push({ kind: "job", job: e.id.slice(4), index: 0 });
        return true;
      }
      if (l.kind === "job") {
        const e = jobList(l.job)[l.index];
        if (!e) return true;
        if (e.id === "teach") {
          levels.push({ kind: "learn", job: l.job, index: 0, note: "" });
          return true;
        }
        const next = Object.assign({}, learned());
        delete next[e.id.slice(7)];
        saveButtons(next);
        l.index = 0;
        return true;
      }
      if (l.kind === "confirm") {
        if (l.index === 0) {
          saveButtons(Object.assign({}, learned(), { [l.key]: l.job }));
          levels.splice(-2, 2); // back to the job, which now lists it
        } else {
          levels.pop();
          const w = level();
          if (w && w.kind === "learn") w.note = "";
        }
        return true;
      }
      return true; // learning: only a button press answers
    }

    // Theme This Page's options for the page, as rows of the menu.
    function lookRows(look) {
      return Settings().PAGE_LOOKS[look.key].options.map((opt) => Object.assign({ kind: "choice", group: "" }, opt));
    }

    function lookPatch(look, id, value) {
      const all = Object.assign({}, settings().pageLooks || {});
      all[look.key] = Object.assign({}, all[look.key] || {}, { [id]: value });
      return { pageLooks: all };
    }

    // The entries of a level that lists rows: the top, a menu, Theme This Page.
    function listOf(l) {
      const s = settings();
      if (l.kind === "menu") {
        const list = menuRows(l.menu).map((r) => rowEntry(r, s));
        if (l.menu === "accessibility") {
          // Remote Buttons: under Remote, else after Display.
          let at = -1;
          list.forEach((e, i) => { if (e.group === "Remote") at = i; });
          if (at < 0) list.forEach((e, i) => { if (e.group === "Display") at = i; });
          list.splice(at + 1, 0, Object.assign({}, BUTTONS_ENTRY));
        }
        return list;
      }
      if (l.kind === "look") {
        const now = (s.pageLooks || {})[l.look.key] || {};
        return lookRows(l.look).map((r) => ({ id: r.id, label: r.label, kind: "choice", value: Settings().valueText(r, now[r.id]) }));
      }
      return entries();
    }

    /** The level on show, for nav/panel.js render(). */
    function view() {
      const l = level();
      if (l && l.kind === "choice") {
        return {
          title: l.row.label,
          index: l.index,
          entries: l.values.map((v) => ({ id: String(v), label: Settings().valueText(l.row, v), kind: "option", checked: v === l.current }))
        };
      }
      if (l && l.kind === "menu") return { title: MENUS[l.menu], index: l.index, entries: listOf(l) };
      if (l && l.kind === "buttons") return { title: "Remote Buttons", index: l.index, entries: buttonsList() };
      if (l && l.kind === "job") return { title: jobLabel(l.job), index: l.index, entries: jobList(l.job) };
      if (l && l.kind === "learn") {
        return {
          title: `Teach a button: ${jobLabel(l.job)}`,
          index: 0,
          entries: [{ id: "waiting", label: l.note || "Press the button you want", kind: "info", value: "Back cancels" }]
        };
      }
      if (l && l.kind === "confirm") {
        return {
          title: `${l.name} for ${jobLabel(l.job)}?`,
          index: l.index,
          entries: [{ id: "use", label: "Use this button", kind: "action" }, { id: "again", label: "Try again", kind: "action" }]
        };
      }
      if (l && l.kind === "look") return { title: `Theme This Page: ${l.look.title}`, index: l.index, entries: listOf(l) };
      return { title: "Leanback Settings", index: l ? l.index : 0, entries: entries() };
    }

    function open() {
      levels = [{ kind: "top", index: 0 }];
      armed = false;
      cleared = false;
      resetArmed = false;
    }

    /** Open straight at one of the menus (Accessibility), as if picked from the top. */
    function openAt(menu) {
      open();
      if (MENUS[menu]) {
        const i = entries().findIndex((e) => e.id === `menu:${menu}`);
        if (i >= 0) levels[0].index = i;
        levels.push({ kind: "menu", menu, index: 0 });
      }
    }

    // A choice's values, opened: `patchOf(value)` is what picking one saves;
    // `previewed`, whether moving through them shows each.
    function openChoice(row, current, patchOf, previewed) {
      const values = Settings().choicesOf(row, current);
      levels.push({ kind: "choice", row, values, current, patchOf, previewed, index: Math.max(0, values.indexOf(current)) });
    }

    function move(delta) {
      const l = level();
      const n = view().entries.length;
      const next = Math.min(n - 1, Math.max(0, l.index + delta));
      cleared = false;
      if (next !== l.index) {
        l.index = next;
        armed = false;
        resetArmed = false;
        if (l.kind === "choice" && l.previewed) preview(l.patchOf(l.values[l.index]));
      }
      return true;
    }

    function take(byRight) {
      const l = level();
      if (l.kind === "buttons" || l.kind === "job" || l.kind === "learn" || l.kind === "confirm") {
        if (byRight && l.kind !== "buttons") return true; // ▶ never runs an action
        return takeButtons(l);
      }
      if (l.kind === "choice") {
        o.save(l.patchOf(l.values[l.index]));
        if (l.previewed) preview(null);
        levels.pop();
        return true;
      }
      const S = Settings();
      const s = settings();
      if (l.kind === "look") {
        const row = lookRows(l.look)[l.index];
        if (row) openChoice(row, ((s.pageLooks || {})[l.look.key] || {})[row.id], (v) => lookPatch(l.look, row.id, v), true);
        return true;
      }
      const entry = listOf(l)[l.index];
      if (!entry) return true;
      if (entry.id === "look") {
        const look = pageLook();
        if (look) levels.push({ kind: "look", look, index: 0 });
        return true;
      }
      if (entry.id === "buttons") {
        levels.push({ kind: "buttons", index: 0 });
        return true;
      }
      if (entry.id.startsWith("menu:")) {
        levels.push({ kind: "menu", menu: entry.id.slice(5), index: 0 });
        return true;
      }
      const row = S.rowOf(entry.id);
      if (row && row.kind === "toggle") {
        o.save({ [row.id]: !s[row.id] });
      } else if (row && row.kind === "choice") {
        openChoice(row, s[row.id], (v) => ({ [row.id]: v }), Boolean(row.look));
      } else if (!byRight && entry.id === "cookies") {
        const open = cookies();
        if (open) open();
      } else if (!byRight && entry.id === "forget") {
        if (armed) {
          armed = false;
          cleared = Boolean(o.showCleared);
          if (typeof o.onClear === "function") o.onClear();
        } else armed = true;
      }
      return true;
    }

    function up() {
      const l = level();
      if (l && l.kind === "choice" && l.previewed) preview(null);
      resetArmed = false;
      levels.pop();
    }

    /**
     * A key's action. true: taken (draw view() again); "out": ◀ or Back at
     * the top, for the owner to leave the menu; false: not the menu's key.
     */
    function key(action) {
      if (!level()) open();
      switch (action) {
        case "up": return move(-1);
        case "down": return move(1);
        case "select": return take(false);
        case "right": return take(true);
        case "left":
        case "back":
          if (levels.length > 1) {
            up();
            return true;
          }
          return "out";
        default:
          return false;
      }
    }

    /** A click on an entry (a mouse): as moving there and pressing OK. */
    function pick(i) {
      if (!level()) open();
      level().index = i;
      return take(false);
    }

    /** The menu closing with a look still previewed: back as it was saved. */
    function close() {
      if (levels.some((l) => l.kind === "choice" && l.previewed)) preview(null);
      levels = [];
    }

    return Object.freeze({ open, openAt, view, key, pick, close, learning, learnKey });
  }

  globalThis.TenfootSettingsMenu = Object.freeze({ create });
})();
