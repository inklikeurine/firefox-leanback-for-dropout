// nav/ask.js on its own: a question in a box (its words, its buttons, the
// safe one selected, the keys, the one answer), and a picture to pick (its
// sections, the grid moves between rows and sections, OK and Back). The
// page script's use of both (Sign out?, Delete profile?, a profile's
// picture) is in page.test.
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';

function load() {
  const dom = makeDom({ clock: true, html: '<!doctype html><html><body><p>page</p></body></html>', url: 'https://watch.dropout.tv/browse' });
  dom.runScripts([T.extFile('lib/common.js'), T.extFile('nav/ask.js')]);
  return { win: dom.window, doc: dom.window.document, A: dom.window.TenfootAsk };
}

const SIGN_OUT = {
  title: 'Sign out of Dropout?',
  text: 'Signing in again needs your email and password.',
  buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'signout', label: 'Sign Out', primary: true }],
  start: 'cancel'
};

T.runAsync('a question: its title, its line, its buttons; the one named by start selected; outside the page\'s body', async () => {
  const { doc, A } = load();
  const focused = [];
  const ask = A.createAsk(doc, { onFocus: (el) => focused.push(el.dataset.tenfootAsk) });
  T.eq(ask.isOpen, false, 'closed until asked');
  T.eq(ask.current, null);
  const answer = ask.open(SIGN_OUT);
  const el = ask.element;
  T.eq(el.parentElement, doc.documentElement);
  T.eq([el.hidden, el.getAttribute('role'), el.getAttribute('aria-modal')], [false, 'alertdialog', 'true']);
  T.eq(el.querySelector('.tenfoot-ask-title').textContent, 'Sign out of Dropout?');
  T.eq(el.querySelector('.tenfoot-ask-text').hidden, false);
  const buttons = [...el.querySelectorAll('.tenfoot-ask-button')];
  T.eq(buttons.map((b) => b.textContent), ['Cancel', 'Sign Out']);
  T.eq(buttons[1].dataset.tenfootPrimary, 'true');
  T.eq(ask.current, buttons[0], 'the safe one');
  T.eq(doc.activeElement, buttons[0]);
  T.eq(focused, ['cancel'], 'told for the ring');
  T.ok(ask.contains(buttons[1]) && !ask.contains(doc.body));
  ask.close();
  T.eq(await answer, null);
});

T.runAsync('keys: ◀ ▶ ▲ ▼ move without wrapping, OK answers with the button, Back with nothing; once closed, keys are not the box\'s', async () => {
  const { doc, A } = load();
  const ask = A.createAsk(doc);
  let answer = ask.open(SIGN_OUT);
  T.eq(ask.key('left'), true);
  T.eq(ask.current.dataset.tenfootAsk, 'cancel', 'no wrap at the start');
  ask.key('right');
  ask.key('down');
  T.eq(ask.current.dataset.tenfootAsk, 'signout', 'no wrap at the end');
  ask.key('up');
  T.eq(ask.current.dataset.tenfootAsk, 'cancel');
  T.eq(ask.key('menu'), true, 'nothing else gets past an open question');
  ask.key('right');
  ask.key('select');
  T.eq(await answer, 'signout');
  T.eq([ask.isOpen, ask.element.hidden], [false, true]);
  T.eq(ask.key('select'), false, 'closed: not the box\'s');
  answer = ask.open(SIGN_OUT);
  ask.key('back');
  T.eq(await answer, null, 'Back answers with nothing');
});

T.runAsync('a click answers; a second question answers the first with nothing; no line hides the line', async () => {
  const { doc, A } = load();
  const ask = A.createAsk(doc);
  const first = ask.open(SIGN_OUT);
  const second = ask.open({ title: 'Delete Sam?', buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'delete', label: 'Delete Profile', danger: true }] });
  T.eq(await first, null, 'replaced');
  T.eq(ask.element.querySelector('.tenfoot-ask-text').hidden, true);
  const del = ask.element.querySelector('[data-tenfoot-ask="delete"]');
  T.eq(del.dataset.tenfootDanger, 'true');
  T.eq(ask.current.dataset.tenfootAsk, 'cancel', 'no start: the first');
  del.click();
  T.eq(await second, 'delete');
});

