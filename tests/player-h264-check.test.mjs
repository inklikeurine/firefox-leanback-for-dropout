// Whether this Firefox can play H.264 is checked by decoding one real frame,
// not by asking: Fedora's patent-free FFmpeg with its empty OpenH264
// stand-in says yes to H.264 and then decodes nothing.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot } from './player-support.mjs';

// A stand-in for WebCodecs' VideoDecoder. `works`: a picture comes out of
// the frame; 'error': the decoder fails, as Firefox's does with the empty
// stand-in ("EncodingError: The given encoding is not supported."); 'nothing':
// it finishes without a picture.
function decoder(win, works) {
  const made = [];
  class VideoDecoder {
    constructor({ output, error }) { this.output = output; this.error = error; this.state = 'unconfigured'; made.push(this); }
    configure(config) { this.config = config; this.state = 'configured'; }
    decode(chunk) { this.chunk = chunk; }
    flush() {
      if (works === true) { this.output({ close() {} }); return Promise.resolve(); }
      if (works === 'error') { this.error(new Error('The given encoding is not supported.')); return Promise.reject(new Error('EncodingError')); }
      return Promise.resolve();
    }
    close() { this.state = 'closed'; }
  }
  class EncodedVideoChunk { constructor(init) { Object.assign(this, init); } }
  win.VideoDecoder = VideoDecoder;
  win.EncodedVideoChunk = EncodedVideoChunk;
  win.MediaSource = { isTypeSupported: () => true }; // Firefox says yes either way
  return made;
}

// The player starts over on a new <video>, as when Dropout's player puts in
// a fresh one.
async function newVideo(p) {
  const v = p.win.document.createElement('video');
  v.play = () => Promise.resolve();
  v.pause = () => {};
  p.video.replaceWith(v);
  await T.sleep(150); // the player looks again 100 ms after the page changes
  return v;
}

const box = (p) => p.win.document.querySelector('.tenfoot-play-error');
const textOf = (p, cls) => p.win.document.querySelector(`.tenfoot-play-error .${cls}`).textContent;
const stateNow = async (p) => (await p.cmd({ type: 'player:command', cmd: 'pause' })).state;

T.runAsync('Firefox says yes to H.264 but no frame decodes: the picture says the decoder is missing as soon as the player starts', async () => {
  const p = await boot();
  const made = decoder(p.win, 'error');
  await newVideo(p);
  T.ok(made.length === 1 && made[0].config.codec.startsWith('avc1.64'), 'a real H.264 High-profile frame was tried');
  T.ok(made[0].chunk && made[0].chunk.type === 'key' && made[0].chunk.data.length > 0, 'with its frame');
  T.ok(box(p) && !box(p).hidden, 'shown without waiting for an error');
  T.ok(/no H\.264 video decoder/.test(textOf(p, 'tenfoot-play-error-text')), 'names the missing decoder');
  T.eq((await stateNow(p)).h264, false);
});

T.runAsync('a decoder that finishes without a picture counts as no decoder', async () => {
  const p = await boot();
  decoder(p.win, 'nothing');
  await newVideo(p);
  T.ok(box(p) && !box(p).hidden && /no H\.264 video decoder/.test(textOf(p, 'tenfoot-play-error-text')));
});

T.runAsync('a frame that decodes: no box, and the player says its decoder works', async () => {
  const p = await boot();
  decoder(p.win, true);
  await newVideo(p);
  T.ok(!box(p) || box(p).hidden, 'no box');
  T.eq((await stateNow(p)).h264, true);
});

T.runAsync('a video that fails while the check runs: the box shows, then names the decoder', async () => {
  const p = await boot();
  decoder(p.win, 'error');
  Object.defineProperty(p.video, 'error', { value: { code: 3, message: '' }, configurable: true });
  p.video.dispatchEvent(new p.win.Event('error'));
  await T.sleep(20);
  T.ok(/no H\.264 video decoder/.test(textOf(p, 'tenfoot-play-error-text')), 'names the decoder');
  T.eq(textOf(p, 'tenfoot-play-error-said'), 'Firefox says: MEDIA_ERR_DECODE');
});
await T.exit();
