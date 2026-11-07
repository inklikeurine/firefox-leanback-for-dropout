// content/page.js on a show's page: drawn by Leanback (content/screen.js, read by content/show.js),
// its seasons and episodes, and the same page when Leanback does not recognise it.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { rules, fixture, URLS, boot, V, hrefNow, pillNow, actionNow, cardOf, unrecognised, SEASON3, watch, box } from './page-support.mjs';

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

T.runAsync('series (page not recognised): a select is not engaged until Enter, so Left/Right still carry the ring past it', async () => {
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

T.runAsync('show: the bare address opens on the newest season, replacing the page, and nothing is drawn meanwhile', async () => {
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

T.runAsync('show (drawn): the banner, the seasons newest first with the one on screen lit, its name and episode count over its episodes', async () => {
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

T.runAsync('show (drawn): ▲ from the episodes lands on the season on screen; ◀ ▶ walk the seasons without wrapping; ▲ the buttons; ▼ back where it was; OK opens a season in place of this one', async () => {
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

T.runAsync('show (drawn): My List presses Dropout\'s own button and shows when the show is on the list', async () => {
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

T.runAsync('show (drawn): the main button picks the show up — first of the buttons, yellow, OK plays it', async () => {
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

T.runAsync('show (drawn): the selection starts on the episode to watch next; watched episodes are ticked, one in progress has a bar', async () => {
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

await T.exit();
