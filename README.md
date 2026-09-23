# 10-Foot Dropout

A Firefox extension that lets you drive [Dropout](https://watch.dropout.tv)
from the couch: arrow keys move a big focus ring between shows and episodes,
Enter plays, Escape goes back, and media keys control the player. Five keys
are enough — no mouse. ("10-foot" is the name for interfaces you use from
three metres away, on a TV.)

Unofficial. Not affiliated with Dropout or Vimeo. You need a Dropout
subscription exactly as on the website — the extension changes how you
navigate, not what you can watch.

**Version:** 0.1.1 · **Manifest:** v2 · **Minimum Firefox:** 140 (desktop)

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
`web-ext run --source-dir ./10-foot-dropout --start-url https://watch.dropout.tv/browse`
launches a clean Firefox profile with the extension loaded.

**Permanent install:** Firefox only permanently installs signed extensions.
`web-ext build` produces a package to submit to
[addons.mozilla.org](https://addons.mozilla.org/developers/) for signing
(unlisted self-distribution is fine). Release-channel Firefox on a TV box
needs the signed build; see [docs/development.md](./docs/development.md#releasing).

Source: https://github.com/inklikeurine/firefox-extensions/tree/main/10-foot-dropout

## Usage

Open `watch.dropout.tv`. The ring is on the first tile.

| Key | Does |
| --- | --- |
| ← ↑ → ↓ | Move the ring; on a season control, ← → switch season |
| Enter | Open / play; in the player, play–pause |
| Escape (or Backspace) | Close a dialog → leave the player → back one page |
| ← → in the player | Seek −10 s / +10 s (setting) |
| ↓ in the player | Move down to the page (series link, up next) |
| Media keys | Play/pause, stop, next/previous episode |
| `i` | Show/hide the hint bar; in the player, also title and time |
| `/` | Search (needs a keyboard from there on) |
| Menu key (`ContextMenu`, `F2`) | Jump to the site header and back |
| Home | Go to Browse |

Full table: [docs/keymap.md](./docs/keymap.md).

**Settings** (`about:addons` → 10-Foot Dropout → Preferences): ring colour
and width · hint bar · theater layout (auto / manual / off) · seek step ·
autoplay next · skip marketing site · what Escape does on the Browse page
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
- Login and search need a keyboard (or a phone with the HTPC shell's companion).
- Firefox may block autoplay with sound until you press Enter once or allow
  autoplay for the site.
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
