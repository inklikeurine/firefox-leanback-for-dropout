// nav/keyboard.js on its own: the on-screen keyboard's keys and pages, the
// remote's moves (round a row, nearest key up and down), typing into any box
// at the cursor with beforeinput and input, the layouts (text, email,
// password with Show), Done, Back and what it hands back. Where the
// page script opens it (sign-in, search, profiles) is in page.test.
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';

function load() {
  const dom = makeDom({
    html: '<!doctype html><html><body><form><input id="t" type="text"><input id="e" type="email"><input id="p" type="password"><input id="d1" inputmode="numeric"><input id="d2" inputmode="numeric"><input id="d3" inputmode="numeric"><input id="d4" inputmode="numeric"></form></body></html>',
    url: 'https://watch.dropout.tv/login'
  });
  dom.runScripts([T.extFile('lib/common.js'), T.extFile('nav/keyboard.js')]);
  const doc = dom.window.document;
  const focused = [];
  const kb = dom.window.TenfootKeyboard.createKeyboard(doc, { onFocus: (el) => focused.push(el.dataset.tenfootKey) });
  const k = (id) => kb.element.querySelector(`[data-tenfoot-key="${id}"]`);
  const press = (id) => k(id).click();
  const rowIds = () => kb.state.rows;
  // What the box saw: each event's type, what it was, and the value at that moment.
  const log = (box) => {
    const seen = [];
    for (const type of ['beforeinput', 'input']) box.addEventListener(type, (e) => seen.push([e.type, e.inputType, e.data, box.value]));
    return seen;
  };
  return { win: dom.window, doc, kb, k, press, rowIds, focused, log, box: (id) => doc.getElementById(id) };
}

const ids = (line) => line.split(' ').map((c) => `c:${c}`);

T.runAsync('opened: a panel outside the page\'s body; the keys that act on the text, the letters A to Z six across, the digits, Space and Done; the selection on A', async () => {
  const { doc, kb, k, rowIds, focused, box } = load();
  T.eq([kb.isOpen, kb.current], [false, null], 'closed until opened');
  T.eq(kb.key('select'), false, 'and not the keys\'');
  kb.open(box('t'));
  T.eq([kb.element.parentElement, kb.element.hidden, kb.element.getAttribute('role')], [doc.documentElement, false, 'dialog']);
  T.eq(rowIds(), [
    ['shift', 'page', 'left', 'right', 'backspace'],
    ids('a b c d e f'), ids('g h i j k l'), ids('m n o p q r'), ids('s t u v w x'), ids('y z . , \' -'),
    ids('1 2 3 4 5 6'), ids('7 8 9 0 @ _'),
    ['space', 'done']
  ]);
  T.eq([k('space').style.gridColumn.replace(/\s/g, ''), k('done').style.gridColumn.replace(/\s/g, '')], ['1/span3', '4/span3']);
  T.eq([kb.current.dataset.tenfootKey, focused, doc.activeElement], ['c:a', ['c:a'], kb.current]);
  T.eq(kb.current.getAttribute('data-tenfoot-current'), 'true', 'the selection is stamped on the key');
  T.eq(kb.element.querySelectorAll('[data-tenfoot-current]').length, 1);
  T.ok(kb.element.querySelector('.tenfoot-kb-hint').textContent.includes('MenuDelete'), 'the hint line says what Menu does');
  T.eq(kb.contains(kb.current) && !kb.contains(box('t')), true);
});

T.runAsync('the remote: ◀ ▶ go round the row; ▲ ▼ go straight up and down and round from the top to the bottom', async () => {
  const { kb, box } = load();
  kb.open(box('t'));
  const at = () => kb.current.dataset.tenfootKey;
  kb.key('left');
  T.eq(at(), 'c:f', '◀ from the first key goes to the last');
  kb.key('right');
  T.eq(at(), 'c:a', '▶ from the last goes to the first');
  kb.key('down');
  T.eq(at(), 'c:g', 'straight down');
  kb.key('right');
  T.eq(at(), 'c:h');
  kb.key('up'); kb.key('up');
  T.eq(at(), 'page', 'and straight up, to the keys that act on the text');
  kb.key('up');
  T.eq(at(), 'space', 'no row above: round to the bottom');
  kb.key('down');
  T.eq(at(), 'page', 'no row below: round to the top, the place kept');
  for (let i = 0; i < 7; i += 1) kb.key('down');
  T.eq(at(), 'c:8', 'through the letters and the digits');
  kb.key('down');
  T.eq(at(), 'space');
  kb.key('up');
  T.eq(at(), 'c:8', 'back up to where it came from (the place was kept)');
});

