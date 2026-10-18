# TV setups

What running Leanback on a TV means, for any setup built that way: not a
desktop, but one tab opened straight on `/browse`, fullscreen or kiosk,
driven by a remote whose buttons arrive as ordinary key events. This is what
the spec optimises for. Below: what such setups share, what a typical remote
sends, the constraints to design for, sound, a launch recipe, and the checks
to run on your own setup.

## What every TV setup shares

| Fact | Consequence for the extension |
| --- | --- |
| Firefox from the distro's **release channel** | Only AMO-signed extensions stay installed → unlisted signing early ([spec.md](./spec.md#release-checklist)). |
| One tab, kiosk/fullscreen, opened on `/browse` | Structural Back (no history to go back to); exit hook `close-tab` ends Firefox and returns to the TV shell or desktop. |
| No pointer in normal use (or one that drifts) | Focus never follows the pointer; every feature reachable by 5 keys. |
| Remote buttons arrive as key events, some of which the browser or the desktop own (`BrowserBack`, `BrowserHome`, `ContextMenu`, volume) | Intercept what the page can see, design around what it can't ([keymap.md](./keymap.md#keys-the-browser-or-the-desktop-own)). |
| Login is done once, by hand, on the TV | Nothing credential-related in the extension; the profile keeps the session. |
| The people setting it up are not programmers | Setup recipes are exact commands, one purpose each. |

## What a remote sends

A typical air-mouse remote — arrows, OK, back, home, menu, volume ±, a gyro
pointer, often a QWERTY pad on the back — sends these. Check yours on Linux
with `evtest`, or in Firefox with Leanback Dev Probe (a private development tool).

| Button | Linux key | Reaches Firefox as (`event.key`) | Extension action |
| --- | --- | --- | --- |
| up / down / left / right | `KEY_UP` … `KEY_RIGHT` | `ArrowUp` … `ArrowRight` | `up` `down` `left` `right` |
| OK | `KEY_ENTER` | `Enter` | `select` (play/pause in the player) |
| back | `KEY_BACK` (Consumer Control) | `BrowserBack` | `back` — see T2 |
| home | `KEY_HOMEPAGE` (Consumer Control) | `BrowserHome`, **if it gets that far**: a TV shell (such as KDE Plasma Bigscreen) may act on Home globally, so Firefox never sees it | nothing — reserved for the shell, never mapped ([keymap.md](./keymap.md)) |
| menu | `KEY_COMPOSE` | `ContextMenu` | `menu`; the keyboard-originated `contextmenu` event is cancelled |
| volume ± | `KEY_VOLUMEUP` / `KEY_VOLUMEDOWN` | `AudioVolumeUp` / `AudioVolumeDown` | **not intercepted** — the system volume |
| power | often nothing reaches the OS (IR only) | — | — |
| mouse-mode toggle | often nothing reaches the OS (handled in the dongle) | — | pointer drift must never move the ring |
| QWERTY pad | letters, digits, Backspace, … | as typed | needed only to type a search query or log in; `/` opens the search field. No feature is behind a letter key |

Some remotes send `Escape` or `GoBack` for back, and some have media keys;
[keymap.md](./keymap.md#the-remotes-face) lists what is mapped.

## Constraints to design for

- **Never require a global key remap** (udev, hwdb, xremap and the like). Many
  setups rule them out; the extension is app-local by nature.
- **Ask before anything system-wide.** A `policies.json` under
  `/etc/firefox/policies/` affects every Firefox profile on the machine; the
  one-time alternative is installing the signed `.xpi` into the TV profile by
  hand.
- **Don't depend on buttons the OS cannot see**, such as power or the
  mouse-mode toggle on many remotes.
- **Memory adds up.** One kiosk profile takes ≈ 0.5–1 GiB, on top of whatever
  else the machine keeps running.
- The failure modes the spec is built to avoid are the usual ones on TV
  setups: a focused item scrolling off screen (→ the keep-on-screen rule),
  Back doing the wrong thing in some context (→ layered Back), Escape not
  leaving playback (→ Back leaves the player first).

## Sound without a button press

Firefox blocks autoplay with sound, and no extension can lift that; it is a
profile setting (`media.autoplay.default = 0` in the kiosk profile's
`user.js`) or a policy. The three ways, and how to check it took:
README → [Sound on autoplay](../README.md#sound-on-autoplay). Why the
extension cannot do it: [architecture.md](./architecture.md#sound-and-the-autoplay-policy).

## Launch recipe (sketch — check it on your setup, T1–T8)

1. **Profile**: `firefox --no-remote -CreateProfile "dropout <profile-dir>"`,
   then a `user.js` in it with the kiosk-relevant preferences — hardware decode
   (`media.ffmpeg.vaapi.enabled = true`), `media.autoplay.default = 0` (see
   above — this is what makes episodes start with sound), no session restore
   and no first-run pages, `browser.startup.homepage =
   https://watch.dropout.tv/browse` (so a stray `BrowserHome` is harmless).
2. **Extension**: the signed `.xpi` from the newest release
   (`releases/latest/download/leanback-for-dropout.xpi`), installed once into
   that profile — or force-installed system-wide through `policies.json`
   (`ExtensionSettings`, with that link as `install_url`).
3. **Login**: start the profile once *without* `--kiosk`, sign in, close.
4. **Launcher**: an entry in the TV shell or desktop (on Linux, a `.desktop`
   file in `~/.local/share/applications/`, written like the shell's other app
   entries) with
   `Exec=firefox --kiosk --new-instance --profile <profile-dir> https://watch.dropout.tv/browse`.
5. **Leaving**: Back at `/browse` → exit hook `close-tab` → Firefox exits →
   the shell. A Home button the shell takes brings the shell forward with
   Firefox still running behind it (check — that is the memory-hungry way
   out).

## To check on your setup

| # | Question | How | Affects |
| --- | --- | --- | --- |
| T1 | Does the TV shell take `KEY_HOMEPAGE` globally while Firefox is in front? Does Firefox stay running behind? | Launch the kiosk, press home, check whether `firefox` is still running | exit paths, memory |
| T2 | Does `preventDefault()` on `BrowserBack` stop Firefox's own history-back? **Answered: no** ([keymap.md](./keymap.md#t2--back-is-firefoxs)) | Leanback Dev Probe's Block Back, press back | Back |
| T3 | Does `ContextMenu` open a context menu in `--kiosk`? Does cancelling the `contextmenu` event suppress it outside kiosk? | Press menu on `/browse` | `menu` action |
| T4 | Does `close-tab` in `--kiosk` end the Firefox process and drop back to the shell cleanly, with no restore prompt next time? | Set the exit hook, press back at `/browse` | exit hook |
| T5 | Is hardware decode active (`about:support` → Media → "Hardware decoding"), and is 1080p playback smooth at TV distance? | Play an episode | whether the setup is worth it |
| T6 | Does the Dropout login survive a reboot in that profile? | Reboot, launch | setup step 3 |
| T7 | Pointer drift with mouse mode on: does the ring stay put, do site tooltips pop up? | Wiggle the remote | hover suppression rules |
| T8 | Does the OK button click, send Enter, or both, while mouse mode is on? | `evtest` on the remote's mouse and keyboard interfaces | `select` handling |

Keep network details of your machine (addresses, SSID, hostname) out of this
public repository.
