// content/page.js under jsdom on the live-check fixtures: page kinds, row
// and grid navigation, focus memory, selects, load more, modals, layered
// Back, an episode's details page and the video, the player hand-off,
// settings toggles, hints.
import fs from 'node:fs';
import path from 'node:path';
import { T, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';

const rules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));
const fixture = (n) => fs.readFileSync(path.join(T.testsDir, 'fixtures', n), 'utf8');
const kbOpen = (p) => { const k = p.doc.querySelector('.tenfoot-kb'); return Boolean(k) && !k.hidden; };
const kbKey = (p, id) => p.doc.querySelector(`.tenfoot-kb [data-tenfoot-key="${id}"]`).click();
// Exactly the scripts the manifest injects into a Dropout page, in order, so
// this list can never drift from what ships.
const manifest = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8'));
const FILES = manifest.content_scripts
  .find((cs) => cs.matches.some((m) => m.includes('watch.dropout.tv')))
  .js.map((f) => T.extFile(f));
const URLS = {
  browse: 'https://watch.dropout.tv/browse',
  series: 'https://watch.dropout.tv/game-changer',
  season1: 'https://watch.dropout.tv/game-changer/season:1',
  season2: 'https://watch.dropout.tv/game-changer/season:2',
  video: 'https://watch.dropout.tv/game-changer/season:1/videos/ep1',
  search: 'https://watch.dropout.tv/search',
};

// Walk the options panel to a named entry. Bounded: when an entry stops being
// reachable the test should fail, not spin for ever — which is exactly what an
// unbounded while-loop did when the options button changed what it opens.
async function moveTo(p, id, max = 14) {
  for (let i = 0; i < max; i += 1) {
    if ((await p.state()).menuItem === id) return true;
    p.key('ArrowDown');
  }
  throw new Error(`options panel never reached "${id}"`);
}

// Button hints are off on a fresh install; most tests here are about how the
// bar behaves, so they switch it on. `fresh: true` boots with nothing stored.
async function boot({ html, url, settings = null, playerState = null, fresh = false, before = null, progress = null, store = null } = {}) {
  const stored = fresh ? null : { hintBar: true, ...(settings || {}) };
  const storage = { ...(stored ? { settings: stored } : {}), ...(store || {}) };
  if (progress) storage['progress:0'] = progress;
  const shim = makeBrowserShim({ tabs: [{ id: 1, url, active: true }], storage });
  const bg = [];
  const replies = { exit: { ok: true, action: 'none' } };
  shim.browser.runtime.onMessage.addListener((m, s, send) => {
    bg.push(m);
    if (m.type === 'rules:get') send({ ok: true, rules });
    else if (m.type === 'exit') send(replies.exit);
    else if (m.type === 'player:command' && m.cmd === 'state') send({ ok: true, state: playerState || { title: 'T', currentTime: 5, duration: 100, paused: false } });
    else if (m.type === 'settings:set') {
      // Persist like the real background does, so settings assertions are real.
      const cur = shim.store.settings || {};
      shim.store.settings = { ...cur, ...m.patch };
      send({ ok: true, settings: shim.store.settings });
    } else send({ ok: true });
    return false;
  });
  const dom = makeDom({ html, url, browser: shim.browser });
  const win = dom.window;
  // content/show.css's first rule: jsdom does not load the extension's CSS,
  // and what Leanback hides must drop out of navigation here too.
  const omitStyle = win.document.createElement('style');
  omitStyle.textContent = '[data-tenfoot-omit] { display: none !important; }';
  win.document.head.appendChild(omitStyle);
  // …and, as in a browser, what is inside a hidden element has no box.
  const rectOf = win.Element.prototype.getBoundingClientRect;
  win.Element.prototype.getBoundingClientRect = function () {
    if (this.closest && this.closest('[data-tenfoot-omit]')) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    return rectOf.call(this);
  };
  // jsdom cannot leave the document: record where the page asked to go.
  win.__went = [];
  win.history.go = (d) => win.__went.push(d);
  if (before) before(win);
  dom.runScripts(FILES);
  await T.sleep(40);
  const msg = (m) => new Promise((res) => shim.listeners.message[1].fn(m, { tab: { id: 1 }, frameId: 0 }, res));
  const state = () => msg({ type: 'page:state' });
  const act = (a) => msg({ type: 'page:action', action: a });
  const key = (k, init) => dom.key(k, init);
  const last = (type) => bg.filter((m) => m.type === type).at(-1);
  const $ = (id) => win.document.getElementById(id);
  const ring = () => win.document.querySelector('.tenfoot-ring');
  const hints = () => win.document.querySelector('.tenfoot-hints');
  return { shim, dom, win, doc: win.document, bg, replies, msg, state, act, key, last, $, ring, hints };
}

// ---------------------------------------------------------------------------
// browse
// ---------------------------------------------------------------------------

T.runAsync('browse: wires the document, focuses the first tile, draws the ring, hides hover tooltips', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  const s = await p.state();
  T.eq([s.enabled, s.kind, s.focused.id, s.ring, s.modal], [true, 'browse', 'r1c1', true, false]);
  T.eq(p.doc.documentElement.dataset.tenfoot, 'on');
  T.eq(p.doc.activeElement.id, 'r1c1');
  T.notOk(p.ring().hidden);
  T.ok(p.hints(), 'hint bar element exists');
  T.notOk(p.hints().hidden, 'up from the start, so the keys are readable without pressing one');
  const style = p.doc.getElementById('tenfoot-site-style').textContent;
  T.ok(/\.tooltip/.test(style) && /display: none/.test(style), style);
  T.eq(p.last('rules:get').type, 'rules:get');
});

T.runAsync('the ring’s corners follow the selected element’s, one ring-offset out', async () => {
  const p = await boot({
    html: fixture('browse.html'), url: URLS.browse,
    before: (win) => { win.document.getElementById('r1c1').style.borderTopLeftRadius = '12px'; } // jsdom does not expand the shorthand
  });
  T.eq(p.doc.activeElement.id, 'r1c1');
  // 12 px, enlarged 5 % by the default zoom, plus the ring's offset (4 + 2).
  T.eq(p.ring().style.borderRadius, '18.6px');
  T.eq((await p.act('right')).focused.id, 'r1c2');
  await T.sleep(20);
  T.eq(p.ring().style.borderRadius, '6px', 'a square element: the offset alone');
});

T.runAsync('browse: the initial selection scrolls itself into view (bugs 1+2)', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  T.eq(p.doc.activeElement.id, 'r1c1');
  T.eq(p.win.__scrolledInto, p.$('r1c1'), 'scrolled on the very first focus, without waiting for a keypress');
});

T.runAsync('browse: a tile the row cannot scroll to is brought in with the row arrows (bug 3)', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  // A transform carousel: scrollIntoView moves nothing, only the arrows do.
  const row = p.$('row-2');
  const next = row.parentElement.querySelector('.carousel-arrow--right') || p.doc.querySelector('.carousel-arrow--right');
  let page = 0;
  next.addEventListener('click', () => {
    page += 1;
    for (const a of row.querySelectorAll('a[data-rect]')) {
      const [l, t, w, h] = a.getAttribute('data-rect').split(',').map(Number);
      a.setAttribute('data-rect', [l - 310 * page, t, w, h].join(','));
    }
  });
  p.key('ArrowDown');
  for (let i = 0; i < 4; i++) p.key('ArrowRight');
  T.eq(p.doc.activeElement.id, 'r2c5', 'ring is on the off-screen tile');
  await T.sleep(400);
  const r = p.$('r2c5').getBoundingClientRect();
  T.ok(r.right <= p.win.innerWidth + 1, `tile brought into view (right edge ${r.right})`);
  T.ok(page >= 1, 'the row arrow was clicked');
}, 8000);

T.runAsync('browse: an arrow that moves nothing is clicked once, not forever', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  let clicks = 0;
  for (const a of p.doc.querySelectorAll('.carousel-arrow')) a.addEventListener('click', () => { clicks += 1; });
  p.key('ArrowDown');
  for (let i = 0; i < 4; i++) p.key('ArrowRight');
  await T.sleep(700);
  T.eq(clicks, 1, 'gave up after the row refused to move');
}, 8000);

T.runAsync('browse: real key events move the ring row-wise with focus memory and show hints', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  T.ok(p.key('ArrowRight').defaultPrevented);
  T.eq(p.doc.activeElement.id, 'r1c2');
  T.notOk(p.hints().hidden, 'hint bar shown on a handled key');
  T.ok(p.hints().textContent.includes('Move'));
  p.key('ArrowRight');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.id, 'r2c3');
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement.id, 'r2c2');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.id, 'r1c3', 'memory restores the row-1 tile');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.id, 'hero');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.getAttribute('href'), '/search', 'geometric fallback reaches the header');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.id, 'hero');
  T.ok(p.win.__scrolledInto === p.doc.activeElement, 'kept on screen');
});

T.runAsync('browse: row ends do not wrap; ◀ at a row start enters the rail; off-screen tiles are reachable', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement.dataset.tenfootRail, 'home', 'the rail, on the entry for this page');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.id, 'r1c1', 'and back to the tile it came from');
  p.key('ArrowDown');
  for (let i = 0; i < 6; i++) p.key('ArrowRight');
  T.eq(p.doc.activeElement.id, 'r2c5', 'stops at the last tile even off-screen');
  T.notOk(p.ring().hidden);
});

T.runAsync('browse: auto-repeat is throttled, modifiers pass through, Back runs the exit hook', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  p.key('ArrowRight', { repeat: true });
  p.key('ArrowRight', { repeat: true });
  T.eq(p.doc.activeElement.id, 'r1c2', 'two repeats inside 80 ms move once');
  T.notOk(p.key('ArrowRight', { altKey: true }).defaultPrevented);
  T.eq(p.doc.activeElement.id, 'r1c2');
  T.ok(p.key('Escape').defaultPrevented);
  await T.sleep(10);
  T.eq(p.last('exit').type, 'exit');
  T.ok(p.hints().textContent.includes('Nothing to go back to'));
});

T.runAsync('a fresh install shows no button hints, but short notices still appear', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse, fresh: true });
  T.ok(p.hints().hidden, 'no hint bar from the start');
  p.key('ArrowRight');
  T.ok(p.hints().hidden, 'nor on a keypress');
  p.key('Escape');
  await T.sleep(10);
  T.notOk(p.hints().hidden, 'a notice is not a hint');
  T.ok(p.hints().textContent.includes('Nothing to go back to'), p.hints().textContent);
});

T.runAsync('the options panel has no "Player controls" row: that switch is on the options page only', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  await p.act('menu');
  T.notOk((await p.state()).menu.includes('playerChrome'), JSON.stringify((await p.state()).menu));
});

T.runAsync('browse: the options button opens Leanback settings, and Back closes it', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  await p.act('menu');
  let s = await p.state();
  T.eq(s.menu, ['autoplayNext', 'seekStep', 'seasonStart', 'skipMarketingSite', 'exitHook', 'look', 'theme', 'ringColor', 'holidays', 'focusZoom', 'ringWidth', 'hintBar', 'menu:accessibility', 'forget'],
    'the one list of settings (C1) with Theme This Page (Home has a look of its own), then Accessibility and Clear Continue Watching; no Home or Search, which the rail does (C4)');
  T.eq(s.menuItem, 'autoplayNext', 'first item selected');
  T.eq(p.doc.querySelector('.tenfoot-settings-title').textContent, 'Leanback Settings');
  T.eq([...p.doc.querySelectorAll('.tenfoot-settings-group')].map((g) => g.textContent), ['Playback', 'Browsing', 'Look'], 'under their headings');
  T.notOk(p.doc.querySelector('.tenfoot-settings-close'), 'no ✕: Back closes');
  p.key('ArrowDown');
  T.eq((await p.state()).menuItem, 'seekStep');
  p.key('ArrowUp');
  T.eq((await p.state()).menuItem, 'autoplayNext');
  p.key('ArrowUp');
  T.eq((await p.state()).menuItem, 'autoplayNext', 'no wrap');
  p.key('Escape');
  s = await p.state();
  T.eq([s.menu, s.focused.id], [null, 'r1c1'], 'closed, ring back where it was');
  await p.act('menu');
  await p.act('menu');
  T.eq((await p.state()).menu, null, 'the menu button closes it too');
  const cm = new p.win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
  p.doc.body.dispatchEvent(cm);
  T.ok(cm.defaultPrevented, 'the keyboard-originated context menu is suppressed');
  const rc = new p.win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
  p.doc.body.dispatchEvent(rc);
  T.notOk(rc.defaultPrevented, 'a real right-click is left alone');
});
T.runAsync('off a video the options button opens Leanback settings directly', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  p.key('ContextMenu');
  const s = await p.state();
  T.ok(s.menu.includes('autoplayNext') && s.menu.includes('seekStep'),
    'straight into the settings, no action list first: ' + JSON.stringify(s.menu));
  T.eq(s.navigation, null, 'and nothing navigated');
});


T.runAsync('settings open inside the page — never in another tab (item 2)', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  p.key('ContextMenu');
  let s = await p.state();
  T.ok(s.menu.includes('autoplayNext') && s.menu.includes('seekStep'), 'the settings list is the panel: ' + JSON.stringify(s.menu));
  T.eq(s.navigation, null, 'nothing navigated away');
  T.eq(p.bg.filter((m) => m.type === 'options:open').length, 0, 'and no request to open an options tab');
  p.key('Escape');
  T.eq((await p.state()).menu, null, 'back closes it — there is no list in between any more');
});

T.runAsync('a setting with several values opens its list; OK picks one, ticked; ◀ leaves it unchanged (C2)', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  p.key('ContextMenu');
  await moveTo(p, 'seekStep');
  const value = (id) => p.doc.querySelector(`[data-tenfoot-item="${id}"] .tenfoot-settings-value`).textContent;
  T.eq(value('seekStep'), '10 s');
  T.ok(p.doc.querySelector('[data-tenfoot-item="seekStep"] .tenfoot-settings-mark svg'), 'a chevron: it opens a list');
  p.key('ArrowRight');
  let s = await p.state();
  T.eq(p.doc.querySelector('.tenfoot-settings-title').textContent, 'Seek Step', '▶ opens it');
  T.eq(s.menu, ['5', '10', '15', '30', '60', '120', '300']);
  T.eq(s.menuItem, '10', 'on the value in force');
  T.eq(p.doc.querySelector('[aria-checked="true"]').dataset.tenfootItem, '10', 'and it is ticked');
  p.key('ArrowDown');
  T.eq(p.shim.store.settings.seekStep, undefined, 'moving changes nothing');
  p.key('ArrowLeft');
  s = await p.state();
  T.eq([s.menuItem, value('seekStep')], ['seekStep', '10 s'], '◀ goes back up, unchanged');
  p.key('Enter');
  p.key('ArrowDown');
  p.key('Enter');
  await T.sleep(10);
  T.eq(p.shim.store.settings.seekStep, 15, 'OK picks the value');
  s = await p.state();
  T.eq([s.menuItem, value('seekStep')], ['seekStep', '15 s'], 'and goes back up, showing it');
});

T.runAsync('an on/off setting is a switch, and OK flips it (C2)', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  p.key('ContextMenu');
  await moveTo(p, 'skipMarketingSite');
  const item = () => p.doc.querySelector('[data-tenfoot-item="skipMarketingSite"]');
  T.eq([item().getAttribute('aria-checked'), item().querySelector('.tenfoot-switch').dataset.on], ['true', 'true']);
  p.key('Enter');
  await T.sleep(10);
  T.eq(p.shim.store.settings.skipMarketingSite, false);
  T.eq([item().getAttribute('aria-checked'), item().querySelector('.tenfoot-switch').dataset.on], ['false', 'false']);
  p.key('ArrowRight');
  await T.sleep(10);
  T.eq(p.shim.store.settings.skipMarketingSite, true, '▶ flips it too');
  T.eq((await p.state()).menuItem, 'skipMarketingSite', 'and the selection stays');
});
T.runAsync('no letter key does anything on a page any more', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  for (const k of ['i', 'I', 'c', 'm', 'k', 'n', 'p', ' ', 'Backspace', 'PageDown', 'Home', 'BrowserHome']) {
    T.notOk(p.key(k).defaultPrevented, `"${k}" must not be handled`);
  }
  T.eq(p.doc.activeElement.id, 'r1c1', 'and nothing moved');
});

T.runAsync('browse: Enter clicks the focused tile; Home moves up; PageDown is a row down; / goes to search', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  const clicked = [];
  p.doc.addEventListener('click', (e) => { clicked.push(e.target.id); e.preventDefault(); });
  p.key('Enter');
  T.eq(clicked, ['r1c1']);
  p.key('/');
  T.eq((await p.state()).navigation, rules.searchUrl, '"/" is the one keyboard exception');
});

// ---------------------------------------------------------------------------
// series
// ---------------------------------------------------------------------------

// A show's page drawn by Leanback (content/screen.js, read by content/show.js).
const V = (n) => `https://watch.dropout.tv/game-changer/season:1/videos/ep${n}`;
const hrefNow = (p) => (p.doc.activeElement && p.doc.activeElement.getAttribute('href')) || null;
const pillNow = (p) => (p.doc.activeElement && p.doc.activeElement.matches('.tenfoot-season') ? p.doc.activeElement.textContent : null);
const actionNow = (p) => (p.doc.activeElement && p.doc.activeElement.dataset.tenfootAction) || null;
const cardOf = (p, n) => p.doc.querySelector(`.tenfoot-screen .tenfoot-card[data-tenfoot-card="${V(n)}"]`);

T.runAsync('show (drawn): the selection on Episode 1, five across; ◀ ▶ along a row, ▼ a row, ◀ from the first column to the rail; the episode order is still captured', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  const s = await p.state();
  T.eq([s.kind, s.home.kind, s.home.layout], ['series', 'screen', 'show']);
  T.eq(hrefNow(p), V(1));
  T.ok(p.doc.activeElement.closest('.tenfoot-screen'), 'a card of Leanback\'s');
  const order = JSON.parse(p.win.sessionStorage.getItem('tenfoot.episodes'));
  T.eq([order.series, order.urls.length], ['/game-changer/season:1', 6], 'next/previous still know the running order');
  for (let i = 0; i < 4; i += 1) p.key('ArrowRight');
  T.eq(hrefNow(p), V(5));
  p.key('ArrowRight');
  T.eq(hrefNow(p), V(5), 'five across: the row ends, no wrap');
  p.key('ArrowDown');
  T.eq(hrefNow(p), V(6), 'a shorter last row: its last episode');
  p.key('ArrowLeft');
  const r = await p.state();
  T.eq([r.rail && r.rail.active], [true], 'the first column: ◀ is the rail, on a show too');
  p.key('ArrowRight');
  T.eq(hrefNow(p), V(6), '▶ back to the episode');
});
T.runAsync('show (drawn): Dropout\'s Load More is pressed near the end, and the new episodes join the grid', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season1, before: (win) => {
    const doc = win.document;
    doc.getElementById('loadmore').addEventListener('click', (e) => {
      e.preventDefault();
      const grid = doc.getElementById('grid');
      for (const n of [7, 8]) {
        const li = grid.querySelector('li:last-child').cloneNode(true);
        for (const a of li.querySelectorAll('a')) a.href = `https://watch.dropout.tv/game-changer/season:1/videos/ep${n}`;
        li.querySelector('strong').textContent = `Ep ${n} title`;
        li.querySelector('.media-episode').textContent = `Episode ${n}`;
        grid.appendChild(li);
      }
      doc.getElementById('loadmore').remove();
    });
  } });
  await T.sleep(250);
  const s = await p.state();
  T.eq([s.home.count, s.home.more, s.home.loading], [8, false, false], 'the last rows are near from the start: pressed at once');
  T.eq(hrefNow(p), V(1), 'the selection stayed put');
  p.key('ArrowDown'); p.key('ArrowRight');
  T.eq(hrefNow(p), V(7), 'the new row, reachable');
  T.eq(cardOf(p, 8).querySelector('.tenfoot-card-sub').textContent, 'Episode 8');
});
// Dropout's season and sort dropdowns are on screen only when Leanback does
// not recognise the page — Dropout has changed its markup — and then they
// still have to work from a remote.
const unrecognised = (win) => {
  const sec = win.document.querySelector('section.episode-container');
  const div = win.document.createElement('div');
  div.className = sec.className;
  while (sec.firstChild) div.appendChild(sec.firstChild);
  sec.replaceWith(div);
};

T.runAsync('series (page not recognised): a select is not engaged until Enter, so Left/Right still carry the ring past it (bugs 4+5)', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.series, before: unrecognised });
  T.eq((await p.state()).show, null, 'Leanback does not recognise the page');
  const changes = [];
  for (const id of ['season', 'sort']) p.$(id).addEventListener('change', (e) => changes.push(e.target.id + '=' + e.target.value));
  p.$('sort').focus();
  await T.sleep(5);
  T.eq((await p.state()).focused.id, 'sort');
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement.id, 'season', 'Left reaches the season dropdown beside it — the whole of bug 5');
  T.eq(p.$('sort').selectedIndex, 0, 'the sort options were not cycled on the way');
  T.eq(changes, [], 'and nothing navigated');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.id, 'sort', 'and back again');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.id, 'ep1', 'Down leaves the controls for the grid, onto the tile it overlaps most');
  T.ok(p.hints().textContent.includes('Move'));
});