T.runAsync('a thin line in a row of its own between the letters and the digits, on every page but the number pad; the moves go past it', async () => {
  const { kb, k, box } = load();
  const line = () => kb.element.querySelector('.tenfoot-kb-line');
  const start = (id) => Number(k(id).style.gridRowStart);
  kb.open(box('t'));
  T.eq(kb.element.querySelectorAll('.tenfoot-kb-line').length, 1, 'one line');
  T.eq(line().getAttribute('aria-hidden'), 'true', 'nothing to read out');
  T.eq([start('c:y'), Number(line().style.gridRowStart), start('c:1')], [6, 7, 8], 'between the last letters and the first digits');
  T.eq(start('space'), 10, 'the rows under it move down one');
  T.eq(k('done').parentElement.style.getPropertyValue('--tf-kb-above'), '6');
  T.eq(k('done').parentElement.style.getPropertyValue('--tf-kb-below'), '3');
  for (let i = 0; i < 5; i += 1) kb.key('down');
  T.eq(kb.current.dataset.tenfootKey, 'c:1', 'one ▼ goes from the letters straight to the digits');
  kb.key('up');
  T.eq(kb.current.dataset.tenfootKey, 'c:y', 'and one ▲ back');
  k('page').click();
  T.eq([kb.element.querySelectorAll('.tenfoot-kb-line').length, Number(line().style.gridRowStart), start('c:1')], [1, 7, 8], 'the symbols page has it too, once');
  kb.close();
  kb.open(box('e'), { layout: 'email' });
  T.eq([Number(line().style.gridRowStart), start('c:1')], [8, 9], 'and email, under its extra row');
  kb.close();
  kb.open(box('d1'), { layout: 'digits' });
  T.eq([line(), start('c:1')], [null, 1], 'the number pad is all digits: no line');
});

T.runAsync('▲ ▼ go round in every layout, docked too, landing on the key under the same place', async () => {
  const { kb, box } = load();
  const at = () => kb.current.dataset.tenfootKey;
  kb.open(box('t'), { layout: 'text', docked: true });
  kb.key('up');
  T.eq(at(), 'shift', 'docked, from A: up to Shift');
  kb.key('up');
  T.eq(at(), 'space', 'and round to Space, on the search page\'s keyboard');
  kb.key('down');
  T.eq(at(), 'shift', 'and ▼ back round');
  for (let i = 0; i < 4; i += 1) kb.key('right');
  T.eq(at(), 'backspace');
  kb.key('up');
  T.eq(at(), 'done', 'from the right of the top row: Done');
  kb.key('down');
  T.eq(at(), 'backspace');
  kb.close();
  kb.open(box('d1'), { layout: 'digits' });
  kb.key('up');
  T.eq(at(), 'c:2', 'the number pad: from 5 up to 2');
  kb.key('up');
  T.eq(at(), 'c:0', 'and round to 0');
  kb.key('down');
  T.eq(at(), 'c:2', 'and back');
  kb.close();
  kb.open(box('e'), { layout: 'email' });
  for (let i = 0; i < 2; i += 1) kb.key('up');
  T.eq(at(), 'c:@gmail.com', 'email: the row of endings is the top');
  kb.key('up');
  T.eq(at(), 'c:.com', 'and round to .com');
});

