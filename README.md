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

- **Draws Dropout for a TV.** Home, Browse, My List, the lists (Trending, New
  Releases…), search, every show's page and every episode's details page
  are Leanback's own screens, built from what Dropout puts on the page. Dropout's
  own top bar and footer are hidden. Sign-in, account, help and legal pages
  stay Dropout's, driven with the arrows.
- **Continue Watching**, first on Home: what you started here and what you
  started on Dropout's Roku or Android app, in one row.
- **A details page before every video**, as on Dropout's Roku app: the
  episode's title, synopsis and picture, and *Watch* — or *Resume* and
  *Start Over* when you stopped partway — with *Add to My List* and
  *Episodes* beside it. Nothing plays until you press *Watch*.
- **Picks up where you left off**, with *Start Over* to go back to the
  beginning.
- **Opens a show where you are in it**: the newest season, with the selection
  on the episode to watch next, and a button that resumes or plays the next
  one.
- **Plays in the full window**, with Leanback's own control bar, the show
  and episode over the picture, and an *Up next* card that counts down to the
  next episode. Back brings the details page back.
- **A focus ring you can see from the sofa** — 4 px, Dropout yellow,
  configurable.
- **One settings panel**, walked with the arrows: quality, speed, captions
  and their style, and Leanback's own settings.
- **Skips the marketing site**: opening `dropout.tv` lands you on Browse.
- Turns off with one click when you're at a desk.

## Who it's for

Anyone watching Dropout on a PC connected to a TV with a keyboard, an HID
remote or a gamepad mapped to keys. It is built for a TV driven only by a
remote: one Firefox window, kiosk or fullscreen, no pointer in normal use
([docs/targets.md](./docs/targets.md)).

## Installation

There is no build step — clone the repository
(`git clone https://github.com/inklikeurine/firefox-leanback-for-dropout`); its folder loads as-is.

**Temporary install (for trying it out):** open `about:debugging#/runtime/this-firefox`,
click **Load Temporary Add-on…** and select `manifest.json` inside this folder.
The extension is removed when Firefox restarts.

**With `web-ext` (for development):**
`web-ext run --source-dir . --start-url https://watch.dropout.tv/browse`
launches a clean Firefox profile with the extension loaded.