T.runAsync('series (page not recognised): Enter engages a select, Left/Right change the value, Enter commits once', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.series, before: unrecognised });
  const changes = [];
  p.$('season').addEventListener('change', (e) => changes.push(e.target.value));
  p.$('season').focus();
  await T.sleep(5);
  T.eq((await p.state()).engaged, null);
  T.ok(p.hints().textContent.includes('Change this'), 'the bar describes what is selected now: ' + p.hints().textContent);
  T.ok(p.key('Enter').defaultPrevented, 'Enter is consumed, so the native dropdown never opens');
  T.eq((await p.state()).engaged, 'season');
  T.ok(p.hints().textContent.includes('Confirm'));
  p.key('ArrowRight');
  T.eq(p.$('season').selectedIndex, 1);
  T.eq(changes, [], 'stepping does not navigate');
  p.key('ArrowRight');
  T.eq(p.$('season').selectedIndex, 2);
  p.key('ArrowRight');
  T.eq(p.$('season').selectedIndex, 2, 'clamped at the last option');
  p.key('ArrowUp');
  T.eq([p.doc.activeElement.id, (await p.state()).engaged], ['season', 'season'], 'Up/Down are absorbed while engaged');
  p.key('Enter');
  const s = await p.state();
  T.eq(s.engaged, null, 'disengaged');
  T.eq(s.navigation, 'https://watch.dropout.tv/game-changer/season:3', 'straight to the option\'s page');
  T.eq(changes, [], 'without the site adding a page to the history for it');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'sideways: it replaces this page');
});

T.runAsync('series (page not recognised): Escape cancels an engaged select and restores the original value', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.series, before: unrecognised });
  const changes = [];
  p.$('season').addEventListener('change', (e) => changes.push(e.target.value));
  p.$('season').focus();
  await T.sleep(5);
  p.key('Enter');
  p.key('ArrowRight');
  T.eq(p.$('season').selectedIndex, 1);
  T.ok(p.key('Escape').defaultPrevented);
  T.eq(p.$('season').selectedIndex, 0, 'original value back');
  T.eq([changes.length, (await p.state()).engaged], [0, null], 'nothing navigated');
  T.eq((await p.state()).navigation, null, 'and Escape did not also go back a page');
  p.key('Enter');
  p.key('ArrowRight');
  p.$('ep1').focus();
  await T.sleep(5);
  T.eq([(await p.state()).engaged, p.$('season').selectedIndex], [null, 0], 'focus moving away cancels too');
});

T.runAsync('series: Back with no history goes to the structural parent (Browse)', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  p.key('Escape');
  T.eq((await p.state()).navigation, rules.browseUrl);
});

T.runAsync('show (drawn): Trailer opens Dropout\'s own trailer; its dialog takes the selection, and Back gives it back', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  const modal = p.$('modal-trailer');
  p.$('trailer').addEventListener('click', (e) => { e.preventDefault(); modal.classList.add('open'); modal.setAttribute('data-rect', '200,100,880,600'); });
  p.$('modal-close').addEventListener('click', () => { modal.classList.remove('open'); modal.removeAttribute('data-rect'); });
  p.key('ArrowUp'); p.key('ArrowUp');
  T.eq(actionNow(p), 'resume');
  p.key('ArrowRight');
  T.eq(actionNow(p), 'trailer');
  p.key('Enter');
  await T.sleep(200);
  let s = await p.state();
  T.eq([s.modal, s.focused.id], [true, 'modal-link'], 'Dropout\'s dialog is up, the selection in it');
  T.eq(p.doc.documentElement.dataset.tenfootModal, 'on', 'and Leanback\'s screen steps aside for it');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.id, 'modal-link', 'trapped in the dialog');
  p.key('Escape');
  await T.sleep(200);
  s = await p.state();
  T.eq(s.modal, false);
  T.eq(actionNow(p), 'trailer', 'closed: back on Trailer');
});
T.runAsync('show: the bare address opens on the newest season, replacing the page, and nothing is drawn meanwhile (S10)', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.series });
  const s = await p.state();
  T.eq(s.navigation, SEASON3, 'Dropout opened Season 1; Leanback moves on to Season 3');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'sideways: Back leaves the show, not Season 1');
  T.notOk(p.doc.documentElement.hasAttribute('data-tenfoot-ready'), 'the page stays blank (content/early.css) until the new one loads');
  T.eq(p.doc.querySelector('.tenfoot-show-seasons'), null, 'and nothing was built for a page that is going away');
});

T.runAsync('show: "Shows open on: first season" leaves the bare address on Season 1; an address naming its season is never moved', async () => {
  let p = await boot({ html: fixture('series.html'), url: URLS.series, settings: { seasonStart: 'first' } });
  let s = await p.state();
  T.eq(s.navigation, null);
  T.eq([s.show.layout, s.show.current], ['show', 'Season 1']);
  T.ok(p.doc.documentElement.hasAttribute('data-tenfoot-ready'), 'the page is shown');
  p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  s = await p.state();
  T.eq([s.navigation, s.show.current], [null, 'Season 1'], 'Season 1 chosen (or Back from an episode): it stays');
});

T.runAsync('show (drawn): the banner, the seasons newest first with the one on screen lit, its name and episode count over its episodes (G6, S1)', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season2 });
  const s = await p.state();
  T.eq([s.show.layout, s.show.seasons, s.show.current], ['show', ['Season 3', 'Season 2', 'Season 1'], 'Season 2'], 'a long name keeps only "Season N" on its button');
  T.eq(s.show.heading, 'Season 2: All About "The Second One" · 6 Episodes');
  T.eq(s.show.actions, ['Play S1 E1', 'Trailer', 'My List'], 'the main button, Trailer, My List; no Share');
  const screen = p.doc.querySelector('.tenfoot-screen');
  T.ok(screen && !screen.hidden && screen.parentElement === p.doc.documentElement, 'Leanback\'s own layer, outside the site\'s tree');
  T.eq(screen.querySelector('.tenfoot-hero-title').textContent, 'Game Changer');
  T.eq(screen.querySelector('.tenfoot-hero-meta').textContent, '3 Seasons');
  T.eq(screen.querySelector('.tenfoot-hero-text').textContent, 'A game show where the game changes every time.');
  T.eq(screen.querySelector('.tenfoot-season[aria-current="true"]').textContent, 'Season 2');
  T.eq(screen.querySelector('.tenfoot-screen-section-name').textContent, 'Season 2: All About "The Second One"');
  T.eq(screen.querySelector('.tenfoot-screen-grid').style.getPropertyValue('--tf-cols'), '5', 'episodes five across, as Home\'s rows');
  T.notOk(screen.dataset.tenfootNorail, 'the rail beside it');
  T.eq([cardOf(p, 1).querySelector('.tenfoot-card-title').textContent, cardOf(p, 1).querySelector('.tenfoot-card-sub').textContent, cardOf(p, 1).querySelector('.tenfoot-card-time').textContent], ['Ep 1 title', 'Episode 1', '22:14']);
  T.eq(p.doc.querySelectorAll('.tenfoot-show-seasons, [data-tenfoot-omit], [data-tenfoot-ep]').length, 0, 'Dropout\'s page underneath is left as it is');
  T.ok(p.doc.querySelector('.site-header').hasAttribute('data-tenfoot-chrome'), 'its top bar hidden');
});
T.runAsync('show (drawn): ▲ from the episodes lands on the season on screen; ◀ ▶ walk the seasons without wrapping; ▲ the buttons; ▼ back where it was; OK opens a season in place of this one (S11)', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season2 });
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(hrefNow(p), V(3));
  p.key('ArrowUp');
  T.eq(pillNow(p), 'Season 2', 'the season on screen, not the button above Episode 3');
  p.key('ArrowRight');
  T.eq(pillNow(p), 'Season 1', 'towards the oldest');
  T.ok(p.key('ArrowRight').defaultPrevented);
  T.eq(pillNow(p), 'Season 1', 'the row ends: no wrap');
  p.key('ArrowLeft'); p.key('ArrowLeft');
  T.eq(pillNow(p), 'Season 3');
  p.key('ArrowLeft');
  T.eq((await p.state()).rail.active, true, 'past the newest season: the rail');
  p.key('ArrowRight');
  T.eq(pillNow(p), 'Season 3', '▶ back to it');
  p.key('ArrowUp');
  T.eq(actionNow(p), 'resume', 'above the seasons: the show\'s buttons');
  p.key('ArrowDown');
  T.eq(pillNow(p), 'Season 3', 'back to where the row was left');
  p.key('ArrowDown');
  T.eq(hrefNow(p), V(3), 'and down to the episode it came from');
  p.key('ArrowUp');
  p.key('Enter');
  const s = await p.state();
  T.eq(s.navigation, SEASON3, 'OK: that season\'s page');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'in place of this one, so Back leaves the show');
});
T.runAsync('show (drawn): OK on the season already on screen goes down to its episodes', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season2 });
  p.key('ArrowUp');
  T.eq(pillNow(p), 'Season 2');
  p.key('Enter');
  const s = await p.state();
  T.eq([s.navigation, hrefNow(p)], [null, V(1)]);
});
T.runAsync('show (drawn): My List presses Dropout\'s own button and shows when the show is on the list (M6)', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season2 });
  const pressed = [];
  p.$('mylist').addEventListener('click', () => { pressed.push('mylist'); p.$('mylist').classList.replace('icon-watchlist-add', 'icon-watchlist-remove'); });
  p.key('ArrowUp'); p.key('ArrowUp');
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(actionNow(p), 'mylist');
  T.eq(p.doc.activeElement.textContent, 'My List', 'Dropout\'s word, in Leanback\'s button');
  T.eq([p.doc.activeElement.getAttribute('data-tenfoot-listed'), p.doc.activeElement.getAttribute('aria-label')], ['false', 'Add to My List'], 'not on the list: a plus, and the screen reader says Add');
  T.eq([p.doc.activeElement.querySelector('svg.tenfoot-hero-glyph').dataset.glyph, p.doc.activeElement.textContent], ['plus', 'My List'], 'a drawn plus, not a character');
  p.key('Enter');
  T.eq(pressed, ['mylist'], 'Dropout\'s own button was pressed');
  await T.sleep(200);
  T.eq(actionNow(p), 'mylist', 'the selection stays on it');
  T.eq([p.doc.activeElement.getAttribute('data-tenfoot-listed'), p.doc.activeElement.getAttribute('aria-label')], ['true', 'Remove from My List'], 'now on the list: a tick');
  T.eq(p.doc.activeElement.querySelector('svg.tenfoot-hero-glyph').dataset.glyph, 'check', 'a drawn tick');
  T.eq(p.doc.activeElement.querySelectorAll('svg').length, 1, 'one glyph, replaced');
  p.key('ArrowRight');
  T.eq(actionNow(p), 'mylist', 'nothing after it: Share is not drawn');
});
T.runAsync('show (drawn): the main button picks the show up (S8) — first of the buttons, yellow, OK plays it', async () => {
  const progress = { entries: { ep2: { url: V(2), duration: 1000, local: { position: 400, at: 20 } } } };
  const p = await boot({ html: fixture('series.html'), url: URLS.season1, progress });
  T.eq((await p.state()).show.resume, { label: 'Resume S1 E2', href: V(2), action: 'resume' });
  T.eq(hrefNow(p), V(2), 'the selection starts on the episode partway through (S12)');
  p.key('ArrowUp'); p.key('ArrowUp');
  T.eq(actionNow(p), 'resume');
  const b = p.doc.activeElement;
  T.eq([b.textContent, b.getAttribute('href')], ['Resume S1 E2', V(2)]);
  T.ok(b.classList.contains('tenfoot-hero-primary'), 'the yellow one');
  let clicked = null;
  b.addEventListener('click', (e) => { clicked = e.currentTarget.getAttribute('href'); e.preventDefault(); });
  p.key('Enter');
  T.eq(clicked, V(2), 'OK follows it');
});
T.runAsync('show (drawn): "Shows open on: newest" puts the episode to watch next near the top — newest first once past the middle; Episode 1 first before; "first" keeps Episode 1 first', async () => {
  const watchedTo = (n) => ({ entries: Object.fromEntries(Array.from({ length: n }, (_, i) => i + 1).map((k) => [`ep${k}`, { url: V(k), duration: 1000, local: { position: 999, at: k } }])) });
  const firstCard = (p) => p.doc.querySelector('.tenfoot-screen .tenfoot-card').dataset.tenfootCard;
  let p = await boot({ html: fixture('series.html'), url: URLS.season1, progress: watchedTo(5) });
  T.eq([(await p.state()).show.order, hrefNow(p), firstCard(p)], ['newest-first', V(6), V(6)], 'caught up: the newest, at the top and selected');
  p.key('ArrowRight');
  T.eq(hrefNow(p), V(5), 'then the one before it');
  p = await boot({ html: fixture('series.html'), url: URLS.season1, progress: watchedTo(2) });
  T.eq([(await p.state()).show.order, hrefNow(p), firstCard(p)], ['episode-1-first', V(3), V(1)], 'still in the first half: Episode 1 first');
  p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  T.eq([(await p.state()).show.order, hrefNow(p)], ['episode-1-first', V(1)], 'not started: Episode 1, at the top');
  p = await boot({ html: fixture('series.html'), url: URLS.season1, progress: watchedTo(5), settings: { seasonStart: 'first' } });
  T.eq([(await p.state()).show.order, hrefNow(p), firstCard(p)], ['episode-1-first', V(6), V(1)], '"first": always Episode 1 first');
});

T.runAsync('show (drawn): the main button follows the history as it changes', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  T.eq((await p.state()).show.resume, { label: 'Play S1 E1', href: V(1), action: 'first' }, 'nothing watched: the first episode');
  const after = { entries: { ep3: { url: V(3), duration: 1000, local: { position: 999, at: 30 } } } };
  p.shim.store['progress:0'] = after;
  p.shim.changeStorage({ 'progress:0': { newValue: after } });
  await T.sleep(20);
  T.eq((await p.state()).show.resume, { label: 'Play S1 E4', href: V(4), action: 'next' }, 'Episode 3 finished elsewhere: the one after it');
});
T.runAsync('video: the player asks the page for its title and whether it is held (page:info); other pages have none', async () => {
  let p = await boot({ html: fixture('video.html'), url: URLS.video });
  T.eq(await p.msg({ type: 'page:info' }), { ok: true, hold: true, title: 'Episode', series: 'Game Changer', season: null, episode: null }, 'and that its details page holds it');
  p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  T.eq((await p.msg({ type: 'page:info' })).ok, false);
});

T.runAsync('video: the episode page tells the watch history its show, season and episode', async () => {
  const withInfo = (html, link) => html
    .replace('<title>', '<meta property="og:url" content="https://watch.dropout.tv/game-changer/season:1/videos/ep1"><title>')
    .replace('<h1 class="video-title">', `${link}<h1 class="video-title">`);
  let p = await boot({ html: withInfo(fixture('video.html'), '<h5><a href="https://watch.dropout.tv/game-changer/season:1">Season 1</a> <a href="https://watch.dropout.tv/game-changer/season:1"> Season 1, Episode 4 </a></h5>'), url: 'https://watch.dropout.tv/videos/ep1' });
  let m = p.last('history:meta');
  T.eq([m.key, m.show, m.season, m.episode], ['ep1', 'game-changer', 1, 4], 'from "Season 1, Episode 4", past the plain season link');
  p = await boot({ html: withInfo(fixture('video.html'), ''), url: URLS.video });
  m = p.last('history:meta');
  T.eq([m.show, m.season, m.episode], ['game-changer', 1, undefined], 'no episode link: the show and season from og:url');
});

T.runAsync('show (drawn): the selection starts on the episode to watch next; watched episodes are ticked, one in progress has a bar (S12)', async () => {
  const progress = { entries: {
    ep1: { url: V(1), duration: 1000, local: { position: 990, at: 10 } },
    ep2: { url: V(2), duration: 1000, local: { position: 400, at: 20 } },
  } };
  // Dropout's own bar on Episode 5: watched to the end on the Roku.
  const rokuWatched = (win) => {
    const box = win.document.querySelector('#ep5 .browse-info-container');
    box.insertAdjacentHTML('beforeend', '<div class="percentage-bar-container margin-top-small"><div class="percentage-bar-background"></div><div class="percentage-bar" style="width: 100.0%;"></div></div>');
  };
  let p = await boot({ html: fixture('series.html'), url: URLS.season1, progress, before: rokuWatched });
  T.eq(hrefNow(p), V(6), 'the first one after the last finished (Episode 5, watched on the Roku)');
  p = await boot({ html: fixture('series.html'), url: URLS.season1, progress });
  T.eq(hrefNow(p), V(2), 'partway through Episode 2');
  T.eq(cardOf(p, 1).dataset.tenfootWatch, 'watched');
  T.notOk(cardOf(p, 1).querySelector('.tenfoot-card-tick').hidden, 'a tick on a watched episode');
  T.ok(cardOf(p, 1).querySelector('.tenfoot-card-progress').hidden, 'and no bar');
  T.eq(cardOf(p, 2).dataset.tenfootWatch, 'in-progress');
  T.eq(cardOf(p, 2).querySelector('.tenfoot-card-progress-fill').style.width, '40%', 'a bar on one in progress');
  T.ok(cardOf(p, 2).querySelector('.tenfoot-card-tick').hidden);
  T.notOk(cardOf(p, 3).hasAttribute('data-tenfoot-watch'));
  T.eq((await p.state()).show.watched, 1);

  p = await boot({ html: fixture('series.html'), url: URLS.season1, progress: { entries: {
    ep1: { url: V(1), duration: 1000, local: { position: 995, at: 10 } },
    ep2: { url: V(2), duration: 1000, local: { position: 998, at: 20 } },
  } }, before: rokuWatched });
  T.eq(cardOf(p, 5).dataset.tenfootWatch, 'watched', 'Dropout\'s own full bar counts');
  T.eq(hrefNow(p), V(6), 'past the gap: after the last one finished');

  p = await boot({ html: fixture('series.html'), url: URLS.season1, progress: { entries: Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`ep${n}`, { url: V(n), duration: 1000, local: { position: 999, at: n } }])) } });
  T.eq(hrefNow(p), V(1), 'a season watched all the way through: Episode 1 again');

  p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  T.eq(hrefNow(p), V(1), 'a season not started: Episode 1');
});
T.runAsync('show (drawn): the watch history changing re-marks the episodes without a reload', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season1 });
  T.notOk(cardOf(p, 3).hasAttribute('data-tenfoot-watch'));
  await p.shim.changeStorage({ 'progress:0': { newValue: { entries: { ep3: { url: V(3), duration: 1000, local: { position: 999, at: 5 } } } } } });
  await T.sleep(20);
  T.eq(cardOf(p, 3).dataset.tenfootWatch, 'watched');
});
T.runAsync('show (drawn): turning Leanback off puts Dropout\'s page back as it was', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season2 });
  T.ok(p.doc.querySelector('.tenfoot-screen'));
  await p.shim.changeStorage({ settings: { newValue: { hintBar: true, enabled: false } } });
  await T.sleep(20);
  T.eq(p.doc.querySelector('.tenfoot-screen'), null, 'Leanback\'s screen is gone');
  T.notOk(p.doc.documentElement.hasAttribute('data-tenfoot-home'));
  T.eq(p.doc.querySelectorAll('[data-tenfoot-omit], [data-tenfoot-watch], [data-tenfoot-ep], [data-tenfoot-action], .tenfoot-ep-tick, .tenfoot-ep-bar').length, 0, 'nothing of Leanback\'s on Dropout\'s page');
  T.ok(p.doc.documentElement.hasAttribute('data-tenfoot-ready'), 'and the page is shown');
});

T.runAsync('a special (drawn): the banner with Watch Movie (where the selection starts) and My List, then the movie and its Extras', async () => {
  const html = `<!doctype html><html><body class="collections collections-show"><main>
    <section class="collection-movie top-container"><section class="product-feature"><div class="collection-details">
      <h1 class="head primary collection-title">The Special</h1>
      <div class="collection-description"><p>Funny.</p></div>
      <div class="collection-actions">
        <a class="btn btn-black custom-btn-action-primary" id="watch" href="https://watch.dropout.tv/special/videos/special"> Watch Movie </a>
        <button class="my-list btn btn-transparent custom-btn-action-my-list icon-watchlist-remove" id="mylist">My list</button>
        <a class="btn btn-transparent custom-btn-action-share" href="#">Share</a></div></div>
      <div class="hide-for-small-only cover-art"><img src="https://vhx.imgix.net/special.jpg" data-image-primary alt=""></div></section></section>
    <section class="movie-container"><ul><li class="js-collection-item" data-item-type="video"><div class="browse-item-card"><a class="browse-item-link" href="https://watch.dropout.tv/special/videos/special"><div class="browse-image-container"><img src="https://vhx.imgix.net/m.jpg" alt="The Special"><div class="duration-container">1:17:03</div></div></a><div class="browse-item-title"><strong>The Special</strong></div></div></li></ul></section>
    <section class="extras-container"><h2 class="collection-title extras-header"> Extras </h2><ul class="js-load-more-items-container"><li class="js-collection-item" data-item-type="video"><div class="browse-item-card"><a class="browse-item-link" href="https://watch.dropout.tv/special/videos/extra-1"><div class="browse-image-container"><img src="https://vhx.imgix.net/e.jpg"><div class="duration-container">08:12</div></div></a><div class="browse-item-title"><strong>Behind it</strong></div></div></li></ul></section>
  </main></body></html>`;
  const p = await boot({ html, url: 'https://watch.dropout.tv/the-special' });
  const s = await p.state();
  T.eq([s.home.layout, s.show.actions, s.show.sections], ['special', ['Watch Movie', 'My List'], ['movie', 'Extras']]);
  T.eq(actionNow(p), 'primary', 'the selection starts on Watch Movie');
  T.eq(p.doc.activeElement.getAttribute('href'), 'https://watch.dropout.tv/special/videos/special');
  p.key('ArrowRight');
  T.eq([actionNow(p), p.doc.activeElement.getAttribute('data-tenfoot-listed')], ['mylist', 'true'], 'My List, ticked: it is on the list');
  p.key('ArrowDown');
  T.eq(hrefNow(p), 'https://watch.dropout.tv/special/videos/special', 'the movie');
  p.key('ArrowDown');
  T.eq(hrefNow(p), 'https://watch.dropout.tv/special/videos/extra-1', 'its extras');
  T.eq(p.doc.querySelector('.tenfoot-screen .tenfoot-hero-art').getAttribute('src'), 'https://vhx.imgix.net/special.jpg', 'the wide picture from its page');
  T.eq(p.doc.querySelectorAll('.tenfoot-screen-section-name')[1].textContent, 'Extras');
});
// ---------------------------------------------------------------------------
// ◀ as the way out (N2)
// ---------------------------------------------------------------------------

