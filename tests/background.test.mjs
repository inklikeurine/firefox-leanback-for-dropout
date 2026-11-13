// background.js — rules service, player-frame registry in storage.session,
// page ⇄ player relay, toolbar/command toggle with badge, exit hook, and the
// watch history (the background is its only writer).
import fs from 'node:fs';
import { T, loadScripts, makeBrowserShim } from '../../firefox-tools/harness/lib.mjs';

const rulesJson = fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8');
// Exactly the scripts the manifest loads into the background, in order.
const BG_FILES = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8')).background.scripts.map((f) => T.extFile(f));

function boot({ storage = {}, installType = 'normal' } = {}) {
  const shim = makeBrowserShim({ tabs: [{ id: 1, url: 'https://watch.dropout.tv/browse', active: true }, { id: 2, url: 'https://watch.dropout.tv/x' }], storage });
  shim.browser.management = { getSelf: async () => ({ installType }) };
  const fetches = [];
  const fetch = async (url) => { fetches.push(url); return { ok: true, json: async () => JSON.parse(rulesJson) }; };
  const ctx = loadScripts(BG_FILES, { browser: shim.browser, fetch });
  const page = []; const player = [];
  shim.attachContent(1, (m, s, send) => { page.push(m); send({ ok: true, page: true, got: m.type }); return false; }, 0);
  shim.attachContent(1, (m, s, send) => { player.push(m); send({ ok: true, player: true, got: m.type, state: { paused: true } }); return false; }, 7);
  const from = (tabId, frameId) => ({ tab: { id: tabId }, frameId, id: 'self' });
  const send = (m, sender = from(1, 0)) => shim.sendToBackground(m, sender);
  return { shim, ctx, fetches, page, player, send, from };
}

T.runAsync('rules:get serves sites/dropout.json once (cached)', async () => {
  const { send, fetches } = boot();
  const r = await send({ type: 'rules:get' });
  T.eq([r.ok, r.rules.site, r.rules.routes.length > 3], [true, 'dropout', true]);
  await send({ type: 'rules:get' });
  T.eq(fetches.length, 1);
  T.ok(fetches[0].endsWith('/sites/dropout.json'));
});

T.runAsync('settings:get / settings:set go through the shared normaliser', async () => {
  const { send, shim } = boot();
  T.eq((await send({ type: 'settings:get' })).settings.seekStep, 10);
  const r = await send({ type: 'settings:set', patch: { seekStep: 30, exitHook: 'bogus' } });
  T.eq([r.settings.seekStep, r.settings.exitHook], [30, 'close-tab'], 'nonsense: the default (a signed copy closes the tab)');
  T.eq(shim.store.settings.seekStep, 30);
});

T.runAsync('player:hello registers the frame in storage.session and tells the page', async () => {
  const { send, from, shim, page, ctx } = boot();
  const r = await send({ type: 'player:hello', videoId: '612228', title: 'Ep' }, from(1, 7));
  T.eq(r, { ok: true, tabId: 1, frameId: 7 });
  T.eq(shim.sessionStore.players, { 1: 7 });
  T.eq(await ctx.playerFrameOf(1), 7);
  await T.sleep(5);
  T.eq(page.at(-1).type, 'player:ready');
  T.eq([page.at(-1).frameId, page.at(-1).videoId], [7, '612228']);
});

T.runAsync('player:command / player:focus relay to the registered frame and return its reply', async () => {
  const { send, from, player } = boot();
  await send({ type: 'player:hello' }, from(1, 7));
  const r = await send({ type: 'player:command', cmd: 'toggle' }, from(1, 0));
  T.eq([r.ok, r.player, r.got], [true, true, 'player:command']);
  T.eq(player.at(-1), { type: 'player:command', cmd: 'toggle' });
  T.eq((await send({ type: 'player:focus' }, from(1, 0))).got, 'player:focus');
});