**Permanent install:** Firefox only permanently installs signed extensions.
Every [release](https://github.com/inklikeurine/firefox-leanback-for-dropout/releases)
carries a build signed by Mozilla (unlisted, not on the add-ons site);
the newest is always at
<https://github.com/inklikeurine/firefox-leanback-for-dropout/releases/latest/download/leanback-for-dropout.xpi>.
Open that link in Firefox to install it, or use it as the `install_url` in a
`policies.json`. How releases are signed:
[docs/spec.md](./docs/spec.md#release-checklist).

Source: https://github.com/inklikeurine/firefox-leanback-for-dropout

## Sound on autoplay

Firefox blocks autoplay with sound by default, which is why Dropout starts its
videos muted. **No extension can lift that**: unmuting before you have
pressed anything makes Firefox stop the video. So Leanback turns the sound on
at your first button press — or straight away, if the profile allows
autoplay with sound for Dropout. Pressing *Watch* on a details page counts:
Leanback tries the sound as the video starts, and if Firefox still refuses
it, the sound comes on at your next press. Three ways to allow it:

**By hand, once, on a normal install.** Settings → Privacy & Security →
Autoplay → Settings… → add `https://watch.dropout.tv` → **Allow Audio and
Video**.

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

`Default` takes `allow-audio-video`, `block-audio` or `block-audio-video`; the
example allows only Dropout.

There is no command-line switch for this: release Firefox accepts no
`--pref`, so a kiosk launcher grants it through the profile `--profile`
points at. To check it took, open an episode and run
`navigator.getAutoplayPolicy("mediaelement")` in the console on the player
frame: `"allowed"` means the sound is on from the first frame.

## Usage

Open `watch.dropout.tv`. You land on Home, with the ring on the featured
banner's first button.

**It is driven by a remote, not a keyboard.** Only the buttons a TV remote
has are mapped, so nothing is hidden behind a letter key:

| Button | Arrives as | Does |
| --- | --- | --- |
| ▲ ▼ ◀ ▶ | `Arrow*` | Move the ring. In the player, ◀ ▶ skip and ▼ opens the control bar |
| OK | `Enter` | Open, play, pause, flip a setting |
| back | `BrowserBack` (also `Escape`) | Back one page — Firefox's own Back. `Escape` first closes whatever is open |
| menu | `ContextMenu` | The settings: the player's during playback, Leanback's anywhere else |
| home | `BrowserHome` | **Reserved for your TV shell — never intercepted** |
| volume | `AudioVolume*` | Your desktop's, never intercepted |
| media keys | `Media*` | Play/pause, stop, skip, next/previous episode, for remotes that have them |

The one keyboard exception is `/`, which opens search — searching needs
typing anyway. Every key, everywhere: [docs/keymap.md](./docs/keymap.md).

**Home** is the featured banner and one row per shelf. ▲ ▼ go from row to
row, and each row remembers where you were in it; ◀ ▶ move along a row.
The **›** beside *Watch now* shows the next featured show. More rows arrive
as you near the bottom, and a full row ends with *View all*. Each card shows
its running time, Dropout's badges and how far you got.

**Continue Watching** is Home's first row: what you are partway through here
in Firefox and on Dropout's Roku or Android app, most recent first, each with
the time left.

**The rail** runs down the left of every page that plays no video, an
episode's details page too: ◀ from the left edge goes onto it, ▶ comes back
to exactly where you were. It holds
*Search*, *Home*, *Browse*, *My List* (the bookmark), *Dropout 24/7* and the
gear for Leanback's settings. The page you are on has its icon in yellow.

**Browse, My List and the lists** show their shows or episodes five across,
the same cards as on Home; more arrive as you near the end.

**A show's page** has the show's picture and name, a yellow button that picks
the show up where you left it (**Resume S9 E3**, or **Play S9 E4** for the
next one) on that episode's details page, *Trailer* and *My List*. Under them, the seasons, newest first —
OK opens one — and that season's episodes, five across: watched ones dimmed
with a tick, one in progress with a bar. A show opens on its newest season
(*Shows Open On* in the settings changes that), with the selection on the
episode to watch next. A special (a stand-up set, a film) has *Watch Movie*
and its extras.

**Search**: type into the large box at the top; Dropout's results appear
below as cards as you type. ▼ goes to the filters (*All*, *Videos*,
*Collections*), then the results.

**An episode's details page** opens when you choose an episode — any card,
Continue Watching included, a show's yellow button, *Watch Movie* or an
extra. On the left: the show's name, the episode's title, "Season 2,
Episode 1 · 28-Feb-2020", the synopsis, and the buttons — *Watch* (yellow),
or *Resume* with *Start Over* beside it when you stopped partway; *Add to My
List* (*Remove from My List* once it is there); *Episodes*, the episode's
season on its show's page. On the right, the episode's picture, with how
far you got and the time left. The selection starts on *Watch* or *Resume*;
play/pause on the remote does the same.

**Watching**: the episode fills the window. *Resume* starts where you
stopped ("Resumed at 12:04"). The show and episode show over the picture as
it starts and when you pause; ◀ ▶ skip, showing the time you land on. ▼
opens Leanback's control bar (play/pause, position, settings, fullscreen).
**Back** stops the video and brings its details page back, now saying
*Resume*. The next episode — from the *Up next* card, the next-episode key
or Dropout's own countdown — plays straight away, and Back from it is its
own details page.

**Dropout 24/7** (the rail) is Dropout's 24/7 page: its *Live now* banner
and *Watch*. *Watch* plays the stream right there, in the full window with
the same controls, and the sound comes on with that press. Back closes it
and leaves you on the 24/7 page.

**Up next**: eight seconds before an episode ends, a card counts down to the
next one. OK plays it now; ◀ hides it, and then nothing plays by itself.

**Settings** opens from the right. During playback it holds *Start Over*
(after a resume), Quality, Speed, Play Next Episode, Closed Captions (a
switch; ▶ on it picks a track), Caption Style (font, background, window) and
Leanback's settings. Anywhere else it holds Leanback's settings, the same
list in the same words, with *Clear Continue Watching* and *Turn Leanback
Off* at the foot. ▲ ▼ move, OK or ▶ takes an entry, ◀ or Back goes up a
level and closes the panel from the top.

**Leanback's settings**: Autoplay Next Episode · Shows Open On · Seek Step ·
Start Videos Muted · Button Hints (a bar showing the keys that matter now; off unless turned on) ·
Enlarge Selection · Ring Width · Ring Colour · Skip dropout.tv Home · Back On
Home (does nothing / closes the tab — for kiosk setups). The options page
(`about:addons` → Leanback for Dropout → Preferences) has the same, plus a
ring colour of your own and *Player controls*: *The site's own player
controls* hands the player back to Dropout, for troubleshooting.

*Clear Continue Watching* asks for OK twice. It forgets every video you have
not finished, Roku progress included, until something is watched again;
what you finished stays watched.

**Back** is Firefox's own Back, so Leanback keeps the history in the shape
Back should follow: switching episode, season or rail section replaces the
page instead of adding one, and a video playing is a step of its own above
its details page. Back from a video is its details page; from there, the
season you were watching; from a show, Home — even after Dropout went on to
the next episode by itself. In a tab opened straight on a page, Leanback
walks up the site itself: episode → season → Home. Because the remote's Back always leaves
the page, ◀ is how you close what is open on it (the settings panel, the
rail with ▶, the control bar with ▲).

The toolbar button turns the extension on and off; a keyboard shortcut for
that can be set under *Manage Extension Shortcuts*.

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
this Firefox's extension storage and never sent anywhere. The only requests
the extension causes are for Dropout's own pictures from Dropout's image
server, including a show's wide picture, which Dropout's own Home does not
show; on Home it presses Dropout's own *Show more*, which loads more rows
exactly as scrolling would; and *Watch* on Dropout 24/7's page reads the
stream's page from Dropout (with the page's own sign-in, as opening it would)
to play its player there. The manifest declares
`data_collection_permissions: { required: ["none"] }`. No `tabs`,
`webRequest` or `<all_urls>`.

## Known limitations

- Relies on Dropout's page structure (it's a Vimeo OTT site). If Vimeo changes
  the markup, navigation can break until the site rules
  (`sites/dropout.json`) are updated —
  [docs/site-notes.md](./docs/site-notes.md) records what the extension
  depends on and how to re-check it. When Leanback cannot read a page, it
  shows Dropout's own page and the arrows drive that instead.
