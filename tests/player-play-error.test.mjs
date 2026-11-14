// A video that cannot play: the player frame says so on the picture —
// Firefox's own reason, and when this Firefox has no H.264 decoder, that —
// rather than nothing happening (Leanback hides the player's own controls).
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot } from './player-support.mjs';

function fail(p, code, message) {
  Object.defineProperty(p.video, 'error', { value: { code, message }, configurable: true });
  p.video.dispatchEvent(new p.win.Event('error'));
}
const box = (p) => p.win.document.querySelector('.tenfoot-play-error');
const textOf = (p, cls) => p.win.document.querySelector(`.tenfoot-play-error .${cls}`).textContent;

T.runAsync('a video Firefox cannot play: the reason is on the picture, and goes once a video plays', async () => {
  const p = await boot();
  fail(p, 4, 'No decoders for requested formats: video/mp4');
  await T.sleep(10);
  T.ok(box(p) && !box(p).hidden, 'shown');
  T.eq(textOf(p, 'tenfoot-play-error-title'), 'This video can\'t play here.');
  T.eq(textOf(p, 'tenfoot-play-error-said'), 'Firefox says: MEDIA_ERR_SRC_NOT_SUPPORTED (No decoders for requested formats: video/mp4)');
  p.video.dispatchEvent(new p.win.Event('playing'));
  await T.sleep(10);
  T.ok(box(p).hidden, 'gone once it plays');
});

T.runAsync('with no H.264 decoder in this Firefox, it says that is what is missing', async () => {
  const p = await boot();
  p.win.MediaSource = { isTypeSupported: (t) => !/avc1/.test(t) };
  fail(p, 3, '');
  await T.sleep(10);
  T.ok(/no H\.264 video decoder/.test(textOf(p, 'tenfoot-play-error-text')), 'names the missing decoder');
  T.eq(textOf(p, 'tenfoot-play-error-said'), 'Firefox says: MEDIA_ERR_DECODE');
});

T.runAsync('a load stopped on purpose (aborted) is not an error worth showing', async () => {
  const p = await boot();
  fail(p, 1, '');
  await T.sleep(10);
  T.ok(!box(p) || box(p).hidden);
});
await T.exit();
