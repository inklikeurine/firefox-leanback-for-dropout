# Development

## Prerequisites

- Firefox 140 or newer. Developer Edition or Nightly lets unsigned extensions
  stay installed (`xpinstall.signatures.required = false`).
- Node.js for `web-ext` (`npm install --global web-ext`). The extension itself
  has no dependencies and no build step.
- A Dropout subscription. Log in **by hand** in the dev profile; credentials
  never go into files in this repository or into an AI chat.

## Running locally

From the repository root:

```sh
# fresh profile each time
web-ext run --source-dir ./leanback-for-dropout --start-url https://watch.dropout.tv/browse

# persistent profile so the Dropout login survives restarts
web-ext run --source-dir ./leanback-for-dropout \
  --firefox-profile leanback-for-dropout-dev --keep-profile-changes \
  --start-url https://watch.dropout.tv/browse

# kiosk, as the HTPC shell will run it (Escape does not leave kiosk; use the exit hook or kill the process)
web-ext run --source-dir ./leanback-for-dropout --firefox-profile leanback-for-dropout-dev --keep-profile-changes \
  --start-url https://watch.dropout.tv/browse --args=--kiosk
```

Without `web-ext`: `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on…** → `leanback-for-dropout/manifest.json`.

Inside the HTPC shell dev container the same commands run as
`dev/hx web-ext run …` from `~/src/htpc-shell` with `--source-dir` pointing at
this folder.

## Debugging

| What | Where |
| --- | --- |
| Background (relay, settings, frame registry) | `about:debugging` → this extension → **Inspect** |
| Page script | The page's devtools console (top frame) |
| Player script | Same console, frame picker → `embed.vhx.tv` |
| Rules file as loaded | Page console: `browser` is not exposed to the page; log from `page.js` under the `[leanback-for-dropout]` prefix instead |
| Storage | Background inspector → Storage → Extension Storage |

Handy checks in the **player frame** console:

```js
OTTData.video, OTTData.up_next            // what the site knows about this video
document.querySelector("video")           // the media element the extension drives
```

## Selector drift check

Run before every release and whenever navigation misbehaves. Logged-out
fetches are enough for the server-rendered pages:

```sh
UA='Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
curl -sL -A "$UA" https://watch.dropout.tv/series       -o /tmp/dtv-series.html
curl -sL -A "$UA" https://watch.dropout.tv/game-changer -o /tmp/dtv-show.html
for sel in browse-item-card browse-item-link js-switch-season js-sort-items js-load-more-items-container episode-container; do
  printf '%-32s %s\n' "$sel" "$(grep -c "$sel" /tmp/dtv-show.html)"
done
```

Every count should be ≥ 1. A zero means Vimeo OTT changed its markup: update
`sites/dropout.json` and [site-notes.md](./site-notes.md) together. (A
`tools/check-site.sh` doing exactly this is a planned follow-up.)

## Manual test checklist

Run in a logged-in profile unless stated. "Ring" = the focus ring.

| # | Step | Expected |
| --- | --- | --- |
| 1 | Open `https://www.dropout.tv/` | Lands on `watch.dropout.tv/browse` (setting on) |
| 2 | `/browse`: press Right ×3, Down, Left | Ring moves along the row, then to the next row (same column or remembered tile), then back; the row scrolls so the tile stays visible |
| 3 | `/browse`: Escape | Nothing happens (exit hook `none`); a notice says "Nothing to go back to" |
| 4 | Enter on a series tile | Series page opens; ring on the first episode |
| 5 | Up to the season select, Right, Left | Season changes each time, no dropdown opens |
| 6 | Down repeatedly past the last episode | "Load More" fires, new episodes appear, ring continues |
| 7 | Enter on an episode | Video page, theater layout, playback starts or Enter starts it |
| 8 | In the player: Enter, Enter, Right, Left | Pause, play, +10 s, −10 s |
| 9 | Down, then Down again | Leanback's transport bar opens over the video; then the ring lands on the series link under the player, theater staying |
| 10 | Up | Back in the player |
| 11 | Escape, Escape | Theater off with the page visible; then back to the series page with the ring on the episode you came from |
| 12 | On a video page, press MediaPlayPause with focus on the page | Player toggles |
| 13 | Let an episode end (or seek near the end) | Next episode starts (autoplay next on) |
| 14 | Series page: Enter on "Watch trailer", then Escape | Trailer modal opens with the ring inside it; Escape closes it and the ring returns to the trailer button |
| 15 | Fresh profile, first visit | Cookie dialog is reachable by arrows and closable by Enter |
| 16 | Click the toolbar button | Badge shows off; the site behaves as stock Firefox; click again restores it |
| 17 | Change ring colour in options, reload | New colour |
| 18 | Set exit hook to *close this tab*, go to `/browse`, Escape | Tab closes (in kiosk: Firefox exits) |
| 19 | `/search`: type a query | Letters reach the input; Escape leaves the field |
| 20 | Wiggle the mouse over tiles on `/browse` | The ring does not move; no hover tooltips appear |
| 21 | Press the keyboard's *Menu* key (`ContextMenu`) on `/browse` | Leanback's settings open as a panel; no context menu |
| 22 | On an episode: Down, Right to the gear, Enter | The settings panel opens and the picture pauses |
| 23 | In the panel: Closed Captions → OK → Customize → OK → Font | Font's options, under Color, Size and Opacity headings; ◀ goes back up one level at a time |
| 24 | Leanback Settings → Seek Step, OK repeatedly | The value goes round from 300 s back to 5 s |
| 25 | `web-ext lint --source-dir ./leanback-for-dropout --warnings-as-errors` | Passes |

