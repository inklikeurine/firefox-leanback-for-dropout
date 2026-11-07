// content/page.js on the profile picker, Manage profiles, Add Profile and Edit Profile.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { rules, fixture, kbOpen, kbKey, boot, watch, PICK, pickCards, MANAGING, editOf, ADD, EDIT, wireEdit, saveBtn, profileApi, box } from './page-support.mjs';

T.runAsync('profiles: Leanback draws the picker — "Who is watching?", the profiles in one row, the one watching marked and selected; Manage Profiles and Sign Out at the end', async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const s = await p.state();
  T.eq(s.kind, 'profiles');
  T.eq(p.last('profile:current').profile, 1, 'the page told the background which profile is watching');
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.eq([layer.hidden, layer.dataset.tenfootScreen, layer.dataset.tenfootNorail], [false, 'profiles', undefined], 'drawn, centred, with room for the rail');
  T.eq(p.doc.documentElement.dataset.tenfootRail, 'on', 'the rail, as on every screen but signing in and playing');
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Who is watching?');
  T.eq(pickCards(p).map((c) => c.querySelector('.tenfoot-card-title').textContent), ['Alex', 'Sam', 'robin', '', ''], 'the profiles, then Manage Profiles and Sign Out; no Add Profile');
  T.eq(pickCards(p)[1].querySelector('.tenfoot-card-sub').textContent, 'Watching now');
  T.eq(pickCards(p)[0].querySelector('.tenfoot-card-art').getAttribute('src'), 'https://fixture.test/art-1.svg');
  T.eq([pickCards(p)[2].dataset.tenfootInitial, pickCards(p)[2].querySelector('.tenfoot-card-viewall').textContent], ['true', 'R'], 'no picture: its first letter');
  T.eq(pickCards(p).slice(3).map((c) => c.querySelector('.tenfoot-card-viewall').textContent), ['Manage Profiles', 'Sign Out']);
  T.notOk(pickCards(p)[3].querySelector('a').hasAttribute('href'), "Manage Profiles presses Dropout's own button");
  T.ok(pickCards(p).every((c) => c.querySelector('.tenfoot-card-action').hidden), 'no Edit buttons while picking');
  T.eq(p.doc.activeElement, pickCards(p)[1].querySelector('a'), 'the selection on the profile watching');
});

T.runAsync("profiles: OK on a profile presses Dropout's own button for it; ◀ ▶ along the row; ▶ at its end goes round to the start; ◀ at the start is the rail", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const pressed = [];
  for (const id of ['p0', 'p1', 'p2', 'add', 'manage']) p.$(id).addEventListener('click', () => pressed.push(id));
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement, pickCards(p)[0].querySelector('a'));
  p.key('Enter');
  T.eq(pressed, ['p0'], "Dropout's button, which saves the choice and goes on to Browse");
  T.ok(/^chose:\d+$/.test(p.win.sessionStorage.getItem('tenfoot.signin-home') || ''), 'and Home is noted as what comes next');
  T.eq((await p.state()).navigation, null, 'Leanback itself goes nowhere');
  p.key('ArrowRight'); p.key('ArrowRight');
  p.key('Enter');
  T.eq(pressed, ['p0', 'p2']);
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(p.doc.activeElement, pickCards(p)[4].querySelector('a'), 'Sign Out, last');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement, pickCards(p)[0].querySelector('a'), '▶ at the end: the first profile');
  p.key('ArrowLeft');
  T.eq((await p.state()).rail.active, true, '◀ at the start: the rail');
});

T.runAsync('profiles: Sign Out asks first, Cancel selected; Back keeps you signed in; Sign Out sends Dropout\'s own sign-out with the page\'s token', async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const sent = [];
  p.win.HTMLFormElement.prototype.submit = function () { sent.push({ action: this.action, method: this.method, token: this.querySelector('input[name="authenticity_token"]').value }); };
  for (let i = 0; i < 3; i++) p.key('ArrowRight');
  T.eq(p.doc.activeElement, pickCards(p)[4].querySelector('a'));
  p.key('Enter');
  const box = p.doc.querySelector('.tenfoot-ask');
  T.notOk(box.hidden, 'the question');
  T.eq(box.querySelector('.tenfoot-ask-title').textContent, 'Sign out of Dropout?');
  T.eq(p.doc.activeElement.textContent, 'Cancel', 'the safe answer selected');
  p.key('Escape');
  await T.sleep(20);
  T.ok(box.hidden, 'Back: no answer');
  T.eq(p.doc.activeElement, pickCards(p)[4].querySelector('a'), 'and the selection back on Sign Out');
  T.eq(sent, []);
  p.key('Enter');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Sign Out');
  p.key('Enter');
  await T.sleep(20);
  T.eq(sent, [{ action: 'https://watch.dropout.tv/logout', method: 'post', token: 'fixture-token' }]);
});

