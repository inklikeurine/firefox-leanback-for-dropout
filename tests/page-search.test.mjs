// content/page.js on search: the field keeps the keyboard, and the results are reachable.
import fs from 'node:fs';
import { T } from '../../firefox-tools/harness/lib.mjs';
import { rules, URLS, boot, watch, box } from './page-support.mjs';

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

T.runAsync('search: ◀ with the text cursor at the start of the box goes to the rail; anywhere else it moves the cursor', async () => {
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

T.runAsync('search: the field keeps the keyboard; ▼ and Escape leave it for the results, ▲ comes back', async () => {
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

await T.exit();
