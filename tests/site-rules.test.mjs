// nav/site-rules.js against the real sites/dropout.json: every URL pattern in
// docs/site-notes.md lands on the page kind it should, and the helpers cope
// with a broken rules object.
import fs from 'node:fs';
import { T, loadScript } from '../../firefox-tools/harness/lib.mjs';

const ctx = loadScript(T.extFile('nav/site-rules.js'));
const R = ctx.TenfootSiteRules;
const rules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));
const kind = (p) => R.classify(rules, p);

T.run('routes from site-notes.md classify as documented', () => {
  T.eq(kind('/browse'), 'browse');
  T.eq(kind('/browse/'), 'browse');
  T.eq(kind('/series'), 'grid');
  T.eq(kind('/series/'), 'grid');
  T.eq(kind('/collections/comedy'), 'grid');
  T.eq(kind('/my-list'), 'grid', 'My List, loaded fresh, is a collection grid like Browse');
  T.eq(kind('/movies'), 'grid', 'all movies: a collection');
  T.eq(kind('/continue-watching'), 'grid', 'Dropout\'s Continue Watching, in full: a collection');
  T.eq(kind('/movies-and-more'), 'series', 'a one-word address that only starts the same is still a show');
  T.eq(kind('/products'), 'series', 'the store: not drawn by Leanback, by design');
  T.eq(kind('/game-changer'), 'series');
  T.eq(kind('/game-changer/'), 'series');
  T.eq(kind('/game-changer/season:3'), 'series');
  T.eq(kind('/game-changer/season:1/videos/whodunnit'), 'video');
  T.eq(kind('/game-changer/videos/game-changer-promo'), 'video');
  T.eq(kind('/videos/game-changer-promo'), 'video');
  T.eq(kind('/search'), 'search');
  T.eq(kind('/search/'), 'search');
});

T.run('account and help pages are "other", not a series', () => {
  for (const p of ['/checkout/subscribe', '/contact/support', '/terms', '/settings', '/purchases', '/forgot', '/register', '/help']) T.eq(kind(p), 'other', p);
});

T.run('sign-in, the password reset and the profile picker have kinds of their own', () => {
  T.eq([kind('/login'), kind('/forgot_password'), kind('/profile/pick'), kind('/logout')], ['signin', 'reset', 'profiles', 'other']);
  T.eq([kind('/'), kind('/privacy'), kind('/tos'), kind('/cookies'), kind('/help')], ['welcome', 'legal', 'legal', 'legal', 'other'], 'the welcome and the policies; help stays Dropout\'s');
  T.eq([kind('/settings/manage/profile'), kind('/settings/manage/profile-lock'), kind('/settings')], ['profileEdit', 'other', 'other'], 'Edit Profile; the rest of the settings stay Dropout\'s');
});

T.run('the series route stays last (catch-all) and a video path never falls through to it', () => {
  T.eq(rules.routes.at(-1).kind, 'series');
  T.ok(rules.routes.findIndex((r) => r.kind === 'video') < rules.routes.findIndex((r) => r.kind === 'series'));
});

T.run('unknown shapes are other; broken input never throws', () => {
  T.eq(kind('/a/b/c/d'), 'other');
  T.eq(R.classify(null, '/browse'), 'other');
  T.eq(R.classify({ routes: [{ kind: 'x', path: '(' }, { kind: 'browse', path: '^/browse' }] }, '/browse'), 'browse', 'a bad regex is skipped');
  T.eq(R.classify(rules, undefined), 'other');
});

T.run('pageRules returns an object for every kind, {} for unknown', () => {
  for (const k of ['browse', 'grid', 'series', 'video', 'search', 'other']) T.ok(typeof R.pageRules(rules, k) === 'object', k);
  T.eq(R.pageRules(rules, 'nope'), {});
  T.eq(R.pageRules(null, 'browse'), {});
});

T.run('selector helpers flatten strings and arrays', () => {
  T.eq(R.selectorList('a'), ['a']);
  T.eq(R.selectorList(['a', ' ', 'b']), ['a', 'b']);
  T.eq(R.selectorList(undefined), []);
  T.eq(R.selector(['a', 'b']), 'a, b');
  T.eq(R.selector(''), null);
});

T.run('every page kind that has tiles has a target; browse has rows', () => {
  for (const k of ['grid', 'series', 'search', 'video']) T.ok(rules.pages[k].tile && rules.pages[k].target, k);
  T.ok(rules.pages.browse.rows && rules.pages.browse.rowItem && rules.pages.browse.target);
  T.ok(rules.pages.video.playerMount && rules.pages.video.playerFrame && rules.pages.video.theaterRoot);
  T.ok(!/js-load-more-items-container a\b/.test(rules.pages.series.loadMore), 'load-more must not match tile links');
});

T.run('a show\'s page: the three layouts, what readDetail reads, and the buttons the remote must reach', () => {
  const series = rules.pages.series;
  T.eq(Object.keys(series.show.layouts), ['show', 'special', 'list']);
  for (const sel of ['a.custom-btn-action-primary', 'a.custom-btn-action-trailer', 'button.custom-btn-action-my-list']) T.ok(series.focusable.includes(sel), sel);
  for (const k of ['seasonSelect', 'episodeCount', 'episodes', 'episode', 'episodeLink', 'episodeProgress', 'primaryAction']) T.ok(typeof series.show[k] === 'string' && series.show[k], k);
});

await T.exit();
