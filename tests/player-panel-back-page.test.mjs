// The page's side of Back with the playback settings panel open: when
// Firefox's Back passes over the video playing's own step as well as the
// panel's (a key press in the player frame does not always count as using
// the page), the page goes forward to it again, and the video is not left.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, boot, URLS, watch, firefoxBack } from './page-support.mjs';

T.runAsync('Back passing over the video playing while the playback settings were open: the page goes forward again, still playing', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  T.eq((await p.state()).watch, 'playing');
  await p.msg({ type: 'page:panel', open: true });
  await firefoxBack(p);
  await T.sleep(60);
  const s = await p.state();
  T.eq(s.watch, 'playing', 'still playing');
  T.ok(p.win.history.state && p.win.history.state.tenfootPlay === true, 'back on the video playing\'s own step');
});

T.runAsync('with the panel closed, Back from a video playing is the details page as ever', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  await p.msg({ type: 'page:panel', open: true });
  await p.msg({ type: 'page:panel', open: false });
  await T.sleep(700);
  await firefoxBack(p);
  await T.sleep(60);
  T.eq((await p.state()).watch, 'details');
});
await T.exit();
