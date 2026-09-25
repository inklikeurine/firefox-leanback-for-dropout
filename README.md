# Leanback for Dropout

A Firefox extension that lets you drive [Dropout](https://watch.dropout.tv)
from the couch: arrow keys move a big focus ring between shows and episodes,
Enter plays, Escape goes back, and media keys control the player. Five keys
are enough — no mouse. ("Leanback" is the industry term for an interface you
use from the sofa rather than leaning forward at a desk.)

Unofficial. Not affiliated with Dropout or Vimeo. You need a Dropout
subscription exactly as on the website — the extension changes how you
navigate, not what you can watch.

**Version:** 0.7.0 · **Manifest:** v2 · **Minimum Firefox:** 140 (desktop)

## What it does

- **Arrow-key navigation** across every page of `watch.dropout.tv`: the home
  rows, the series grid, season and episode lists, search results.
- **A focus ring you can see from the sofa** — 4 px, Dropout yellow,
  configurable.
- **Theater layout** on video pages: the player fills the window; Escape brings
  the page back.
- **Player control** without a mouse: Enter/Space play–pause, Left/Right seek,
  media keys (play/pause, stop, next, previous) from anywhere on the page,
  captions and mute shortcuts.
- **Next episode** by key, and autoplay-next when an episode ends.
- **Season switching** with Left/Right on the season control.
- **A hint bar** that shows the keys that matter right now and gets out of
  the way.
- **Skips the marketing site**: opening `dropout.tv` lands you on Browse.
- Toggle it off with one click when you're at a desk.

## Who it's for

Anyone watching Dropout on a PC connected to a TV with a keyboard, an HID
remote or a gamepad mapped to keys. Two setups it is built against
([docs/targets.md](./docs/targets.md)): a KDE Plasma Bigscreen appliance
driven only by a WeChip W1 air mouse, and the HTPC shell HTPC shell, whose
Dropout app installs this extension
([docs/htpc-integration.md](./docs/htpc-integration.md)).

## Installation

There is no build step — the folder is loadable as-is.

**Temporary install (for trying it out):** open `about:debugging#/runtime/this-firefox`,
click **Load Temporary Add-on…** and select `manifest.json` inside this folder.
The extension is removed when Firefox restarts.

**With `web-ext` (for development):**
`web-ext run --source-dir ./leanback-for-dropout --start-url https://watch.dropout.tv/browse`
launches a clean Firefox profile with the extension loaded.

**Permanent install:** Firefox only permanently installs signed extensions.
`web-ext build` produces a package to submit to
[addons.mozilla.org](https://addons.mozilla.org/developers/) for signing
(unlisted self-distribution is fine). Release-channel Firefox on a TV box
needs the signed build; see [docs/development.md](./docs/development.md#releasing).

Source: https://github.com/inklikeurine/firefox-extensions/tree/main/leanback-for-dropout

## Sound on autoplay

Firefox blocks autoplay with sound by default, which is why Dropout starts its
videos muted — muted is the only way the site gets them to play at all. **No
extension can lift that.** Firefox exposes no WebExtension API for the autoplay
permission, and the events a content script creates carry no user activation,
so unmuting before you have pressed anything makes Firefox stop the video.

Leanback asks Firefox what the profile allows
(`navigator.getAutoplayPolicy("mediaelement")`) and unmutes straight away when
the answer is "allowed". Otherwise it waits for your first button press, which
is the earliest moment Firefox permits. Grant the permission and episodes start
with sound and no press at all.

Three ways to grant it — pick by how the machine is set up:

**By hand, once, on a normal install.** Settings → Privacy & Security →
Autoplay → Settings… → add `https://watch.dropout.tv` → **Allow Audio and
Video**. Kept in that profile.

**In a kiosk profile**, add to `user.js` in the profile directory:

```
user_pref("media.autoplay.default", 0);
```

`0` allows audio and video, `1` blocks audio (the Firefox default) and `5`
blocks both. Leave `media.autoplay.blocking_policy` alone.

**Across a managed machine**, in `policies.json` (`/etc/firefox/policies/` on
Linux, or `distribution/` beside the binary):

```json
{
  "policies": {
    "Permissions": {
      "Autoplay": {
        "Allow": ["https://watch.dropout.tv"],
        "Default": "block-audio"
      }
    }
  }
}
```

`Default` takes `allow-audio-video`, `block-audio` or `block-audio-video`. The
example above leaves every other site blocked and allows only Dropout.

**There is no command-line switch for this.** Release Firefox accepts no
`--pref`; the setting lives in the profile or in a policy file, so a kiosk
launcher grants it through the profile `--profile` already points at:

```
firefox --kiosk --new-instance --profile <profile-dir> https://watch.dropout.tv/browse
```

To check it took, open an episode and run
`navigator.getAutoplayPolicy("mediaelement")` in the console on the player
frame — `"allowed"` means Leanback will unmute from the first frame.

## Usage

Open `watch.dropout.tv`. The ring is on the first tile.

**This extension is driven by a remote, not a keyboard.** Only the buttons a
TV remote actually has are mapped, so nothing is hidden behind a letter key.

| Button | Arrives as | Does |
| --- | --- | --- |
| ▲ ▼ ◀ ▶ | `Arrow*` | Move the ring. Nothing else, ever. In the player, ◀ ▶ move the playhead and ▼ opens the transport bar (▼ again continues to the page) |
| OK | `Enter` | Open, play, pause; start a dropdown changing; take the "up next" offer when the site shows it |
| back | `BrowserBack` (also `Escape`) | Cancel a dropdown → close the options panel or a dialog → leave the player → back one page |
| menu | `ContextMenu` | Open the **options panel**: next and previous episode, the link to the show, Browse, Search, settings (which open in the page, not another tab), and turning the extension off |
| home | `BrowserHome` | **Reserved for your TV shell — never intercepted** |
| volume | `AudioVolume*` | Your desktop's, never intercepted |
| media keys | `Media*` | Play/pause, stop, seek, next/previous episode, for remotes that have them |

The one keyboard exception is `/`, which opens the search field — searching
needs typing from that point anyway. Pressing it again closes search and
returns you where you were.

**The transport bar**: press ▼ while a video is playing. The bar is the
extension's own — **play/pause · position · settings · fullscreen** — and
◀ ▶ walk it, OK takes a control, back closes it and gives ◀ ▶ back to seeking.
The position is shown but never selected: seeking is ◀ ▶ whenever the bar is
not holding a button.

**Settings** opens a full-height panel from the right and pauses the picture.
It holds the player's settings and Leanback's in one list: Quality, Speed, Seek
Step, Play Next Episode, Button Hints, Closed Captions, and **Leanback
Settings** as a submenu. Quality, Speed and Closed Captions are the player's own
— opening one shows what it offers, caption font, background and window
included. ▲ ▼
move, **▶ opens a submenu and ◀ leaves one**, OK toggles or steps a value, back
closes. Closing it starts the picture again, unless it was already paused.

**The options button** opens that panel during playback. Anywhere else it opens
Leanback's settings directly, with Browse, Search and *Turn Leanback off* at the
foot of the list.

**Player controls** can be handed back to the site. *Player controls → the
site's own* leaves the player's own bar alone and draws nothing over the video —
useful for reaching something the player offers that Leanback has no equivalent
for, and as a fallback if our bar ever breaks. Arrow navigation everywhere else
is unaffected.

**Back** goes one layer up, never "back to the previous page": the settings
panel to the transport bar, the bar to playback, an episode to the season you
were watching, a season to Browse.

Full table: [docs/keymap.md](./docs/keymap.md).

**Settings** — on the menu button, under "Leanback settings", where they open
as a panel on the page (the extension never navigates your tab away). The same
settings are at `about:addons` → Leanback for Dropout → Preferences: ring colour
and width · hint bar · theater layout (auto / manual / off) · seek step ·
autoplay next · start videos muted · skip marketing site · what back does on
the Browse page
(nothing / close this tab — for kiosk setups). The toolbar button turns the
extension on and off; a keyboard shortcut for that can be set under
*Manage Extension Shortcuts*.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `storage` | Remembers your settings, and (in session storage) which frame of a tab is the video player. |
| `*://watch.dropout.tv/*` | Runs the navigation script on the site and lets the toolbar toggle reach it. |
| `*://embed.vhx.tv/*` | Dropout's video player is an iframe from this host; the extension needs a script inside it to control playback and receive keys. |
| `*://www.dropout.tv/*` | Forwards the marketing home page (site root only) to Browse. |

Content scripts run on `*://watch.dropout.tv/*` (the pages), on
`*://embed.vhx.tv/*` with `all_frames: true` — that host only ever appears as
an iframe inside a Dropout page, so without `all_frames` the player script
would never run — and on `*://www.dropout.tv/` and `*://www.dropout.tv/?*`
(the marketing site's root, nothing else).

Data collection: **none**. Nothing leaves the browser; the extension makes no
network requests of its own. The manifest declares
`data_collection_permissions: { required: ["none"] }`. No `tabs`,
`webRequest` or `<all_urls>`.

## Known limitations

- Relies on Dropout's page structure (it's a Vimeo OTT site). If Vimeo changes
  the markup, navigation can break until the site rules
  (`sites/dropout.json`) are updated —
  [docs/site-notes.md](./docs/site-notes.md) records what the extension
  depends on and how to re-check it. The rows on the Browse page and the
  inside of the player frame were written from the site's script bundles,
  not from a logged-in session; they may need a first correction.
- Login and search need a keyboard (or a phone with the HTPC shell's companion);
  `/` opens the search field, and from there you are typing.
- Only remote buttons are mapped, by design. If you are at a desk, the ones
  you have are the arrow keys, Enter, Escape and the menu key — there are no
  letter shortcuts to learn, and no feature that needs them.
- Sound on the first frame needs a profile setting Firefox will not let an
  extension make — see [Sound on autoplay](#sound-on-autoplay). Without it the
  sound comes on at your first button press. "Start videos muted" turns the
  whole thing off.
- Firefox only. Uses the `browser.*` API; no other browser is supported.
- Permanent installs need the AMO-signed build (release-channel Firefox
  refuses unsigned extensions) — a temporary load is enough to try it.

## Documentation

| File | Contents |
| --- | --- |
| [docs/spec.md](./docs/spec.md) | Product spec: goals, non-goals, functionality, settings, testing, release checklist |
| [docs/architecture.md](./docs/architecture.md) | Components, frame relay, spatial navigation, theater layout, messages, the rules file |
| [docs/site-notes.md](./docs/site-notes.md) | How watch.dropout.tv is built: hosts, routes, selectors — verified vs. still to check |
| [docs/keymap.md](./docs/keymap.md) | Keys → actions → behaviour per context; what the W1 remote's buttons do |
| [docs/targets.md](./docs/targets.md) | The two TV setups it must work in: Bigscreen + W1 air mouse, and the HTPC shell |
| [docs/development.md](./docs/development.md) | Running, debugging, selector drift check, test checklist, verification hand-off, releasing |
| [docs/htpc-integration.md](./docs/htpc-integration.md) | How this extension fits the HTPC shell HTPC shell |

## AI-generated

This extension was generated by an AI agent under human direction. It is
provided as-is and used at your own risk; read the source before installing.

## License

Public domain under [The Unlicense](../UNLICENSE).