T.runAsync('docked: stays up beside the page; the selection leaves and comes back; ◀ ▶ past its edges and Done are the page\'s; Back is not its own; a real letter brings it back', async () => {
  const dom = makeDom({ html: '<!doctype html><html><body><input id="t" placeholder="Search"></body></html>', url: 'https://watch.dropout.tv/search' });
  dom.runScripts([T.extFile('lib/common.js'), T.extFile('nav/keyboard.js')]);
  const doc = dom.window.document;
  const told = [];
  const kb = dom.window.TenfootKeyboard.createKeyboard(doc, { onEdge: (d) => told.push(d), onDone: () => told.push('done'), onEnter: () => told.push('enter') });
  const t = doc.getElementById('t');
  const k = (id) => kb.element.querySelector(`[data-tenfoot-key="${id}"]`);
  const answer = kb.open(t, { docked: true });
  T.eq([kb.isOpen, kb.isDocked, kb.element.getAttribute('data-tenfoot-docked')], [true, true, 'true']);
  T.eq(kb.element.querySelector('.tenfoot-kb-placeholder').textContent, 'Search', 'an empty box says what it is');
  kb.key('left');
  T.eq([told, kb.current.dataset.tenfootKey], [['left'], 'c:a'], '◀ past the edge is told, and does not go round');
  for (let i = 0; i < 5; i += 1) kb.key('right');
  kb.key('right');
  T.eq([told, kb.current.dataset.tenfootKey], [['left', 'right'], 'c:f'], '▶ too');
  T.eq(kb.key('back'), false, 'Back is the page\'s');
  k('done').click();
  T.eq(told.at(-1), 'done', 'Done is the page\'s');
  T.eq([kb.isDocked, kb.isOpen], [true, true], 'and it stays up');
  kb.leave();
  T.eq([kb.isOpen, kb.isDocked, kb.current, kb.element.querySelectorAll('[data-tenfoot-current]').length, kb.element.hidden], [false, true, null, 0, false], 'the selection has left; the panel stays');
  T.eq(kb.key('select'), false, 'the keys are not its own');
  told.length = 0;
  kb.enter('right');
  T.eq([kb.isOpen, told, kb.current.dataset.tenfootKey], [true, ['enter'], 'done'], 'back from the right: the end of the row it left');
  kb.leave();
  kb.typed('x');
  T.eq([kb.isOpen, t.value], [true, 'x'], 'a real letter brings it back, and types as it is');
  kb.leave();
  k('c:y').click();
  T.eq([kb.isOpen, t.value], [true, 'xy'], 'and so does the pointer');
  t.value = 'other';
  kb.refresh();
  T.eq(kb.element.querySelector('.tenfoot-kb-preview').textContent, 'other', 'the box changed by other means: the panel follows');
  kb.close();
  T.eq([await answer, kb.isDocked, kb.element.hidden, kb.element.hasAttribute('data-tenfoot-docked')], [null, false, true, false]);
  T.notOk(doc.activeElement === t, 'closing leaves the box out of it');
});

T.runAsync('typing: at the cursor, a capital to start (and after a space), beforeinput then input, the page may cancel; Backspace; the cursor keys; a key answers the press for a moment', async () => {
  const { kb, k, press, log, box, win } = load();
  const t = box('t');
  const seen = log(t);
  kb.open(t);
  T.eq(k('c:h').textContent, 'H', 'an empty text box starts with a capital');
  press('c:h');
  T.eq(k('c:h').getAttribute('data-tenfoot-pressed'), 'true', 'the key answers');
  await T.sleep(180);
  T.eq(k('c:h').getAttribute('data-tenfoot-pressed'), null, 'for a moment');
  press('c:i');
  T.eq(t.value, 'Hi');
  T.eq(seen.slice(0, 4), [['beforeinput', 'insertText', 'H', ''], ['input', 'insertText', 'H', 'H'], ['beforeinput', 'insertText', 'i', 'H'], ['input', 'insertText', 'i', 'Hi']], 'what the page sees, in order');
  T.eq(k('c:i').textContent, 'i', 'no capital mid-word');
  press('space');
  T.eq([t.value, k('c:a').textContent], ['Hi ', 'A'], 'a capital after a space');
  press('c:a');
  press('backspace');
  T.eq(t.value, 'Hi ', 'Backspace takes the last one out');
  const gone = log(t);
  press('backspace');
  T.eq([t.value, gone.slice(-2).map((e) => e[1])], ['Hi', ['deleteContentBackward', 'deleteContentBackward']], 'its own events');
  // The cursor keys: 'Hi' → 'H|i'.
  press('left');
  press('c:x');
  T.eq(t.value, 'Hxi', 'typed at the cursor');
  press('right');
  press('c:y');
  T.eq(t.value, 'Hxiy', 'and on after it');
  // A page that cancels beforeinput stops the letter.
  t.addEventListener('beforeinput', (e) => { if (e.data === 'z') e.preventDefault(); });
  press('c:z');
  T.eq(t.value, 'Hxiy', 'cancelled');
  // Backspace at the very start does nothing.
  for (let i = 0; i < 4; i += 1) press('left');
  press('backspace');
  T.eq(t.value, 'Hxiy');
  T.eq(typeof win.TenfootKeyboard, 'object');
});

