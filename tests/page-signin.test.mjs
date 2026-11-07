// content/page.js on sign-in and the password reset, and what happens after signing in.
import fs from 'node:fs';
import path from 'node:path';
import { T } from '../../firefox-tools/harness/lib.mjs';
import { rules, fixture, kbOpen, kbKey, URLS, boot, watch, PICK, pickCards, SIGNIN, wireDropout, box, HOME_KEY, note, signedOutVideo, askOpen, RESET, wireReset } from './page-support.mjs';

T.runAsync('sign-in: Leanback\'s own screen over Dropout\'s form; real boxes a password app understands; the selection starts in Email; ▲ ▼ go between the boxes and buttons', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const s = await p.state();
  T.eq(s.kind, 'signin');
  T.eq(p.doc.documentElement.dataset.tenfootKind, 'signin');
  const layer = p.doc.querySelector('.tenfoot-signin');
  T.ok(layer && layer.parentNode === p.doc.documentElement, 'a layer of its own, outside the site\'s tree');
  T.ok(p.$('login--box-container'), 'Dropout\'s form is still underneath');
  T.eq(layer.querySelector('h1').textContent, 'Sign in');
  T.eq(layer.querySelector('.tenfoot-signin-brand').textContent, 'DROPOUT');
  const form = layer.querySelector('form');
  const email = layer.querySelector('#tenfoot-signin-email');
  const pw = layer.querySelector('#tenfoot-signin-password');
  T.ok(form && form.contains(email) && form.contains(pw), 'a real <form> holding both boxes');
  T.eq([email.type, email.name, email.getAttribute('autocomplete')], ['email', 'email', 'username']);
  T.eq([pw.type, pw.name, pw.getAttribute('autocomplete')], ['password', 'password', 'current-password']);
  T.eq([layer.querySelector('label[for="tenfoot-signin-email"]').textContent, layer.querySelector('label[for="tenfoot-signin-password"]').textContent], ['Email', 'Password'], 'each box has its label');
  T.eq([...layer.querySelectorAll('.tenfoot-signin-buttons > *')].map((b) => [b.textContent, b.getAttribute('href')]), [['Sign in', null], ['Forgot password?', rules.resetUrl]]);
  T.ok(layer.querySelector('.tenfoot-hero-primary').textContent === 'Sign in', 'Sign in is the yellow one');
  T.eq(layer.querySelector('.tenfoot-signin-note').textContent, 'Press OK on a box to type with the remote, or use a keyboard.');
  T.eq([...layer.querySelectorAll('.tenfoot-signin-links a')].map((a) => [a.textContent, a.getAttribute('href')]), rules.legal.map((l) => [l.label, l.url]), 'the policies, under the form');
  T.notOk(p.doc.querySelector('.tenfoot-rail:not([hidden])'), 'no rail');
  // The form is never submitted by the browser.
  const submit = new p.win.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(submit);
  T.ok(submit.defaultPrevented, 'its submit is cancelled');
  // The moves: Email, Password, Sign in, Forgot password?, then the policies.
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  T.notOk(p.key('a').defaultPrevented, 'letters are typed');
  T.ok(p.key('ArrowDown').defaultPrevented);
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', '▼ leaves a box');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Sign in');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Forgot password?');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Privacy Policy');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Terms of Use', '▶ between the policies');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Terms of Use', 'and stops at the end');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Terms of Use', '▼ stops at the end');
  for (let i = 0; i < 6; i += 1) p.key('ArrowUp');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email', '▲ from a box with a box above stays put');
  // OK in Email opens the keyboard (see below); typed in with a keyboard, Enter goes on to Password.
  p.key('a');
  p.key('Enter');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', 'typed in with a keyboard: Enter in Email goes on to Password');
  // Back from a box leaves it, to Sign in.
  p.key('Escape');
  T.eq(p.doc.activeElement.textContent, 'Sign in', 'Back leaves the box');
});

T.runAsync('sign-in: the email already in Dropout\'s own box (a password app or Firefox filled it) is Leanback\'s, and the selection starts in Password', async () => {
  const p = await boot({ html: SIGNIN.replace('id="signin-email-input" type="email"', 'id="signin-email-input" type="email" value="fixture@example.test"'), url: 'https://watch.dropout.tv/login' });
  const email = p.doc.querySelector('.tenfoot-signin #tenfoot-signin-email');
  T.eq(email.value, 'fixture@example.test');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password');
});

