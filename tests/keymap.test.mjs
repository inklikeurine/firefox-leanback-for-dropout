// nav/keymap.js — the remote's face, and nothing else.
// The rule this file guards: no feature is reachable only from a keyboard,
// and arrow keys never mean anything but navigation.
import { T, loadScript } from '../../firefox-tools/harness/lib.mjs';

const ctx = loadScript(T.extFile('nav/keymap.js'));
const K = ctx.TenfootKeymap;
const a = (key, c = {}, init = {}) => K.actionFor({ key, ...init }, c);

T.run('the five navigation buttons and OK', () => {
  T.eq([a('ArrowUp'), a('ArrowDown'), a('ArrowLeft'), a('ArrowRight')], ['up', 'down', 'left', 'right']);
  T.eq(a('Enter'), 'select');
});

T.run('back arrives as BrowserBack from a remote, Escape from the rest', () => {
  T.eq(a('BrowserBack'), 'back');
  T.eq(a('Escape'), 'back');
});

T.run('the menu button is the way to every feature without a button of its own', () => {
  T.eq(a('ContextMenu'), 'menu');
});

T.run('HOME IS RESERVED: neither Home nor BrowserHome is ever mapped', () => {
  T.eq(a('Home'), null);
  T.eq(a('BrowserHome'), null);
  T.eq(a('End'), null);
});

T.run('volume is the desktop\'s, never ours', () => {
  T.eq([a('AudioVolumeUp'), a('AudioVolumeDown'), a('AudioVolumeMute')], [null, null, null]);
});

T.run('media keys stay for remotes that have them (they are not keyboard shortcuts)', () => {
  T.eq([a('MediaPlayPause'), a('MediaPlay'), a('MediaPause'), a('MediaStop')], ['play_pause', 'play_pause', 'play_pause', 'stop']);
  T.eq([a('MediaTrackNext'), a('MediaTrackPrevious')], ['next', 'previous']);
  T.eq([a('MediaFastForward'), a('MediaRewind')], ['fast_forward', 'rewind']);
});

T.run('"/" is the ONE keyboard exception, because search needs typing anyway', () => {
  T.eq(a('/'), 'search');
  T.eq(Object.keys(K.KEYBOARD_EXCEPTIONS), ['/'], 'and it is the only one');
});

T.run('no letter is mapped anywhere — that is the whole point', () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  for (const ch of [...letters, ...letters.map((c) => c.toUpperCase())]) {
    T.eq(a(ch), null, `"${ch}" must not be a shortcut`);
  }
});

T.run('no keyboard navigation keys either: Space, Backspace, Page keys, Tab, function keys', () => {
  for (const k of [' ', 'Backspace', 'Delete', 'PageUp', 'PageDown', 'Tab', 'F2', 'F5', 'Insert']) {
    T.eq(a(k), null, k);
  }
});

T.run('the whole map is remote-class keys only', () => {
  const allowed = /^(Arrow(Up|Down|Left|Right)|Enter|Escape|Browser(Back|Search)|ContextMenu|Media[A-Za-z]+)$/;
  for (const key of Object.keys(K.REMOTE)) T.ok(allowed.test(key), `unexpected key in the map: ${key}`);
});

T.run('while typing, only back leaves the field — even "/" belongs to the field', () => {
  const e = { editable: true };
  T.eq(a('Escape', e), 'back');
  T.eq(a('BrowserBack', e), 'back');
  T.eq([a('/', e), a('ArrowLeft', e), a('Enter', e), a('MediaPlayPause', e)], [null, null, null, null]);
});

T.run('◀ leaves a field only when the text cursor is at its very start', () => {
  T.eq(a('ArrowLeft', { editable: true, atStart: true }), 'left');
  T.eq(a('ArrowLeft', { editable: true, atStart: false }), null, 'anywhere else it moves the cursor');
  T.eq([a('ArrowRight', { editable: true, atStart: true }), a('ArrowDown', { editable: true, atStart: true })], [null, null]);
  T.eq(K.caretAtStart({ selectionStart: 0, selectionEnd: 0 }), true);
  T.eq(K.caretAtStart({ selectionStart: 0, selectionEnd: 3 }), false, 'text selected from the start: ◀ collapses it');
  T.eq(K.caretAtStart({ selectionStart: 2, selectionEnd: 2 }), false);
  T.eq(K.caretAtStart({ get selectionStart() { throw new Error('no cursor'); } }), false, 'a field without a cursor');
  T.eq(K.caretAtStart(null), false);
});

T.run('▼ and ▲ leave a one-line field (the sign-in form); in a textarea they move the cursor', () => {
  T.eq(a('ArrowDown', { editable: true, singleLine: true }), 'down');
  T.eq(a('ArrowDown', { editable: true, singleLine: false }), null);
  T.eq(a('ArrowUp', { editable: true, singleLine: true }), 'up');
  T.eq(a('ArrowUp', { editable: true, singleLine: false }), null);
  T.eq(a('ArrowRight', { editable: true, singleLine: true }), null, '▶ stays the field\'s');
  const el = (tagName, attrs = {}) => ({ nodeType: 1, tagName, getAttribute: (k) => attrs[k] ?? null });
  T.ok(K.isSingleLine(el('INPUT', { type: 'search' })));
  T.notOk(K.isSingleLine(el('TEXTAREA')));
  T.notOk(K.isSingleLine(el('INPUT', { type: 'checkbox' })));
  T.notOk(K.isSingleLine(null));
});

T.run('modifier combinations are left to the browser', () => {
  T.eq(a('ArrowLeft', {}, { altKey: true }), null, 'Alt+Left is history back');
  T.eq(a('ArrowRight', {}, { ctrlKey: true }), null);
  T.eq(a('Enter', {}, { metaKey: true }), null);
  T.eq(a('ArrowRight', {}, { shiftKey: true }), 'right', 'Shift alone does not disable');
});

T.run('bad input is null, never a throw', () => {
  T.eq(K.actionFor(null), null);
  T.eq(K.actionFor({}), null);
  T.eq(K.actionFor({ key: 5 }), null);
});

T.run('isEditable recognises text fields only', () => {
  const el = (tagName, attrs = {}, extra = {}) => ({ nodeType: 1, tagName, getAttribute: (k) => attrs[k] ?? null, ...extra });
  T.ok(K.isEditable(el('TEXTAREA')));
  T.ok(K.isEditable(el('INPUT')));
  T.ok(K.isEditable(el('INPUT', { type: 'search' })));
  T.ok(K.isEditable(el('DIV', {}, { isContentEditable: true })));
  T.notOk(K.isEditable(el('INPUT', { type: 'checkbox' })));
  T.notOk(K.isEditable(el('SELECT')));
  T.notOk(K.isEditable(el('A')));
  T.notOk(K.isEditable(null));
});

T.run('PLAYER_ACTIONS lists what the page forwards to the player frame', () => {
  for (const x of ['play_pause', 'stop', 'next', 'previous', 'fast_forward', 'rewind']) T.ok(K.PLAYER_ACTIONS.has(x), x);
  T.notOk(K.PLAYER_ACTIONS.has('select'));
});

await T.exit();
