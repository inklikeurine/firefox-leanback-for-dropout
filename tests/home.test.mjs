// The Home screen (read by content/home.js, drawn by content/screen.js, wired
// by content/page.js) and the icon rail, under jsdom on the home.html fixture
// — markup in the shape of Dropout's own Home. jsdom has no layout, so these check the model: which
// element holds the selection, what rows exist, what was sent where.
import fs from 'node:fs';
import path from 'node:path';
import { T, loadScript, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';

const rules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));
const fixture = (n) => fs.readFileSync(path.join(T.testsDir, 'fixtures', n), 'utf8');
const manifest = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8'));
const FILES = manifest.content_scripts
  .find((cs) => cs.matches.some((m) => m.includes('watch.dropout.tv')))
  .js.map((f) => T.extFile(f));
const H = loadScript(T.extFile('lib/history.js'), {}).TenfootHistory;
const B = 'https://watch.dropout.tv';

async function boot({ html = fixture('home.html'), url = `${B}/browse`, settings = {}, progress = null, before = null } = {}) {
  const storage = { settings: { ...settings } };
  if (progress) storage['progress:0'] = progress;
  const shim = makeBrowserShim({ tabs: [{ id: 1, url, active: true }], storage });
  const bg = [];
  // The background's part, for real: history messages are applied with
  // lib/history.js and broadcast the way storage.onChanged would.
  shim.browser.runtime.onMessage.addListener((m, s, send) => {
    bg.push(m);
    if (m.type === 'rules:get') send({ ok: true, rules });
    else if (m.type === 'exit') send({ ok: true, action: 'none' });
    else if (m.type === 'settings:set') {
      shim.store.settings = { ...(shim.store.settings || {}), ...m.patch };
      shim.changeStorage({ settings: { newValue: shim.store.settings } });
      send({ ok: true, settings: shim.store.settings });
    } else if (m.type.startsWith('history:')) {
      const before = H.normalize(shim.store['progress:0']);
      let after = before;
      if (m.type === 'history:observe') after = H.applyObservations(before, m.items, Date.now());
      if (m.type === 'history:clear') after = H.forget(before, Date.now());
      if (after !== before) {
        shim.store['progress:0'] = after;
        shim.changeStorage({ 'progress:0': { newValue: after } });
      }
      send({ ok: true });
    } else send({ ok: true });
    return false;
  });
  const dom = makeDom({ clock: true, html, url, browser: shim.browser });
  const win = dom.window;
  win.__went = [];
  win.history.go = (d) => win.__went.push(d);
  if (before) before(win);
  dom.runScripts(FILES);
  await T.sleep(60);
  const listener = shim.listeners.message[1].fn;
  const msg = (m) => new Promise((res) => listener(m, { tab: { id: 1 }, frameId: 0 }, res));
  const state = () => msg({ type: 'page:state' });
  const key = (k, init) => dom.key(k, init);
  const doc = win.document;
  const active = () => doc.activeElement;
  const home = async () => (await state()).home;
  return { shim, dom, win, doc, bg, msg, state, key, active, home, last: (type) => bg.filter((m) => m.type === type).at(-1) };
}

const hrefOf = (el) => (el && el.getAttribute('href')) || null;
const railOf = (el) => (el && el.dataset && el.dataset.tenfootRail) || null;

// ---------------------------------------------------------------------------