T.runAsync('sign-in: Sign in goes through Dropout\'s own form — the email and Next, then the password and Sign in; "Signing in…" meanwhile; the password is never kept', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p);
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  box(p, 'tenfoot-signin-password').value = 'not-a-real-password';
  const btn = p.doc.querySelector('.tenfoot-signin-submit');
  btn.click();
  T.eq(btn.textContent, 'Signing in…', 'while it waits');
  T.eq(btn.getAttribute('aria-disabled'), 'true');
  await T.sleep(100);
  T.eq(posted, [{ step: 'next', email: 'fixture@example.test' }, { step: 'password', password: 'not-a-real-password' }], 'what Dropout\'s form was given, in order');
  // Pressed again while Dropout has not answered: nothing more goes through.
  btn.click();
  await T.sleep(50);
  T.eq(posted.length, 2, 'not pressed twice');
  const everything = JSON.stringify([p.shim.store, p.bg]);
  T.notOk(everything.includes('not-a-real-password'), 'the password is not stored or sent anywhere');
});

T.runAsync('sign-in: Dropout\'s error on the password step shows on Leanback\'s screen; the email stays, the password box is emptied and selected, Sign in can be pressed again', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p, { wrong: true });
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  box(p, 'tenfoot-signin-password').value = 'wrong-password';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  await T.sleep(100);
  const err = p.doc.querySelector('.tenfoot-signin-error');
  T.ok(!err.hidden && err.textContent === 'Invalid email or password.', 'Dropout\'s words, under the title');
  T.eq(box(p, 'tenfoot-signin-email').value, 'fixture@example.test', 'the email kept');
  T.eq(box(p, 'tenfoot-signin-password').value, '', 'the password box emptied');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', 'and selected');
  T.eq(p.doc.querySelector('.tenfoot-signin-submit').textContent, 'Sign in', 'Sign in is back');
  // Again: the old error goes while it works, and the new one comes.
  box(p, 'tenfoot-signin-password').value = 'another-try';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  T.ok(err.hidden, 'the old error is gone while it tries');
  await T.sleep(100);
  T.eq(posted.filter((x) => x.step === 'password').map((x) => x.password), ['wrong-password', 'another-try']);
  T.eq(err.textContent, 'Invalid email or password.');
});

T.runAsync('sign-in: Dropout\'s error on the email step (not an email) puts the selection back in Email', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p, { badEmail: true });
  box(p, 'tenfoot-signin-email').value = 'nope';
  box(p, 'tenfoot-signin-password').value = 'x';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  T.eq(posted, [], 'not an email: the browser\'s own check would stop Dropout\'s Next unseen, so Leanback says so itself');
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Please enter a valid email.');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  box(p, 'tenfoot-signin-email').value = 'unknown@example.test';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  await T.sleep(100);
  T.eq(posted.map((x) => x.step), ['next'], 'Dropout answered the email with an error: the password step never came');
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Please enter a valid email.');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  T.eq(box(p, 'tenfoot-signin-password').value, 'x', 'the password box is left alone: no password went anywhere');
});

T.runAsync('sign-in: with an empty box, Sign in asks for both and presses nothing of Dropout\'s', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p);
  p.doc.querySelector('.tenfoot-signin-submit').click();
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Enter your email and your password.');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password');
  T.eq(posted, [], 'nothing reached Dropout\'s form');
});

// Dropout's password form is a real post (action="/login"): a wrong password
// most likely comes back as a new /login page with the error already on it.
T.runAsync('sign-in: Dropout answering with a new page that holds its error — the error is shown, the email kept from before, the password box empty and selected', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  wireDropout(p, { hang: true });
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  box(p, 'tenfoot-signin-password').value = 'wrong-password';
  p.doc.querySelector('.tenfoot-signin-submit').click();
  await T.sleep(50);
  T.eq(p.win.sessionStorage.getItem('tenfoot.signin-email'), 'fixture@example.test', 'the email, kept in the tab for the page Dropout answers with');
  T.notOk(JSON.stringify([p.win.sessionStorage, p.shim.store, p.bg]).includes('wrong-password'), 'never the password');

  const answer = SIGNIN.replace('<div class="flash-msg-container is-hidden"><div class="flash-msg"></div>', '<div class="flash-msg-container"><div class="flash-msg">Invalid email or password.</div>');
  const q = await boot({ html: answer, url: 'https://watch.dropout.tv/login', before: (win) => win.sessionStorage.setItem('tenfoot.signin-email', 'fixture@example.test') });
  const m = q.doc.querySelector('.tenfoot-signin-error');
  T.eq([m.hidden, m.textContent, m.dataset.tone], [false, 'Invalid email or password.', 'error']);
  T.eq([box(q, 'tenfoot-signin-email').value, box(q, 'tenfoot-signin-password').value, q.doc.activeElement.id], ['fixture@example.test', '', 'tenfoot-signin-password']);
});

