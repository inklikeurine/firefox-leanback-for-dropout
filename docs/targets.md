# Deployment targets

Two real TV setups this extension has to work in. Neither is a desktop: one
tab, opened straight on `/browse`, fullscreen or kiosk, driven by a remote
whose buttons arrive as ordinary key events. What they have in common is what
the spec optimises for; what differs is listed per target, with the things
that still need checking on the actual box.

## Common ground

| Fact | Consequence for the extension |
| --- | --- |
| Firefox from the distro's **release channel** | Only AMO-signed extensions stay installed → unlisted signing early ([development.md](./development.md#releasing)). |
| One tab, kiosk/fullscreen, opened on `/browse` | Structural Back (no history to go back to); exit hook `close-tab` ends Firefox and returns to the shell. |
| No pointer in normal use (or one that drifts) | Focus never follows the pointer; every feature reachable by 5 keys. |
| Remote buttons arrive as key events, some of which the browser or the desktop shell own (`BrowserBack`, `BrowserHome`, `ContextMenu`, volume) | Intercept what the page can see, design around what it can't ([keymap.md](./keymap.md#remote-example-wechip-w1-air-mouse)). |
| Login is done once, by hand, on the box | Nothing credential-related in the extension; the profile keeps the session. |
| The people setting it up are not programmers | Setup recipes are exact commands, one purpose each. |

## Target 1 — the HTPC shell (workstation now, OptiPlex 3080 later)

gamescope session, Qt shell, Firefox started as
`firefox --profile <dir> --kiosk --new-instance https://watch.dropout.tv/browse`
by the HTPC shell's `appd`; extensions force-installed through `policies.json`;
input normalised by `inputd` into the HTPC shell's action vocabulary; phone companion
for text. Everything about this target is in
[htpc-integration.md](./htpc-integration.md).

## Target 2 — Bedroom HTPC (KDE Plasma Bigscreen + WeChip W1)

Facts from that machine's own notes:

| | |
| --- | --- |
| Box | Lenovo ThinkCentre M910q Tiny, i5-7500T, **Intel HD Graphics 630** (VAAPI decode), 7.6 GiB RAM, zram swap |
| OS / session | Fedora 44, **KDE Plasma Bigscreen 6.7** on **Wayland**, autologin via `plasma-login-manager` (no SDDM). Firefox is the Fedora RPM (release channel). |
| Display | HDMI to a Roku TV |
| Input | **WeChip W1 air mouse only** — arrows, OK, back, home, menu, volume ±, a QWERTY pad, a gyro pointer. No keyboard or mouse in normal use. |
| Dropout today | Android TV app (`com.collegehumor.chdropout`) inside **Waydroid**, launched from a Bigscreen icon through `~/waydroid-launch.sh`. Works; "sustained playback quality not yet evaluated". Waydroid stays resident (~3.2 GiB used with it up). |
| Wish list on the box | "10-foot Firefox frontend — investigate whether a TV-usable Firefox shell exists", "other 10-foot alternatives for services with no TV-friendly client" |

So Firefox + this extension is the box's own wish, and a direct comparison
with the Waydroid app is the acceptance test: same episode, same remote,
which one is smoother to navigate and to watch.

### What the remote sends (verified on the box with `evtest`)

| W1 button | Linux key | Reaches Firefox as (`event.key`) | Extension action |
| --- | --- | --- | --- |
| up / down / left / right | `KEY_UP` … `KEY_RIGHT` | `ArrowUp` … `ArrowRight` | `up` `down` `left` `right` |
| OK | `KEY_ENTER` | `Enter` | `select` (play/pause in the player) |
| back | `KEY_BACK` (Consumer Control) | `BrowserBack` | `back` — see T2 |
| home | `KEY_HOMEPAGE` (Consumer Control) | `BrowserHome` — **if it gets that far**: Bigscreen acts on Home globally (its issue OS-01), so Firefox probably never sees it | `home` (→ `/browse`) when it does arrive |
| menu | `KEY_COMPOSE` | `ContextMenu` | `menu` (site header); the keyboard-originated `contextmenu` event is cancelled |
| volume ± | `KEY_VOLUMEUP` / `KEY_VOLUMEDOWN` | `AudioVolumeUp` / `AudioVolumeDown` | **not intercepted** — Plasma's system volume |
| power | nothing reaches the OS (IR only) | — | — |
| mouse-mode toggle | nothing reaches the OS (dongle-internal) | — | pointer drift must never move the ring |
| QWERTY pad | letters, digits, Backspace, … | as typed | needed only to type a search query or log in; `/` opens the search field. No feature is behind a letter key |

### Constraints the box imposes

- **No global key remapping** (udev/hwdb/xremap ruled out there). The
  extension is app-local by nature — it must never *require* a remap.
- **Ask before anything system-wide.** A `policies.json` under
  `/etc/firefox/policies/` is system-wide; the one-time alternative is
  installing the signed `.xpi` into the Dropout profile by hand (over
  Deskflow or the gyro pointer, once).
- **Don't depend on the power button or on knowing whether mouse mode is
  on.** Neither is visible to the OS.
- The **Waydroid session stays** for Twitch even if Dropout moves to Firefox,
  so Firefox's memory (≈ 0.5–1 GiB for one kiosk profile) is additive on an
  8 GB box. Acceptable; note it.
- Its issue log already contains the failure modes this spec is built to
  avoid: a focused item scrolling off screen (its JF-05 → the keep-on-screen
  rule), Back doing the wrong thing in some context (OS-02 → layered Back),
  Escape not leaving playback (→ Back leaves the player first).