T.runAsync('◀ closes Leanback settings, as Back does; inside a list it goes back up one level', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  await p.act('menu');
  T.ok((await p.state()).menu);
  T.ok(p.key('ArrowLeft').defaultPrevented);
  let s = await p.state();
  T.eq([s.menu, s.focused.id], [null, 'r1c1'], 'closed, ring back where it was');
  await p.act('menu');
  await moveTo(p, 'seekStep');
  p.key('Enter');
  T.eq((await p.state()).menuItem, '10', 'in the list');
  p.key('ArrowLeft');
  s = await p.state();
  T.eq([Boolean(s.menu), s.menuItem], [true, 'seekStep'], 'up one level, still open');
  p.key('ArrowLeft');
  T.eq((await p.state()).menu, null, 'then closed');
});
T.runAsync('Leanback settings: "Shows Open On" — newest season or first season', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  await p.act('menu');
  await moveTo(p, 'seasonStart');
  const detail = () => p.doc.querySelector('[data-tenfoot-item="seasonStart"] .tenfoot-settings-value').textContent;
  T.eq(detail(), 'Newest season');
  p.key('Enter');
  T.eq((await p.state()).menu, ['latest', 'first']);
  p.key('ArrowDown');
  p.key('Enter');
  T.eq(detail(), 'First season');
  T.eq(p.last('settings:set').patch, { seasonStart: 'first' });
  T.eq(p.shim.store.settings.seasonStart, 'first');
});
T.runAsync('search: ▼ with nothing below the box stays the field\'s; a textarea keeps ▼ for its lines', async () => {
  let p = await boot({ html: '<!doctype html><html><body><input type="search" id="q" data-rect="40,100,400,40"></body></html>', url: 'https://watch.dropout.tv/search' });
  T.eq(p.doc.activeElement.id, 'q');
  T.notOk(p.key('ArrowDown').defaultPrevented, 'no results yet: nowhere to go');
  T.eq(p.doc.activeElement.id, 'q');
  p = await boot({ html: '<!doctype html><html><body><textarea id="t" data-rect="40,100,400,140"></textarea><a href="/x" id="below" data-rect="40,300,200,40">x</a></body></html>', url: 'https://watch.dropout.tv/contact' });
  p.$('t').focus();
  T.notOk(p.key('ArrowDown').defaultPrevented, 'several lines: ▼ moves the cursor');
  T.eq(p.doc.activeElement.id, 't');
});

T.runAsync('search: ◀ with the text cursor at the start of the box goes to the rail; anywhere else it moves the cursor (N2)', async () => {
  const html = '<!doctype html><html><body><header class="site-header" data-rect="0,0,1280,60"></header><input type="search" id="q" value="dimension" data-rect="140,100,400,40"><div class="browse-item-card"><a href="/x" class="browse-item-link" id="res1" data-rect="140,200,380,214">R1</a></div></body></html>';
  const p = await boot({ html, url: 'https://watch.dropout.tv/search' });
  T.eq(p.doc.activeElement.id, 'q');
  p.$('q').setSelectionRange(4, 4);
  T.notOk(p.key('ArrowLeft').defaultPrevented, 'mid-word: the field\'s');
  T.eq(p.doc.activeElement.id, 'q');
  p.$('q').setSelectionRange(0, 0);
  T.ok(p.key('ArrowLeft').defaultPrevented, 'at the start: Leanback\'s');
  const s = await p.state();
  T.ok(s.rail && s.rail.active, 'on the rail');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.id, 'q', '▶ comes back to the box');
});

// ---------------------------------------------------------------------------
// video
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// an episode: its details page, then the video (D1–D8)
// ---------------------------------------------------------------------------

// Back — Firefox acts on BrowserBack itself, whatever the page does (T2).
// Leanback keeps the history in the shape Back should follow instead.
const SEASON3 = 'https://watch.dropout.tv/game-changer/season:3';
const EP0 = 'https://watch.dropout.tv/game-changer/season:1/videos/ep0';
const EP2 = 'https://watch.dropout.tv/game-changer/season:1/videos/ep2';
const trailOf = (...entries) => (win) => win.sessionStorage.setItem('tenfoot.trail', JSON.stringify(entries));
const episodeOrder = (win) => win.sessionStorage.setItem('tenfoot.episodes', JSON.stringify({ series: '/game-changer/season:3', href: SEASON3, urls: [URLS.video] }));
const trailNow = (p) => JSON.parse(p.win.sessionStorage.getItem('tenfoot.trail'));
// Ep 1 left partway: 600 of 1500 seconds.
const leftAt = (position) => ({ entries: { ep1: { url: URLS.video, duration: 1500, local: { position, at: Date.now() - 1000 } } } });
// OK on Watch (where the details page starts).
async function watch(p) {
  p.key('Enter');
  await T.sleep(20);
}
// What Firefox does with the remote's Back, which the page can never stop:
// the history goes back a step (jsdom's own traversal, not the recorder).
async function firefoxBack(p) {
  p.win.history.back();
  await T.sleep(40);
}

T.runAsync('an episode opens on its details page: nothing plays, the selection on Watch, the rail beside it (D1, D6)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  const s = await p.state();
  T.eq([s.kind, s.watch, s.theater, s.playerFocused, s.focused.text], ['video', 'details', false, false, 'Watch']);
  T.ok(p.doc.activeElement.closest('.tenfoot-screen'), 'on Leanback\'s screen');
  T.ok(s.rail && s.rail.active === false, 'the rail is there');
  T.eq(p.last('player:hold').on, true, 'the player is told to hold the video');
  T.eq((await p.msg({ type: 'page:info' })).hold, true, 'and says so when the player asks');
  T.notOk(p.doc.documentElement.classList.contains('tenfoot-theater'));
  T.ok(p.$('watch-player').hasAttribute('data-tenfoot-theater-root'));
  T.notOk(p.hints().hidden, 'the hint bar, as on any page');
  p.key('ArrowLeft');
  T.eq((await p.state()).rail.active, true, '◀ onto the rail');
});

T.runAsync('the details page: the show, the title, the synopsis, the picture on the right; Watch, Add to My List, Episodes (D2, D3)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  const s = await p.state();
  T.eq(s.home.episode, { show: 'Game Changer', title: 'Episode', meta: null, actions: ['Watch', 'My List', 'Episodes'], image: 'https://watch.dropout.tv/art-5.svg', left: null });
  const L = p.doc.querySelector('.tenfoot-screen');
  T.eq(L.querySelector('.tenfoot-hero').dataset.tenfootLayout, 'details');
  T.notOk(L.querySelector('.tenfoot-screen-picture').hidden, 'the picture');
  T.eq(L.querySelector('.tenfoot-screen-picture img').getAttribute('src'), 'https://watch.dropout.tv/art-5.svg');
  T.ok(L.querySelector('.tenfoot-screen-picture .tenfoot-card-progress').hidden, 'not started: no progress on it');
  T.eq(L.querySelector('.tenfoot-hero-label').textContent, 'Game Changer');
  T.eq(L.querySelector('.tenfoot-hero-text').textContent, 'Sam asks the contestants to play a game they have never seen.');
  T.eq(L.querySelectorAll('.tenfoot-card').length, 0, 'no row of cards under it');
  T.ok(L.querySelector('.tenfoot-hero-primary').textContent === 'Watch', 'Watch is the yellow one');
  p.key('ArrowRight');
  T.eq([p.doc.activeElement.textContent, p.doc.activeElement.getAttribute('aria-label'), p.doc.activeElement.dataset.tenfootListed], ['My List', 'Add to My List', 'false']);
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.getAttribute('href'), 'https://watch.dropout.tv/game-changer', 'Episodes: the show, as this page names no season');
  p.key('ArrowDown');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.textContent, 'Episodes', 'nothing above or below the buttons');
  T.eq((await p.state()).theater, false, 'and ▲ is not the player any more');
});

T.runAsync('part-watched: Resume, Start Over beside it, and the picture with its progress and the time left (D3, D4)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  const s = await p.state();
  T.eq([s.home.episode.actions, s.home.episode.left, s.focused.text], [['Resume', 'Start Over', 'My List', 'Episodes', 'Clear Progress'], '15:00 left', 'Resume']);
  T.eq(p.doc.querySelector('.tenfoot-screen-picture .tenfoot-card-progress-fill').style.width, '40%');
  T.eq(p.doc.querySelector('.tenfoot-screen-picture .tenfoot-card-time').textContent, '15:00 left');
  const q = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(1490) });
  T.eq((await q.state()).home.episode.actions, ['Watch', 'My List', 'Episodes', 'Clear Progress'], 'finished: Watch, from the beginning');
});

T.runAsync('Clear Progress: the episode unstarted again, the selection back on Watch, a notice', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  for (let i = 0; i < 4; i++) p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Clear Progress', 'last in the row');
  p.key('Enter');
  await T.sleep(20);
  T.eq(p.last('history:forget').key, 'ep1');
  const s = await p.state();
  T.eq([s.home.episode.actions, s.home.episode.left, s.focused.text], [['Watch', 'My List', 'Episodes'], null, 'Watch']);
  T.ok(p.doc.querySelector('.tenfoot-screen-picture .tenfoot-card-progress').hidden, 'no progress on the picture');
  T.ok(p.hints().textContent.includes('Progress cleared'), p.hints().textContent);
  T.eq((await p.msg({ type: 'page:info' })).hold, true, 'nothing plays');
});

T.runAsync('Watch: the video in the full window, a step of its own in the history, the player told to play — the press being the viewer\'s (D1, D5)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  const s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused, s.ring], ['playing', true, true, false]);
  T.eq([p.win.history.state, p.win.history.length], [{ tenfootPlay: true }, 2], 'a step above the details page');
  const h = p.last('player:hold');
  T.eq([h.on, h.play, h.restart, h.gesture], [false, true, false, true]);
  T.eq(p.last('player:focus').type, 'player:focus');
  T.eq(trailNow(p).map((e) => Boolean(e.play)), [false, true], 'the trail has the step too');
  T.eq(trailNow(p)[1].kind, 'video', 'described as its page is');
  T.eq((await p.msg({ type: 'page:info' })).hold, false);
});

T.runAsync('the words to the player are numbered; after Watch, a frame still holding the video is told again, twice at most', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  const seqs = () => p.bg.filter((m) => m.type === 'player:hold').map((m) => m.seq);
  await watch(p);
  T.eq(seqs(), [1, 2], 'hold, then play');
  await p.msg({ type: 'player:state', state: { held: true, paused: true } });
  await T.sleep(2600);
  T.eq(seqs(), [1, 2, 3], 'still held: play again');
  await T.sleep(2600);
  T.eq(seqs(), [1, 2, 3, 4]);
  await T.sleep(2600);
  T.eq(seqs(), [1, 2, 3, 4], 'and no more');
  const q = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(q);
  await q.msg({ type: 'player:state', state: { held: false, paused: false } });
  await T.sleep(2600);
  T.eq(q.bg.filter((m) => m.type === 'player:hold').length, 2, 'playing: nothing more to say');
}, 12000);

T.runAsync('Resume says where it picks up; Start Over plays from the beginning and says nothing', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  await watch(p);
  T.ok(p.hints().textContent.includes('Resumed at 10:00'), 'after the key\'s own hints: ' + p.hints().textContent);
  T.eq(p.last('player:hold').restart, false);
  const q = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  q.key('ArrowRight');
  T.eq(q.doc.activeElement.textContent, 'Start Over');
  await watch(q);
  T.eq([q.last('player:hold').restart, (await q.state()).watch], [true, 'playing']);
  await q.msg({ type: 'player:resumed', at: 600 });
  T.notOk(q.hints().textContent.includes('Resumed'), 'the frame\'s word on a resume is not shown: ' + q.hints().textContent);
});

T.runAsync('Back while it plays: the details page again, now saying Resume, and the video held (D5)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  T.notOk(p.key('BrowserBack').defaultPrevented, 'the remote\'s Back is Firefox\'s');
  await firefoxBack(p);
  let s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused, s.focused.text], ['details', false, false, 'Watch']);
  T.eq([p.last('player:hold').on, p.win.history.state], [true, null]);
  T.eq(trailNow(p).length, 1, 'the step is off the trail');
  T.notOk(p.hints().hidden, 'hints back');
  await p.shim.changeStorage({ 'progress:0': { newValue: leftAt(600) } });
  await T.sleep(20);
  s = await p.state();
  T.eq([s.home.episode.actions.slice(0, 2), s.focused.text], [['Resume', 'Start Over'], 'Resume'], 'where it got to, on the same button');
  await T.sleep(900);
  T.eq([(await p.state()).navigation, p.win.__went], [null, []], 'no Back of Leanback\'s racing Firefox\'s');
  p.win.history.forward();
  await T.sleep(40);
  T.eq((await p.state()).watch, 'playing', 'Forward plays it again');
}, 5000);

T.runAsync('Escape is the same Back: off the video to the details page, then out of the episode', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, before: trailOf({ url: SEASON3, kind: 'series', group: 'game-changer' }) });
  await watch(p);
  p.key('Escape');
  await T.sleep(30);
  T.eq(p.win.__went, [-1], 'one step back in the history, as BrowserBack would');
  await firefoxBack(p);
  T.eq((await p.state()).watch, 'details');
  p.key('Escape');
  await T.sleep(30);
  T.eq(p.win.__went, [-1, -1], 'then the episode itself');
  const intent = JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent'));
  T.eq([intent.kind, intent.to], ['back', SEASON3]);
});

T.runAsync('BrowserBack with nothing behind the details page (a tab opened on the episode): Leanback walks up to the season', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, before: episodeOrder });
  p.key('BrowserBack');
  await T.sleep(950);
  const s = await p.state();
  T.eq(s.navigation, SEASON3, 'up to the season you came from');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'replacing the episode, so the history never gains a page above');
  const q = await boot({ html: fixture('video.html'), url: URLS.video });
  T.eq((await q.msg({ type: 'page:action', action: 'browser-back' })).consumed, false, 'from inside the player: handed to the page');
  await T.sleep(950);
  T.ok((await q.state()).navigation.endsWith('/game-changer'), 'and the show link when no season is known');
}, 6000);

T.runAsync('the options button: Leanback\'s settings on the details page; the player\'s panel while it plays', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  p.key('ContextMenu');
  await T.sleep(20);
  T.ok((await p.state()).menu.includes('seekStep'), 'the page\'s own panel');
  T.eq(p.last('player:settings'), undefined);
  p.key('ContextMenu');
  T.eq((await p.state()).focused.text, 'Watch', 'closed, the selection back');
  await watch(p);
  p.key('ContextMenu');
  await T.sleep(20);
  T.eq(p.last('player:settings').type, 'player:settings', 'while playing, the frame\'s');
  T.eq((await p.state()).menu, null);
});

T.runAsync('media keys: play/pause on the details page is Watch; while playing they go to the player; next/previous use the episode order', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  p.key('MediaStop');
  p.key('MediaFastForward');
  T.eq(p.last('player:command'), undefined, 'nothing playing to stop or skip');
  p.key('MediaPlayPause');
  await T.sleep(20);
  T.eq([(await p.state()).watch, p.last('player:hold').play], ['playing', true]);
  p.key('MediaPlayPause');
  T.eq(p.last('player:command').cmd, 'toggle');
  p.key('MediaStop');
  T.eq(p.last('player:command').cmd, 'stop');
  p.key('MediaFastForward');
  T.eq([p.last('player:command').cmd, p.last('player:command').by], ['seek', 30]);
  p.key('MediaRewind');
  T.eq(p.last('player:command').by, -30);
  p.win.sessionStorage.setItem('tenfoot.episodes', JSON.stringify({ series: '/game-changer', urls: [EP0, URLS.video, EP2] }));
  p.key('MediaTrackPrevious');
  T.ok((await p.state()).navigation.endsWith('/videos/ep0'));
  T.eq((await p.msg({ type: 'page:episode', delta: 1 })).done, true);
  T.ok((await p.state()).navigation.endsWith('/videos/ep2'));
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'another episode is sideways');
});

T.runAsync('arriving from an episode that was playing (up next, the next key, Dropout\'s countdown): this one plays straight away', async () => {
  const fromPlaying = (from) => (win) => {
    trailOf({ url: SEASON3, kind: 'series', group: 'game-changer' }, { url: EP0, kind: 'video', group: 'game-changer' }, from)(win);
  };
  const p = await boot({ html: fixture('video.html'), url: URLS.video, before: fromPlaying({ url: EP0, kind: 'video', group: 'game-changer', play: true }) });
  let s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused], ['playing', true, true]);
  T.eq(p.win.history.state, { tenfootPlay: true }, 'with its own step, so Back is its details page');
  const h = p.last('player:hold');
  T.eq([h.on, h.play, h.gesture], [false, true, false], 'played, no press of the viewer\'s claimed');
  T.eq(trailNow(p).map((e) => [e.url.split('/').pop(), Boolean(e.play)]), [['season:3', false], ['ep0', false], ['ep0', true], ['ep1', false], ['ep1', true]]);
  const q = await boot({ html: fixture('video.html'), url: URLS.video, before: fromPlaying({ url: EP0, kind: 'video', group: 'game-changer' }) });
  T.eq((await q.state()).watch, 'details', 'from its details page: the details page');
  const r = await boot({ html: fixture('video.html'), url: URLS.video, before: fromPlaying({ url: 'https://watch.dropout.tv/other/season:1/videos/x', kind: 'video', group: 'other', play: true }) });
  T.eq((await r.state()).watch, 'details', 'from another show: the details page');
});

T.runAsync('a reload while it plays carries on playing; Back is still the details page', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      win.history.replaceState({ tenfootPlay: true }, '', win.location.href);
      trailOf({ url: URLS.video, kind: 'video', group: 'game-changer' }, { url: URLS.video, kind: 'video', group: 'game-changer', play: true })(win);
      win.performance.getEntriesByType = () => [{ type: 'reload' }];
    }
  });
  T.eq([(await p.state()).watch, p.win.history.length], ['playing', 1], 'playing, no second step');
  p.key('Escape');
  await T.sleep(30);
  T.eq(p.win.__went, [-1]);
});

T.runAsync('arriving by Back on a sibling episode (Dropout went on to the next by itself) carries on to the season page', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      trailOf(
        { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
        { url: SEASON3, kind: 'series', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer' },
        { url: EP2, kind: 'video', group: 'game-changer' }
      )(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq(p.win.__went, [-1], 'on past the previous episode');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).to, SEASON3);
  T.eq(p.doc.querySelector('.tenfoot-screen'), null, 'and this page was not set up on the way through');
});

T.runAsync('arriving by Back on the step of the episode before: on past its details page too, to the season', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      win.history.replaceState({ tenfootPlay: true }, '', win.location.href);
      trailOf(
        { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
        { url: SEASON3, kind: 'series', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer', play: true },
        { url: EP2, kind: 'video', group: 'game-changer' }
      )(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq(p.win.__went, [-2], 'both of its entries at once');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).to, SEASON3);
});