T.runAsync('sign-in: Dropout\'s Sign in left grey while its post is under way (data-disable-with); after "isn\'t answering", Sign in again still reaches Dropout', async () => {
  rules.pages.signin.signinMs = 300;
  try {
    const html = SIGNIN.replace('<button id="signin-password-submit" type="submit">', '<button id="signin-password-submit" type="submit" data-disable-with="Sending...">');
    const p = await boot({ html, url: 'https://watch.dropout.tv/login' });
    const posted = wireDropout(p, { hang: true });
    const theirs = p.$('signin-password-submit');
    p.$('login-form-password').addEventListener('submit', () => { theirs.disabled = true; }); // what Rails' own script does
    box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(p, 'tenfoot-signin-password').value = 'x';
    const btn = p.doc.querySelector('.tenfoot-signin-submit');
    btn.click();
    await T.sleep(500);
    T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, "Dropout isn't answering. Check the TV's internet connection, then try again.");
    T.eq(theirs.disabled, true, 'Dropout\'s button is still grey');
    box(p, 'tenfoot-signin-password').value = 'x';
    btn.click();
    await T.sleep(50);
    T.eq(posted.map((x) => x.step), ['next', 'password', 'password'], 'the second try was sent, straight to the password: Dropout\'s password step was already up for this email, so its hidden Next is not pressed again');
    // A grey button that is not "sending" is Dropout's to keep grey.
    const q = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
    const posted2 = wireDropout(q);
    q.$('signin-password-submit').disabled = true;
    box(q, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(q, 'tenfoot-signin-password').value = 'x';
    q.doc.querySelector('.tenfoot-signin-submit').click();
    await T.sleep(50);
    T.eq([posted2.map((x) => x.step), q.$('signin-password-submit').disabled], [['next'], true], 'left grey, not pressed');
  } finally {
    rules.pages.signin.signinMs = 20000;
  }
});

T.runAsync('sign-in: when Dropout does not answer, a line says so, the email stays and Sign in can be pressed again', async () => {
  rules.pages.signin.nextMs = 300;
  try {
    const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
    const posted = wireDropout(p, { silent: true });
    box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(p, 'tenfoot-signin-password').value = 'x';
    const btn = p.doc.querySelector('.tenfoot-signin-submit');
    btn.click();
    T.eq(btn.textContent, 'Signing in…');
    await T.sleep(500);
    T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, "Dropout isn't answering. Check the TV's internet connection, then try again.");
    T.eq([btn.textContent, box(p, 'tenfoot-signin-email').value], ['Sign in', 'fixture@example.test']);
    btn.click();
    await T.sleep(50);
    T.eq(posted.length, 2, 'pressed again');
  } finally {
    rules.pages.signin.nextMs = 15000;
  }
});

T.runAsync('sign-in: OK on Email opens the keyboard (email layout) and the sign-in screen moves up; typing; Done goes on to Password', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  T.notOk(kbOpen(p), 'closed to begin with');
  T.ok(p.key('Enter').defaultPrevented, 'OK is the keyboard\'s');
  T.ok(kbOpen(p));
  T.eq(p.doc.documentElement.getAttribute('data-tenfoot-keyboard'), 'on', 'for the CSS that lifts the screen');
  T.eq(p.doc.querySelectorAll('.tenfoot-kb [data-tenfoot-key="c:.com"], .tenfoot-kb [data-tenfoot-key="c:@gmail.com"]').length, 2, 'the email layout');
  T.eq(p.doc.activeElement.dataset.tenfootKey, 'c:a', 'the selection starts on the first letter');
  T.ok(p.hints().textContent.includes('Type'), 'the hint bar: ' + p.hints().textContent);
  // The remote's keys are the keyboard's: ▶ moves along it, OK types.
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.dataset.tenfootKey, 'c:b');
  p.key('Enter');
  T.eq(box(p, 'tenfoot-signin-email').value, 'b', 'typed into Leanback\'s own box');
  kbKey(p, 'c:@'); kbKey(p, 'c:a'); kbKey(p, 'c:.com');
  T.eq(box(p, 'tenfoot-signin-email').value, 'b@a.com');
  // The remote's Menu takes out the last letter; a real keyboard types too.
  p.key('ContextMenu');
  T.eq(box(p, 'tenfoot-signin-email').value, 'b@a.co', 'Menu is Backspace');
  p.key('m');
  T.eq(box(p, 'tenfoot-signin-email').value, 'b@a.com', 'a real keyboard types while it is up');
  // Done: the keyboard closes and Enter in the box happens: on to Password.
  kbKey(p, 'done');
  await T.sleep(20);
  T.notOk(kbOpen(p));
  T.eq(p.doc.documentElement.getAttribute('data-tenfoot-keyboard'), null);
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', 'Done in Email goes on to Password');
});

