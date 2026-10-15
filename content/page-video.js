// Leanback for Dropout — an episode's page, for content/page.js: its details
// page and the video held behind it until Watch, the video playing in the
// full window, the hand-off into and out of the player frame, next and
// previous episode, the site's up-next offer, autoplay, media keys, and what
// the page tells the watch history. Installed into the page script's shared
// context.
//
// An episode's page is in one of two states (state.watch):
//   "details" — Leanback's details page of the episode; Dropout's player is
//               loaded underneath and held, so nothing plays;
//   "playing" — the video in the full window. Starting it adds a step to the
//               history (page-back.js pushPlay), so Back is the details page.
// Arriving from an episode that was playing (the next one, by the up-next
// card, the next-episode key or Dropout's own countdown) and a reload while
// playing go straight to "playing". Dropout 24/7's stream is an episode like
// any other here: its details page first, so the press of Watch can bring the
// sound. A page with nothing to draw the details from is Dropout's own,
// playing as it comes.

(function () {
  function install(P) {
    const { state } = P;
    const THEATER_CLASS = "tenfoot-theater";
    const EPISODES_KEY = "tenfoot.episodes";
    const AUTOPLAY_DELAY_MS = 1200;
    const PLAY_CHECK_MS = 2500; // after Watch, the frame still saying it holds the video: say play again…
    const PLAY_CHECKS = 2; // …this many times
    const root = document.documentElement;
    const Rules = globalThis.TenfootSiteRules;
    const Spatial = globalThis.TenfootSpatial;
    const Ring = globalThis.TenfootFocusRing;
    const History = globalThis.TenfootHistory;
    const { qs, qsa, clock } = globalThis.TenfootCommon;

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
    const showHints = (...a) => P.showHints(...a);
    const notice = (...a) => P.notice(...a);
    const onPlayEntry = (...a) => P.onPlayEntry(...a);
    const pushPlay = (...a) => P.pushPlay(...a);
    const notePlay = (...a) => P.notePlay(...a);

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

    // Dropout 24/7's stream, rather than an episode.
    function isLive() {
      return Boolean(qs(state.page.live));
    }

    // The episode before this one was playing when it went on to this one —
    // the up-next card, the next-episode key, Dropout's own countdown — so
    // this one plays straight away too. Read once, on the way in.
    function playingThrough() {
      const from = state.arrivedFrom;
      state.arrivedFrom = null;
      if (!from || !from.play || from.kind !== "video" || samePath(from.url, location.href)) return false;
      const top = state.trail[state.trail.length - 1];
      return Boolean(top && top.group && top.group === from.group);
    }

    // On the way in: the details page, or the video playing.
    function setupWatch() {
      state.watch = null;
      if (state.kind !== "video") return;
      const through = playingThrough();
      if (!state.screen) {
        // Nothing to draw the details from: Dropout's page, playing.
        state.watch = "playing";
        setTheater(true);
      } else if (onPlayEntry() || through) {
        pushPlay();
        state.watch = "playing";
        setTheater(true);
      } else {
        state.watch = "details";
      }
      syncPlayer();
    }

    // Tell the player frame what the page is showing: the details page holds
    // the video; playing starts it (from the beginning, after Start Over).
    // Sent on every change and when the frame first reports in; the frame also
    // asks for itself (page:info), so whichever is first wins.
    // Each word is numbered, so the frame can tell a late one from the latest.
    function syncPlayer() {
      if (state.kind !== "video" || !state.watch) return;
      clearPlayCheck();
      state.holdSeq += 1;
      if (state.watch === "details") {
        send({ type: "player:hold", on: true, seq: state.holdSeq });
        return;
      }
      const msg = { type: "player:hold", on: false, play: true, restart: state.restartPending, gesture: state.watchGesture, seq: state.holdSeq };
      send(msg).then((r) => {
        if (!r || !r.ok) return; // the frame is not up yet: player:ready sends it again
        if (msg.restart) state.restartPending = false;
        state.watchGesture = false;
      });
      armPlayCheck();
    }

    // Watch said, and a moment later the frame still reports holding the
    // video (a word lost on the way): say it again, a bounded number of times.
    function armPlayCheck() {
      if (state.playChecks >= PLAY_CHECKS) return;
      state.playCheckTimer = setTimeout(() => {
        state.playCheckTimer = 0;
        const ps = state.playerState;
        if (state.watch !== "playing" || !state.enabled || !ps || ps.held !== true) return;
        state.playChecks += 1;
        syncPlayer();
      }, PLAY_CHECK_MS);
    }

    function clearPlayCheck() {
      if (!state.playCheckTimer) return;
      clearTimeout(state.playCheckTimer);
      state.playCheckTimer = 0;
    }

    // Where this episode was left, when it picks up there.
    function resumeAt() {
      if (!History) return null;
      return History.resumePoint(state.history, History.keyOf(location.href));
    }

    // Watch, Resume or Start Over on the details page (and play/pause on the
    // remote there): the video, in the full window. A press of the remote is
    // what lets Firefox turn the sound on, so the frame is told it was one.
    function startWatching(restart) {
      if (state.kind !== "video" || state.watch !== "details") return false;
      const at = restart ? null : resumeAt();
      pushPlay();
      state.watch = "playing";
      state.restartPending = Boolean(restart);
      state.watchGesture = true;
      state.playChecks = 0;
      // The page says where it picked up; the frame's own word on it would
      // come a second time.
      state.ownResumeNotice = true;
      setTheater(true);
      enterPlayer();
      syncPlayer();
      // After the key's own hints, which would cover it.
      if (at) setTimeout(() => notice(`Resumed at ${clock(at)}`), 0);
      return true;
    }

    // Back while playing: the details page, now saying Resume.
    function showDetails() {
      if (state.watch !== "playing" || !state.screen) return false;
      state.watch = "details";
      state.restartPending = false;
      state.watchGesture = false;
      notePlay(false);
      syncPlayer();
      setTheater(false);
      state.playerFocused = false;
      state.screen.refresh();
      const t = state.screen.initialTarget();
      if (t) focusEl(t, { scroll: false });
      showHints();
      return true;
    }

    // The history moved between the details page and the step above it, at
    // the same address (Back, or Forward again).
    function followPlay() {
      if (state.kind !== "video" || !state.screen) return;
      if (onPlayEntry()) startWatching(false);
      else showDetails();
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

    // The video in the full window (content/page.css: html.tenfoot-theater),
    // by style only: moving the frame in the page would reload it.
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
    }

    function enterPlayer() {
      const v = markVideoElements();
      if (!v.frame) {
        state.pendingPlayerFocus = true;
        if (v.mount) focusEl(v.mount, { scroll: false });
        return true;
      }
      state.pendingPlayerFocus = false;
      setTheater(true);
      try {
        v.frame.focus();
      } catch (_err) { /* the frame will still get keys once the user clicks it */ }
      state.playerFocused = true;
      state.hints.hide();
      if (v.mount) state.lastFocus = v.mount;
      state.ring.hide();
      send({ type: "player:focus" }).then((r) => {
        if (!r || !r.ok) state.pendingPlayerFocus = !state.playerReady;
      });
      return true;
    }

    // The player hands the keys back: Back, or ▼ past its control bar. On
    // the details page's episode there is nothing below the video; on
    // Dropout's own page there is the page.
    function leavePlayer(hint) {
      if (hint === "back") {
        state.playerFocused = false;
        return goBack();
      }
      if (state.screen) return true;
      // "below": the page must be visible for the ring to mean anything.
      state.playerFocused = false;
      setTheater(false);
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

    // Another episode, in place of this one. From the video playing it plays
    // straight away (playingThrough); from the details page it is that
    // episode's details page.
    function goEpisode(delta) {
      if (delta > 0 && state.watch === "playing" && takePageUpNext()) return true;
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
      if (state.watch !== "playing" || !state.settings.autoplayNext || (msg && msg.dismissed === true)) return;
      const href = location.href;
      setTimeout(() => {
        // The site may advance on its own (up-next overlay); only act if it did not.
        if (location.href === href && state.enabled && state.watch === "playing") goEpisode(1);
      }, AUTOPLAY_DELAY_MS);
    }

    // Media keys on the page. On the details page play/pause is Watch (or
    // Resume), and next/previous go to that episode's details page; there is
    // nothing playing to stop or skip.
    function playerAction(action) {
      if (state.kind !== "video" && !state.inPlace) return false;
      if (state.inPlace && (action === "next" || action === "previous")) return true; // a stream has no episodes
      if (action === "next") return goEpisode(1);
      if (action === "previous") return goEpisode(-1);
      if (state.watch === "details") return action === "play_pause" ? startWatching(false) : true;
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
      markVideoElements, isLive, setupWatch, syncPlayer, startWatching, showDetails, followPlay,
      sendHistoryMeta, episodeDetails, episodeInfo, setTheater, enterPlayer, leavePlayer,
      captureEpisodeOrder, readEpisodeOrder, episodeUrl, pageUpNext, takePageUpNext, syncUpNextOffer,
      goEpisode, onPlayerEnded, playerAction
    });
  }

  globalThis.TenfootPageVideo = Object.freeze({ install });
})();
