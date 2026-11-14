// Text that reaches a sign-in box without key presses — from the system's own
// on-screen keyboard or input method, which sends the words rather than keys —
// counts as typed in, so the Enter after it signs in instead of opening
// Leanback's keyboard.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot as start, kbOpen, kbKey, SIGNIN, wireDropout, box } from './page-support.mjs';

const boot = () => start({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });

// What the system's keyboard does to a box: its value changes and an input
// event says so, with no key presses for the letters.
function systemTypes(p, el, text) {
  el.focus();
  el.value = text;
  el.dispatchEvent(new p.win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

T.runAsync('sign-in: a password typed with the system\'s on-screen keyboard, then its Enter: the box\'s own Enter (Sign in), not Leanback\'s keyboard', async () => {
  const p = await boot();
  const posted = wireDropout(p);
  systemTypes(p, box(p, 'tenfoot-signin-email'), 'fixture@example.test');
  const enterInEmail = p.key('Enter');
  T.notOk(kbOpen(p), 'Enter in Email: no keyboard');
  T.ok(enterInEmail.defaultPrevented && p.doc.activeElement.id === 'tenfoot-signin-password', 'on to Password');
  systemTypes(p, box(p, 'tenfoot-signin-password'), 'not-a-real-password');
  const enter = p.key('Enter');
  T.notOk(kbOpen(p), 'Enter in Password: no keyboard');
  T.notOk(enter.defaultPrevented, 'the Enter is left to the box, whose form signs in');
  // Firefox submits the form on an Enter nobody cancelled.
  p.doc.querySelector('.tenfoot-signin-form').requestSubmit();
  await T.sleep(100);
  T.eq(posted.map((x) => x.step), ['next', 'password'], 'the hand-over to Dropout began');
});

T.runAsync('sign-in: what Leanback\'s own keyboard types does not count — after its Escape, OK opens it again', async () => {
  const p = await boot();
  p.key('Enter');
  T.ok(kbOpen(p));
  kbKey(p, 'c:a');
  p.key('Escape');
  T.notOk(kbOpen(p));
  p.key('Enter');
  T.ok(kbOpen(p), 'OK on the box still opens Leanback\'s keyboard');
});

await T.exit();