T.runAsync('sign-in: OK on Password opens it with Show; Done in Password presses Sign in; Escape closes it and the selection stays in the box', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const posted = wireDropout(p);
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password');
  p.key('Enter');
  T.ok(kbOpen(p) && p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="show"]'), 'the password layout');
  p.key('Escape');
  T.notOk(kbOpen(p));
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password', 'Back puts the selection back on the box');
  p.key('Enter');
  kbKey(p, 'c:s'); kbKey(p, 'c:e');
  T.eq(box(p, 'tenfoot-signin-password').value, 'se');
  kbKey(p, 'done');
  await T.sleep(100);
  T.eq(posted.map((x) => x.step), ['next', 'password'], 'Done in Password pressed Sign in: the hand-over began');
});

T.runAsync('sign-in: typing in a box with a real keyboard needs no on-screen one, and Enter is then the box\'s own; the next box starts untouched', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  p.key('a');
  p.key('Enter');
  T.notOk(kbOpen(p), 'typed in: Enter goes on, no keyboard');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-password');
  p.key('Enter');
  T.ok(kbOpen(p), 'Password was not typed in: OK opens the keyboard');
  p.key('Escape');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  p.key('Enter');
  T.ok(kbOpen(p), 'back in Email, the selection moving on cleared it: OK opens the keyboard again');
});

T.runAsync('sign-in: a pointer click on a box opens the keyboard (a script\'s own click does not)', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  const pw = box(p, 'tenfoot-signin-password');
  pw.click();
  T.notOk(kbOpen(p), 'no detail: a script\'s click');
  pw.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  T.ok(kbOpen(p));
  T.ok(p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="show"]'), 'for that box');
});

T.runAsync('reset: OK on Email opens the keyboard; Done presses Send reset email', async () => {
  const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password' });
  const posted = wireReset(p);
  p.key('Enter');
  T.ok(kbOpen(p));
  kbKey(p, 'c:a'); kbKey(p, 'c:@'); kbKey(p, 'c:b'); kbKey(p, 'c:.com');
  kbKey(p, 'done');
  await T.sleep(50);
  T.eq(posted.map((x) => x.email), ['a@b.com'], 'Done is Enter in the box: the reset went to Dropout\'s form');
});

T.runAsync('the keyboard is closed when Leanback is turned off, and a box that is not Leanback\'s own does not open it', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  p.key('Enter');
  T.ok(kbOpen(p));
  await p.shim.changeStorage({ settings: { newValue: { enabled: false } } });
  await T.sleep(20);
  T.notOk(kbOpen(p), 'closed');
  const q = await boot({ html: '<!doctype html><html><body><form><input id="email" data-rect="40,100,300,40"><button id="go" data-rect="40,160,100,40">Go</button></form></body></html>', url: 'https://watch.dropout.tv/settings' });
  q.$('email').focus();
  q.key('Enter');
  T.notOk(kbOpen(q), 'Dropout\'s own box on a page Leanback does not draw: Enter is the box\'s');
});