T.runAsync('relay without a registered player answers ok:false, never hangs', async () => {
  const { send, from } = boot();
  const r = await send({ type: 'player:command', cmd: 'toggle' }, from(2, 0));
  T.eq(r.ok, false);
  T.ok(/No player frame/.test(r.error), r.error);
  const r2 = await send({ type: 'player:command', cmd: 'toggle' }, { id: 'popup' });
  T.eq(r2.ok, false, 'not from a tab');
});

T.runAsync('a stale registry entry is dropped when the frame is gone', async () => {
  const { send, from, ctx } = boot();
  await send({ type: 'player:hello' }, from(1, 9)); // no handler attached for frame 9
  const r = await send({ type: 'player:command', cmd: 'toggle' }, from(1, 0));
  T.eq(r.ok, false);
  T.eq(await ctx.playerFrameOf(1), null, 'forgotten after "receiving end does not exist"');
});

T.runAsync('player → page messages relay to frame 0 of the same tab', async () => {
  const { send, from, page } = boot();
  for (const m of [{ type: 'player:state', state: { paused: false } }, { type: 'player:ended', upNext: null }, { type: 'page:focus', hint: 'below' }, { type: 'page:episode', delta: 1 }, { type: 'page:action', action: 'home' }, { type: 'page:info' }]) {
    const r = await send(m, from(1, 7));
    T.eq([r.ok, r.page, r.got], [true, true, m.type], m.type);
  }
  T.eq(page.length, 6, 'page:info too: the player asking for its title');
});

T.runAsync('tabs.onRemoved forgets the frame', async () => {
  const { send, from, ctx, shim } = boot();
  await send({ type: 'player:hello' }, from(1, 7));
  T.eq(await ctx.playerFrameOf(1), 7);
  await shim.removeTab(1);
  await T.sleep(5);
  T.eq(await ctx.playerFrameOf(1), null);
});

T.runAsync('the shortcut toggles enabled; the badge follows storage.onChanged', async () => {
  const { shim, ctx } = boot();
  await T.sleep(5);
  T.eq(shim.calls.filter((c) => c.api === 'browserAction.setBadgeText').at(-1).args[0].text, '', 'on at start');
  await shim.listeners.command[0].fn('toggle-tv-mode');
  await T.sleep(5);
  T.eq(shim.store.settings.enabled, false);
  await shim.changeStorage({ settings: { newValue: shim.store.settings } });
  await T.sleep(5);
  T.eq(shim.calls.filter((c) => c.api === 'browserAction.setBadgeText').at(-1).args[0].text, 'OFF');
  T.ok(/off/.test(shim.calls.filter((c) => c.api === 'browserAction.setTitle').at(-1).args[0].title));
  await shim.listeners.command[0].fn('toggle-tv-mode');
  await T.sleep(5);
  T.eq(shim.store.settings.enabled, true);
  await shim.listeners.command[0].fn('something-else');
  await T.sleep(5);
  T.eq(shim.store.settings.enabled, true, 'unknown command ignored');
  T.eq((await ctx.toggleEnabled()).enabled, false);
});

T.runAsync('exit hook: none does nothing; close-tab removes the sender tab', async () => {
  const { send, from, shim } = boot();
  await send({ type: 'settings:set', patch: { exitHook: 'none' } });
  T.eq(await send({ type: 'exit' }, from(1, 0)), { ok: true, action: 'none' });
  T.eq(shim.callsTo('tabs.remove').length, 0);
  await send({ type: 'settings:set', patch: { exitHook: 'close-tab' } });
  T.eq(await send({ type: 'exit' }, from(1, 0)), { ok: true, action: 'close-tab' });
  T.eq(shim.callsTo('tabs.remove').at(-1).args, [1]);
  T.eq(await send({ type: 'exit' }, { id: 'popup' }), { ok: true, action: 'none' }, 'no tab to close');
  // Forced (the page cannot be used, signed out): the tab closes whatever the setting says.
  await send({ type: 'settings:set', patch: { exitHook: 'none' } });
  const before = shim.callsTo('tabs.remove').length;
  T.eq(await send({ type: 'exit', force: true }, from(1, 0)), { ok: true, action: 'close-tab' });
  T.eq(shim.callsTo('tabs.remove').length, before + 1, 'Back On Home: Does nothing, and it closed all the same');
  T.eq(await send({ type: 'exit', force: true }, { id: 'popup' }), { ok: true, action: 'none' }, 'still no tab, nothing to close');
  T.eq(await send({ type: 'exit', force: 'yes' }, from(1, 0)), { ok: true, action: 'none' }, 'only a real true forces it');
});

