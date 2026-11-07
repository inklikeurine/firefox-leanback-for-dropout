// content/screen.js, wired by content/page.js: the screen Leanback draws for
// Dropout's collection pages (Browse, My List, the lists), on the
// collection.html fixture — the markup of the 2026-09-27 captures. jsdom has
// no layout, so these check the model and what is drawn, not where.
import fs from 'node:fs';
import path from 'node:path';
import { T, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';

const rules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));
const fixture = (n) => fs.readFileSync(path.join(T.testsDir, 'fixtures', n), 'utf8');
const manifest = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8'));
const FILES = manifest.content_scripts
  .find((cs) => cs.matches.some((m) => m.includes('watch.dropout.tv')))
  .js.map((f) => T.extFile(f));
const B = 'https://watch.dropout.tv';
const LAYOUT_FILE = path.join(T.testsDir, 'fixtures', 'layout.js');

async function boot({ html = fixture('collection.html'), url = `${B}/new-releases`, progress = null, before = null } = {}) {
  const storage = { settings: {} };
  if (progress) storage['progress:0'] = progress;
  const shim = makeBrowserShim({ tabs: [{ id: 1, url, active: true }], storage });
  const bg = [];
  shim.browser.runtime.onMessage.addListener((m, s, send) => {
    bg.push(m);
    if (m.type === 'rules:get') send({ ok: true, rules });
    else send({ ok: true });
    return false;
  });
  const dom = makeDom({ html, url, browser: shim.browser });
  const win = dom.window;
  win.__went = [];
  win.history.go = (d) => win.__went.push(d);
  if (before) before(win);
  // The fixture's own script (its Load More) is the page's: it runs first.
  dom.runScripts([LAYOUT_FILE, ...FILES]);
  await T.sleep(80);
  const listener = shim.listeners.message[1].fn;
  const msg = (m) => new Promise((res) => listener(m, { tab: { id: 1 }, frameId: 0 }, res));
  const state = () => msg({ type: 'page:state' });
  return { shim, dom, win, doc: win.document, bg, state, key: (k, init) => dom.key(k, init), active: () => win.document.activeElement, last: (type) => bg.filter((m) => m.type === type).at(-1) };
}

const hrefOf = (el) => (el && el.getAttribute('href')) || null;
const ep = (n) => `${B}/new-releases/videos/nr-ep-${n}`;

T.run('readPage: the title, each tile once with its link, picture, title, length, badge and bar, and whether there is more', () => {
  const dom = makeDom({ html: fixture('collection.html'), url: `${B}/new-releases` });
  dom.runScripts(['lib/common.js', 'content/cards.js', 'content/screen.js', 'content/readers.js'].map((f) => T.extFile(f)));
  const r = dom.window.TenfootReaders.readPage(dom.window.document, rules.screen);
  T.eq([r.root, r.title, r.items.length, r.more], [true, 'New Releases', 12, true]);
  T.eq(r.items[1], { key: ep(2), href: ep(2), title: 'New episode 2', subtitle: '', image: `${B}/art-2.svg`, duration: 1322, durationText: '22:02', percent: 30, badge: 'New' });
  T.eq([r.items[3].badge, r.items[3].percent], ['', null]);
  const none = makeDom({ html: '<!doctype html><html><body><p>nothing</p></body></html>', url: `${B}/x` });
  none.runScripts(['lib/common.js', 'content/cards.js', 'content/screen.js', 'content/readers.js'].map((f) => T.extFile(f)));
  T.eq(none.window.TenfootReaders.readPage(none.window.document, rules.screen), { root: false, title: '', items: [], more: false });
});

T.runAsync('a list (New Releases): Leanback draws it, the rail beside it, Dropout\'s top bar and footer hidden (G6, G8)', async () => {
  const p = await boot();
  const s = await p.state();
  T.eq([s.kind, Boolean(s.rail), s.rail.page], ['series', true, null], 'the rail on every page that plays no video (the owner, 2026-10-03); no entry lit');
  T.eq([s.home.kind, s.home.title], ['screen', 'New Releases']);
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.ok(layer && !layer.hidden && layer.parentElement === p.doc.documentElement, 'Leanback\'s layer, outside the site\'s tree');
  T.notOk(layer.dataset.tenfootNorail, 'room left for the rail');
  T.eq(p.doc.documentElement.dataset.tenfootHome, 'on');
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'New Releases');
  T.ok(p.doc.querySelector('.site-header').hasAttribute('data-tenfoot-chrome') && p.doc.querySelector('footer.footer--site').hasAttribute('data-tenfoot-chrome'), 'Dropout\'s top bar and footer, hidden');
  T.ok(p.doc.getElementById('collection-grid'), 'Dropout\'s page is still there underneath');
  T.eq(hrefOf(p.active()), ep(1), 'the selection starts on the first card');
  T.ok(p.active().closest('.tenfoot-screen'));
});