T.runAsync('after signing in: "Who is watching?" first (once, from whatever page Dropout goes to), and choosing a profile always ends on Home', async () => {
  // Just signed in; Dropout went back to the page that asked: the picker instead, once.
  const a = await boot({ html: fixture('video.html'), url: URLS.video, before: note('signed') });
  T.eq((await a.state()).navigation, rules.profilesUrl, 'the picker');
  T.ok(/^forced:/.test(a.win.sessionStorage.getItem(HOME_KEY)), 'forced once');
  // Sent to the picker, Dropout took the viewer away from it again (one profile): Home, not the picker again.
  const b = await boot({ html: fixture('video.html'), url: URLS.video, before: note('forced') });
  T.eq([(await b.state()).navigation, b.win.sessionStorage.getItem(HOME_KEY)], [rules.browseUrl, null], 'Home instead');
  // The picker holds the note (signed, forced): the viewer is where they should be.
  for (const stage of ['signed', 'forced', 'chose']) {
    const pick = await boot({ html: fixture('profiles.html'), url: PICK, before: note(stage) });
    T.eq([(await pick.state()).navigation, pick.win.sessionStorage.getItem(HOME_KEY) !== null], [null, true], `the picker is part of the flow (${stage})`);
  }
  // A profile was chosen: whatever Dropout opens next, Home.
  const c = await boot({ html: fixture('video.html'), url: URLS.video, before: note('chose') });
  T.eq([(await c.state()).navigation, c.win.sessionStorage.getItem(HOME_KEY)], [rules.browseUrl, null], 'Home, once');
  const home = await boot({ html: fixture('browse.html'), url: URLS.browse, before: note('chose') });
  T.eq([(await home.state()).navigation, home.win.sessionStorage.getItem(HOME_KEY)], [null, null], 'already Home: nothing to do');
  // Not in a sign-in: nothing moves.
  const q = await boot({ html: fixture('video.html'), url: URLS.video });
  T.eq((await q.state()).navigation, null);
  // A note that lapsed (two minutes) is not acted on.
  const old = await boot({ html: fixture('video.html'), url: URLS.video, before: note('chose', 121000) });
  T.eq([(await old.state()).navigation, old.win.sessionStorage.getItem(HOME_KEY)], [null, null]);
  // Still signed out: the sign-in did not work, nothing moves.
  const out = await boot({ html: signedOutVideo(), url: URLS.video, before: note('signed') });
  T.eq([(await out.state()).navigation, out.win.sessionStorage.getItem(HOME_KEY)], [null, null]);
});

T.runAsync('"Dropout signed you out": a page loading signed in sets the flag (this TV was signed in — and nothing else of the account); signed out with the flag, a question, once per tab; Not now closes the tab', async () => {
  // Signed in: the flag.
  const a = await boot({ html: fixture('home.html'), url: URLS.browse });
  await T.sleep(50);
  T.eq(a.shim.store.signedIn, true, 'a flag only');
  T.eq(Object.keys(a.shim.store).filter((k) => /email|password|token|account|user/i.test(k)), [], 'no account details');
  // Signed out with the flag: asked.
  const p = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true } });
  await T.sleep(50);
  T.ok(askOpen(p), 'the question');
  T.eq(p.doc.querySelector('.tenfoot-ask-title').textContent, 'Dropout signed you out.');
  T.eq([...p.doc.querySelectorAll('.tenfoot-ask-button')].map((b) => b.textContent), ['Sign in', 'Not now']);
  T.eq(p.doc.activeElement.textContent, 'Sign in', 'Sign in selected');
  p.key('Enter');
  await T.sleep(20);
  T.eq((await p.state()).navigation, rules.signinUrl, 'OK goes to sign-in (the picker, then Home, follow it)');
  // Once per tab: the same tab, the next page, no question.
  const again = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true }, before: (win) => win.sessionStorage.setItem('tenfoot.signedout-asked', '1') });
  await T.sleep(50);
  T.notOk(askOpen(again), 'asked already in this tab');
  // Not now: it closes, nothing moves, the flag stays for another tab.
  const q = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true } });
  await T.sleep(50);
  q.key('ArrowRight');
  T.eq(q.doc.activeElement.textContent, 'Not now');
  q.key('Enter');
  await T.sleep(20);
  T.notOk(askOpen(q));
  T.eq([(await q.state()).navigation, q.shim.store.signedIn], [null, true]);
  T.eq(q.bg.filter((m) => m.type === 'exit'), [{ type: 'exit', force: true }], 'Not now: the tab is asked to close (Dropout does not work signed out), whatever Back On Home says');
  T.eq(p.bg.filter((m) => m.type === 'exit'), [], 'Sign in does not close anything');
});

T.runAsync('"Dropout signed you out": not asked without the flag, on the sign-in and reset screens and the policies, or while signing in', async () => {
  const none = await boot({ html: signedOutVideo(), url: URLS.video });
  await T.sleep(50);
  T.notOk(askOpen(none), 'never signed in on this TV');
  for (const [html, url] of [[SIGNIN, 'https://watch.dropout.tv/login'], [RESET, 'https://watch.dropout.tv/forgot_password']]) {
    const s = await boot({ html, url, store: { signedIn: true } });
    await T.sleep(50);
    T.notOk(askOpen(s), `not on ${url}: it has its own Sign in`);
  }
  const mid = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true }, before: note('signed') });
  await T.sleep(50);
  T.notOk(askOpen(mid), 'not in the middle of signing in');
});

