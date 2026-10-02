# Leanback for Dropout

A Firefox extension that lets you drive [Dropout](https://watch.dropout.tv)
from the couch: a TV-style Home screen, arrow keys that move a big focus ring
between shows and episodes, Enter to play, Escape to go back, and media keys
for the player. Five keys are enough — no mouse. ("Leanback" is the industry
term for an interface you use from the sofa rather than leaning forward at a
desk.)

Unofficial. Not affiliated with Dropout or Vimeo. You need a Dropout
subscription exactly as on the website — the extension changes how you
navigate, not what you can watch.

**Manifest:** v2 · **Minimum Firefox:** 140 (desktop)

## What it does

- **A TV Home screen.** Home is Leanback's own screen, drawn from what Dropout
  puts on the page — the featured banner and every row of shows, with the same
  links. Rows slide up to the same place as you go down, the way a TV app's
  do, and more rows arrive as you get near the end. A row of more than 12 ends
  with a **View all** card. Shows appear with their wide picture, the one on
  their own page.
- **Continue Watching**, first on Home: what you started here in Firefox and
  what you started on Dropout's Roku or Android app, in one row, most recent
  first.
- **Picks up where you left off.** An episode you stopped halfway starts where
  you stopped, with a short "Resumed at 12:04" note; *Start Over* in the
  playback settings goes back to the beginning.
- **An icon rail** down the left of Home, Browse, My List, Search and
  Dropout 24/7: Search, Home, Browse, My List, Dropout 24/7, and Leanback's
  settings.
- **Search results made for a TV**: four across the screen, larger, reachable
  with the arrows.
- **A show's page made for a TV**: a row of seasons, newest first, over the
  season's episodes three across, each marked watched or in progress. A show
  opens on its newest season, with the selection on the episode to watch next.
- **Arrow-key navigation** across every other page of `watch.dropout.tv`: the
  series grid, specials and their extras, lists of episodes, search results.
- **A focus ring you can see from the sofa** — 4 px, Dropout yellow,
  configurable.
- **Theater layout** on video pages: the player fills the window; Escape brings
  the page back.
- **Player control** without a mouse: OK plays and pauses, ◀ ▶ seek, ▼ opens
  Leanback's own control bar, and media keys (play/pause, stop, next,
  previous) work from anywhere on the page.
- **The player's settings as a TV list**: quality, speed and captions —
  caption style included — in a panel you walk with the arrows.
- **Next episode** by key, and autoplay-next when an episode ends.
- **Button hints**, if you want them: a bar showing the keys that matter right
  now. Off unless turned on.
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

Open `watch.dropout.tv`. You land on Home, with the ring on the featured
banner's first button.

**This extension is driven by a remote, not a keyboard.** Only the buttons a
TV remote actually has are mapped, so nothing is hidden behind a letter key.

| Button | Arrives as | Does |
| --- | --- | --- |
| ▲ ▼ ◀ ▶ | `Arrow*` | Move the ring. Nothing else, ever. In the player, ◀ ▶ move the playhead and ▼ opens the transport bar (▼ again continues to the page) |
| OK | `Enter` | Open, play, pause; open a season; start changing a setting; take the "up next" offer when the site shows it |
| back | `BrowserBack` (also `Escape`) | Back one page — Firefox's own Back. `Escape` first closes whatever is open (a dropdown, a dialog, the options panel, the rail, the player's bar) |
| menu | `ContextMenu` | During playback, the **settings panel**; anywhere else, **Leanback's settings** as a panel on the page, with Home, Search, *Clear Continue Watching* and *Turn Leanback off* at the foot |
| home | `BrowserHome` | **Reserved for your TV shell — never intercepted** |
| volume | `AudioVolume*` | Your desktop's, never intercepted |
| media keys | `Media*` | Play/pause, stop, seek, next/previous episode, for remotes that have them |

The one keyboard exception is `/`, which opens the search field — searching
needs typing from that point anyway. Pressing it again closes search and
returns you where you were.

**Home** is one row per shelf, under the featured banner. ▲ ▼ go from row to
row, and each row remembers where you were in it; ◀ ▶ move along a row and
stop at its ends. The selected card stays in the same place and the rows move
under it. The banner shows one featured show at a time, with Dropout's own
buttons — *Watch now*, then a **›** button beside it (OK on it shows the next
featured show), then *Trailer* where there is one and *My list*. Near the
bottom, Leanback asks Dropout for more rows, just as scrolling would. Your
My List is not a row on Home; it has its own page, on the rail.