T.runAsync('profiles: before Dropout has drawn the picker, the screen waits for it', async () => {
  let row = null;
  const p = await boot({ html: fixture('profiles.html'), url: PICK, before: (win) => { const app = win.document.getElementById('profile-picker-react-app'); row = app.firstElementChild; row.remove(); } });
  T.ok(p.doc.documentElement.hasAttribute('data-tenfoot-pending'), "Dropout's page kept hidden meanwhile");
  p.doc.getElementById('profile-picker-react-app').appendChild(row);
  await T.sleep(200);
  T.eq(pickCards(p).length, 5);
  T.notOk(p.doc.documentElement.hasAttribute('data-tenfoot-pending'));
  T.eq(p.doc.activeElement, pickCards(p)[1].querySelector('a'));
});

T.runAsync("profiles: Manage Profiles presses Dropout's own; the picker becomes Manage profiles — an Edit button under each, then Add Profile and Done", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  // Dropout's button turns the picker into Manage profiles, in place.
  p.$('manage').addEventListener('click', () => {
    p.doc.querySelector('h1 span').textContent = 'Manage profiles';
    p.$('manage').firstElementChild.textContent = 'Done';
  });
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(p.doc.activeElement, pickCards(p)[3].querySelector('a'));
  p.key('Enter');
  await T.sleep(200);
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Manage profiles');
  T.eq(pickCards(p).map((c) => c.querySelector('.tenfoot-card-title').textContent), ['Alex', 'Sam', 'robin', '', '']);
  T.eq(pickCards(p).slice(0, 3).map((c) => [editOf(c).hidden, editOf(c).textContent]), [[false, 'Edit'], [false, 'Edit'], [false, 'Edit']]);
  T.eq(p.doc.activeElement, pickCards(p)[3].querySelector('a'), 'the selection where it was: Add Profile, now');
  T.eq(pickCards(p).slice(3).map((c) => c.querySelector('.tenfoot-card-viewall').textContent), ['Add Profile', 'Done'], 'no Sign Out while managing');
  T.eq((await p.state()).navigation, null, 'the same page throughout');
});

T.runAsync("profiles: opened as Manage profiles (?edit=1, which Dropout takes off the address), it is drawn at once; the selection on the profile, ▼ its Edit button, ▲ back; OK on either presses Dropout's own", async () => {
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK });
  T.notOk(p.doc.documentElement.hasAttribute('data-tenfoot-pending'), 'not left waiting for a picker');
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Manage profiles');
  const pressed = [];
  for (const id of ['p0', 'p1', 'p2', 'add', 'manage']) p.$(id).addEventListener('click', () => pressed.push(id));
  const pic = (i) => pickCards(p)[i].querySelector('a');
  T.eq(p.doc.activeElement, pic(1), 'on the profile watching, its picture');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement, editOf(pickCards(p)[1]), '▼: its Edit button');
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement, editOf(pickCards(p)[0]), '◀: the Edit button before');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement, pic(0), '▲: back up to its profile');
  p.key('ArrowRight');
  p.key('Enter');
  await T.sleep(20);
  T.eq(pressed, ['p1'], 'OK on the picture, with no API of Dropout\'s on the page: Dropout\'s own button');
  p.key('ArrowDown');
  p.key('Enter');
  T.eq(pressed, ['p1', 'p1'], 'OK on Edit: Edit Profile');
  p.key('ArrowUp');
  p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(p.doc.activeElement, pic(3), 'Add Profile');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement, pic(3), '▼ from Add Profile: nothing under it, so it stays');
  p.key('Enter');
  p.key('ArrowRight');
  p.key('Enter');
  T.eq(pressed, ['p1', 'p1', 'add', 'manage'], 'Add Profile, Done');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement, pic(0), '▶ at the end: round to the first');
});