T.runAsync('"Dropout signed you out": every sign-out clears the flag — Leanback\'s own Sign Out, Dropout\'s own Log out form, the /logout address — so a sign-out on purpose is never reported', async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK, store: { signedIn: true } });
  const form = p.doc.createElement('form');
  form.action = 'https://watch.dropout.tv/logout';
  form.method = 'post';
  p.doc.body.appendChild(form);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.dispatchEvent(new p.win.Event('submit', { bubbles: true, cancelable: true }));
  await T.sleep(20);
  T.eq(p.shim.store.signedIn, undefined, 'Dropout\'s own Log out form');
  const q = await boot({ html: fixture('video.html'), url: 'https://watch.dropout.tv/logout', store: { signedIn: true } });
  await T.sleep(50);
  T.eq(q.shim.store.signedIn, undefined, 'the /logout address');
  const s = await boot({ html: fixture('profiles.html'), url: PICK, store: { signedIn: true } });
  let sent = null;
  s.win.HTMLFormElement.prototype.submit = function () { sent = this.action; };
  for (let i = 0; i < 3; i += 1) s.key('ArrowRight');
  T.eq(s.doc.activeElement, pickCards(s)[4].querySelector('a'));
  s.key('Enter');
  s.key('ArrowRight');
  s.key('Enter');
  await T.sleep(50);
  T.eq([sent, s.shim.store.signedIn], ['https://watch.dropout.tv/logout', undefined], 'Leanback\'s Sign Out: the flag goes first, then Dropout\'s sign-out is sent');
});

T.runAsync('sign-in: pressing Dropout\'s Sign in notes that the picker comes next; a failed sign-in takes the note back', async () => {
  rules.pages.signin.signinMs = 300;
  try {
    const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
    wireDropout(p, { hang: true });
    box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(p, 'tenfoot-signin-password').value = 'a-password';
    p.doc.querySelector('.tenfoot-signin-submit').click();
    await T.sleep(60);
    T.ok(/^signed:\d+$/.test(p.win.sessionStorage.getItem(HOME_KEY) || ''), 'noted while Dropout\'s Sign in is pending');
    await T.sleep(400);
    T.eq(p.win.sessionStorage.getItem(HOME_KEY), null, 'no answer, the page did not move on: nothing to go Home for');
    // An error of Dropout's takes it back at once.
    const q = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
    wireDropout(q, { wrong: true });
    box(q, 'tenfoot-signin-email').value = 'fixture@example.test';
    box(q, 'tenfoot-signin-password').value = 'wrong-password';
    q.doc.querySelector('.tenfoot-signin-submit').click();
    await T.sleep(100);
    T.eq(q.win.sessionStorage.getItem(HOME_KEY), null, 'Dropout said no');
  } finally {
    rules.pages.signin.signinMs = 20000;
  }
});

T.runAsync('sign-in: turning Leanback off takes the screen away', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  T.ok(p.doc.querySelector('.tenfoot-signin'));
  await p.shim.changeStorage({ settings: { newValue: { enabled: false } } });
  T.notOk(p.doc.querySelector('.tenfoot-signin'), 'gone');
});

T.runAsync('reset: Leanback\'s own screen — Reset password, an Email box, Send reset email, Back to sign in, the typing line and the policies; the selection starts in Email', async () => {
  const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password' });
  T.eq((await p.state()).kind, 'reset');
  const layer = p.doc.querySelector('.tenfoot-signin');
  T.ok(layer && layer.parentNode === p.doc.documentElement, 'a layer of its own');
  T.eq(layer.querySelector('h1').textContent, 'Reset password');
  const email = layer.querySelector('#tenfoot-signin-email');
  T.eq([email.type, email.name, email.getAttribute('autocomplete')], ['email', 'email', 'username']);
  T.notOk(layer.querySelector('input[type=password]'), 'no password box');
  T.eq([...layer.querySelectorAll('.tenfoot-signin-buttons > *')].map((b) => [b.textContent, b.getAttribute('href')]), [['Send reset email', null], ['Back to sign in', rules.signinUrl]]);
  T.ok(layer.querySelector('.tenfoot-hero-primary').textContent === 'Send reset email', 'yellow');
  T.eq(layer.querySelector('.tenfoot-signin-note').textContent, 'Press OK on a box to type with the remote, or use a keyboard.');
  T.eq([...layer.querySelectorAll('.tenfoot-signin-links a')].map((a) => a.textContent), rules.legal.map((l) => l.label));
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Send reset email');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Back to sign in');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Privacy Policy');
});