Each card shows its picture — for a show, the wide picture from the show's
own page — with the running time and Dropout's badges ("NEW EPISODE"; the New
Releases row carries none, since its name says so). The selected card grows a
little inside the yellow ring, and its title steps down to make room.

**Continue Watching** is the first row on Home. It merges two sources: how far
you got in each video here in Firefox (Leanback keeps that itself, in this
Firefox only), and the progress bars Dropout draws for what you watched on its
Roku or Android app. It is the only Continue Watching row: the one Dropout
draws for its apps is not shown, and what is on it appears here instead. The
most recent comes first; a video counts as watched at
95 %, or with less than 90 seconds left, and as started after a minute. Each
card shows its progress bar and, in the corner of the picture, the time left
to the second (*2:48 left*).
Every card on Home shows the same progress.

**The rail**: ◀ from the first card of any row, or from the banner's first
button, moves onto the rail down the left. ▲ ▼ move along it, OK opens an entry,
and ▶ returns you to exactly where you were. *Search*, *Home*, *Browse*,
*My List* (the bookmark) and *Dropout 24/7* go to those pages; the gear opens
Leanback's settings in place. The page you are on has its icon in yellow; the
yellow box is where the selection is. The rail is on Home, Browse (all shows),
My List, Search and Dropout 24/7, and not on a show's page or during playback.

**My List** is Dropout's page of the shows and videos you saved, a grid like
Browse: the selection starts on the first one, and the arrows move between
them.

**A show's page** works the same way for every show, because Leanback reads
each page as it loads rather than knowing any show by name. A show with more
than one season has a row of seasons above its episodes, newest first: ◀ ▶
move along it and OK opens that season in place of the one on screen, so Back
still leaves the show. The season on screen is the yellow one, and its full
name and episode count head the episodes, three across. A show opens on its
newest season (*Shows open on* in the settings switches that to the first),
and the selection starts on the episode to watch next: Episode 1 of a season
you have not started, otherwise the one you are partway through or the one
after the last you finished. Watched episodes carry a tick; one in progress
has a bar showing how far you got. Above the seasons are the show's *Trailer*
and *My list*. A special (a stand-up set, a film) has *Watch Movie* and
*My list*, then the video and its extras. A list (Trending, a show's new
episodes, the trailers) is just its videos or shows.

**Picking up where you left off**: open an episode you stopped halfway and it
starts where you stopped, with "Resumed at 12:04" along the bottom for a
moment. *Start Over* at the top of the playback settings goes back to 0:00.
An episode you finished, or stopped within its first minute, starts from the
beginning.

**The transport bar**: press ▼ while a video is playing. The bar is the
extension's own — **play/pause · position · settings · fullscreen** — and
◀ ▶ walk it, OK takes a control, back closes it and gives ◀ ▶ back to seeking.
The position is shown but never selected: seeking is ◀ ▶ whenever the bar is
not holding a button.

**Settings** opens a full-height panel from the right and pauses the picture.
It holds the player's settings and Leanback's in one list: *Start Over* (after
a video picked up where you left it), Quality, Speed, Play Next Episode, Closed
Captions, and **Leanback Settings** as a submenu. Quality,
Speed and Closed Captions are the player's own, and opening one shows what it
offers, as many levels deep as it goes: Closed Captions → Customize → Font,
Background, Window, each with its options grouped under headings (Color, Size,
Opacity). ▲ ▼ move; **▶ or OK opens a submenu, ◀ or back goes up one level**;
OK picks an option, flips a switch, or steps a value round its list (▶ steps it
on). ◀ or back at the top closes the panel, which starts the picture again
unless it was already paused.

**The options button** opens that panel during playback. Anywhere else it opens
Leanback's settings directly, with Home, Search, *Clear Continue Watching* and
*Turn Leanback off* at the foot of the list; ◀ or back closes it. *Clear
Continue Watching* asks for OK a second time before it clears. It forgets
every video you have not finished and empties Continue Watching, Dropout's own
progress from the Roku included, until something is watched again, here or on
another device. What you finished stays watched. Dropout's progress bars still
show on its cards, since they are Dropout's.

**Player controls** can be handed back to the site, for troubleshooting: on
the options page (`about:addons` → Leanback for Dropout → Preferences),
*Player controls → The site's own player controls* leaves the player's own bar
alone and draws nothing over the video. Use it to reach something the player
offers that Leanback has no equivalent for, or if Leanback's bar ever breaks.
Arrow navigation everywhere else is unaffected.