T.runAsync('Firefox\'s Back passing over the details page of a video that started by itself (nobody interacted with it): on to it', async () => {
  const trail = [
    { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
    { url: SEASON3, kind: 'series', group: 'game-changer' },
    { url: URLS.video, kind: 'video', group: 'game-changer' },
    { url: URLS.video, kind: 'video', group: 'game-changer', play: true },
    { url: EP2, kind: 'video', group: 'game-changer' },
    { url: EP2, kind: 'video', group: 'game-changer', play: true }
  ];
  const land = (onStep) => (win) => {
    if (onStep) win.history.replaceState({ tenfootPlay: true }, '', win.location.href);
    trailOf(...trail)(win);
    win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
  };
  const p = await boot({ html: fixture('video.html'), url: URLS.video, before: land(true) });
  T.eq(p.win.__went, [1], 'from this episode\'s step, one forward');
  T.eq(trailNow(p).map((e) => [e.url.split('/').pop(), Boolean(e.play)]), [['browse', false], ['season:3', false], ['ep1', false], ['ep1', true], ['ep2', false]], 'the trail ends on that details page');
  T.eq(p.doc.querySelector('.tenfoot-screen'), null, 'and this page was not set up on the way through');
  const q = await boot({ html: fixture('video.html'), url: URLS.video, before: land(false) });
  T.eq(q.win.__went, [2], 'from this episode\'s details page, two forward');
});

T.runAsync('coming to a details page by Back (or on to it): the details page, not playing; Dropout 24/7\'s too', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      trailOf({ url: SEASON3, kind: 'series', group: 'game-changer' }, { url: URLS.video, kind: 'video', group: 'game-changer' })(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq([(await p.state()).watch, p.win.history.length], ['details', 1]);
  const live = 'https://watch.dropout.tv/dropout-247/events/dropout-24-7';
  const q = await boot({
    html: fixture('live.html'),
    url: live,
    before: (win) => {
      trailOf({ url: 'https://watch.dropout.tv/dropout-24-7', kind: 'hub' }, { url: live, kind: 'video' })(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq([(await q.state()).watch, q.last('player:hold').on], ['details', true], 'the stream waits for Watch');
});

T.runAsync('arriving by Back on the details page of the episode before (its step passed over): on to the season page', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      trailOf(
        { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
        { url: SEASON3, kind: 'series', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer', play: true },
        { url: EP2, kind: 'video', group: 'game-changer' }
      )(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq(p.win.__went, [-1], 'one step: this is the page itself, not its step');
});

T.runAsync('arriving by Back on the season page stays there', async () => {
  const p = await boot({
    html: fixture('series.html'),
    url: SEASON3,
    before: (win) => {
      trailOf(
        { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
        { url: SEASON3, kind: 'series', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer' }
      )(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq(p.win.__went, []);
  const trail = JSON.parse(p.win.sessionStorage.getItem('tenfoot.trail'));
  T.eq(trail.map((e) => e.url), ['https://watch.dropout.tv/browse', SEASON3], 'the episode is off the trail');
  T.eq([trail[1].kind, trail[1].group, trail[1].parent], ['series', 'game-changer', 'https://watch.dropout.tv/browse'], 'and the page described itself');
});

T.runAsync('series: the season page records itself, season and all', async () => {
  const p = await boot({ html: fixture('series.html'), url: 'https://watch.dropout.tv/game-changer/season:3' });
  const stored = JSON.parse(p.win.sessionStorage.getItem('tenfoot.episodes'));
  T.eq(stored.href, 'https://watch.dropout.tv/game-changer/season:3');
});

T.runAsync('while it plays: the hints say OK plays the up-next card and ◀ hides it', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  await p.msg({ type: 'player:ready' });
  await p.msg({ type: 'player:state', state: { paused: false, upNextShowing: true, upNextCard: true } });
  const text = () => p.hints().textContent;
  T.ok(text().includes('Play next episode') && text().includes('Hide up next'), text());
  T.notOk(text().includes('+10 s'), 'not a skip while the card is up');
  await p.msg({ type: 'player:state', state: { paused: false, upNextShowing: false, upNextCard: false } });
  p.key('MediaPlayPause');
  T.ok(text().includes('−10 s / +10 s') && !text().includes('Hide up next'), 'gone with the card: ' + text());
});

T.runAsync('player:ended → autoplay next after a short delay while playing, unless turned off or hidden; never from the details page', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  await p.msg({ type: 'player:ended', upNext: { url: EP2 } });
  T.eq((await p.state()).navigation, null, 'not yet');
  await T.sleep(1400);
  T.ok((await p.state()).navigation.endsWith('/videos/ep2'));
  const q = await boot({ html: fixture('video.html'), url: URLS.video, settings: { autoplayNext: false } });
  await watch(q);
  await q.msg({ type: 'player:ended', upNext: { url: 'https://watch.dropout.tv/x' } });
  const h = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(h);
  await h.msg({ type: 'player:ended', upNext: { url: 'https://watch.dropout.tv/x' }, dismissed: true });
  const d = await boot({ html: fixture('video.html'), url: URLS.video });
  await d.msg({ type: 'player:ended', upNext: { url: 'https://watch.dropout.tv/x' } });
  const r = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(r);
  await r.msg({ type: 'player:ended', upNext: null });
  await T.sleep(1400);
  T.eq((await q.state()).navigation, null, 'autoplay off');
  T.eq((await h.state()).navigation, null, 'the viewer hid the up-next card: nothing plays by itself (P5)');
  T.eq((await d.state()).navigation, null, 'held behind the details page: nothing');
  T.eq((await r.state()).navigation, null, 'no up-next and no episode order: stays');
  T.ok(r.hints().textContent.includes('No next episode'));
}, 8000);

T.runAsync('while it plays, the page-side up-next card is taken rather than navigated past (item 7)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  const card = p.$('page-upnext');
  const clicks = [];
  p.$('page-upnext-link').addEventListener('click', (e) => { e.preventDefault(); clicks.push('link'); });
  card.hidden = false;
  card.setAttribute('data-rect', '900,600,300,120');
  await T.sleep(200);
  T.ok(p.bg.some((m) => m.type === 'player:offer' && m.showing === true), 'the frame is told the offer is up');
  T.eq((await p.msg({ type: 'page:episode', delta: 1 })).done, true);
  T.eq(clicks, ['link'], 'the card was clicked, keeping the site\'s own resume behaviour');
  T.eq((await p.state()).navigation, null, 'nothing was navigated by hand');
});

T.runAsync('a late player frame: Watch parks the ring on its place; the frame arriving takes the keys, and player:ready says play again', async () => {
  const html = fixture('video.html').replace(/<iframe[^>]*><\/iframe>/, '');
  const p = await boot({ html, url: URLS.video });
  await watch(p);
  let s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused, s.focused.id], ['playing', true, false, 'mount'], 'waiting for the frame');
  const f = p.doc.createElement('iframe');
  f.id = 'frame'; f.src = 'https://embed.vhx.tv/videos/612228?api=1'; f.setAttribute('data-rect', '0,60,1280,720');
  p.$('mount').appendChild(f);
  await T.sleep(200);
  s = await p.state();
  T.eq([s.playerFocused, p.doc.activeElement.id], [true, 'frame']);
  const before = p.bg.filter((m) => m.type === 'player:hold').length;
  await p.msg({ type: 'player:ready', frameId: 7 });
  T.eq((await p.state()).playerReady, true);
  const holds = p.bg.filter((m) => m.type === 'player:hold');
  T.eq([holds.length - before, holds.at(-1).on, holds.at(-1).play], [1, false, true]);
});

T.runAsync('on the details page the player frame taking the focus gives it back', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  p.$('frame').focus();
  await T.sleep(20);
  const s = await p.state();
  T.eq([s.playerFocused, s.focused.text], [false, 'Watch']);
});

T.runAsync('Dropout 24/7\'s stream opens on its details page — its name, its words, Watch, the rail — and Watch plays it, the press being the viewer\'s', async () => {
  const p = await boot({ html: fixture('live.html'), url: 'https://watch.dropout.tv/dropout-247/events/dropout-24-7' });
  let s = await p.state();
  T.eq([s.kind, s.watch, s.theater, s.playerFocused, s.focused.text, Boolean(s.rail)], ['video', 'details', false, false, 'Watch', true]);
  T.eq(s.home.episode, { show: null, title: 'Dropout 24/7', meta: null, actions: ['Watch'], image: null, left: null });
  T.eq(p.doc.querySelector('.tenfoot-screen .tenfoot-hero-text').textContent, 'An always-on channel featuring your favorite Dropout content, ad-free.');
  T.eq(p.last('player:hold').on, true, 'nothing plays until Watch');
  T.ok(p.$('live-event').hasAttribute('data-tenfoot-theater-root'));
  await watch(p);
  s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused], ['playing', true, true]);
  const h = p.last('player:hold');
  T.eq([h.on, h.play, h.gesture], [false, true, true], 'so the sound can come on with it');
  await firefoxBack(p);
  T.eq((await p.state()).watch, 'details', 'Back: its details page');
  T.eq(p.last('history:meta'), undefined, 'a live stream is not a video for the watch history');
});

// Dropout 24/7's page: Watch plays the stream right there (content/page-live.js).
const HUB = 'https://watch.dropout.tv/dropout-24-7';
const EVENT = 'https://watch.dropout.tv/dropout-247/events/dropout-24-7';
const STREAM = 'https://embed.vhx.tv/videos/612228?api=1&autoplay=0&collection_id=1486854&live=1';
// The page's own fetch, as Firefox exposes it to a content script.
const servesStream = (html) => (win) => {
  win.__fetched = [];
  win.cloneInto = (o) => o;
  win.wrappedJSObject = { fetch: async (u, o) => { win.__fetched.push([u, o && o.credentials]); return { ok: true, text: async () => html }; } };
};

T.runAsync('Dropout 24/7\'s page: Watch reads the stream\'s page as the page would and plays its player right here, in the full window, a step of its own in the history', async () => {
  const p = await boot({ html: fixture('hub.html'), url: HUB, before: servesStream(fixture('live.html')) });
  let s = await p.state();
  T.eq([s.kind, s.focused.text, s.rail.page], ['hub', 'Watch', 'live']);
  p.key('Enter');
  await T.sleep(30);
  T.eq(p.win.__fetched, [[EVENT, 'include']], 'by the page\'s own fetch, with the viewer\'s sign-in');
  const frame = p.doc.querySelector('.tenfoot-inplace iframe');
  T.ok(frame, 'the player, over the page');
  T.eq([frame.getAttribute('src'), frame.getAttribute('allow'), frame.title], [STREAM, 'autoplay; fullscreen; encrypted-media', 'Dropout 24/7']);
  s = await p.state();
  T.eq([s.navigation, s.playerFocused, p.doc.activeElement === frame], [null, true, true], 'no page opened; the keys to the player');
  T.eq(p.win.history.state, { tenfootPlay: true });
  T.eq(await p.msg({ type: 'page:info' }), { ok: true, hold: false, title: 'Dropout 24/7', series: '', season: null, episode: null });
  await p.msg({ type: 'player:ready', frameId: 9 });
  const h = p.last('player:hold');
  T.eq([h.on, h.play, h.gesture], [false, true, true], 'play, the press being the viewer\'s: the sound can come on');
  T.eq(p.last('player:focus').type, 'player:focus');
  T.eq((await p.act('menu')).menu, null, 'the options button: the player\'s settings');
  T.eq(p.last('player:settings').type, 'player:settings');
  await firefoxBack(p);
  s = await p.state();
  T.eq([p.doc.querySelector('.tenfoot-inplace'), s.playerFocused, s.focused.text], [null, false, 'Watch'], 'Back: the player gone, Dropout 24/7\'s page again');
  T.notOk(p.hints().hidden, 'hints back');
});

T.runAsync('Dropout 24/7: Escape is the same Back; turning Leanback off takes the player away', async () => {
  const p = await boot({ html: fixture('hub.html'), url: HUB, before: servesStream(fixture('live.html')) });
  p.key('Enter');
  await T.sleep(30);
  p.key('Escape');
  await T.sleep(30);
  T.eq(p.win.__went, [-1], 'off its step in the history');
  await p.shim.changeStorage({ settings: { newValue: { enabled: false } } });
  await T.sleep(20);
  T.eq(p.doc.querySelector('.tenfoot-inplace'), null);
});

T.runAsync('Dropout 24/7: with no player to read on the stream\'s page, Watch opens that page, as the link would', async () => {
  const p = await boot({ html: fixture('hub.html'), url: HUB, before: servesStream('<!doctype html><p>Sign in to watch</p>') });
  p.key('Enter');
  await T.sleep(30);
  T.eq([(await p.state()).navigation, p.doc.querySelector('.tenfoot-inplace')], [EVENT, null]);
});

T.runAsync('the season line under the title, Episodes going to that season; My List presses Dropout\'s own and turns to a tick; turning Leanback off lets the player go', async () => {
  const html = fixture('video.html').replace('<h1 class="video-title">', '<h5 class="badges-container"><a href="https://watch.dropout.tv/game-changer/season:1"> Season 1, Episode 4 </a> • <a class="meta-data-link" data-similar-items-site="1">28-Feb-2020</a></h5><h1 class="video-title">');
  const p = await boot({ html, url: URLS.video });
  T.eq((await p.state()).home.episode.meta, 'Season 1, Episode 4 · 28-Feb-2020');
  const pressed = [];
  p.$('video-mylist').addEventListener('click', () => { pressed.push(1); p.$('video-mylist').classList.replace('icon-watchlist-add', 'icon-watchlist-remove'); });
  p.key('ArrowRight');
  p.key('Enter');
  await T.sleep(200);
  T.eq([pressed.length, p.doc.activeElement.textContent, p.doc.activeElement.getAttribute('aria-label'), p.doc.activeElement.dataset.tenfootListed], [1, 'My List', 'Remove from My List', 'true'], 'Dropout\'s button pressed; the state follows it');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.getAttribute('href'), 'https://watch.dropout.tv/game-changer/season:1', 'Episodes: the season the line names');
  await p.shim.changeStorage({ settings: { newValue: { enabled: false } } });
  await T.sleep(20);
  T.eq(p.last('player:hold').on, false, 'the player is Dropout\'s again');
  T.eq(p.doc.querySelector('.tenfoot-screen'), null);
});

T.runAsync('video (not drawn): Dropout\'s page plays at once with no rail; ▼ out of the player is Dropout\'s page, ▲ the video again (item 6)', async () => {
  // No title to draw the details from: Dropout's page, driven as it is.
  const p = await boot({ html: fixture('video.html').replace('<h1 class="video-title">Episode</h1>', ''), url: URLS.video });
  let s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused, s.rail, p.win.history.length], ['playing', true, true, null, 1]);
  await p.msg({ type: 'page:focus', hint: 'below' });
  T.eq((await p.state()).focused.id, 'series-link', 'the link back to the show, not the tags nearest below the player (bug 2)');
  // Push the player off the top, as scrolling does: geometry alone then
  // prefers a header link, which is what the owner hit.
  p.$('mount').setAttribute('data-rect', '0,-700,1280,720');
  p.$('watch-player').setAttribute('data-rect', '0,-700,1280,720');
  p.key('ArrowUp');
  p.key('ArrowUp');
  p.key('ArrowUp');
  s = await p.state();
  T.eq([s.theater, s.playerFocused], [true, true], 'back in the player, not on a header link');
  p.key('Escape');
  await T.sleep(30);
  s = await p.state();
  T.eq([s.theater, s.focused.id], [false, 'mount'], 'Back: Dropout\'s page under the video first');
});

T.runAsync('the hint bar stays up on a page, and gets out of the way while a video plays (bug 4)', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  T.notOk(p.hints().hidden, 'up from the start, before any key is pressed');
  p.key('ArrowRight');
  await T.sleep(3300);
  T.notOk(p.hints().hidden, 'still up three seconds later — it no longer auto-hides on a page');
  const v = await boot({ html: fixture('video.html'), url: URLS.video });
  T.notOk(v.hints().hidden, 'up on the details page');
  await watch(v);
  await T.sleep(3300);
  T.ok(v.hints().hidden, 'gone while the video has the screen, once the press\'s own showing is over');
  await firefoxBack(v);
  T.notOk(v.hints().hidden, 'back with the details page');
}, 10000);

T.runAsync('search: the field keeps the keyboard; ▼ and Escape leave it for the results, ▲ comes back (N1)', async () => {
  const html = '<!doctype html><html><body><header class="site-header" data-rect="0,0,1280,60"><a href="/browse" class="browse-link" data-rect="20,15,80,30">Browse</a></header><input type="search" id="q" data-rect="40,100,400,40"><div class="browse-item-card"><a href="/x" class="browse-item-link" id="res1" data-rect="40,200,380,214">R1</a></div></body></html>';
  const p = await boot({ html, url: 'https://watch.dropout.tv/search' });
  T.eq((await p.state()).kind, 'search');
  T.eq(p.doc.activeElement.id, 'q');
  T.notOk(p.key('ArrowRight').defaultPrevented, '▶ belongs to the field');
  T.ok(p.key('ArrowDown').defaultPrevented, '▼ is Leanback\'s: a one-line field has no line below');
  T.eq(p.doc.activeElement.id, 'res1', 'down to the results');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.id, 'q', '▲ back into the box');
  T.notOk(p.key('/').defaultPrevented);
  T.ok(p.key('Escape').defaultPrevented);
  T.eq(p.doc.activeElement.id, 'res1');
  T.ok(p.key('/').defaultPrevented);
  T.eq((await p.state()).navigation, rules.browseUrl, '"/" again closes search and returns you (item 9)');
});

T.runAsync('other: no focus grab, ring follows whatever the page focuses, Back is history/parent', async () => {
  const html = '<!doctype html><html><body><form><input id="email" data-rect="40,100,300,40"><button id="go" data-rect="40,160,100,40">Go</button></form></body></html>';
  const p = await boot({ html, url: 'https://watch.dropout.tv/settings' });
  const s = await p.state();
  T.eq([s.kind, s.focused], ['other', null]);
  T.ok(p.ring().hidden);
  p.$('go').focus();
  await T.sleep(5);
  T.notOk(p.ring().hidden);
  T.eq((await p.state()).focused.id, 'go');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.id, 'email', 'arrows still work over form controls');
  p.key('Escape');
  T.eq(p.doc.activeElement.id, 'go', 'Escape leaves the field');
});

T.runAsync('toggle off via storage: ring and hints gone, keys untouched; on again re-initialises', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  await p.shim.changeStorage({ settings: { newValue: { enabled: false } } });
  await T.sleep(5);
  T.eq(p.doc.documentElement.dataset.tenfoot, 'off');
  T.ok(p.ring().hidden);
  T.notOk(p.key('ArrowRight').defaultPrevented);
  T.eq((await p.state()).enabled, false);
  T.eq((await p.act('right')).consumed, false);
  await p.shim.changeStorage({ settings: { newValue: { enabled: true } } });
  await T.sleep(5);
  T.eq(p.doc.documentElement.dataset.tenfoot, 'on');
  T.eq((await p.state()).focused.id, 'r1c1');
  T.ok(p.key('ArrowRight').defaultPrevented);
});

T.runAsync('settings: ring style and hint bar follow storage; exit hint reflects the exit hook', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse, settings: { ringColor: '#112233', ringWidth: 6, hintBar: false, exitHook: 'close-tab' } });
  const st = p.doc.documentElement.style;
  T.eq([st.getPropertyValue('--tenfoot-ring-color'), st.getPropertyValue('--tenfoot-ring-width')], ['#112233', '6px']);
  p.key('ArrowRight');
  T.ok(p.hints().hidden, 'hint bar disabled by setting');
  await p.shim.changeStorage({ settings: { newValue: { ringColor: '#445566', hintBar: true, exitHook: 'close-tab' } } });
  await T.sleep(5);
  T.eq(st.getPropertyValue('--tenfoot-ring-color'), '#445566');
  p.key('ArrowRight');
  T.notOk(p.hints().hidden);
  T.ok(p.hints().textContent.includes('Exit'));
  p.replies.exit = { ok: true, action: 'close-tab' };
  p.key('Escape');
  await T.sleep(10);
  T.notOk(p.hints().textContent.includes('Nothing to go back to'));
});

T.runAsync('page:action / page:state answer even when disabled; unknown messages are answered', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  T.eq((await p.msg({ type: 'nope' })).ok, false);
  T.eq((await p.msg(null)).ok, false);
  T.eq((await p.act('right')).focused.id, 'r1c2');
  T.eq((await p.act('bogus')).consumed, false);
});

T.runAsync('a second injection is a no-op; the rules failing to load leaves the page alone', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  const n = p.shim.listeners.message.length;
  p.dom.runScripts(FILES);
  await T.sleep(20);
  T.eq(p.shim.listeners.message.length, n);
  const shim = makeBrowserShim();
  shim.browser.runtime.onMessage.addListener((m, s, send) => { send({ ok: false, error: 'nope' }); return false; });
  const dom = makeDom({ html: fixture('browse.html'), url: URLS.browse, browser: shim.browser });
  dom.runScripts(FILES);
  await T.sleep(40);
  T.eq(dom.document.documentElement.dataset.tenfoot, 'off');
  T.eq(dom.document.activeElement, dom.document.body);
});

// ---------------------------------------------------------------------------
// 0.7.1: the panel keeps itself, search keeps its field, the show keeps its season
// ---------------------------------------------------------------------------

T.runAsync('menu: the panel stays open and takes the focus back when the site steals it', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  await p.act('menu');
  let s = await p.state();
  T.ok(s.menu.includes('autoplayNext'), 'the settings list opened: ' + JSON.stringify(s.menu));
  // Dropout re-renders and pulls the focus into its own DOM. Closing on that
  // is what made the settings panel shut itself the instant it opened.
  p.$('r1c1').focus();
  s = await p.state();
  T.ok(s.menu && s.menu.includes('autoplayNext'), 'still open: ' + JSON.stringify(s.menu));
  T.eq(p.doc.activeElement.dataset.tenfootItem, 'autoplayNext', 'and the focus came back to the panel');
  // A trap that keeps taking it does not become an infinite fight.
  for (let i = 0; i < 12; i += 1) p.$('r1c1').focus();
  T.ok((await p.state()).menu.includes('autoplayNext'), 'the panel survives a focus trap too');
});

T.runAsync('menu: the selection is stamped on the element, not read from :focus', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse });
  await p.act('menu');
  const current = () => Array.from(p.doc.querySelectorAll('[data-tenfoot-current="true"]')).map((b) => b.dataset.tenfootItem);
  T.eq(current(), ['autoplayNext'], 'the first item is marked');
  p.key('ArrowDown');
  T.eq(current(), ['seekStep'], 'exactly one item carries the mark');
});

