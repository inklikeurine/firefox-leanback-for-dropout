// The remote's Back with the playback settings panel open: it closes the
// panel (a level at a time), and the video plays on, rather than leaving the
// video. Firefox goes back in the tab's history on that Back whatever the
// frame does, so the panel stands on a step of its own in it while it is open.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot } from './player-support.mjs';

const onStep = (win) => Boolean(win.history.state && win.history.state.tenfootPanel === true);

T.runAsync('playback settings: the panel opens on a step of its own; Firefox\'s Back closes it and the video is not left', async () => {
  const { key, win, bg } = await boot();
  key('ContextMenu');
  await T.sleep(150);
  const panel = win.document.querySelector('.tenfoot-settings');
  T.notOk(panel.hidden, 'open');
  T.ok(onStep(win), 'on a step of its own in the history');
  const sent = bg.length;
  key('BrowserBack');
  win.history.back();
  await T.sleep(350);
  T.ok(panel.hidden, 'Back closed the panel');
  T.notOk(bg.slice(sent).some((m) => m.type === 'page:action' && m.action === 'browser-back'), 'the page was not asked to go back');
  T.notOk(onStep(win));
});

T.runAsync('playback settings: closed with Escape, the panel\'s step comes off the history', async () => {
  const { key, win } = await boot();
  key('ContextMenu');
  await T.sleep(150);
  T.ok(onStep(win));
  key('Escape');
  await T.sleep(350);
  T.ok(win.document.querySelector('.tenfoot-settings').hidden, 'closed');
  T.notOk(onStep(win), 'off its step');
});
await T.exit();
