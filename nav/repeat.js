// Leanback for Dropout — a held button's repeats, on Leanback's own clock.
// Site-agnostic and pure (the clock and the move are passed in).
//
// Remotes send a held button in one of two ways, and both are a hold here:
//   - one press held down: a keydown, the system's repeats (event.repeat),
//     then a keyup;
//   - many quick separate presses, when the remote repeats by itself: each
//     press arriving within CHAIN_MS of the same button's release carries the
//     hold on, rather than being a new press.
//
// The settings (Accessibility → Remote):
//   repeatDelay — "system": the system's repeats, no faster than repeatRate
//                 (as before); a number of ms: Leanback's own repeats start
//                 that long after the press (the system's are ignored);
//                 "never": a held button moves once.
//   repeatRate  — moves a second while held.
//   bounceMs    — a second press of the same button this soon after its
//                 release is ignored (0: off). A remote's own repeating is
//                 still a hold: its presses count once the hold is that old.
//
// Only moves (the arrows) are timed here; everything else passes.

(function () {
  const CHAIN_MS = 150; // a press this soon after its release: the hold going on
  const HEARTBEAT_MS = 500; // the system's repeats stopping this long: the button is up
  const SAFETY_MS = 30000; // no hold repeats longer than this
  const MOVES = new Set(["up", "down", "left", "right"]);
  const DEFAULTS = Object.freeze({ repeatDelay: "system", repeatRate: 12, bounceMs: 0 });

  function timing(s) {
    const o = s || {};
    const rate = Number(o.repeatRate) > 0 ? Number(o.repeatRate) : DEFAULTS.repeatRate;
    let delay = null;
    if (o.repeatDelay === "never") delay = Infinity;
    else if (typeof o.repeatDelay === "number" && o.repeatDelay >= 0) delay = o.repeatDelay;
    const bounce = Number(o.bounceMs) > 0 ? Number(o.bounceMs) : 0;
    return { delay, interval: 1000 / rate, bounce };
  }

  /** True when any of the three is not as it was before they existed. */
  function isCustom(s) {
    const o = s || {};
    return (o.repeatDelay !== undefined && o.repeatDelay !== DEFAULTS.repeatDelay)
      || (o.repeatRate !== undefined && o.repeatRate !== DEFAULTS.repeatRate)
      || (o.bounceMs !== undefined && o.bounceMs !== DEFAULTS.bounceMs);
  }

  /**
   * @param {{ settings: () => object, move: (action: string) => boolean,
   *           now?: () => number, setTimeout?: Function, clearTimeout?: Function }} o
   *   move: do the move for a repeat of Leanback's own; false stops the hold.
   */
  function createRepeater(o) {
    const now = o.now || (() => performance.now());
    const later = o.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const cancel = o.clearTimeout || ((t) => clearTimeout(t));
    const released = new Map(); // key → when it was last let go
    let hold = null; // { key, action, start, lastMove, down, lastRepeat }
    let timer = 0;

    function stopTimer() {
      if (timer) cancel(timer);
      timer = 0;
    }

    /** The hold is over: nothing more repeats. */
    function end() {
      stopTimer();
      hold = null;
    }

    function arm(tm) {
      stopTimer();
      if (!hold || !Number.isFinite(tm.delay)) return;
      const h = hold;
      const tick = () => {
        timer = 0;
        if (hold !== h || !h.down) return;
        const t = now();
        if (t - h.start > SAFETY_MS || (h.lastRepeat && t - h.lastRepeat > HEARTBEAT_MS)) {
          end();
          return;
        }
        h.lastMove = t;
        if (o.move(h.action) === false) {
          end();
          return;
        }
        timer = later(tick, tm.interval);
      };
      timer = later(tick, Math.max(0, h.start + tm.delay - now()));
    }

    /**
     * A keydown whose action is known. Returns "move" (do it now), "skip"
     * (swallow it) or "pass" (not a move: handle it as always).
     */
    function keydown(e, action) {
      if (!MOVES.has(action)) {
        if (!e.repeat) end();
        return "pass";
      }
      const t = now();
      const tm = timing(o.settings());
      if (e.repeat && hold && hold.key === e.key) {
        hold.lastRepeat = t;
        if (tm.delay !== null) return "skip"; // Leanback's own clock, or no repeat
        if (t - hold.lastMove < tm.interval) return "skip";
        hold.lastMove = t;
        return "move";
      }
      const rel = released.get(e.key);
      if (!e.repeat && hold && hold.key === e.key && !hold.down && rel !== undefined && t - rel <= CHAIN_MS) {
        // The remote repeating by itself: the hold goes on.
        hold.down = true;
        const wait = tm.delay === null ? tm.bounce : Math.max(tm.delay, tm.bounce);
        if (tm.delay === Infinity || t - hold.start < wait || t - hold.lastMove < tm.interval) return "skip";
        hold.lastMove = t;
        return "move";
      }
      // A new hold.
      end();
      hold = { key: e.key, action, start: t, lastMove: -Infinity, down: true, lastRepeat: 0 };
      const bounced = !e.repeat && tm.bounce > 0 && rel !== undefined && t - rel < tm.bounce;
      if (!bounced) hold.lastMove = t;
      arm(tm);
      return bounced ? "skip" : "move";
    }

    function keyup(e) {
      released.set(e.key, now());
      if (hold && hold.key === e.key) {
        hold.down = false;
        stopTimer();
      }
    }

    return Object.freeze({ keydown, keyup, end });
  }

  globalThis.TenfootRepeat = Object.freeze({ createRepeater, timing, isCustom, DEFAULTS, CHAIN_MS, MOVES });
})();
