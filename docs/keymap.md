# Key map

Keys map to **actions** first (the vocabulary is the HTPC shell's Appendix A, so a
remote, a gamepad-to-key mapper and a keyboard all look the same), then each
context decides what an action does. Keys not listed are never intercepted.

## Keys → actions

| Action | Keys (`event.key`) | Also | Notes |
| --- | --- | --- | --- |
| `up` `down` `left` `right` | `ArrowUp` `ArrowDown` `ArrowLeft` `ArrowRight` | gamepad D-pad via an external mapper | OS auto-repeat accepted, throttled to 80 ms |
| `select` | `Enter` | `Space` outside the player and outside editable fields | Space in the player is `play_pause` |
| `back` | `Escape` | `Backspace` outside editable fields, `BrowserBack` | the only action handled while typing (Escape only) |
| `menu` | `Tab` when Shift is not held, `F2` | `ContextMenu` | Tab keeps its native meaning inside dialogs and forms |
| `info` | `i`, `I` | | toggles the hint bar |
| `search` | `/` | `BrowserSearch` | goes to `/search` (needs a keyboard from there on) |
| `play_pause` | `MediaPlayPause`, `MediaPlay`, `MediaPause` | `Space`, `k` in the player | |
| `stop` | `MediaStop` | | |
| `next` / `previous` | `MediaTrackNext` / `MediaTrackPrevious` | `n` / `p` in the player, `PageDown` / `PageUp` in the player | next/previous episode |
| `fast_forward` / `rewind` | `MediaFastForward` / `MediaRewind` | `Right` / `Left` in the player, `l` / `j` | seek ± `seekStep` (default 10 s); FF/RW keys use 3 × step |
| `subtitle` | `c`, `s` in the player | | captions toggle |
| `mute` | `m` in the player | | |
| `home` | `Home` outside editable fields | `BrowserHome` | go to `/browse` |
| `channel_up` / `channel_down` | `PageUp` / `PageDown` outside the player | | previous / next row (browse) or one screen (grids) |

## Actions → behaviour by context

| Action | `browse` / `grid` / `series` / `search` (page) | `video` page, focus **on the page** | `video` page, focus **in the player** |
| --- | --- | --- | --- |
| `up` | spatial / row move | spatial; from the topmost element → player | nothing (reserved) |
| `down` | spatial / row move; past the last row → Load More | spatial | leave the player → first focusable below (`page:focus below`) |
| `left` / `right` | spatial / row move; on a focused `<select>` → previous/next option + `change` | spatial | seek ∓/± step |
| `select` | activate focused element; on the player mount → enter player | activate; on the player → enter player (+ theater if `manual`) | play / pause |
| `back` | close open modal → else `history.back()` → else structural parent → at `/browse` exit hook | theater on → leave theater (focus player mount); else history / series page | leave theater (if on) and focus the page; else `page:focus back` |
| `menu` | focus the site header (Browse / Search / account); again → return | same | nothing |
| `info` | toggle hint bar | toggle hint bar | toggle hint bar + OSD (title, time) |
| `search` | go to `/search` | same | same |
| `play_pause` `stop` `next` `previous` `fast_forward` `rewind` `subtitle` `mute` | ignored (no player) | forwarded to the player | handled in the player |
| `home` | go to `/browse` | same | same |
| `channel_up` / `channel_down` | previous / next row (browse) or page scroll | page scroll | previous / next episode |

"Structural parent": `video` → its series page (`.series-title a`) or
`/browse`; `series` and `grid` → `/browse`. Used only when `history.length`
gives nothing to go back to — the kiosk-opens-a-deep-link case.

## Keys the browser or the desktop own

Some remote buttons arrive as keys that Firefox or the desktop shell act on
before, or instead of, the page. The extension intercepts what it can and
designs around the rest:

| Key | Who else acts on it | Extension's handling |
| --- | --- | --- |
| `BrowserBack` (`KEY_BACK`) | Firefox: history back | Capture-phase `preventDefault()` and run the layered `back`. If Firefox navigates regardless (targets.md T2), plan B in [architecture.md](./architecture.md#key-handling): theater and open dialogs become history entries so the browser's own back pops them first. |
| `BrowserHome` (`KEY_HOMEPAGE`) | Firefox: go to home page; Plasma Bigscreen: global "home" | Set the kiosk profile's home page to `/browse`, so either outcome lands on Browse or in the shell. Handled as `home` when it does reach the page. |
| `ContextMenu` (`KEY_COMPOSE`, the W1's *menu*) | Firefox: opens the context menu (kiosk mode is expected to suppress it — T3) | `menu`; the keyboard-originated `contextmenu` event is cancelled. |
| `AudioVolumeUp/Down/Mute` | The desktop's volume control | Never intercepted. |
| `Escape` | Firefox: leaves DOM fullscreen | Theater layout is CSS, not DOM fullscreen, so Escape stays ours. |

## Remote example: WeChip W1 air mouse

The bedroom HTPC's only input device ([targets.md](./targets.md#target-2--bedroom-htpc-kde-plasma-bigscreen--wechip-w1)).
Every button it has, and what TV Mode does with it:

| Button | Arrives as | Browse / series pages | Video page, in the player |
| --- | --- | --- | --- |
| ▲ ▼ ◀ ▶ | `Arrow*` | move the ring; ◀ ▶ on the season control switch season | ◀ ▶ seek; ▼ leave the player |
| OK | `Enter` | open / play | play – pause |
| back | `BrowserBack` | close dialog → history back → `/browse` → exit hook | leave theater → back |
| home | `BrowserHome` (if not taken by Bigscreen) | `/browse` | `/browse` |
| menu | `ContextMenu` | focus the site header | — |
| volume ± | `AudioVolume*` | system volume (not ours) | system volume (not ours) |
| power, mouse toggle | nothing reaches the OS | — | — |
| QWERTY pad | letters etc. | typing in search/login; `i` hint bar, `/` search | `c` captions, `m` mute, `k` play–pause |

Five buttons (▲ ▼ ◀ ▶ OK) plus *back* do everything; the pad and *menu*
are conveniences.

## What a 5-key remote gets

Up/Down/Left/Right + Enter + Escape cover: every navigation move, opening
anything, switching season, playing, pausing (Enter in the player), seeking
(Left/Right in the player), leaving the player (Down or Escape), going back,
closing dialogs, and — with the exit hook — leaving to the HTPC shell. Everything else
is a shortcut.