T.runAsync('Home: Leanback draws its own screen over Dropout’s page, from the page’s own tiles', async () => {
  const p = await boot();
  const s = await p.state();
  T.eq([s.kind, s.home.ready, s.home.shown], ['browse', true, true]);
  T.eq(p.doc.documentElement.dataset.tenfootHome, 'on');
  const layer = p.doc.querySelector('.tenfoot-home');
  T.ok(layer && layer.parentElement === p.doc.documentElement, 'a child of <html>, outside the site’s tree');
  T.ok(p.doc.getElementById('browse-component'), 'Dropout’s page is still there, untouched');
  T.eq(s.home.rows.map((r) => r.title), ['Continue Watching', 'New Releases', 'Trending'], 'no My List row: My List is on the rail');
  T.notOk(p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/my-list"]`));
  T.ok(p.doc.querySelector('#browse-component a.view-more-link[href="my-list"]'), 'Dropout’s own row is still there underneath, untouched');
  T.eq(s.home.rows.find((r) => r.title === 'New Releases').count, 13, '12 cards, clones skipped, then View all');
  T.eq(s.home.slides, 2);
  T.eq(hrefOf(p.active()), `${B}/game-changer`, 'the selection starts on the banner’s Watch now');
  T.eq(p.active().textContent, 'Watch now');
  const buttons = Array.from(p.doc.querySelectorAll('.tenfoot-hero-actions > *')).map((b) => b.textContent);
  T.eq(buttons, ['Watch now', '›', 'Trailer', 'My List'], 'Watch now, Next featured beside it, then Dropout’s other buttons');
  T.eq(p.doc.querySelector('.tenfoot-hero-title').textContent, 'Game Changer');
});

// On a fresh load Dropout draws the featured banner after Home is already up:
// Continue Watching comes from Leanback's own history at once (0.18.1 landed
// there, and stayed). The banner is taken out before the scripts run and put
// back afterwards, the order the real site was seen in (2026-09-27 captures).
const lateBanner = (win) => {
  const c = win.document.querySelector('#browse-component .carousel');
  win.__banner = { node: c, parent: c.parentNode, next: c.nextSibling };
  c.remove();
};
const bannerArrives = async (p) => {
  const b = p.win.__banner;
  b.parent.insertBefore(b.node, b.next);
  await T.sleep(150);
};

T.runAsync('Home: a fresh load lands on the banner’s Watch now even when Dropout draws the banner last', async () => {
  const p = await boot({ before: lateBanner });
  T.ok(p.active().closest('.tenfoot-card'), 'no banner yet: on a card meanwhile');
  await bannerArrives(p);
  T.eq(p.active().textContent, 'Watch now', 'the banner arrived: Watch now');
  T.eq(hrefOf(p.active()), `${B}/game-changer`);
  const s = await p.state();
  T.eq(s.home.row, 'hero');
  T.notOk(p.doc.querySelector('.tenfoot-home').hasAttribute('data-tenfoot-scrolled'), 'Home back at the top');
});

T.runAsync('Home: a banner arriving late leaves the selection alone once the viewer has moved', async () => {
  const p = await boot({ before: lateBanner });
  const first = p.active();
  p.key('ArrowRight');
  const moved = p.active();
  T.ok(moved !== first && moved.closest('.tenfoot-card'), '▶ to the next card');
  await bannerArrives(p);
  T.eq(p.active(), moved, 'still where the viewer put it');
  const q = await boot({ before: lateBanner });
  const card = q.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/trending"] .tenfoot-card-link`);
  card.focus();
  await bannerArrives(q);
  T.eq(q.active(), card, 'a click on a card counts too');
});

T.runAsync('Home: cards carry the tile’s link, picture, title, badge, length and progress', async () => {
  const p = await boot();
  const card = p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/new-releases"] .tenfoot-card[data-tenfoot-card="${B}/videos/nr-2"]`);
  T.ok(card, 'card for nr-2');
  T.eq(card.querySelector('.tenfoot-card-link').getAttribute('href'), `${B}/videos/nr-2`);
  T.eq(card.querySelector('.tenfoot-card-art').getAttribute('src'), `${B}/art-3.svg`);
  T.eq(card.querySelector('.tenfoot-card-title').textContent, 'Run, Run, As Fast As You Can');
  T.ok(card.querySelector('.tenfoot-card-badge').hidden, 'no “New” on New Releases: the row says so already');
  T.eq(card.querySelector('.tenfoot-card-badge').textContent, '');
  T.eq(card.querySelector('.tenfoot-card-time').textContent, '30:00');
  const padded = p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/new-releases"] .tenfoot-card[data-tenfoot-card="${B}/videos/nr-3"]`);
  T.eq(padded.querySelector('.tenfoot-card-time').textContent, '6:03', 'Dropout’s “06:03” without the leading zero');
  T.eq(card.querySelector('.tenfoot-card-progress-fill').style.width, '30%');
  const series = p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/trending"] .tenfoot-card`);
  T.eq(series.querySelector('.tenfoot-card-sub').textContent, '9 seasons');
  T.eq(series.querySelector('.tenfoot-card-badge').textContent, 'New Episode', 'badges stay on the other rows');
  T.notOk(series.querySelector('.tenfoot-card-badge').hidden);
  T.ok(series.querySelector('.tenfoot-card-progress').hidden, 'no bar where Dropout draws none');
  const viewAll = p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/new-releases"] .tenfoot-card:last-child`);
  T.eq(viewAll.dataset.tenfootViewall, 'true');
  T.eq(viewAll.querySelector('.tenfoot-card-link').getAttribute('href'), `${B}/new-releases`, 'View all goes to the whole collection');
  T.notOk(p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/trending"] [data-tenfoot-viewall]`), 'a short row has no View all');
});

// What React attaches to a tile element: the fiber, whose parent component
// carries the tile's data. The live check does the same from the page's own
// script (layout.js), behind wrappedJSObject.
function reactTiles(win, { skip = [], getter = [] } = {}) {
  for (const el of win.document.querySelectorAll('[data-fixture-thumbnail]')) {
    const href = el.querySelector('a[href]').getAttribute('href');
    if (skip.some((s) => href.endsWith(s))) continue;
    const props = { thumbnailType: 'aspect_ratio_2_3' };
    if (getter.some((s) => href.endsWith(s))) {
      Object.defineProperty(props, 'data', { enumerable: true, get() { win.__getterRan = true; return { thumbnail: { medium: 'https://evil.test/x.jpg' } }; } });
    } else props.data = { thumbnail: { medium: el.getAttribute('data-fixture-thumbnail') } };
    el['__reactFiber$test'] = { memoizedProps: { className: el.className }, return: { memoizedProps: props } };
  }
}

T.runAsync('Home: a show’s tile draws its wide picture from the tile’s data, not Dropout’s tall poster', async () => {
  const p = await boot({ before: (win) => reactTiles(win, { skip: ['/dirty-laundry'], getter: ['/um-actually'] }) });
  const art = (slug) => p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/trending"] .tenfoot-card[data-tenfoot-card="${B}/${slug}"] .tenfoot-card-art`).getAttribute('src');
  T.eq(art('game-changer'), `${B}/art-1.svg`, 'the wide picture, the one the show’s page uses');
  T.eq(art('make-some-noise'), `${B}/art-3.svg`);
  T.ok(art('dirty-laundry').startsWith(`${B}/poster.svg`), 'no data on the tile: its poster, as before');
  T.ok(art('um-actually').startsWith(`${B}/poster.svg`), 'a getter is page code: never run, so the poster');
  T.notOk(p.win.__getterRan, 'the getter did not run');
  const video = p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/new-releases"] .tenfoot-card[data-tenfoot-card="${B}/videos/nr-2"] .tenfoot-card-art`);
  T.eq(video.getAttribute('src'), `${B}/art-3.svg`, 'an episode’s picture is already wide, and is left alone');
});

T.runAsync('Home: Continue Watching merges Leanback’s history with Dropout’s bars, most recent first', async () => {
  const progress = { entries: { 'street-sharts': {
    url: `${B}/dimension-20/season:25/videos/street-sharts`, title: 'Street Sharts', series: 'Dimension 20', image: 'https://vhx.imgix.net/s.jpg',
    duration: 6000, local: { position: 3000, at: Date.now() - 60_000 }
  } } };
  const p = await boot({ progress });
  const obs = p.last('history:observe');
  T.ok(obs, 'Dropout’s bars were reported to the history');
  T.eq(obs.items.map((i) => [i.key, i.percent]), [['lie-detector-1', 40], ['nr-1', 100], ['nr-2', 30]]);
  await T.sleep(150);
  const cw = p.doc.querySelector('.tenfoot-row[data-tenfoot-row="continue-watching"]');
  const cards = Array.from(cw.querySelectorAll('.tenfoot-card')).map((c) => c.dataset.tenfootCard);
  T.eq(cards, [`${B}/videos/lie-detector-1`, `${B}/videos/nr-2`, `${B}/dimension-20/season:25/videos/street-sharts`], 'the Roku’s two, just seen, then Firefox’s from a minute ago; finished nr-1 left out');
  const mine = cw.querySelector('.tenfoot-card:last-child');
  T.eq(mine.querySelector('.tenfoot-card-sub').textContent, 'Dimension 20');
  T.eq(mine.querySelector('.tenfoot-card-time').textContent, '50:00 left', 'the time left, on the picture, as a clock');
  T.notOk(mine.querySelector('.tenfoot-card-time').hidden);
  T.eq(mine.querySelector('.tenfoot-card-progress-fill').style.width, '50%');
});

// Dropout's own Continue Watching row, drawn first on days something is in
// progress on the Roku or the Android app (2026-09-24 screenshot): an ordinary
// row with View all. Built here from the New Releases row, one tile kept.
const dropoutContinueRow = (href) => (win) => {
  const doc = win.document;
  const row = doc.querySelector('.browse-row.new-releases').cloneNode(true);
  row.className = 'row browse-row full-width continue-watching';
  const [title, viewAll] = row.querySelectorAll('.horizontal-row-header a');
  title.firstChild.textContent = 'Continue Watching';
  title.setAttribute('href', href);
  viewAll.setAttribute('href', href);
  const keep = row.querySelector(`.slick-slide:not(.slick-cloned) a[href="${B}/videos/nr-2"]`).closest('.slick-slide');
  row.querySelectorAll('.slick-slide').forEach((s) => { if (s !== keep) s.remove(); });
  const link = row.querySelector('.browse-item-card a[href]');
  link.setAttribute('href', `${B}/videos/roku-ep`);
  link.querySelector('.truncate').textContent = 'On the Roku';
  row.querySelector("[data-testid='play-state-percentage-bar']").style.width = '25%';
  doc.getElementById('rows').prepend(row);
};

T.runAsync('Home: Dropout’s own Continue Watching row is not drawn; what is on it joins Leanback’s', async () => {
  for (const href of ['continue-watching', 'continue_watching']) {
    const p = await boot({ before: dropoutContinueRow(href) });
    await T.sleep(150);
    const s = await p.state();
    T.eq(s.home.rows.filter((r) => r.title === 'Continue Watching').length, 1, `one Continue Watching row (View all: ${href})`);
    T.eq(s.home.rows[0].key, 'continue-watching', 'Leanback’s own, first');
    T.notOk(p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/${href}"]`), 'Dropout’s row is not drawn');
    T.ok(p.doc.querySelector('#browse-component .browse-row.continue-watching'), 'it is still there underneath, untouched');
    const obs = p.last('history:observe');
    T.ok(obs.items.some((i) => i.key === 'roku-ep' && i.percent === 25), 'its progress bar reached the history');
    T.ok(p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="continue-watching"] .tenfoot-card[data-tenfoot-card="${B}/videos/roku-ep"]`), 'the Roku’s episode is on Leanback’s row');
  }
});

T.runAsync('Home: the time left is exact — minutes and seconds, hours when there are any, never rounded', async () => {
  const entry = (slug, duration, position) => ({
    url: `${B}/videos/${slug}`, title: slug, series: 'Test', image: 'https://vhx.imgix.net/t.jpg',
    duration, local: { position, at: Date.now() - 60_000 }
  });
  const progress = { entries: {
    long: entry('long', 6305, 1200),     // 5105 s left
    short: entry('short', 363, 194.6)    // 168.4 s left
  } };
  const p = await boot({ progress });
  await T.sleep(150);
  const left = (slug) => p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="continue-watching"] .tenfoot-card[data-tenfoot-card="${B}/videos/${slug}"] .tenfoot-card-time`).textContent;
  T.eq(left('long'), '1:25:05 left');
  T.eq(left('short'), '2:48 left', 'part-seconds dropped: 2:48, not 3 min or 2 min');
});

T.runAsync('Home: rows and columns — ▼ ▲ keep each row’s place; ◀ at the edge is the rail, ▶ comes back', async () => {
  const p = await boot();
  const row = async () => (await p.home()).row;
  p.key('ArrowDown');
  T.eq(hrefOf(p.active()), `${B}/videos/lie-detector-1`, 'Continue Watching: filled from Dropout’s own bars on the first visit');
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-2`);
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-2`, 'row end: no wrap');
  p.key('ArrowDown');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-1`, 'a row not visited yet starts at its first card');
  T.eq(await row(), `${B}/new-releases`, 'New Releases, straight after Continue Watching');
  p.key('ArrowRight');
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-3`);
  p.key('ArrowUp');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-2`, 'focus memory');
  T.eq(await row(), 'continue-watching');
  p.key('ArrowDown');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-3`, 'and back');
  p.key('ArrowUp');
  p.key('ArrowUp');
  T.eq(p.active().textContent, 'Watch now', 'up to the banner');
  p.key('ArrowLeft');
  T.eq(railOf(p.active()), 'home', 'the rail, on this page’s entry');
  const s = await p.state();
  T.eq([s.rail.active, s.rail.item, s.rail.page], [true, 'home', 'home']);
  p.key('ArrowDown');
  T.eq(railOf(p.active()), 'browse');
  p.key('ArrowRight');
  T.eq(p.active().textContent, 'Watch now', '▶ goes back where the selection came from');
  p.key('ArrowDown');
  p.key('ArrowDown');
  p.key('ArrowLeft');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-2`);
  T.eq(await row(), `${B}/new-releases`);
  p.key('ArrowLeft');
  p.key('ArrowLeft');
  T.eq(railOf(p.active()), 'browse', 'the rail remembers its own place');
  p.key('Escape');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-1`, 'Back on the rail: back to the show it came from (H3)');
});

