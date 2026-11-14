// Leanback for Dropout — Leanback's settings, in the panel (nav/panel.js),
// for content/page.js. The menu is nav/settings-menu.js, the same as in the
// playback panel; this part draws it, hands it the keys, and closes the
// panel when ◀ or Back leave its top. While a video plays, the options
// button opens the player's panel instead. A clear is confirmed with a
// notice. Installed into the page script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const Settings = globalThis.TenfootSettings;
    const SettingsMenu = globalThis.TenfootSettingsMenu;
    const { qs } = globalThis.TenfootCommon;

    // From the rest of the page script.
    const send = (...a) => P.send(...a);
    const showHints = (...a) => P.showHints(...a);
    const notice = (...a) => P.notice(...a);
    const currentEl = (...a) => P.currentEl(...a);
    const focusEl = (...a) => P.focusEl(...a);
    const enterPlayer = (...a) => P.enterPlayer(...a);
    const lookKey = (...a) => P.lookKey(...a);
    const previewLook = (...a) => P.previewLook(...a);
    const cookiePreferences = (...a) => P.cookiePreferences(...a);
    // The step in the tab's history that the settings stand on (see
    // pushMenuStep()).
    const MENU_STATE = "tenfootMenu";

    function renderSettings() {
      if (state.menu.isOpen) state.menu.render(state.settingsMenu.view());
    }

    function openSettings() {
      state.settingsMenu.open();
      // Open, then draw: drawing moves the focus into the panel, and a panel
      // that is not open yet would let the rail think the selection left it.
      state.menu.open();
      renderSettings();
      pushMenuStep();
      showHints();
      return true;
    }

    // The remote's Back is Firefox's own: it goes back in the tab's history
    // whatever the page does with the key. So while the settings are open
    // they stand on a step of their own in the history, at the same address
    // (pushed on the key press that opened them, so the page under it counts
    // as used and Firefox's Back does not pass over it). Firefox's Back
    // lands on the page again, without leaving it, and the settings go up a
    // level (onMenuPop()); at their top they close. Closed any other way, the
    // step is taken back off.
    function onMenuStep() {
      const s = history.state;
      return Boolean(s && typeof s === "object" && s[MENU_STATE] === true);
    }

    function pushMenuStep() {
      if (state.menuStep || onMenuStep()) return;
      try {
        const s = history.state && typeof history.state === "object" ? history.state : {};
        history.pushState(Object.assign({}, s, { [MENU_STATE]: true }), "", location.href);
      } catch (_err) {
        return; // no step: Back leaves the page, as it would anyway
      }
      state.menuStep = true;
      state.historyLength = history.length;
    }

    function dropMenuStep() {
      if (!state.menuStep) return;
      state.menuStep = false;
      if (!onMenuStep()) return;
      state.droppingMenuStep = true;
      history.back();
    }

    // A popstate: the settings' own step coming off (Firefox's Back, or
    // dropMenuStep()). True when it was that, and dealt with.
    function onMenuPop() {
      if (state.droppingMenuStep) {
        state.droppingMenuStep = false;
        return true;
      }
      if (!state.menuStep || onMenuStep()) return false;
      state.menuStep = false;
      if (!state.menu.isOpen) return true;
      const r = state.settingsMenu.key("back");
      if (r === "out") closeMenu();
      else {
        renderSettings();
        // Still open, a level up: a step again for the next Back.
        pushMenuStep();
      }
      return true;
    }

    // The settings open on their step: the remote's Back is for them.
    function holdsBack() {
      return Boolean(state.menu.isOpen && state.menuStep && onMenuStep());
    }

    function openMenu() {
      if (state.menu.isOpen) return closeMenu();
      // While a video plays the options button belongs to the player's
      // settings panel, which holds its settings and Leanback's together.
      // Everywhere else — an episode's details page too — and when the player
      // does not answer, it opens Leanback's settings here. Remember where the
      // ring was, so closing whatever opens puts it back.
      state.menuReturn = state.playerFocused ? null : currentEl();
      if (state.inPlace || (state.kind === "video" && state.watch === "playing" && qs(state.page.playerFrame))) {
        send({ type: "player:settings" }).then((r) => {
          if (!r || !r.ok) openSettings();
        });
        return true;
      }
      return openSettings();
    }

    function closeMenu() {
      if (!state.menu.close()) return false;
      state.settingsMenu.close();
      dropMenuStep();
      if (state.menuReturn && state.menuReturn.isConnected) focusEl(state.menuReturn);
      else if (state.playerFocused || state.theater) enterPlayer();
      else if (state.screen) {
        // What it was on went with a change of look (Home's banner, off).
        const t = state.screen.current || state.screen.initialTarget();
        if (t) focusEl(t, { scroll: false });
      }
      state.menuReturn = null;
      showHints();
      return true;
    }

    function dispatchInMenu(action) {
      if (action === "menu") return closeMenu();
      const r = state.settingsMenu.key(action);
      if (r === "out") return closeMenu();
      if (r) renderSettings();
      return Boolean(r);
    }

    function saveSetting(patch) {
      if (Object.keys(patch).every((k) => state.settings[k] === patch[k])) return;
      state.settings = Object.assign({}, state.settings, patch);
      send({ type: "settings:set", patch });
    }

    function createSettingsMenu() {
      return SettingsMenu.create({
        settings: () => state.settings,
        save: saveSetting,
        pageLook: () => {
          const key = lookKey();
          return key ? { key, title: Settings.PAGE_LOOKS[key].title } : null;
        },
        preview: previewLook,
        cookies: () => cookiePreferences(),
        onClear: () => {
          send({ type: "history:clear" });
          notice("Continue Watching cleared");
        }
      });
    }

    // A click on an entry (a mouse): the same as moving there and pressing OK.
    function onPanelPick(i) {
      state.settingsMenu.pick(i);
      renderSettings();
    }

    Object.assign(P, { renderSettings, openSettings, openMenu, closeMenu, onMenuPop, holdsBack, dropMenuStep, dispatchInMenu, createSettingsMenu, onPanelPick });
  }

  globalThis.TenfootPageSettings = Object.freeze({ install });
})();
