# Key map

**The rule: only what a TV remote's face sends is mapped.** There are no
keyboard shortcuts in this extension, with exactly one noted exception (`/`
for search). No feature is reachable only by pressing a letter, because on a
remote that means flipping it over to a cramped QWERTY pad — which is the
thing this extension exists to avoid.

**Arrow keys navigate and do nothing else.** Not captions, not skipping an
episode, not anything that could be mistaken for a command. A control that
swallows an arrow key makes everything beyond it unreachable.

Keys map to **actions** first (the vocabulary is the HTPC shell's Appendix A, so a
remote, a gamepad-to-key mapper and a keyboard all look the same), then each
context decides what an action does.

## The remote's face

| Button | Arrives as (`event.key`) | Action |
| --- | --- | --- |
| ▲ ▼ ◀ ▶ | `ArrowUp` `ArrowDown` `ArrowLeft` `ArrowRight` | `up` `down` `left` `right` |
| OK | `Enter` | `select` |
| back | `BrowserBack`, or `Escape` on remotes that send it | `back` |
| menu | `ContextMenu` | `menu` — opens the settings |
| home | `BrowserHome` | **reserved**: never mapped, the TV shell owns it |
| volume ± | `AudioVolumeUp` / `AudioVolumeDown` / `AudioVolumeMute` | never intercepted; the desktop owns it |

Media keys are kept for remotes that have them (the W1 does not). They are
remote-class keys, not keyboard shortcuts: `MediaPlayPause` / `MediaPlay` /
`MediaPause` → `play_pause`, `MediaStop` → `stop`, `MediaTrackNext` /
`MediaTrackPrevious` → `next` / `previous`, `MediaFastForward` /
`MediaRewind` → `fast_forward` / `rewind` (3 × the seek step).

`BrowserSearch`, which some remotes have, is `search`.

## The one keyboard exception

`/` opens the search field. Search needs typing from the moment it opens, so
reaching it with a keyboard costs nothing. Everything else a keyboard could
do is reachable from the remote.