T.runAsync('Home: the banner — › beside Watch now steps through the featured slides; My list presses Dropout’s own button', async () => {
  const p = await boot();
  p.key('ArrowRight');
  T.eq(p.active().textContent, '›', 'one step from Watch now');
  p.key('Enter');
  T.eq(p.doc.querySelector('.tenfoot-hero-title').textContent, 'Dimension 20');
  T.eq(p.active().textContent, '›', 'the selection stays on ›, so OK can keep going');
  T.eq((await p.home()).slide, 1);
  const all = () => Array.from(p.doc.querySelectorAll('.tenfoot-hero-actions > *')).map((b) => b.textContent);
  T.eq(all(), ['Watch now', '›', 'My List'], 'this slide has no trailer');
  const buttons = () => Array.from(p.doc.querySelectorAll('.tenfoot-hero-action'));
  T.eq([buttons()[1].dataset.tenfootListed, buttons()[1].getAttribute('aria-label')], ['true', 'Remove from My List'], 'already on My List: a tick');
  T.eq(buttons()[0].dataset.tenfootListed, undefined, 'only the list button has a state');
  let pressed = 0;
  const real = p.doc.querySelectorAll('.carousel .slide')[1].querySelector('.slide-button--my-list');
  real.addEventListener('click', () => {
    pressed += 1;
    real.classList.replace('icon-watchlist-remove', 'icon-watchlist-add');
  });
  p.key('ArrowRight');
  T.eq(p.active().textContent, 'My List');
  p.key('ArrowRight');
  T.eq(p.active().textContent, 'My List', 'no wrap past the last button');
  const before = p.active();
  p.key('Enter');
  T.eq(pressed, 1, 'Dropout’s own button, on the same slide');
  await T.sleep(150);
  T.eq([buttons()[1].dataset.tenfootListed, buttons()[1].getAttribute('aria-label')], ['false', 'Add to My List'], 'redrawn from the site’s new state: a plus');
  T.eq(p.active(), before, 'the same element keeps the selection');
  T.eq(all(), ['Watch now', '›', 'My List'], 'and nothing moved');
  p.key('ArrowLeft');
  p.key('Enter');
  T.eq(p.doc.querySelector('.tenfoot-hero-title').textContent, 'Game Changer', 'round again');
  T.eq(all(), ['Watch now', '›', 'Trailer', 'My List']);
  T.eq(p.active().textContent, '›');
});