T.runAsync('Shift has three steps: off, one capital, caps lock; the key says which', async () => {
  const { kb, k, press, box } = load();
  const t = box('e');
  kb.open(t, { layout: 'password' });
  const sh = () => [kb.state.shift, k('shift').dataset.tenfootShift, k('shift').getAttribute('aria-pressed'), k('shift').getAttribute('aria-label')];
  T.eq(sh(), ['off', 'off', 'false', 'Shift'], 'off, with no capital to start here');
  T.eq(k('c:a').textContent, 'a');
  press('shift');
  T.eq(sh(), ['once', 'once', 'true', 'Shift: one capital']);
  T.eq(k('c:a').textContent, 'A');
  press('c:a'); press('c:b');
  T.eq([t.value, kb.state.shift], ['Ab', 'off'], 'one capital, then off by itself');
  press('shift'); press('shift');
  T.eq(sh(), ['lock', 'lock', 'true', 'Caps lock']);
  press('c:c'); press('c:d'); press('c:1'); press('c:e');
  T.eq([t.value, kb.state.shift], ['AbCD1E', 'lock'], 'caps lock stays on through letters and digits');
  press('backspace');
  T.eq(kb.state.shift, 'lock', 'and Backspace');
  press('shift');
  T.eq(kb.state.shift, 'off', 'a third press turns it off');
  press('c:f');
  T.eq(t.value, 'AbCD1f');
});

T.runAsync('the remote\'s Menu takes out the letter before the cursor, from wherever the selection is; a real keyboard types while it is open', async () => {
  const { kb, press, box } = load();
  const t = box('t');
  kb.open(t);
  press('c:a'); press('c:b');
  const on = kb.current.dataset.tenfootKey;
  T.eq(kb.key('menu'), true);
  T.eq([t.value, kb.current.dataset.tenfootKey], ['A', on], 'one letter out, the selection stays put');
  kb.key('menu'); kb.key('menu');
  T.eq(t.value, '', 'and nothing happens at the start');
  T.eq(kb.typed('x'), true);
  T.eq(t.value, 'x');
  kb.typed('Backspace');
  T.eq(t.value, '');
  kb.close();
  T.eq(kb.typed('y'), false, 'closed: not its keys');
});

T.runAsync('an email box: a row of whole endings on top, .com and @, no Space; no capitals; type=email has no cursor to read, so the keyboard keeps its own', async () => {
  const { kb, k, press, rowIds, box } = load();
  const e = box('e');
  kb.open(e, { layout: 'email' });
  const rows = rowIds();
  T.eq(rows[0], ['c:@gmail.com', 'c:@outlook.com', 'c:@icloud.com'], 'the endings on top');
  T.eq(rows[6], ids('y z . - _ @'));
  T.eq(rows[9], ['c:.com', 'done'], '.com in place of Space');
  T.eq(k('c:a').textContent, 'a', 'no capital to start');
  for (const id of ['c:a', 'c:b']) press(id);
  press('c:@gmail.com');
  T.eq(e.value, 'ab@gmail.com', 'one press types the whole ending');
  for (let i = 0; i < 10; i += 1) press('backspace');
  T.eq(e.value, 'ab');
  press('c:@');
  press('c:c');
  press('c:.com');
  T.eq(e.value, 'ab@c.com');
  for (let i = 0; i < 6; i += 1) press('left');
  press('backspace');
  T.eq(e.value, 'a@c.com', 'the cursor moved where the box has none to give: the b after the second letter went');
  T.eq(e.type, 'email', 'still an email box');
  press('shift');
  press('c:@icloud.com');
  T.ok(e.value.includes('@icloud.com'), 'Shift leaves a whole ending as it is');
});

T.runAsync('a password box: Space and Show; Show turns the box readable and the line under the text too; Hide and closing put it back', async () => {
  const { kb, k, press, rowIds, box } = load();
  const p = box('p');
  const line = () => kb.element.querySelector('.tenfoot-kb-preview').textContent;
  const done = kb.open(p, { layout: 'password' });
  T.eq(rowIds().at(-1), ['space', 'show', 'done']);
  press('c:a'); press('c:b');
  T.eq([p.value, p.type, line()], ['ab', 'password', '••'], 'hidden, in the box and on the panel');
  press('show');
  T.eq([p.type, k('show').textContent, line()], ['text', 'Hide', 'ab']);
  press('show');
  T.eq([p.type, k('show').textContent], ['password', 'Show']);
  press('show');
  kb.close();
  T.eq([p.type, await done], ['password', null], 'closed while readable: hidden again');
});

