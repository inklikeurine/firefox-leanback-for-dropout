// nav/focus-ring.js — where the ring goes. jsdom has no layout or
// transitions, so each test sets the rects (data-rect) and what
// getComputedStyle reports mid-animation.
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';

const PAD = 6; // ring width 4 + 2

function setup({ reduced = false } = {}) {
  const d = makeDom({ clock: true,
    html: '<!doctype html><html><body><div id="track"><a id="a" data-rect="100,200,352,198">A</a><a id="b" data-rect="472,200,352,198">B</a></div></body></html>',
  });
  const win = d.window;
  const computed = new Map(); // element → { transform }
  const real = win.getComputedStyle.bind(win);
  win.getComputedStyle = (el) => {
    const c = real(el);
    const o = computed.get(el);
    return o ? new Proxy(c, { get: (t, k) => (k in o ? o[k] : t[k]) }) : c;
  };
  if (reduced) win.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  d.runScripts([T.extFile('lib/common.js'), T.extFile('nav/focus-ring.js')]);
  const ring = win.TenfootFocusRing.createRing(win.document, { width: 4, zoom: 0 });
  const box = () => {
    const el = ring.element;
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
    return m ? [Number(m[1]), Number(m[2]), parseFloat(el.style.width), parseFloat(el.style.height)] : null;
  };
  const $ = (id) => win.document.getElementById(id);
  return { win, ring, box, $, computed };
}

T.runAsync('a ring with nothing on screen appears on its target at once', async () => {
  const p = setup();
  p.ring.follow(p.$('a'));
  T.eq(p.box(), [100 - PAD, 200 - PAD, 352 + PAD * 2, 198 + PAD * 2]);
  T.notOk(p.ring.element.hidden);
});

T.runAsync('the ring glides to the next target and ends exactly on it', async () => {
  const p = setup();
  p.ring.follow(p.$('a'));
  p.ring.follow(p.$('b'));
  const x = p.box()[0];
  T.ok(x >= 100 - PAD && x < 472 - PAD - 100, `it starts from where it was (at ${x})`);
  await T.sleep(200);
  T.eq(p.box(), [472 - PAD, 200 - PAD, 352 + PAD * 2, 198 + PAD * 2]);
});

T.runAsync('a row still sliding: the ring aims where the card will stop, not where it is', async () => {
  const p = setup();
  const track = p.$('track');
  // Leanback set the row to slide 372 px left; 100 px of it done so far.
  track.style.transform = 'translateX(-372px)';
  p.computed.set(track, { transform: 'matrix(1, 0, 0, 1, -100, 0)' });
  p.$('b').setAttribute('data-rect', '372,200,352,198');
  p.ring.follow(p.$('b'));
  T.eq(p.box()[0], 100 - PAD, 'card B ends where A was: the ring goes straight there');
  // The slide moves on; the ring does not move with it.
  p.computed.set(track, { transform: 'matrix(1, 0, 0, 1, -300, 0)' });
  p.$('b').setAttribute('data-rect', '172,200,352,198');
  p.ring.refresh();
  await T.sleep(50);
  T.eq(p.box()[0], 100 - PAD);
});

T.runAsync('a card still growing: the ring takes its full size straight away', async () => {
  const p = setup();
  p.ring.setStyle({ zoom: 5 });
  const a = p.$('a');
  // Halfway through the grow: drawn at 1.025, heading for 1.05.
  p.computed.set(a, { transform: 'matrix(1.025, 0, 0, 1.025, 0, 0)' });
  a.setAttribute('data-rect', `${276 - 352 * 1.025 / 2},${299 - 198 * 1.025 / 2},${352 * 1.025},${198 * 1.025}`);
  p.ring.follow(a);
  const [, , w, h] = p.box();
  T.eq([w, h], [Math.round(352 * 1.05 * 10) / 10 + PAD * 2, Math.round(198 * 1.05 * 10) / 10 + PAD * 2]);
});

T.runAsync('reduced motion: no glide, the ring jumps', async () => {
  const p = setup({ reduced: true });
  p.ring.follow(p.$('a'));
  p.ring.follow(p.$('b'));
  T.eq(p.box()[0], 472 - PAD);
});

T.runAsync('hidden, then shown elsewhere: it appears there, no glide across the screen', async () => {
  const p = setup();
  p.ring.follow(p.$('a'));
  p.ring.hide();
  p.ring.follow(p.$('b'));
  T.eq(p.box()[0], 472 - PAD);
});

await T.exit();