T.runAsync('Home: rows arrive as the selection moves down (Dropout’s own Show more)', async () => {
  const p = await boot();
  let clicks = 0;
  p.doc.querySelector('#see-more button').addEventListener('click', () => {
    clicks += 1;
    p.doc.getElementById('rows').appendChild(p.doc.getElementById('more-rows').content.cloneNode(true));
    p.doc.getElementById('see-more').className = 'see-more-row row see-more-row--hide';
  });
  T.eq((await p.home()).rows.length, 3);
  T.eq(clicks, 0, 'not yet: on the banner');
  p.key('ArrowDown');
  T.eq(clicks, 1, 'pressed as soon as the selection is within two rows of the end (Continue Watching, of three)');
  T.eq((await p.home()).loading, true);
  await T.sleep(200);
  const h = await p.home();
  T.eq(h.rows.map((r) => r.title).slice(-2), ['Game Changer', 'Dimension 20']);
  T.eq([h.loading, h.more], [false, false]);
  for (let i = 0; i < 8; i++) p.key('ArrowDown');
  T.eq(hrefOf(p.active()), `${B}/videos/d20-1`, 'the last row');
  T.eq(clicks, 1, 'nothing more to ask for');
});

T.runAsync('Home: OK opens the card’s own link; Back runs the exit hook; the menu opens settings over Home', async () => {
  const p = await boot({ settings: { exitHook: 'close-tab' } });
  p.key('ArrowDown');
  p.key('ArrowDown');
  let clicked = null;
  p.active().addEventListener('click', (e) => { clicked = e.currentTarget.getAttribute('href'); e.preventDefault(); });
  p.key('Enter');
  T.eq(clicked, `${B}/videos/nr-1`);
  p.key('Escape');
  await T.sleep(10);
  T.ok(p.last('exit'), 'Back on Home is the exit hook');
  p.key('ContextMenu');
  const s = await p.state();
  T.ok(Array.isArray(s.menu) && s.menu.includes('forget'), 'Leanback settings, with Clear Continue Watching');
  p.key('Escape');
  T.eq(hrefOf(p.active()), `${B}/videos/nr-1`, 'closing puts the selection back on the card');
});