T.runAsync("Add Profile: Leanback's own screen — the picture, the name box, Cancel then Continue — each pressing Dropout's own", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  const picker = app.firstElementChild;
  picker.remove();
  app.insertAdjacentHTML('beforeend', ADD);
  p.win.history.replaceState(null, '', `${PICK}#/add`);
  await T.sleep(200);
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.eq([layer.hidden, layer.dataset.tenfootScreen], [false, 'profileForm']);
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Add Profile');
  T.eq(p.doc.querySelector('.tenfoot-hero-text').textContent, 'Add a profile for another person watching Dropout');
  T.eq([...p.doc.querySelectorAll('.tenfoot-hero-action')].map((b) => b.textContent), ['Cancel', 'Continue'], 'Cancel first, as you asked');
  T.ok(p.doc.activeElement.classList.contains('tenfoot-screen-field-input'), 'the selection starts in the name box');
  const pressed = [];
  for (const id of ['pic', 'cont', 'cancel']) p.$(id).addEventListener('click', () => pressed.push(id));
  const box = p.doc.activeElement;
  box.value = 'Kim';
  box.dispatchEvent(new p.win.Event('input', { bubbles: true }));
  T.eq(p.$('pname').value, 'Kim', 'typed into Dropout\'s own box');
  p.key('ArrowUp');
  p.key('Enter');
  T.eq(pressed, ['pic'], 'the picture: Dropout\'s chooser');
  p.key('ArrowDown'); p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Cancel');
  p.key('ArrowRight');
  p.key('Enter');
  T.eq(pressed, ['pic', 'cont']);
  p.$('addform').remove();
  app.appendChild(picker);
  p.win.history.replaceState(null, '', PICK);
  await T.sleep(200);
  T.eq(pickCards(p).length, 5, 'back to the picker');
});

T.runAsync("profiles: a PIN-locked profile's PIN screen (Dropout's own form, four digit boxes): OK on a box opens the number pad, the digits fill the boxes in turn as Dropout moves on from box to box, Done presses Dropout's button", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  app.firstElementChild.remove();
  app.insertAdjacentHTML('beforeend', '<div class="LockedProfilePinScreen-module__root"><h1>Enter your PIN</h1><div><input id="d1" inputmode="numeric" maxlength="1" data-rect="500,300,60,60"><input id="d2" inputmode="numeric" maxlength="1" data-rect="570,300,60,60"><input id="d3" inputmode="numeric" maxlength="1" data-rect="640,300,60,60"><input id="d4" inputmode="numeric" maxlength="1" data-rect="710,300,60,60"></div><button id="pinok" type="submit" data-rect="500,400,200,40">Continue</button></div>');
  // Dropout's own app: each digit puts the focus on the next box.
  const boxes = ['d1', 'd2', 'd3', 'd4'].map((id) => p.$(id));
  boxes.forEach((b, i) => b.addEventListener('input', () => { if (b.value && boxes[i + 1]) boxes[i + 1].focus(); }));
  let pressed = 0;
  p.$('pinok').addEventListener('click', (e) => { e.preventDefault(); pressed += 1; });
  await T.sleep(200);
  T.notOk(p.doc.querySelector('.tenfoot-screen'), 'no screen over the form');
  boxes[0].focus();
  T.ok(p.key('Enter').defaultPrevented);
  T.ok(kbOpen(p), 'OK on a PIN box');
  T.ok(p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="c:7"]') && !p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="c:q"]'), 'a number pad');
  for (const d of ['3', '1', '4']) { kbKey(p, 'c:' + d); await T.sleep(5); }
  T.eq(boxes.map((b) => b.value), ['3', '1', '4', ''], 'the digits in turn');
  T.ok(p.doc.querySelector('.tenfoot-kb').contains(p.doc.activeElement) || kbOpen(p), 'the keyboard keeps the selection while Dropout moves the focus along its boxes');
  kbKey(p, 'c:1');
  kbKey(p, 'done');
  await T.sleep(30);
  T.notOk(kbOpen(p));
  T.eq([boxes.map((b) => b.value).join(''), pressed], ['3141', 1], 'Done: Dropout\'s own button');
});

