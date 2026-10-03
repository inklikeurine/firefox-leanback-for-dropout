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
| 1 | Open `https://www.dropout.tv/` | Lands on `watch.dropout.tv/browse`, which shows Leanback's Home (setting on): the rail on the left, the featured banner, the ring on *Watch now* |
| 2 | Home: Down, Right ×3, Down, Up | The ring goes into the first row and along it, the row sliding so the selected card keeps its place; each Down brings the next row to the same height, with nothing of the row above showing; Up returns to the card you left in that row. The selected card grows inside the ring, its title steps down, and neither touches the heading; the ring's corners follow the card's |
| 3 | Home: keep pressing Down | New rows arrive before you reach the last one; a row of 12 ends with *View all*, which opens the whole collection with the ring on its first tile. Shows have wide pictures (as on their own page), running times read *6:03*, New Releases has no "NEW" badges, and there is no My List row |
| 4 | Home: on the banner, Right once to **›**, Enter ×2; then Right to *My list*, Enter | **›** sits right after *Watch now*; the next featured show, then the one after; *My list* adds the show to Dropout's My List (a tick shows) and Enter again removes it. *Watch now* is black on yellow, *Trailer* white; **›** and *My list* turn no colour when selected |
| 5 | Home: Left from the first card of a row, Down, Down, Down, Right | The rail, on Home; then Browse; then My List (a bookmark); then Dropout 24/7; Right returns to the card. The current page's icon is yellow; the selected icon has the yellow box round it, with corners like the icon's, and no coloured square behind it (hovering with the mouse shows none either). OK on My List opens your saved shows as a grid, the bookmark yellow and the ring on the first; OK on Dropout 24/7 opens it with its icon yellow; the gear opens Leanback's settings on the spot |
| 6 | Home: Escape | Nothing happens (exit hook `none`); a notice says "Nothing to go back to" |
| 6a | On the rail, Browse, OK; then hold ▼ | Leanback's own screen: "Series" at the top, the shows five across as Home's cards, Browse's icon yellow on the rail; no Dropout top bar. ▼ moves a row and the row slides up to the same place; near the end more shows arrive; ◀ from the first column is the rail |
| 6b | On Home, ▼ to New Releases, ▶ to its *View all*, OK | The list drawn the same way, "New Releases" at the top, no rail, no "New" badges; Back returns to Home |
| 7 | Watch an episode for two minutes, go back to Home | It is first in Continue Watching with its progress bar and the time left to the second ("2:48 left") in the corner of its picture; an episode in progress on the Roku is in the row too |
| 8 | Open that episode again; then Back to its show | It starts where you stopped; "Resumed at …" shows for a moment; in the settings panel, *Start Over* goes back to 0:00. On the show's page the yellow button says *Resume S… E…* for it, and OK plays it |
| 9 | Enter on a show with several seasons that you have not watched | Leanback's own screen opens on the **newest** season, with no flash of Season 1: the show's wide picture and name at the top with a yellow *Play S… E1*, *Trailer* and *My List*; the seasons newest first with that one yellow; its name and episode count over the episodes, three across, with their pictures and running times; ring on Episode 1; no rail, no Dropout top bar, no Share, no dropdowns |
| 10 | Up to the seasons, Right, OK; then Back | Up lands on the yellow season; Right moves along (the row slides); OK opens that season, which turns yellow; Back leaves the show for Home |
| 10a | Up to the show's buttons, Right to *My List*, OK, OK | A tick appears on *My List* (the show is on your list), and goes on the second OK |
| 11 | Down repeatedly past the last episode | Each row slides up to the same place near the top; more episodes appear before the end; ring continues |
| 11a | Open a special (a stand-up set) | The same screen: its picture and name, *Watch Movie* yellow with the ring on it, *My List*; Down to the movie, then its extras |
| 12 | Enter on an episode | Video page, theater layout, playback starts or Enter starts it |
| 13 | In the player: Enter, Enter, Right, Left | Play: the show's name and "S… · E… · title" show top left for four seconds. Pause: the title and the control bar come up, no button ringed; Right, Left skip +10 s, −10 s with the bar still up; after four seconds both go. While playing, Right ×5 quickly: ⏩ and the new time in the middle, the bar up, steady, gone a second after the last press |
| 14 | Down, then Down again | Leanback's transport bar opens over the video; then the ring lands on the series link under the player, theater staying |
| 15 | Up | Back in the player |
| 16 | Escape, Escape | Theater off with the page visible; then back to the series page |
| 17 | From Home, open a show, an episode, let it play into the next (or press Next); then the remote's Back, twice | Back goes to the season page (not the previous episode), then Home |
| 18 | On the season page, switch season with the row, open an episode; then Back, Back | The season you switched to, then Home — not the first season |
| 19 | On a video page, press MediaPlayPause with focus on the page | Player toggles |
| 20 | Let an episode end (or seek near the end) | Eight seconds before the end, the "Up next" card over the bottom right: picture, ring counting down, "UP NEXT · 0:08", "S… · E…", the show, *OK Play now · ◀ Hide*. The next episode starts at the end (autoplay next on). Again, with OK on the card: it starts at once. Again, with ◀: the card goes and nothing plays by itself at the end |
| 21 | Series page: Enter on "Watch trailer", then Escape | Trailer modal opens with the ring inside it; Escape closes it and the ring returns to the trailer button |
| 21a | Series page: Up to *My list*, Enter, Enter | The show is added to Dropout's My List and removed again; the button shows no blue when selected |
| 21b | A show you are partway through: open the season you are watching | Watched episodes carry a tick, the one in progress a bar, and the ring starts on the one to watch next |
| 21c | Leanback settings: *Shows Open On*, OK, ▼ to *First season*, OK; open a show | The list shows both, the newest ticked; afterwards the row reads *First season*; the show opens on Season 1 |
| 21d | A special (e.g. a stand-up set from *All Series*) | *Watch Movie* and *My list* reachable; the video and its extras below |
| 22 | Fresh profile, first visit | Cookie dialog is reachable by arrows and closable by Enter, above Home |
| 23 | Click the toolbar button | Badge shows off; the site behaves as stock Firefox (Dropout's own Home is back); click again restores it |
| 24 | Change ring colour in options, reload | New colour |
| 25 | Set exit hook to *close this tab*, go to Home, Escape | Tab closes (in kiosk: Firefox exits) |
| 26 | `/search`: type a query | Letters reach the input; Escape leaves the field; the results are four across, large, and reachable with the arrows; Left from the first result reaches the rail. In the field, Left moves the text cursor, and at the start of the text reaches the rail; Right returns to the field. Down from the field reaches the filters, then the results; Up from the first row returns to the field |
| 27 | Wiggle the mouse over cards on Home and tiles on `/series` | The ring does not move; no hover tooltips appear |
| 28 | Press the keyboard's *Menu* key (`ContextMenu`) on Home | Leanback's settings slide in from the right, full height: *Leanback Settings* and a ✕ at the top, the keys along the foot, the selected entry yellow with no ring round it; switches for the on/offs, a value and › for the rest; no Home or Search; no context menu. Hovering entries with the mouse turns none of them blue |
| 28a | In that panel: ▼ to *Seek Step*, OK, ▼, OK; then *Start Videos Muted*, OK; then Left | *Seek Step*'s values open with 10 s ticked; OK on 15 s picks it and goes back up, the row now reading 15 s. The switch flips. Left closes the panel and the ring is back where it was |
| 29 | In that panel: *Clear Continue Watching*, Enter, Enter | The first Enter asks; the second clears, and Continue Watching disappears (Roku items included) until something is watched again; Dropout's bars still show on cards; episodes you had finished still carry their tick on the show's page |
| 30 | On an episode: Down, Right to the gear, Enter | The settings panel opens and the picture pauses |
| 31 | In the panel: Closed Captions, OK; OK again; then Caption Style, OK, Font, OK; then Left | Captions come on (the switch yellow) and go off again. Caption Style shows Font, Background, Window; Font's options under Color, Size and Opacity headings; Left goes back up one level, and from Caption Style straight back to the panel's top. The panel looks the same as on Home |
| 32 | During playback: settings → Leanback Settings | The same entries, in the same order and words, as the panel on Home; Seek Step opens its list there too |
| 33 | `web-ext lint --source-dir ./leanback-for-dropout --warnings-as-errors` | Passes |

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

1. From Bigscreen, open the new Dropout icon → expected: Leanback's Home
   fills the screen, with a yellow ring on the featured banner's *Watch now*,
   within ~5 s.
2. Press ▼, ▶ three times, ▼, then *back* → expected: the ring goes into the
   first row and along it, then down a row, the rows sliding into place;
   *back* on Home does nothing (or a notice appears).
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
  `TenfootPanel`, `TenfootTransport`, `TenfootSettings`).
- Log with the `[leanback-for-dropout]` prefix, `console.warn` / `console.error`
  only, for warnings, errors and one-off state changes.
- All site selectors in `sites/dropout.json` — never inline in `content/*.js`.
- Every message type is listed in [architecture.md](./architecture.md#messages)
  before it is used.