T.runAsync('the email typed on the sign-in screen goes with the viewer to the reset screen and back — and no further', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
  const forgot = p.doc.querySelector('.tenfoot-signin-forgot');
  forgot.addEventListener('click', (e) => e.preventDefault());
  forgot.click();
  T.eq(p.win.sessionStorage.getItem('tenfoot.signin-email'), 'fixture@example.test', 'kept for the next screen');
  const kept = (win) => win.sessionStorage.setItem('tenfoot.signin-email', 'fixture@example.test');
  const r = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password', before: kept });
  T.eq(box(r, 'tenfoot-signin-email').value, 'fixture@example.test', 'the reset screen holds it');
  const back = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login', before: kept });
  T.eq([box(back, 'tenfoot-signin-email').value, back.doc.activeElement.id], ['fixture@example.test', 'tenfoot-signin-password'], 'and the sign-in screen starts in Password');
  // Any other page forgets it.
  const home = await boot({ html: fixture('home.html'), url: 'https://watch.dropout.tv/browse', before: (win) => { kept(win); win.sessionStorage.setItem('tenfoot.reset-asked', '1'); } });
  T.eq([home.win.sessionStorage.getItem('tenfoot.signin-email'), home.win.sessionStorage.getItem('tenfoot.reset-asked')], [null, null], 'gone on a page that is not one of the two');
});

T.runAsync('reset: Send reset email hands the email to Dropout\'s own form; "Sending…" meanwhile; the ask is noted before Dropout\'s page moves on', async () => {
  rules.pages.reset.answerMs = 300;
  try {
    const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password' });
    const posted = wireReset(p);
    box(p, 'tenfoot-signin-email').value = 'fixture@example.test';
    const btn = p.doc.querySelector('.tenfoot-signin-submit');
    btn.click();
    T.eq(btn.textContent, 'Sending…');
    T.eq(posted, [{ email: 'fixture@example.test', asked: '1' }], 'the email in Dropout\'s box, pressed, the ask already noted');
    T.eq(p.win.sessionStorage.getItem('tenfoot.signin-email'), 'fixture@example.test', 'the email is kept for the page Dropout answers with');
    btn.click();
    T.eq(posted.length, 1, 'not pressed twice');
    // Dropout\'s page stays and says nothing: no answer.
    await T.sleep(500);
    T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, "Dropout isn't answering. Check the TV's internet connection, then try again.");
    T.eq([btn.textContent, box(p, 'tenfoot-signin-email').value, p.win.sessionStorage.getItem('tenfoot.reset-asked')], ['Send reset email', 'fixture@example.test', null], 'the email kept, the ask forgotten');
  } finally {
    rules.pages.reset.answerMs = 15000;
  }
});

T.runAsync('reset: Dropout\'s error, an empty box and a bad email are said on the screen', async () => {
  const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password' });
  const posted = wireReset(p, { error: 'We could not find an account with that email.' });
  const btn = p.doc.querySelector('.tenfoot-signin-submit');
  btn.click();
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Enter your email.');
  box(p, 'tenfoot-signin-email').value = 'nope';
  btn.click();
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'Please enter a valid email.');
  T.eq(posted, [], 'nothing reached Dropout\'s form');
  box(p, 'tenfoot-signin-email').value = 'unknown@example.test';
  btn.click();
  await T.sleep(100);
  T.eq(p.doc.querySelector('.tenfoot-signin-error').textContent, 'We could not find an account with that email.', 'Dropout\'s words');
  T.eq([p.doc.activeElement.id, p.win.sessionStorage.getItem('tenfoot.reset-asked')], ['tenfoot-signin-email', null]);
});

T.runAsync('reset: back from Dropout\'s answer, the screen says what to do next, leaves out the box and the button, and selects Back to sign in', async () => {
  const asked = (win) => win.sessionStorage.setItem('tenfoot.reset-asked', '1');
  const p = await boot({ html: RESET, url: 'https://watch.dropout.tv/forgot_password', before: asked });
  const msg = p.doc.querySelector('.tenfoot-signin-error');
  T.eq([msg.hidden, msg.textContent], [false, 'Check your email on your phone or computer. Set the new password there, then sign in here.']);
  T.eq(msg.dataset.tone, 'notice');
  T.ok(p.doc.querySelector('.tenfoot-signin-field').hidden && p.doc.querySelector('.tenfoot-signin-submit').hidden, 'no box, no button');
  T.eq(p.doc.activeElement.textContent, 'Back to sign in');
  T.eq(p.win.sessionStorage.getItem('tenfoot.reset-asked'), null, 'said once');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.textContent, 'Back to sign in', 'nothing above it to stop on');
  // Dropout shows an error on its page instead: that is what is said.
  const err = RESET.replace('flash-msg-container is-hidden"><div class="flash-msg"></div>', 'flash-msg-container"><div class="flash-msg">Too many requests.</div>');
  const q = await boot({ html: err, url: 'https://watch.dropout.tv/forgot_password', before: asked });
  const m2 = q.doc.querySelector('.tenfoot-signin-error');
  T.eq([m2.textContent, m2.dataset.tone, q.doc.activeElement.id], ['Too many requests.', 'error', 'tenfoot-signin-email']);
  // Dropout sends a reset to the sign-in page: the same words there.
  const s = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login', before: asked });
  T.eq([s.doc.querySelector('.tenfoot-signin-error').textContent, s.doc.querySelector('.tenfoot-signin-error').dataset.tone], ['Check your email on your phone or computer. Set the new password there, then sign in here.', 'notice']);
});