T.runAsync('cards: picture, title, length; New Releases carries no "New" badges, as on Home; Dropout\'s bar is drawn', async () => {
  const p = await boot();
  const card = (n) => p.doc.querySelector(`.tenfoot-screen .tenfoot-card[data-tenfoot-card="${ep(n)}"]`);
  T.eq(card(2).querySelector('.tenfoot-card-title').textContent, 'New episode 2');
  T.eq(card(2).querySelector('.tenfoot-card-time').textContent, '22:02');
  T.eq(card(2).querySelector('.tenfoot-card-art').getAttribute('src'), `${B}/art-2.svg`);
  T.ok(card(1).querySelector('.tenfoot-card-badge').hidden, 'no "New": the page says so already');
  T.eq(card(2).querySelector('.tenfoot-card-progress-fill').style.width, '30%');
  T.ok(card(3).querySelector('.tenfoot-card-progress').hidden);
  T.ok(p.last('history:observe').items.some((i) => i.key === 'nr-ep-2' && i.percent === 30), 'the bar reached the watch history');
});

T.runAsync('a video whose progress was cleared: Dropout\'s bar is not drawn on its card', async () => {
  const p = await boot({ progress: { entries: { 'nr-ep-2': { url: ep(2), clearedAt: Date.now() } } } });
  const card = p.doc.querySelector(`.tenfoot-screen .tenfoot-card[data-tenfoot-card="${ep(2)}"]`);
  T.ok(card.querySelector('.tenfoot-card-progress').hidden);
});

T.runAsync('the grid: five across; ◀ ▶ along a row and stop at its ends; ▲ ▼ keep the column; into a shorter last row, its last card', async () => {
  const p = await boot({ html: fixture('collection.html').replace(/<template id="more-tiles">[\s\S]*?<\/template>/, '').replace(/<div class="row loadmore">[\s\S]*?<\/div>/, '') });
  const at = () => p.active().getAttribute('href');
  for (let i = 0; i < 4; i += 1) p.key('ArrowRight');
  T.eq(at(), ep(5));
  T.ok(p.key('ArrowRight').defaultPrevented, '▶ at the end of a row is taken');
  T.eq(at(), ep(5), 'and goes nowhere');
  p.key('ArrowDown');
  T.eq(at(), ep(10), 'down a row, same column');
  p.key('ArrowDown');
  T.eq(at(), ep(12), 'the last row is shorter: its last card');
  p.key('ArrowDown');
  T.eq(at(), ep(12), 'and nothing below');
  p.key('ArrowUp');
  T.eq(at(), ep(7));
  p.key('ArrowLeft');
  T.eq(at(), ep(6));
  p.key('ArrowLeft');
  T.eq((await p.state()).rail.active, true, 'the start of a row: the rail');
  p.key('ArrowRight');
  T.eq(at(), ep(6), 'and back');
  p.key('ArrowUp');
  T.eq(at(), ep(1));
  const s = await p.state();
  T.eq([s.home.index, s.home.columns, s.home.count], [0, 5, 12]);
});

T.runAsync('Load More: Dropout\'s own, pressed near the end; its tiles join the grid and the selection stays put', async () => {
  const p = await boot();
  // Three rows: the last ones are near from the start, so it is pressed at once.
  await T.sleep(300);
  const s = await p.state();
  T.eq([s.home.count, s.home.more, s.home.loading], [18, false, false], 'six more, and no more after them');
  T.notOk(p.doc.getElementById('collection-more'), 'Dropout\'s Load More was pressed (and has gone)');
  T.eq(hrefOf(p.active()), ep(1), 'the selection did not move');
  for (let i = 0; i < 3; i += 1) p.key('ArrowDown');
  T.eq(hrefOf(p.active()), ep(16), 'the new row, reachable');
});

