# Key map

**The rule: only what a TV remote's face sends is mapped.** There are no
keyboard shortcuts in this extension, with exactly one noted exception (`/`
for search). No feature is reachable only by pressing a letter, because on a
remote that means flipping it over to a cramped QWERTY pad — which is the
thing this extension exists to avoid.

**Arrow keys navigate and do nothing else.** Not captions, not skipping an
episode, not anything that could be mistaken for a command. A control that
swallows an arrow key makes everything beyond it unreachable, which is how the
season dropdown became unreachable in 0.1.1.

Keys map to **actions** first (the vocabulary is the HTPC shell's Appendix A, so a
remote, a gamepad-to-key mapper and a keyboard all look the same), then each
context decides what an action does.

## The remote's face

| Button | Arrives as (`event.key`) | Action |
| --- | --- | --- |
| ▲ ▼ ◀ ▶ | `ArrowUp` `ArrowDown` `ArrowLeft` `ArrowRight` | `up` `down` `left` `right` |
| OK | `Enter` | `select` |
| back | `BrowserBack`, or `Escape` on remotes that send it | `back` |
| menu | `ContextMenu` | `menu` — opens the options panel |
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
`/` belongs to the field.

## Actions → behaviour by context

| Action | Page (`browse` / `grid` / `series` / `search`) | Options panel (page) | `video`, focus on the page | `video`, focus in the player |
| --- | --- | --- | --- | --- |
| `up` | spatial / row move | previous entry | spatial; from the topmost element → player | closes the transport bar |
| `down` | spatial / row move; past the last row → Load More | next entry | spatial | opens the **transport bar**; from the bar, on to the page |
| `left` / `right` | spatial / row move (an **engaged** `<select>` takes them instead) | nothing, unless a settings row is being changed | spatial | seek ∓/± the seek step; **while the bar is open they walk it instead** |
| `select` | activate; on a `<select>` → engage or confirm; on the player → enter the player | take the entry, or start changing a settings row | activate | play / pause; take the control under the selection; take the "up next" offer |
| `back` | cancel an engaged `<select>` → close a dialog → **one layer up the site** → at `/browse` the exit hook | undo a settings row → close | leave theater; else one layer up | submenu → settings panel → transport bar → playback → one layer up |
| `menu` | **opens Leanback's settings** | closes it | opens Leanback's settings | opens the **settings panel** in the player frame |
| `search` | go to `/search` | — | same | same |
| `play_pause` `stop` `next` `previous` `fast_forward` `rewind` `subtitle` `mute` | ignored (no player) | — | forwarded to the player | handled in the player |

**Back is structural, never historical.** It walks one layer up the site —
episode → the season page you came from → `/browse` — rather than returning to
whatever page you happened to look at last. `history.back()` was what made it
feel wrong, and it is gone.

## The options button

It opens the settings, and which settings depends on where you are.

**During playback** it opens the **settings panel** in the player frame (below).
**Everywhere else** it opens Leanback's own settings directly — there is no list
of actions in between any more. The few entries that are not settings sit at the
foot of that list:

| Entry | Does |
| --- | --- |
| Browse | `/browse` |
| Search | `/search` (needs a keyboard from there) |
| Turn Leanback off | the site behaves as stock Firefox |

▲ ▼ move, OK starts changing a setting, ◀ ▶ change it, OK confirms, back undoes.
No wrapping, like the rest of the navigation.

## The transport bar

**Ours, not the player's.** ▼ on a playing video opens it:

```
[ play/pause | ————●———— 12:04 / 24:30 | settings | fullscreen ]
```

- ◀ ▶ walk it, no wrapping. The **position is shown but never selected** —
  seeking is what ◀ ▶ do whenever the bar is not holding a button.
- OK takes the control. Play/pause, seeking and fullscreen drive the `<video>`
  and the frame directly, so none of it depends on the player's markup.
- **▲ or back** closes the bar and ◀ ▶ go back to seeking. ▼ closes it and
  carries on to the page below.
- If there is no video to drive, ▼ does what it used to and moves to the page,
  so it is never a dead key.

