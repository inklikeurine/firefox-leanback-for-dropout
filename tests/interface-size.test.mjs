// Interface Size: a show's episodes (and a list, and search's results) fit as
// many cards across as there is room for (content/home.css), and the remote
// moves by the number across the browser actually drew.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, URLS, boot, V, hrefNow } from './page-support.mjs';

// jsdom draws nothing: the grid's columns as Firefox reports them for a grid
// laid out three across (Interface Size 130 %).
function drawnThreeAcross(p) {
  const real = p.win.getComputedStyle.bind(p.win);
  p.win.getComputedStyle = (el, pseudo) => {
    const cs = real(el, pseudo);
    if (!el || !el.matches || !el.matches('.tenfoot-screen-grid[data-tenfoot-fit]')) return cs;
    return new Proxy(cs, { get: (t, k) => (k === 'gridTemplateColumns' ? '531px 531px 531px' : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
  };
}

T.runAsync('Interface Size: a show\'s episodes are a grid that fits the room (marked for content/home.css)', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  const grid = p.doc.querySelector('.tenfoot-screen-grid');
  T.ok(grid && grid.hasAttribute('data-tenfoot-fit'), 'the episodes\' grid fits');
});

T.runAsync('Interface Size: drawn three across, ▶ stops after three and ▼ goes to the fourth episode', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  drawnThreeAcross(p);
  await p.shim.changeStorage({ settings: { newValue: { uiScale: 130 } } });
  await T.sleep(250);
  T.eq(hrefNow(p), V(1));
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(hrefNow(p), V(3));
  p.key('ArrowRight');
  T.eq(hrefNow(p), V(3), 'three across: the row ends');
  p.key('ArrowLeft'); p.key('ArrowLeft');
  p.key('ArrowDown');
  T.eq(hrefNow(p), V(4), '▼ from the first: the fourth, under it');
});
await T.exit();