T.runAsync('Back On Home follows how Leanback was installed until it is picked: nothing from its folder, closing the tab when signed', async () => {
  const dev = boot({ installType: 'development' });
  await T.sleep(20);
  T.eq([dev.shim.store.settings.development, (await dev.send({ type: 'settings:get' })).settings.exitHook], [true, 'none']);
  T.eq(await dev.send({ type: 'exit' }, dev.from(1, 0)), { ok: true, action: 'none' });
  const signed = boot();
  await T.sleep(20);
  T.eq((await signed.send({ type: 'settings:get' })).settings.exitHook, 'close-tab');
  T.notOk(signed.shim.store.settings, 'nothing written when it is already so');
  const picked = boot({ installType: 'development', storage: { settings: { exitHook: 'close-tab', exitHookSet: true } } });
  await T.sleep(20);
  T.eq((await picked.send({ type: 'settings:get' })).settings.exitHook, 'close-tab', 'a picked one stays');
});

T.runAsync('every message is answered', async () => {
  const { send } = boot();
  T.eq((await send({ type: 'nope' })).ok, false);
  T.eq((await send({})).ok, false);
  T.eq((await send(null)).ok, false);
  T.eq(await send('str'), { ok: false, error: 'Invalid message' });
});

T.runAsync('rules:get reports a broken rules file instead of throwing', async () => {
  const shim = makeBrowserShim();
  const fetch = async () => ({ ok: false, status: 404 });
  loadScripts([T.extFile('lib/settings.js'), T.extFile('background.js')], { browser: shim.browser, fetch });
  const r = await shim.sendToBackground({ type: 'rules:get' });
  T.eq(r.ok, false);
  T.ok(/404/.test(r.error));
});

T.runAsync('watch history: progress, meta and Dropout’s bars land in storage.local "progress:0" (the first profile); reports sent together all land', async () => {
  const { send, shim, from } = boot();
  const url = 'https://watch.dropout.tv/game-changer/season:1/videos/lie-detector-1';
  await Promise.all([
    send({ type: 'history:progress', key: 'lie-detector-1', position: 300, duration: 1500 }, from(1, 7)),
    send({ type: 'history:meta', url, title: 'Lie Detector', series: 'Game Changer', image: 'https://vhx.imgix.net/a.jpg' }),
    send({ type: 'history:observe', items: [{ key: 'roku-ep', url: 'https://watch.dropout.tv/videos/roku-ep', percent: 40, duration: 1200 }] })
  ]);
  const e = shim.store['progress:0'].entries;
  T.eq(Object.keys(e).sort(), ['lie-detector-1', 'roku-ep'], 'none of the three overwrote another');
  T.eq([e['lie-detector-1'].local.position, e['lie-detector-1'].series, e['lie-detector-1'].url], [300, 'Game Changer', url]);
  T.eq(e['roku-ep'].dropout.percent, 40);
  T.notOk(shim.store.settings, 'settings untouched');
  const r = await send({ type: 'history:clear' });
  T.eq(r.ok, true);
  T.eq(Object.keys(shim.store['progress:0'].entries), ['roku-ep'], 'Leanback’s own reading is gone; Dropout’s bar is kept, as Dropout’s');
  T.ok(shim.store['progress:0'].clearedAt > 0, 'with the moment it was forgotten');
  await send({ type: 'history:progress', key: 'x', position: 100, duration: 1000 });
  T.eq(Object.keys(shim.store['progress:0'].entries).sort(), ['roku-ep', 'x'], 'and writing works again afterwards');
});