While the focus is in a text field, **only the back button is ours** — even
`/` belongs to the field — plus ◀ when the text cursor is at the very start
with nothing selected (it leaves the field, for the rail on the search page)
and ▼ in a one-line field such as the search box (it leaves the field for
what is below it: the result filters, then the results; with nothing below,
it stays the field's). In a field of several lines ▼ moves the cursor.

## Actions → behaviour by context

| Action | Page (`grid` / `series` / `search` / `other`) | Settings panel (page) | `video`, focus on the page | `video`, focus in the player |
| --- | --- | --- | --- | --- |
| `up` | spatial / row move | previous entry | spatial; from the topmost element → player | closes the transport bar |
| `down` | spatial / row move; past the last row → Load More | next entry | spatial | opens the **transport bar**; from the bar, on to the page |
| `left` / `right` | spatial / row move (an **engaged** `<select>` takes them instead); ◀ at the left edge enters the rail where there is one | ◀ **up one level**, at the top **closes the panel**; ▶ takes the entry (never an action) | spatial | seek ∓/± the seek step; **while the bar is open they walk it instead**; ◀ hides the "Up next" card while it is up |
| `select` | activate; on a season, open it; on a `<select>` → engage or confirm; on the player → enter the player | take the entry: flip a switch, open a list of values, pick one; Clear Continue Watching asks once more | activate | play / pause; take the control under the selection; play the next episode while the "Up next" card is up |
| `back` (Escape) | cancel an engaged `<select>` → close a dialog → the page before; with nothing behind, **one layer up the site** | up one level → close | leave theater; else the page before | submenu → settings panel → transport bar → playback → the page before |
| `back` (BrowserBack) | Firefox's own Back, everywhere; Leanback steps in only when nothing of the site is behind the page, and then does what Escape does | | | |
| `menu` | **opens Leanback's settings** | closes it | opens Leanback's settings | opens the **settings panel** in the player frame |
| `search` | go to `/search` | — | same | same |
| `play_pause` `stop` `next` `previous` `fast_forward` `rewind` | ignored (no player) | — | forwarded to the player | handled in the player |

**Back follows the history, and the history is kept structural.** The
remote's Back is Firefox's own Back (T2 below), and Escape does the same after
closing whatever is open on the page. Sideways moves never add a page to the
history, and a Back that lands on the previous episode carries on, so Back
walks up the site — episode → the season page you came from → Home — rather
than through every episode you watched. In a tab opened straight on a page,
with nothing behind it, Back walks up the site the same way on its own.

## Home and the rail

Home (`/browse`, and hubs such as `/dimension-20`) is Leanback's own screen:
the featured banner's buttons, then one row per shelf.

| Action | Home | The rail |
| --- | --- | --- |
| `up` / `down` | row to row; each row comes back to the card last selected in it. The selected row always lands at the same height. Two rows from the end, more rows are asked for | move along the rail, no wrap |
| `left` / `right` | along the row or the banner's buttons, stopping at the ends; ◀ at the start enters the **rail** | ▶ returns to exactly where the selection came from; ◀ does nothing |
| `select` | open the card (its own link: a show, an episode, *View all*); on the banner, its button — **›**, beside *Watch now*, shows the next featured show | open the entry: Search, Home (on Home: back to the banner), Browse (all shows), Dropout 24/7, the gear (Leanback's settings, in place) |
| `back` | the page before (Firefox's Back); at Home with nothing behind, the exit hook | Escape: back to the show it came from. BrowserBack leaves the page |
| `menu` | Leanback's settings | the same |

The rail is also on Browse (`/series`), My List and Search, where ◀ reaches it from
anything at the left edge. It is not on a show's page or during playback.

## A show's page

The show's buttons (*Trailer*, *My list*), then the row of seasons, newest
first, then the season's episodes, three across. A show opens on its newest
season (setting: *Shows open on*), with the selection on the episode to watch
next.

| Action | The show's buttons and episodes | The row of seasons |
| --- | --- | --- |
| `up` / `down` | spatial; ▲ from the episodes into the row lands on the season on screen, or where the row was left | spatial: ▲ the show's buttons, ▼ the episodes |
| `left` / `right` | spatial | along the row, which slides to keep the selection in view; stops at its ends (there is no rail here) |
| `select` | open the episode, or take the button | open that season, in place of this one; on the season already on screen, down to its episodes |
| `back` | the page before (Firefox's Back): switching seasons never adds a page, so Back leaves the show | the same |

A special (*Watch Movie*, *My list*, the movie and its extras) and a list
(Trending, a show's new episodes) are driven the same way, without a row.

## The options button

It opens the settings, and which settings depends on where you are.

**During playback** it opens the **settings panel** in the player frame (below).
**Everywhere else** — including an episode page whose player cannot be reached —
it opens Leanback's own settings as a panel on the page: the same list, drawn
the same way, as under *Leanback Settings* in the playback panel. Two entries
that are not settings sit at the foot:

| Entry | Does |
| --- | --- |
| Clear Continue Watching | forgets every video not finished, and empties Continue Watching; watched ones stay watched. The first OK asks, the second clears |
| Turn Leanback Off | the site behaves as stock Firefox |

▲ ▼ move, no wrapping. OK or ▶: a switch flips, an entry with several values
opens its short list (OK picks one, ticked, and goes back up). ◀ or Back go
up one level, and close the panel from its top. Home and Search are the
rail's (and Back's, and `/`'s).

## The transport bar

**Ours, not the player's.** ▼ on a playing video opens it:

```
( ▶ )  ————————●————————————  ( ⚙ ) ( ⛶ )
       12:04            24:30
```

A round play/pause button, the progress bar with the time so far under its
start and the length under its end, then round settings and full-screen
buttons; the selected button has the yellow ring round it. The title (the
show, then "S9 · E3 · Whodunnit") is over the top left whenever the bar is
up.

A **pause** brings the bar and the title up for four seconds *without the
selection*: no button is ringed, and the keys stay playback's — ◀ ▶ skip, OK
plays (the bar goes), ▼ enters the bar on play/pause. A **skip** does the
same until a second after the last press, with ⏪ / ⏩ and the new time in the
middle of the picture.

- ◀ ▶ walk it, no wrapping. The **position is shown but never selected** —
  seeking is what ◀ ▶ do whenever the bar is not holding a button.
- OK takes the control. Play/pause, seeking and fullscreen drive the `<video>`
  and the frame directly, so none of it depends on the player's markup.
- **▲ or back** closes the bar and ◀ ▶ go back to seeking. ▼ closes it and
  carries on to the page below.
- If there is no video to drive, ▼ moves to the page, so it is never a dead
  key.

There are no seek-preview thumbnails: this player carries no storyboard or frame
index, only a single poster image ([site-notes.md](./site-notes.md)).

## The settings panel

OK on **settings**, or the options button, opens a full-height panel from the
right. It pauses the picture, and starts it again on the way out unless it was
already paused.

| Row | Comes from |
| --- | --- |
| Start Over | only after the video picked up where it was left: back to 0:00 |
| Quality | the player's own menu |
| Speed | the player's own menu |
| Play Next Episode | goes to the next episode — it is a link, not a toggle |
| Closed Captions | a switch: OK turns the player's first track on, or captions off; ▶ opens the player's CC/subtitles menu (its tracks, and Customize) |
| Caption Style | the player's Customize → Font, Background, Window; one ◀ comes all the way back |
| Leanback Settings | Leanback's own, the same list as on a page: Autoplay Next Episode, Shows Open On, Seek Step, Theater Layout, Start Videos Muted, Button Hints, Enlarge Selection, Ring Width, Ring Colour, Skip dropout.tv Home, Back On Home; then Clear Continue Watching (OK twice) and Turn Leanback Off |

- ▲ ▼ move, no wrap. **OK or ▶ takes the entry**: a submenu opens; an on/off
  switch flips; an entry with several values opens its short list, where OK
  picks one (ticked) and goes back up. ▶ never runs an action (Start Over,
  Play Next Episode, Clear Continue Watching).
- **◀ or Back goes up one level**; at the top they close the panel; Back
  again, the bar.

The rows that come from the player are **proxied**: its menu is opened out of
sight, read, and drawn in our own list, and the original is clicked when an
entry is taken. The panel follows it as many levels deep as it goes, lists only
the options it is showing (a collapsed section's are listed once it is
opened), heads each group of options with its name (Color, Size, Opacity), and
leaves a submenu with the player's own Back. After a pick it shows whatever the
player shows next: a caption colour stays on its panel with the tick moved; a
caption track goes back up with the new value. None of its markup is ever on
screen.

## Keys the browser or the desktop own

| Key | Who else acts on it | How it is handled |
| --- | --- | --- |
| `BrowserBack` (`KEY_BACK`) | Firefox: history back | **Firefox's.** Not cancelled — it cannot be (T2 below). Leanback keeps the history in the shape Back should follow instead, and acts only when there is no page of the site behind this one. |
| `BrowserHome` (`KEY_HOMEPAGE`) | Firefox: home page; Plasma Bigscreen: global "home" | **Reserved.** Never mapped. Point the kiosk profile's home page at `/browse` so a stray press is harmless. |
| `ContextMenu` (`KEY_COMPOSE`, the W1's *menu*) | Firefox: opens the context menu | `menu`; the keyboard-originated `contextmenu` event is cancelled, a real right-click is not. |
| `AudioVolumeUp/Down/Mute` | The desktop's volume control | Never intercepted. |
| `Escape` | Firefox: leaves DOM fullscreen | Theater layout is CSS, not DOM fullscreen, so it stays ours. |

### T2 — Back is Firefox's

The W1's back button sends `KEY_BACK` (Consumer Control), which arrives as
`event.key === "BrowserBack"` (`trusted`, seen at capture and bubble).
Cancelling it with `preventDefault()` does **not** stop Firefox's own
history-back — on the page or with the player focused ([targets.md](./targets.md)
T2, checked with [Leanback Dev Probe](../../leanback-dev-probe/)'s Block Back),
and an extra history entry for it to land on does not hold it either. So
Leanback follows Firefox's Back rather than fighting it
([architecture.md](./architecture.md#back-contentpagejs--navtrailjs)):
moving sideways (another episode, another season, another rail section)
replaces the page instead of adding one; landing by Back on the previous
episode — when Dropout itself went on to the next — carries on to the season
page; and in a tab opened straight on a page, with nothing behind it, Leanback
does the Back itself. What that means for layers: the remote's Back leaves the
page, whatever is open on it, so ◀ is the way out of what is open: it closes
the settings panel (as the menu button does) and the playback settings, one
submenu at a time, and leaves the search box from the start of its text (▼
leaves it for the results). The
rail closes with ▶, the transport bar with ▲.

## Remote example: WeChip W1 air mouse

The bedroom HTPC's only input device ([targets.md](./targets.md#target-2--bedroom-htpc-kde-plasma-bigscreen--wechip-w1)).
Every button, and what it does — the QWERTY pad on the back is needed only to
type a search query or log in:

| Button | Arrives as | Home, Browse, series pages | Video page |
| --- | --- | --- | --- |
| ▲ ▼ ◀ ▶ | `Arrow*` | move the ring | ◀ ▶ seek; ▼ the transport bar, ▼ again the page |
| OK | `Enter` | open / play | play – pause; take the control under the selection |
| back | `BrowserBack` | Firefox's Back: the page before — Home from a show, whichever season it is on | Firefox's Back: the season page (past any episodes Dropout went on to by itself) |
| menu | `ContextMenu` | Leanback's settings | the settings panel |
| home | `BrowserHome` | nothing (reserved for Bigscreen) | nothing |
| volume ± | `AudioVolume*` | system volume | system volume |
| QWERTY pad | — | `/` opens search; typing in search and login | — |

Five buttons (▲ ▼ ◀ ▶ OK) plus *back* and *menu* do everything. The W1 has no
media keys; the ones the extension maps are there for remotes that do.