T.runAsync('Home: the site taking the focus is taken back; a click on a card moves the selection there', async () => {
  const p = await boot();
  p.doc.querySelector('.site-header a').focus();
  T.eq(p.active().textContent, 'Watch now', 'focus went back to Home');
  const card = p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/trending"] .tenfoot-card-link`);
  card.focus();
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), `${B}/dimension-20`, 'the model followed the click');
});

T.runAsync('Home: a hub gets the same screen, without Continue Watching; Back goes to Home', async () => {
  const p = await boot({ url: `${B}/dimension-20`, progress: { entries: { x: { url: `${B}/videos/x`, duration: 1000, local: { position: 500, at: 1 } } } } });
  const s = await p.state();
  T.eq([s.kind, s.home.ready], ['hub', true]);
  T.notOk(s.home.rows.some((r) => r.title === 'Continue Watching'));
  T.eq(s.rail.page, null, 'a hub is not Home: nothing lit on the rail');
  p.key('ArrowLeft');
  T.eq(railOf(p.active()), 'home', 'but the rail still opens on Home');
  p.key('ArrowRight');
  p.key('Escape');
  T.eq((await p.state()).navigation, `${B}/browse`);
});

T.runAsync('Home: turning Leanback off gives Dropout’s page back, and on again redraws Home', async () => {
  const p = await boot();
  await p.msg({ type: 'page:action', action: 'menu' });
  await p.shim.changeStorage({ settings: { newValue: { enabled: false } } });
  T.notOk(p.doc.querySelector('.tenfoot-home'), 'layer removed');
  T.eq(p.doc.documentElement.dataset.tenfootHome, undefined);
  T.eq(p.doc.documentElement.dataset.tenfootRail, undefined);
  await p.shim.changeStorage({ settings: { newValue: { enabled: true } } });
  T.ok((await p.home()).ready);
  T.eq(p.active().textContent, 'Watch now');
});