- A show's wide picture comes from the data Dropout's page was built from. If
  Dropout changes that, show cards fall back to the tall poster, cropped.
- Continue Watching knows what you watched in this Firefox, and what Dropout's
  Roku and Android apps recorded for the rows Home has loaded. Watching in
  Firefox does not reach Dropout's own history, so the Roku will not show it;
  syncing between devices that have Leanback is planned for 1.0.
- Opening a show on its newest season loads that season's page after
  Dropout's, so the screen stays blank for a moment.
- The show's yellow button and the episode the selection starts on are worked
  out from the episodes Dropout has put on the page and from what was played
  in this Firefox. Without the numbers it says just *Resume* or *Play*.
- *Watch* or *Resume* on a details page comes from what Leanback has seen: an
  episode started on the Roku whose card Leanback has not shown yet says
  *Watch*, though Dropout's player may still pick up where the Roku left it.
- Dropout 24/7 plays on its page only while the stream's page carries its
  player's address; otherwise *Watch* opens the stream's page, where the
  sound waits for *Watch* there.
- Signing in and searching need a keyboard. Signing in also loads reCAPTCHA,
  which may get in the way in a kiosk.
- Sound on the first frame needs a profile setting Firefox will not let an
  extension make — see [Sound on autoplay](#sound-on-autoplay). Without it the
  sound comes on with *Watch* where Firefox allows that, else at your next
  button press.
- Firefox only. Permanent installs need the AMO-signed build.

More detail for developers: [docs/](./docs/README.md).

## AI-generated

This extension was generated by an AI agent under human direction. It is
provided as-is and used at your own risk; read the source before installing.

## License

AI code generators are trained on enormous pools of public code, released under
every license imaginable — permissive, copyleft, and non-commercial alike. The
origin of any individual generated line is untraceable. Output built from that
pool cannot honestly be owned by anyone.

My position: code built from the commons belongs to the commons. Since no one
can know which licenses any given line was originally released under,
AI-generated code should be treated as unlicensable — public domain by default.

Accordingly, all code in this repository is released into the public domain
under the [Unlicense](UNLICENSE).