T.runAsync('search: the initial focus waits for the field rather than grabbing what is already there', async () => {
  const html = '<!doctype html><html><body>' +
    '<header class="site-header"><a id="nav1" href="/browse" data-rect="20,10,120,40">Browse</a></header>' +
    '<ul id="results"><li class="browse-item-card"><a id="hit1" class="browse-item-link" href="/x" data-rect="40,300,380,214">Hit</a></li></ul>' +
    '<main id="main"></main></body></html>';
  const p = await boot({ html, url: URLS.search });
  T.eq((await p.state()).kind, 'search');
  T.notOk(['nav1', 'hit1'].includes(p.doc.activeElement && p.doc.activeElement.id), 'nothing else was grabbed: ' + (p.doc.activeElement && p.doc.activeElement.id));
  // The field is rendered once the site's framework starts.
  const input = p.doc.createElement('input');
  input.type = 'search';
  input.id = 'q';
  input.setAttribute('data-rect', '300,80,600,56');
  p.$('main').appendChild(input);
  await T.sleep(180);
  T.eq(p.doc.activeElement.id, 'q', 'focused as soon as it exists');
});

T.runAsync('search: the field is matched whatever input type the site uses', async () => {
  const html = '<!doctype html><html><body>' +
    '<form><input type="hidden" name="authenticity_token" value="x">' +
    '<input id="q" name="q" data-rect="300,80,600,56"></form></body></html>';
  const p = await boot({ html, url: URLS.search });
  T.eq(p.doc.activeElement.id, 'q', 'a bare <input> with no type is still the search field');
});


T.runAsync('search: on the site\'s own search app (SearchForm-module__search-input), Leanback draws the page and its own box takes the focus', async () => {
  // Taken from watch.dropout.tv's own search bundle and stylesheet: on this
  // site the CSS-module classes are unhashed, so they can be matched exactly.
  const html = '<!doctype html><html><body>' +
    '<header class="site-header"><a id="nav1" href="/browse" data-rect="20,10,120,40">Browse</a></header>' +
    '<div class="SearchForm-module__search-form-container" data-rect="300,70,700,60">' +
    '<div class="SearchForm-module__search-icon-container"><svg class="SearchForm-module__search-icon"></svg></div>' +
    '<input class="SearchForm-module__search-input custom-css-search-input" placeholder="Search" data-rect="340,80,620,44">' +
    '</div></body></html>';
  const p = await boot({ html, url: URLS.search });
  const s = await p.state();
  T.eq([s.kind, s.home && s.home.layout], ['search', 'search']);
  T.ok(p.doc.activeElement.classList.contains('tenfoot-kb-key'),
    'the keyboard takes the selection the moment the page opens, got: ' + p.doc.activeElement.className);
  T.eq(p.doc.querySelector('.tenfoot-kb-placeholder').textContent, 'Search', 'its box with the site\'s placeholder');
  T.ok(p.doc.querySelector('input.SearchForm-module__search-input').isConnected, 'Dropout\'s box is still there, underneath');
});

T.runAsync('search: results and filters are reachable, and load more is found', async () => {
  const rules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));
  const search = rules.pages.search;
  const sel = (v) => (Array.isArray(v) ? v.join(', ') : v);
  T.ok(sel(search.initialFocus).includes('SearchForm-module__search-input'), 'the real field is the preferred hook');
  T.ok(sel(search.focusable).includes('Filter-module__filter'), 'the filter buttons are focusable');
  T.eq(search.tile, '.browse-item-card', 'results reuse the browse tile');
  T.ok(sel(search.target).includes('a[href]'), 'the React results\' link has no class');
  T.ok(sel(search.focusable).includes('TypeFilters-module__type-filter'), 'the All / Videos / Collections filters (2026-09-26 capture)');
  T.ok(sel(search.loadMore).includes('SearchResults-module__load-more'), 'the results\' own Load More');
});

// ---------------------------------------------------------------------------
// the look: Theme Color, Holidays, Theme This Page
// ---------------------------------------------------------------------------

T.runAsync('Cookie Preferences in Leanback\'s settings presses Dropout\'s own "Manage Cookie Preferences" (its footer is hidden), the panel closing first', async () => {
  const html = fixture('browse.html').replace('</body>', '<footer class="footer--site"><a class="site-font-secondary-color legal-link manage-cookies-link" href="#" data-rect="10,1000,160,20">Manage Cookie Preferences</a></footer></body>');
  const p = await boot({ html, url: URLS.browse });
  let clicked = 0;
  p.doc.querySelector('.manage-cookies-link').addEventListener('click', (e) => { e.preventDefault(); clicked += 1; });
  await p.act('menu');
  await moveTo(p, 'cookies', 20);
  p.key('Enter');
  await T.sleep(20);
  T.eq([clicked, (await p.state()).menu], [1, null], 'pressed; the panel closed');
});

T.runAsync("Dropout's promotion bar (\"GET 20% OFF…\") is never shown while Leanback is on", async () => {
  const html = fixture('browse.html').replace('<body', '<body data-x').replace(/<body([^>]*)>/, '<body$1><div class="promo-banner"><a class="promo-banner-text" href="/checkout">GET 20% OFF YOUR FIRST YEAR!</a></div>');
  const p = await boot({ html, url: URLS.browse });
  T.eq(p.win.getComputedStyle(p.doc.querySelector('.promo-banner')).display, 'none');
  T.ok(p.doc.getElementById('tenfoot-site-style').textContent.includes('.promo-banner'));
});

T.runAsync('the look: Theme Color is the accent of every page and the ring; a holiday picked shows its own', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse, settings: { ringColor: '#7cc6fe' } });
  const root = p.doc.documentElement;
  T.eq([root.style.getPropertyValue('--tenfoot-accent'), root.style.getPropertyValue('--tenfoot-ring-color')], ['#7cc6fe', '#7cc6fe']);
  await p.shim.changeStorage({ settings: { newValue: { ringColor: '#7cc6fe', holidays: 'halloween', theme: 'oled' } } });
  await T.sleep(20);
  T.eq([root.style.getPropertyValue('--tenfoot-accent'), root.dataset.tenfootHoliday, root.dataset.tenfootTheme, root.style.getPropertyValue('--tf-bg')], ['#ffa94d', 'halloween', 'oled', '#000000']);
});

T.runAsync('Theme This Page on Home: the banner — each value shown as you move to it, Back puts it back, OK keeps it; Off takes the banner away', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  const root = p.doc.documentElement;
  T.eq(root.dataset.tenfootLookBanner, 'large');
  T.ok(p.doc.querySelector('.tenfoot-hero') && !p.doc.querySelector('.tenfoot-hero').hidden, 'the banner');
  await p.act('menu');
  await moveTo(p, 'look');
  p.key('Enter');
  T.eq(p.doc.querySelector('.tenfoot-settings-title').textContent, 'Theme This Page: Home');
  p.key('Enter');
  p.key('ArrowDown');
  T.eq(root.dataset.tenfootLookBanner, 'small', 'Small, at once');
  p.key('Escape');
  T.eq(root.dataset.tenfootLookBanner, 'large', 'Back: as it was');
  T.notOk(p.shim.store.settings.pageLooks, 'nothing saved');
  p.key('Enter');
  p.key('ArrowDown'); p.key('ArrowDown');
  T.eq(root.dataset.tenfootLookBanner, 'off');
  T.ok(p.doc.querySelector('.tenfoot-hero').hidden, 'no banner');
  p.key('Enter');
  await T.sleep(20);
  T.eq(p.shim.store.settings.pageLooks.home.banner, 'off', 'kept');
  p.key('Escape'); p.key('Escape');
  await T.sleep(20);
  T.eq(root.dataset.tenfootLookBanner, 'off', 'still, with the panel closed');
  T.ok(p.doc.activeElement.closest('.tenfoot-card'), 'the selection on a card, not a banner that is not there');
});

T.runAsync('Theme This Page on a list: Card Size — Large is four across, Small six', async () => {
  const cols = (p) => p.doc.querySelector('.tenfoot-screen .tenfoot-screen-grid').style.getPropertyValue('--tf-cols');
  const p = await boot({ html: fixture('my-list.html'), url: 'https://watch.dropout.tv/my-list', settings: { pageLooks: { lists: { cards: 'large' } } } });
  T.eq([p.doc.documentElement.dataset.tenfootLookCards, cols(p)], ['large', '4']);
  await p.shim.changeStorage({ settings: { newValue: { hintBar: true, pageLooks: { lists: { cards: 'small' } } } } });
  await T.sleep(20);
  T.eq([p.doc.documentElement.dataset.tenfootLookCards, cols(p)], ['small', '6']);
});

T.runAsync('Theme This Page on an episode\'s details page: the picture on the left', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, settings: { pageLooks: { details: { picture: 'left' } } } });
  T.eq(p.doc.documentElement.dataset.tenfootLookPicture, 'left');
  T.eq(p.doc.documentElement.dataset.tenfootLookBanner, undefined, 'only the page\'s own choices');
});

// ---------------------------------------------------------------------------
// the profile picker (/profile/pick)
// ---------------------------------------------------------------------------

const PICK = 'https://watch.dropout.tv/profile/pick';
const pickCards = (p) => [...p.doc.querySelectorAll('.tenfoot-screen [data-tenfoot-avatars] .tenfoot-card')];

T.runAsync('profiles: Leanback draws the picker — "Who is watching?", the profiles in one row, the one watching marked and selected; Manage Profiles and Sign Out at the end', async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const s = await p.state();
  T.eq(s.kind, 'profiles');
  T.eq(p.last('profile:current').profile, 1, 'the page told the background which profile is watching');
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.eq([layer.hidden, layer.dataset.tenfootScreen, layer.dataset.tenfootNorail], [false, 'profiles', undefined], 'drawn, centred, with room for the rail');
  T.eq(p.doc.documentElement.dataset.tenfootRail, 'on', 'the rail, as on every screen but signing in and playing');
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Who is watching?');
  T.eq(pickCards(p).map((c) => c.querySelector('.tenfoot-card-title').textContent), ['Alex', 'Sam', 'robin', '', ''], 'the profiles, then Manage Profiles and Sign Out; no Add Profile');
  T.eq(pickCards(p)[1].querySelector('.tenfoot-card-sub').textContent, 'Watching now');
  T.eq(pickCards(p)[0].querySelector('.tenfoot-card-art').getAttribute('src'), 'https://fixture.test/art-1.svg');
  T.eq([pickCards(p)[2].dataset.tenfootInitial, pickCards(p)[2].querySelector('.tenfoot-card-viewall').textContent], ['true', 'R'], 'no picture: its first letter');
  T.eq(pickCards(p).slice(3).map((c) => c.querySelector('.tenfoot-card-viewall').textContent), ['Manage Profiles', 'Sign Out']);
  T.notOk(pickCards(p)[3].querySelector('a').hasAttribute('href'), "Manage Profiles presses Dropout's own button");
  T.ok(pickCards(p).every((c) => c.querySelector('.tenfoot-card-action').hidden), 'no Edit buttons while picking');
  T.eq(p.doc.activeElement, pickCards(p)[1].querySelector('a'), 'the selection on the profile watching');
});

T.runAsync("profiles: OK on a profile presses Dropout's own button for it; ◀ ▶ along the row; ▶ at its end goes round to the start; ◀ at the start is the rail", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const pressed = [];
  for (const id of ['p0', 'p1', 'p2', 'add', 'manage']) p.$(id).addEventListener('click', () => pressed.push(id));
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement, pickCards(p)[0].querySelector('a'));
  p.key('Enter');
  T.eq(pressed, ['p0'], "Dropout's button, which saves the choice and goes on to Browse");
  T.ok(/^chose:\d+$/.test(p.win.sessionStorage.getItem('tenfoot.signin-home') || ''), 'and Home is noted as what comes next');
  T.eq((await p.state()).navigation, null, 'Leanback itself goes nowhere');
  p.key('ArrowRight'); p.key('ArrowRight');
  p.key('Enter');
  T.eq(pressed, ['p0', 'p2']);
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(p.doc.activeElement, pickCards(p)[4].querySelector('a'), 'Sign Out, last');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement, pickCards(p)[0].querySelector('a'), '▶ at the end: the first profile');
  p.key('ArrowLeft');
  T.eq((await p.state()).rail.active, true, '◀ at the start: the rail');
});

T.runAsync('profiles: Sign Out asks first, Cancel selected; Back keeps you signed in; Sign Out sends Dropout\'s own sign-out with the page\'s token', async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const sent = [];
  p.win.HTMLFormElement.prototype.submit = function () { sent.push({ action: this.action, method: this.method, token: this.querySelector('input[name="authenticity_token"]').value }); };
  for (let i = 0; i < 3; i++) p.key('ArrowRight');
  T.eq(p.doc.activeElement, pickCards(p)[4].querySelector('a'));
  p.key('Enter');
  const box = p.doc.querySelector('.tenfoot-ask');
  T.notOk(box.hidden, 'the question');
  T.eq(box.querySelector('.tenfoot-ask-title').textContent, 'Sign out of Dropout?');
  T.eq(p.doc.activeElement.textContent, 'Cancel', 'the safe answer selected');
  p.key('Escape');
  await T.sleep(20);
  T.ok(box.hidden, 'Back: no answer');
  T.eq(p.doc.activeElement, pickCards(p)[4].querySelector('a'), 'and the selection back on Sign Out');
  T.eq(sent, []);
  p.key('Enter');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Sign Out');
  p.key('Enter');
  await T.sleep(20);
  T.eq(sent, [{ action: 'https://watch.dropout.tv/logout', method: 'post', token: 'fixture-token' }]);
});

T.runAsync('profiles: before Dropout has drawn the picker, the screen waits for it', async () => {
  let row = null;
  const p = await boot({ html: fixture('profiles.html'), url: PICK, before: (win) => { const app = win.document.getElementById('profile-picker-react-app'); row = app.firstElementChild; row.remove(); } });
  T.ok(p.doc.documentElement.hasAttribute('data-tenfoot-pending'), "Dropout's page kept hidden meanwhile");
  p.doc.getElementById('profile-picker-react-app').appendChild(row);
  await T.sleep(200);
  T.eq(pickCards(p).length, 5);
  T.notOk(p.doc.documentElement.hasAttribute('data-tenfoot-pending'));
  T.eq(p.doc.activeElement, pickCards(p)[1].querySelector('a'));
});

// Manage profiles, in place on the same page: Dropout's title and its button
// change; the profiles are the same buttons.
const MANAGING = (html) => html.replace('<span>Who is watching?</span>', '<span>Manage profiles</span>').replace('<span>Manage Profiles</span></button>', '<span>Done</span></button>');
const editOf = (c) => c.querySelector('.tenfoot-card-action');

T.runAsync("profiles: Manage Profiles presses Dropout's own; the picker becomes Manage profiles — an Edit button under each, then Add Profile and Done", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  // Dropout's button turns the picker into Manage profiles, in place.
  p.$('manage').addEventListener('click', () => {
    p.doc.querySelector('h1 span').textContent = 'Manage profiles';
    p.$('manage').firstElementChild.textContent = 'Done';
  });
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(p.doc.activeElement, pickCards(p)[3].querySelector('a'));
  p.key('Enter');
  await T.sleep(200);
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Manage profiles');
  T.eq(pickCards(p).map((c) => c.querySelector('.tenfoot-card-title').textContent), ['Alex', 'Sam', 'robin', '', '']);
  T.eq(pickCards(p).slice(0, 3).map((c) => [editOf(c).hidden, editOf(c).textContent]), [[false, 'Edit'], [false, 'Edit'], [false, 'Edit']]);
  T.eq(p.doc.activeElement, pickCards(p)[3].querySelector('a'), 'the selection where it was: Add Profile, now');
  T.eq(pickCards(p).slice(3).map((c) => c.querySelector('.tenfoot-card-viewall').textContent), ['Add Profile', 'Done'], 'no Sign Out while managing');
  T.eq((await p.state()).navigation, null, 'the same page throughout');
});

T.runAsync("profiles: opened as Manage profiles (?edit=1, which Dropout takes off the address), it is drawn at once; the selection on the profile, ▼ its Edit button, ▲ back; OK on either presses Dropout's own", async () => {
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK });
  T.notOk(p.doc.documentElement.hasAttribute('data-tenfoot-pending'), 'not left waiting for a picker');
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Manage profiles');
  const pressed = [];
  for (const id of ['p0', 'p1', 'p2', 'add', 'manage']) p.$(id).addEventListener('click', () => pressed.push(id));
  const pic = (i) => pickCards(p)[i].querySelector('a');
  T.eq(p.doc.activeElement, pic(1), 'on the profile watching, its picture');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement, editOf(pickCards(p)[1]), '▼: its Edit button');
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement, editOf(pickCards(p)[0]), '◀: the Edit button before');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement, pic(0), '▲: back up to its profile');
  p.key('ArrowRight');
  p.key('Enter');
  await T.sleep(20);
  T.eq(pressed, ['p1'], 'OK on the picture, with no API of Dropout\'s on the page: Dropout\'s own button');
  p.key('ArrowDown');
  p.key('Enter');
  T.eq(pressed, ['p1', 'p1'], 'OK on Edit: Edit Profile');
  p.key('ArrowUp');
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(p.doc.activeElement, pic(3), 'Add Profile');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement, pic(3), '▼ from Add Profile: nothing under it, so it stays');
  p.key('Enter');
  p.key('ArrowRight');
  p.key('Enter');
  T.eq(pressed, ['p1', 'p1', 'add', 'manage'], 'Add Profile, Done');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement, pic(0), '▶ at the end: round to the first');
});

// Add Profile, the picker's own form (#/add), in the shape read 2026-10-31.
const ADD = '<div id="addform"><h1><span>Add Profile</span></h1><p><span>Add a profile for another person watching Dropout</span></p><hr>' +
  '<div><button id="pic"><img src="https://fixture.test/art-3.svg"><div></div></button><div><input id="pname" aria-label="Profile name" placeholder="Profile Name"></div></div><hr>' +
  '<div><button id="cont"><span>Continue</span></button><button id="cancel"><span>Cancel</span></button></div></div>';

T.runAsync("Add Profile: Leanback's own screen — the picture, the name box, Cancel then Continue — each pressing Dropout's own", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  const picker = app.firstElementChild;
  picker.remove();
  app.insertAdjacentHTML('beforeend', ADD);
  p.win.history.replaceState(null, '', `${PICK}#/add`);
  await T.sleep(200);
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.eq([layer.hidden, layer.dataset.tenfootScreen], [false, 'profileForm']);
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Add Profile');
  T.eq(p.doc.querySelector('.tenfoot-hero-text').textContent, 'Add a profile for another person watching Dropout');
  T.eq([...p.doc.querySelectorAll('.tenfoot-hero-action')].map((b) => b.textContent), ['Cancel', 'Continue'], 'Cancel first, as you asked');
  T.ok(p.doc.activeElement.classList.contains('tenfoot-screen-field-input'), 'the selection starts in the name box');
  const pressed = [];
  for (const id of ['pic', 'cont', 'cancel']) p.$(id).addEventListener('click', () => pressed.push(id));
  const box = p.doc.activeElement;
  box.value = 'Kim';
  box.dispatchEvent(new p.win.Event('input', { bubbles: true }));
  T.eq(p.$('pname').value, 'Kim', 'typed into Dropout\'s own box');
  p.key('ArrowUp');
  p.key('Enter');
  T.eq(pressed, ['pic'], 'the picture: Dropout\'s chooser');
  p.key('ArrowDown'); p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Cancel');
  p.key('ArrowRight');
  p.key('Enter');
  T.eq(pressed, ['pic', 'cont']);
  p.$('addform').remove();
  app.appendChild(picker);
  p.win.history.replaceState(null, '', PICK);
  await T.sleep(200);
  T.eq(pickCards(p).length, 5, 'back to the picker');
});

T.runAsync("profiles: a PIN-locked profile's PIN screen (Dropout's own form, four digit boxes): OK on a box opens the number pad, the digits fill the boxes in turn as Dropout moves on from box to box, Done presses Dropout's button", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  app.firstElementChild.remove();
  app.insertAdjacentHTML('beforeend', '<div class="LockedProfilePinScreen-module__root"><h1>Enter your PIN</h1><div><input id="d1" inputmode="numeric" maxlength="1" data-rect="500,300,60,60"><input id="d2" inputmode="numeric" maxlength="1" data-rect="570,300,60,60"><input id="d3" inputmode="numeric" maxlength="1" data-rect="640,300,60,60"><input id="d4" inputmode="numeric" maxlength="1" data-rect="710,300,60,60"></div><button id="pinok" type="submit" data-rect="500,400,200,40">Continue</button></div>');
  // Dropout's own app: each digit puts the focus on the next box.
  const boxes = ['d1', 'd2', 'd3', 'd4'].map((id) => p.$(id));
  boxes.forEach((b, i) => b.addEventListener('input', () => { if (b.value && boxes[i + 1]) boxes[i + 1].focus(); }));
  let pressed = 0;
  p.$('pinok').addEventListener('click', (e) => { e.preventDefault(); pressed += 1; });
  await T.sleep(200);
  T.notOk(p.doc.querySelector('.tenfoot-screen'), 'no screen over the form');
  boxes[0].focus();
  T.ok(p.key('Enter').defaultPrevented);
  T.ok(kbOpen(p), 'OK on a PIN box');
  T.ok(p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="c:7"]') && !p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="c:q"]'), 'a number pad');
  for (const d of ['3', '1', '4']) { kbKey(p, 'c:' + d); await T.sleep(5); }
  T.eq(boxes.map((b) => b.value), ['3', '1', '4', ''], 'the digits in turn');
  T.ok(p.doc.querySelector('.tenfoot-kb').contains(p.doc.activeElement) || kbOpen(p), 'the keyboard keeps the selection while Dropout moves the focus along its boxes');
  kbKey(p, 'c:1');
  kbKey(p, 'done');
  await T.sleep(30);
  T.notOk(kbOpen(p));
  T.eq([boxes.map((b) => b.value).join(''), pressed], ['3141', 1], 'Done: Dropout\'s own button');
});

