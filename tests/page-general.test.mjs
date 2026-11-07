// content/page.js: what every page has — Leanback Settings, the button hints,
// turning Leanback off and on, running twice — and a page Leanback does not
// recognise, where the ring follows whatever the page focuses.
import { T, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';
import { rules, fixture, kbOpen, FILES, URLS, moveTo, boot, watch, firefoxBack } from './page-support.mjs';

T.runAsync('a fresh install shows no button hints, but short notices still appear', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse, fresh: true });
  T.ok(p.hints().hidden, 'no hint bar from the start');
  p.key('ArrowRight');
  T.ok(p.hints().hidden, 'nor on a keypress');
  p.key('Escape');
  await T.sleep(10);
  T.notOk(p.hints().hidden, 'a notice is not a hint');
  T.ok(p.hints().textContent.includes('Nothing to go back to'), p.hints().textContent);
});

T.runAsync('the options panel has no "Player controls" row: that switch is on the options page only', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  await p.act('menu');
  T.notOk((await p.state()).menu.includes('playerChrome'), JSON.stringify((await p.state()).menu));
});

T.runAsync('the options button opens Leanback settings, and Back closes it', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  await p.act('menu');
  let s = await p.state();
  // The list itself is settings-menu.test.mjs's; here, what a page adds to it.
  T.eq(s.menu.indexOf('look'), s.menu.indexOf('theme') - 1, 'Theme This Page first under Look (Home has a look of its own)');
  T.eq(s.menu.slice(-2), ['menu:accessibility', 'forget'], 'then Accessibility and Clear Continue Watching');
  T.notOk(s.menu.includes('home') || s.menu.includes('search'), 'no Home or Search, which the rail does (C4)');
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
  T.eq([s.menu, s.focused.text], [null, 'Watch now'], 'closed, ring back where it was');
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
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  p.key('ContextMenu');
  const s = await p.state();
  T.ok(s.menu.includes('autoplayNext') && s.menu.includes('seekStep'),
    'straight into the settings, no action list first: ' + JSON.stringify(s.menu));
  T.eq(s.navigation, null, 'and nothing navigated');
});

T.runAsync('settings open inside the page — never in another tab', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  p.key('ContextMenu');
  let s = await p.state();
  T.ok(s.menu.includes('autoplayNext') && s.menu.includes('seekStep'), 'the settings list is the panel: ' + JSON.stringify(s.menu));
  T.eq(s.navigation, null, 'nothing navigated away');
  T.eq(p.bg.filter((m) => m.type === 'options:open').length, 0, 'and no request to open an options tab');
  p.key('Escape');
  T.eq((await p.state()).menu, null, 'back closes it — there is no list in between any more');
});

// How the menu moves is settings-menu.test.mjs's; here, what the page draws and saves.
T.runAsync('Leanback Settings on a page: a setting with several values has a chevron, opens a ticked list, and the value picked is saved and shown', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  p.key('ContextMenu');
  await moveTo(p, 'seekStep');
  const value = (id) => p.doc.querySelector(`[data-tenfoot-item="${id}"] .tenfoot-settings-value`).textContent;
  T.eq(value('seekStep'), '10 s');
  T.ok(p.doc.querySelector('[data-tenfoot-item="seekStep"] .tenfoot-settings-mark svg'), 'a chevron: it opens a list');
  p.key('ArrowRight');
  T.eq(p.doc.querySelector('.tenfoot-settings-title').textContent, 'Seek Step', '▶ opens it');
  T.eq(p.doc.querySelector('[aria-checked="true"]').dataset.tenfootItem, '10', 'the value in force is ticked');
  p.key('ArrowDown');
  p.key('Enter');
  await T.sleep(10);
  T.eq(p.shim.store.settings.seekStep, 15, 'OK saves the value');
  T.eq(value('seekStep'), '15 s', 'and the list shows it');
});

T.runAsync('Leanback Settings on a page: an on/off setting is drawn as a switch, and OK saves it and flips the switch', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  p.key('ContextMenu');
  await moveTo(p, 'skipMarketingSite');
  const item = () => p.doc.querySelector('[data-tenfoot-item="skipMarketingSite"]');
  T.eq([item().getAttribute('aria-checked'), item().querySelector('.tenfoot-switch').dataset.on], ['true', 'true']);
  p.key('Enter');
  await T.sleep(10);
  T.eq(p.shim.store.settings.skipMarketingSite, false);
  T.eq([item().getAttribute('aria-checked'), item().querySelector('.tenfoot-switch').dataset.on], ['false', 'false']);
  T.eq((await p.state()).menuItem, 'skipMarketingSite', 'and the selection stays');
});

T.runAsync('no letter key does anything on a page any more', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  for (const k of ['i', 'I', 'c', 'm', 'k', 'n', 'p', ' ', 'Backspace', 'PageDown', 'Home', 'BrowserHome']) {
    T.notOk(p.key(k).defaultPrevented, `"${k}" must not be handled`);
  }
  T.eq((await p.state()).focused.text, 'Watch now', 'and nothing moved');
});

