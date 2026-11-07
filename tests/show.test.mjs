// content/show.js on its own: which kind of page a one-word address is, the
// seasons read from Dropout's own control, the season a show opens on, the
// episode the selection starts on, and cleaning up after itself. Page wiring
// (keys, navigation) is in page.test.mjs. The markup follows the 2026-09-27
// captures (notes/extensions/leanback-for-dropout/capture-findings.md).
import fs from 'node:fs';
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';

const rules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));
const SHOW = rules.pages.series.show;
const B = 'https://watch.dropout.tv';

function load(html, url = `${B}/a-show`) {
  const dom = makeDom({ clock: true, html, url });
  dom.runScripts(['lib/common.js', 'lib/history.js', 'content/cards.js', 'content/show.js'].map((f) => T.extFile(f)));
  return { win: dom.window, doc: dom.window.document, S: dom.window.TenfootShow, H: dom.window.TenfootHistory };
}

const seasonSelect = (names, selected = 0, show = 'a-show') => `<select class="js-switch-season">${names.map((n, i) => `<option value="${B}/${show}/season:${(/Season (\d+)/.exec(n) || [0, i + 1])[1]}"${i === selected ? ' selected' : ''}>
  ${n}
</option>`).join('')}</select>`;

const episode = (n, extra = '') => `<li class="js-collection-item" data-item-type="video"><div class="browse-item-card"><div class="grid-item-padding"><a class="browse-item-link" id="e${n}" href="${B}/a-show/season:1/videos/e${n}"><div class="browse-image-container"><img src="${B}/e.jpg"><div class="browse-info-container">${extra}</div></div></a><div class="padding-small"><div class="browse-item-title"><a href="${B}/a-show/season:1/videos/e${n}"><strong>E${n}</strong></a></div><span class="browse-item-subtext"><span class="media-identifier media-episode">Episode ${n}</span></span></div></div></div></li>`;

const showPage = ({ seasons = ['Season 1', 'Season 2'], selected = 0, episodes = 4, count = '4 Episodes', extras = {} } = {}) => `<!doctype html><html><body class="collections collections-show">
  <section class="product-feature"><div class="collection-actions">
    <a class="btn custom-btn-action-trailer" href="#">Trailer</a>
    <button class="my-list btn custom-btn-action-my-list">My list</button>
    <a class="btn custom-btn-action-share" href="#">Share</a>
    <div class="reveal-modal"><a class="btn btn-facebook" href="#">f</a></div>
  </div></section>
  <section class="episode-container">
    <div class="row season-controls">${seasons ? seasonSelect(seasons, selected) : ''}<select class="js-sort-items"><option>Sort by...</option></select><h2 class="content-label">${count}</h2></div>
    <div class="row"><div class="item-grid"><ul>${Array.from({ length: episodes }, (_, i) => episode(i + 1, extras[i + 1] || '')).join('')}</ul></div></div>
  </section></body></html>`;

const watched = (n) => [`e${n}`, { url: `${B}/a-show/season:1/videos/e${n}`, duration: 1000, local: { position: 999, at: n } }];
const partway = (n) => [`e${n}`, { url: `${B}/a-show/season:1/videos/e${n}`, duration: 1000, local: { position: 300, at: 100 + n } }];
const store = (...entries) => ({ entries: Object.fromEntries(entries) });

T.run('the kind of page comes from the page, never the address', () => {
  let t = load(showPage());
  T.eq(t.S.layoutOf(t.doc, SHOW), 'show');
  t = load('<!doctype html><html><body><section class="movie-container"></section><section class="extras-container"></section></body></html>', `${B}/aparna-nancherla-hopeful-potato`);
  T.eq(t.S.layoutOf(t.doc, SHOW), 'special');
  t = load('<!doctype html><html><body><section class="collection-container"><ul></ul></section></body></html>', `${B}/trending`);
  T.eq(t.S.layoutOf(t.doc, SHOW), 'list');
  t = load('<!doctype html><html><body><div id="browse-component"></div></body></html>', `${B}/dimension-20`);
  T.eq(t.S.layoutOf(t.doc, SHOW), null, 'a hub is none of them (page.js gives it Home)');
  T.eq(t.S.layoutOf(t.doc, null), null, 'no rules: nothing recognised, no throw');
});