**Back** is Firefox's own Back: Firefox goes back on the remote's back button
whatever a page does, so Leanback works with it. It keeps the history in the
shape Back should follow: moving sideways (the next episode, another season,
another rail section) replaces the page rather than adding one, and a Back
that lands on the previous episode — when Dropout went on to the next by
itself — carries on to the season page. So Back from an episode is the season
you were watching, and from a show, Home. In a tab opened straight on a page,
with nothing behind it, Leanback walks up the site itself: episode → season →
Home. The back button leaves the page whatever is open on it, so ◀ is the way
out of what is open on a page: it closes the options panel and the playback
settings, and with the text cursor at the start of the search box it moves to
the rail. To leave the rail press ▶, to close the player's bar press ▲ (a
keyboard's Escape closes each of them first).

Full table: [docs/keymap.md](./docs/keymap.md).

**Settings** — the menu button opens them as a panel on the page (the
extension never navigates your tab away), and so does *Leanback Settings* in the
playback panel. The same settings are at `about:addons` → Leanback for Dropout →
Preferences: ring colour and width · selection zoom · button hints (off unless
turned on) · theater layout (auto / manual / off) · seek step · autoplay next ·
start videos muted · skip marketing site · which season a show opens on
(newest / first) · what back does on Home (nothing / close this tab — for kiosk
setups). The options page also has *Player controls*, the troubleshooting
switch above, and *Clear Continue Watching*. The toolbar button turns
the extension on and off; a keyboard shortcut for that can be set under
*Manage Extension Shortcuts*.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `storage` | Remembers your settings and your watch history (how far you got in each video), and, in session storage, which frame of a tab is the video player. |
| `*://watch.dropout.tv/*` | Runs the navigation script on the site and lets the toolbar toggle reach it. |
| `*://embed.vhx.tv/*` | Dropout's video player is an iframe from this host; the extension needs a script inside it to control playback and receive keys. |
| `*://www.dropout.tv/*` | Forwards the marketing home page (site root only) to Browse. |

Content scripts run on `*://watch.dropout.tv/*` (the pages), on
`*://embed.vhx.tv/*` with `all_frames: true` — that host only ever appears as
an iframe inside a Dropout page, so without `all_frames` the player script
would never run — and on `*://www.dropout.tv/` and `*://www.dropout.tv/?*`
(the marketing site's root, nothing else).

Data collection: **none**. Nothing leaves the browser. The watch history —
for each video, how far you got and when, its title and picture — is kept in
this Firefox's extension storage, for Continue Watching and resuming, and is
never sent anywhere; *Clear Continue Watching* deletes what you have not
finished. The only requests the
extension causes are for pictures: Home's cards load Dropout's own pictures
from Dropout's image server, including a show's wide picture, which
Dropout's own Home does not show. On Home it also presses Dropout's own *Show
more*, which loads more rows exactly as scrolling the page would. The manifest
declares `data_collection_permissions: { required: ["none"] }`. No `tabs`,
`webRequest` or `<all_urls>`.

## Known limitations

- Relies on Dropout's page structure (it's a Vimeo OTT site). If Vimeo changes
  the markup, navigation can break until the site rules
  (`sites/dropout.json`) are updated —
  [docs/site-notes.md](./docs/site-notes.md) records what the extension
  depends on and how to re-check it.
- If Home cannot find Dropout's rows on the page within ten seconds (a changed
  site, a page that failed to load), Dropout's own page is shown instead and
  the arrows drive it directly.
- A show's wide picture comes from the data Dropout's page was built from. If
  Dropout changes that, show cards fall back to the tall poster, cropped.
- Continue Watching knows what you watched in this Firefox, and what Dropout's
  Roku and Android apps recorded for the rows Home has loaded. Watching in
  Firefox does not reach Dropout's own history, so the Roku will not show it;
  syncing between devices is planned for 1.0.
- On the search page the remote cannot reach the results from the search
  field: there its arrows move the text cursor, and ◀ at the start of the
  field goes to the rail, not the results. A keyboard's Escape does it.
- A show opens on its newest season by going to that season's page, so
  opening a show loads two pages; the screen stays blank for that moment.
- Where the selection starts on a show is worked out from the episodes
  Dropout has put on the page. In a season longer than Dropout's first page of
  episodes, one further down is not considered until more are loaded.
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
