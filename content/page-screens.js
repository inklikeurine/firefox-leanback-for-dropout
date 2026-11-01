// Leanback for Dropout — Leanback's screens and the rail, for content/page.js:
// which screen a page gets (content/screen.js and its readers), starting,
// stopping and redrawing it, moves on it, the rail and its focus region, and
// the season a show opens on. Installed into the page script's shared
// context.

(function () {
  function install(P) {
    const { state } = P;
    // state.screen is Leanback's own screen on this page, when it draws one, a
    // screen of content/screen.js: Home and the hubs (content/home.js reads
    // them), Browse, My List and the lists (a grid of cards), a show's page
    // and a special (a banner, the seasons, sections of cards: content/show.js
    // reads them). Every screen answers the same calls, so the page script
    // treats them alike.
    const root = document.documentElement;
    const Rail = globalThis.TenfootRail;
    const Home = globalThis.TenfootHome;
    const Screen = globalThis.TenfootScreen;
    const Show = globalThis.TenfootShow;
    const { qs } = globalThis.TenfootCommon;

    // From the rest of the page script.
    const send = (...a) => P.send(...a);
    const collect = (...a) => P.collect(...a);
    const currentEl = (...a) => P.currentEl(...a);
    const focusEl = (...a) => P.focusEl(...a);
    const samePath = (...a) => P.samePath(...a);
    const openMenu = (...a) => P.openMenu(...a);
    const openSettings = (...a) => P.openSettings(...a);
    const leaveFieldBelow = (...a) => P.leaveFieldBelow(...a);
    const goHome = (...a) => P.goHome(...a);
    const goSideways = (...a) => P.goSideways(...a);
    const goTop = (...a) => P.goTop(...a);
    const go = (...a) => P.go(...a);
    const startWatching = (...a) => P.startWatching(...a);
    const clearProgress = (...a) => P.clearProgress(...a);
    const isLive = (...a) => P.isLive(...a);
    const refocusPage = (...a) => P.refocusPage(...a);
    const askUser = (...a) => P.askUser(...a);
    const pickPicture = (...a) => P.pickPicture(...a);
    const notice = (...a) => P.notice(...a);
    const pageLook = (...a) => P.pageLook(...a);
    // Theme This Page's Card Size: how many cards across a grid.
    const GRID_COLUMNS = { small: 6, medium: 5, large: 4 };

    // The rail's own entries, top to bottom. Signed in, the profile watching
    // comes first, set apart (signed out, Sign in does); the site's links
    // (rules → rail.links) come after Browse, and the gear sits at the foot.
    const RAIL_PROFILE = { id: "profile", label: "Switch profile", icon: "person", start: true };
    const RAIL_SIGNIN = { id: "signin", label: "Sign in", icon: "person", start: true };
    const RAIL_ITEMS = [
      { id: "search", label: "Search", icon: "search" },
      { id: "home", label: "Home", icon: "home" },
      { id: "browse", label: "Browse", icon: "grid" }
    ];
    const RAIL_SETTINGS = { id: "settings", label: "Leanback settings", icon: "gear", end: true };

    function homeRules() {
      return (state.rules && state.rules.home) || {};
    }

    function screenRules() {
      return (state.rules && state.rules.screen) || {};
    }

    // "home", "page" (a grid of cards), "detail" (a show or a special),
    // "search", "episode" (an episode's details page), "profiles" (the
    // profile picker and Manage profiles), "welcome" (the front page signed
    // out), or null for a page Leanback does not draw.
    function screenKind() {
      if (state.kind === "browse" || state.kind === "hub") return "home";
      if (state.kind === "profiles") return pickerForm() ? null : "profiles";
      if (state.kind === "profileEdit") return "profileForm";
      if (state.kind === "welcome") return "welcome";
      if (state.kind === "grid") return "page";
      if (state.kind === "search") return "search";
      if (state.kind === "video") return "episode";
      if (state.kind === "series" && Show) {
        const layout = Show.layoutOf(document, state.page.show);
        if (layout === "list") return "page";
        if (layout === "show" || layout === "special") return "detail";
      }
      return null;
    }

    function startScreen() {
      const which = screenKind();
      if (state.screen || !which || !Screen) return;
      const observe = (items) => send({ type: "history:observe", items });
      if (which === "home") {
        // Home's rows come after the page is up: the screen starts as soon as
        // the page holds Home, and fills in as they arrive.
        if (!Home || !qs(homeRules().root)) return;
        state.screen = Screen.createScreen(document, {
          home: true,
          read: () => Home.homeModel(document, homeRules(), { history: state.history, continueWatching: state.kind === "browse", banner: pageLook().banner }),
          history: () => state.history,
          onObserve: observe
        });
      } else {
        const readers = {
          detail: () => Show.readDetail(document, state.page.show, { history: state.history, href: location.href, smartOrder: state.settings.seasonStart !== "first" }),
          search: () => Screen.searchModel(document, screenRules().search),
          episode: () => Screen.episodeModel(document, screenRules().episode, { history: state.history, href: location.href, live: isLive() }),
          page: () => Screen.collectionModel(document, screenRules(), {
            empty: railPage() === "my-list" ? "Nothing in My List yet. Add a show or a video to it with Add to My List on its page." : ""
          }),
          // The picker, or its Add Profile form.
          profiles: () => Screen.profilesModel(document, screenRules().profiles, { current: state.profile, signOut, editPicture }) ||
            Screen.profileFormModel(document, formRules().add),
          profileForm: () => Screen.profileFormModel(document, formRules().edit),
          welcome: () => Screen.welcomeModel(document, screenRules().welcome, {
            signinUrl: state.rules.signinUrl,
            browseUrl: state.rules.browseUrl,
            legal: Array.isArray(state.rules.legal) ? state.rules.legal : []
          })
        };
        const read = readers[which];
        // Nothing to draw from: Dropout's page stays, driven as it is. The
        // picker and Edit Profile are drawn by Dropout's scripts after the
        // page loads: their screens wait for them, the way Home's waits for
        // its rows.
        if (which !== "profiles" && which !== "profileForm" && !read()) return;
        // A page the rail links to goes by the rail's name (My List); the New
        // Releases list carries no "New" badges, as its row on Home does not.
        const link = railLinks().find((l) => samePath(l.url, location.href));
        const tweak = Home ? Home.rowOverride(homeRules(), location.href, "") : null;
        const kinds = state.rules.rail && Array.isArray(state.rules.rail.kinds) ? state.rules.rail.kinds : [];
        state.screen = Screen.createScreen(document, {
          read,
          title: link ? link.label : "",
          rail: kinds.includes(state.kind),
          badges: !(tweak && tweak.badges === false),
          history: () => state.history,
          onObserve: observe,
          columns: () => GRID_COLUMNS[pageLook().cards] || null,
          onPill: (pill) => onSeasonChosen(pill.key, Boolean(pill.current)),
          onFieldDone: () => leaveFieldBelow(),
          // An episode's Watch (or Resume), Start Over and Clear Progress; a
          // profile's Delete Profile.
          onRun: (what) => {
            if (what === "clear") return clearProgress();
            if (what === "ask:delete") return deleteProfile();
            if (what === "ask:cancel") return cancelProfile();
            return startWatching(what === "restart");
          }
        });
      }
      root.dataset.tenfootHome = "on";
      state.screenRefocus = 0;
      state.screen.refresh();
    }

    function stopScreen() {
      if (!state.screen) return;
      state.screen.destroy();
      state.screen = null;
      delete root.dataset.tenfootHome;
      setPending(false);
    }

    // The picker shows a form of its own in place of its profiles: Add
    // Profile (a name and a picture), or a profile's PIN. Those are Dropout's,
    // driven as they are (rules → pages.profiles); while it is only loading,
    // nothing to press yet, the screen waits on.
    function formRules() {
      return screenRules().profileForm || {};
    }

    // The picker showing a form Leanback does not draw (a PIN): Dropout's
    // own, driven as it is.
    function pickerForm() {
      const R = screenRules().profiles || {};
      const app = qs(R.root);
      if (!app || !qs("input, button", app)) return false;
      return !Screen || (!Screen.profilesModel(document, R, { current: state.profile }) && !Screen.profileFormModel(document, formRules().add));
    }

    // Dropout's profile API, as its own pages call it: its address from the
    // page (VHX.config.api_v2_url), the page's sign-in token (TOKEN), the
    // site's and the account's ids, and the page's own fetch, so the call
    // is the page's. Null on a page without them.
    function profileApi() {
      let page = null;
      try {
        page = window.wrappedJSObject || window;
        const base = page.VHX && page.VHX.config ? page.VHX.config.api_v2_url : "";
        const token = page.TOKEN;
        const site = page._current_site ? page._current_site.id : null;
        const user = page._current_user ? page._current_user.id : null;
        if (!base || typeof token !== "string" || !token || site == null || user == null) return null;
        const call = async (path, method, body) => {
          const init = { method: method || "GET", headers: { Authorization: `Bearer ${token}` } };
          if (body !== undefined) {
            init.headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(body);
          }
          const url = String(base) + path.replace("{site}", String(site)).replace("{user}", String(user));
          const res = await page.fetch(url, page !== window && typeof cloneInto === "function" ? cloneInto(init, window) : init);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = String(await res.text());
          return text ? JSON.parse(text) : null;
        };
        return { call };
      } catch (_err) {
        return null;
      }
    }

    // Manage profiles, OK on a profile's picture: its pictures in a box of
    // Leanback's, the one it has now selected. OK on another saves it (as
    // Dropout's Edit Profile does) and Manage profiles is drawn again with
    // it; Back changes nothing. Without Dropout's API on the page, Dropout's
    // own button for the profile (Edit Profile).
    async function editPicture(button, position) {
      const R = (state.rules && state.rules.profileApi) || {};
      const api = profileApi();
      if (!api || !R.profiles || !R.pictures || !R.update) {
        if (button && button.isConnected) button.click();
        return;
      }
      let profiles = [];
      let pictures = [];
      try {
        const [p, q] = await Promise.all([api.call(R.profiles), api.call(R.pictures)]);
        profiles = (p && Array.isArray(p.profiles) ? p.profiles : []).slice().sort((a, b) => a.index - b.index);
        pictures = (q && Array.isArray(q.profile_pictures) ? q.profile_pictures : []).slice().sort((a, b) => a.position - b.position);
      } catch (err) {
        console.warn("[leanback-for-dropout] the profile pictures could not be read:", err && err.message);
      }
      const profile = profiles[position];
      if (!profile || !pictures.length) {
        notice("The pictures could not be loaded");
        return;
      }
      const item = (pic, i) => ({ id: String(pic.id), image: String(pic.image_url || ""), label: `Picture ${i + 1}` });
      const current = pictures.find((pic) => pic.id === profile.profile_image_id || (pic.image_url && pic.image_url === profile.profile_image_url));
      const classics = pictures.filter((pic) => pic.site_id == null);
      const own = pictures.filter((pic) => pic.site_id != null);
      const chosen = await pickPicture({
        title: `Picture for ${profile.name}`,
        start: current ? String(current.id) : null,
        sections: [
          { label: "The classics", items: classics.map(item) },
          { label: R.siteLabel || "Dropout", items: own.map((pic, i) => item(pic, classics.length + i)) }
        ]
      });
      if (!chosen || (current && chosen === String(current.id))) return;
      const pick = pictures.find((pic) => String(pic.id) === chosen);
      try {
        await api.call(R.update.replace("{index}", String(profile.index)), "PATCH", { profile: { name: profile.name, profile_image_id: pick ? pick.id : chosen } });
      } catch (err) {
        console.warn("[leanback-for-dropout] the picture could not be saved:", err && err.message);
        notice("The picture could not be saved");
        return;
      }
      // Dropout's picker draws its profiles once: drawn again, managing.
      if (R.after) goSideways(R.after);
    }

    // Cancel on Edit Profile. With changes not saved (Dropout's Save lit),
    // asked first in Leanback's box, Keep Editing selected; Firefox's own
    // "leave this page?" never comes up there (page.js onBeforeUnload).
    function cancelProfile() {
      const R = formRules().edit || {};
      const root = qs(R.root);
      if (!root) return;
      const rule = (k) => (R.buttons || []).find((b) => b.key === k);
      const cancel = findButton(root, rule("cancel") && rule("cancel").text);
      const save = findButton(root, rule("save") && rule("save").text);
      if (!cancel) return;
      if (!save || save.disabled || save.getAttribute("aria-disabled") === "true") {
        cancel.click();
        return;
      }
      askUser({
        title: "Leave without saving?",
        text: "The changes to this profile will not be kept.",
        buttons: [{ id: "stay", label: "Keep Editing" }, { id: "leave", label: "Leave" }],
        start: "stay"
      }).then((answer) => {
        if (answer === "leave" && cancel.isConnected) cancel.click();
      });
    }

    // Delete Profile, on Edit Profile: asked first, Cancel selected; then
    // Dropout's own Delete Profile, and the Delete in the box Dropout opens
    // to ask again (or its window.confirm, answered yes for this one press).
    function deleteProfile() {
      const R = formRules().edit || {};
      const root = qs(R.root);
      const input = root ? qs(R.name, root) : null;
      const name = input ? String(input.value || "").trim() : "";
      askUser({
        title: name ? `Delete ${name}?` : "Delete this profile?",
        text: "The profile goes for good, with its My List and what it has watched.",
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "delete", label: "Delete Profile", danger: true }],
        start: "cancel"
      }).then((answer) => {
        if (answer !== "delete" || !root) return;
        const rule = (R.buttons || []).find((b) => b.key === "delete");
        const button = findButton(root, rule && rule.text);
        if (!button) return;
        const page = window.wrappedJSObject;
        const own = page ? page.confirm : null;
        try {
          if (page) page.confirm = exportFunction(() => true, window);
          button.click();
        } finally {
          if (page) setTimeout(() => { page.confirm = own; }, 0);
        }
        confirmInDialog(R, Date.now() + 3000);
      });
    }

    function findButton(scope, pattern) {
      let re = null;
      try {
        re = new RegExp(pattern || "^$", "i");
      } catch (_err) {
        return null;
      }
      return Array.from(scope.querySelectorAll("button")).find((b) => re.test((b.textContent || "").trim()) && !b.disabled) || null;
    }

    // Dropout's own "Delete profile" box: its Delete, once it is there.
    function confirmInDialog(R, until) {
      const dialog = Array.from(document.querySelectorAll(R.dialog || "[role='dialog']")).find((d) => findButton(d, R.confirm));
      if (dialog) {
        findButton(dialog, R.confirm).click();
        return;
      }
      if (Date.now() < until && !state.leaving) setTimeout(() => confirmInDialog(R, until), 100);
    }

    function syncPicker() {
      const form = pickerForm();
      if (form && state.screen) {
        stopScreen();
        refocusPage();
      } else if (!form && !state.screen) {
        startScreen();
      }
    }

    function refreshScreen() {
      if (state.kind === "profiles" && state.enabled) syncPicker();
      if (!state.screen) return;
      const before = currentEl();
      const target = state.screen.refresh();
      if (state.screen.ready) setPending(false);
      if (state.pendingInitialFocus || state.railActive || state.menu.isOpen || state.modal || state.playerFocused || state.theater || state.inPlace || !target) return;
      // The card the selection was on went away, or the site took the focus:
      // put it on the card Home now has selected. Still there, it may have
      // changed size (Watch becoming Resume): the ring follows.
      if (!before || !before.isConnected || before !== target) focusEl(target, { scroll: false });
      else state.ring.refresh();
    }

    function moveScreen(dir) {
      const r = state.screen.move(dir);
      if (r && r.el) focusEl(r.el, { scroll: false });
      else if (r && r.edge === "left") enterRail();
      return true;
    }

    function railShown() {
      return Boolean(state.rail) && state.rail.visible;
    }

    function railLinks() {
      const links = state.rules && state.rules.rail && Array.isArray(state.rules.rail.links) ? state.rules.rail.links : [];
      return links.filter((l) => l && typeof l.id === "string" && typeof l.url === "string" && typeof l.label === "string");
    }

    // The rail entry for the page on screen. A hub looks like Home but is not
    // it, so nothing is lit there unless the rail links to it.
    function railPage() {
      const link = railLinks().find((l) => samePath(l.url, location.href));
      if (link) return link.id;
      if (state.kind === "browse") return "home";
      if (state.kind === "grid") return "browse";
      if (state.kind === "search") return "search";
      return null;
    }

    function profileRules() {
      return (state.rules && state.rules.rail && state.rules.rail.profile) || {};
    }

    // The profile watching, as Dropout's header shows it: its picture, set as
    // a background. Null when signed out (no picture there); "" when the
    // header has the place but no picture.
    function profilePicture() {
      const el = qs(profileRules().picture);
      if (!el) return null;
      const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec((el.style && el.style.backgroundImage) || el.getAttribute("style") || "");
      return m ? m[1] : "";
    }

    // An episode's page has the rail beside its details page, and not when
    // it is Dropout's own page.
    function setupRail() {
      const kinds = state.rules.rail && Array.isArray(state.rules.rail.kinds) ? state.rules.rail.kinds : [];
      const on = state.enabled && kinds.includes(state.kind) && (state.kind !== "video" || Boolean(state.screen));
      if (!state.rail && on && Rail) {
        const links = railLinks().map((l) => ({ id: l.id, label: l.label, icon: l.icon || "tv" }));
        const picture = profileRules().url ? profilePicture() : null;
        const signedOut = Boolean(state.rules.signinUrl && qs(state.rules.common && state.rules.common.signedOut));
        const top = picture !== null ? [Object.assign({}, RAIL_PROFILE, { picture })] : signedOut ? [RAIL_SIGNIN] : [];
        state.rail = Rail.createRail(document, [...top, ...RAIL_ITEMS, ...links, RAIL_SETTINGS], { onActivate: onRailItem });
      }
      if (!state.rail) return;
      state.rail.setCurrent(railPage());
      // With nothing lit, entering the rail lands on Home.
      if (!railPage()) state.rail.select(state.rail.item("home"));
      state.rail.show(on);
      if (on) root.dataset.tenfootRail = "on";
      else delete root.dataset.tenfootRail;
      if (!on) state.railActive = false;
    }

    function enterRail() {
      if (!railShown()) return false;
      state.railReturn = currentEl();
      state.railActive = true;
      const el = state.rail.current;
      if (el) focusEl(el, { scroll: false });
      return true;
    }

    // Back to exactly where the selection came from (H3).
    function leaveRail() {
      state.railActive = false;
      const r = state.railReturn;
      state.railReturn = null;
      if (r && r.isConnected) {
        if (state.screen) state.screen.select(r);
        focusEl(r, { scroll: !state.screen });
        return true;
      }
      const target = state.screen ? state.screen.current || state.screen.initialTarget() : null;
      if (target) focusEl(target, { scroll: false });
      else if (state.screen && state.screen.isEmpty()) {
        // Nothing on the screen to go to: the selection stays on the rail.
        state.railActive = true;
        if (state.rail.current) focusEl(state.rail.current, { scroll: false });
      } else {
        const { candidates } = collect();
        if (candidates.length) focusEl(candidates[0].el);
      }
      return true;
    }

    function dispatchInRail(action) {
      switch (action) {
        case "up":
        case "down": {
          const el = state.rail.move(action === "up" ? -1 : 1);
          if (el) focusEl(el, { scroll: false });
          return true;
        }
        case "right":
        case "back":
          return leaveRail();
        case "left":
          return true; // the rail is the left edge
        case "select": {
          const id = state.rail.currentId;
          if (id) onRailItem(id);
          return true;
        }
        case "menu":
          return openMenu();
        case "search":
          return goTop(state.rules.searchUrl || "/search");
        default:
          return false;
      }
    }

    function onRailItem(id) {
      const el = state.rail && state.rail.item(id);
      if (el) state.rail.select(el);
      const link = railLinks().find((l) => l.id === id);
      if (link) {
        if (samePath(link.url, location.href)) leaveRail();
        else goTop(link.url);
        return;
      }
      switch (id) {
        case "home":
          if (state.kind === "browse" && state.screen) {
            // Already Home: back to the top of it.
            state.railActive = false;
            state.railReturn = null;
            const t = state.screen.initialTarget();
            if (t) focusEl(t, { scroll: false });
            return;
          }
          goHome();
          return;
        case "browse":
          // My List is a grid page too, but not Browse.
          if (railPage() === "browse") {
            leaveRail();
            return;
          }
          goTop(state.rules.gridUrl || "/series");
          return;
        case "search":
          if (state.kind === "search") {
            leaveRail();
            return;
          }
          goTop(state.rules.searchUrl || "/search");
          return;
        case "settings":
          state.menuReturn = el || currentEl();
          openSettings();
          return;
        case "profile":
          // A page of its own on top, so Back comes back here if nobody
          // is picked.
          go(profileRules().url);
          return;
        case "signin":
          go(state.rules.signinUrl);
          return;
        default:
      }
    }

    // A show opens on the season the settings ask for, newest or first; Dropout
    // opens every show on Season 1. Only an address that names no season is
    // moved: one that does was chosen (a season picked, Back from an episode).
    // Replacing the page keeps Back where it was.
    function openSeason() {
      if (!Show || state.kind !== "series" || Show.namesSeason(location.pathname)) return false;
      const rules = state.page.show;
      if (Show.layoutOf(document, rules) !== "show") return false;
      const url = Show.seasonTarget(Show.readSeasons(document, rules, location.href), state.settings.seasonStart);
      if (!url) return false;
      goSideways(url);
      return true;
    }

    // OK on a season: its page, replacing this one, so Back leaves the show
    // rather than stepping back through the seasons. The season already on
    // screen takes the selection down to its episodes instead.
    function onSeasonChosen(url, current) {
      if (!current) {
        goSideways(url);
        return;
      }
      const t = state.screen ? state.screen.initialTarget() : null;
      if (t) focusEl(t, { scroll: false });
    }

    // Sign Out (the profile picker): asked first, Cancel selected; then
    // Dropout's own sign-out, a form sent with the page's token, as its
    // Log out button does.
    function signOut() {
      const r = state.rules.signout || {};
      askUser({
        title: "Sign out of Dropout?",
        text: "Signing in again needs your email and password.",
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "signout", label: "Sign Out", primary: true }],
        start: "cancel"
      }).then((answer) => {
        if (answer !== "signout" || !r.url) return;
        const meta = qs(r.token);
        const form = document.createElement("form");
        form.method = "post";
        form.action = r.url;
        form.hidden = true;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "authenticity_token";
        input.value = meta ? meta.getAttribute("content") || "" : "";
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      });
    }

    // A screen Leanback is still building keeps Dropout's page hidden under it
    // (content/page.css), so Dropout's page never shows first. Lifted when the
    // screen is up, or when it is given up (stopScreen).
    function setPending(on) {
      if (on) root.setAttribute("data-tenfoot-pending", "");
      else root.removeAttribute("data-tenfoot-pending");
    }

    function inScreen(el) {
      return Boolean(el && state.screen && !state.modal && state.screen.contains(el));
    }

    Object.assign(P, {
      homeRules, screenRules, screenKind, startScreen, stopScreen, refreshScreen, moveScreen,
      railShown, railLinks, railPage, setupRail, enterRail, leaveRail, dispatchInRail,
      onRailItem, openSeason, onSeasonChosen, setPending, inScreen
    });
  }

  globalThis.TenfootPageScreens = Object.freeze({ install });
})();
