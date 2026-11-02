# Leanback for Dropout — product spec

The product spec: what Leanback does, exactly. What each key does is in
[keymap.md](./keymap.md); how the code realises it, in
[architecture.md](./architecture.md); the site knowledge it rests on, in
[site-notes.md](./site-notes.md). The user-facing description is the
[README](../README.md).

## About

- A Firefox extension that makes **watch.dropout.tv** usable from the couch
  with the buttons a TV remote has. Leanback is a TV shell: Home, Browse, My
  List, the lists, a show's page, a special, search, an episode's details
  page, the profile picker with Manage profiles, Add Profile, Edit Profile,
  and the welcome a signed-out TV opens on are Leanback's own screens;
  the sign-in and password reset screens are Leanback's own too; a
  profile's PIN screen is Dropout's own, laid out for the TV with Leanback's
  number pad; the privacy policy, terms and cookies policy are
  Dropout's words in Leanback's type; only account and help pages are
  Dropout's as they are (with the rail beside them).
- Dropout runs on **Vimeo OTT**. The player is a **cross-origin iframe from
  `embed.vhx.tv`**, so there are two content scripts — one for the page, one
  for the player frame — talking through the background script.
- Everything site-specific lives in `sites/dropout.json`, so a site change is
  a data fix. The navigation engine (`nav/*`) knows nothing about Dropout.

## Goals

- A **Home screen that works like a TV app's**: a featured banner, rows that
  slide into place, Continue Watching first.
- Browse → show → season → episode → playback with **▲ ▼ ◀ ▶, OK, back and
  menu** only. No keyboard shortcut is ever required, and **arrow keys never
  mean anything but navigation**.
- A focus ring readable from 3 m.
- Player control from the remote: play/pause, seek, next/previous episode,
  captions.
- Site knowledge kept as data and checkable, so following site changes is
  cheap.

## Non-goals

- Not an ad blocker, not a downloader, not a paywall or DRM workaround. It
  needs a paid Dropout login exactly as the site does.
