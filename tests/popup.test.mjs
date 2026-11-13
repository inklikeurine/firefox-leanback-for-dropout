// The toolbar button's panel (popup/), for a desktop: the on/off switch, what
// Leanback makes of the tab in front, the version, and All settings.
import fs from 'node:fs';
import { T, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';

const manifest = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8'));
const html = fs.readFileSync(T.extFile('popup/popup.html'), 'utf8');

async function openPopup({ url = 'https://watch.dropout.tv/browse', state = { ok: true, enabled: true, kind: 'browse', signedIn: true }, settings = null } = {}) {
  const shim = makeBrowserShim({ tabs: [{ id: 1, url, active: true }], storage: settings ? { settings } : {} });
  let optionsOpened = 0;
  shim.browser.runtime.getManifest = () => manifest;
  shim.browser.runtime.openOptionsPage = async () => { optionsOpened += 1; };
  shim.browser.commands.getAll = async () => [{ name: 'toggle-tv-mode', shortcut: '' }];
  if (state) shim.attachContent(1, (m, s, send) => send(m && m.type === 'page:state' ? state : { ok: false }));
  const d = makeDom({ html, url: 'moz-extension://00000000-0000-4000-8000-000000000000/popup/popup.html', browser: shim.browser });
  d.window.close = () => {};
  d.runScripts([T.extFile('lib/settings.js'), T.extFile('popup/popup.js')]);
  await T.sleep(60);
  const doc = d.document;
  const rows = () => Object.fromEntries([...doc.querySelectorAll('#tab dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent]));
  return { shim, doc, rows, opened: () => optionsOpened };
}

T.runAsync('popup: the manifest opens it from the toolbar button', async () => {
  T.eq(manifest.browser_action.default_popup, 'popup/popup.html');
});

T.runAsync('popup: the version, the switch as saved, and Home signed in on a Dropout tab', async () => {
  const p = await openPopup();
  T.eq(p.doc.getElementById('version').textContent, `v${manifest.version}`);
  T.eq(p.doc.getElementById('enabled').checked, true, 'on, as saved');
  const r = p.rows();
  T.eq([r.Page, r['Signed in'], r.Leanback, r.Address], ['Home', 'yes', 'on', '/browse']);
});

T.runAsync('popup: the switch turns Leanback off and on (saved)', async () => {
  const p = await openPopup();
  const box = p.doc.getElementById('enabled');
  box.checked = false;
  box.dispatchEvent(new p.doc.defaultView.Event('change'));
  await T.sleep(30);
  T.eq(p.shim.store.settings.enabled, false);
  box.checked = true;
  box.dispatchEvent(new p.doc.defaultView.Event('change'));
  await T.sleep(30);
  T.eq(p.shim.store.settings.enabled, true);
});

T.runAsync('popup: an episode playing says so, and whether the player is found', async () => {
  const p = await openPopup({ url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep1', state: { ok: true, enabled: true, kind: 'video', watch: 'playing', playerReady: true, signedIn: true } });
  const r = p.rows();
  T.eq([r.Page, r.Episode, r.Player], ['An episode', 'playing', 'found']);
});

T.runAsync('popup: another site, or Dropout without Leanback running, says so', async () => {
  const other = await openPopup({ url: 'https://example.org/', state: null });
  T.eq(other.rows().Page, 'Not a Dropout page');
  const quiet = await openPopup({ state: null });
  T.eq(quiet.rows().Page, 'Leanback is not running here (reload the tab)');
});

T.runAsync('popup: All settings opens the options page', async () => {
  const p = await openPopup();
  p.doc.getElementById('settings').click();
  await T.sleep(10);
  T.eq(p.opened(), 1);
});
await T.exit();
