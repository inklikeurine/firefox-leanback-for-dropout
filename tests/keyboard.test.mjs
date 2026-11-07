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
  const rowIds = () => [...kb.element.querySelectorAll('.tenfoot-kb-row')].map((r) => [...r.querySelectorAll('.tenfoot-kb-key')].map((b) => b.dataset.tenfootKey));
  // What the box saw: each event's type, what it was, and the value at that moment.
  const log = (box) => {
    const seen = [];
    for (const type of ['beforeinput', 'input']) box.addEventListener(type, (e) => seen.push([e.type, e.inputType, e.data, box.value]));
    return seen;
  };
  return { win: dom.window, doc, kb, k, press, rowIds, focused, log, box: (id) => doc.getElementById(id) };
}

T.runAsync('opened: a panel at the bottom of the page, outside its body; the letters in QWERTY rows; the selection on the first; told for the ring', async () => {
  const { doc, kb, rowIds, focused, box } = load();
  T.eq([kb.isOpen, kb.current], [false, null], 'closed until opened');
  T.eq(kb.key('select'), false, 'and not the keys\'');
  kb.open(box('t'));
  T.eq([kb.element.parentElement, kb.element.hidden, kb.element.getAttribute('role')], [doc.documentElement, false, 'dialog']);
  const rows = rowIds();
  T.eq(rows[0].join(' '), 'c:q c:w c:e c:r c:t c:y c:u c:i c:o c:p', 'the top row');
  T.eq(rows.map((r) => r.length), [10, 9, 9, 7], 'ten, nine, shift + seven + backspace, and the bottom row');
  T.eq(rows[2][0] + '|' + rows[2][8], 'shift|backspace');
  T.eq(rows[3], ['page', 'c:,', 'space', 'c:.', 'left', 'right', 'done'], 'a text box: comma, Space, full stop, the cursor keys, Done');
  T.eq([kb.current.dataset.tenfootKey, focused, doc.activeElement], ['c:q', ['c:q'], kb.current]);
  T.eq(kb.contains(kb.current) && !kb.contains(box('t')), true);
});

T.runAsync('the remote: ◀ ▶ go round the row; ▲ ▼ go to the nearest key in the next row, keep their place across rows, and stop at the top and bottom', async () => {
  const { kb, box } = load();
  kb.open(box('t'));
  const at = () => kb.current.dataset.tenfootKey;
  T.eq(kb.key('left') && at(), 'c:p', '◀ from the first key goes to the last');
  T.eq(kb.key('right') && at(), 'c:q', '▶ from the last goes to the first');
  T.eq(kb.key('up') && at(), 'c:q', 'no row above: stays');
  kb.key('left'); // p
  kb.key('down');
  T.eq(at(), 'c:l', 'under p: the nearest, l');
  kb.key('down');
  T.eq(at(), 'backspace', 'under l: Backspace');
  kb.key('down');
  T.eq(at(), 'done', 'the bottom row\'s end');
  kb.key('down');
  T.eq(at(), 'done', 'no row below: stays');
  kb.key('up'); kb.key('up');
  T.eq(at(), 'c:l');
  kb.key('up');
  T.eq(at(), 'c:p', 'back up to where it came from (the place was kept)');
  kb.key('down'); kb.key('left');
  kb.key('up');
  T.eq(at(), 'c:i', 'a sideways step sets a new place (k sits between i and o: a tie goes to the left)');
});