const PICTURES = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `p${from + i}`, image: `https://img.test/${from + i}.png`, label: `Picture ${from + i + 1}` }));

T.runAsync('a picture to pick: its sections, each a grid of pictures; the profile\'s own pressed and selected', async () => {
  const { doc, A } = load();
  const picker = A.createPicker(doc);
  const answer = picker.open({ title: 'Picture for Sam', columns: 3, start: 'p4', sections: [{ label: 'The classics', items: PICTURES(5) }, { label: 'Empty', items: [] }, { label: 'Dropout', items: PICTURES(2, 5) }] });
  const el = picker.element;
  T.eq([el.className, el.getAttribute('role')], ['tenfoot-ask tenfoot-picker', 'dialog']);
  T.eq(el.querySelector('.tenfoot-ask-title').textContent, 'Picture for Sam');
  T.eq(el.querySelector('.tenfoot-ask-text').hidden, true);
  T.eq([...el.querySelectorAll('.tenfoot-picker-label')].map((h) => h.textContent), ['The classics', 'Dropout'], 'a section with no pictures is left out');
  T.eq(el.querySelector('.tenfoot-picker-sections').style.getPropertyValue('--tf-picker-cols'), '3');
  const pressed = [...el.querySelectorAll('[aria-pressed="true"]')];
  T.eq(pressed.map((b) => b.dataset.tenfootPicture), ['p4']);
  T.eq(picker.current, pressed[0]);
  T.eq(picker.current.querySelector('img').getAttribute('src'), 'https://img.test/4.png');
  T.eq(picker.current.getAttribute('aria-label'), 'Picture 5');
  picker.key('back');
  T.eq(await answer, null);
});

T.runAsync('the picker\'s grid: ◀ ▶ along, ▼ ▲ a row, the short last row, on into the next section and back up to its last row', async () => {
  const { doc, A } = load();
  const picker = A.createPicker(doc);
  // The classics: p0 p1 p2 / p3 p4. Dropout: p5 p6.
  const answer = picker.open({ title: 'Picture', columns: 3, sections: [{ label: 'The classics', items: PICTURES(5) }, { label: 'Dropout', items: PICTURES(2, 5) }] });
  const at = () => picker.current.dataset.tenfootPicture;
  T.eq(at(), 'p0', 'no start: the first');
  picker.key('left');
  T.eq(at(), 'p0', 'no wrap');
  picker.key('right');
  picker.key('right');
  T.eq(at(), 'p2');
  picker.key('down');
  T.eq(at(), 'p4', 'the short last row: its last picture');
  picker.key('down');
  T.eq(at(), 'p6', 'into the next section, the same column or its last');
  picker.key('up');
  T.eq(at(), 'p4', 'back up: the last row of the section above, the same column');
  picker.key('up');
  T.eq(at(), 'p1');
  picker.key('up');
  T.eq(at(), 'p1', 'the top: stays');
  picker.key('select');
  T.eq(await answer, 'p1');
});

T.runAsync('the picker: a click picks; refocus puts the focus back on the selection', async () => {
  const { doc, A } = load();
  const picker = A.createPicker(doc);
  const answer = picker.open({ title: 'Picture', sections: [{ label: 'The classics', items: PICTURES(3) }] });
  doc.body.focus();
  picker.refocus();
  T.eq(doc.activeElement, picker.current);
  picker.element.querySelector('[data-tenfoot-picture="p2"]').click();
  T.eq(await answer, 'p2');
  T.eq(picker.current, null, 'closed: no selection');
});

await T.exit();