T.runAsync('◀ closes Leanback settings, as Back does; inside a list it goes back up one level', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  await p.act('menu');
  T.ok((await p.state()).menu);
  T.ok(p.key('ArrowLeft').defaultPrevented);
  let s = await p.state();
  T.eq([s.menu, s.focused.text], [null, 'Watch now'], 'closed, ring back where it was');
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
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
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

T.runAsync('menu: the panel stays open and takes the focus back when the site steals it', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  await p.act('menu');
  let s = await p.state();
  T.ok(s.menu.includes('autoplayNext'), 'the settings list opened: ' + JSON.stringify(s.menu));
  // Dropout re-renders and pulls the focus into its own DOM. Closing on that
  // is what made the settings panel shut itself the instant it opened.
  p.doc.querySelector('#browse-component a[href]').focus();
  s = await p.state();
  T.ok(s.menu && s.menu.includes('autoplayNext'), 'still open: ' + JSON.stringify(s.menu));
  T.eq(p.doc.activeElement.dataset.tenfootItem, 'autoplayNext', 'and the focus came back to the panel');
  // A trap that keeps taking it does not become an infinite fight.
  for (let i = 0; i < 12; i += 1) p.doc.querySelector('#browse-component a[href]').focus();
  T.ok((await p.state()).menu.includes('autoplayNext'), 'the panel survives a focus trap too');
});

T.runAsync('menu: the selection is stamped on the element, not read from :focus', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  await p.act('menu');
  const current = () => Array.from(p.doc.querySelectorAll('[data-tenfoot-current="true"]')).map((b) => b.dataset.tenfootItem);
  T.eq(current(), ['autoplayNext'], 'the first item is marked');
  p.key('ArrowDown');
  T.eq(current(), ['seekStep'], 'exactly one item carries the mark');
});

T.runAsync('Cookie Preferences in Leanback\'s settings presses Dropout\'s own "Manage Cookie Preferences" (its footer is hidden), the panel closing first', async () => {
  const html = fixture('home.html').replace('</body>', '<footer class="footer--site"><a class="site-font-secondary-color legal-link manage-cookies-link" href="#" data-rect="10,1000,160,20">Manage Cookie Preferences</a></footer></body>');
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
  const html = fixture('home.html').replace('<body', '<body data-x').replace(/<body([^>]*)>/, '<body$1><div class="promo-banner"><a class="promo-banner-text" href="/checkout">GET 20% OFF YOUR FIRST YEAR!</a></div>');
  const p = await boot({ html, url: URLS.browse });
  T.eq(p.win.getComputedStyle(p.doc.querySelector('.promo-banner')).display, 'none');
  T.ok(p.doc.getElementById('tenfoot-site-style').textContent.includes('.promo-banner'));
});

T.runAsync('the on-screen keyboard\'s line of keys follows Button Hints: off, on, off again without reopening it', async () => {
  const p = await boot({ html: fixture('search.html'), url: URLS.search, settings: { hintBar: false } });
  const hint = p.doc.querySelector('.tenfoot-kb-hint');
  T.ok(kbOpen(p), 'the keyboard is up on search');
  T.eq(hint.hidden, true, 'hints off: no line along its foot');
  await p.shim.changeStorage({ settings: { newValue: { hintBar: true } } });
  await T.sleep(5);
  T.eq(hint.hidden, false, 'turned on: there at once');
  await p.shim.changeStorage({ settings: { newValue: { hintBar: false } } });
  await T.sleep(5);
  T.eq(hint.hidden, true, 'turned off: gone at once');
});

T.runAsync('the hint bar stays up on a page, and gets out of the way while a video plays', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
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

T.runAsync('toggle off via storage: ring and hints gone, keys untouched; on again re-initialises', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
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
  T.eq((await p.state()).focused.text, 'Watch now');
  T.ok(p.key('ArrowRight').defaultPrevented);
});

T.runAsync('settings: ring style and hint bar follow storage; exit hint reflects the exit hook', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse, settings: { ringColor: '#112233', ringWidth: 6, hintBar: false, exitHook: 'close-tab' } });
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
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  T.eq((await p.msg({ type: 'nope' })).ok, false);
  T.eq((await p.msg(null)).ok, false);
  T.eq((await p.act('right')).focused.text, '›');
  T.eq((await p.act('bogus')).consumed, false);
});

T.runAsync('a second injection is a no-op; the rules failing to load leaves the page alone', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  const n = p.shim.listeners.message.length;
  p.dom.runScripts(FILES);
  await T.sleep(20);
  T.eq(p.shim.listeners.message.length, n);
  const shim = makeBrowserShim();
  shim.browser.runtime.onMessage.addListener((m, s, send) => { send({ ok: false, error: 'nope' }); return false; });
  const dom = makeDom({ clock: true, html: fixture('home.html'), url: URLS.browse, browser: shim.browser });
  dom.runScripts(FILES);
  await T.sleep(40);
  T.eq(dom.document.documentElement.dataset.tenfoot, 'off');
  T.eq(dom.document.activeElement, dom.document.body);
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

await T.exit();
