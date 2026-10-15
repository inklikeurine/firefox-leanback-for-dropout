// Leanback for Dropout — a live stream played in place, for content/page.js.
// Dropout 24/7's page (a hub: its Live now banner and Watch) is where the
// rail goes. Its Watch would open the stream's own page, and Firefox lets the
// sound on only for a press on the page the player is in, which that would
// not be. So Watch reads the stream's page here with the page's own fetch
// (Dropout's own address, the viewer's own sign-in), takes the
// address of its player, and puts that player over this page in the full
// window: the press was on this page, so the sound can come on. Back takes
// it away again. Without a player address to read, Watch opens the stream's
// page as a link would. Installed into the page script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const PLAYER_ORIGIN = "https://embed.vhx.tv";
    const root = document.documentElement;
    const { qs, textOf } = globalThis.TenfootCommon;

    // From the rest of the page script.
    const send = (...a) => P.send(...a);
    const go = (...a) => P.go(...a);
    const focusEl = (...a) => P.focusEl(...a);
    const showHints = (...a) => P.showHints(...a);
    const onPlayEntry = (...a) => P.onPlayEntry(...a);
    const pushPlay = (...a) => P.pushPlay(...a);
    const notePlay = (...a) => P.notePlay(...a);
    const leavePlay = (...a) => P.leavePlay(...a);

    function liveRules() {
      return (state.rules && state.rules.live) || {};
    }

    // A link to a live stream's page (Dropout 24/7's), by its address.
    function isLiveLink(href) {
      const path = liveRules().path;
      if (!path || !href) return false;
      try {
        const u = new URL(href, location.href);
        return u.origin === location.origin && new RegExp(path).test(u.pathname);
      } catch (_err) {
        return false;
      }
    }

    // A page of the site, read by the page's own fetch (through the Xray
    // wrapper), so the request is the page's: same origin, the viewer's
    // sign-in. Null without one.
    async function pageText(url) {
      const page = window.wrappedJSObject;
      if (!page || typeof page.fetch !== "function") return null;
      const res = await page.fetch(url, cloneInto({ credentials: "include" }, window));
      return res && res.ok ? String(await res.text()) : null;
    }

    // The stream's player address and title, read from its page; null when
    // the page cannot be read or holds no player of Dropout's.
    async function readStream(url) {
      try {
        const text = await pageText(url);
        if (!text) return null;
        const doc = new DOMParser().parseFromString(text, "text/html");
        const frame = qs(liveRules().player, doc);
        const src = frame ? frame.getAttribute("src") || "" : "";
        if (new URL(src, url).origin !== PLAYER_ORIGIN) return null;
        return { src: new URL(src, url).href, title: textOf(qs(liveRules().title, doc)) };
      } catch (err) {
        console.warn("[leanback-for-dropout] the stream's page could not be read:", err && err.message);
        return null;
      }
    }

    // Watch on a link to a live stream: the stream, here.
    function playInPlace(url) {
      if (state.inPlace || state.inPlaceLoading) return true;
      state.inPlaceLoading = true;
      const here = location.href;
      readStream(url).then((stream) => {
        state.inPlaceLoading = false;
        if (!state.enabled || state.leaving || location.href !== here) return;
        if (!stream) {
          go(url); // the stream's own page, as the link would
          return;
        }
        openInPlace(stream);
      });
      return true;
    }

    function openInPlace(stream) {
      const box = document.createElement("div");
      box.className = "tenfoot-inplace";
      const frame = document.createElement("iframe");
      frame.setAttribute("allow", "autoplay; fullscreen; encrypted-media");
      frame.setAttribute("allowfullscreen", "");
      frame.title = stream.title || "Video Player";
      frame.src = stream.src;
      box.appendChild(frame);
      root.appendChild(box);
      state.inPlace = { box, frame, title: stream.title, told: false };
      root.classList.add("tenfoot-inplace-on");
      // A step of its own in the history, as a video playing has: Back is
      // this page again.
      pushPlay();
      state.ring.hide();
      state.hints.hide();
      state.menu.close();
      try {
        frame.focus();
      } catch (_err) { /* the frame takes the keys once it is up */ }
      state.playerFocused = true;
    }

    // The player frame reporting in: play, the press being the viewer's, and
    // the keys to it.
    function syncInPlace() {
      if (!state.inPlace) return;
      state.holdSeq += 1;
      const msg = { type: "player:hold", on: false, play: true, gesture: !state.inPlace.told, seq: state.holdSeq };
      send(msg).then((r) => {
        if (r && r.ok && state.inPlace) state.inPlace.told = true;
      });
      send({ type: "player:focus" });
    }

    function closeInPlace() {
      const p = state.inPlace;
      if (!p) return false;
      state.inPlace = null;
      p.box.remove();
      root.classList.remove("tenfoot-inplace-on");
      notePlay(false);
      state.playerFocused = false;
      const t = state.screen ? state.screen.current || state.screen.initialTarget() : null;
      if (t) focusEl(t, { scroll: false });
      else state.ring.refresh();
      showHints();
      return true;
    }

    // Back while it plays: off its step in the history (the popstate closes
    // it), or closed straight away when there is no step.
    function backInPlace() {
      if (!state.inPlace) return false;
      return leavePlay() || closeInPlace();
    }

    function followInPlace() {
      if (state.inPlace && !onPlayEntry()) closeInPlace();
    }

    // What the player frame asks the page (page:info): nothing held, and the
    // stream's name for its title.
    function inPlaceInfo() {
      return { ok: true, hold: false, title: state.inPlace.title || "", series: "", season: null, episode: null };
    }

    Object.assign(P, {
      isLiveLink, playInPlace, syncInPlace, closeInPlace, backInPlace, followInPlace, inPlaceInfo
    });
  }

  globalThis.TenfootPageLive = Object.freeze({ install });
})();