T.runAsync('Home: an open dialog (cookie banner) hides Home and the rail until it closes', async () => {
  const p = await boot();
  const dlg = p.doc.createElement('div');
  dlg.id = 'ketch-banner';
  dlg.setAttribute('data-rect', '100,100,600,300');
  const ok = p.doc.createElement('button');
  ok.textContent = 'Accept';
  ok.setAttribute('data-rect', '120,300,100,40');
  dlg.appendChild(ok);
  p.doc.body.appendChild(dlg);
  await T.sleep(150);
  T.eq(p.doc.documentElement.dataset.tenfootModal, 'on');
  T.eq(p.active(), ok, 'the dialog has the selection');
  dlg.remove();
  await T.sleep(150);
  T.eq(p.doc.documentElement.dataset.tenfootModal, undefined);
  T.eq(p.active().textContent, 'Watch now', 'back on Home');
});

// Taking OK twice, and moving away disarming it, are settings-menu.test.mjs's.
T.runAsync('Clear Continue Watching on Home: the row goes, and Dropout\'s bars stay on its cards', async () => {
  const p = await boot({ progress: { entries: { x: { url: `${B}/videos/x`, duration: 1000, local: { position: 500, at: 1 } } } } });
  p.key('ContextMenu');
  for (let i = 0; i < 20 && (await p.state()).menuItem !== 'forget'; i++) p.key('ArrowDown');
  p.key('Enter');
  p.key('Enter');
  T.ok(p.last('history:clear'), 'cleared');
  T.ok(p.doc.querySelector('[data-tenfoot-item="forget"]').textContent.includes('Clear Continue Watching'));
  T.ok(p.doc.querySelector('.tenfoot-hints').textContent.includes('Continue Watching cleared'));
  await T.sleep(150);
  T.notOk(p.doc.querySelector('.tenfoot-row[data-tenfoot-row="continue-watching"]'), 'Continue Watching is empty — Dropout’s own bars included');
  T.eq(p.doc.querySelector(`.tenfoot-row[data-tenfoot-row="${B}/new-releases"] .tenfoot-card[data-tenfoot-card="${B}/videos/nr-2"] .tenfoot-card-progress-fill`).style.width, '30%', 'Dropout’s bars still show on its cards');
});

T.runAsync('Search: results are reachable (2026-09-26 capture)', async () => {
  const tile = (n) => `<li class="SearchResults-module__search-result search-result-video" data-index="${n}"><div data-testid="browse-card" class="card-enter horizontal-row-item"><div class="browse-item-card item-type-video"><div class="site-font-primary-color browse-item-title"><div class="inline-block" data-testid="browse-list-toggle"><button class="has-background icon-only icon-watchlist-add" aria-label="Add to my list">My list</button></div><a href="${B}/videos/r${n}" data-rect="${300 + n * 200},300,180,101"><div class="browse-image-container aspect_ratio_16_9"></div><div class="subtext-container"><div class="site-font-primary-color truncate">Result ${n}</div><div class="site-font-secondary-color browse-item-subtext">&nbsp;</div></div></a></div></div></li>`;
  const html = `<!doctype html><html><body class="search"><div id="search-react-app"><div class="Search-module__content-container Search-module__show"><div class="Search-module__search-container"><div class="SearchForm-module__search-form-container"><input class="SearchForm-module__search-input" value="test" data-rect="300,100,600,40"></div><div class="Search-module__results-content-container"><div class="SearchResults-module__search-results-container"><div><div class="TypeFilters-module__type-filters-container"><button class="TypeFilters-module__type-filter" data-filter-type="all" data-rect="300,200,120,30">All (20)</button></div><ul class="SearchResults-module__search-results">${[0, 1, 2].map(tile).join('')}</ul><button class="SearchResults-module__load-more">Load More</button></div></div></div></div></div></div></body></html>`;
  const p = await boot({ html, url: `${B}/search?q=test` });
  T.eq((await p.state()).kind, 'search');
  p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="done"]').click();
  T.eq(hrefOf(p.active()), `${B}/videos/r0`, 'the result link — it has no class — is a target');
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), `${B}/videos/r1`);
});