T.runAsync('typing: at the cursor, a capital to start (and after a space), beforeinput then input, the page may cancel; Backspace; the cursor keys', async () => {
  const { kb, k, press, log, box, win } = load();
  const t = box('t');
  const seen = log(t);
  kb.open(t);
  T.eq(k('c:h').textContent, 'H', 'an empty text box starts with a capital');
  press('c:h');
  press('c:i');
  T.eq(t.value, 'Hi');
  T.eq(seen.slice(0, 4), [['beforeinput', 'insertText', 'H', ''], ['input', 'insertText', 'H', 'H'], ['beforeinput', 'insertText', 'i', 'H'], ['input', 'insertText', 'i', 'Hi']], 'what the page sees, in order');
  T.eq(k('c:i').textContent, 'i', 'no capital mid-word');
  press('space');
  T.eq([t.value, k('c:a').textContent], ['Hi ', 'A'], 'a capital after a space');
  press('shift');
  T.eq(k('c:a').textContent, 'a', 'Shift turns it off');
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

T.runAsync('an email box: @, a full stop and .com, no Space; no capitals; type=email has no cursor to read, so the keyboard keeps its own', async () => {
  const { kb, k, press, rowIds, box } = load();
  const e = box('e');
  kb.open(e, { layout: 'email' });
  T.eq(rowIds()[3], ['page', 'c:@', 'c:.', 'c:.com', 'left', 'right', 'done']);
  T.eq(k('c:a').textContent, 'a', 'no capital to start');
  for (const id of ['c:a', 'c:b']) press(id);
  press('c:@');
  press('c:c');
  press('c:.com');
  T.eq(e.value, 'ab@c.com');
  for (let i = 0; i < 6; i += 1) press('left');
  press('backspace');
  T.eq(e.value, 'a@c.com', 'the cursor moved where the box has none to give: the b after the second letter went');
  T.eq(e.type, 'email', 'still an email box');
});

T.runAsync('a password box: Space and Show; Show turns the box readable and the line under the text too; Hide and closing put it back', async () => {
  const { kb, k, press, rowIds, box } = load();
  const p = box('p');
  const line = () => kb.element.querySelector('.tenfoot-kb-preview').textContent;
  const done = kb.open(p, { layout: 'password' });
  T.eq(rowIds()[3], ['page', 'space', 'show', 'left', 'right', 'done']);
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

T.runAsync('the digits and symbols page and back; the selection stays on that key', async () => {
  const { kb, k, press, rowIds, box } = load();
  const t = box('t');
  kb.open(t, { layout: 'text' });
  kb.key('down'); kb.key('down'); kb.key('down');
  T.eq(kb.current.dataset.tenfootKey, 'page');
  kb.key('select');
  T.eq([kb.state.page, kb.current.dataset.tenfootKey, k('page').textContent], ['symbols', 'page', 'abc'], 'on the other page, still on its key');
  T.eq(rowIds()[0].join(), 'c:1,c:2,c:3,c:4,c:5,c:6,c:7,c:8,c:9,c:0');
  T.eq(rowIds()[2].length, 9, 'eight marks and Backspace, no Shift');
  press('c:7'); press('c:@');
  T.eq(t.value, '7@');
  press('page');
  T.eq([kb.state.page, k('page').textContent], ['letters', '123']);
});

T.runAsync('a number pad for a PIN: a pad of digits; a PIN\'s separate boxes fill in turn, Backspace empties the last filled, a digit with every box full has no place; the panel shows dots', async () => {
  const { kb, k, press, rowIds, box, doc } = load();
  const boxes = ['d1', 'd2', 'd3', 'd4'].map(box);
  const a = kb.open(boxes[0], { layout: 'digits', boxes });
  T.eq(rowIds(), [['c:1', 'c:2', 'c:3'], ['c:4', 'c:5', 'c:6'], ['c:7', 'c:8', 'c:9'], ['backspace', 'c:0', 'done']]);
  T.eq(kb.current.dataset.tenfootKey, 'c:1');
  const line = () => kb.element.querySelector('.tenfoot-kb-preview').textContent;
  press('c:4'); press('c:2'); press('c:7');
  T.eq(boxes.map((b) => b.value), ['4', '2', '7', ''], 'each digit in the next empty box');
  T.eq(line(), '•••', 'dots, never the digits');
  press('backspace');
  T.eq(boxes.map((b) => b.value), ['4', '2', '', ''], 'Backspace empties the last filled box');
  press('c:9'); press('c:0'); press('c:5');
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
  T.eq([kb.key('menu'), kb.key('search'), kb.key('play_pause')], [true, true, true], 'every other key is swallowed while it is open');
  press('done');
  T.eq(await b, 'done');
  T.eq(kb.key('select'), false, 'closed: not its keys');
  // Clicking a key (the pointer) selects it and presses it.
  kb.open(box('t'));
  press('c:g');
  T.eq([box('t').value, kb.current.dataset.tenfootKey], ['G', 'c:g']);
});

await T.exit();
