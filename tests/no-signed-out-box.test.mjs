// The "Dropout signed you out" box is gone (the owner, 2026-11-18): a page
// loading signed out never asks, even on a TV that was signed in before
// (an old note from an earlier version still in storage), and nothing
// closes the tab.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot, signedOutVideo, askOpen, URLS } from './page-support.mjs';

T.runAsync('signed out, on a TV that was signed in: no box, and the tab stays', async () => {
  const p = await boot({ html: signedOutVideo(), url: URLS.video, store: { signedIn: true } });
  await T.sleep(400);
  T.notOk(askOpen(p), 'no box');
  T.eq(p.bg.filter((m) => m.type === 'exit'), [], 'nothing asks for the tab to close');
});

await T.exit();
