// Leanback for Dropout — the look, for content/page.js: the theme, Theme
// Color, Holidays and Accessibility written onto the page (lib/themes.js)
// and the ring, a look tried in the settings panel before it is picked,
// Theme This Page with what moves sliding to its new place, and Cookie
// Preferences. Installed into the page script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const LOG = "[leanback-for-dropout]";
    const LOOK_SLIDE_MS = 320; // Theme This Page: what moves slides this long
    const root = document.documentElement;
    const Rules = globalThis.TenfootSiteRules;
    const Themes = globalThis.TenfootThemes;
    const { qs, qsa } = globalThis.TenfootCommon;

    // From the rest of the page script.
    const screenKind = (...a) => P.screenKind(...a);
    const refreshScreen = (...a) => P.refreshScreen(...a);
    const reducedMotion = (...a) => P.reducedMotion(...a);
    const closeMenu = (...a) => P.closeMenu(...a);

    function ringStyle() {
      const s = lookSettings();
      const look = Themes.lookOf(s, new Date(), window);
      return { color: look.accent, width: s.highContrast ? Math.max(6, s.ringWidth) : s.ringWidth, zoom: s.focusZoom };
    }

    // The settings as they look now: a choice being tried in the settings
    // panel wins over the saved one until it is picked or left.
    function lookSettings() {
      return state.preview ? Object.assign({}, state.settings, state.preview) : state.settings;
    }

    // Which of Theme This Page's kinds of look the page on screen is.
    function lookKey() {
      switch (screenKind()) {
        case "home": return "home";
        case "page":
        case "search": return "lists";
        case "detail": return "show";
        case "episode": return "details";
        default: return null;
      }
    }

    function pageLook() {
      const key = lookKey();
      const all = lookSettings().pageLooks || {};
      return (key && all[key]) || {};
    }

    function lookData() {
      const d = root.dataset;
      return [d.tenfootLookBanner, d.tenfootLookCards, d.tenfootLookPicture].join("|");
    }

    /**
     * Write the look onto the page (lib/themes.js). When the page's own look
     * changed (Theme This Page), its screen is drawn again, and with
     * `animate` what moved slides from where it was to where it is now.
     */
    function applyLook(animate) {
      Themes.apply(root, lookSettings(), new Date());
      state.ring.setStyle(ringStyle());
      const p = pageLook();
      const before = lookData();
      const write = () => {
        for (const [k, v] of [["tenfootLookBanner", p.banner], ["tenfootLookCards", p.cards], ["tenfootLookPicture", p.picture]]) {
          if (v) root.dataset[k] = v;
          else delete root.dataset[k];
        }
      };
      if (!state.screen || before === [p.banner, p.cards, p.picture].map((v) => v || "").join("|")) {
        write();
        return;
      }
      const change = () => {
        write();
        refreshScreen();
      };
      if (animate) slideLayout(change);
      else change();
    }

    // What moves on a screen when its look changes, each sliding (and growing
    // or shrinking) from its old box to its new one.
    function slideLayout(change) {
      const layer = state.screen && state.screen.element;
      if (!layer || reducedMotion()) {
        change();
        return;
      }
      const els = Array.from(layer.querySelectorAll(".tenfoot-card, .tenfoot-hero, .tenfoot-hero-body, .tenfoot-screen-picture, .tenfoot-screen-head, .tenfoot-row-title"));
      const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
      change();
      for (const [el, a] of first) {
        if (!el.isConnected || typeof el.animate !== "function") continue;
        const b = el.getBoundingClientRect();
        if (!a.width || !a.height || !b.width || !b.height) continue;
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        const sx = a.width / b.width;
        const sy = a.height / b.height;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
        el.animate([
          { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transformOrigin: "0 0", transform: "none" }
        ], { duration: LOOK_SLIDE_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      }
      setTimeout(() => state.ring.refresh(), LOOK_SLIDE_MS + 20);
    }

    // Cookie Preferences (Leanback's settings): the cookie settings again,
    // once they have been answered — by asking the page's Ketch for them, as
    // Dropout's own "Data Preferences" link does; else by pressing Dropout's
    // "Manage Cookie Preferences" (in its footer, hidden while Leanback is
    // on). Null when the page has neither.
    function cookiePreferences() {
      const r = (state.rules.common || {}).cookiePreferences || {};
      let page = null;
      try {
        page = window.wrappedJSObject || null;
      } catch (_err) {
        page = null;
      }
      const ketch = page && r.call && typeof page.ketch === "function" ? page.ketch : null;
      const link = ketch ? null : cookieLink();
      if (!ketch && !link) return null;
      return () => {
        closeMenu();
        if (ketch) {
          try {
            // The options (which window) are the page's, so made in its world.
            if (r.hint) ketch(r.call, cloneInto({ displayHint: r.hint }, window));
            else ketch(r.call);
            return;
          } catch (err) {
            console.warn(LOG, "cookie preferences did not open:", err && err.message);
          }
        }
        const l = link || cookieLink();
        if (l) l.click();
      };
    }

    function cookieLink() {
      const r = (state.rules.common || {}).cookiePreferences || {};
      const bySel = Rules.selectorList(r.selector).map((sel) => qs(sel)).find(Boolean);
      if (bySel) return bySel;
      let re = null;
      try {
        re = r.text ? new RegExp(r.text, "i") : null;
      } catch (_err) {
        return null;
      }
      return re ? qsa("footer a, footer button, a, button").find((el) => re.test((el.textContent || "").trim())) || null : null;
    }

    // A look tried in the settings panel (moving through its values), or none.
    function previewLook(patch) {
      state.preview = patch || null;
      applyLook(true);
    }

    Object.assign(P, { ringStyle, lookKey, pageLook, applyLook, cookiePreferences, previewLook });
  }

  globalThis.TenfootPageLook = Object.freeze({ install });
})();
