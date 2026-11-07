// content/page.js on Dropout 24/7: the stream played on its own page (content/page-live.js).
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, boot, watch, firefoxBack, HUB, EVENT, STREAM, servesStream } from './page-support.mjs';

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

T.runAsync("Dropout 24/7 from My List (/events/dropout-24-7, an address no hub is in) goes on to Dropout 24/7's page", async () => {
  const p = await boot({ html: '<!doctype html><html><body class="logged-in live-events"><section id="live-event"></section></body></html>', url: 'https://watch.dropout.tv/events/dropout-24-7' });
  T.eq((await p.state()).navigation, 'https://watch.dropout.tv/dropout-24-7');
  const hub = await boot({ html: '<!doctype html><html><body class="logged-in"></body></html>', url: 'https://watch.dropout.tv/dropout-247/events/dropout-24-7' });
  T.eq((await hub.state()).navigation, null, "the stream's own page, reached from the hub, stays");
});

await T.exit();