T.runAsync("profiles: a PIN is Dropout's own form — Leanback steps aside and drives it", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  app.firstElementChild.remove();
  app.insertAdjacentHTML('beforeend', '<div id="pin"><h1>Enter your PIN</h1><input id="d1" inputmode="numeric" data-rect="500,300,60,60"><button id="back" data-rect="400,200,40,40">Back</button></div>');
  await T.sleep(200);
  T.notOk(p.doc.querySelector('.tenfoot-screen'), 'no screen over the form');
  T.ok(['d1', 'back'].includes(p.doc.activeElement.id), `on the form: ${p.doc.activeElement.id}`);
});

T.runAsync("Edit Profile: Leanback's own screen — the picture, the name, Save, Cancel, Delete Profile; the selection starts on the name", async () => {
  const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
  T.eq((await p.state()).kind, 'profileEdit');
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.eq([layer.hidden, layer.dataset.tenfootScreen], [false, 'profileForm']);
  T.eq(p.doc.querySelector('.tenfoot-screen-title').textContent, 'Edit Profile');
  T.eq([...p.doc.querySelectorAll('.tenfoot-hero-action')].map((b) => [b.textContent, b.dataset.tenfootDanger || '']), [['Save', ''], ['Cancel', ''], ['Delete Profile', 'true']]);
  T.eq(p.doc.activeElement.value, 'Sam', 'on the name');
  T.eq(p.doc.documentElement.dataset.tenfootRail, 'on', 'with the rail');
  const pressed = [];
  for (const id of ['pic', 'save', 'cancel']) p.$(id).addEventListener('click', (e) => { e.preventDefault(); pressed.push(id); });
  p.key('ArrowDown');
  p.key('Enter');
  T.eq(pressed, ['save']);
});

T.runAsync("Edit Profile: OK on the name opens the keyboard (text layout), what is typed goes into Dropout's box, the screen lifts so the box stays above it; Escape closes it without asking to leave; Done goes down to the buttons", async () => {
  const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
  const name = p.doc.activeElement;
  T.eq(name.value, 'Sam');
  // The box would sit behind the keyboard: 100 px of it.
  name.getBoundingClientRect = () => ({ left: 0, top: 640, right: 400, bottom: 700, width: 400, height: 60 });
  const origPanel = p.doc.querySelector('.tenfoot-kb-panel').getBoundingClientRect;
  p.doc.querySelector('.tenfoot-kb-panel').getBoundingClientRect = () => ({ left: 0, top: 630, right: 1280, bottom: 768, width: 1280, height: 138 });
  T.ok(p.key('Enter').defaultPrevented);
  T.ok(kbOpen(p), 'OK on the name box');
  T.eq(p.doc.activeElement.dataset.tenfootKey, 'c:a', 'the selection starts on the first letter');
  T.eq(p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="space"]') !== null && p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="show"]') === null, true, 'the text layout');
  T.eq(p.doc.querySelector('.tenfoot-home-scroll').style.transform, '', 'the panel is beside the form: nothing moves up');
  kbKey(p, 'c:a'); kbKey(p, 'c:m');
  T.eq([name.value, p.$('profile-name').value], ['Sam' + 'am', 'Samam'], 'into Dropout\'s own box');
  kbKey(p, 'backspace'); kbKey(p, 'backspace');
  T.eq(p.$('profile-name').value, 'Sam');
  // Escape: the keyboard, not "Leave without saving?".
  p.key('Escape');
  await T.sleep(10);
  T.notOk(kbOpen(p));
  T.ok(p.doc.querySelector('.tenfoot-ask').hidden, 'no question asked');
  T.eq(p.doc.activeElement, name, 'the selection back on the box');
  const pressed = [];
  for (const id of ['pic', 'save', 'cancel']) p.$(id).addEventListener('click', (e) => { e.preventDefault(); pressed.push(id); });
  p.key('Enter');
  kbKey(p, 'done');
  await T.sleep(30);
  T.eq(p.doc.activeElement.textContent, 'Save', 'Done is Enter in the box: down to the buttons');
  p.doc.querySelector('.tenfoot-kb-panel').getBoundingClientRect = origPanel;
});