T.run('seasons: read from Dropout\'s own control, each with its page, a short label and which one is on screen', () => {
  const t = load(showPage({ seasons: ['Season 1: All About "A Crown Of Candy"', 'Season 2: All About "Pirates Of Leviathan"', 'Season 10'] }));
  const s = t.S.readSeasons(t.doc, SHOW, `${B}/a-show`);
  T.eq(s.map((x) => x.number), [1, 2, 10]);
  T.eq(s.map((x) => x.label), ['Season 1', 'Season 2', 'Season 10'], 'the text before the colon');
  T.eq(s[0].name, 'Season 1: All About "A Crown Of Candy"', 'the whole name, whitespace tidied');
  T.eq(s[0].url, `${B}/a-show/season:1`);
  T.eq(s.map((x) => x.current), [true, false, false], 'the bare address: whatever Dropout selected (Season 1)');
  T.eq(t.S.readSeasons(t.doc, SHOW, `${B}/a-show/season:10`).map((x) => x.current), [false, false, true], 'an address naming its season: that one');
});

T.run('seasons: an option that is not a season page of this site is left out; no control, no seasons', () => {
  let t = load(`<!doctype html><html><body><select class="js-switch-season"><option value="${B}/a-show/season:1">Season 1</option><option value="https://elsewhere.test/a-show/season:2">Season 2</option><option value="${B}/a-show/extras">Extras</option><option value="${B}/a-show/season:3"> </option></select></body></html>`);
  T.eq(t.S.readSeasons(t.doc, SHOW, `${B}/a-show`).map((x) => x.number), [1]);
  t = load('<!doctype html><html><body></body></html>');
  T.eq(t.S.readSeasons(t.doc, SHOW, `${B}/a-show`), []);
  T.eq(t.S.readSeasons(t.doc, SHOW, 'not a url'), [], 'a bad address never throws');
});

T.run('the season a show opens on: the newest, or the first; nothing to do when already there or with one season', () => {
  const t = load(showPage({ seasons: ['Season 1', 'Season 2', 'Season 3'] }));
  const s = t.S.readSeasons(t.doc, SHOW, `${B}/a-show`);
  T.eq(t.S.seasonTarget(s, 'latest'), `${B}/a-show/season:3`);
  T.eq(t.S.seasonTarget(s, 'first'), null, 'Season 1 is already on screen');
  T.eq(t.S.seasonTarget(t.S.readSeasons(t.doc, SHOW, `${B}/a-show/season:2`), 'first'), `${B}/a-show/season:1`);
  T.eq(t.S.seasonTarget(t.S.readSeasons(t.doc, SHOW, `${B}/a-show/season:3`), 'latest'), null);
  T.eq(t.S.seasonTarget(s.slice(0, 1), 'latest'), null, 'one season: no choice to make');
  T.eq(t.S.seasonTarget(null, 'latest'), null);
  T.eq([t.S.namesSeason('/a-show'), t.S.namesSeason('/a-show/season:2'), t.S.namesSeason('/a-show/season:2?sort=x')], [false, true, true]);
  T.eq([t.S.seasonNumber('/a/season:12'), t.S.seasonNumber('/a/season:x'), t.S.seasonNumber(undefined)], [12, null, null]);
});

