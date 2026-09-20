# TV Mode for Dropout — documentation

| Document | Read this when… |
| --- | --- |
| [architecture.md](./architecture.md) | You're implementing or changing anything: components, why there are two content scripts, the message relay, the spatial-navigation algorithm, theater layout, the draft `manifest.json` and `sites/dropout.json`. |
| [site-notes.md](./site-notes.md) | Navigation broke or you're filling in a `"todo"` selector: what the site's markup looks like, what was verified logged-out, what still needs a logged-in browser (U1–U14), and the commands to re-check. |
| [keymap.md](./keymap.md) | You're adding a key or changing what one does in some context, or need to know how a remote's buttons (the W1's, for one) map. |
| [targets.md](./targets.md) | You're setting it up on a TV box — the Bigscreen appliance with the W1 remote, or the HTPC shell — and need the constraints, the launch recipe and the on-box checks (T1–T8). |
| [development.md](./development.md) | You're running it locally, debugging a frame, running the test checklist, handing verification to the HTPC shell lead, or cutting a release. |
| [htpc-integration.md](./htpc-integration.md) | You're working on the HTPC shell's Dropout web app or `tv-nav` and need to know what moves where. |

The product spec is [spec.md](./spec.md) in this folder. The rules AI coding
agents follow for every extension in this repository are in the root
[`AGENTS.md`](../../AGENTS.md).