T.runAsync("profiles: a PIN is Dropout's own form — Leanback steps aside and drives it", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  app.firstElementChild.remove();
  app.insertAdjacentHTML('beforeend', '<div id="pin"><h1>Enter your PIN</h1><input id="d1" inputmode="numeric" data-rect="500,300,60,60"><button id="back" data-rect="400,200,40,40">Back</button></div>');
  await T.sleep(200);
  T.notOk(p.doc.querySelector('.tenfoot-screen'), 'no screen over the form');
  T.ok(['d1', 'back'].includes(p.doc.activeElement.id), `on the form: ${p.doc.activeElement.id}`);
});

// In the shape of Dropout's Edit Profile (/settings/manage/profile, its new
// settings app, read 2026-10-31): the picture, the name, Save, Cancel, and
// Delete Profile, which opens Dropout's own box to ask again.
const EDIT = '<!doctype html><html><body><div id="app"><header data-testid="page-header-bar"><a href="/" aria-label="Back">←</a></header><main>' +
  '<nav aria-label="settings"><a href="/settings/manage/profile">Profile</a></nav>' +
  '<div data-testid="settings-content-column"><h2>Edit Profile</h2><p>Update this profile\'s name, picture, and Kid profile setting.</p>' +
  '<form><button id="pic" type="button" aria-label="Change profile picture"><div><span>S</span><img src="https://fixture.test/art-2.svg"></div></button>' +
  '<label>Profile name</label><input id="profile-name" name="name" value="Sam">' +
  '<button id="save" type="submit">Save</button><button id="cancel" type="button">Cancel</button></form>' +
  '<button id="delete" type="button">Delete Profile</button></div></main></div></body></html>';

T.runAsync("Edit Profile: Leanback's own screen — the picture, the name, Save, Cancel, Delete Profile; the selection starts on the name", async () => {
  const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
  T.eq((await p.state()).kind, 'profileEdit');
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.eq([layer.hidden, layer.dataset.tenfootScreen], [false, 'profileForm']);
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Edit Profile');
  T.eq([...p.doc.querySelectorAll('.tenfoot-hero-action')].map((b) => [b.textContent, b.dataset.tenfootDanger || '']), [['Save', ''], ['Cancel', ''], ['Delete Profile', 'true']]);
  T.eq(p.doc.activeElement.value, 'Sam', 'on the name');
  T.eq(p.doc.documentElement.dataset.tenfootRail, 'on', 'with the rail');
  const pressed = [];
  for (const id of ['pic', 'save', 'cancel']) p.$(id).addEventListener('click', (e) => { e.preventDefault(); pressed.push(id); });
  p.key('ArrowDown');
  p.key('Enter');
  T.eq(pressed, ['save']);
});

T.runAsync("Edit Profile: OK on the name opens the keyboard (text layout), what is typed goes into Dropout's box, the screen lifts so the box stays above it; Escape closes it without asking to leave; Done goes down to the buttons", async () => {
  const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
  const name = p.doc.activeElement;
  T.eq(name.value, 'Sam');
  // The box would sit behind the keyboard: 100 px of it.
  name.getBoundingClientRect = () => ({ left: 0, top: 640, right: 400, bottom: 700, width: 400, height: 60 });
  const origPanel = p.doc.querySelector('.tenfoot-kb-panel').getBoundingClientRect;
  p.doc.querySelector('.tenfoot-kb-panel').getBoundingClientRect = () => ({ left: 0, top: 630, right: 1280, bottom: 768, width: 1280, height: 138 });
  T.ok(p.key('Enter').defaultPrevented);
  T.ok(kbOpen(p), 'OK on the name box');
  T.eq(p.doc.activeElement.dataset.tenfootKey, 'c:a', 'the selection starts on the first letter');
  T.eq(p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="space"]') !== null && p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="show"]') === null, true, 'the text layout');
  T.eq(p.doc.querySelector('.tenfoot-home-scroll').style.transform, '', 'the panel is beside the form: nothing moves up');
  kbKey(p, 'c:a'); kbKey(p, 'c:m');
  T.eq([name.value, p.$('profile-name').value], ['Sam' + 'am', 'Samam'], 'into Dropout\'s own box');
  kbKey(p, 'backspace'); kbKey(p, 'backspace');
  T.eq(p.$('profile-name').value, 'Sam');
  // Escape: the keyboard, not "Leave without saving?".
  p.key('Escape');
  await T.sleep(10);
  T.notOk(kbOpen(p));
  T.ok(p.doc.querySelector('.tenfoot-ask').hidden, 'no question asked');
  T.eq(p.doc.activeElement, name, 'the selection back on the box');
  const pressed = [];
  for (const id of ['pic', 'save', 'cancel']) p.$(id).addEventListener('click', (e) => { e.preventDefault(); pressed.push(id); });
  p.key('Enter');
  kbKey(p, 'done');
  await T.sleep(30);
  T.eq(p.doc.activeElement.textContent, 'Save', 'Done is Enter in the box: down to the buttons');
  p.doc.querySelector('.tenfoot-kb-panel').getBoundingClientRect = origPanel;
});

// Edit Profile's Save as Dropout draws it: grey (disabled) until the name changes, grey
// again once it has saved, a toast for what it says.
function wireEdit(p, o = {}) {
  const save = p.$('save');
  save.disabled = true;
  const sent = [];
  sent.cancelled = 0;
  p.$('cancel').addEventListener('click', () => { sent.cancelled += 1; });
  p.$('profile-name').addEventListener('input', () => { save.disabled = false; });
  save.addEventListener('click', (e) => {
    e.preventDefault();
    sent.push(p.$('profile-name').value);
    if (o.silent) return;
    if (o.error) {
      const t = p.doc.createElement('div'); t.setAttribute('data-sonner-toast', ''); t.textContent = o.error; p.doc.body.appendChild(t);
      return;
    }
    save.disabled = true;
    if (o.toast) { const t = p.doc.createElement('div'); t.setAttribute('data-sonner-toast', ''); t.textContent = o.toast; p.doc.body.appendChild(t); }
  });
  return sent;
}
const saveBtn = (p) => [...p.doc.querySelectorAll('.tenfoot-hero-action')].find((b) => /Save/.test(b.textContent));

T.runAsync("Edit Profile: a good Save closes the screen at once — Dropout's toast saying saved is enough, no waiting; with only a grey Save it waits just the settle — through Dropout's own Cancel, once, with no question", async () => {
  rules.screen.profileForm.edit.saveSettleMs = 300;
  try {
    // Dropout greys Save and says so in a toast.
    const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    const sent = wireEdit(p, { toast: 'Profile saved.' });
    const name = p.doc.activeElement;
    name.value = 'Samuel';
    name.dispatchEvent(new p.win.Event('input', { bubbles: true }));
    await T.sleep(250);
    p.key('ArrowDown'); p.key('Enter');
    await T.sleep(30);
    T.eq(sent.cancelled, 1, 'closed at once: Dropout\'s own Cancel pressed within a moment of the save, not after the settle');
    T.ok(p.doc.querySelector('.tenfoot-ask').hidden, 'with no "Leave without saving?"');
    await T.sleep(400);
    T.eq(sent.cancelled, 1, 'once');
    // Dropout only greys Save (no toast): the settle, then the same.
    const q = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    const qsent = wireEdit(q);
    const qn = q.doc.activeElement;
    qn.value = 'Samuel';
    qn.dispatchEvent(new q.win.Event('input', { bubbles: true }));
    await T.sleep(250);
    q.key('ArrowDown'); q.key('Enter');
    await T.sleep(100);
    T.eq(qsent.cancelled, 0, 'greyed while it sends is not yet saved');
    await T.sleep(400);
    T.eq(qsent.cancelled, 1, 'greyed and staying greyed: saved, closed');
  } finally {
    rules.screen.profileForm.edit.saveSettleMs = 800;
  }
});

T.runAsync("Edit Profile: Save is grey until the name has changed — Dropout switching it on with only its disabled attribute counts — then yellow; OK says Saved with a tick, then it is grey again", async () => {
  const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
  const sent = wireEdit(p, { toast: 'Profile saved.' });
  await T.sleep(150);
  T.eq(saveBtn(p).getAttribute('aria-disabled'), 'true', 'nothing to save: grey');
  const name = p.doc.activeElement;
  name.value = 'Samuel';
  name.dispatchEvent(new p.win.Event('input', { bubbles: true }));
  await T.sleep(250);
  T.eq([p.$('save').disabled, saveBtn(p).getAttribute('aria-disabled')], [false, null], 'Dropout enabled Save by its disabled attribute alone: Leanback\'s button is ready');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Save');
  p.key('Enter');
  await T.sleep(1100);
  T.eq(sent, ['Samuel'], 'Dropout\'s own Save was pressed once');
  const b = saveBtn(p);
  T.eq([b.textContent, b.dataset.tenfootAction, b.getAttribute('aria-disabled')], ['Saved!', 'save', null], 'Saved! on the button, and not grey');
  T.notOk(p.hints().textContent.includes('saved'), 'no notice at the bottom: ' + p.hints().textContent);
  const meta = p.doc.querySelector('.tenfoot-hero-meta');
  T.ok(!meta || meta.hidden || meta.textContent === '', 'and no "Profile saved." under the title, though Dropout\'s toast says it: ' + (meta && meta.textContent));
  // Changing the name again: Save is ready again, not Saved.
  name.value = 'Samuel2';
  name.dispatchEvent(new p.win.Event('input', { bubbles: true }));
  await T.sleep(250);
  T.eq(saveBtn(p).textContent, 'Save');
  T.eq(saveBtn(p).getAttribute('aria-disabled'), null);
});

T.runAsync("Edit Profile: Dropout's own words after a Save (a toast that is not good news, or none at all) are shown, not hidden behind a tick", async () => {
  rules.screen.profileForm.edit.saveMs = 400;
  rules.screen.profileForm.edit.saveSettleMs = 50;
  try {
    const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    wireEdit(p, { error: 'Something went wrong.' });
    const name = p.doc.activeElement;
    name.value = 'Samuel';
    name.dispatchEvent(new p.win.Event('input', { bubbles: true }));
    await T.sleep(250);
    p.key('ArrowDown'); p.key('Enter');
    await T.sleep(300);
    T.eq([saveBtn(p).textContent, p.$('cancel') && 0], ['Save', 0], 'no Saved!');
    T.eq(p.doc.querySelector('.tenfoot-hero-meta').textContent, 'Something went wrong.', 'Dropout\'s words, under the title');
    const q = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    wireEdit(q, { silent: true });
    const qn = q.doc.activeElement;
    qn.value = 'Samuel';
    qn.dispatchEvent(new q.win.Event('input', { bubbles: true }));
    await T.sleep(250);
    q.key('ArrowDown'); q.key('Enter');
    await T.sleep(700);
    T.eq(saveBtn(q).textContent, 'Save');
    T.ok(q.hints().textContent.includes('Dropout did not say whether it saved'), 'no answer: ' + q.hints().textContent);
    // Nothing to save: OK on the grey Save does nothing at all.
    const r = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    const sent = wireEdit(r);
    await T.sleep(100);
    r.key('ArrowDown'); r.key('Enter');
    await T.sleep(100);
    T.eq(sent, [], 'a grey Save is not pressed');
  } finally {
    rules.screen.profileForm.edit.saveMs = 6000;
    rules.screen.profileForm.edit.saveSettleMs = 800;
  }
});

T.runAsync("Add Profile: OK on the name opens the keyboard; a new name starts with a capital; Done goes down", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  app.firstElementChild.remove();
  app.insertAdjacentHTML('beforeend', ADD);
  p.win.history.replaceState(null, '', `${PICK}#/add`);
  await T.sleep(200);
  T.ok(p.doc.activeElement.classList.contains('tenfoot-screen-field-input'), 'the selection starts in the name box');
  p.key('Enter');
  T.ok(kbOpen(p));
  T.eq(p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="c:k"]').textContent, 'K', 'a capital to start a name');
  kbKey(p, 'c:k'); kbKey(p, 'c:i'); kbKey(p, 'c:m');
  T.eq(p.$('pname').value, 'Kim', 'typed into Dropout\'s own box');
  kbKey(p, 'done');
  await T.sleep(30);
  T.notOk(kbOpen(p));
  T.eq(p.doc.activeElement.textContent, 'Cancel', 'down to the buttons');
});

// Dropout's profile API, as the picker page has it: what Leanback asks for.
function profileApi(win, { fail = false, pictures = true } = {}) {
  const calls = [];
  win.VHX = { config: { api_v2_url: 'https://api.test' } };
  win.TOKEN = 'fixture-token';
  win._current_site = { id: 7 };
  win._current_user = { id: 9 };
  win.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', auth: init.headers && init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
    const reply = (data, ok = true) => ({ ok, status: ok ? 200 : 500, text: async () => JSON.stringify(data) });
    if (url.endsWith('/v2/sites/7/users/9/profiles')) return reply({ profiles: [{ index: 1, name: 'Sam', profile_image_url: 'https://fixture.test/p2.svg' }, { index: 0, name: 'Alex', profile_image_url: 'https://fixture.test/p1.svg' }, { index: 2, name: 'robin', profile_image_url: null }] });
    if (url.endsWith('/v2/sites/7/profile_pictures')) return pictures ? reply({ profile_pictures: [{ id: 11, image_url: 'https://fixture.test/p1.svg', site_id: null, position: 0 }, { id: 12, image_url: 'https://fixture.test/p2.svg', site_id: null, position: 1 }, { id: 21, image_url: 'https://fixture.test/d1.svg', site_id: 7, position: 2 }, { id: 22, image_url: 'https://fixture.test/d2.svg', site_id: 7, position: 3 }] }) : reply({}, false);
    return reply({}, !fail);
  };
  return calls;
}

T.runAsync("Manage profiles: OK on a profile's picture opens Leanback's own picture box, the one it has selected; OK on another saves it with Dropout's API and Manage profiles is drawn again", async () => {
  let calls = null;
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK, before: (win) => { calls = profileApi(win); } });
  const pressed = [];
  p.$('p1').addEventListener('click', () => pressed.push('p1'));
  p.key('Enter');
  await T.sleep(50);
  const box = p.doc.querySelector('.tenfoot-picker');
  T.notOk(box.hidden, 'the picture box');
  T.eq(box.querySelector('.tenfoot-ask-title').textContent, 'Picture for Sam', 'for the profile selected (the second by its index)');
  T.eq([...box.querySelectorAll('.tenfoot-picker-label')].map((h) => h.textContent), ['The classics', 'Dropout']);
  T.eq(p.doc.activeElement.dataset.tenfootPicture, '12', 'on the picture it has now');
  T.eq(calls.every((c) => c.auth === 'Bearer fixture-token'), true, 'the page\'s own sign-in');
  p.key('Escape');
  await T.sleep(20);
  T.ok(box.hidden, 'Back: nothing changed');
  T.eq([calls.filter((c) => c.method === 'PATCH').length, pressed], [0, []]);
  p.key('Enter');
  await T.sleep(50);
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.dataset.tenfootPicture, '22', '▼: the next section, the same column');
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement.dataset.tenfootPicture, '21');
  p.key('Enter');
  await T.sleep(50);
  const patch = calls.find((c) => c.method === 'PATCH');
  T.eq([patch.url, patch.body], ['https://api.test/v2/sites/7/users/9/profiles/1', { profile: { name: 'Sam', profile_image_id: 21 } }]);
  T.eq((await p.state()).navigation, 'https://watch.dropout.tv/profile/pick?edit=1', 'drawn again, managing');
});

T.runAsync("Manage profiles: a picture that cannot be saved says so, and nothing moves", async () => {
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK, before: (win) => { profileApi(win, { fail: true }); } });
  p.key('Enter');
  await T.sleep(50);
  p.key('ArrowLeft');
  p.key('Enter');
  await T.sleep(50);
  T.ok(p.hints().textContent.includes('The picture could not be saved'), p.hints().textContent);
  T.eq((await p.state()).navigation, null);
});

T.runAsync("Manage profiles: pictures that cannot be loaded say so, and no box opens", async () => {
  let calls = null;
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK, before: (win) => { calls = profileApi(win, { pictures: false }); } });
  p.key('Enter');
  await T.sleep(50);
  T.ok(p.hints().textContent.includes('The pictures could not be loaded'), p.hints().textContent);
  T.ok(p.doc.querySelector('.tenfoot-picker').hidden, 'no picture box');
  T.eq(calls.filter((c) => c.method === 'PATCH').length, 0);
});

T.runAsync("Manage profiles: without Dropout's profile API on the page, OK on a picture is Dropout's own button for the profile", async () => {
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK });
  const selected = p.doc.activeElement;
  const clicked = [];
  p.doc.addEventListener('click', (e) => { if (!e.target.closest('.tenfoot-home, .tenfoot-rail')) clicked.push(e.target); }, true);
  p.key('Enter');
  await T.sleep(50);
  T.ok(p.doc.querySelector('.tenfoot-picker').hidden, 'no picture box');
  T.eq(clicked.length, 1, 'Dropout\'s own button, pressed once');
  T.notOk(selected === clicked[0], 'not Leanback\'s card');
});

T.runAsync("Edit Profile: Cancel with nothing changed leaves; with a change, asks first (Keep Editing selected); Firefox's own \"leave this page?\" is kept away", async () => {
  const html = EDIT.replace('<button id="save" type="submit">', '<button id="save" type="submit" disabled>');
  const p = await boot({ html, url: 'https://watch.dropout.tv/settings/manage/profile' });
  let cancelled = 0;
  p.$('cancel').addEventListener('click', () => { cancelled += 1; });
  p.key('ArrowDown'); p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Cancel');
  p.key('Enter');
  T.eq(cancelled, 1, 'nothing changed: Dropout\'s Cancel at once');
  p.$('save').disabled = false; // something changed
  p.key('Enter');
  const box = p.doc.querySelector('.tenfoot-ask');
  T.eq([box.hidden, box.querySelector('.tenfoot-ask-title').textContent, p.doc.activeElement.textContent], [false, 'Leave without saving?', 'Keep Editing']);
  p.key('Enter');
  await T.sleep(20);
  T.eq(cancelled, 1, 'Keep Editing: still here');
  p.key('Enter');
  p.key('ArrowRight');
  p.key('Enter');
  await T.sleep(20);
  T.eq(cancelled, 2, 'Leave: Dropout\'s Cancel');
  // Dropout's own warning, as its settings app adds it.
  p.win.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; });
  const e = new p.win.Event('beforeunload', { cancelable: true });
  p.win.dispatchEvent(e);
  T.eq(e.defaultPrevented, false, 'Firefox is not asked to check');
});

T.runAsync("Edit Profile: Delete Profile asks in Leanback's box, Cancel selected; Delete presses Dropout's Delete Profile and then the Delete in Dropout's own box", async () => {
  const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
  const steps = [];
  p.$('delete').addEventListener('click', () => {
    steps.push('delete');
    p.doc.body.insertAdjacentHTML('beforeend', '<div role="dialog" id="dlg"><h2>Delete profile</h2><button id="no">Cancel</button><button id="yes">Delete Profile</button></div>');
    p.$('yes').addEventListener('click', () => steps.push('confirm'));
    p.$('no').addEventListener('click', () => steps.push('cancelled'));
  });
  p.key('ArrowDown'); p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Delete Profile');
  p.key('Enter');
  const box = p.doc.querySelector('.tenfoot-ask');
  T.eq([box.hidden, box.querySelector('.tenfoot-ask-title').textContent, p.doc.activeElement.textContent], [false, 'Delete Sam?', 'Cancel']);
  p.key('Enter');
  await T.sleep(20);
  T.eq(steps, [], 'Cancel: nothing deleted');
  T.eq(p.doc.activeElement.textContent, 'Delete Profile', 'and the selection back');
  p.key('Enter');
  p.key('ArrowRight');
  p.key('Enter');
  await T.sleep(300);
  T.eq(steps, ['delete', 'confirm'], "Dropout's button, then its own box's Delete");
});

// ---------------------------------------------------------------------------
// sign-in (/login)
// ---------------------------------------------------------------------------

// In the shape of Dropout's /login (read 2026-10-29, signed out): the email
// step, and the password step hidden until Next.
const SIGNIN = '<!doctype html><html><body class="logged-out">' +
  '<header class="site-header" data-rect="0,0,1280,60"><a href="/browse" data-rect="20,15,80,30">Browse</a></header>' +
  '<div id="login--box-container" data-rect="390,200,500,344">' +
  '<form id="login-form-email"><label>Email address</label><input id="signin-email-input" type="email" data-rect="425,300,430,40"><button id="signin-email-submit" type="submit" data-rect="425,350,430,45">Next</button></form>' +
  '<div class="flash-error-container"><div class="flash-msg-container is-hidden"><div class="flash-msg"></div></div></div>' +
  '<a id="help" href="/help/articles/trouble-logging-in-computer" data-rect="600,410,67,18">Need help?</a>' +
  '<div class="signin-flow__password-form-container signin-flow--hidden"><form id="login-form-password" action="/login" method="post"><input type="hidden" name="authenticity_token" value="x"><input id="signin-password-input" type="password"><button id="signin-password-submit" type="submit">Sign in</button></form>' +
  '<div class="signin-flow__divider-container">or</div><form id="login-form-magic"><a id="signin-magic-submit">Email me a sign in link</a></form></div>' +
  '</div></body></html>';

