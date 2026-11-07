// content/player.js: captions, through the player's own menu.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot, realMenu, openCaptions, at } from './player-support.mjs';

T.runAsync('captions are a row of the player\'s own, because that is where they live', async () => {
  const { key, win } = await boot();
  // The real popover holds exactly three entries — Quality, Speed and
  // CC/subtitles — and the caption font, background and window options are
  // inside CC/subtitles, not beside it. Rows of our own for them matched
  // nothing and never could.
  const menu = win.document.querySelector('.vp-menu [role="menu"]');
  const labels = [...menu.querySelectorAll("[class*='MenuItem_module_label']")];
  T.eq(labels.map((l) => l.textContent), ['Quality', 'Speed', 'CC/subtitles'], 'the fixture mirrors the real popover');
  const cc = labels[2].closest('[data-menu-item="true"]');
  cc.addEventListener('click', () => {
    const body = win.document.querySelector('.vp-menu [role="menu"]');
    while (body.firstChild) body.removeChild(body.firstChild);
    for (const label of ['Off', 'English', 'Font', 'Background', 'Window']) {
      const row = win.document.createElement('div');
      row.setAttribute('role', 'menuitem');
      row.dataset.menuItem = 'true';
      if (label === 'Off') row.setAttribute('aria-checked', 'true');
      const t = win.document.createElement('span');
      t.className = 'Text_module_text__73112353';
      t.textContent = label;
      row.appendChild(t);
      body.appendChild(row);
    }
  });
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  const rows = () => [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  T.ok(rows().includes('Closed Captions'), 'the row is there: ' + rows().join(' | '));
  // Walk to it and open it: the player's caption options, in our own list.
  for (let i = 0; i < 2; i += 1) key('ArrowDown');
  T.eq(panel.querySelector('[data-tenfoot-current="true"]').querySelector('.tenfoot-settings-label').textContent, 'Closed Captions');
  key('ArrowRight');
  await T.sleep(260);
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Closed Captions', 'the submenu is titled');
  T.eq(rows(), ['Off', 'English', 'Font', 'Background', 'Window'],
    'and holds what the player offers, appearance included: ' + rows().join(', '));
});

T.runAsync('"the site\'s own" hands the player its controls back and draws nothing of ours', async () => {
  const { key, win, last } = await boot({ settings: { playerChrome: 'site' } });
  await T.sleep(150);
  T.notOk(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-bar'), 'the control bar is not hidden');
  T.notOk(win.document.querySelector("[class*='PlayButton_module_playButtonWrapper__']").hasAttribute('data-tenfoot-bar'), 'nor the overlay play button');
  T.notOk(win.document.getElementById('pip-control-bar-button').hasAttribute('data-tenfoot-hide'), 'nothing in the bar is stamped away');
  key('ArrowDown');
  await T.sleep(10);
  T.notOk(win.document.querySelector('.tenfoot-transport'), 'no bar of ours was built');
  T.eq(last('page:focus').hint, 'below', 'and ▼ goes to the page, as it did before there was a bar');
  key('ContextMenu');
  await T.sleep(10);
  T.eq(last('page:action').action, 'menu', 'the options button goes back to the page too');
});

T.runAsync('switching back to Leanback\'s controls takes effect without a reload', async () => {
  const { key, win, shim } = await boot({ settings: { playerChrome: 'site' } });
  await T.sleep(120);
  T.notOk(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-bar'));
  shim.store.settings = { ...(shim.store.settings || {}), playerChrome: 'leanback' };
  await shim.changeStorage({ settings: { newValue: shim.store.settings } });
  await T.sleep(150);
  T.ok(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-bar'), 'the player chrome is hidden again');
  key('ArrowDown');
  T.notOk(win.document.querySelector('.tenfoot-transport').hidden, 'and our bar opens');
});

T.runAsync('the panel does not lose the player\'s rows to one unlucky read', async () => {
  const { key, win } = await boot();
  const menu = win.document.querySelector('.vp-menu');
  const body = menu.querySelector('[role="menu"]');
  const real = [...body.children];
  // The player's menu is busy the first time it is asked — something else
  // driving it, or a re-render mid-click — and comes back a moment later.
  body.replaceChildren();
  win.setTimeout(() => body.replaceChildren(...real), 120);
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(700);
  const rows = [...win.document.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  T.ok(rows.includes('Quality') && rows.includes('Speed') && rows.includes('Closed Captions'),
    'the second read got them: ' + rows.join(' | '));
});

T.runAsync('captions go as deep as the player\'s menu: CC/subtitles → Customize → Font (B2)', async () => {
  const t = await boot();
  const c = await openCaptions(t);
  T.eq(c.title(), 'Closed Captions');
  T.eq(c.labels(), ['Off', 'English CC', 'Customize']);
  c.walkTo('Customize');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.title(), 'Customize', 'OK on a submenu goes into it instead of bouncing back');
  T.eq(c.labels(), ['Font', 'Background', 'Window', 'Reset all']);
  c.walkTo('Font');
  t.key('ArrowRight');
  await T.sleep(300);
  T.eq(c.title(), 'Font', '▶ goes in too');
  // Each set of options (Color, Size) and each accordion (Family) is one
  // entry, showing its current choice; its choices are a level of their own.
  T.eq(c.labels(), ['Family', 'Color', 'Size'], c.labels().join(' | '));
  const values = [...c.panel.querySelectorAll('.tenfoot-settings-item')].map((b) => b.querySelector('.tenfoot-settings-value').textContent);
  T.eq(values, ['Proportional Sans-Serif', 'White', '100%'], 'each shows its current choice');
  T.eq(c.panel.querySelectorAll('.tenfoot-settings-group').length, 0, 'no headings over a long flat list');
});

T.runAsync('a caption colour is a submenu of its own: OK opens "Font Color", OK on a colour presses the player\'s and comes back up; an accordion too (the owner, 2026-10-03)', async () => {
  const t = await boot();
  const c = await openCaptions(t);
  c.walkTo('Customize');
  t.key('Enter');
  await T.sleep(300);
  t.key('Enter'); // Font
  await T.sleep(300);
  c.walkTo('Color');
  t.key('Enter');
  await T.sleep(50);
  T.eq([c.title(), c.labels(), c.current()], ['Font Color', ['White', 'Yellow'], 'White'], 'its choices, the current one selected');
  const ticked = () => [...c.panel.querySelectorAll('.tenfoot-settings-item')].filter((b) => b.querySelector('.tenfoot-settings-mark svg')).map((b) => b.querySelector('.tenfoot-settings-label').textContent);
  T.eq(ticked(), ['White'], 'and ticked');
  t.key('ArrowDown');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.menu.color, 'Yellow', 'the player\'s own swatch was pressed');
  T.eq([c.title(), c.current()], ['Font', 'Color'], 'back up, on Color');
  const color = [...c.panel.querySelectorAll('.tenfoot-settings-item')].find((b) => b.querySelector('.tenfoot-settings-label').textContent === 'Color');
  T.eq(color.querySelector('.tenfoot-settings-value').textContent, 'Yellow', 'showing the new colour');
  c.walkTo('Size');
  t.key('Enter');
  await T.sleep(50);
  T.eq([c.title(), c.labels()], ['Font Size', ['50%', '100%', '150%']]);
  t.key('ArrowLeft');
  await T.sleep(50);
  T.eq([c.title(), c.current(), c.menu.backs], ['Font', 'Size', 0], '◀ back up, without touching the player\'s menu');
  c.walkTo('Family');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.title(), 'Font Family', 'the accordion opened in the player, then as a level of its own');
  T.eq(c.labels(), ['Monospace Serif', 'Proportional Sans-Serif']);
  T.eq(c.current(), 'Proportional Sans-Serif');
  t.key('ArrowLeft');
  await T.sleep(50);
  T.eq([c.title(), c.labels()], ['Font', ['Family', 'Color', 'Size']], 'its options stay out of the Font list');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.title(), 'Font Family', 'open already: straight in, not shut by a second click');
});

T.runAsync('◀ uses the player\'s own Back, one level at a time (B3)', async () => {
  const t = await boot();
  const c = await openCaptions(t);
  c.walkTo('Customize');
  t.key('Enter');
  await T.sleep(300);
  t.key('Enter'); // Font
  await T.sleep(300);
  T.eq(c.title(), 'Font');
  t.key('ArrowLeft');
  await T.sleep(300);
  T.eq(c.title(), 'Customize');
  t.key('Escape');
  await T.sleep(300);
  T.eq(c.title(), 'Closed Captions', 'Back works the same as ◀');
  t.key('ArrowLeft');
  await T.sleep(300);
  T.eq(c.title(), 'Playback Settings');
  T.eq(c.menu.backs, 3, 'every step was the player\'s own Back button');
  T.eq(c.menu.path, [], 'and the player\'s menu is at its root again');
});

T.runAsync('picking a caption track goes back up the way the player does, with the switch showing it', async () => {
  const t = await boot();
  const c = await openCaptions(t);
  c.walkTo('English CC');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.title(), 'Playback Settings', 'the player returned to its root, and so did the panel');
  const cc = [...c.panel.querySelectorAll('.tenfoot-settings-item')].find((b) => b.querySelector('.tenfoot-settings-label').textContent === 'Closed Captions');
  T.eq(cc.getAttribute('aria-checked'), 'true', 'captions on');
});