T.runAsync('OK opens the card\'s own link; the history\'s progress wins over Dropout\'s bar', async () => {
  const p = await boot({ progress: { entries: { 'nr-ep-3': { url: ep(3), duration: 1000, local: { position: 500, at: Date.now() } } } } });
  const card3 = p.doc.querySelector(`.tenfoot-screen .tenfoot-card[data-tenfoot-card="${ep(3)}"]`);
  T.eq(card3.querySelector('.tenfoot-card-progress-fill').style.width, '50%', 'watched here: half way');
  p.key('ArrowRight');
  let clicked = null;
  p.active().addEventListener('click', (e) => { clicked = e.currentTarget.getAttribute('href'); e.preventDefault(); });
  p.key('Enter');
  T.eq(clicked, ep(2));
});

T.runAsync('Browse (/series) is drawn with the rail beside it; ◀ from the first column enters the rail', async () => {
  const p = await boot({ url: `${B}/series` });
  const s = await p.state();
  T.eq([s.kind, s.home.kind, Boolean(s.rail)], ['grid', 'screen', true]);
  T.notOk(p.doc.querySelector('.tenfoot-screen').dataset.tenfootNorail);
  p.key('ArrowLeft');
  T.eq((await p.state()).rail.active, true);
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), ep(1), 'back on the card it came from');
});

T.runAsync('all movies (/movies) and Continue Watching in full (/continue-watching) are lists by their address: drawn as Browse is, Browse lit', async () => {
  for (const url of [`${B}/movies`, `${B}/continue-watching`]) {
    const p = await boot({ url });
    const s = await p.state();
    T.eq([s.kind, s.home.kind, s.home.layout, s.rail.page, hrefOf(p.active())], ['grid', 'screen', 'collection', 'browse', ep(1)], url);
  }
});

T.runAsync('sign-in, account, help and legal pages keep Dropout\'s top bar and footer, and get no screen', async () => {
  const p = await boot({ url: `${B}/help` });
  const s = await p.state();
  T.eq([s.kind, s.home], ['other', null]);
  T.notOk(p.doc.querySelector('.site-header').hasAttribute('data-tenfoot-chrome'));
  T.notOk(p.doc.querySelector('footer.footer--site').hasAttribute('data-tenfoot-chrome'));
});

// ---------------------------------------------------------------------------
// search (search.html: the search app's markup of the 2026-09-26 capture; the
// fixture's layout.js stands in for the React app — typing redraws the
// results and puts the words in the address)
// ---------------------------------------------------------------------------

const R_ = (n) => `${B}/videos/result-${n}`;
const field = (p) => p.doc.querySelector('.tenfoot-screen .tenfoot-screen-field-input');
const kbOf = (p) => p.doc.querySelector('.tenfoot-kb');
const kbKeyOf = (p, id) => kbOf(p).querySelector(`[data-tenfoot-key="${id}"]`);
const onKeys = (p) => kbOf(p).contains(p.active());
const toResults = (p) => kbKeyOf(p, 'done').click();
const typeIn = async (p, text) => {
  const f = field(p);
  f.value = text;
  f.dispatchEvent(new p.win.Event('input', { bubbles: true }));
  await T.sleep(300);
};

T.run('searchModel: Leanback\'s box with Dropout\'s words, the filters, the results, the empty message, Load More; null without Dropout\'s box', () => {
  const dom = makeDom({ html: fixture('search.html'), url: `${B}/search?q=test` });
  dom.runScripts(['lib/common.js', 'content/cards.js', 'content/screen.js', 'content/readers.js'].map((f) => T.extFile(f)));
  const S = dom.window.TenfootReaders;
  const m = S.searchModel(dom.window.document, rules.screen.search);
  T.eq([m.kind, m.field.value, m.field.placeholder, m.field.docked, m.start], ['search', 'test', 'Search', true, undefined], 'the box is on the docked keyboard');
  T.eq(m.pills.items.map((x) => [x.key, x.label, x.current]), [['all', 'All (8)', true], ['video', 'Videos (8)', false]]);
  T.ok(m.pills.items[1].proxy.matches('button.TypeFilters-module__type-filter'), 'a filter presses Dropout\'s own button');
  const it = m.sections[0].items;
  T.eq([it.length, m.sections[0].columns], [8, 3]);
  T.eq([it[1].href, it[1].title, it[1].subtitle, it[1].image], [R_(1), 'Test Kitchen', '', `${B}/art-2.svg`], 'the visible title; Dropout\'s blank subtitle is blank');
  T.eq([m.empty, Boolean(m.more)], ['', true]);
  const none = makeDom({ html: '<!doctype html><html><body><input type="search"></body></html>', url: `${B}/search` });
  none.runScripts(['lib/common.js', 'content/cards.js', 'content/screen.js', 'content/readers.js'].map((f) => T.extFile(f)));
  T.eq(none.window.TenfootReaders.searchModel(none.window.document, rules.screen.search), null, 'not Dropout\'s search app: the page stays as it is');
});

