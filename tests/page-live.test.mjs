// content/page.js on Dropout 24/7: the stream played on its own page (content/page-live.js).
import { T, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';
import { rules, fixture, FILES, URLS, boot, watch, firefoxBack, HUB, EVENT, STREAM, servesStream, box } from './page-support.mjs';

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
  const dom = makeDom({ clock: true, html: fixture('browse.html'), url: URLS.browse, browser: shim.browser });
  dom.runScripts(FILES);
  await T.sleep(40);
  T.eq(dom.document.documentElement.dataset.tenfoot, 'off');
  T.eq(dom.document.activeElement, dom.document.body);
});

T.runAsync("Dropout 24/7 from My List (/events/dropout-24-7, an address no hub is in) goes on to Dropout 24/7's page", async () => {
  const p = await boot({ html: '<!doctype html><html><body class="logged-in live-events"><section id="live-event"></section></body></html>', url: 'https://watch.dropout.tv/events/dropout-24-7' });
  T.eq((await p.state()).navigation, 'https://watch.dropout.tv/dropout-24-7');
  const hub = await boot({ html: '<!doctype html><html><body class="logged-in"></body></html>', url: 'https://watch.dropout.tv/dropout-247/events/dropout-24-7' });
  T.eq((await hub.state()).navigation, null, "the stream's own page, reached from the hub, stays");
});

await T.exit();