T.runAsync("Edit Profile: a good Save closes the screen at once — Dropout's toast saying saved is enough, no waiting; with only a grey Save it waits just the settle — through Dropout's own Cancel, once, with no question", async () => {
  rules.screen.profileForm.edit.saveSettleMs = 300;
  try {
    // Dropout greys Save and says so in a toast.
    const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    const sent = wireEdit(p, { toast: 'Profile saved.' });
    const name = p.doc.activeElement;
    name.value = 'Samuel';
    name.dispatchEvent(new p.win.Event('input', { bubbles: true }));
    await T.sleep(250);
    p.key('ArrowDown'); p.key('Enter');
    await T.sleep(30);
    T.eq(sent.cancelled, 1, 'closed at once: Dropout\'s own Cancel pressed within a moment of the save, not after the settle');
    T.ok(p.doc.querySelector('.tenfoot-ask').hidden, 'with no "Leave without saving?"');
    await T.sleep(400);
    T.eq(sent.cancelled, 1, 'once');
    // Dropout only greys Save (no toast): the settle, then the same.
    const q = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    const qsent = wireEdit(q);
    const qn = q.doc.activeElement;
    qn.value = 'Samuel';
    qn.dispatchEvent(new q.win.Event('input', { bubbles: true }));
    await T.sleep(250);
    q.key('ArrowDown'); q.key('Enter');
    await T.sleep(100);
    T.eq(qsent.cancelled, 0, 'greyed while it sends is not yet saved');
    await T.sleep(400);
    T.eq(qsent.cancelled, 1, 'greyed and staying greyed: saved, closed');
  } finally {
    rules.screen.profileForm.edit.saveSettleMs = 800;
  }
});

T.runAsync("Edit Profile: Save is grey until the name has changed — Dropout switching it on with only its disabled attribute counts — then yellow; OK says Saved with a tick, then it is grey again", async () => {
  const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
  const sent = wireEdit(p, { toast: 'Profile saved.' });
  await T.sleep(150);
  T.eq(saveBtn(p).getAttribute('aria-disabled'), 'true', 'nothing to save: grey');
  const name = p.doc.activeElement;
  name.value = 'Samuel';
  name.dispatchEvent(new p.win.Event('input', { bubbles: true }));
  await T.sleep(250);
  T.eq([p.$('save').disabled, saveBtn(p).getAttribute('aria-disabled')], [false, null], 'Dropout enabled Save by its disabled attribute alone: Leanback\'s button is ready');
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.textContent, 'Save');
  p.key('Enter');
  await T.sleep(1100);
  T.eq(sent, ['Samuel'], 'Dropout\'s own Save was pressed once');
  const b = saveBtn(p);
  T.eq([b.textContent, b.dataset.tenfootAction, b.getAttribute('aria-disabled')], ['Saved!', 'save', null], 'Saved! on the button, and not grey');
  T.notOk(p.hints().textContent.includes('saved'), 'no notice at the bottom: ' + p.hints().textContent);
  const meta = p.doc.querySelector('.tenfoot-hero-meta');
  T.ok(!meta || meta.hidden || meta.textContent === '', 'and no "Profile saved." under the title, though Dropout\'s toast says it: ' + (meta && meta.textContent));
  // Changing the name again: Save is ready again, not Saved.
  name.value = 'Samuel2';
  name.dispatchEvent(new p.win.Event('input', { bubbles: true }));
  await T.sleep(250);
  T.eq(saveBtn(p).textContent, 'Save');
  T.eq(saveBtn(p).getAttribute('aria-disabled'), null);
});

T.runAsync("Edit Profile: Dropout's own words after a Save (a toast that is not good news, or none at all) are shown, not hidden behind a tick", async () => {
  rules.screen.profileForm.edit.saveMs = 400;
  rules.screen.profileForm.edit.saveSettleMs = 50;
  try {
    const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    wireEdit(p, { error: 'Something went wrong.' });
    const name = p.doc.activeElement;
    name.value = 'Samuel';
    name.dispatchEvent(new p.win.Event('input', { bubbles: true }));
    await T.sleep(250);
    p.key('ArrowDown'); p.key('Enter');
    await T.sleep(300);
    T.eq([saveBtn(p).textContent, p.$('cancel') && 0], ['Save', 0], 'no Saved!');
    T.eq(p.doc.querySelector('.tenfoot-hero-meta').textContent, 'Something went wrong.', 'Dropout\'s words, under the title');
    const q = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    wireEdit(q, { silent: true });
    const qn = q.doc.activeElement;
    qn.value = 'Samuel';
    qn.dispatchEvent(new q.win.Event('input', { bubbles: true }));
    await T.sleep(250);
    q.key('ArrowDown'); q.key('Enter');
    await T.sleep(700);
    T.eq(saveBtn(q).textContent, 'Save');
    T.ok(q.hints().textContent.includes('Dropout did not say whether it saved'), 'no answer: ' + q.hints().textContent);
    // Nothing to save: OK on the grey Save does nothing at all.
    const r = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
    const sent = wireEdit(r);
    await T.sleep(100);
    r.key('ArrowDown'); r.key('Enter');
    await T.sleep(100);
    T.eq(sent, [], 'a grey Save is not pressed');
  } finally {
    rules.screen.profileForm.edit.saveMs = 6000;
    rules.screen.profileForm.edit.saveSettleMs = 800;
  }
});