There are no seek-preview thumbnails: this player carries no storyboard or frame
index, only a single poster image ([site-notes.md](./site-notes.md)).

## The settings panel

OK on **settings**, or the options button, opens a full-height panel from the
right. It pauses the picture, and starts it again on the way out unless it was
already paused.

| Row | Comes from |
| --- | --- |
| Quality | the player's own menu |
| Seek Step | Leanback |
| Play Next Episode | goes to the next episode — it is a link, not a toggle |
| Button Hints | Leanback |
| Closed Captions | presses the player's captions button |
| Closed Caption Font / Background / Window | the player's own menu — **only while captions are on** |
| Leanback Settings | everything else Leanback has, as a submenu |

- ▲ ▼ move. **▶ opens a submenu, ◀ leaves one** — one rule, whichever kind of
  submenu it is.
- OK toggles a switch, steps a value, or opens a submenu.
- back leaves a submenu, then closes the panel, then closes the bar.

The rows that come from the player are **proxied**: its menu is opened out of
sight, read, and drawn in our own list, and the original is clicked when an
entry is taken. None of its markup is ever on screen.

## Keys the browser or the desktop own

| Key | Who else acts on it | How it is handled |
| --- | --- | --- |
| `BrowserBack` (`KEY_BACK`) | Firefox: history back | Intercepted, and designed around: **one** same-document history entry is kept on top, in the page, for Firefox's own navigation to land on. The page then asks the player frame what Back means before acting on it itself. Whether the interception alone would do is [targets.md](./targets.md) **T2**, still open — see below. |
| `BrowserHome` (`KEY_HOMEPAGE`) | Firefox: home page; Plasma Bigscreen: global "home" | **Reserved.** Never mapped. Point the kiosk profile's home page at `/browse` so a stray press is harmless. |
| `ContextMenu` (`KEY_COMPOSE`, the W1's *menu*) | Firefox: opens the context menu | `menu`; the keyboard-originated `contextmenu` event is cancelled, a real right-click is not. |
| `AudioVolumeUp/Down/Mute` | The desktop's volume control | Never intercepted. |
| `Escape` | Firefox: leaves DOM fullscreen | Theater layout is CSS, not DOM fullscreen, so it stays ours. |

### T2 — the one thing about Back that is still unverified

Which key the W1's back button sends is **known**: `KEY_BACK` (Consumer
Control) → `event.key === "BrowserBack"`. What has never been checked on the
box is whether `preventDefault()` on that key stops Firefox navigating anyway.
Everything in `content/page.js` around `pushGuard` / `onPopState` exists only
for the case where it does not.

[Leanback Dev Probe](../../leanback-dev-probe/) answers it: load it, press back,
read the line. `cancelled=true` with **no** navigation means the interception is
enough and the guard should come out. A `popstate` or `pagehide` after it means
the guard stays.

## Remote example: WeChip W1 air mouse

The bedroom HTPC's only input device ([targets.md](./targets.md#target-2--bedroom-htpc-kde-plasma-bigscreen--wechip-w1)).
Every button, and what it does — the QWERTY pad on the back is needed only to
type a search query or log in:

| Button | Arrives as | Browse / series pages | Video page |
| --- | --- | --- | --- |
| ▲ ▼ ◀ ▶ | `Arrow*` | move the ring | ◀ ▶ seek; ▼ the transport bar, ▼ again the page |
| OK | `Enter` | open / play | play – pause; take the control under the selection |
| back | `BrowserBack` | cancel a dropdown → close a dialog → one layer up → at `/browse` the exit hook | submenu → settings panel → transport bar → playback → the season page |
| menu | `ContextMenu` | Leanback's settings | the settings panel |
| home | `BrowserHome` | nothing (reserved for Bigscreen) | nothing |
| volume ± | `AudioVolume*` | system volume | system volume |
| QWERTY pad | — | `/` opens search; typing in search and login | — |

Five buttons (▲ ▼ ◀ ▶ OK) plus *back* and *menu* do everything. The W1 has no
media keys; the ones the extension maps are there for remotes that do.