## Verification hand-off

For the HTPC shell project lead, in the format of the HTPC shell's
`docs/verification-protocol.md`. The assistant sets everything up; the lead
only presses keys and reports.

**Verification — DTV-1 — Dropout by D-pad only**
Setup: the assistant starts the logged-in dev profile with the extension in
kiosk mode on `/browse`, nested in gamescope on the workstation (or on the
TV once the test box exists). Keyboard only; do not touch the mouse.

1. Press Right three times, then Down → expected: a yellow ring moves tile by
   tile, then to the row below; nothing else on the page changes.
2. Press Enter on any series, then Enter on any episode → expected: the video
   fills the screen and plays; if it doesn't start, one more Enter starts it.
3. Press Left, then Right → expected: the picture jumps back ~10 s, then
   forward ~10 s.
4. Press Escape twice → expected: first the page around the player comes
   back, then the series page with the ring on the episode you played.
5. Press Escape until you are on the first page, then once more → expected:
   the window closes and you are back where you started (the HTPC shell or the
   desktop).

Report: which step first did something unexpected, and a photo or screenshot
of the screen at that moment. Time: ~5 minutes.

**Verification — DTV-2 — Bedroom HTPC, W1 remote, against the Waydroid app**
Setup: the assistant has installed the signed extension in a `dropout`
Firefox profile on the box, logged in once (by hand), and added a Bigscreen
icon ([targets.md](./targets.md#launch-recipe-sketch--verify-on-the-box-item-t1t8)).
Remote only; mouse mode off.

1. From Bigscreen, open the new Dropout icon → expected: Browse fills the
   screen with a yellow ring on the first tile within ~5 s.
2. Press ▶ three times, ▼, then *back* → expected: ring moves along, then
   down a row; *back* on Browse does nothing (or a hint appears).
3. OK on a series, OK on an episode → expected: the video fills the screen
   and plays; if not, one more OK.
4. Press *menu* once → expected: nothing pops up over the video (if a
   right-click-style menu appears, that is the T3 finding — report it).
5. ◀, ▶ → expected: ~10 s back, ~10 s forward.
6. Press *back* until Browse, then *back* once more → expected: Firefox
   closes and Bigscreen is back.
7. Open the same episode in the Waydroid Dropout app → expected: nothing
   specific — this is the comparison.

Report: step that misbehaved first (photo); which of the two — Firefox or
the Waydroid app — was smoother to navigate and to watch, in one sentence.
Time: ~10 minutes.

## Releasing

1. Bump `version` in `manifest.json`; note the change in the README if user
   visible.
2. Run the selector drift check and the manual checklist.
3. `web-ext lint --source-dir ./leanback-for-dropout --warnings-as-errors`.
4. `web-ext build --source-dir ./leanback-for-dropout` → `web-ext-artifacts/*.zip`.
5. Submit on [addons.mozilla.org](https://addons.mozilla.org/developers/) as
   **unlisted** (self-distributed). The signed `.xpi` is what the HTPC shell's
   `policies.json` installs and what users can install permanently.
6. Before the **first** submission, check the add-on name against Mozilla's
   current add-on policies on trademarks. **"Leanback for Dropout" puts the brand
   second**, which reads more like an official Dropout product than the
   "X for <brand>" form ("Couch Mode for Dropout") that the policies most
   clearly allow — worth settling before the name is locked, because the
   extension ID cannot change after the first release. Either way the listing
   and the README must say it is unofficial and not affiliated with Dropout.

## Coding conventions

- Plain ES2020, no modules that need bundling. The scripts in one manifest
  entry share a global, and each file publishes one frozen object on it
  (`TenfootKeymap`, `TenfootSiteRules`, `TenfootSpatial`, `TenfootFocusRing`,
  `TenfootMenu`, `TenfootTransport`, `TenfootSettings`).
- Log with the `[leanback-for-dropout]` prefix, `console.warn` / `console.error`
  only, for warnings, errors and one-off state changes.
- All site selectors in `sites/dropout.json` — never inline in `content/*.js`.
- Every message type is listed in [architecture.md](./architecture.md#messages)
  before it is used.