T.runAsync("Add Profile: OK on the name opens the keyboard; a new name starts with a capital; Done goes down", async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  app.firstElementChild.remove();
  app.insertAdjacentHTML('beforeend', ADD);
  p.win.history.replaceState(null, '', `${PICK}#/add`);
  await T.sleep(200);
  T.ok(p.doc.activeElement.classList.contains('tenfoot-screen-field-input'), 'the selection starts in the name box');
  p.key('Enter');
  T.ok(kbOpen(p));
  T.eq(p.doc.querySelector('.tenfoot-kb [data-tenfoot-key="c:k"]').textContent, 'K', 'a capital to start a name');
  kbKey(p, 'c:k'); kbKey(p, 'c:i'); kbKey(p, 'c:m');
  T.eq(p.$('pname').value, 'Kim', 'typed into Dropout\'s own box');
  kbKey(p, 'done');
  await T.sleep(30);
  T.notOk(kbOpen(p));
  T.eq(p.doc.activeElement.textContent, 'Cancel', 'down to the buttons');
});

T.runAsync("Manage profiles: OK on a profile's picture opens Leanback's own picture box, the one it has selected; OK on another saves it with Dropout's API and Manage profiles is drawn again", async () => {
  let calls = null;
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK, before: (win) => { calls = profileApi(win); } });
  const pressed = [];
  p.$('p1').addEventListener('click', () => pressed.push('p1'));
  p.key('Enter');
  await T.sleep(50);
  const box = p.doc.querySelector('.tenfoot-picker');
  T.notOk(box.hidden, 'the picture box');
  T.eq(box.querySelector('.tenfoot-ask-title').textContent, 'Picture for Sam', 'for the profile selected (the second by its index)');
  T.eq([...box.querySelectorAll('.tenfoot-picker-label')].map((h) => h.textContent), ['The classics', 'Dropout']);
  T.eq(p.doc.activeElement.dataset.tenfootPicture, '12', 'on the picture it has now');
  T.eq(calls.every((c) => c.auth === 'Bearer fixture-token'), true, 'the page\'s own sign-in');
  p.key('Escape');
  await T.sleep(20);
  T.ok(box.hidden, 'Back: nothing changed');
  T.eq([calls.filter((c) => c.method === 'PATCH').length, pressed], [0, []]);
  p.key('Enter');
  await T.sleep(50);
  p.key('ArrowDown');
  T.eq(p.doc.activeElement.dataset.tenfootPicture, '22', '▼: the next section, the same column');
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement.dataset.tenfootPicture, '21');
  p.key('Enter');
  await T.sleep(50);
  const patch = calls.find((c) => c.method === 'PATCH');
  T.eq([patch.url, patch.body], ['https://api.test/v2/sites/7/users/9/profiles/1', { profile: { name: 'Sam', profile_image_id: 21 } }]);
  T.eq((await p.state()).navigation, 'https://watch.dropout.tv/profile/pick?edit=1', 'drawn again, managing');
});

T.runAsync("Manage profiles: a picture that cannot be saved says so, and nothing moves", async () => {
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK, before: (win) => { profileApi(win, { fail: true }); } });
  p.key('Enter');
  await T.sleep(50);
  p.key('ArrowLeft');
  p.key('Enter');
  await T.sleep(50);
  T.ok(p.hints().textContent.includes('The picture could not be saved'), p.hints().textContent);
  T.eq((await p.state()).navigation, null);
});