- A real keyboard maps to nothing but `/`, which opens search; typing with
  one (or a phone's keyboard app) goes straight into a box without the
  on-screen keyboard, and is never needed.
- Not a general spatial-navigation extension — it runs only on Dropout hosts.
- Not the store: Dropout's subscription store (`/products`) is deliberately
  not drawn or linked — a poor fit for a TV UI.

## Who it's for

Anyone watching Dropout on a PC connected to a TV, driving it with a
keyboard, an HID remote or a gamepad mapped to keys. The design target is one
tab opened straight on `/browse`, fullscreen or kiosk, no pointer in normal
use ([targets.md](./targets.md)).

## Core functionality

- **Scope.** Runs on `watch.dropout.tv` (page script) and `embed.vhx.tv`
  (player-frame script). On `https://www.dropout.tv/` (marketing site, root
  only) it forwards to `https://watch.dropout.tv/browse` when *Skip
  dropout.tv Home* is on (default on).
- **Leanback's screens.** Each is a layer over Dropout's page, drawn from what
  Dropout renders there — same links, pictures and titles — with Dropout's
  page left underneath, untouched; Leanback's buttons press Dropout's own.
  Dropout's top bar and footer are hidden on every page but account, help
  and legal. A page Leanback cannot read is Dropout's own, driven with
  the arrows and the ring.
- **Home (`/browse`).** The banner's buttons, then one row per shelf.
  Hubs such as `/dimension-20` get the same screen without Continue Watching.
  - **TV-style scrolling.** The selected row always sits at the same height
    near the top; the rows move under it, and what is above it fades out.
    Along a row, the selected card keeps its place and the row slides, until
    the row's end comes into view. Each row remembers its last card.
  - **Cards** show the picture (for a show, its wide picture, the one its own
    page uses, rather than Dropout's tall poster), the title, the running
    time (`6:03`, without Dropout's leading zero), Dropout's badge ("New",
    "New Episode") and progress. The New Releases row shows no "New" badge.
    Dropout's "My list" row is not drawn (My List is on the rail), nor its
    own "Continue Watching" row (its videos are in Leanback's). The selected
    card grows by the selection zoom and its title steps down, so neither the
    card nor the ring touches any text.
  - **More rows.** Two rows from the end, Leanback presses Dropout's own
    *Show more* (and scrolls the page underneath if that does nothing). A row
    of 12 — the most Dropout draws — ends with a **View all** card.
  - **The banner** shows one slide at a time with Dropout's buttons (*Watch
    now*, *Trailer*, *+ My List* / *✓ My List*); a **›** after *Watch now* steps to the next
    slide, round the end. The selection starts on its first button. If
    nothing can be read within 10 s, Dropout's page is driven instead.
- **Continue Watching** is Home's first row: the videos in progress, from
  Leanback's watch history and from Dropout's progress bars (which come from
  its Roku and Android apps), merged, most recent first. Each card shows the
  time left, to the second (`2:48 left`). Every card on every screen draws
  the same merged progress.
- **Watch history.** Leanback records how far each video has got while it
  plays here — on pause, seek, the end, the player losing focus, and every
  15 s — in `storage.local`, **one history per Dropout profile** (the page's
  `profile_index`; see *Profiles*). A video counts as **watched** at 95 % or with
  less than 90 s left, and **in progress** once more than a minute has
  played. Trailers and live streams are not recorded. Dropout's bars carry
  no date, so a bar is dated when Leanback first sees its value; a first
  sighting never outranks Leanback's own reading.
- **Clear Continue Watching** (OK twice) forgets every video not finished, for
  the profile watching (from the options page: for every profile): it
  deletes Leanback's readings of them and empties Continue Watching —
  Dropout's bars included — until something is watched again, here or
  elsewhere. Watched videos stay watched; Dropout's bars still show on cards.
- **Clear Progress** (an episode's details page, OK once) makes that one
  video unstarted for the profile watching: Leanback's reading goes, and no
  reading from before that moment counts — Dropout's bar included — so it
  leaves Continue Watching, loses its bar and tick on cards, and is not
  where a show picks up. The selection goes to *Watch*, and "Progress
  cleared" shows. Playing it again, here or elsewhere (Dropout's bar
  moving), brings it back.
- **The look** (`lib/themes.js`, Leanback's settings under *Look*): a
  *Theme* (Dropout Dark, Midnight Blue, OLED Black, Warm Dark) sets the
  colours of the screens, the rail and the panels; *Theme Color* takes the
  place of Dropout yellow everywhere — the ring, the main buttons, the lit
  rail icon, progress bars, badges, the panels' selection, the player's
  bar. *Holidays*: Off, Automatic (each holiday look in its days), or one
  picked to stay; a holiday look sets the accent and a glow of its colours
  along the top of the screens. Moving through the values of any look
  setting shows each at once; OK keeps it, Back (or closing the panel)
  puts the saved one back.
- **Theme This Page** (first under *Look*, on a page with choices of its
  own): Home — *Banner* (Large, Small without its synopsis, Off: no banner,
  the selection starts on the first row) and *Card Size*; lists, search and
  a list-like show page — *Card Size* (Medium: five across, Small: six,
  Large: four); a show's page — *Card Size*; an episode's details page —
  *Picture* (on the right, on the left, off). Kept per kind of page
  (`pageLooks`). Changing one draws the screen again, and the cards, the
  banner and the picture slide (and grow or shrink) from where they were
  to where they are now, in 0.32 s (not under Reduce Motion).
- **Accessibility** (a menu of its own in Leanback's settings): *Interface
  Size* (100, 115, 130 %: everything Leanback draws), *High Contrast*
  (black and white, white edges on buttons, a ring of at least 6 px),
  *Reduce Motion* (as the system says, on, off: nothing of Leanback's
  slides or fades), *Caption Size*, *Caption Color* and *Caption
  Background* (in the player frame, over the player's own captions; *Player's
  own* leaves them alone), and *Color Filter (Experimental)*: an SVG colour
  matrix on the video that moves what red-, green- or blue-weak colour
  vision loses into colours it keeps (daltonisation).
- **Cookie Preferences** (Leanback's settings, at the foot, on a page that
  has them): the cookie box comes up only until it is answered, and
  Dropout's own way back to it is in the footer Leanback hides. The entry
  closes the panel and asks the page's Ketch for its consent window
  (`ketch("showConsent", {displayHint: "experiences.consent.modal"})`, as
  Dropout's "Data Preferences" link does), else presses Dropout's "Manage
  Cookie Preferences"; the selection starts on the first purpose.
- **An empty list** (My List with nothing in it) keeps Leanback's screen:
  its title and "Nothing in My List yet. Add a show or a video to it with
  Add to My List on its page.", with the selection on the rail.
- **Resume.** A video in progress starts where it was left, with "Resumed at
  12:04" for a moment: *Resume* on its details page, or straight away when
  it plays without one (the next episode, a reload). *Start Over* is beside
  *Resume* on the details page. Resuming never changes whether the video is
  playing or muted.
- **The rail.** On every page but signing in (the welcome, sign-in, the
  password reset) and a video playing — Home, hubs, Browse (`/series`), My
  List (`/my-list`), Search, the lists, every show and special, an
  episode's details page, the profile picker and the profile pages, the
  policies, Dropout's account and help pages — an icon rail down the left: signed
  in, the profile watching at the top (its picture, as in Dropout's header,
  set apart by a gap), then Search, Home, Browse, My List (a
  bookmark), Dropout 24/7 (`/dropout-24-7`), and a gear for Leanback's
  settings in place. The current page's icon is yellow; the ring is the only
  mark of the selection. Entered on the current page's entry, or the one last
  used; leaving returns to exactly where the selection came from.
- **Profiles.** The rail's profile entry opens Dropout's profile picker
  (`/profile/pick`, a page added on top, so Back comes back), drawn by
  Leanback: "Who is watching?" over the account's profiles in one row,
  centred, each its picture (or its first letter) and its name, square with
  round corners; the one watching says *Watching now* and the selection
  starts on it. The rail is beside it. OK presses Dropout's own button for
  the profile, which saves the choice and goes on to Browse (a PIN-locked
  profile: Dropout's own PIN screen). After the profiles, *Manage Profiles*
  presses Dropout's own button, and **Sign Out** asks "Sign out of
  Dropout?" in Leanback's box (*Cancel* selected; Back is *Cancel*), then
  sends Dropout's own sign-out (a form to `/logout` with the page's
  `csrf-token`, as its *Log out* button does). ▶ at the end of the row goes
  round to its start; ◀ at its start is the rail. *Manage Profiles* turns
  the picker into **Manage profiles** in place (as `?edit=1` opens it, an
  address Dropout's script then takes the `?edit=1` off): the same row,
  each profile with a pencil over its picture and an **Edit** button under
  its name, in a row of their own under the profiles: the selection starts
  on the profile watching, ◀ ▶ go along the profiles, *Add Profile* and
  *Done* (back to the picker); ▼ from a profile goes to its *Edit*, ▲ back
  to it, and ▼ from *Add Profile* or *Done* goes nowhere. OK on *Edit*
  presses Dropout's button for the profile (Edit Profile). OK on the
  profile's picture opens **a box of pictures** over Manage profiles
  ("Picture for Sam"): Dropout's profile pictures from its API, under "The
  classics" and the site's own, the profile's own outlined and selected;
  ◀ ▶ ▲ ▼ move, OK on another saves it through the same API Dropout's
  pages use (a `PATCH` of the profile's picture, with the page's sign-in)
  and opens Manage profiles again with it; Back changes nothing; a
  failure says "The picture could not be saved". *Remember my profile* is not drawn.
  - *Edit* on a profile: Dropout switches to that profile and opens **Edit
    Profile** (`/settings/manage/profile`), drawn by Leanback
    (`screen.profileForm.edit`): the title and Dropout's line under it, the
    picture (OK: Dropout's picture chooser), a large name box typed into
    Dropout's own, *Kid Profile* where Dropout offers it, then *Save*,
    *Cancel* and, but for the main profile, **Delete Profile**. Delete asks
    in Leanback's box ("Delete Sam?", *Cancel* selected), then presses
    Dropout's own *Delete Profile* and the *Delete Profile* in the box
    Dropout opens to ask again (or answers its `window.confirm` yes, once).
    A button Dropout greys out (*Save* before a change) shows as a grey
    outline; *Save* turns yellow once a change has been made. OK on *Save*
    presses Dropout's own; the moment Dropout has saved (its toast says so, or
    *Save* goes grey and stays grey), the screen closes as *Cancel* does with
    nothing left to save (Dropout's own *Cancel*, so it goes where Dropout
    sends you), with no delay; the button reads "Saved!" for as long as the
    screen stays. A good save shows no other message;
    an error of Dropout's is shown under the title.
    *Cancel* with a change not saved (*Save* lit) asks "Leave without
    saving?" in Leanback's box, *Keep Editing* selected; and Dropout's
    `beforeunload` warning is kept from Firefox on this page, so Firefox's
    own "confirm that you want to leave" never shows.
  - *Add Profile* is the picker app's own form (at `#/add`), drawn by
    Leanback the same way (`screen.profileForm.add`): the title and line,
    the picture, the name box, then *Cancel* and *Continue* (*Continue*
    dimmed until there is a name). A PIN-locked profile's PIN is Dropout's
    own: while the app shows one, Leanback draws no screen and the ring
    moves over Dropout's buttons and boxes (`pages.profiles`), with the
    on-screen keyboard's number pad on its digit boxes.
  - Dropout's picture chooser (both forms) is Dropout's own dialog, drawn
    in Leanback's look over Leanback's screen — a dark card, large type,
    large pictures — with the ring moving in it from the picture chosen now
    (else the first); Back closes it. Its focus trap keeps the focus in it,
    so Leanback does not draw a chooser of its own. Whichever address the
    picker app shows, the page is the picker's by what it holds
    (`screen.profiles.root`).
  - **Each profile has its own watch history**: Continue Watching, resume
    points and watched ticks. The page tells the background which profile
    is watching (`profile:current`), so the writes from that tab, the player
    frame's too, go to it. The history from before profiles goes to the
    first profile that says so.
  - The page knows a profile only by its place in the list (`profile_index`):
    deleting a profile on Dropout's site moves the ones after it up, and
    their histories with the place, not the person.
- **The welcome (`/`, signed out).** Dropout's front page is drawn as
  Leanback's welcome (`screen.welcome`): Dropout's logo, its line
  ("Independent. Funny. Ad Free."), its words about the service and "To
  start a subscription, go to dropout.tv on a phone or a computer.", then
  *Sign In* (yellow, selected), *Browse* (Home, signed out), *Privacy
  Policy* and *Terms of Use* (`legal`), in the middle of the screen; no
  rail. Starting a subscription is not offered on the TV. Signed in, `/`
  goes on to Home.
- **Sign-in (`/login`).** Leanback's own screen, one screen for both
  boxes, over Dropout's form, which stays underneath unseen (`pages.signin`):
  "DROPOUT" in yellow over "Sign in", an **Email** box and a **Password**
  box, *Sign in* (yellow), *Forgot password?*, the line "Press OK on a box
  to type with the remote, or use a keyboard.", then *Privacy Policy* and
  *Terms of Use* (`legal`). No top bar, no rail. The boxes are real form
  boxes (a `<form>`; `type=email name=email autocomplete=username` and
  `type=password name=password autocomplete=current-password`, each with its
  label), so Firefox's saved passwords and any password app's add-on
  recognise them; the form is never submitted by the browser. The selection
  starts in *Email*, or in *Password* when the email is already there (typed
  into Dropout's own box, say by a password app). ▲ ▼ go from box to box to
  *Sign in*, *Forgot password?* and the policies and stop at the ends (▲ ▼
  leave a one-line box, letters type); ◀ ▶ go between the two policies;
  Back from a box goes to *Sign in*. **OK on a box opens the on-screen
  keyboard** (see below) with the email layout on *Email* and the password
  layout on *Password*; typing in the box with a real keyboard needs none,
  and then Enter in *Email* goes to *Password* and in *Password* presses
  *Sign in*; the keyboard's *Done* does the same.
  **Sign in** goes through Dropout's own form on the same page, so its
  checks and its reCAPTCHA work unchanged: the email goes into Dropout's
  email box and its *Next* is pressed; when Dropout shows its password step,
  the password goes into Dropout's box and its *Sign in* is pressed. While
  it waits, the button reads "Signing in…" and cannot be pressed twice.
  Leanback never keeps, logs or sends the password anywhere but into
  Dropout's own box. An email that is not an email is refused on the screen
  ("Please enter a valid email."), an empty box asks for both ("Enter your
  email and your password."). Dropout's own error (wrong password, unknown
  email) is shown under the title in its words, the email kept, the password
  box emptied and selected. **After signing in from this screen the TV
  goes to "Who is watching?"**, whatever Dropout does next (it may go back to
  the page that asked for the sign-in, or straight to Browse), and **choosing a
  profile there always ends on Home** (also from the rail's *Switch profile*).
  Pressing Dropout's *Sign in* notes it in the tab's session storage; the
  first page after the sign-in flow that is not the picker goes to the picker,
  once (if Dropout takes the viewer away from it again, as it does with one
  profile or "Remember my profile", Home instead); choosing a profile notes
  Home, and the first page after that goes to Home (`/browse`) if it is not
  Home. Still signed out, the sign-in did not work and nothing moves; the
  note lapses after two minutes. If Dropout gives no answer within 15 s (its
  *Next*) or 20 s (its *Sign in*: the page moving on counts), the screen
  says "Dropout isn't answering. Check the TV's internet connection, then
  try again." and *Sign in* works again.
- **Password reset (`/forgot_password`).** Leanback's own screen, over
  Dropout's form (`pages.reset`), in the sign-in screen's look: "DROPOUT"
  over "Reset password", one **Email** box (holding the email typed on the
  sign-in screen in this tab, if any), *Send reset email* (yellow), *Back to
  sign in*, the typing line and the policies; no rail. The email goes with
  the viewer between the two screens, and back, in the tab's session
  storage, and is forgotten once the tab is on any other page. *Send reset
  email* goes through Dropout's own form as *Sign in* does: the email into
  Dropout's box and its button pressed, "Sending…" meanwhile. Dropout
  answers with a page of its own, so the ask is noted first; the sign-in or
  reset screen that page turns out to be then says, in Leanback's words,
  "Check your email on your phone or computer. Set the new password there,
  then sign in here.", leaves the box and the button out and selects *Back
  to sign in*. An error Dropout shows instead is shown in its words, the
  email kept. An empty box ("Enter your email."), a bad email ("Please enter
  a valid email.") and no answer ("Dropout isn't answering…", after 15 s on
  the same page) are said on the screen.
  **"Dropout signed you out."** Leanback remembers that this TV was signed
  in: a flag in `storage.local` (nothing else of the account), set whenever a
  page loads signed in (`common.signedIn`) and cleared by every sign-out —
  Leanback's own *Sign Out* on the picker, Dropout's own *Log out* form, and
  the `/logout` address. A page that loads signed out while the flag is set
  (the sign-in expired, or the password was changed elsewhere) opens Leanback's
  question box: "Dropout signed you out.", "Sign in again to carry on.", *Sign
  in* (selected) and *Not now*. *Sign in* goes to the sign-in screen (and from
  there, the picker, then Home); *Not now* **closes the tab** (with it the
  window, when it is the last tab), whatever *Back On Home* says, because
  Dropout does not work signed out; the flag stays for another tab. Asked once per tab, never on the sign-in and reset screens or the
  policies, and not while a sign-in is in progress.
  **Signed out** (`common.signedOut`): the rail's top entry is *Sign in*,
  and the first Home of a tab goes on to the welcome by itself — once per
  tab, so Back from it, or its *Browse*, comes back to Home and stays.
- **The on-screen keyboard** (`nav/keyboard.js`). OK on one of Leanback's
  own text boxes — sign-in's *Email* and *Password*, the reset's *Email*, the
  search box, the name box of Add Profile and Edit Profile, and the digit boxes
  of a PIN-locked profile's PIN screen (Dropout's own) — opens a panel along the bottom of the screen with the box
  still in view above it (the sign-in screen, and a profile's form, move up). A pointer click on
  one of those boxes opens it too, since the air mouse has no keyboard.
  Letters in QWERTY rows with *Shift*, a page of digits and symbols (*123* /
  *abc*), *Space*, *Backspace*, ◀ ▶ to move in the text, and *Done*; the
  text so far is shown on the panel's top line with its cursor. A text box
  starts with a capital and takes one after a space; an email box has `@`,
  `.` and `.com` and no *Space*; a password box has *Show* / *Hide*, which
  turns it readable and back; a PIN gets a number pad whose digits go into
  the PIN screen's boxes in turn (shown as dots on the panel's top line), and
  *Done* presses Dropout's button. ◀ ▶ go along a row and round its ends, ▲ ▼ go
  to the key nearest the same place in the next row and stop at the top and
  bottom; OK types, *Done* closes it and does what Enter in the box does
  (*Email* → *Password*, *Password* → *Sign in*, reset → *Send reset email*,
  search → the results), Escape closes it and the selection is back on the
  box. Typing in a box with a real keyboard marks it as typed in, and Enter
  in it is its own again until the selection moves on. Nothing else gets
  past an open keyboard; the remote's Back is Firefox's, so nothing depends
  on it. Letters go into the box at the cursor with `beforeinput` and
  `input` events, so a box that mirrors into Dropout's (search) keeps
  working.
- **The policies (`/privacy`, `/tos`, `/cookies`).** Dropout's words
  (`pages.legal.content`, stamped `data-tenfoot-reading`) in a column of
  Leanback's type on its dark ground, the headings white and the links
  yellow; no top bar, footer or promotion. ▲ ▼ scroll by most of a screen;
  nothing on the page is a stop; Back leaves.
- **Addresses seen as others** (`redirects`): Dropout 24/7's stream at
  `/events/dropout-24-7` (where a My List card for it leads, an address no
  hub is in) goes on to Dropout 24/7's page, in place of it in the
  history.
- **Browse, My List, collections and lists** (Trending, New Releases, a
  show's new episodes, all movies, Continue Watching in full): the page's name (My List named as on the rail), then
  Home's cards five across, the selected row sliding to the same place, more
  loaded through Dropout's *Load More* near the end. My List's selection
  starts on the first show. New Releases shows no "New" badges.
- **A show's page, one for every show.** Pages at a one-word address are told
  apart by what the page holds, never by address or name, so a show Dropout
  adds later works the same (`pages.series.show.layouts`): a **show**, a
  **special** or a **list** (drawn as above). A hub is Home's screen.
  - **The banner**: the show's wide picture, its name, the number of seasons,
    its description, and the show's buttons.
  - **The main button** (yellow, first) picks the show up: **Resume S9 E3**,
    the episode most recently in progress in any season; else **Play S9 E4**,
    the next unwatched episode after the last one finished (on screen, or the
    one Dropout's up-next named when it played here); else **Play S9 E1**, the
    first episode on screen. Leanback's history and Dropout's bars both count;
    progress from before *Clear Continue Watching* does not resume. Then
    *Trailer*, where there is one, and *My List*: *+ My List* when the show is
    not on the list, *✓ My List* when it is.
  - **Seasons**: with more than one, a row of seasons, newest first, from
    Dropout's own season list; each says "Season N", the one on screen
    yellow. Its full name ("Season 1: All About …") and Dropout's episode
    count head the episodes. Opening a season replaces this page, so Back
    leaves the show.
  - **Episodes**: five across, Home's cards (picture, running time, title,
    "Episode N"); watched dimmed with a tick, in progress with a bar.
  - **Opening a show.** Dropout opens every show on Season 1. At an address
    that names no season, Leanback goes on to the **newest** (*Shows Open On*:
    newest / first season), replacing the page; an address that names its
    season is left alone. The page stays blank until that is decided (never
    more than 2 s), so Season 1 does not flash up.
  - **Where the selection starts:** the episode you are partway through; else
    the first one after the last you finished; else Episode 1.
  - **The order**: Dropout's (Episode 1 first), except with *Shows Open On:
    Newest*, where the episodes run whichever way puts that start episode
    near the top: newest first when it is past the middle of the season
    (caught up with a running season), Episode 1 first before that. Newest
    first loads the whole season (Dropout's *Load More*, pressed until gone).
  - **A special** (a movie and its extras): the banner with *Watch Movie*
    (where the selection starts) and *My List*, then the movie and its Extras.
  - Not drawn: Share, the season drop-down and sort control, and the My List
    button Dropout puts on each episode for a mouse.
- **Search** (`/search`): Leanback's own box at the top, as wide as five
  cards, large text, ringed but not grown; what is typed goes into Dropout's
  box, and Dropout's results come back as Home's cards, five across. Under
  the box, Dropout's type filters (*All (118)*, *Videos (115)*, *Collections
  (4)*) as pills, the one on screen yellow. With nothing typed, Dropout's own
  words ("Start typing to see results"). The selection starts in the box;
  OK in it opens the on-screen keyboard, whose *Done* (or, typing with a
  real keyboard, Enter) goes down to the filters and results.
  *Load More* is pressed near the end of the results, never while typing.
- **Spatial navigation** on the pages Leanback does not draw: arrow keys
  move DOM focus to the nearest focusable element in that direction. A tile
  with two links counts as one target. Open dialogs (trailer, cookie banner)
  trap focus until closed, and hide Leanback's screen and the rail while
  open. A native `<select>` is a two-step control (OK engages it, ◀ ▶ step,
  OK commits, Back restores), so ◀ ▶ can still pass it. ▼ past the last row
  of a grid presses the site's "Load More".
- **Focus ring.** One overlay drawn over the focused target: 4 px, Dropout
  yellow (`#feea3b`), a dark outer edge, its corners rounded like the
  target's; the target enlarged by the selection zoom (5 % by default).
  Colour, width and zoom are settings. Under `prefers-reduced-motion` nothing
  animates.
- **Back is Firefox's own Back**: Firefox acts on the remote's BrowserBack
  whatever the page does, so Leanback keeps the history in the shape Back
  should follow. Sideways moves — another episode, another season, one rail
  section to another — replace the page; a Back that lands on a sibling (the
  previous episode, after Dropout's up-next went on to the next) carries on
  past it. A video playing is a step of its own above its details page, at
  the same address. So Back walks the video → its details page → the season
  page you came from → Home.
  `Escape` does the same after closing what is open. In a tab opened straight
  on a page, with nothing behind it, Leanback walks up the site itself, and at
  Home runs the **exit hook** (*Back On Home*: does nothing, or closes the
  tab — in a kiosk, that ends Firefox; until it is picked, it closes the tab
  on a signed install and does nothing on a copy loaded from its folder).
- **An episode's details page**, as on Dropout's Roku app. Every way
  to an episode — any card, Continue Watching, the show's main button,
  *Watch Movie*, an extra — opens it; nothing plays until *Watch*. Dropout's
  player is loaded underneath and held: a start of its own is taken straight
  back. On the left: the show's name (yellow capitals), the episode's title,
  "Season 2, Episode 1 · 28-Feb-2020", the synopsis (six lines), then one
  row of buttons: *Watch* (yellow), or *Resume* with *Start Over* beside it
  when the episode is in progress (the same reading the player resumes
  from); *+ My List* / *✓ My List* (Dropout's own button, pressed; the
  screen reader says *Add to My List* / *Remove from My List*); *Episodes* (the season's page, else the show's); *Clear
  Progress* when the history draws any progress for it, partway or watched
  (see *Clear Progress* under the watch history). On the right
  the episode's picture (`og:image`, else the history's), with the progress
  bar and the time left ("15:00 left") when in progress. The selection lands
  on *Watch* or *Resume*; ▲ ▼ do nothing; ◀ from the first button is the
  rail. Play/pause is *Watch*; next/previous open that episode's details
  page. A page with no title to read is driven as Dropout draws it, playing
  at once.
- **Watching.** *Watch*, *Resume* or *Start Over*: the video fills the window
  (CSS, not the Fullscreen API) with the focus in the player, and the press
  is passed on as the viewer's, so the sound may come on with it. Back is the
  details page again, the video held where it stopped, the button now
  *Resume*. The next or previous episode, by the up-next card, the media
  keys or Dropout's own countdown, plays straight away (its details page is
  under it), as does a reload while a video plays. Dropout 24/7's stream
  opened at its own address is an episode here: its details page, with
  *Watch* only, then the stream.
  In the player one press of OK is one: a held OK, and the press of *Watch*
  arriving there too (within 0.4 s of the keys coming), do nothing. A start
  the player stops by itself is made again (five times at most, never after
  the viewer's pause); one Firefox refuses with the sound on starts muted. The seek step is 10 s by default;
  media keys work from anywhere on the page.
- **Dropout 24/7 in place.** On Dropout 24/7's page (a hub: the *Live now*
  banner and *Watch*), *Watch* — any link to a live stream's page
  (`live.path`) — reads that page with the page's own fetch, takes its
  player's address (`live.player`, only `https://embed.vhx.tv`) and title,
  and puts the player over the page in the full window, a history step of
  its own; the press was on this page, so the sound can come on. The
  player's keys, control bar and settings work as for a video playing; Back
  (Escape, the remote's) closes it, the selection back on *Watch*. No player
  to read: the link is followed.
- **Next / previous episode.** The site's up-next when present; otherwise the
  episode order from the show's page. **Autoplay next** on `ended` is a
  setting (default on).
- **The title.** Over the top left of the picture: the show's name in yellow
  capitals, then "S9 · E3 · Whodunnit". It shows for 4 s when an episode
  first plays, and whenever the bar is up.
- **Pause.** A pause the viewer makes brings up the title and the bar,
  without a selection, and they stay until the video plays again. The
  settings panel's own pause, and Firefox stopping an unmute, show nothing.
- **Skipping.** Each skip shows ⏪ / ⏩ with the new time in the middle of the
  picture, with the bar, until 1 s after the last skip, so quick presses
  never flicker. On a paused video the bar stays, as for the pause.
- **The bar opened with ▼** closes by itself 3 s after the last key while
  the video plays; each key starts the 3 s again. Paused, or with the
  settings panel open, it stays.
- **Back** takes the bar and the title away at once, whatever is showing.
- **Up next.** From Dropout's lead time before the end (8 s), or as soon as
  Dropout's own card is up: a card over the bottom right with the next
  episode's picture in a countdown ring, "UP NEXT · 0:08", "S9 · E4", the
  show, and its keys. Hiding it stops autoplay for this episode. With
  *Autoplay Next Episode* off it counts nothing down, and Dropout's own card
  is told to stand down (its Hide). Dropout's card stays in place, invisible.
- **Transport bar.** Leanback's own: play/pause · position · settings ·
  fullscreen, round buttons on a dark fade along the bottom of the picture,
  the play button larger with a yellow symbol, the time so far under the
  start of the progress bar and the length under its end. The position is
  shown, never selected. The player's own chrome stays hidden.
- **One settings panel.** Full height from the right, about a third of the
  screen (660 of 1920 units): the title, entries under grey group headings,
  each value at the end of its line, the selected entry a yellow pill with
  black text, a switch for each on/off, a chevron and the value for an
  entry with several values, a tick on the chosen option, the keys along
  the foot ("◀ Back · ▲▼ Move · OK Change"). No ✕: Back closes it. It never
  navigates the tab (in a kiosk there would be no way back).
  - **During playback** (the bar's gear, or menu) it is *Playback Settings*.
    It pauses the picture and holds, under *This episode*, Play Next
    Episode; under *Picture*, Quality and Speed (the player's own menus);
    under *Captions*, **Closed Captions** (a switch: on is the player's
    first track; ▶ opens the player's captions menu) and **Caption Style**
    (the player's Customize: Font, Background, Window, each listing Family,
    Color, Size, Opacity, Edge Style with the current choice); then
    Leanback Settings. The selection starts on the first setting, not on
    Play Next Episode. *Start Over* is on the episode's details page.
  - **Everywhere else** (menu, or the rail's gear) it holds Leanback's
    settings under *Playback*, *Browsing* and *Look*, then *Clear Continue
    Watching*.
  - Leanback's settings are one list (`lib/settings.js` → `ROWS`), the same
    entries in the same order and words in both panels and on the options
    page. *Start Videos Muted* is on the options page only.
- **Button hints.** Off by default. When on, a bottom strip shows the
  buttons that matter now: always up on pages, briefly on a press during
  playback. Short notices ("No next episode") use the same strip, hints on
  or off.
- **Player controls** (options page only): *The site's own player controls*
  leaves the player's own bar alone and draws nothing over the video, for
  troubleshooting.
- **Toggle.** The toolbar button, or a user-assigned
  shortcut (`commands`, no default binding) turns Leanback off/on for the
  site; the state persists.

## Optional / future functionality

- Gamepad support via the Gamepad API (today: map the pad to keys outside the
  browser).

## Permissions

What each permission is for, and what data collection the manifest declares:
the README's [Permissions](../README.md#permissions). The images Leanback
shows come from Dropout's image server (`vhx.imgix.net`); the one page it
reads is a live stream's, when *Watch* is pressed on Dropout 24/7's page. **Not** requested:
`tabs` (the background closes the sending tab via `sender.tab.id` without
it), `webRequest`, `nativeMessaging`, `<all_urls>`. A new permission is
explained in the README and here.

## Architecture overview

Two content scripts — one in the page, one in Dropout's cross-origin player
frame — relayed by an event-page background, which is also the only writer
of the watch history. Everything Leanback knows about Dropout is in
`sites/dropout.json`; `nav/*` is site-agnostic. Files, messages and
mechanisms: [architecture.md](./architecture.md).

## Settings and storage

`storage.local`, one object under the `settings` key, normalised on every
read by `lib/settings.js` (a missing or corrupt value falls back to the
default rather than throwing):

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | TV navigation on for Dropout hosts |
| `ringColor` | `"#feea3b"` | *Theme Color*, `#rrggbb`: the ring and everything Dropout yellow. Offered: Dropout Yellow, Soft White `#f2f2f2`, Sky Blue `#7cc6fe`, Mint `#8fe3b6`, Lavender `#b9a6ff`, Peach `#ffb38a`, Rose `#ff9eb5`; the 0.35 colours (`#ffffff`, `#ff4081`, `#41d6c3`, `#ff8a3d`) move to the nearest |
| `ringWidth` | `4` | px, 2–12 |
| `focusZoom` | `5` | how much bigger the selected item gets, in percent (0–25); 0 turns it off |
| `hintBar` | `false` | show button hints |
| `playerChrome` | `"leanback"` | `leanback` or `site`: the site's own player controls, for troubleshooting. On the options page only |
| `seekStep` | `10` | seconds per ◀ ▶ press in the player: 5, 10, 15, 30, 60, 120 or 300 |
| `autoplayNext` | `true` | play the next episode when one ends |
| `startMuted` | `false` | start videos muted. Off: the extension turns the sound back on once per video. On the options page only |
| `skipMarketingSite` | `true` | forward `www.dropout.tv/` to `watch.dropout.tv/browse` |
| `exitHook` | `"close-tab"` | `none` or `close-tab` — what Back does at the top level (Home). Until it is picked (`exitHookSet`), it follows the install: `none` when `development` |
| `exitHookSet` | `false` | whether *Back On Home* was picked |
| `development` | `false` | written by the background: Leanback loaded from its folder (`management.getSelf().installType === "development"`) |
| `seasonStart` | `"latest"` | `latest` or `first` — the season a show opens on when its address names none |
| `theme` | `"dropout"` | `dropout`, `midnight`, `oled`, `warm` (lib/themes.js) |
| `holidays` | `"off"` | `off`, `auto` (by date), or one look: `newyear` (1–6 Jan), `valentines` (7–14 Feb), `stpatricks` (14–17 Mar), `halloween` (17–31 Oct), `winter` (Dec) |
| `uiScale` | `100` | Interface Size: 100, 115 or 130 (%) |
| `highContrast` | `false` | black and white, white edges, a ring of at least 6 px |
| `reduceMotion` | `"system"` | `system`, `on`, `off` |
| `captionSize` | `"default"` | `default` (the player's own), `large`, `larger`, `largest` |
| `captionColor` | `"default"` | `default`, `white`, `yellow`, `cyan` |
| `captionBackground` | `"default"` | `default`, `black` (a box), `none` (a shadow) |
| `videoFilter` | `"off"` | `off`, `protanopia`, `deuteranopia`, `tritanopia`: a colour matrix on the video (experimental) |
| `pageLooks` | each first value | Theme This Page, per kind of page: `home: {banner: large/small/off, cards}`, `lists: {cards}`, `show: {cards}`, `details: {picture: right/left/off}`; `cards` is `medium`, `small` or `large` (five, six or four across a grid) |

The watch history is a separate key per Dropout profile, `progress:<n>`
(`progress:0` for the first), so a settings save never rewrites it and each
profile has its own; `progress` (from before profiles) moves to the first
profile seen. Each is `{ entries: { <video slug>: { url, title, series, image,
duration, show, season, episode, next: { url, season, episode }, local: {
position, at }, dropout: { percent, at } } }, clearedAt }` (`show`, `season`
and `episode` from the episode page, `next` from Dropout's up-next),
normalised on every read by `lib/history.js` and capped at 500 videos (the
least recently touched go first). *Clear Continue Watching* keeps every
watched video whole; of the rest it keeps only Dropout's own readings, and
sets `clearedAt`: nothing unfinished read before it counts for Continue
Watching or resuming. The tab's trail for Back is in `sessionStorage`
(`tenfoot.trail`, `tenfoot.intent`); the background keeps, in
`storage.session`, each tab's player frame (`players`) and the profile
watching in it (`profiles`).

## UI requirements

- The ring and hint bar stay legible over light and dark pictures and never
  cover the focused element's text. The ring is the only highlight:
  Leanback's buttons draw no background of their own when hovered or
  selected.
- Leanback's screens follow Dropout's look: its typeface (Helvetica Neue,
  Helvetica, Roboto, Arial), a near-black ground (`#0b0c10`), yellow
  (`#feea3b`) for the ring, badges and progress. Sizes scale with the screen
  width (80 % of a 1920-wide layout), so they read the same on a 1080p and a
  4K television; no text is smaller than 13 px.
- Options page: plain form, ≥ 16 px text, fully operable by Tab/arrows/Enter,
  light/dark via `prefers-color-scheme`.
- No browser-action popup — a popup cannot be driven from a remote.

## Performance notes

- No polling. A debounced `MutationObserver` (100 ms) invalidates the
  focusable-candidate cache; candidates and rects are computed on keypress.
  Changes inside Leanback's own elements do not count.
- Screens redraw only what changed, keyed by link, so a card keeps its
  element (and the selection) when the site redraws. Pictures load lazily.
- The watch history hears from a playing video at most every 15 s; the
  background applies one report at a time.
- Focus ring updates are `requestAnimationFrame`-throttled on scroll/resize.
- Arrow repeat is capped at one move per 80 ms.
- Player state messages are sent on change and at most 4×/s while playing.

## UX guidelines

- Exactly one focused element is always visible; on page load focus lands on
  the first content (never on the header, never nowhere).
- Never trap focus except inside a real dialog, and Escape always closes it.
- Never inject synthetic key events into the page; act on elements directly.
- Never override the site's behaviour for keys the extension doesn't need.
  In a text field only Escape, ◀ at the very start of the text, and ▼ in a
  one-line field are taken.
- Back always leads somewhere sensible, even in a tab opened straight onto a
  deep link (the kiosk case).
- Never fight the browser: what Firefox does with a key regardless (Back) is
  designed around, not blocked.
- **Focus never follows the pointer.** Air-mouse remotes drift; `mouseover`
  must not move the ring, and the site's hover tooltips are suppressed while
  the extension is on. A deliberate click still activates.

## Testing

Run in a logged-in profile unless stated. "Ring" = the focus ring.

| # | Step | Expected |
| --- | --- | --- |
| 1 | Open `https://www.dropout.tv/` | Lands on `watch.dropout.tv/browse`, which shows Leanback's Home: the rail on the left, the featured banner, the ring on *Watch now* |
| 2 | Home: Down, Right ×3, Down, Up | The ring goes into the first row and along it, the row sliding so the selected card keeps its place; each Down brings the next row to the same height, with nothing of the row above showing; Up returns to the card you left in that row. The selected card grows inside the ring, its title steps down, and neither touches the heading; the ring's corners follow the card's |
| 3 | Home: keep pressing Down | New rows arrive before you reach the last one; a row of 12 ends with *View all*, which opens the whole collection with the ring on its first tile. Shows have wide pictures, running times read *6:03*, New Releases has no "NEW" badges, and there is no My List row |
| 4 | Home: on the banner, Right once to **›**, Enter ×2; then Right to *+ My List*, Enter | **›** sits right after *Watch now*; the next featured show, then the one after; *+ My List* adds the show to Dropout's My List (it becomes *✓ My List*) and Enter again removes it (back to *+ My List*). *Watch now* is black on yellow, *Trailer* white; **›** and *My List* turn no colour when selected |
| 5 | Home: Left from the first card of a row, Down, Down, Down, Right | The rail, on Home; then Browse; then My List; then Dropout 24/7; Right returns to the card. The current page's icon is yellow; the selected icon has the yellow box round it and no coloured square behind it (hovering with the mouse shows none either). OK on My List opens your saved shows, the bookmark yellow and the ring on the first; OK on Dropout 24/7 opens it with its icon yellow; the gear opens Leanback's settings on the spot |
| 6 | Home: Escape (Leanback loaded from its folder) | Nothing happens (*Back On Home* not picked: does nothing on a folder copy); a notice says "Nothing to go back to" |
| 7 | On the rail, Browse, OK; then hold ▼ | "Series" at the top, the shows five across as Home's cards, Browse's icon yellow; no Dropout top bar. ▼ moves a row and the row slides up to the same place; near the end more shows arrive; ◀ from the first column is the rail |
| 8 | On Home, ▼ to New Releases, ▶ to its *View all*, OK | The list drawn the same way, "New Releases" at the top, the rail beside it (no entry lit), no "New" badges; Back returns to Home |
| 9 | Watch an episode for two minutes, go back to Home | It is first in Continue Watching with its progress bar and the time left ("2:48 left"); an episode in progress on the Roku is in the row too |
| 10 | Open that episode again; then Back to its show | It starts where you stopped; "Resumed at …" shows for a moment; Back, then *Start Over* on the details page goes back to 0:00. On the show's page the yellow button says *Resume S… E…*, and OK plays it |
| 11 | Enter on a show with several seasons that you have not watched | Leanback's screen opens on the **newest** season, with no flash of Season 1: the show's picture and name, a yellow *Play S… E1*, *Trailer* and *My List*; the seasons newest first with that one yellow; its name and episode count over the episodes, five across; ring on Episode 1; the rail on the left; no Dropout top bar, no Share, no dropdowns |
| 12 | Up to the seasons, Right, OK; then Back | Up lands on the yellow season; Right moves along (the row slides); OK opens that season, which turns yellow; Back leaves the show for Home |
| 13 | Up to the show's buttons, Right to *My List*, OK, OK | *+ My List* turns to *✓ My List*, and back on the second OK; the button shows no blue when selected |
| 14 | On the show's buttons, *Trailer*, OK; then Escape | The trailer opens with the ring inside it; Escape closes it and the ring returns to *Trailer* |
| 15 | A show you are partway through: open the season you are watching | Watched episodes carry a tick, the one in progress a bar, and the ring starts on the one to watch next |
| 16 | A season you are caught up with (all watched but the newest), *Shows Open On: Newest* | The episodes run newest first; the newest is top left, selected |
| 17 | Leanback settings: *Shows Open On*, OK, ▼ to *First season*, OK; open a show | The list shows both, the newest ticked; afterwards the row reads *First season*; the show opens on Season 1 |
| 18 | Down repeatedly past the last episode | Each row slides up to the same place; more episodes appear before the end; ring continues |
| 19 | Open a special (a stand-up set) | Its picture and name, *Watch Movie* yellow with the ring on it, *My List*; Down to the movie, then its extras |
| 20 | Enter on an episode | Its details page: the show's name, the title, the season line, the synopsis, *Watch* (yellow, ringed), *+ My List*, *Episodes*; the picture on the right; the rail on the left; nothing plays and nothing is heard. Enter on *Watch*: the video fills the window and plays |
| 21 | In the player: Enter, Enter, Right, Left; then Right ×5 quickly while playing | Play: the show's name and "S… · E… · title" top left for four seconds. Pause: the title and the bar come up, no button ringed, and stay while paused; Right, Left skip +10 s, −10 s with the bar still up. Right ×5: ⏩ and the new time in the middle, the bar up, steady, gone a second after the last press |
| 22 | While playing: Down, then Down again; then Up; then Down and wait | The transport bar opens; Down again stays on it; Up closes it; opened again and left alone, it closes after three seconds |
| 23 | After a minute or more: the remote's Back, Back | The details page, the video stopped; the button says *Resume* with *Start Over* beside it, and the picture shows the progress and the time left; then the season page |
| 24 | From Home, open a show, an episode, *Watch*, let it play into the next (or press Next); then the remote's Back, three times | The next episode plays without stopping at its details page; Back: its details page, then the season page (not the previous episode), then Home |
| 25 | On the season row, switch season, open an episode; then Back, Back | The season you switched to, then Home — not the first season |
| 26 | Watch an episode for a moment, then the remote's Back, Back; on each page, press ◀ ▶ | Every page answers the remote straight away; no page needs a reload |
| 27 | Open any page from the rail, watching the screen as it loads | A dark screen, then Leanback's; Dropout's own page never shows first |
| 28 | `/search`: type a query | Leanback's box at the top, ringed, not grown; letters appear in it and Dropout's results arrive as cards five across; ▼ the filters (*All (…)* yellow), ▼ the results; OK on *Videos* shows only videos. In the box, Left moves the text cursor and at the start of the text reaches the rail; Right returns. Up from the first row of results reaches the filters, then the box |
| 29 | Search: type a word, wait, type another; then ◀ to the rail, Home, OK | Home opens; Escape from the results instead leaves Search in one step |
| 30 | Rail → Dropout 24/7; *Watch*; then Back, Back | Dropout's 24/7 page: its banner picture, "Dropout 24/7", *Watch* ringed, the 24/7 icon yellow; then the stream in the full window, with sound, the address still the 24/7 page's; Back: the 24/7 page, *Watch* ringed; Back: where you were |
| 31 | On a details page, press MediaPlayPause; then again | The video starts as with *Watch*; then pauses |
| 32 | Let an episode end (or seek near the end) | Eight seconds before the end, the "Up next" card: picture, ring counting down, "UP NEXT · 0:08", "S… · E…", the show, *OK Play now · ◀ Hide*; the next episode starts at the end. Again with OK: it starts at once. Again with ◀: the card goes and nothing plays by itself |
| 33 | Press the keyboard's *Menu* key on Home | Leanback's settings slide in from the right, about a third of the screen: the title, *Playback*, *Browsing* and *Look* headings, each value at the end of its line, the keys along the foot, the selected entry a yellow pill with no ring; switches for on/offs, a value and › for the rest; no context menu; hovering turns nothing blue |
| 34 | In that panel: ▼ to *Seek Step*, OK, ▼, OK; then *Skip dropout.tv Home*, OK; then Left | *Seek Step*'s values open with 10 s ticked; OK on 15 s picks it and goes back up. The switch flips. Left closes the panel and the ring is back where it was |
| 35 | In that panel: *Clear Continue Watching*, Enter, Enter | The first Enter asks; the second clears: Continue Watching disappears (Roku items included); Dropout's bars still show on cards; finished episodes keep their tick |
| 36 | Playing an episode: Down, Right to the gear, Enter | The settings panel opens and the picture pauses |
| 37 | In the panel: Closed Captions, OK, OK; then Caption Style, OK, Font, OK, Color, OK, Yellow, OK; then Left | Captions come on and go off. Caption Style shows Font, Background, Window; Font lists Family, Color, Size, Opacity, Edge Style with their choices; *Font Color* opens, OK on Yellow goes back up with Color showing Yellow (and the captions yellow); Left goes up one level, and from Caption Style straight back to the top |
| 38 | During playback: settings → Leanback Settings | The same entries, in the same order and words, as on Home |
| 39 | Fresh profile, first visit | The cookie dialog is reachable by arrows and closable by Enter, above Home |
| 40 | Wiggle the mouse over cards on Home and tiles on `/series` | The ring does not move; no hover tooltips |
| 41 | Click the toolbar button; click again | The site behaves as stock Firefox (Dropout's own Home); then Leanback is back |
| 42 | Change the ring colour in options, reload | New colour |
| 43 | *Back On Home: Closes the tab*; go to Home; Escape | The tab closes (in kiosk: Firefox exits) |
| 44 | Restart Firefox | Settings kept |
| 45 | Signed out (a fresh profile): open `https://watch.dropout.tv/` | Leanback's welcome: Dropout's logo, "INDEPENDENT. FUNNY. AD FREE.", the words and the line about starting a subscription elsewhere; *Sign In* yellow and ringed, then *Browse*, *Privacy Policy*, *Terms of Use*; no rail, nothing of Dropout's page |
| 46 | On the welcome: *Privacy Policy*, OK; ▼ ▼ ▲; Back | The policy in large white-on-dark type, no top bar or footer; each ▼ scrolls most of a screen, ▲ back; Back returns to the welcome |
| 47 | On the welcome: *Sign In*, OK (a fresh profile: the cookie dialog first, *Accept All* ringed; OK) | Leanback's sign-in screen on a dark ground: yellow "DROPOUT", "Sign in", an *Email* box (ringed) and a *Password* box, *Sign in* yellow, *Forgot password?*; the typing line and *Privacy Policy*, *Terms of Use* under it, reachable with ▼; ▲ ▼ go box to box and stop at the ends; Enter in *Email* goes to *Password* |
| 48 | Sign out, open Home | It goes on to the welcome; *Browse* there returns to Home and stays |
| 49 | Picker: ▶ to *Manage Profiles*, OK; then *Add Profile*, OK; Back; then a profile's *Edit*, OK | "Manage profiles" at once: a pencil over each picture and an *Edit* button under each name, the ring on the profile watching; ▼ to its *Edit*, ▲ back; then *Add Profile* and *Done*; ▶ at the end goes round. Add Profile: Leanback's screen — the title, the picture, a large name box (ringed), *Cancel* then *Continue* (dimmed until a name is typed); OK on the picture: Dropout's chooser, dark and large, the ring on a picture. Edit: the same screen with *Save* (dimmed), *Cancel*, a red *Delete Profile*; the rail beside both |
| 50 | On My List, a Dropout 24/7 card, OK | Dropout 24/7's page (Leanback's, *Watch* ringed), not Dropout's plain stream page |
| 51 | A details page of an episode partway through: ▶ to *Clear Progress*, OK; then Back to Home | "Progress cleared"; the buttons are *Watch*, *+ My List*, *Episodes*, *Watch* ringed; the picture has no bar. On Home it is gone from Continue Watching, and its card elsewhere has no bar |
| 52 | Signed out, a fresh profile: open a show's page (`https://watch.dropout.tv/game-changer`) | The cookie dialog has the selection, *Accept All* ringed; OK closes it and the selection is back on the show; no "too much recursion" in the console |
| 53 | On "Who is watching?": ▶ to *Sign Out*, OK; Back; OK, ▶, OK | A box "Sign out of Dropout?", *Cancel* ringed; Back closes it with the ring back on *Sign Out*; *Sign Out*: signed out, the welcome |
| 54 | Edit Profile of a spare profile: *Delete Profile*, OK; OK; again, ▶, OK | "Delete <name>?", *Cancel* ringed; *Cancel* deletes nothing; *Delete Profile*: the profile is gone, back on the picker |
| 55 | Empty My List (rail → My List) | "My List" and the line saying it is empty; the ring on the rail's My List; ▶ stays there |
| 56 | Settings → *Theme Color*, OK; ▼ ▼; Back; again ▼, OK | Each colour shows at once on the ring, the buttons and the lit icon; Back puts yellow back; OK keeps the one picked |
| 57 | Settings → *Holidays* → *Automatic* (in late October) | The selection and buttons in pumpkin orange, an orange and purple glow along the top of Home |
| 58 | Home: Settings → *Theme This Page* → *Banner* → ▼ (Small), ▼ (Off), OK; then *Card Size* → *Large*, OK | The banner shrinks, then goes, the rows sliding up into its place; then the cards grow, sliding to their places. Closing the panel: the ring on a card |
| 59 | Settings → *Accessibility* → *Interface Size* 130 %, *High Contrast* on | Everything larger; black and white with white edges and a thicker ring |
| 60 | Playing, captions on: Settings → Accessibility → *Caption Size* Largest, *Caption Background* Black box; *Color Filter* Green-weak | The captions larger on a black box; the picture's colours shifted (experimental) |
| 61 | `web-ext lint --source-dir ./leanback-for-dropout --warnings-as-errors` | Passes |

## Known limitations

The user-facing list is the README's
[Known limitations](../README.md#known-limitations). Beyond it: the episode
the selection starts on, and the newest-first order, are worked out from the
episodes Dropout has drawn, so in a season longer than Dropout's first page
of episodes one further down is not considered until more are loaded.

## Milestones

0.37.0 is sign-in robustness, ease and the in-UI keyboard. 0.38.0 is the
accessibility options. The theming milestones (0.39.0–0.41.0, and import and
export in 1.0) are described in full, with the lessons they rest on, in
[theming.md](./theming.md#milestones).

### 0.37.0 — sign-in robustness, ease and the in-UI keyboard

Signing in on a TV is hard because of the typing. 0.37.0 takes the typing
away where it can (a saved password fills the boxes) and makes it easier
where it can't (a keyboard on the screen, or the phone). Throughout,
Leanback passes the password to Dropout's own form on the page and never
keeps, logs or sends it, and it asks for no new permission.

- **Leanback-drawn sign-in screen**, one screen with an *Email* and a
  *Password* box, *Sign in*, *Forgot password?* and the policies. *Sign in*
  goes through Dropout's own form, so its checks and its invisible
  reCAPTCHA work unchanged. Dropout's error messages are shown on
  Leanback's screen.
- **Filled by a saved password.** The boxes are ordinary sign-in boxes, so
  Firefox's own saved passwords (synced through a Mozilla account) and any
  password app's add-on can fill them. When they are filled, the selection
  moves to *Sign in* and one press of OK signs in. No code for any one
  password app.
- **Leanback-drawn password reset screen**: the email (carried over from
  sign-in), *Send reset email*, and what to do next in plain words.
- **An on-screen keyboard** of Leanback's own. **OK on a text box opens
  it**, and a real keyboard or a phone keyboard app still types without it.
  It works on sign-in (with `@` and `.com` keys on the email box and
  *Show* / *Hide* on the password), the password reset, search and a
  profile's name and a PIN (a number pad, digits first).
- **After signing in, "Who is watching?"; choosing a profile always ends on
  Home** (the owner's decision: not back to the page that asked for the
  sign-in, not wherever Dropout would go).
- **"Dropout signed you out."** When this TV was signed in and a page loads
  signed out, Leanback says so and offers *Sign in*, rather than leaving a
  Home whose videos won't play.
- **When something goes wrong**: Dropout not answering (a message, never a
  spinner left turning), Google's "are you a person" puzzle (Leanback steps
  back and says to use the pointer), and an account with no active
  subscription (renew on a phone or computer).
- **One My List button**: *+ My List* when not in the list and *✓ My List*
  when it is, on Home's banner, a show's page and an episode's page alike.
- **Typing with a phone, and saved passwords**: a setup section in
  [targets.md](./targets.md).
- **A list of the things that don't match** across Leanback's screens, for
  the 0.39.0 theming foundations to fix.

Not in 0.37.0: a phone sign-in page reached by a QR code. A browser add-on
can't run a server, so it needs a small helper program installed on the TV
computer, and it is left for later. Dropout's own TV code
(`dropout.tv/activate`) works only for Dropout's official apps, and its
emailed sign-in link signs in whichever device opens it, so neither helps
here.

### 0.38.0 — accessibility options

Where Leanback already has something close, it is said beside the item: the
milestone builds on it, and what exactly changes is settled when the work
starts.

- **Colour-blind-safe colours.** May be done here or in the theming
  releases below. The player's *Color Filter (Experimental)* already
  changes the video's colours; Leanback's own colours do not change yet.
- **Button remapping**: which remote button does what.
- **A larger focus ring.** *Ring Width* (2–12 px) and *Enlarge Selection*
  exist already; the milestone goes beyond them.
- **A setting that stops going on to the next episode by itself.**
  *Autoplay Next Episode* is that switch already; the milestone makes sure
  it always stops the next episode, Dropout's own countdown included.
- **Turning off previews that play by themselves.**
- **Reduce Motion, extended.** It is in 0.36.0 (Accessibility); the
  milestone takes it further.
- **Adjustable hold and repeat timing** for the remote's buttons (today an
  arrow held down moves at most once every 80 ms).

### 0.39.0 — theming foundations, in the refactor

- **One list of named theme values** that every stylesheet uses — the
  settings panel and the player frame included — with nothing written
  directly; the four themes as data derived from a few seeds, with readable
  text on the accent guaranteed; theme values set on Leanback's own layers.
  Nothing looks different; every theme then reaches everything. See
  [theming.md](./theming.md#039--the-foundations-in-the-refactor).

### 0.40.0 — the theming engine

- **Themes made of parts** (colours, type, shapes, decoration) as checked
  data, one order of precedence (Accessibility always last), themes of the
  viewer's own on the options page, holiday decorations as overlays (snow
  for the winter holidays as a switch of its own), and *Theme This Page* on
  every kind of signed-in page reachable from the interface, each with
  *Reset This Page*. See
  [theming.md](./theming.md#040--the-theming-engine).

### 0.41.0 — themes that rearrange whole screens

- **Layouts as modules**: a theme chooses, for each screen, one of the
  layouts Leanback provides, and navigation follows the layout. See
  [theming.md](./theming.md#041--themes-that-rearrange-whole-screens).

### 1.0

- **Watch history syncs between devices that have Leanback.** Leanback's own
  watch history (Continue Watching, resume points, watched marks) is shared
  by every Firefox with Leanback installed; until then it stays in this
  Firefox. Syncing with Dropout's Roku and Android apps is not the goal. How
  the installs share it is decided when the work starts.
- **Theme import and export**: a theme saved to a file and loaded from one,
  as data checked against Leanback's lists. See
  [theming.md](./theming.md#100).

## Release checklist

1. If `version` in `manifest.json` is still the last pushed release's, bump
   it and add the CHANGELOG entry. If it was already bumped since the last
   push, keep it and add to that version's CHANGELOG entry.
2. Re-check the site ([site-notes.md](./site-notes.md#checking-the-site-again));
   update `sites/dropout.json` if needed.
3. Run the [Testing](#testing) checklist in a fresh profile and in a
   logged-in profile.
4. `web-ext lint --source-dir ./leanback-for-dropout --warnings-as-errors`.
5. Publish a GitHub release tagged `v<version>` (the manifest's `version`)
   from `main`. The **Sign release** workflow
   (`.github/workflows/release.yml`) submits it to
   [addons.mozilla.org](https://addons.mozilla.org/developers/) as
   **unlisted** (self-distributed) with the repository secrets
   `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, and attaches the signed
   `leanback-for-dropout.xpi` to the release. That file is what a
   `policies.json` installs and what users can install permanently;
   `releases/latest/download/leanback-for-dropout.xpi` is always the newest.
   A pre-release is skipped by that link.
6. The README says the extension is unofficial and not affiliated with
   Dropout.