T.run('where the selection starts (S12)', () => {
  const titled = (html) => html.replace('<div class="collection-actions">', '<h1 class="collection-title">A Show</h1><div class="collection-actions">');
  const start = (entries, extras) => {
    const t = load(titled(showPage({ episodes: 5, extras })));
    return t.S.readDetail(t.doc, SHOW, { history: store(...entries), href: `${B}/a-show` }).start.split('/').pop();
  };
  T.eq(start([]), 'e1', 'a season not started: Episode 1');
  T.eq(start([watched(1), watched(2)]), 'e3', 'the one after the last finished');
  T.eq(start([watched(1), partway(2)]), 'e2', 'partway through one: that one');
  T.eq(start([watched(1), partway(2), watched(3)]), 'e4', 'you moved on past it: after the last finished');
  T.eq(start([partway(4)]), 'e4', 'jumped into the middle of a season: there');
  T.eq(start([watched(1), watched(3)]), 'e4', 'a gap left behind is not gone back for');
  T.eq(start([1, 2, 3, 4, 5].map(watched)), 'e1', 'the whole season watched: Episode 1 again');
  T.eq(start([], { 2: '<div class="percentage-bar-container"><div class="percentage-bar" style="width: 100.0%;"></div></div>' }), 'e3', 'Dropout\'s own full bar (the Roku) counts as watched');
  T.eq(start([], { 2: '<div class="percentage-bar-container"><div class="percentage-bar" style="width: 30%;"></div></div>' }), 'e2', 'and a part-filled one as in progress');
  T.eq(start([['e2', { url: `${B}/a-show/season:1/videos/e2`, clearedAt: 500 }]], { 2: '<div class="percentage-bar-container"><div class="percentage-bar" style="width: 100.0%;"></div></div>' }), 'e1', 'its progress cleared: Dropout\'s bar no longer counts');
});

T.run('readDetail: what Leanback draws a show from — banner, buttons, seasons newest first, the episodes with their marks, where the selection starts', () => {
  const head = `<h1 class="collection-title">A Show</h1><h2 class="collection-stats">2 Seasons</h2><div class="collection-description"><p>About it.</p></div>`;
  const html = showPage({ extras: { 2: '<div class="duration-container">08:05</div>' } })
    .replace('<div class="collection-actions">', `${head}<div class="collection-actions">`)
    .replace('</div></section>', '</div><div class="cover-art"><img data-image-primary src="${B}/small.jpg"><img data-image-primary src="${B}/wide.jpg"></div></section>'.replace(/\$\{B\}/g, B));
  const { doc, S } = load(html, `${B}/a-show/season:1`);
  const d = S.readDetail(doc, SHOW, { history: store(watched(1), partway(3)), href: `${B}/a-show/season:1` });
  T.eq([d.kind, d.hero.title, d.hero.meta, d.hero.description, d.hero.image], ['show', 'A Show', '2 Seasons', 'About it.', `${B}/wide.jpg`], 'the last of the cover pictures: the wide one');
  T.eq(d.hero.actions.map((a) => [a.key, a.label, Boolean(a.primary)]), [['resume', 'Resume S1 E3', true], ['trailer', 'Trailer', false], ['mylist', 'My List', false]], 'no Share');
  T.eq(d.hero.actions[0].href, `${B}/a-show/season:1/videos/e3`);
  T.ok(d.hero.actions[1].proxy.matches('.custom-btn-action-trailer'), 'Trailer presses Dropout\'s own button');
  T.eq(d.hero.actions[2].listed, false);
  T.eq(d.pills.items.map((x) => [x.label, x.current]), [['Season 2', false], ['Season 1', true]]);
  T.eq([d.current, d.sections.length, d.sections[0].title, d.sections[0].sub, d.sections[0].columns], ['Season 1', 1, 'Season 1', '4 Episodes', 5]);
  const it = d.sections[0].items;
  T.eq(it.map((x) => x.watch || ''), ['watched', '', 'in-progress', '']);
  T.eq([it[1].title, it[1].subtitle, it[1].durationText, it[1].image], ['E2', 'Episode 2', '8:05', `${B}/e.jpg`]);
  T.eq([it[2].fraction > 0, it[0].fraction], [true, null], 'only one partway through carries a bar; the history is already in the marks');
  T.eq(d.start, `${B}/a-show/season:1/videos/e3`, 'S12: the one partway through');
  T.eq(d.more, null);
});

T.run('readDetail: nothing to draw from — no title, or not a show\'s page — gives null, and Dropout\'s page is kept', () => {
  T.eq(load(showPage()).S.readDetail(load(showPage()).doc, SHOW, {}), null, 'no title: Dropout has changed its header');
  const other = load('<!doctype html><html><body><p>x</p></body></html>');
  T.eq(other.S.readDetail(other.doc, SHOW, {}), null);
});

await T.exit();