T.runAsync('each profile has its own history: a tab\'s writes go to the profile its page said, the player frame\'s too', async () => {
  const { send, shim, from } = boot();
  T.eq(await send({ type: 'profile:current', profile: 1 }, from(1, 0)), { ok: true, profile: 1, claimed: false });
  await send({ type: 'profile:current', profile: 0 }, from(2, 0));
  await send({ type: 'history:progress', key: 'mine', position: 300, duration: 1500 }, from(1, 7));
  await send({ type: 'history:progress', key: 'theirs', position: 300, duration: 1500 }, from(2, 3));
  T.eq(Object.keys(shim.store['progress:1'].entries), ['mine'], 'tab 1, its player frame: profile 1');
  T.eq(Object.keys(shim.store['progress:0'].entries), ['theirs'], 'tab 2: profile 0');
  T.eq((await send({ type: 'profile:get' }, from(1, 7))).profile, 1, 'the player frame asks for its tab\'s');
  await send({ type: 'history:clear' }, from(2, 0));
  T.eq(Object.keys(shim.store['progress:1'].entries), ['mine'], 'Clear Continue Watching clears the one profile');
  await shim.removeTab(1);
  T.eq((await send({ type: 'profile:get' }, from(1, 7))).profile, 0, 'a closed tab is forgotten');
});

T.runAsync('Clear Progress on one video: the tab profile’s entry, nothing else; anything odd is refused', async () => {
  const { send, shim, from } = boot();
  await send({ type: 'profile:current', profile: 1 }, from(1, 0));
  await send({ type: 'history:progress', key: 'a', position: 300, duration: 1500 }, from(1, 7));
  await send({ type: 'history:progress', key: 'b', position: 300, duration: 1500 }, from(1, 7));
  T.eq((await send({ type: 'history:forget', key: 'a' }, from(1, 0))).ok, true);
  const e = shim.store['progress:1'].entries;
  T.eq([e.a.local, typeof e.a.clearedAt, e.b.local.position], [undefined, 'number', 300]);
  T.eq((await send({ type: 'history:forget', key: '../x' }, from(1, 0))).ok, false, 'not a video key');
  T.eq((await send({ type: 'history:forget', key: 'b' }, { id: 'self' })).ok, false, 'from no tab: which profile?');
});

T.runAsync('Clear Continue Watching from the options page (no tab) clears every profile', async () => {
  const { send, shim, from } = boot();
  await send({ type: 'profile:current', profile: 1 }, from(1, 0));
  await send({ type: 'history:progress', key: 'a', position: 300, duration: 1500 }, from(1, 7));
  await send({ type: 'history:progress', key: 'b', position: 300, duration: 1500 }, from(2, 3));
  await send({ type: 'history:clear' }, { id: 'self' });
  T.eq([Object.keys(shim.store['progress:0'].entries), Object.keys(shim.store['progress:1'].entries)], [[], []]);
});

T.runAsync('the history from before profiles goes to the first profile that says it is watching', async () => {
  const old = { entries: { a: { url: 'https://watch.dropout.tv/videos/a', local: { position: 200, at: 1 } } } };
  const { send, shim, from } = boot({ storage: { progress: old } });
  const r = await send({ type: 'profile:current', profile: 2 }, from(1, 0));
  T.eq([r.ok, r.profile, r.claimed], [true, 2, true]);
  T.eq(Object.keys(shim.store['progress:2'].entries), ['a']);
  T.notOk('progress' in shim.store, 'gone from its old key');
  T.eq((await send({ type: 'profile:current', profile: 0 }, from(2, 0))).claimed, false, 'only once');
  T.notOk('progress:0' in shim.store);
});

T.runAsync('player:resumed goes to the page', async () => {
  const { send, from, page } = boot();
  const r = await send({ type: 'player:resumed', at: 724 }, from(1, 7));
  T.eq([r.ok, page.at(-1).type, page.at(-1).at], [true, 'player:resumed', 724]);
});

await T.exit();
