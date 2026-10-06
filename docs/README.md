# Leanback for Dropout — documentation

| Document | Read this when… |
| --- | --- |
| [architecture.md](./architecture.md) | You're implementing or changing anything: components, why there are two content scripts, the message relay, the spatial-navigation algorithm, the screens Leanback draws (Home, collections, search, a show's page, an episode's page), the rail, the watch history, the transport bar and settings panel, theater layout, the manifest and `sites/dropout.json`. |
| [site-notes.md](./site-notes.md) | Navigation broke or you're changing a selector: what each page's markup looks like, the player and its settings menu, what is still unknown, and how to check the site again. |
| [keymap.md](./keymap.md) | You're adding a key or changing what one does in some context (Home, the rail, a page, the player), or need to know how a typical remote's buttons map. |
| [targets.md](./targets.md) | You're setting it up on a TV driven by a remote and need what the remote sends, the constraints, a launch recipe and the checks to run on your setup (T1–T8). |
| [development.md](./development.md) | You're running it locally, debugging a frame, running the test checklist, handing verification to whoever tests on the TV, or cutting a release. |

The product spec is [spec.md](./spec.md) in this folder, with the milestones
for 1.0. `architecture.md` is the file to read before changing code, and
`site-notes.md` before changing a selector.

The headless suites, fixtures and verification journal live in the private
workspace (`.dev/tests/leanback-for-dropout/`, `.dev/fixtures/leanback-for-dropout/`,
`.dev/review/leanback-for-dropout/`) and are not part of the published extension. The rules AI coding
agents follow for every extension in this repository are in the root
[`AGENTS.md`](../../AGENTS.md).
