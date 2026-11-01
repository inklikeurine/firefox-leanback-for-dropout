# Leanback for Dropout — documentation

| Document | Read this when… |
| --- | --- |
| [architecture.md](./architecture.md) | You're implementing or changing anything: components, why there are two content scripts, the message relay, the spatial-navigation algorithm, the screens Leanback draws (Home, collections, search, a show's page, an episode's details page), the rail, the watch history, the transport bar and settings panel, the video in the full window, the manifest and `sites/dropout.json`. |
| [site-notes.md](./site-notes.md) | Navigation broke or you're changing a selector: what each page's markup looks like, the player and its settings menu, what is still unknown, and how to check the site again. |
| [keymap.md](./keymap.md) | You're adding a key or changing what one does in some context (Home, the rail, a page, the player), or need to know how a typical remote's buttons map. |
| [targets.md](./targets.md) | You're setting it up on a TV driven by a remote and need what the remote sends, the constraints, a launch recipe and the checks to run on your setup (T1–T8). |
| [theming.md](./theming.md) | You're working on the look: where theming stands, the lessons from researching a theming engine, the rules a theme lives by, and the theming milestones (0.39.0–0.41.0, and 1.0). |
| [development.md](./development.md) | You're running it locally, debugging a frame or a symptom, or following the coding conventions. |

[spec.md](./spec.md) is the product spec: exactly what Leanback does, the
settings and storage, the manual test checklist, the release checklist and
the milestones (the theming milestones are detailed in
[theming.md](./theming.md)). The user-facing description is the extension's
[README](../README.md).

The headless suites, fixtures and verification journal live in the private
workspace (`_workshop/tests/leanback-for-dropout/`, `_workshop/fixtures/leanback-for-dropout/`,
`_workshop/review/leanback-for-dropout/`) and are not part of the published extension. The rules AI coding
agents follow for every extension in this repository are in the root
[`AGENTS.md`](../AGENTS.md).