T.runAsync('Closed Captions is a switch: OK turns the player\'s first track on, and off again (C3)', async () => {
  const t = await boot();
  const menu = realMenu(t.win);
  t.key('ArrowDown');
  t.key('ArrowRight');
  t.key('Enter');
  await T.sleep(150);
  const panel = t.win.document.querySelector('.tenfoot-settings');
  const cc = () => [...panel.querySelectorAll('.tenfoot-settings-item')].find((b) => b.querySelector('.tenfoot-settings-label').textContent === 'Closed Captions');
  T.eq([cc().dataset.tenfootKind, cc().getAttribute('aria-checked')], ['toggle', 'false']);
  for (let i = 0; i < 2; i += 1) t.key('ArrowDown');
  t.key('Enter');
  await T.sleep(700);
  T.eq(menu.track, 'English CC', 'the player\'s own track was picked');
  T.eq(cc().getAttribute('aria-checked'), 'true');
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Playback Settings', 'and the panel stayed where it was');
  T.eq(panel.querySelector('[data-tenfoot-current="true"] .tenfoot-settings-label').textContent, 'Closed Captions');
  t.key('Enter');
  await T.sleep(700);
  T.eq([menu.track, cc().getAttribute('aria-checked')], ['Off', 'false'], 'and off again');
  T.eq(menu.path, [], 'the player\'s menu back at its root');
});

