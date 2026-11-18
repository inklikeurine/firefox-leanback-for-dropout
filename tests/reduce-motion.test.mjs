// Reduce Motion (Accessibility) set in Leanback reaches what used to follow
// only the system's setting: the ring's glide and the player frame (#19).
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';
import { boot } from './player-support.mjs';

const PAD = 6; // ring width 4 + 2

function ringPage({ motion = null } = {}) {
  const d = makeDom({ clock: true,
    html: '<!doctype html><html><body><div id="track"><a id="a" data-rect="100,200,352,198">A</a><a id="b" data-rect="472,200,352,198">B</a></div></body></html>',
  });
  const win = d.window;
  // The system says nothing about motion.
  win.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  if (motion) win.document.documentElement.dataset.tenfootMotion = motion;
  d.runScripts([T.extFile('lib/common.js'), T.extFile('nav/focus-ring.js')]);
  const ring = win.TenfootFocusRing.createRing(win.document, { width: 4, zoom: 0 });
  const left = () => {
    const m = /translate\(([-\d.]+)px/.exec(ring.element.style.transform);
    return m ? Number(m[1]) : null;
  };
  return { win, ring, left, $: (id) => win.document.getElementById(id) };
}

T.runAsync("Leanback's Reduce Motion on, the system's off: the ring jumps, no glide", async () => {
  const p = ringPage({ motion: 'reduce' });
  p.ring.follow(p.$('a'));
  p.ring.follow(p.$('b'));
  T.eq(p.left(), 472 - PAD);
});

T.runAsync("TenfootCommon.prefersReducedMotion follows Leanback's setting on the page's root", async () => {
  const p = ringPage({ motion: 'reduce' });
  T.eq(p.win.TenfootCommon.prefersReducedMotion(p.win), true);
});

T.runAsync("the player frame gets Leanback's Reduce Motion, and loses it when turned off", async () => {
  const { win, shim } = await boot({ settings: { reduceMotion: 'on' } });
  const root = win.document.documentElement;
  T.eq(root.dataset.tenfootMotion, 'reduce');
  await shim.changeStorage({ settings: { newValue: { reduceMotion: 'off' } } });
  await T.sleep(20);
  T.eq(root.dataset.tenfootMotion, undefined);
});
await T.exit();