// ---------------------------------------------------------------------------
// the rail elsewhere
// ---------------------------------------------------------------------------

T.runAsync('Rail on Browse (/series): ◀ from the first tile; OK on Home goes to /browse; the gear opens settings in place', async () => {
  const p = await boot({ html: fixture('series.html'), url: `${B}/series` });
  const s = await p.state();
  T.eq([s.kind, s.rail.page], ['grid', 'browse']);
  T.eq(p.doc.documentElement.dataset.tenfootRail, 'on');
  const start = p.active();
  p.key('ArrowLeft');
  T.eq(railOf(p.active()), 'browse', 'Browse is this page');
  p.key('ArrowDown');
  T.eq(railOf(p.active()), 'my-list', 'My List, under Browse');
  p.key('ArrowDown');
  T.eq(railOf(p.active()), 'live', 'Dropout 24/7, under My List');
  p.key('ArrowDown');
  T.eq(railOf(p.active()), 'settings');
  p.key('Enter');
  const m = await p.state();
  T.eq(m.menu !== null, true, 'Leanback settings, on this page');
  p.key('Escape');
  T.eq(railOf(p.active()), 'settings', 'closing returns to the gear');
  p.key('ArrowUp');
  p.key('ArrowUp');
  p.key('ArrowUp');
  p.key('ArrowUp');
  T.eq(railOf(p.active()), 'home');
  p.key('Enter');
  T.eq((await p.state()).navigation, `${B}/browse`, 'Home, opened: this tab did not come from it');
  T.ok(start, 'there was a tile to come from');
});

