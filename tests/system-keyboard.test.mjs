// The boxes Leanback's own keyboard types into keep the system's on-screen
// keyboard (a TV's, such as Plasma's) shut: they are marked for
// content/keyboard.css (ime-mode) and carry inputmode="none".
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, boot, PICK, SIGNIN, URLS, box } from './page-support.mjs';

const quiet = (b) => Boolean(b) && b.hasAttribute('data-tenfoot-kb-box') && b.getAttribute('inputmode') === 'none';

T.runAsync('system keyboard: sign-in\'s Email and Password are Leanback\'s keyboard\'s boxes, so the system\'s on-screen keyboard stays shut', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  T.ok(quiet(box(p, 'tenfoot-signin-email')), 'Email');
  T.ok(quiet(box(p, 'tenfoot-signin-password')), 'Password');
});

T.runAsync('system keyboard: the search page\'s box is Leanback\'s keyboard\'s too', async () => {
  const html = '<!doctype html><html><body>' +
    '<div class="SearchForm-module__search-form-container" data-rect="300,70,700,60">' +
    '<input class="SearchForm-module__search-input custom-css-search-input" placeholder="Search" data-rect="340,80,620,44">' +
    '</div></body></html>';
  const p = await boot({ html, url: URLS.search });
  T.ok(quiet(p.doc.querySelector('input.tenfoot-screen-field-input')), 'Leanback\'s search box');
  T.notOk(quiet(p.doc.querySelector('input.SearchForm-module__search-input')), 'Dropout\'s own box underneath is left as it is');
});

T.runAsync('system keyboard: a PIN-locked profile\'s digit boxes (Dropout\'s own form) are marked as they appear', async () => {
  const p = await boot({ html: fixture('profiles.html'), url: PICK });
  const app = p.$('profile-picker-react-app');
  app.firstElementChild.remove();
  app.insertAdjacentHTML('beforeend', '<div class="LockedProfilePinScreen-module__root"><h1>Enter your PIN</h1><div><input id="d1" inputmode="numeric" maxlength="1" data-rect="500,300,60,60"><input id="d2" inputmode="numeric" maxlength="1" data-rect="570,300,60,60"></div><button id="pinok" type="submit" data-rect="500,400,200,40">Continue</button></div>');
  await T.sleep(200);
  T.ok(quiet(p.$('d1')) && quiet(p.$('d2')), 'both digit boxes');
});
await T.exit();