T.runAsync('sign-in: Leanback\'s own screen over Dropout\'s form; real boxes a password app understands; the selection starts in Email; ▲ ▼ go between the boxes and buttons', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const s = await p.state();
  T.eq(s.kind, 'signin');
  T.eq(p.doc.documentElement.dataset.tenfootKind, 'signin');
  const layer = p.doc.querySelector('.tenfoot-signin');
  T.ok(layer && layer.parentNode === p.doc.documentElement, 'a layer of its own, outside the site\'s tree');
  T.ok(p.$('login--box-container'), 'Dropout\'s form is still underneath');
  T.eq(layer.querySelector('h1').textContent, 'Sign in');
  T.eq(layer.querySelector('.tenfoot-signin-brand').textContent, 'DROPOUT');
  const form = layer.querySelector('form');
  const email = layer.querySelector('#tenfoot-signin-email');
  const pw = layer.querySelector('#tenfoot-signin-password');
  T.ok(form && form.contains(email) && form.contains(pw), 'a real <form> holding both boxes');
  T.eq([email.type, email.name, email.getAttribute('autocomplete')], ['email', 'email', 'username']);
  T.eq([pw.type, pw.name, pw.getAttribute('autocomplete')], ['password', 'password', 'current-password']);
  T.eq([layer.querySelector('label[for="tenfoot-signin-email"]').textContent, layer.querySelector('label[for="tenfoot-signin-password"]').textContent], ['Email', 'Password'], 'each box has its label');
  T.eq([...layer.querySelectorAll('.tenfoot-signin-buttons > *')].map((b) => [b.textContent, b.getAttribute('href')]), [['Sign in', null], ['Forgot password?', rules.resetUrl]]);
  T.ok(layer.querySelector('.tenfoot-hero-primary').textContent === 'Sign in', 'Sign in is the yellow one');
  T.eq(layer.querySelector('.tenfoot-signin-note').textContent, 'Press OK on a box to type with the remote, or use a keyboard.');
  T.eq([...layer.querySelectorAll('.tenfoot-signin-links a')].map((a) => [a.textContent, a.getAttribute('href')]), rules.legal.map((l) => [l.label, l.url]), 'the policies, under the form');
  T.notOk(p.doc.querySelector('.tenfoot-rail:not([hidden])'), 'no rail');
  // The form is never submitted by the browser.
  const submit = new p.win.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(submit);
  T.ok(submit.defaultPrevented, 'its submit is cancelled');
  // The moves: Email, Password, Sign in, Forgot password?, then the policies.
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  T.notOk(p.key('a').defaultPrevented, 'letters are typed');
  T.ok(p.key('ArrowDown').defaultPrevented);
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', '▼ leaves a box');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Sign in');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Forgot password?');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Privacy Policy');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Terms of Use', '▶ between the policies');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Terms of Use', 'and stops at the end');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Terms of Use', '▼ stops at the end');
  for (let i = 0; i < 6; i += 1) p.key('ArrowUp');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email', '▲ from a box with a box above stays put');
  // OK in Email opens the keyboard (see below); typed in with a keyboard, Enter goes on to Password.
  p.key('a');
  p.key('Enter');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', 'typed in with a keyboard: Enter in Email goes on to Password');
  // Back from a box leaves it, to Sign in.
  p.key('Escape');
  T.eq(p.doc.activeElement.textContent, 'Sign in', 'Back leaves the box');
});

T.runAsync('sign-in: the email already in Dropout\'s own box (a password app or Firefox filled it) is Leanback\'s, and the selection starts in Password', async () => {
  const p = await boot({ html: SIGNIN.replace('id="signin-email-input" type="email"', 'id="signin-email-input" type="email" value="fixture@example.test"'), url: 'https://watch.dropout.tv/login' });
  const email = p.doc.querySelector('.tenfoot-signin #tenfoot-signin-email');
  T.eq(email.value, 'fixture@example.test');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password');
});

// Dropout's two steps, as its page does them: Next shows the password step (or
// an error), Sign in posts (or shows an error). What was posted is recorded.
function wireDropout(p, o = {}) {
  const posted = [];
  const flash = (t) => { const c = p.doc.querySelector('.flash-msg-container'); c.classList.remove('is-hidden'); c.querySelector('.flash-msg').textContent = t; };
  p.$('login-form-email').addEventListener('submit', (e) => {
    e.preventDefault();
    posted.push({ step: 'next', email: p.$('signin-email-input').value });
    if (o.silent) return;
    if (o.badEmail) { flash('Please enter a valid email.'); return; }
    p.doc.querySelector('.signin-flow__password-form-container').classList.remove('signin-flow--hidden');
  });
  p.$('login-form-password').addEventListener('submit', (e) => {
    e.preventDefault();
    posted.push({ step: 'password', password: p.$('signin-password-input').value });
    if (o.hang) return;
    if (o.wrong) flash('Invalid email or password.');
  });
  return posted;
}
const box = (p, id) => p.doc.querySelector('.tenfoot-signin #' + id);

T.runAsync('sign-in: Sign in goes through Dropout\'s own form — the email and Next, then the password and Sign in; "Signing in…" meanwhile; the password is never kept', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p);
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  box(p, 'tenfoot-signin-password').value = 'not-a-real-password';
  const btn = p.doc.querySelector('.tenfoot-signin-submit');
  btn.click();
  T.eq(btn.textContent, 'Signing in…', 'while it waits');
  T.eq(btn.getAttribute('aria-disabled'), 'true');
  await T.sleep(100);
  T.eq(posted, [{ step: 'next', email: 'fixture@example.test' }, { step: 'password', password: 'not-a-real-password' }], 'what Dropout\'s form was given, in order');
  // Pressed again while Dropout has not answered: nothing more goes through.
  btn.click();
  await T.sleep(50);
  T.eq(posted.length, 2, 'not pressed twice');
  const everything = JSON.stringify([p.shim.store, p.bg]);
  T.notOk(everything.includes('not-a-real-password'), 'the password is not stored or sent anywhere');
});

T.runAsync('sign-in: Dropout\'s error on the password step shows on Leanback\'s screen; the email stays, the password box is emptied and selected, Sign in can be pressed again', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p, { wrong: true });
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  box(p, 'tenfoot-signin-password').value = 'wrong-password';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  await T.sleep(100);
  const err = p.doc.querySelector('.tenfoot-signin-error');
  T.ok(!err.hidden && err.textContent === 'Invalid email or password.', 'Dropout\'s words, under the title');
  T.eq(box(p, 'tenfoot-signin-email').value, 'fixture@example.test', 'the email kept');
  T.eq(box(p, 'tenfoot-signin-password').value, '', 'the password box emptied');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', 'and selected');
  T.eq(p.doc.querySelector('.tenfoot-signin-submit').textContent, 'Sign in', 'Sign in is back');
  // Again: the old error goes while it works, and the new one comes.
  box(p, 'tenfoot-signin-password').value = 'another-try';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  T.ok(err.hidden, 'the old error is gone while it tries');
  await T.sleep(100);
  T.eq(posted.filter((x) => x.step === 'password').map((x) => x.password), ['wrong-password', 'another-try']);
  T.eq(err.textContent, 'Invalid email or password.');
});

T.runAsync('sign-in: Dropout\'s error on the email step (not an email) puts the selection back in Email', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p, { badEmail: true });
  box(p, 'tenfoot-signin-email').value = 'nope';
  box(p, 'tenfoot-signin-password').value = 'x';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  T.eq(posted, [], 'not an email: the browser\'s own check would stop Dropout\'s Next unseen, so Leanback says so itself');
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Please enter a valid email.');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  box(p, 'tenfoot-signin-email').value = 'unknown@example.test';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  await T.sleep(100);
  T.eq(posted.map((x) => x.step), ['next'], 'Dropout answered the email with an error: the password step never came');
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Please enter a valid email.');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  T.eq(box(p, 'tenfoot-signin-password').value, 'x', 'the password box is left alone: no password went anywhere');
});

T.runAsync('sign-in: with an empty box, Sign in asks for both and presses nothing of Dropout\'s', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p);
  p.doc.querySelector('.tenfoot-signin-submit').click();
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Enter your email and your password.');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password');
  T.eq(posted, [], 'nothing reached Dropout\'s form');
});

// Dropout's password form is a real post (action="/login"): a wrong password
// most likely comes back as a new /login page with the error already on it.
T.runAsync('sign-in: Dropout answering with a new page that holds its error — the error is shown, the email kept from before, the password box empty and selected', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  wireDropout(p, { hang: true });
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  box(p, 'tenfoot-signin-password').value = 'wrong-password';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  await T.sleep(50);
  T.eq(p.win.sessionStorage.getItem('tenfoot.signin-email'), 'fixture@example.test', 'the email, kept in the tab for the page Dropout answers with');
  T.notOk(JSON.stringify([p.win.sessionStorage, p.shim.store, p.bg]).includes('wrong-password'), 'never the password');

  const answer = SIGNIN.replace('<div class="flash-msg-container is-hidden"><div class="flash-msg"></div>', '<div class="flash-msg-container"><div class="flash-msg">Invalid email or password.</div>');
  const q = await boot({ html: answer, url: 'https://watch.dropout.tv/login', before: (win) => win.sessionStorage.setItem('tenfoot.signin-email', 'fixture@example.test') });
  const m = q.doc.querySelector('.tenfoot-signin-error');
  T.eq([m.hidden, m.textContent, m.dataset.tone], [false, 'Invalid email or password.', 'error']);
  T.eq([box(q, 'tenfoot-signin-email').value, box(q, 'tenfoot-signin-password').value, q.doc.activeElement.id], ['fixture@example.test', '', 'tenfoot-signin-password']);
});

T.runAsync('sign-in: Dropout\'s Sign in left grey while its post is under way (data-disable-with); after "isn\'t answering", Sign in again still reaches Dropout', async () => {
  rules.pages.signin.signinMs = 300;
  try {
    const html = SIGNIN.replace('<button id="signin-password-submit" type="submit">', '<button id="signin-password-submit" type="submit" data-disable-with="Sending...">');
    const p = await boot({ html, url: 'https://watch.dropout.tv/login' });
    const posted = wireDropout(p, { hang: true });
    const theirs = p.$('signin-password-submit');
    p.$('login-form-password').addEventListener('submit', () => { theirs.disabled = true; }); // what Rails' own script does
    box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(p, 'tenfoot-signin-password').value = 'x';
    const btn = p.doc.querySelector('.tenfoot-signin-submit');
    btn.click();
    await T.sleep(500);
    T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, "Dropout isn't answering. Check the TV's internet connection, then try again.");
    T.eq(theirs.disabled, true, 'Dropout\'s button is still grey');
    box(p, 'tenfoot-signin-password').value = 'x';
    btn.click();
    await T.sleep(50);
    T.eq(posted.map((x) => x.step), ['next', 'password', 'password'], 'the second try was sent, straight to the password: Dropout\'s password step was already up for this email, so its hidden Next is not pressed again');
    // A grey button that is not "sending" is Dropout's to keep grey.
    const q = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
    const posted2 = wireDropout(q);
    q.$('signin-password-submit').disabled = true;
    box(q, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(q, 'tenfoot-signin-password').value = 'x';
    q.doc.querySelector('.tenfoot-signin-submit').click();
    await T.sleep(50);
    T.eq([posted2.map((x) => x.step), q.$('signin-password-submit').disabled], [['next'], true], 'left grey, not pressed');
  } finally {
    rules.pages.signin.signinMs = 20000;
  }
});

T.runAsync('sign-in: when Dropout does not answer, a line says so, the email stays and Sign in can be pressed again', async () => {
  rules.pages.signin.nextMs = 300;
  try {
    const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
    const posted = wireDropout(p, { silent: true });
    box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(p, 'tenfoot-signin-password').value = 'x';
    const btn = p.doc.querySelector('.tenfoot-signin-submit');
    btn.click();
    T.eq(btn.textContent, 'Signing in…');
    await T.sleep(500);
    T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, "Dropout isn't answering. Check the TV's internet connection, then try again.");
    T.eq([btn.textContent, box(p, 'tenfoot-signin-email').value], ['Sign in', 'fixture@example.test']);
    btn.click();
    await T.sleep(50);
    T.eq(posted.length, 2, 'pressed again');
  } finally {
    rules.pages.signin.nextMs = 15000;
  }
});


T.runAsync('sign-in: OK on Email opens the keyboard (email layout) and the sign-in screen moves up; typing; Done goes on to Password', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  T.notOk(kbOpen(p), 'closed to begin with');
  T.ok(p.key('Enter').defaultPrevented, 'OK is the keyboard\'s');
  T.ok(kbOpen(p));
  T.eq(p.doc.documentElement.getAttribute('data-tenfoot-keyboard'), 'on', 'for the CSS that lifts the screen');
  T.eq(p.doc.querySelectorAll('.tenfoot-kb [data-tenfoot-key="c:.com"], .tenfoot-kb [data-tenfoot-key="c:@gmail.com"]').length, 2, 'the email layout');
  T.eq(p.doc.activeElement.dataset.tenfootKey, 'c:a', 'the selection starts on the first letter');
  T.ok(p.hints().textContent.includes('Type'), 'the hint bar: ' + p.hints().textContent);
  // The remote's keys are the keyboard's: ▶ moves along it, OK types.
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.dataset.tenfootKey, 'c:b');
  p.key('Enter');
  T.eq(box(p, 'tenfoot-signin-email').value, 'b', 'typed into Leanback\'s own box');
  kbKey(p, 'c:@'); kbKey(p, 'c:a'); kbKey(p, 'c:.com');
  T.eq(box(p, 'tenfoot-signin-email').value, 'b@a.com');
  // The remote's Menu takes out the last letter; a real keyboard types too.
  p.key('ContextMenu');
  T.eq(box(p, 'tenfoot-signin-email').value, 'b@a.co', 'Menu is Backspace');
  p.key('m');
  T.eq(box(p, 'tenfoot-signin-email').value, 'b@a.com', 'a real keyboard types while it is up');
  // Done: the keyboard closes and Enter in the box happens: on to Password.
  kbKey(p, 'done');
  await T.sleep(20);
  T.notOk(kbOpen(p));
  T.eq(p.doc.documentElement.getAttribute('data-tenfoot-keyboard'), null);
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', 'Done in Email goes on to Password');
});

T.runAsync('sign-in: OK on Password opens it with Show; Done in Password presses Sign in; Escape closes it and the selection stays in the box', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p);
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password');
  p.key('Enter');
  T.ok(kbOpen(p) && p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="show"]'), 'the password layout');
  p.key('Escape');
  T.notOk(kbOpen(p));
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', 'Back puts the selection back on the box');
  p.key('Enter');
  kbKey(p, 'c:s'); kbKey(p, 'c:e');
  T.eq(box(p, 'tenfoot-signin-password').value, 'se');
  kbKey(p, 'done');
  await T.sleep(100);
  T.eq(posted.map((x) => x.step), ['next', 'password'], 'Done in Password pressed Sign in: the hand-over began');
});

T.runAsync('sign-in: typing in a box with a real keyboard needs no on-screen one, and Enter is then the box\'s own; the next box starts untouched', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  p.key('a');
  p.key('Enter');
  T.notOk(kbOpen(p), 'typed in: Enter goes on, no keyboard');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password');
  p.key('Enter');
  T.ok(kbOpen(p), 'Password was not typed in: OK opens the keyboard');
  p.key('Escape');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  p.key('Enter');
  T.ok(kbOpen(p), 'back in Email, the selection moving on cleared it: OK opens the keyboard again');
});

T.runAsync('sign-in: a pointer click on a box opens the keyboard (a script\'s own click does not)', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const pw = box(p, 'tenfoot-signin-password');
  pw.click();
  T.notOk(kbOpen(p), 'no detail: a script\'s click');
  pw.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  T.ok(kbOpen(p));
  T.ok(p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="show"]'), 'for that box');
});

T.runAsync('reset: OK on Email opens the keyboard; Done presses Send reset email', async () => {
  const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password' });
  const posted = wireReset(p);
  p.key('Enter');
  T.ok(kbOpen(p));
  kbKey(p, 'c:a'); kbKey(p, 'c:@'); kbKey(p, 'c:b'); kbKey(p, 'c:.com');
  kbKey(p, 'done');
  await T.sleep(50);
  T.eq(posted.map((x) => x.email), ['a@b.com'], 'Done is Enter in the box: the reset went to Dropout\'s form');
});

T.runAsync('the keyboard is closed when Leanback is turned off, and a box that is not Leanback\'s own does not open it', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  p.key('Enter');
  T.ok(kbOpen(p));
  await p.shim.changeStorage({ settings: { newValue: { enabled: false } } });
  await T.sleep(20);
  T.notOk(kbOpen(p), 'closed');
  const q = await boot({ html: '<!doctype html><html><body><form><input id="email" data-rect="40,100,300,40"><button id="go" data-rect="40,160,100,40">Go</button></form></body></html>', url: 'https://watch.dropout.tv/settings' });
  q.$('email').focus();
  q.key('Enter');
  T.notOk(kbOpen(q), 'Dropout\'s own box on a page Leanback does not draw: Enter is the box\'s');
});

const HOME_KEY = 'tenfoot.signin-home';
const note = (stage, ageMs = 0) => (win) => win.sessionStorage.setItem(HOME_KEY, `${stage}:${Date.now() - ageMs}`);
const signedOutVideo = () => fixture('video.html').replace('<body>', '<body class="logged-out">');

T.runAsync('after signing in: "Who is watching?" first (once, from whatever page Dropout goes to), and choosing a profile always ends on Home', async () => {
  // Just signed in; Dropout went back to the page that asked: the picker instead, once.
  const a = await boot({ html: fixture('video.html'), url: URLS.video, before: note('signed') });
  T.eq((await a.state()).navigation, rules.profilesUrl, 'the picker');
  T.ok(/^forced:/.test(a.win.sessionStorage.getItem(HOME_KEY)), 'forced once');
  // Sent to the picker, Dropout took the viewer away from it again (one profile): Home, not the picker again.
  const b = await boot({ html: fixture('video.html'), url: URLS.video, before: note('forced') });
  T.eq([(await b.state()).navigation, b.win.sessionStorage.getItem(HOME_KEY)], [rules.browseUrl, null], 'Home instead');
  // The picker holds the note (signed, forced): the viewer is where they should be.
  for (const stage of ['signed', 'forced', 'chose']) {
    const pick = await boot({ html: fixture('profiles.html'), url: PICK, before: note(stage) });
    T.eq([(await pick.state()).navigation, pick.win.sessionStorage.getItem(HOME_KEY) !== null], [null, true], `the picker is part of the flow (${stage})`);
  }
  // A profile was chosen: whatever Dropout opens next, Home.
  const c = await boot({ html: fixture('video.html'), url: URLS.video, before: note('chose') });
  T.eq([(await c.state()).navigation, c.win.sessionStorage.getItem(HOME_KEY)], [rules.browseUrl, null], 'Home, once');
  const home = await boot({ html: fixture('browse.html'), url: URLS.browse, before: note('chose') });
  T.eq([(await home.state()).navigation, home.win.sessionStorage.getItem(HOME_KEY)], [null, null], 'already Home: nothing to do');
  // Not in a sign-in: nothing moves.
  const q = await boot({ html: fixture('video.html'), url: URLS.video });
  T.eq((await q.state()).navigation, null);
  // A note that lapsed (two minutes) is not acted on.
  const old = await boot({ html: fixture('video.html'), url: URLS.video, before: note('chose', 121000) });
  T.eq([(await old.state()).navigation, old.win.sessionStorage.getItem(HOME_KEY)], [null, null]);
  // Still signed out: the sign-in did not work, nothing moves.
  const out = await boot({ html: signedOutVideo(), url: URLS.video, before: note('signed') });
  T.eq([(await out.state()).navigation, out.win.sessionStorage.getItem(HOME_KEY)], [null, null]);
});

const askOpen = (p) => { const a = p.doc.querySelector('.tenfoot-ask'); return Boolean(a) && !a.hidden; };

T.runAsync('"Dropout signed you out": a page loading signed in sets the flag (this TV was signed in — and nothing else of the account); signed out with the flag, a question, once per tab; Not now closes the tab', async () => {
  // Signed in: the flag.
  const a = await boot({ html: fixture('home.html'), url: URLS.browse });
  await T.sleep(50);
  T.eq(a.shim.store.signedIn, true, 'a flag only');
  T.eq(Object.keys(a.shim.store).filter((k) => /email|password|token|account|user/i.test(k)), [], 'no account details');
  // Signed out with the flag: asked.
  const p = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true } });
  await T.sleep(50);
  T.ok(askOpen(p), 'the question');
  T.eq(p.doc.querySelector('.tenfoot-ask-title').textContent, 'Dropout signed you out.');
  T.eq([...p.doc.querySelectorAll('.tenfoot-ask-button')].map((b) => b.textContent), ['Sign in', 'Not now']);
  T.eq(p.doc.activeElement.textContent, 'Sign in', 'Sign in selected');
  p.key('Enter');
  await T.sleep(20);
  T.eq((await p.state()).navigation, rules.signinUrl, 'OK goes to sign-in (the picker, then Home, follow it)');
  // Once per tab: the same tab, the next page, no question.
  const again = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true }, before: (win) => win.sessionStorage.setItem('tenfoot.signedout-asked', '1') });
  await T.sleep(50);
  T.notOk(askOpen(again), 'asked already in this tab');
  // Not now: it closes, nothing moves, the flag stays for another tab.
  const q = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true } });
  await T.sleep(50);
  q.key('ArrowRight');
  T.eq(q.doc.activeElement.textContent, 'Not now');
  q.key('Enter');
  await T.sleep(20);
  T.notOk(askOpen(q));
  T.eq([(await q.state()).navigation, q.shim.store.signedIn], [null, true]);
  T.eq(q.bg.filter((m) => m.type === 'exit'), [{ type: 'exit', force: true }], 'Not now: the tab is asked to close (Dropout does not work signed out), whatever Back On Home says');
  T.eq(p.bg.filter((m) => m.type === 'exit'), [], 'Sign in does not close anything');
});