T.runAsync('Rail: Dropout 24/7 — from Home it is one level down; from Browse, sideways; on its own page, lit', async () => {
  const h = await boot();
  h.key('ArrowLeft');
  h.key('ArrowDown');
  h.key('ArrowDown');
  h.key('ArrowDown');
  T.eq(railOf(h.active()), 'live');
  T.eq(h.active().getAttribute('aria-label'), 'Dropout 24/7');
  h.key('Enter');
  T.eq((await h.state()).navigation, `${B}/dropout-24-7`, 'Dropout\'s 24/7 page, its Live now banner and Watch');
  T.eq(JSON.parse(h.win.sessionStorage.getItem('tenfoot.intent')).kind, 'push');
  const g = await boot({ html: fixture('series.html'), url: `${B}/series` });
  g.key('ArrowLeft');
  g.key('ArrowDown');
  g.key('ArrowDown');
  g.key('Enter');
  T.eq((await g.state()).navigation, `${B}/dropout-24-7`);
  T.eq(JSON.parse(g.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'so Back from it is Home, not Browse');
  const l = await boot({ url: `${B}/dropout-24-7` });
  const s = await l.state();
  T.eq([s.kind, s.rail.page], ['hub', 'live']);
});

T.runAsync('Rail: My List — a bookmark between Browse and Dropout 24/7; from Home one level down, from Browse sideways', async () => {
  const h = await boot();
  const order = Array.from(h.doc.querySelectorAll('.tenfoot-rail-item')).map(railOf);
  T.eq(order, ['profile', 'search', 'home', 'browse', 'my-list', 'live', 'settings'], 'signed in: the profile watching first');
  const item = h.doc.querySelector('.tenfoot-rail-item[data-tenfoot-rail="my-list"]');
  T.eq([item.getAttribute('aria-label'), item.title], ['My List', 'My List']);
  T.eq(item.querySelectorAll('svg path').length, 1, 'the bookmark glyph');
  T.ok(item.querySelector('svg path').getAttribute('d').startsWith('M6.5 3h11'));
  h.key('ArrowLeft');
  h.key('ArrowDown');
  h.key('ArrowDown');
  T.eq(railOf(h.active()), 'my-list');
  h.key('Enter');
  T.eq((await h.state()).navigation, `${B}/my-list`);
  T.eq(JSON.parse(h.win.sessionStorage.getItem('tenfoot.intent')).kind, 'push');
  const g = await boot({ html: fixture('series.html'), url: `${B}/series` });
  g.key('ArrowLeft');
  g.key('ArrowDown');
  g.key('Enter');
  T.eq((await g.state()).navigation, `${B}/my-list`);
  T.eq(JSON.parse(g.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'so Back from it is Home, not Browse');
});

T.runAsync('an empty My List: Leanback\'s screen with its title and a line saying so, the selection on the rail\'s My List, and it stays there', async () => {
  const html = fixture('my-list.html').replace(/<li class="js-collection-item[\s\S]*?<\/li>/g, '');
  const p = await boot({ html, url: `${B}/my-list` });
  await T.sleep(50);
  const s = await p.state();
  T.eq([s.home.title, s.home.count, s.home.empty], ['My List', 0, 'Nothing in My List yet. Add a show or a video to it with Add to My List on its page.']);
  T.notOk(p.doc.querySelector('.tenfoot-screen').hidden, 'Leanback\'s screen stays up');
  T.notOk(p.doc.querySelector('.tenfoot-screen-empty').hidden);
  T.eq(railOf(p.active()), 'my-list');
  p.key('ArrowRight');
  T.eq(railOf(p.active()), 'my-list', '▶: nothing to go to, so the rail keeps it');
  p.key('ArrowUp');
  T.eq(railOf(p.active()), 'browse', 'and the rail still moves');
}, 8000);

T.runAsync('My List page: Leanback\'s own screen, with the rail, My List lit, the selection on the first show (G6)', async () => {
  const p = await boot({ html: fixture('my-list.html'), url: `${B}/my-list` });
  const s = await p.state();
  T.eq([s.kind, s.rail.page], ['grid', 'my-list']);
  T.eq([s.home.kind, s.home.title, s.home.count, s.home.columns], ['screen', 'My List', 4, 5], 'the rail\'s name for it, not Dropout\'s "My list"');
  T.eq(p.doc.documentElement.dataset.tenfootRail, 'on');
  T.eq(p.doc.documentElement.dataset.tenfootHome, 'on', 'Leanback\'s layer is up');
  T.ok(p.doc.querySelector('.tenfoot-screen') && !p.doc.querySelector('.tenfoot-screen').hidden);
  T.eq(p.doc.querySelector('.tenfoot-rail-item[data-tenfoot-page="true"]').dataset.tenfootRail, 'my-list', 'only My List is lit, not Browse');
  T.eq(hrefOf(p.active()), `${B}/aparna-nancherla-hopeful-potato`);
  T.ok(p.active().closest('.tenfoot-screen'), 'a card of Leanback\'s, not Dropout\'s tile');
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), `${B}/game-changer`);
  p.key('ArrowLeft');
  p.key('ArrowLeft');
  T.eq(railOf(p.active()), 'my-list', 'the rail, on this page’s entry');
  p.key('Enter');
  T.eq(hrefOf(p.active()), `${B}/aparna-nancherla-hopeful-potato`, 'OK on the page you are on goes back to it');
  T.notOk((await p.state()).navigation, 'no reload');
  p.key('ArrowLeft');
  p.key('ArrowUp');
  T.eq(railOf(p.active()), 'browse');
  p.key('Enter');
  T.eq((await p.state()).navigation, `${B}/series`, 'Browse from My List opens Browse');
  for (const sel of ['.site-header']) T.ok(p.doc.querySelector(sel).hasAttribute('data-tenfoot-chrome'), `${sel}: Dropout's top bar hidden (G8)`);
});
T.runAsync('Rail: Home goes back down the history when this tab came from Home', async () => {
  const p = await boot({ html: fixture('series.html'), url: `${B}/series`, before: (win) => win.sessionStorage.setItem('tenfoot.trail', JSON.stringify([{ url: `${B}/browse`, kind: 'browse' }])) });
  p.key('ArrowLeft');
  p.key('ArrowUp');
  T.eq(railOf(p.active()), 'home');
  p.key('Enter');
  T.eq(p.win.__went, [-1], 'no second Home piled on top of the first');
});

T.runAsync('No rail on a show’s page or a video', async () => {
  const series = await boot({ html: fixture('series.html'), url: `${B}/game-changer` });
  T.eq((await series.state()).rail, null);
  T.eq(series.doc.documentElement.dataset.tenfootRail, undefined);
  const before = series.active();
  series.key('ArrowLeft');
  T.ok(railOf(series.active()) === null, 'no rail to enter');
  T.ok(before, 'the page had a selection');
});

T.runAsync('Rail: signed in, the profile watching is at the top, set apart, with its picture; OK opens the picker', async () => {
  const h = await boot();
  const item = h.doc.querySelector('.tenfoot-rail-item[data-tenfoot-rail="profile"]');
  T.eq([item.dataset.tenfootStart, item.dataset.tenfootPicture, item.querySelector('img').getAttribute('src')], ['true', 'true', 'https://fixture.test/art-3.svg']);
  T.eq(item.getAttribute('aria-label'), 'Switch profile');
  h.key('ArrowLeft');
  for (let i = 0; i < 3; i += 1) h.key('ArrowUp');
  T.eq(railOf(h.active()), 'profile', 'above Search, the top');
  h.key('Enter');
  T.eq((await h.state()).navigation, `${B}/profile/pick`);
});

T.runAsync('Rail: signed out (no picture in Dropout\'s header), no profile entry', async () => {
  const h = await boot({ before: (win) => win.document.querySelector('.user-actions').remove() });
  T.notOk(h.doc.querySelector('.tenfoot-rail-item[data-tenfoot-rail="profile"]'));
});

await T.exit();
