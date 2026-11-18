// Remote Buttons (Accessibility, #16): teaching Leanback a button for a job —
// what can be taught (nav/keymap.js), how taught buttons are kept
// (lib/settings.js), the screens that teach them (nav/settings-menu.js), and
// the jobs, in the player and on a page.
import { T, loadScripts } from '../../firefox-tools/harness/lib.mjs';
import { boot as bootPlayer } from './player-support.mjs';
import { boot as bootPage, fixture, URLS } from './page-support.mjs';

const ctx = loadScripts([T.extFile('lib/settings.js'), T.extFile('nav/keymap.js'), T.extFile('nav/settings-menu.js')]);
const S = ctx.TenfootSettings;
const K = ctx.TenfootKeymap;

T.run('what can be taught: any button that does not type and is not the system\'s or the remote\'s own', () => {
  T.eq(K.learnable({ key: 'F2' }, {}), { ok: true, id: 'F2', name: 'F2' });
  T.eq(K.learnable({ key: 'ColorF0Red' }, {}).name, 'Red', 'a colour key, by its colour');
  T.eq(K.learnable({ key: 'Unidentified', code: 'Lang3' }, {}).id, 'code:Lang3', 'an unknown key by its code');
  T.eq(K.learnable({ key: 'a' }, {}).reason, 'typing', 'letters stay out: no keyboard shortcuts');
  T.eq(K.learnable({ key: '7' }, {}).reason, 'typing', 'and digits');
  T.eq(K.learnable({ key: 'Backspace' }, {}).reason, 'typing');
  T.eq(K.learnable({ key: 'BrowserHome' }, {}).reason, 'system');
  T.eq(K.learnable({ key: 'AudioVolumeUp' }, {}).reason, 'system');
  T.eq(K.learnable({ key: 'Shift' }, {}).reason, 'modifier');
  T.eq(K.learnable({ key: 'F2', ctrlKey: true }, {}).reason, 'modifier');
  T.eq(K.learnable({ key: 'Enter' }, {}), { ok: false, reason: 'builtin', action: 'select' }, 'the remote\'s own OK keeps its job');
  T.eq(K.learnable({ key: 'F2' }, { F2: 'captions' }), { ok: false, reason: 'taught', action: 'captions' });
});

T.run('a taught button does its job, never while typing, and never over the remote\'s own', () => {
  const learned = { F2: 'captions', Enter: 'home', 'code:Lang3': 'mylist' };
  T.eq(K.actionFor({ key: 'F2' }, {}, learned), 'captions');
  T.eq(K.actionFor({ key: 'Unidentified', code: 'Lang3' }, {}, learned), 'mylist');
  T.eq(K.actionFor({ key: 'Enter' }, {}, learned), 'select');
  T.eq(K.actionFor({ key: 'F2' }, { editable: true }, learned), null);
  T.eq(K.actionFor({ key: 'F2' }, {}, null), null);
});

T.run('taught buttons are kept only for known jobs and keys that do not type', () => {
  const b = S.normalize({ buttons: { F2: 'captions', a: 'home', F3: 'self-destruct', ColorF1Green: 'mylist' } }).buttons;
  T.eq(b, { F2: 'captions', ColorF1Green: 'mylist' });
  T.eq(S.normalize({ buttons: 'nope' }).buttons, {});
  for (const label of ['Play/Pause', 'Next Episode', 'Previous Episode', 'Skip Ahead', 'Skip Back', 'Captions On/Off', 'My List', 'Search', 'Home', 'Accessibility']) {
    T.ok(S.BUTTON_JOBS.some((j) => j.label === label && !j.own), `a job for spare buttons: ${label}`);
  }
});

function menu() {
  let settings = S.normalize(null);
  const saves = [];
  const m = ctx.TenfootSettingsMenu.create({
    settings: () => settings,
    save: (patch) => { saves.push(patch); settings = S.normalize(Object.assign({}, settings, patch)); },
    onClear: () => {},
  });
  m.open();
  const to = (label) => {
    for (let i = 0; i < 40 && m.view().entries[m.view().index].label !== label; i += 1) m.key('down');
    T.eq(m.view().entries[m.view().index].label, label, `reached ${label}`);
  };
  return { m, saves, to, settings: () => settings };
}