### Sound without a button press is a profile setting, not extension code

Firefox blocks audible autoplay by default (`media.autoplay.default = 1`,
"block audio"). Nothing an extension can do lifts that:

- Firefox exposes no WebExtension API for the autoplay permission.
  `contentSettings` is a Chrome API and is not implemented here, and
  `browserSettings` does not cover autoplay.
- Events a content script synthesises are `isTrusted: false` and therefore
  create no user activation.

So in a default profile, setting `video.muted = false` before the viewer has
pressed anything makes Firefox stop the video — the "plays, then pauses after
0.01s" behaviour. `content/player.js` reads
`navigator.getAutoplayPolicy("mediaelement")` (Firefox 120+) and unmutes
immediately only when it answers `"allowed"`; otherwise it waits for the first
press, because unmuting earlier costs the playback.

Three ways to make it answer `"allowed"`:

| Where | What | Scope |
|---|---|---|
| `user.js` in the kiosk profile | `user_pref("media.autoplay.default", 0);` | that profile, every site |
| `policies.json` | `Permissions` → `Autoplay` → `"Default": "allow-audio-video"`, or `"Allow": ["https://watch.dropout.tv"]` to keep it to the one site | system-wide |
| Settings → Privacy & Security → Autoplay → Settings… | add `watch.dropout.tv`, "Allow Audio and Video" | that profile, that site, set by hand once |

`media.autoplay.default`: `0` allow audio and video, `1` block audio (the
default), `5` block audio and video. Leave `media.autoplay.blocking_policy` at
its default of `0`. The `Autoplay` policy's `Default` takes exactly
`allow-audio-video`, `block-audio` or `block-audio-video` (Firefox's
`policies-schema.json`).

**There is no command-line flag for this.** Release Firefox accepts no
`--pref`; the setting has to live in the profile or in a policy file. The
launch command is unchanged — `--profile <dir>` is what points at the profile
holding it.

Check it on the box: open an episode, and in the console on the player frame
`navigator.getAutoplayPolicy("mediaelement")` should return `"allowed"`.

### Launch recipe (sketch — verify on the box, item T1–T8)

1. **Profile**: `firefox --no-remote -CreateProfile "dropout /home/Media/.mozilla/firefox/dropout"`,
   then a `user.js` in it with the kiosk-relevant preferences — hardware decode
   (`media.ffmpeg.vaapi.enabled = true`), `media.autoplay.default = 0` (see
   above — this is what makes episodes start with sound), no
   session restore and no first-run pages, `browser.startup.homepage =
   https://watch.dropout.tv/browse` (so a stray `BrowserHome` is harmless).
   Same keys the HTPC shell's profile generator uses; copy them from there once S08
   has them.
2. **Extension**: the signed `.xpi`, installed once into that profile — or,
   with the user's OK, force-installed system-wide through `policies.json`
   (`ExtensionSettings`, same file the HTPC shell uses).
3. **Login**: start the profile once *without* `--kiosk`, sign in with the
   QWERTY pad, close.
4. **Bigscreen icon**: a `.desktop` entry in `~/.local/share/applications/`,
   written the way the box's `atv-icons.sh` writes its Waydroid entries
   (`StartupNotify=false`, same categories), with
   `Exec=firefox --kiosk --new-instance --profile /home/Media/.mozilla/firefox/dropout https://watch.dropout.tv/browse`.
5. **Leaving**: Back at `/browse` → exit hook `close-tab` → Firefox exits →
   Bigscreen. Home → Bigscreen comes forward by itself with Firefox still
   running behind it (verify — that is the memory-hungry way out).

### To verify on the box

| # | Question | How | Affects |
| --- | --- | --- | --- |
| T1 | Does Bigscreen take `KEY_HOMEPAGE` globally while Firefox is in front? Does Firefox stay running behind? | Launch the kiosk, press home, `pgrep firefox` over SSH | exit paths, memory |
| T2 | Does the page's `keydown` handler see `BrowserBack`, and does `preventDefault()` stop Firefox's own history-back? **Answered: the page sees it (`trusted=true`, capture and bubble), and `preventDefault()` does not stop the history-back — on the page and with the player focused.** | Leanback Dev Probe's Block Back, press back | Back design: plan B (history states), see [architecture.md](./architecture.md#key-handling) |
| T3 | Does `ContextMenu` open a context menu in `--kiosk`? Does cancelling the `contextmenu` event suppress it outside kiosk? | Press menu on `/browse` | `menu` action |
| T4 | Does `close-tab` in `--kiosk` end the Firefox process and drop back to Bigscreen cleanly, no restore prompt next time? | Set the exit hook, press back at `/browse` | exit hook |
| T5 | Hardware decode active (`about:support` → Media → "Hardware decoding"), and 1080p playback smooth at TV distance? | Play an episode; compare with the Waydroid app | whether the switch is worth it |
| T6 | Does the Dropout login survive a reboot in that profile? | Reboot, launch | setup step 3 |
| T7 | Pointer drift with mouse mode on: does the ring stay put, do site tooltips pop up? | Wiggle the remote | hover suppression rules |
| T8 | Does the OK button click, or send Enter, or both, while mouse mode is on? | `evtest` on the mouse and keyboard interfaces | `select` handling |

Findings go into this file (facts) and into the box's own notes (state of the
box). Network details of the box (addresses, SSID, hostname) deliberately
stay out of this public repository.