T.runAsync('search (drawn): the keyboard docked beside the page with the words on it, the filters, the results as cards three across; the rail beside it; the selection on the keys', async () => {
  const p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test` });
  const s = await p.state();
  T.eq([s.kind, s.home.kind, s.home.layout, Boolean(s.rail)], ['search', 'screen', 'search', true]);
  T.eq(s.home.search, { text: 'test', site: 'test', filters: ['All (8)', 'Videos (8)'], filter: 'All (8)', empty: null });
  T.eq([kbOf(p).hidden, kbOf(p).getAttribute('data-tenfoot-docked'), p.doc.documentElement.getAttribute('data-tenfoot-keyboard-docked')], [false, 'true', 'on'], 'up as soon as the page is');
  T.eq(p.active().dataset.tenfootKey, 'c:a', 'the selection starts on the keys, ready to type');
  T.ok(p.doc.querySelector('.tenfoot-screen-field').hidden, 'the box is not on the screen');
  T.eq(kbOf(p).querySelector('.tenfoot-kb-preview').textContent, 'test', 'its words are on the panel');
  T.notOk(p.doc.querySelector('.tenfoot-screen').dataset.tenfootNorail);
  T.eq(p.doc.querySelector('.tenfoot-screen .tenfoot-season[aria-current="true"]').textContent, 'All (8)');
  T.eq(p.doc.querySelectorAll('.tenfoot-screen .tenfoot-card').length >= 8, true);
  T.ok(p.doc.querySelector('.site-header').hasAttribute('data-tenfoot-chrome'), 'Dropout\'s top bar hidden');
});

T.runAsync('search (drawn): typing goes into Dropout\'s box; its results come back as cards beside the keyboard, the address follows, and the selection stays on the keys', async () => {
  const p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test` });
  const layer = p.doc.querySelector('.tenfoot-screen');
  await typeIn(p, 'kitchen');
  T.eq(p.doc.querySelector('input.SearchForm-module__search-input').value, 'kitchen', 'Dropout\'s box has the words');
  T.eq(p.win.location.search, '?q=kitchen', 'the app put them in the address');
  const s = await p.state();
  T.eq([s.kind, s.home.count, s.home.search.site, s.home.search.filters], ['search', 1, 'kitchen', ['All (1)', 'Videos (1)']]);
  T.eq(p.doc.querySelector('.tenfoot-screen'), layer, 'the same screen: an address change while typing is not a new page');
  T.ok(onKeys(p), 'still typing');
  T.eq(p.doc.querySelector('.tenfoot-screen .tenfoot-card-title').textContent, 'Test Kitchen');
  await typeIn(p, '');
  const e = await p.state();
  T.eq([e.home.count, e.home.search.empty, e.home.search.filters], [0, 'Start typing to see results', []], 'an empty box: Dropout\'s own words, no filters');
  toResults(p);
  T.ok(onKeys(p), 'nothing to go to: Done leaves the selection on the keys');
  for (let i = 0; i < 6; i += 1) p.key('ArrowRight');
  T.ok(onKeys(p), 'and ▶ past the edge too');
});

