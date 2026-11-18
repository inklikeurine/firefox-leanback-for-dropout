// content/player.js in the player's frame: with Autoplay Next Episode off,
// Dropout's own countdown to the next episode never runs, whichever player
// controls are in use (#17).
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot } from './player-support.mjs';

const tick = async (win, video) => {
  video.dispatchEvent(new win.Event('timeupdate'));
  await T.sleep(20);
};

T.runAsync("Autoplay Next Episode off, Dropout's own controls: Dropout's countdown is switched off", async () => {
  const { win, video } = await boot({ settings: { autoplayNext: false, playerChrome: 'site' } });
  await tick(win, video);
  T.eq(win.OTTData.up_next.disable_autoplay, true);
});

T.runAsync("Autoplay Next Episode off, Leanback's controls: Dropout's countdown is switched off too", async () => {
  const { win, video } = await boot({ settings: { autoplayNext: false } });
  await tick(win, video);
  T.eq(win.OTTData.up_next.disable_autoplay, true);
});

T.runAsync("turning Autoplay Next Episode back on lets Dropout's countdown run again", async () => {
  const { win, video, shim } = await boot({ settings: { autoplayNext: false, playerChrome: 'site' } });
  await tick(win, video);
  await shim.changeStorage({ settings: { newValue: { autoplayNext: true, playerChrome: 'site' } } });
  await T.sleep(20);
  T.eq(win.OTTData.up_next.disable_autoplay, false);
});

T.runAsync("with Autoplay Next Episode on, Dropout's own \"no countdown\" is left as Dropout sent it", async () => {
  const upNext = { url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep2', title: 'Ep 2', disable_autoplay: true };
  const { win, video } = await boot({ settings: { autoplayNext: true }, upNext });
  await tick(win, video);
  T.eq(win.OTTData.up_next.disable_autoplay, true);
});
