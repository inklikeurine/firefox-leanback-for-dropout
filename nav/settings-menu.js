// Leanback for Dropout — Leanback's own settings as a menu: the one list
// (lib/settings.js → ROWS), then Clear Continue Watching and Turn Leanback
// Off. The same menu on a page (content/page.js) and in the playback panel
// (content/transport.js), so its entries, order, words and keys are the same
// everywhere. Logic only: the owner draws view() with nav/panel.js and hands
// it the keys.
//
// ▲ ▼ move. OK (or ▶, which never runs an action) takes an entry: an on/off
// flips, a choice opens its values, where OK picks one (ticked) and goes back
// up. Clearing cannot be undone, so it takes OK twice. ◀ or Back go back up a
// level; from the top they are the owner's to handle (key() says "out").

(function () {
  const Settings = () => globalThis.TenfootSettings;

  /**
   * @param {{
   *   settings: () => object,       // the current settings
   *   save: (patch: object) => void,
   *   onClear: () => void,          // Clear Continue Watching, confirmed
   *   onDisable: () => void,        // Turn Leanback Off
   *   showCleared?: boolean         // the entry reads "Cleared" after a clear, until the next move
   * }} opts
   */
  function create(opts) {
    const o = opts || {};
    const settings = () => (typeof o.settings === "function" && o.settings()) || {};
    let levels = [];
    let armed = false;
    let cleared = false;

    function level() {
      return levels[levels.length - 1] || null;
    }

    function entries() {
      const S = Settings();
      const s = settings();
      const list = S.ROWS.map((r) => (r.kind === "toggle"
        ? { id: r.id, label: r.label, kind: "toggle", on: Boolean(s[r.id]) }
        : { id: r.id, label: r.label, kind: "choice", value: S.valueText(r, s[r.id]) }));
      list.push({ id: "forget", label: "Clear Continue Watching", kind: "action", value: armed ? "OK again to clear" : cleared ? "Cleared" : "", separator: true });
      list.push({ id: "disable", label: "Turn Leanback Off", kind: "action" });
      return list;
    }

    /** The level on show, for nav/panel.js render(). */
    function view() {
      const l = level();
      if (l && l.kind === "choice") {
        const cur = settings()[l.row.id];
        return {
          title: l.row.label,
          index: l.index,
          entries: l.values.map((v) => ({ id: String(v), label: Settings().valueText(l.row, v), kind: "option", checked: v === cur }))
        };
      }
      return { title: "Leanback Settings", index: l ? l.index : 0, entries: entries() };
    }

    function open() {
      levels = [{ kind: "top", index: 0 }];
      armed = false;
      cleared = false;
    }

    function move(delta) {
      const l = level();
      const n = view().entries.length;
      const next = Math.min(n - 1, Math.max(0, l.index + delta));
      cleared = false;
      if (next !== l.index) {
        l.index = next;
        armed = false;
      }
      return true;
    }

    function take(byRight) {
      const l = level();
      if (l.kind === "choice") {
        o.save({ [l.row.id]: l.values[l.index] });
        levels.pop();
        return true;
      }
      const entry = entries()[l.index];
      if (!entry) return true;
      const S = Settings();
      const row = S.rowOf(entry.id);
      const s = settings();
      if (row && row.kind === "toggle") {
        o.save({ [row.id]: !s[row.id] });
      } else if (row && row.kind === "choice") {
        const values = S.choicesOf(row, s[row.id]);
        levels.push({ kind: "choice", row, values, index: Math.max(0, values.indexOf(s[row.id])) });
      } else if (!byRight && entry.id === "forget") {
        if (armed) {
          armed = false;
          cleared = Boolean(o.showCleared);
          if (typeof o.onClear === "function") o.onClear();
        } else armed = true;
      } else if (!byRight && entry.id === "disable") {
        if (typeof o.onDisable === "function") o.onDisable();
      }
      return true;
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
            levels.pop();
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

    return Object.freeze({ open, view, key, pick });
  }

  globalThis.TenfootSettingsMenu = Object.freeze({ create });
})();
