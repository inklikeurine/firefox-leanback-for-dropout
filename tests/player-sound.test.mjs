// content/player.js: the sound and autoplay — nothing unmutes before a gesture, and the viewer's choice stands.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot } from './player-support.mjs';

T.runAsync('nothing touches the sound before a user gesture — that is what cost autoplay (item 1)', async () => {
  const { st, video, win } = await boot({ muted: true, autoplayBlocked: true });
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  video.dispatchEvent(new win.Event('loadedmetadata'));
  await T.sleep(500);
  T.eq([st.muted, st.paused], [true, false], 'still muted, and still playing — the autoplay was never disturbed');
});

T.runAsync('the first keypress is the gesture, and the sound goes on then (item 1)', async () => {
  const { key, st, video, win } = await boot({ muted: true, autoplayBlocked: true });
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  await T.sleep(200);
  T.eq(st.muted, true, 'nothing yet');
  win.__allowUnmute = true; // the keypress is user activation
  key('ArrowRight');
  await T.sleep(400);
  T.eq([st.muted, st.paused], [false, false], 'sound on, still playing');
});

T.runAsync('if Firefox stops the video for the unmute anyway, it goes straight back', async () => {
  const { key, st, video, win } = await boot({ muted: true, autoplayBlocked: true });
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  await T.sleep(150);
  key('ArrowRight'); // gesture, but the fake still refuses (win.__allowUnmute unset)
  await T.sleep(500);
  T.eq([st.muted, st.paused], [true, false], 'back to muted and playing, never left stopped');
});

T.runAsync('a video you have opened before is re-muted by the site, and unmuted again (item 2)', async () => {
  const { st, video, win, gesture } = await boot({ muted: true });
  T.eq(st.muted, true, 'left muted until playback and a gesture — unmuting first costs autoplay');
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  gesture();
  await T.sleep(200);
  T.eq(st.muted, false, 'unmuted once playing, after a gesture');
  st.muted = true; // the site restoring its remembered preference
  video.dispatchEvent(new win.Event('volumechange'));
  await T.sleep(10);
  T.eq(st.muted, false, 'put back');
  video.dispatchEvent(new win.Event('loadedmetadata'));
  st.muted = true;
  video.dispatchEvent(new win.Event('volumechange'));
  await T.sleep(10);
  T.eq(st.muted, false, 'and again later in the load');
});

T.runAsync('once the user touches the transport row, their volume choice stands', async () => {
  const { key, st, video, win } = await boot({ muted: true });
  st.paused = false;
  key('ArrowDown');
  key('Enter');
  st.muted = true;
  video.dispatchEvent(new win.Event('volumechange'));
  await T.sleep(10);
  T.eq(st.muted, true, 'not fought');
});

T.runAsync('videos start unmuted once playing, and the setting turns that around (owner report)', async () => {
  // Dropout starts them muted to satisfy Firefox's autoplay policy.
  const a = await boot({ muted: true });
  a.st.paused = false;
  a.video.dispatchEvent(new a.win.Event('play'));
  a.gesture();
  await T.sleep(200);
  T.eq(a.st.muted, false, 'unmuted once it was playing and the page had been used');
  const b = await boot({ muted: true, settings: { startMuted: true } });
  b.st.paused = false;
  b.video.dispatchEvent(new b.win.Event('play'));
  b.gesture();
  await T.sleep(200);
  T.eq(b.st.muted, true, 'startMuted leaves it alone');
});

T.runAsync('a video that has not started is never unmuted — that is what costs autoplay (item 1)', async () => {
  const { st, video, win, gesture } = await boot({ muted: true, autoplayBlocked: true });
  gesture(); // even with a gesture in hand, a video that has not started is left alone
  T.eq([st.muted, st.paused], [true, true], 'still muted and still paused');
  video.dispatchEvent(new win.Event('loadedmetadata'));
  await T.sleep(400);
  T.eq(st.muted, true, 'metadata does not tempt us either');
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  await T.sleep(400);
  T.eq(st.paused, false, 'it is playing — the autoplay was never taken away');
});

await T.exit();
