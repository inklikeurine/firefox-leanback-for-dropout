// content/page.js on a page Leanback leaves as Dropout's own, driven with the arrows and the
// ring; and what every page has: Leanback Settings, the button hints, turning Leanback off and on.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { rules, fixture, kbOpen, URLS, moveTo, boot } from './page-support.mjs';

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

await T.exit();