T.runAsync("cookie dialog: on a first visit the selection starts on Accept All (rules: common.modalStart); OK accepts and the selection goes back to the form", async () => {
  const ketch = '<div id="ketch-banner" data-rect="680,392,560,296"><button aria-label="close banner" data-rect="700,412,36,36"></button>' +
    '<a href="https://example.test/privacy" data-rect="795,590,85,20">Privacy Policy</a>' +
    '<button id="ketch-banner-button-primary" data-rect="1119,464,100,40">Accept All</button><button id="ketch-banner-button-secondary" data-rect="1058,516,162,40">Customize Settings</button></div>';
  const p = await boot({ html: SIGNIN.replace('</body>', `${ketch}</body>`), url: 'https://watch.dropout.tv/login' });
  T.eq(p.doc.activeElement.id, 'ketch-banner-button-primary');
  T.ok(p.$('ketch-banner').hasAttribute('data-tenfoot-dialog'), 'the dialog, for the CSS that lifts it over the welcome');
  p.$('ketch-banner-button-primary').addEventListener('click', () => p.$('ketch-banner').remove());
  p.key('Enter');
  await T.sleep(200);
  T.eq(p.doc.activeElement.id, 'tenfoot-signin-email');
});

T.runAsync('cookie dialog with a focus trap, opening over a Leanback screen: the dialog keeps the focus, no tug of war', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  T.eq(p.doc.activeElement.textContent, 'Watch');
  p.doc.body.insertAdjacentHTML('beforeend', '<div id="ketch-banner" data-rect="680,392,560,296"><button id="ketch-banner-button-primary" data-rect="1119,464,100,40">Accept All</button></div>');
  const banner = p.$('ketch-banner');
  // Ketch's trap: the focus leaving the banner is sent straight back, at once.
  let trapped = 0;
  p.doc.addEventListener('focusin', (e) => {
    if (banner.isConnected && !banner.contains(e.target)) {
      trapped += 1;
      p.$('ketch-banner-button-primary').focus();
    }
  });
  p.$('ketch-banner-button-primary').focus(); // before the page script has seen it open
  await T.sleep(50);
  T.eq(p.doc.activeElement.id, 'ketch-banner-button-primary');
  T.ok(banner.hasAttribute('data-tenfoot-dialog'), 'known as the dialog');
  T.ok(trapped <= 1, `the trap sent the focus back ${trapped} time(s)`);
  banner.remove();
  await T.sleep(200);
  T.eq(p.doc.activeElement.textContent, 'Watch', 'gone: the selection back where it was');
});

T.runAsync('signed out: the first Home of the tab goes on to the welcome, once; the rail\'s top entry is Sign in', async () => {
  const html = fs.readFileSync(path.join(T.testsDir, 'fixtures', 'home.html'), 'utf8')
    .replace('<body class="browse logged-in">', '<body class="browse logged-out">')
    .replace(/<div class="user-actions has-image">[\s\S]*?<\/div><\/div>/, '');
  const p = await boot({ html, url: 'https://watch.dropout.tv/browse' });
  T.eq((await p.state()).navigation, rules.welcomeUrl);
  T.eq(p.win.sessionStorage.getItem('tenfoot.signin-offered'), '1');
  const again = await boot({ html, url: 'https://watch.dropout.tv/browse', before: (win) => win.sessionStorage.setItem('tenfoot.signin-offered', '1') });
  T.eq((await again.state()).navigation, null, 'Back from the welcome, or its Browse: Home stays');
  const top = again.doc.querySelector('.tenfoot-rail-item');
  T.eq([top.dataset.tenfootRail, top.getAttribute('aria-label'), top.dataset.tenfootStart], ['signin', 'Sign in', 'true']);
});

await T.exit();
