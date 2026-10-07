// Leanback for Dropout — an episode's page, for content/page.js: the player's
// marks, theater, the player docked in Leanback's screen, the hand-off into
// and out of the player frame, next and previous episode, the site's up-next
// offer, autoplay, media keys, and what the page tells the watch history.
// Installed into the page script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const THEATER_CLASS = "tenfoot-theater";
    const DOCK_CLASS = "tenfoot-docked";
    const DOCK_FOLLOW_MS = 400; // how long the player follows the screen sliding
    const EPISODES_KEY = "tenfoot.episodes";
    const AUTOPLAY_DELAY_MS = 1200;
    const root = document.documentElement;
    const Rules = globalThis.TenfootSiteRules;
    const Spatial = globalThis.TenfootSpatial;
    const Ring = globalThis.TenfootFocusRing;
    const History = globalThis.TenfootHistory;
    const { qs, qsa } = globalThis.TenfootCommon;

    // From the rest of the page script.
    const send = (...a) => P.send(...a);
    const click = (...a) => P.click(...a);
    const firstVisible = (...a) => P.firstVisible(...a);
    const collect = (...a) => P.collect(...a);
    const focusEl = (...a) => P.focusEl(...a);
    const goBack = (...a) => P.goBack(...a);
    const goSideways = (...a) => P.goSideways(...a);
    const samePath = (...a) => P.samePath(...a);
    const seriesSlug = (...a) => P.seriesSlug(...a);

    function markVideoElements() {
      const p = state.page;
      const theaterRoot = qs(p.theaterRoot);
      if (theaterRoot) theaterRoot.setAttribute("data-tenfoot-theater-root", "");
      const mount = qs(p.playerMount);
      if (mount) {
        mount.setAttribute("data-tenfoot-player", "");
        if (!mount.hasAttribute("tabindex")) mount.setAttribute("tabindex", "-1");
      }
      for (const sel of Rules.selectorList(p.theaterHide)) for (const el of qsa(sel)) el.setAttribute("data-tenfoot-hide", "");
      return { theaterRoot, mount, frame: qs(p.playerFrame) };
    }

    // On an episode's page Leanback's screen has a place for the player, and
    // Dropout's own player is put over it (content/page.css: html.tenfoot-docked)
    // — moved by style only, as theater does, because moving the frame in the
    // page would reload it. It follows the place while the screen slides.
    function syncDock() {
      const slot = state.enabled && state.screen && state.kind === "video" ? state.screen.dock : null;
      root.classList.toggle(DOCK_CLASS, Boolean(slot));
      if (!slot) {
        for (const v of ["--tf-dock-x", "--tf-dock-y", "--tf-dock-w", "--tf-dock-h"]) root.style.removeProperty(v);
        return;
      }
      const place = () => {
        const r = slot.getBoundingClientRect();
        root.style.setProperty("--tf-dock-x", `${Math.round(r.left)}px`);
        root.style.setProperty("--tf-dock-y", `${Math.round(r.top)}px`);
        root.style.setProperty("--tf-dock-w", `${Math.round(r.width)}px`);
        root.style.setProperty("--tf-dock-h", `${Math.round(r.height)}px`);
      };
      place();
      state.dockUntil = performance.now() + DOCK_FOLLOW_MS;
      if (state.dockFrame || typeof requestAnimationFrame !== "function") return;
      const step = () => {
        state.dockFrame = 0;
        if (!state.screen || !state.screen.dock) return;
        place();
        if (performance.now() < state.dockUntil) state.dockFrame = requestAnimationFrame(step);
      };
      state.dockFrame = requestAnimationFrame(step);
    }

    // The selection onto Leanback's screen of an episode, leaving the player.
    function focusScreen() {
      if (!state.screen || state.kind !== "video") return false;
      const t = state.screen.started ? state.screen.current : state.screen.initialTarget();
      if (!t) return false;
      state.playerFocused = false;
      focusEl(t, { scroll: false });
      syncDock();
      return true;
    }

    // Play on an episode's page: into the player (theater, as the setting
    // says), playing.
    function playFromScreen() {
      enterPlayer();
      if (state.playerState && state.playerState.paused) send({ type: "player:command", cmd: "play" });
      return true;
    }

    function sendHistoryMeta() {
      if (state.kind !== "video" || !History || state.metaSent === location.href) return;
      const key = History.keyOf(location.href);
      if (!key) return;
      state.metaSent = location.href;
      const img = qs(state.page.videoImage);
      const d = episodeDetails();
      send(Object.assign({
        type: "history:meta",
        key,
        url: location.href,
        title: d.title,
        series: d.series,
        image: img ? img.getAttribute("content") || "" : ""
      }, episodeInfo()));
    }

    // The episode page's own words: its title and the show's name, with the
    // season and episode numbers.
    function episodeDetails() {
      const text = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
      const info = episodeInfo();
      return {
        title: text(qs(state.page.videoTitle)),
        series: text(qs(state.page.seriesLink)),
        season: info.season === undefined ? null : info.season,
        episode: info.episode === undefined ? null : info.episode
      };
    }

    // Which show, season and episode this is. Dropout links the season as
    // "Season 2, Episode 1" even at /videos/<slug>, and its canonical address
    // names the show and season too.
    function episodeInfo() {
      const out = {};
      for (const a of qsa(Rules.selector(state.page.episodeInfo))) {
        const m = /Episode\s+(\d+)/i.exec(a.textContent || "");
        const season = History.seasonOf(a.href);
        if (!m || season === null) continue;
        out.show = seriesSlug(a.href);
        out.season = season;
        out.episode = Number(m[1]);
        break;
      }
      const canonical = qs(state.page.canonical);
      const url = canonical ? canonical.getAttribute("content") || "" : "";
      if (!out.show && History.showOf(url)) out.show = History.showOf(url);
      if (out.season === undefined && History.seasonOf(url) !== null) out.season = History.seasonOf(url);
      return out;
    }

    // Theater is not a history entry of its own: Back from an episode is the
    // browser's Back, and one more entry would make it take two presses.
    function setTheater(on) {
      const want = Boolean(on) && state.kind === "video";
      if (state.theater === want) return;
      state.theater = want;
      root.classList.toggle(THEATER_CLASS, want);
      if (want) {
        state.hints.hide();
        state.ring.hide();
      } else {
        state.ring.refresh();
      }
      syncDock();
    }

    function enterPlayer() {
      const v = markVideoElements();
      if (!v.frame) {
        state.pendingPlayerFocus = true;
        if (v.mount) focusEl(v.mount, { scroll: false });
        return true;
      }
      state.pendingPlayerFocus = false;
      if (state.settings.theater !== "off") setTheater(true);
      try {
        v.frame.focus();
      } catch (_err) { /* the frame will still get keys once the user clicks it */ }
      state.playerFocused = true;
      state.hints.hide();
      if (v.mount) state.lastFocus = v.mount;
      if (state.theater) state.ring.hide();
      else if (v.mount) state.ring.follow(v.mount);
      send({ type: "player:focus" }).then((r) => {
        if (!r || !r.ok) state.pendingPlayerFocus = !state.playerReady;
      });
      return true;
    }

    function leavePlayer(hint) {
      state.playerFocused = false;
      if (hint === "back") return goBack();
      // "below": the page must be visible for the ring to mean anything.
      setTheater(false);
      // Leanback's screen of the episode: its Play button, or where the
      // selection was left on it.
      if (focusScreen()) return true;
      // The link back to the show is what someone leaving the player wants far
      // more often than whatever markup sits closest under the video (the
      // metadata tags do), so it wins over the geometric pick.
      const series = firstVisible(Rules.selector(state.page.seriesLink));
      if (series) {
        focusEl(series);
        return true;
      }
      const mount = qs(state.page.playerMount);
      const { candidates } = collect();
      const others = candidates.filter((c) => c.el !== mount);
      const t = mount ? Spatial.pick("down", Ring.unscaledRect(mount), others) : others[0];
      if (t) focusEl(t.el);
      else if (mount) focusEl(mount);
      return true;
    }

    // Remember the series page exactly as it was — season and sort included —
    // so Back from an episode returns there rather than to the series' default
    // season, and so next/previous know the running order.
    function captureEpisodeOrder() {
      const urls = qsa(Rules.selector(state.page.episodeLinks)).map((a) => a.href).filter(Boolean);
      if (!urls.length) return;
      try {
        sessionStorage.setItem(EPISODES_KEY, JSON.stringify({ series: location.pathname, href: location.href, urls }));
      } catch (_err) { /* storage disabled: next/previous falls back to up-next only */ }
    }

    function readEpisodeOrder() {
      try {
        const v = JSON.parse(sessionStorage.getItem(EPISODES_KEY) || "null");
        return v && Array.isArray(v.urls) ? v : null;
      } catch (_err) {
        return null;
      }
    }

    function episodeUrl(delta) {
      const up = state.playerState && state.playerState.upNext;
      if (delta > 0 && up && typeof up.url === "string" && up.url) return up.url;
      const list = readEpisodeOrder();
      if (!list) return null;
      const i = list.urls.findIndex((u) => samePath(u, location.href));
      if (i < 0) return null;
      return list.urls[i + delta] || null;
    }

    // The site's own "up next" card, when the page renders it rather than the
    // player frame. Taking it is better than navigating: it keeps the site's
    // own resume behaviour.
    function pageUpNext() {
      const sel = Rules.selector(state.page.upNextOverlay);
      if (!sel) return null;
      for (const el of qsa(sel)) {
        if (Spatial.isVisible(el, window)) return el;
      }
      return null;
    }

    function takePageUpNext() {
      const overlay = pageUpNext();
      if (!overlay) return false;
      const control = qsa("a[href], button, [role='button']", overlay).find((el) => Spatial.isVisible(el, window));
      return click(control || overlay);
    }

    function syncUpNextOffer() {
      if (state.kind !== "video") return;
      const showing = Boolean(pageUpNext());
      if (showing === state.offerShowing) return;
      state.offerShowing = showing;
      send({ type: "player:offer", showing });
    }

    function goEpisode(delta) {
      if (delta > 0 && takePageUpNext()) return true;
      const url = episodeUrl(delta);
      if (!url) {
        state.hints.show([{ keys: delta > 0 ? "▶▶" : "◀◀", label: delta > 0 ? "No next episode" : "No previous episode" }], 2500, true);
        return true;
      }
      return goSideways(url);
    }

    // The viewer hid the up-next card (`dismissed`): nothing plays by itself.
    function onPlayerEnded(msg) {
      const upNext = msg && msg.upNext ? msg.upNext : state.playerState && state.playerState.upNext;
      state.playerState = Object.assign({}, state.playerState, { ended: true, paused: true, upNext: upNext || null });
      if (!state.settings.autoplayNext || (msg && msg.dismissed === true)) return;
      const href = location.href;
      setTimeout(() => {
        // The site may advance on its own (up-next overlay); only act if it did not.
        if (location.href === href && state.enabled) goEpisode(1);
      }, AUTOPLAY_DELAY_MS);
    }

    function playerAction(action) {
      if (state.kind !== "video") return false;
      if (action === "next") return goEpisode(1);
      if (action === "previous") return goEpisode(-1);
      const step = state.settings.seekStep;
      const commands = {
        play_pause: { cmd: "toggle" },
        stop: { cmd: "stop" },
        fast_forward: { cmd: "seek", by: 3 * step },
        rewind: { cmd: "seek", by: -3 * step }
      };
      const c = commands[action];
      if (!c) return false;
      send(Object.assign({ type: "player:command" }, c));
      return true;
    }

    Object.assign(P, {
      markVideoElements, syncDock, focusScreen, playFromScreen, sendHistoryMeta, episodeDetails,
      episodeInfo, setTheater, enterPlayer, leavePlayer, captureEpisodeOrder, readEpisodeOrder,
      episodeUrl, pageUpNext, takePageUpNext, syncUpNextOffer, goEpisode, onPlayerEnded,
      playerAction
    });
  }

  globalThis.TenfootPageVideo = Object.freeze({ install });
})();