T.runAsync("Manage profiles: pictures that cannot be loaded say so, and no box opens", async () => {
  let calls = null;
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK, before: (win) => { calls = profileApi(win, { pictures: false }); } });
  p.key('Enter');
  await T.sleep(50);
  T.ok(p.hints().textContent.includes('The pictures could not be loaded'), p.hints().textContent);
  T.ok(p.doc.querySelector('.tenfoot-picker').hidden, 'no picture box');
  T.eq(calls.filter((c) => c.method === 'PATCH').length, 0);
});

T.runAsync("Manage profiles: without Dropout's profile API on the page, OK on a picture is Dropout's own button for the profile", async () => {
  const p = await boot({ html: MANAGING(fixture('profiles.html').replace('initial_edit_mode&quot;:false', 'initial_edit_mode&quot;:true')), url: PICK });
  const selected = p.doc.activeElement;
  const clicked = [];
  p.doc.addEventListener('click', (e) => { if (!e.target.closest('.tenfoot-home, .tenfoot-rail')) clicked.push(e.target); }, true);
  p.key('Enter');
  await T.sleep(50);
  T.ok(p.doc.querySelector('.tenfoot-picker').hidden, 'no picture box');
  T.eq(clicked.length, 1, 'Dropout\'s own button, pressed once');
  T.notOk(selected === clicked[0], 'not Leanback\'s card');
});

T.runAsync("Edit Profile: Cancel with nothing changed leaves; with a change, asks first (Keep Editing selected); Firefox's own \"leave this page?\" is kept away", async () => {
  const html = EDIT.replace('<button id="save" type="submit">', '<button id="save" type="submit" disabled>');
  const p = await boot({ html, url: 'https://watch.dropout.tv/settings/manage/profile' });
  let cancelled = 0;
  p.$('cancel').addEventListener('click', () => { cancelled += 1; });
  p.key('ArrowDown'); p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Cancel');
  p.key('Enter');
  T.eq(cancelled, 1, 'nothing changed: Dropout\'s Cancel at once');
  p.$('save').disabled = false; // something changed
  p.key('Enter');
  const box = p.doc.querySelector('.tenfoot-ask');
  T.eq([box.hidden, box.querySelector('.tenfoot-ask-title').textContent, p.doc.activeElement.textContent], [false, 'Leave without saving?', 'Keep Editing']);
  p.key('Enter');
  await T.sleep(20);
  T.eq(cancelled, 1, 'Keep Editing: still here');
  p.key('Enter');
  p.key('ArrowRight');
  p.key('Enter');
  await T.sleep(20);
  T.eq(cancelled, 2, 'Leave: Dropout\'s Cancel');
  // Dropout's own warning, as its settings app adds it.
  p.win.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; });
  const e = new p.win.Event('beforeunload', { cancelable: true });
  p.win.dispatchEvent(e);
  T.eq(e.defaultPrevented, false, 'Firefox is not asked to check');
});

T.runAsync("Edit Profile: Delete Profile asks in Leanback's box, Cancel selected; Delete presses Dropout's Delete Profile and then the Delete in Dropout's own box", async () => {
  const p = await boot({ html: EDIT, url: 'https://watch.dropout.tv/settings/manage/profile' });
  const steps = [];
  p.$('delete').addEventListener('click', () => {
    steps.push('delete');
    p.doc.body.insertAdjacentHTML('beforeend', '<div role="dialog" id="dlg"><h2>Delete profile</h2><button id="no">Cancel</button><button id="yes">Delete Profile</button></div>');
    p.$('yes').addEventListener('click', () => steps.push('confirm'));
    p.$('no').addEventListener('click', () => steps.push('cancelled'));
  });
  p.key('ArrowDown'); p.key('ArrowRight'); p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Delete Profile');
  p.key('Enter');
  const box = p.doc.querySelector('.tenfoot-ask');
  T.eq([box.hidden, box.querySelector('.tenfoot-ask-title').textContent, p.doc.activeElement.textContent], [false, 'Delete Sam?', 'Cancel']);
  p.key('Enter');
  await T.sleep(20);
  T.eq(steps, [], 'Cancel: nothing deleted');
  T.eq(p.doc.activeElement.textContent, 'Delete Profile', 'and the selection back');
  p.key('Enter');
  p.key('ArrowRight');
  p.key('Enter');
  await T.sleep(300);
  T.eq(steps, ['delete', 'confirm'], "Dropout's button, then its own box's Delete");
});

await T.exit();