T.runAsync('"Dropout signed you out": not asked without the flag, on the sign-in and reset screens and the policies, or while signing in', async () => {
  const none = await boot({ html: signedOutVideo(), url: URLS.video });
  await T.sleep(50);
  T.notOk(askOpen(none), 'never signed in on this TV');
  for (const [html, url] of [[SIGNIN, 'https://watch.dropout.tv/login'], [RESET, 'https://watch.dropout.tv/forgot_password']]) {
    const s = await boot({ html, url, store: { signedIn: true } });
    await T.sleep(50);
    T.notOk(askOpen(s), `not on ${url}: it has its own Sign in`);
  }
  const mid = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true }, before: note('signed') });
  await T.sleep(50);
  T.notOk(askOpen(mid), 'not in the middle of signing in');
});

T.runAsync('"Dropout signed you out": every sign-out clears the flag — Leanback\'s own Sign Out, Dropout\'s own Log out form, the /logout address — so a sign-out on purpose is never reported', async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK, store: { signedIn: true } });
  const form = p.doc.createElement('form');
  form.action = 'https://watch.dropout.tv/logout';
  form.method = 'post';
  p.doc.body.appendChild(form);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.dispatchEvent(new p.win.Event('submit', { bubbles: true, cancelable: true }));
  await T.sleep(20);
  T.eq(p.shim.store.signedIn, undefined, 'Dropout\'s own Log out form');
  const q = await boot({ html: fixture('video.html'), url: 'https://watch.dropout.tv/logout', store: { signedIn: true } });
  await T.sleep(50);
  T.eq(q.shim.store.signedIn, undefined, 'the /logout address');
  const s = await boot({ html: fixture('profiles.html'), url: PICK, store: { signedIn: true } });
  let sent = null;
  s.win.HTMLFormElement.prototype.submit = function () { sent = this.action; };
  for (let i = 0; i < 3; i += 1) s.key('ArrowRight');
  T.eq(s.doc.activeElement, pickCards(s)[4].querySelector('a'));
  s.key('Enter');
  s.key('ArrowRight');
  s.key('Enter');
  await T.sleep(50);
  T.eq([sent, s.shim.store.signedIn], ['https://watch.dropout.tv/logout', undefined], 'Leanback\'s Sign Out: the flag goes first, then Dropout\'s sign-out is sent');
});

T.runAsync('sign-in: pressing Dropout\'s Sign in notes that the picker comes next; a failed sign-in takes the note back', async () => {
  rules.pages.signin.signinMs = 300;
  try {
    const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
    wireDropout(p, { hang: true });
    box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(p, 'tenfoot-signin-password').value = 'a-password';
    p.doc.querySelector('.tenfoot-signin-submit').click();
    await T.sleep(60);
    T.ok(/^signed:\d+$/.test(p.win.sessionStorage.getItem(HOME_KEY) || ''), 'noted while Dropout\'s Sign in is pending');
    await T.sleep(400);
    T.eq(p.win.sessionStorage.getItem(HOME_KEY), null, 'no answer, the page did not move on: nothing to go Home for');
    // An error of Dropout's takes it back at once.
    const q = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
    wireDropout(q, { wrong: true });
    box(q, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(q, 'tenfoot-signin-password').value = 'wrong-password';
    q.doc.querySelector('.tenfoot-signin-submit').click();
    await T.sleep(100);
    T.eq(q.win.sessionStorage.getItem(HOME_KEY), null, 'Dropout said no');
  } finally {
    rules.pages.signin.signinMs = 20000;
  }
});

T.runAsync('sign-in: turning Leanback off takes the screen away', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  T.ok(p.doc.querySelector('.tenfoot-signin'));
  await p.shim.changeStorage({ settings: { newValue: { enabled: false } } });
  T.notOk(p.doc.querySelector('.tenfoot-signin'), 'gone');
});

// The password reset (/forgot_password), in the shape of Dropout's page: its
// error box, then the form.
const RESET = '<!doctype html><html><body class="logged-out"><div id="login--box-container" data-rect="390,200,500,300">' +
  '<div class="flash-error-container"><div class="flash-msg-container is-hidden"><div class="flash-msg"></div></div></div>' +
  '<form id="forgot-password-form"><input id="email" type="email" data-rect="425,300,430,40"><input type="submit" id="reset-submit" value="Reset Password" data-rect="425,350,430,45"></form></div></body></html>';

// Dropout's reset form: what was posted is recorded; Dropout answers with a
// page of its own (not here), or with an error on this one.
function wireReset(p, o = {}) {
  const posted = [];
  p.$('forgot-password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    posted.push({ email: p.$('email').value, asked: p.win.sessionStorage.getItem('tenfoot.reset-asked') });
    if (o.error) {
      const c = p.doc.querySelector('.flash-msg-container');
      c.classList.remove('is-hidden');
      c.querySelector('.flash-msg').textContent = o.error;
    }
  });
  return posted;
}

T.runAsync('reset: Leanback\'s own screen — Reset password, an Email box, Send reset email, Back to sign in, the typing line and the policies; the selection starts in Email', async () => {
  const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password' });
  T.eq((await p.state()).kind, 'reset');
  const layer = p.doc.querySelector('.tenfoot-signin');
  T.ok(layer && layer.parentNode === p.doc.documentElement, 'a layer of its own');
  T.eq(layer.querySelector('h1').textContent, 'Reset password');
  const email = layer.querySelector('#tenfoot-signin-email');
  T.eq([email.type, email.name, email.getAttribute('autocomplete')], ['email', 'email', 'username']);
  T.notOk(layer.querySelector('input[type=password]'), 'no password box');
  T.eq([...layer.querySelectorAll('.tenfoot-signin-buttons > *')].map((b) => [b.textContent, b.getAttribute('href')]), [['Send reset email', null], ['Back to sign in', rules.signinUrl]]);
  T.ok(layer.querySelector('.tenfoot-hero-primary').textContent === 'Send reset email', 'yellow');
  T.eq(layer.querySelector('.tenfoot-signin-note').textContent, 'Press OK on a box to type with the remote, or use a keyboard.');
  T.eq([...layer.querySelectorAll('.tenfoot-signin-links a')].map((a) => a.textContent), rules.legal.map((l) => l.label));
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Send reset email');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Back to sign in');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Privacy Policy');
});

T.runAsync('the email typed on the sign-in screen goes with the viewer to the reset screen and back — and no further', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  const forgot = p.doc.querySelector('.tenfoot-signin-forgot');
  forgot.addEventListener('click', (e) => e.preventDefault());
  forgot.click();
  T.eq(p.win.sessionStorage.getItem('tenfoot.signin-email'), 'fixture@example.test', 'kept for the next screen');
  const kept = (win) => win.sessionStorage.setItem('tenfoot.signin-email', 'fixture@example.test');
  const r = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password', before: kept });
  T.eq(box(r, 'tenfoot-signin-email').value, 'fixture@example.test', 'the reset screen holds it');
  const back = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login', before: kept });
  T.eq([box(back, 'tenfoot-signin-email').value, back.doc.activeElement.id], ['fixture@example.test', 'tenfoot-signin-password'], 'and the sign-in screen starts in Password');
  // Any other page forgets it.
  const home = await boot({ html: fixture('home.html'), url: 'https://watch.dropout.tv/browse', before: (win) => { kept(win); win.sessionStorage.setItem('tenfoot.reset-asked', '1'); } });
  T.eq([home.win.sessionStorage.getItem('tenfoot.signin-email'), home.win.sessionStorage.getItem('tenfoot.reset-asked')], [null, null], 'gone on a page that is not one of the two');
});

T.runAsync('reset: Send reset email hands the email to Dropout\'s own form; "Sending…" meanwhile; the ask is noted before Dropout\'s page moves on', async () => {
  rules.pages.reset.answerMs = 300;
  try {
    const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password' });
    const posted = wireReset(p);
    box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
    const btn = p.doc.querySelector('.tenfoot-signin-submit');
    btn.click();
    T.eq(btn.textContent, 'Sending…');
    T.eq(posted, [{ email: 'fixture@example.test', asked: '1' }], 'the email in Dropout\'s box, pressed, the ask already noted');
    T.eq(p.win.sessionStorage.getItem('tenfoot.signin-email'), 'fixture@example.test', 'the email is kept for the page Dropout answers with');
    btn.click();
    T.eq(posted.length, 1, 'not pressed twice');
    // Dropout\'s page stays and says nothing: no answer.
    await T.sleep(500);
    T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, "Dropout isn't answering. Check the TV's internet connection, then try again.");
    T.eq([btn.textContent, box(p, 'tenfoot-signin-email').value, p.win.sessionStorage.getItem('tenfoot.reset-asked')], ['Send reset email', 'fixture@example.test', null], 'the email kept, the ask forgotten');
  } finally {
    rules.pages.reset.answerMs = 15000;
  }
});

T.runAsync('reset: Dropout\'s error, an empty box and a bad email are said on the screen', async () => {
  const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password' });
  const posted = wireReset(p, { error: 'We could not find an account with that email.' });
  const btn = p.doc.querySelector('.tenfoot-signin-submit');
  btn.click();
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Enter your email.');
  box(p, 'tenfoot-signin-email').value = 'nope';
  btn.click();
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Please enter a valid email.');
  T.eq(posted, [], 'nothing reached Dropout\'s form');
  box(p, 'tenfoot-signin-email').value = 'unknown@example.test';
  btn.click();
  await T.sleep(100);
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'We could not find an account with that email.', 'Dropout\'s words');
  T.eq([p.doc.activeElement.id, p.win.sessionStorage.getItem('tenfoot.reset-asked')], ['tenfoot-signin-email', null]);
});

T.runAsync('reset: back from Dropout\'s answer, the screen says what to do next, leaves out the box and the button, and selects Back to sign in', async () => {
  const asked = (win) => win.sessionStorage.setItem('tenfoot.reset-asked', '1');
  const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password', before: asked });
  const msg = p.doc.querySelector('.tenfoot-signin-error');
  T.eq([msg.hidden, msg.textContent], [false, 'Check your email on your phone or computer. Set the new password there, then sign in here.']);
  T.eq(msg.dataset.tone, 'notice');
  T.ok(p.doc.querySelector('.tenfoot-signin-field').hidden && p.doc.querySelector('.tenfoot-signin-submit').hidden, 'no box, no button');
  T.eq(p.doc.activeElement.textContent, 'Back to sign in');
  T.eq(p.win.sessionStorage.getItem('tenfoot.reset-asked'), null, 'said once');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.textContent, 'Back to sign in', 'nothing above it to stop on');
  // Dropout shows an error on its page instead: that is what is said.
  const err = RESET.replace('flash-msg-container is-hidden"><div class="flash-msg"></div>', 'flash-msg-container"><div class="flash-msg">Too many requests.</div>');
  const q = await boot({ html: err, url: 'https://watch.dropout.tv/forgot_password', before: asked });
  const m2 = q.doc.querySelector('.tenfoot-signin-error');
  T.eq([m2.textContent, m2.dataset.tone, q.doc.activeElement.id], ['Too many requests.', 'error', 'tenfoot-signin-email']);
  // Dropout sends a reset to the sign-in page: the same words there.
  const s = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login', before: asked });
  T.eq([s.doc.querySelector('.tenfoot-signin-error').textContent, s.doc.querySelector('.tenfoot-signin-error').dataset.tone], ['Check your email on your phone or computer. Set the new password there, then sign in here.', 'notice']);
});

T.runAsync("cookie dialog: on a first visit the selection starts on Accept All (rules: common.modalStart); OK accepts and the selection goes back to the form", async () => {
  const ketch = '<div id="ketch-banner" data-rect="680,392,560,296"><button aria-label="close banner" data-rect="700,412,36,36"></button>' +
    '<a href="https://example.test/privacy" data-rect="795,590,85,20">Privacy Policy</a>' +
    '<button id="ketch-banner-button-primary" data-rect="1119,464,100,40">Accept All</button><button id="ketch-banner-button-secondary" data-rect="1058,516,162,40">Customize Settings</button></div>';
  const p = await boot({ html: SIGNIN.replace('</body>', `${ketch}</body>`), url: 'https://watch.dropout.tv/login' });
  T.eq(p.doc.activeElement.id, 'ketch-banner-button-primary');
  T.ok(p.$('ketch-banner').hasAttribute('data-tenfoot-dialog'), 'the dialog, for the CSS that lifts it over the welcome');
  p.$('ketch-banner-button-primary').addEventListener('click', () => p.$('ketch-banner').remove());
  p.key('Enter');
  await T.sleep(200);
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
});

T.runAsync('cookie dialog with a focus trap, opening over a Leanback screen: the dialog keeps the focus, no tug of war', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  T.eq(p.doc.activeElement.textContent, 'Watch');
  p.doc.body.insertAdjacentHTML('beforeend', '<div id="ketch-banner" data-rect="680,392,560,296"><button id="ketch-banner-button-primary" data-rect="1119,464,100,40">Accept All</button></div>');
  const banner = p.$('ketch-banner');
  // Ketch's trap: the focus leaving the banner is sent straight back, at once.
  let trapped = 0;
  p.doc.addEventListener('focusin', (e) => {
    if (banner.isConnected && !banner.contains(e.target)) {
      trapped += 1;
      p.$('ketch-banner-button-primary').focus();
    }
  });
  p.$('ketch-banner-button-primary').focus(); // before the page script has seen it open
  await T.sleep(50);
  T.eq(p.doc.activeElement.id, 'ketch-banner-button-primary');
  T.ok(banner.hasAttribute('data-tenfoot-dialog'), 'known as the dialog');
  T.ok(trapped <= 1, `the trap sent the focus back ${trapped} time(s)`);
  banner.remove();
  await T.sleep(200);
  T.eq(p.doc.activeElement.textContent, 'Watch', 'gone: the selection back where it was');
});

T.runAsync('signed out: the first Home of the tab goes on to the welcome, once; the rail\'s top entry is Sign in', async () => {
  const html = fs.readFileSync(path.join(T.testsDir, 'fixtures', 'home.html'), 'utf8')
    .replace('<body class="browse logged-in">', '<body class="browse logged-out">')
    .replace(/<div class="user-actions has-image">[\s\S]*?<\/div><\/div>/, '');
  const p = await boot({ html, url: 'https://watch.dropout.tv/browse' });
  T.eq((await p.state()).navigation, rules.welcomeUrl);
  T.eq(p.win.sessionStorage.getItem('tenfoot.signin-offered'), '1');
  const again = await boot({ html, url: 'https://watch.dropout.tv/browse', before: (win) => win.sessionStorage.setItem('tenfoot.signin-offered', '1') });
  T.eq((await again.state()).navigation, null, 'Back from the welcome, or its Browse: Home stays');
  const top = again.doc.querySelector('.tenfoot-rail-item');
  T.eq([top.dataset.tenfootRail, top.getAttribute('aria-label'), top.dataset.tenfootStart], ['signin', 'Sign in', 'true']);
});

// ---------------------------------------------------------------------------
// the welcome (/, signed out), the policies, and addresses seen as others
// ---------------------------------------------------------------------------

// In the shape of Dropout's front page signed out (read 2026-10-30): a
// promo banner, the top bar, the banner with the logo, its line and words.
const FRONT = '<!doctype html><html><body class="logged-out sites sites-show">' +
  '<main class="main-container"><div class="promo-banner"><a href="/checkout/x" data-rect="0,0,1280,40">20% OFF</a></div>' +
  '<header class="site-header" data-rect="0,40,1280,60"><a href="/login" data-rect="1180,55,60,30">Sign In</a></header>' +
  '<div class="hero--container"><h1 class="head-image"><img src="https://fixture.test/poster.svg"></h1>' +
  '<h2 class="head-2">Independent. Funny. Ad Free.</h2><p class="head-3">Watch new episodes every week.</p>' +
  '<a href="/plans" class="button" data-rect="540,500,200,50">Start Your Free Trial</a></div></main></body></html>';

T.runAsync("welcome: signed out, Dropout's front page is Leanback's welcome — the logo, the line, Sign In selected, Browse and the policies; no rail", async () => {
  const p = await boot({ html: FRONT, url: 'https://watch.dropout.tv/' });
  const s = await p.state();
  T.eq(s.kind, 'welcome');
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.eq([layer.hidden, layer.dataset.tenfootScreen, layer.dataset.tenfootNorail], [false, 'welcome', 'true']);
  T.eq(p.doc.querySelector('.tenfoot-hero-logo').getAttribute('src'), 'https://fixture.test/poster.svg');
  T.eq(p.doc.querySelector('.tenfoot-hero-title').textContent, 'Independent. Funny. Ad Free.');
  T.ok(/dropout\.tv on a phone or a computer/.test(p.doc.querySelector('.tenfoot-hero-text').textContent), 'where to start a subscription');
  const buttons = [...p.doc.querySelectorAll('.tenfoot-hero-action')];
  T.eq(buttons.map((b) => b.textContent), ['Sign In', 'Browse', 'Privacy Policy', 'Terms of Use']);
  T.eq(buttons.map((b) => b.getAttribute('href')), [rules.signinUrl, rules.browseUrl, ...rules.legal.map((l) => l.url)]);
  T.eq(p.doc.activeElement, buttons[0]);
  p.key('ArrowRight');
  T.eq(p.doc.activeElement, buttons[1], '▶ along the buttons');
  T.notOk(p.doc.querySelector('.tenfoot-rail:not([hidden])'), 'no rail');
});

T.runAsync('welcome: signed in, the front page goes on to Home', async () => {
  const p = await boot({ html: FRONT.replace('logged-out', 'logged-in'), url: 'https://watch.dropout.tv/' });
  T.eq((await p.state()).navigation, rules.browseUrl);
});

T.runAsync("Dropout 24/7 from My List (/events/dropout-24-7, an address no hub is in) goes on to Dropout 24/7's page", async () => {
  const p = await boot({ html: '<!doctype html><html><body class="logged-in live-events"><section id="live-event"></section></body></html>', url: 'https://watch.dropout.tv/events/dropout-24-7' });
  T.eq((await p.state()).navigation, 'https://watch.dropout.tv/dropout-24-7');
  const hub = await boot({ html: '<!doctype html><html><body class="logged-in"></body></html>', url: 'https://watch.dropout.tv/dropout-247/events/dropout-24-7' });
  T.eq((await hub.state()).navigation, null, "the stream's own page, reached from the hub, stays");
});

// In the shape of Dropout's /privacy (read 2026-10-30): the policy drawn
// by Dropout's script into #customer-agreements.
const POLICY = '<!doctype html><html><body class="logged-out sites-privacy-policy">' +
  '<main class="main-container"><div class="promo-banner"><a href="/checkout/x" data-rect="0,0,1280,40">20% OFF</a></div>' +
  '<header class="site-header" data-rect="0,40,1280,60"><a href="/browse" data-rect="20,55,80,30">Browse</a></header>' +
  '<div class="content-container"><section><div id="customer-agreements"><h1>Privacy Policy</h1><p>Words. <a href="https://example.test/" data-rect="100,300,80,20">a link</a></p></div></section></div></main>' +
  '<footer class="footer--site"><a href="/tos" data-rect="20,700,60,20">Terms</a></footer></body></html>';

T.runAsync('policies: privacy, terms and cookies in Leanback\'s type, Dropout\'s top bar and footer gone; ▲ ▼ scroll, nothing is a stop', async () => {
  const scrolled = [];
  const p = await boot({ html: POLICY, url: 'https://watch.dropout.tv/privacy', before: (win) => { win.scrollBy = (o) => scrolled.push(o.top); } });
  T.eq((await p.state()).kind, 'legal');
  T.ok(p.$('customer-agreements').hasAttribute('data-tenfoot-reading'), 'the words, for content/page.css');
  T.ok(p.doc.querySelector('.promo-banner').hasAttribute('data-tenfoot-gone'));
  T.ok(p.doc.querySelector('.site-header').hasAttribute('data-tenfoot-chrome'));
  T.ok(p.doc.querySelector('footer').hasAttribute('data-tenfoot-chrome'));
  T.ok(p.key('ArrowDown').defaultPrevented);
  p.key('ArrowDown');
  p.key('ArrowUp');
  T.eq(scrolled.map((y) => Math.sign(y)), [1, 1, -1], '▼ ▼ ▲');
  T.ok(scrolled[0] > 0 && scrolled[0] < p.win.innerHeight, 'most of a screen at a time');
  T.ok(p.ring().hidden, 'nothing selected');
  T.ok(/Scroll/.test(p.hints().textContent));
  for (const path of ['/tos', '/cookies']) {
    const q = await boot({ html: POLICY, url: `https://watch.dropout.tv${path}` });
    T.eq((await q.state()).kind, 'legal', path);
  }
});

await T.exit();
