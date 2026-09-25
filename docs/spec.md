# Leanback for Dropout — product spec

**Status: implemented in 0.1.1** (2026-09-22). This is the product spec; how
the code realises it, and where it departed from the original design, is in
[architecture.md](./architecture.md). Everything below described as v0.1
functionality is built. What has *not* been confirmed is the site knowledge it
rests on: the Browse-row and player-frame selectors come from Vimeo OTT's
script bundles, not from a logged-in session
([site-notes.md](./site-notes.md), U1–U14).

## About

- A Firefox extension that makes **watch.dropout.tv** usable from the couch:
  arrow keys move a big focus ring between tiles, Enter plays, Escape goes
  back, media keys drive the player. Five keys are enough; no mouse.
- Dropout runs on **Vimeo OTT**. The site's pages are server-rendered or
  React-rendered on `watch.dropout.tv`; the **player is a cross-origin iframe
  from `embed.vhx.tv`** wrapping Vimeo's standard player. The extension
  therefore has two content scripts — one for the page, one for the player
  frame — talking through the background script.
- Everything site-specific (routes, selectors, key map) lives in one data file,
  `sites/dropout.json`, so a site change is a data fix. The navigation engine
  (`nav/*`) knows nothing about Dropout, so the same approach can serve another
  site later (Twitch is the obvious candidate) and other projects can borrow it.
- **Standalone by decision (2026-09-20).** It is not a part of the HTPC shell's
  `tv-nav`; the HTPC shell installs it as-is in its Dropout kiosk profile
  ([docs/htpc-integration.md](./docs/htpc-integration.md)).

## Goals

- Browse → series → season → episode → playback using only the buttons a TV
  remote has: **▲ ▼ ◀ ▶, OK, back and menu**. No keyboard shortcut is ever
  required, and **arrow keys never mean anything but navigation**.
- A focus ring readable from 3 m.
- Player control from the remote: play/pause, seek, next/previous episode,
  captions.
- A **theater layout** on video pages: the player fills the viewport; the rest
  of the page is one Escape away.
- Zero data collection, no network requests of its own, no build step.
- Site knowledge kept as data and checkable with a script, so following site
  changes is cheap.

## Non-goals

- Not an ad blocker, not a downloader, not a paywall or DRM workaround. It
  needs a paid Dropout login exactly as the site does.
- No on-screen keyboard. Search and login need a real keyboard or a phone
  (the HTPC shell supplies its own OSK bridge). `/` opens the search field and is the
  **only** keyboard key the extension maps.
- Not a general spatial-navigation extension — it runs only on Dropout hosts.
- No watch history, sync or account features of its own; the site keeps those.
- No Chromium build for now. Stay on the `browser.*` promise API so a port
  remains possible.

## Who it's for

1. Anyone watching Dropout on a PC connected to a TV, driving it with a
   keyboard, an HID remote (arrows, Enter, Escape, media keys) or a gamepad
   mapped to keys.
2. **The bedroom HTPC** — a KDE Plasma Bigscreen appliance driven only by a
   WeChip W1 air-mouse remote, where Dropout today runs as an Android TV app
   inside Waydroid. Firefox + this extension is the candidate replacement.
   Its constraints (which keys the remote actually sends, no global remaps,
   release-channel Firefox) are in [docs/targets.md](./docs/targets.md).
3. **The HTPC shell** (`~/src/htpc-shell`): its Dropout web app (ADR-0014) installs this
   extension in the Dropout kiosk profile. The HTPC shell's spike S08 uses it for the
   Dropout step.

Both TV setups share the rules that shape this spec: one tab opened straight
on `/browse`, fullscreen or kiosk, no pointer in normal use, and "leaving"
means Back at the top level closes Firefox.

## Core functionality (v0.1)

- **Scope.** Runs on `watch.dropout.tv` (page script) and `embed.vhx.tv`
  (player-frame script). On `https://www.dropout.tv/` (marketing site, root
  only) it forwards to `https://watch.dropout.tv/browse` when the
  *skip marketing site* setting is on (default on).
- **Spatial navigation.** Arrow keys move DOM focus to the nearest focusable
  element in that direction. A tile with two links (image + title) counts as
  one target. On `/browse`, rows are navigated row-wise: Left/Right stays in
  the row, Up/Down changes row and restores that row's last focused tile
  (focus memory). Open dialogs (trailer modal, cookie banner) trap focus until
  closed. Details: [docs/architecture.md](./docs/architecture.md).
- **Focus ring.** One overlay element drawn over the focused target: 4 px ring
  in Dropout yellow (`#feea3b`) with a 2 px dark edge, 8 px radius, optional
  1.04× scale of the target. Follows scroll and resize. Colour and width are
  settings. Honours `prefers-reduced-motion`.
- **Select / Back.** OK activates the focused element (native activation for
  links and buttons, synthetic click otherwise). The back button goes back:
  `history.back()` when there is history, otherwise the structural parent
  (video → series page → `/browse`). At `/browse` with nothing to go back to,
  Back runs the **exit hook** (setting: *nothing* (default) or *close this tab*
  — the HTPC shell kiosk hand-off).