T.run('Remote Buttons: teach a button, refuse one that types, use it; then remove it', () => {
  const { m, saves, to, settings } = menu();
  to('Accessibility');
  m.key('select');
  to('Remote Buttons');
  m.key('select');
  T.eq(m.view().title, 'Remote Buttons');
  to('Captions On/Off');
  m.key('select');
  T.eq(m.view().entries.map((e) => e.label), ['Teach a button']);
  m.key('select');
  T.ok(m.learning(), 'waiting for a press');
  T.eq(m.view().title, 'Teach a button: Captions On/Off');
  T.eq(m.learnKey({ key: 'c' }), true);
  T.ok(/type/.test(m.view().entries[0].label), 'a key that types is refused: ' + m.view().entries[0].label);
  T.eq(m.learnKey({ key: 'Enter' }), true);
  T.eq(m.view().entries[0].label, 'That button is already OK.');
  T.eq(m.learnKey({ key: 'Escape' }), false, 'Back is left as Back');
  m.learnKey({ key: 'F2' });
  T.eq(m.view().title, 'F2 for Captions On/Off?');
  m.key('select');
  T.eq(saves.at(-1), { buttons: { F2: 'captions' } });
  T.eq(m.view().title, 'Captions On/Off', 'back on the job');
  T.eq(m.view().entries.map((e) => e.label), ['Teach a button', 'Remove F2']);
  m.key('back');
  T.eq(m.view().entries.find((e) => e.label === 'Captions On/Off').value, 'F2', 'the list says which button does it');
  m.key('select');
  m.key('down');
  m.key('select');
  T.eq(settings().buttons, {}, 'removed');
});

T.run('Remote Buttons: Try again goes back to waiting; Back from waiting leaves without saving; Reset takes OK twice', () => {
  const { m, saves, to, settings } = menu();
  to('Accessibility');
  m.key('select');
  to('Remote Buttons');
  m.key('select');
  to('Home');
  m.key('select');
  m.key('select');
  m.learnKey({ key: 'F5' });
  m.key('down');
  m.key('select');
  T.ok(m.learning(), 'Try again: waiting again');
  m.key('back');
  T.eq([m.learning(), saves.length], [false, 0]);
  m.key('select');
  m.learnKey({ key: 'ColorF3Blue' });
  T.eq(m.view().title, 'Blue for Home?');
  m.key('select');
  m.key('back');
  to('Reset Buttons');
  m.key('select');
  T.eq(m.view().entries[m.view().index].value, 'OK again to reset');
  T.eq(settings().buttons, { ColorF3Blue: 'home' }, 'not yet');
  m.key('select');
  T.eq(settings().buttons, {});
});

T.runAsync('in the player: taught buttons turn captions on and off, and skip ahead and back', async () => {
  const { key, st, clicks } = await bootPlayer({ settings: { seekStep: 10, buttons: { F2: 'captions', ColorF1Green: 'seek_forward', ColorF0Red: 'seek_back' } } });
  st.currentTime = 30;
  key('F2');
  T.eq(clicks, ['cc'], 'the player\'s own CC button');
  key('ColorF1Green');
  T.eq(st.currentTime, 40);
  key('ColorF0Red');
  key('ColorF0Red');
  T.eq(st.currentTime, 20);
});

T.runAsync('on a page: a taught button opens Accessibility', async () => {
  const p = await bootPage({ html: fixture('home.html'), url: URLS.browse, settings: { buttons: { F4: 'accessibility' } } });
  await T.sleep(200);
  p.key('F4');
  await T.sleep(100);
  const title = p.doc.querySelector('.tenfoot-settings-title');
  T.eq(title && title.textContent, 'Accessibility');
});

T.runAsync('on a page, the Remote Buttons screen takes the next press as the button', async () => {
  const p = await bootPage({ html: fixture('home.html'), url: URLS.browse, settings: { buttons: { F4: 'accessibility' } } });
  await T.sleep(200);
  p.key('F4');
  await T.sleep(50);
  for (let i = 0; i < 12 && p.doc.activeElement.textContent.indexOf('Remote Buttons') < 0; i += 1) p.key('ArrowDown');
  p.key('Enter');
  for (let i = 0; i < 20 && p.doc.activeElement.textContent.indexOf('My List') < 0; i += 1) p.key('ArrowDown');
  p.key('Enter');
  p.key('Enter');
  T.eq(p.doc.querySelector('.tenfoot-settings-title').textContent, 'Teach a button: My List');
  p.key('ChannelUp');
  T.eq(p.doc.querySelector('.tenfoot-settings-title').textContent, 'Channel + for My List?');
});

await T.exit();