T.runAsync('the symbols page and back; the digits stay; the selection stays on that key', async () => {
  const { kb, k, press, rowIds, box } = load();
  const t = box('t');
  kb.open(t, { layout: 'text' });
  kb.key('up'); kb.key('right');
  T.eq(kb.current.dataset.tenfootKey, 'page');
  T.eq(k('page').textContent, '#+=');
  kb.key('select');
  T.eq([kb.state.page, kb.current.dataset.tenfootKey, k('page').textContent], ['symbols', 'page', 'abc'], 'on the other page, still on its key');
  T.eq(rowIds()[6], ids('1 2 3 4 5 6'), 'the digits stay');
  T.eq(rowIds()[0], ['page', 'left', 'right', 'backspace'], 'no Shift');
  press('c:7'); press('c:@');
  T.eq(t.value, '7@');
  press('page');
  T.eq([kb.state.page, k('page').textContent], ['letters', '#+=']);
});

T.runAsync('a number pad for a PIN: a pad of digits; a PIN\'s separate boxes fill in turn, Backspace empties the last filled, a digit with every box full has no place; the panel shows dots', async () => {
  const { kb, press, rowIds, box, doc } = load();
  const boxes = ['d1', 'd2', 'd3', 'd4'].map(box);
  const a = kb.open(boxes[0], { layout: 'digits', boxes });
  T.eq(rowIds(), [['c:1', 'c:2', 'c:3'], ['c:4', 'c:5', 'c:6'], ['c:7', 'c:8', 'c:9'], ['backspace', 'c:0', 'done']]);
  T.eq(kb.current.dataset.tenfootKey, 'c:5');
  const line = () => kb.element.querySelector('.tenfoot-kb-preview').textContent;
  press('c:4'); press('c:2'); press('c:7');
  T.eq(boxes.map((b) => b.value), ['4', '2', '7', ''], 'each digit in the next empty box');
  T.eq(line(), '•••', 'dots, never the digits');
  press('backspace');
  T.eq(boxes.map((b) => b.value), ['4', '2', '', ''], 'Backspace empties the last filled box');
  kb.key('menu');
  T.eq(boxes.map((b) => b.value), ['4', '', '', ''], 'and so does Menu');
  press('c:2'); press('c:9'); press('c:0'); press('c:5');
  T.eq(boxes.map((b) => b.value), ['4', '2', '9', '0'], 'every box full: another digit has no place');
  kb.close();
  T.eq(await a, null);
  // One box holding a whole PIN works as any other box.
  const one = box('t');
  kb.open(one, { layout: 'digits' });
  press('c:1'); press('c:2');
  T.eq(one.value, '12');
  press('done');
  T.eq(doc.activeElement, one);
});

T.runAsync('Done answers "done" and the selection goes back to the box; Back answers nothing; another box takes it over; nothing else gets past it', async () => {
  const { doc, kb, press, box } = load();
  let a = kb.open(box('t'));
  press('done');
  T.eq([await a, kb.isOpen, doc.activeElement], ['done', false, box('t')]);
  a = kb.open(box('t'));
  T.eq(kb.key('back'), true);
  T.eq([await a, kb.isOpen, doc.activeElement], [null, false, box('t')], 'Back (Escape) closes it, the answer is nothing');
  a = kb.open(box('t'));
  const b = kb.open(box('e'), { layout: 'email' });
  T.eq(await a, null, 'a new box replaces the old one');
  T.ok(kb.isOpen && kb.state.layout === 'email');
  T.eq([kb.key('search'), kb.key('play_pause')], [true, true], 'every other key is swallowed while it is open');
  press('done');
  T.eq(await b, 'done');
  T.eq(kb.key('select'), false, 'closed: not its keys');
  // Clicking a key (the pointer) selects it and presses it.
  kb.open(box('t'));
  press('c:g');
  T.eq([box('t').value, kb.current.dataset.tenfootKey, kb.current.getAttribute('data-tenfoot-current')], ['G', 'c:g', 'true']);
  kb.close();
});

await T.exit();