- **Season and sort controls.** The series page's native `<select>` elements
  are focusable, and are **two-step controls**: Enter engages one, Left/Right
  then step its options without opening the native dropdown and without firing
  `change`, Enter commits (the site navigates on the change) and Escape
  restores the value it had. Arrows only reach the options while the control is
  engaged — otherwise Left/Right could never carry the ring past a dropdown to
  the control beside it, which is exactly how the season dropdown became
  unreachable in 0.1.1.
- **Load more.** Moving Down past the last row of a grid triggers the site's
  "Load More" control and continues once new tiles arrive.
- **Video pages.** On load: enter theater layout, focus the player. Inside the
  player: Enter/Space/Play-Pause toggles playback, Left/Right seeks ±10 s
  (setting), Down leaves the player to the page below (up-next, series link),
  Escape leaves theater layout, Escape again goes back. Media keys
  (Play/Pause, Stop, Next, Previous) work from anywhere on a video page.
  Full table: [docs/keymap.md](./docs/keymap.md).
- **Next / previous episode.** Uses the site's own up-next data when present;
  otherwise the episode order from the series page. **Autoplay next** on
  `ended` is a setting (default on).
- **Transport row.** ▼ on a playing video opens the player's own control bar;
  ◀ ▶ walk it (and stop seeking while it is open), OK takes a control, back
  closes it. This is the intended way to reach subtitles and volume — they are
  the player's controls, so the extension borrows them rather than
  reimplementing them. ▼ again continues to the page below.
- **Options panel.** The menu button opens it: episode skip, the link to the
  show, Browse, Search, settings, turning the extension off. ▲ ▼ move, OK
  takes an entry, back closes. Without it those features would need letter
  keys, which on a remote means the QWERTY pad on the back.
- **Settings in the page.** "Leanback settings" fills the same panel rather
  than opening a tab: any navigation away from the site would tear the
  extension's state down, and in a kiosk there is no way back. Each row is the
  same two-step control as a season dropdown.
- **Hint bar.** A bottom strip showing the buttons that matter in the current
  context, ≥ 24 px text. It stays on screen and follows the selection, so the
  controls are always readable from the sofa; during playback it keeps out of
  the way and appears briefly on a press.
- **Toggle.** Clicking the toolbar button, the options panel's "Turn Leanback
  off", or a user-assigned keyboard shortcut (`commands` API, no default
  binding) turns the extension off/on for the site; state persists.

## Optional / future functionality

- OSD with title and time. Removed in 0.3.0 along with the `i` key that was
  its only trigger; it needs a trigger that is not a letter — an options-panel
  entry, or showing it automatically on pause.