T.runAsync('search (drawn): typing with the on-screen keyboard — the results coming back under it do not take the selection; the keyboard stays open and selected', async () => {
  const p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test` });
  const kb = () => p.doc.querySelector('.tenfoot-kb');
  const key = (id) => kb().querySelector(`[data-tenfoot-key="${id}"]`);
  await typeIn(p, '');
  T.ok(!kb().hidden, 'the keyboard is up');
  for (const c of 'kitchen') key('c:' + c).click();
  await T.sleep(400);
  T.eq(p.doc.querySelector('input.SearchForm-module__search-input').value, 'Kitchen', 'Dropout\'s box has the words');
  T.eq((await p.state()).home.count, 1, 'the results came back and were drawn');
  T.ok(!kb().hidden, 'the keyboard is still open');
  T.ok(kb().contains(p.doc.activeElement), 'and the selection is still on its keys, not pulled up to the box: ' + (p.doc.activeElement.id || p.doc.activeElement.className));
  key('c:s').click();
  await T.sleep(300);
  T.ok(kb().contains(p.doc.activeElement), 'again after the next letter');
  key('done').click();
  await T.sleep(50);
  T.ok(!kb().hidden, 'Done leaves it up');
  T.notOk(kb().contains(p.doc.activeElement), 'and the selection goes to the first result');
  T.eq(kb().querySelectorAll('[data-tenfoot-current]').length, 0, 'no key looks selected');
});

T.runAsync('search (drawn): Dropout\'s own page grabbing the focus as results load (again and again) never pulls the selection off the keyboard', async () => {
  const p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test` });
  const kb = () => p.doc.querySelector('.tenfoot-kb');
  const site = p.doc.querySelector('input.SearchForm-module__search-input');
  p.key('Enter');
  T.ok(!kb().hidden);
  for (let i = 1; i <= 9; i += 1) {
    p.key('Enter'); // OK on the selected key: a letter
    site.focus(); // the site's app, putting the focus on its own box
    await T.sleep(20);
    T.ok(kb().contains(p.doc.activeElement), `after the ${i}th time the selection is still on the keyboard, not on ${p.doc.activeElement.id || p.doc.activeElement.className}`);
  }
  T.ok(!kb().hidden, 'still open');
});

T.runAsync('search (drawn): Done goes to the first result; ▶ past the keys to where the selection last was; ◀ from the results back to the keys; ◀ past them to the rail; ▶ back; OK on the search glyph is the keys', async () => {
  const p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test` });
  T.eq(p.active().dataset.tenfootKey, 'c:a');
  toResults(p);
  T.eq(hrefOf(p.active()), R_(0), 'Done: the first result');
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), R_(1));
  p.key('ArrowUp');
  T.eq(p.active().textContent, 'All (8)', 'the filters above the results');
  T.ok(p.key('ArrowUp').defaultPrevented);
  T.eq(p.active().textContent, 'All (8)', 'and nothing above them: the box is on the panel');
  p.key('ArrowDown'); p.key('ArrowLeft');
  T.eq(hrefOf(p.active()), R_(0));
  p.key('ArrowLeft');
  T.ok(onKeys(p), '◀ from the results: the keys');
  T.eq(kbOf(p).querySelectorAll('[data-tenfoot-current]').length, 1, 'a key is selected again');
  T.eq(p.active().dataset.tenfootKey, 'done', 'on the row the selection left, from the right');
  p.key('ArrowRight');
  T.eq(hrefOf(p.active()), R_(0), '▶ past the right edge: where it was');
  p.key('ArrowLeft');
  for (let i = 0; i < 3; i += 1) p.key('ArrowLeft');
  const s = await p.state();
  T.eq(s.rail.active, true, '◀ past the left edge: the rail');
  T.eq(kbOf(p).hidden, false, 'the keyboard stays');
  p.key('ArrowRight');
  T.ok(onKeys(p), '▶ from the rail: back on the keys');
  for (let i = 0; i < 3; i += 1) p.key('ArrowLeft');
  T.eq((await p.state()).rail.item, 'search');
  p.key('Enter');
  T.ok(onKeys(p), 'OK on the search glyph: the keys');
  T.eq((await p.state()).rail.active, false);
});

T.runAsync('search (drawn): the remote\'s Menu deletes on the keys and opens the settings from the results; a real keyboard types on the keys and from the results; Back and "/" leave search', async () => {
  const before = (win) => win.sessionStorage.setItem('tenfoot.trail', JSON.stringify([{ url: `${B}/browse`, kind: 'browse' }, { url: `${B}/search?q=test`, kind: 'search' }]));
  let p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before });
  const box = () => p.doc.querySelector('input.SearchForm-module__search-input');
  p.key('ContextMenu');
  T.eq(box().value, 'tes', 'Menu on the keys');
  T.ok(onKeys(p));
  p.key('t');
  T.eq(box().value, 'test', 'a real keyboard');
  toResults(p);
  p.key('s');
  T.eq(box().value, 'tests', 'from the results: the letter, and the selection back on the keys');
  T.ok(onKeys(p));
  p.key('Escape');
  await T.sleep(20);
  T.ok(p.win.__went && p.win.__went.length === 1, 'Back from the keys leaves search');
  p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before });
  p.key('/');
  await T.sleep(20);
  T.eq(p.win.__went, [-1], '"/" too, not a slash');
});

T.runAsync('search (drawn): OK on a filter presses Dropout\'s; the one on screen changes and the selection stays on it', async () => {
  const p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test` });
  toResults(p);
  p.key('ArrowUp'); p.key('ArrowRight');
  T.eq(p.active().textContent, 'Videos (8)');
  p.key('Enter');
  await T.sleep(300);
  T.ok(p.doc.querySelector('button[data-filter-type="video"]').classList.contains('TypeFilters-module__selected'), 'Dropout\'s Videos filter is on');
  T.eq((await p.state()).home.search.filter, 'Videos (8)');
  T.eq(p.active().getAttribute('aria-current'), 'true');
  T.eq(p.active().textContent, 'Videos (8)');
});