T.runAsync('OK held down (key repeat) toggles the captions once, not once per repeat', async () => {
  const t = await boot();
  const menu = realMenu(t.win);
  t.key('ArrowDown');
  t.key('ArrowRight');
  t.key('Enter');
  await T.sleep(150);
  for (let i = 0; i < 2; i += 1) t.key('ArrowDown');
  for (let i = 0; i < 5; i += 1) t.key('Enter', { repeat: i > 0 });
  await T.sleep(1200);
  T.eq(menu.track, 'English CC', 'on, and left on: the repeats arrived while the player was still answering');
  t.key('Enter');
  await T.sleep(800);
  T.eq(menu.track, 'Off', 'a fresh press afterwards works');
});

T.runAsync('Caption Style goes straight to the player\'s Customize, and ◀ comes straight back (C3)', async () => {
  const t = await boot();
  const menu = realMenu(t.win);
  t.key('ArrowDown');
  t.key('ArrowRight');
  t.key('Enter');
  await T.sleep(150);
  const panel = t.win.document.querySelector('.tenfoot-settings');
  const title = () => panel.querySelector('.tenfoot-settings-title').textContent;
  const labels = () => [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  for (let i = 0; i < 3; i += 1) t.key('ArrowDown');
  T.eq(panel.querySelector('[data-tenfoot-current="true"] .tenfoot-settings-label').textContent, 'Caption Style');
  t.key('Enter');
  await T.sleep(700);
  T.eq(title(), 'Caption Style');
  T.eq(labels(), ['Font', 'Background', 'Window', 'Reset all']);
  t.key('ArrowLeft');
  await T.sleep(700);
  T.eq(title(), 'Playback Settings', 'one ◀, all the way back');
  T.eq([menu.backs, menu.path], [2, []], 'the player\'s own Back, twice');
});

await T.exit();