- Native-messaging exit hook and OSK text bridge (the HTPC shell only — stays in
  The HTPC shell's own extension; this extension keeps the seam, not the feature).
- Gamepad support via the Gamepad API (today: map the pad to keys outside the
  browser).
- Selector drift check script (`tools/check-site.sh`) run in CI weekly.

## Permissions

- `storage` — settings.
- Host permissions `*://watch.dropout.tv/*`, `*://embed.vhx.tv/*` (content
  scripts; `embed.vhx.tv` needs `all_frames: true` because it only ever loads
  as an iframe) and `*://www.dropout.tv/*` (root redirect only).
- `data_collection_permissions: { required: ["none"] }` — nothing leaves the
  browser.
- **Not** requested: `tabs` (the background can message the sending tab and
  close it via `sender.tab.id` without it), `webRequest`, `nativeMessaging`,
  `<all_urls>`. If a permission is added, explain it here, in the README, and
  in the options page.

## Architecture overview

- `background.js` (event page, `persistent: false`): settings defaults and
  storage, relay between the page frame and the player frame (keyed by tab and
  frame id), `commands` handler, toolbar toggle, exit hook.
- `content/page.js` (top frame of `watch.dropout.tv`): loads
  `sites/dropout.json`, detects the page kind from the URL, runs spatial
  navigation, focus ring, hint bar, theater layout, back logic, load-more.
- `content/player.js` (every `embed.vhx.tv` frame): finds the `<video>`,
  handles keys while the frame has focus, executes player commands, reports
  state (`paused`, `currentTime`, `duration`, `ended`, up-next) to the page.
- `nav/spatial.js`, `nav/focus-ring.js`: site-agnostic pieces — they only see
  the rules object, never Dropout selectors — so they can be reused for
  another site or borrowed by another project without edits.
- `sites/dropout.json`: routes, page kinds, focusable/tile/row selectors,
  modal selectors, player selectors, key map overrides.
- `options/`: settings page (keyboard-operable, follows system theme).

## Settings and storage

`storage.local`:

One object under the `settings` key, normalised on every read (a missing or
corrupt value falls back to the default rather than throwing) by
`lib/settings.js`, which every context shares.

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | TV navigation on for Dropout hosts |
| `ringColor` | `"#feea3b"` | ring colour, `#rrggbb` |
| `ringWidth` | `4` | px, clamped to 2–12 |
| `focusZoom` | `5` | how much bigger the selected item gets, in percent; 0 turns it off, as does a system reduced-motion preference |
| `hintBar` | `true` | show the hint bar |
| `theater` | `"auto"` | `auto` on every video page, `manual` (OK on the player), `off` |
| `seekStep` | `10` | seconds per ◀ ▶ press in the player; one of 5, 10, 15, 30, 60, 120, 300 |
| `autoplayNext` | `true` | play the next episode when one ends |
| `startMuted` | `false` | start videos muted. Off by default: Dropout starts them muted to satisfy Firefox's autoplay policy, and the extension turns the sound back on once per video |
| `skipMarketingSite` | `true` | forward `www.dropout.tv/` to `watch.dropout.tv/browse` |
| `exitHook` | `"none"` | `none` or `close-tab` — what Back does at the top level |

## UI requirements

- The focus ring and hint bar are the only UI on the page. Both must stay
  legible over light and dark thumbnails and must never cover the focused
  element's text.
- Options page: plain form, ≥ 16 px text, fully operable by Tab/arrows/Enter,
  light/dark via `prefers-color-scheme`.
- No browser-action popup — a popup cannot be driven from a remote.

## Performance notes

- No polling. A debounced `MutationObserver` (100 ms) invalidates the
  focusable-candidate cache; candidates and rects are computed on keypress.
- Focus ring updates are `requestAnimationFrame`-throttled on scroll/resize.
- Arrow repeat is capped at one move per 80 ms.
- Player state messages are sent on change and at most 4×/s while playing.

## UX guidelines

- Exactly one focused element is always visible; on page load focus lands on
  the first content tile (never on the header, never nowhere).
- Never trap focus except inside a real dialog, and Escape always closes it.
- Never inject synthetic key events into the page; act on elements directly.
- Never override the site's behaviour for keys the extension doesn't need.
  Typing in an input field is left alone except for Escape.
- Structural Back must always lead somewhere sensible even when the tab was
  opened straight onto a deep link (kiosk case).
- **Focus never follows the pointer.** Air-mouse remotes drift; `mouseover`
  must not move the ring, and the site's hover tooltips over tiles are
  suppressed while the extension is on. A deliberate click still activates.
- Keys the browser or desktop own (`BrowserBack`, `BrowserHome`,
  `ContextMenu`, volume) are handled as in [docs/keymap.md](./docs/keymap.md):
  intercept what the page can, never fight what it can't.

## Testing

Manual checklist (full version with expected results in
[docs/development.md](./docs/development.md)):

- `/browse`: arrows move between and along rows; the ring is visible; Enter
  opens a series or episode; Escape at `/browse` does nothing (exit hook off).
- `/series` grid: Down past the last row loads more; focus continues.
- Series page: season switch by Left/Right; Enter on an episode plays it.
- Video page: theater layout appears; Enter/Space toggles; Left/Right seeks;
  Down reaches the page; Escape ×2 returns to the series page.
- Media keys work on a video page from anywhere on the page.
- Autoplay next: the next episode starts when one ends.
- Trailer modal and cookie banner: Escape closes; focus returns.
- Toggle off: the site behaves as stock Firefox; toggle on restores it.
- Pointer drift: moving the mouse over tiles does not move the ring.
- Settings persist across restarts.
- `web-ext lint --warnings-as-errors` passes.

## Known limitations

- Depends on Dropout's markup; class names can change without notice.
  `sites/dropout.json` and the drift check are the mitigation.
- Rows on `/browse` and the player frame's internals were **not inspectable
  logged-out** — see the *unverified* list in
  [docs/site-notes.md](./docs/site-notes.md). Verify in a logged-in session
  before relying on them.
- Login and search need a keyboard or the HTPC shell OSK bridge; login also loads
  reCAPTCHA Enterprise, which may block a kiosk login flow.
- Firefox's autoplay policy may block autoplay-with-sound until the site has
  played once by user gesture (Enter counts) or autoplay is allowed for the
  site.
- **Release-channel Firefox (Fedora's, Mint's) keeps only AMO-signed
  extensions installed.** Until the first unlisted signing, the extension can
  only be loaded temporarily — fine for development, useless on an appliance.
  Signing is therefore an early milestone, not a release-day step.

## Release checklist

- Bump `version` in `manifest.json`.
- Re-run the selector drift check; update `sites/dropout.json` if needed.
- Run the manual test checklist in a fresh profile and in a logged-in profile.
- `web-ext lint --warnings-as-errors`, `web-ext build`.
- Sign on AMO as **unlisted** (needed for a permanent install on release
  Firefox and for policy install in the HTPC shell). Check the add-on name against
  Mozilla's trademark rules before the first submission.

## Troubleshooting

- No focus ring: the extension is toggled off (toolbar badge), or the page is not on a
  Dropout host, or the rules file failed to load (background console).
- Arrows do nothing on a page: the page kind wasn't recognised (URL not in
  `routes`) — check `sites/dropout.json`.
- Keys don't reach the player: the `embed.vhx.tv` script didn't register
  (frame blocked, or `all_frames` missing) — see the relay log in the
  background console.
- Playback doesn't start: autoplay blocked — press Enter once; check
  `about:preferences#privacy` → Autoplay for the site.