T.runAsync('search (drawn): Dropout\'s Load More is pressed near the end of the results, not while typing; the selection stays put; with no Dropout box, the page is driven as before', async () => {
  let p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test` });
  await T.sleep(300);
  T.eq((await p.state()).home.count, 8, 'on the keys: nothing more is loaded');
  toResults(p);
  p.key('ArrowDown');
  await T.sleep(300);
  const s = await p.state();
  T.eq([s.home.count, s.home.more], [12, false], 'among the rows of results: near the end');
  T.eq(hrefOf(p.active()), R_(3), 'the selection stayed put');
  p = await boot({ html: '<!doctype html><html><body><input type="search" id="q" data-rect="40,100,400,40"></body></html>', url: `${B}/search` });
  T.eq([(await p.state()).home, p.active().id], [null, 'q']);
});

T.runAsync('Dropout\'s page stays hidden under a screen still being built, and shows the moment the screen is up (the owner, 2026-10-03: Dropout\'s page showed first)', async () => {
  const full = fixture('collection.html');
  const tiles = /(<ul[^>]*id="collection-grid"[^>]*>)([\s\S]*?)(<\/ul>)/.exec(full);
  T.ok(tiles, 'the fixture\'s grid');
  const p = await boot({ html: full.replace(tiles[0], `${tiles[1]}${tiles[3]}`) });
  const root = p.doc.documentElement;
  T.ok(root.hasAttribute('data-tenfoot-ready'), 'Leanback has started');
  T.ok(root.hasAttribute('data-tenfoot-pending'), 'no cards yet: Dropout\'s page kept hidden');
  p.doc.getElementById('collection-grid').insertAdjacentHTML('beforeend', tiles[2]);
  await T.sleep(250);
  T.notOk(root.hasAttribute('data-tenfoot-pending'), 'the screen is up: lifted');
  T.eq(hrefOf(p.active()), ep(1));
  const q = await boot();
  T.notOk(q.doc.documentElement.hasAttribute('data-tenfoot-pending'), 'a screen drawn at once never holds it');
});

// The search app adds a step to the history for each search; the trail
// keeps one entry per step (the owner, 2026-10-03: Home on the rail did
// nothing on Search — it went back one step, to an earlier search).
const fromHome = (win) => win.sessionStorage.setItem('tenfoot.trail', JSON.stringify([{ url: `${B}/browse`, kind: 'browse' }, { url: `${B}/search?q=test`, kind: 'search' }]));

T.runAsync('search: after two searches, Home on the rail goes back three steps, to Home', async () => {
  const p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before: fromHome });
  await typeIn(p, 'kitchen');
  await typeIn(p, 'kit');
  T.eq(p.win.history.length, 3, 'two steps added by the app');
  const trail = JSON.parse(p.win.sessionStorage.getItem('tenfoot.trail'));
  T.eq(trail.map((e) => e.url), [`${B}/browse`, `${B}/search?q=test`, `${B}/search?q=kitchen`, `${B}/search?q=kit`]);
  field(p).setSelectionRange(0, 0);
  p.key('ArrowLeft');
  T.eq((await p.state()).rail.item, 'search', 'on the rail, at Search');
  p.key('ArrowDown');
  T.eq((await p.state()).rail.item, 'home');
  p.key('Enter');
  T.eq(p.win.__went, [-3], 'past every search, to Home');
});

T.runAsync('search: Back from the results, and "/", go past every search at once; Firefox\'s own Back steps through them and the trail follows', async () => {
  let p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before: fromHome });
  await typeIn(p, 'kitchen');
  await typeIn(p, 'kit');
  toResults(p);
  T.ok(p.active().getAttribute('href'), 'on a result');
  p.key('Escape');
  await T.sleep(20);
  T.eq(p.win.__went, [-3], 'Back leaves search for the page before it');

  p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before: fromHome });
  await typeIn(p, 'kitchen');
  toResults(p);
  p.key('/');
  T.eq(p.win.__went, [-2], '"/" closes search the same way');

  p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before: fromHome });
  await typeIn(p, 'kitchen');
  await typeIn(p, 'kit');
  p.win.history.back();
  await T.sleep(300);
  T.eq(p.win.location.search, '?q=kitchen', 'Firefox\'s Back: the search before');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.trail')).length, 3, 'the trail cut back to it');
  field(p).setSelectionRange(0, 0);
  p.key('ArrowLeft');
  p.key('ArrowDown');
  p.key('Enter');
  T.eq(p.win.__went, [-2], 'Home from there: two steps');
});

// Task 17 (the owner's review, 2026-11-01): after a search typed with the
// on-screen keyboard, the rail's Home went back through the history to
// somewhere short of Home. Dropout's app adds a step after every search, even
// one that leaves the address as it was (the same words typed again after a
// Backspace, a filter pressed), and letters typed faster than Leanback looks
// add several steps between two looks: the trail was short of the history.
const toHome = async (p) => {
  for (let i = 0; i < 7; i += 1) p.key('ArrowLeft');
  p.key('ArrowDown');
  T.eq((await p.state()).rail.item, 'home');
  p.key('Enter');
};

T.runAsync('search: typed with the on-screen keyboard (letters faster than Leanback looks, a Backspace, the same words again, a filter), Home on the rail goes back every step the app added', async () => {
  const p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before: fromHome });
  const kb = () => p.doc.querySelector('.tenfoot-kb');
  const key = (id) => kb().querySelector(`[data-tenfoot-key="${id}"]`);
  await typeIn(p, '');
  T.ok(!kb().hidden, 'the keyboard');
  for (const c of 'kitchen') key('c:' + c).click(); // one burst: six searches between two looks
  await T.sleep(300);
  key('backspace').click();
  await T.sleep(300);
  key('c:n').click(); // "Kitchen" again: a step, the address unchanged
  await T.sleep(300);
  key('done').click();
  await T.sleep(50);
  T.eq(p.win.location.search, '?q=Kitchen');
  T.ok(p.active().getAttribute('href'), 'Done went to the first result');
  p.key('ArrowUp');
  T.ok(/^All/.test(p.active().textContent), 'the filters above it: ' + p.active().textContent);
  p.key('ArrowRight');
  T.ok(/^Videos/.test(p.active().textContent), p.active().textContent);
  p.key('Enter'); // another filter: Dropout's app searches again, the address unchanged
  await T.sleep(300);
  const added = p.win.history.length - 1;
  T.eq(added, 9, 'the app added nine steps (Ki … Kitchen, Kitche, Kitchen, the filter)');
  await toHome(p);
  T.eq(p.win.__went, [-(added + 1)], 'past every step the app added, to Home');
});

T.runAsync('search: with the Navigation API (Firefox 147+), Home is found in the history itself, whatever the trail counted; not there at all, Home is opened', async () => {
  // A history the trail cannot know: Home five steps back (say, the site
  // added steps Leanback never saw).
  const nav = (homeAt, here) => (win) => {
    fromHome(win);
    const entries = Array.from({ length: here + 1 }, (_, i) => ({ index: i, url: i === homeAt ? `${B}/browse` : `${B}/search?q=step${i}` }));
    win.navigation = { currentEntry: entries[here], entries: () => entries };
  };
  let p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before: nav(2, 7) });
  await toHome(p);
  T.eq(p.win.__went, [-5], 'five steps back, as the history says, not the one step the trail had');

  p = await boot({ html: fixture('search.html'), url: `${B}/search?q=test`, before: nav(-1, 3) });
  await toHome(p);
  T.eq(p.win.__went, [], 'Home is not in the history (the oldest steps dropped off): no jump to somewhere else');
  const intent = JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent'));
  T.eq([intent.kind, intent.to], ['push', `${B}/browse`], 'Home is opened instead');
});

await T.exit();
