# TV Mode for Dropout

A Firefox extension that lets you drive [Dropout](https://watch.dropout.tv)
from the couch: arrow keys move a big focus ring between shows and episodes,
Enter plays, Escape goes back, and media keys control the player. Five keys
are enough — no mouse.

**Status: specification — no code yet.** The product spec is in
[docs/spec.md](./docs/spec.md); the design, site research, key map and test plan
are in [docs/](./docs/). This README describes the extension as specified.

**Version:** 0.1.0 (planned) · **Manifest:** v2 · **Minimum Firefox:** 140

Unofficial. Not affiliated with Dropout or Vimeo. You need a Dropout
subscription exactly as on the website — the extension changes how you
navigate, not what you can watch.

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
remote or a gamepad mapped to keys. Two setups it is built and tested
against ([docs/targets.md](./docs/targets.md)): a KDE Plasma Bigscreen
appliance driven only by a WeChip W1 air mouse, and the
[the HTPC shell](../../htpc-shell/) HTPC shell, whose Dropout app installs this
extension ([docs/htpc-integration.md](./docs/htpc-integration.md)).

## Installation (once there is code)

No build step — the folder is loadable as-is.

- **Try it:** `about:debugging#/runtime/this-firefox` → *Load Temporary
  Add-on…* → `manifest.json` in this folder. Removed when Firefox restarts.
- **Develop:** `web-ext run --source-dir ./dropout-tv-mode --start-url https://watch.dropout.tv/browse`
- **Keep it:** install the AMO-signed `.xpi` from the releases (unlisted
  signing; see [docs/development.md](./docs/development.md#releasing)).

## Usage

Open `watch.dropout.tv`. The ring is on the first tile.

| Key | Does |
| --- | --- |
| ← ↑ → ↓ | Move the ring; on a season control, ← → switch season |
| Enter | Open / play; in the player, play–pause |
| Escape (or Backspace) | Close a dialog → leave the player → back one page |
| ← → in the player | Seek −10 s / +10 s |
| ↓ in the player | Move down to the page (series link, up next) |
| Media keys | Play/pause, stop, next/previous episode |
| `i` | Show/hide the hint bar |
| `/` | Search (needs a keyboard) |

Full table: [docs/keymap.md](./docs/keymap.md).

## Settings

Ring colour and width · hint bar · theater layout (auto / manual / off) ·
seek step · autoplay next · skip marketing site · what Escape does at the top
level (nothing / close this tab — for kiosk setups). Toolbar button and an
optional keyboard shortcut (set it in `about:addons`) toggle TV Mode.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Remember your settings. |
| `watch.dropout.tv` | Run the navigation script on the site. |
| `embed.vhx.tv` | Dropout's video player is an iframe from this host; the extension needs a script inside it to control playback and receive keys. |
| `www.dropout.tv` (site root only) | Forward the marketing home page to Browse. |

No data collection. No network requests of its own. No `tabs`, `webRequest`
or `<all_urls>`.

## Known limitations

- Relies on Dropout's page structure (it's a Vimeo OTT site). If Vimeo changes
  the markup, navigation can break until the site rules are updated —
  [docs/site-notes.md](./docs/site-notes.md) records what the extension
  depends on and how to re-check it.
- Login and search need a keyboard (or a phone with the HTPC shell's companion).
- Firefox may block autoplay with sound until you press Enter once or allow
  autoplay for the site.
- Firefox only. Uses the `browser.*` API so a Chromium port stays possible.
- Permanent installs need the AMO-signed build (release-channel Firefox
  refuses unsigned extensions) — a temporary load is enough to try it.

## Documentation

| File | Contents |
| --- | --- |
| [docs/spec.md](./docs/spec.md) | Product spec: goals, non-goals, functionality, settings, testing, release checklist |
| [docs/architecture.md](./docs/architecture.md) | Components, frame relay, spatial navigation, theater layout, messages, draft manifest and rules file |
| [docs/site-notes.md](./docs/site-notes.md) | How watch.dropout.tv is built: hosts, routes, selectors — verified vs. still to check |
| [docs/keymap.md](./docs/keymap.md) | Keys → actions → behaviour per context; what the W1 remote's buttons do |
| [docs/targets.md](./docs/targets.md) | The two TV setups it must work in: Bigscreen + W1 air mouse, and the HTPC shell |
| [docs/development.md](./docs/development.md) | Running, debugging, selector drift check, test checklist, verification hand-off, releasing |
| [docs/htpc-integration.md](./docs/htpc-integration.md) | How this extension fits the HTPC shell HTPC shell |

## License

Public domain under [The Unlicense](../UNLICENSE).
