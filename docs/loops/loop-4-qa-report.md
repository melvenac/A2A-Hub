# Loop 4: acceptance report (Gauge)

**Verdict: PASS** on `loop/4-ui` = `fdc6bfb6860868a82b0c297d89d6ac566a509293`, against the criteria
`docs/loops/loop-4-qa-criteria.md` at `df8a3a9` (accepted, ruling 2 `2c19450`).

**The image was not observed. A, C1, D1 and RG1 ran on a stage replay of the Dockerfile ("replay,
not image", G1).** The image's own checks are PB1 to PB3, on tcm, before the swap. PB is part of
the deploy act, not this verdict, and it needs Aaron's word.

- **Run:** QA seat, session 17, 2026-09-25 02:08Z to 02:34Z, on this machine (Windows 10, Node
  22.23.2). Nothing ran on tcm, the main checkout, or 3210/3211/4000.
- **Frozen:** `ls-remote` read `fdc6bfb` at the start and again at 02:33Z. The QA worktree
  `qa3-cand` sat at `fdc6bfb`, clean at the end, after the known `convex dev` artifact (T-054) was
  removed.
- **Baseline:** `cef7517`.
- **Instruments, scripts and run logs:** `docs/loops/loop-4-qa/` and `docs/loops/loop-4-qa/runs/`.

## Setup as run

- **Stage replay** (`replay.sh`): `git archive` of each SHA. The Dockerfile's stages were run by hand
  into an `/app`-shaped directory: builder `npm ci`, `tsc`, then the `_generated` copy; client
  `npm ci`, then `vite build`; final `npm ci --production`, then the three COPYs.
  - Hubs run the image's CMD, `node dist/src/index.js`, from that `/app`. They add `--env-file`
    (compose's env_file) and a `--qa-port` marker, which the hub ignores.
  - Both replays built with exit 0.
- **Stack** (`start-stack.ps1`):
  - scratch Convex on 3610/3611, running candidate functions (C2: identical to `cef7517`'s);
  - candidate hubs: warn :4610 and strict :4611;
  - a candidate hub with no client build, :4612;
  - `cef7517` hubs: warn :4620 and strict :4621;
  - the mutant hub, :4640;
  - vite dev, :5610.
- **P1/E0** (`runs/e0.log`): 3210, 3211 and 4000 were free before the run and before E. The
  detector saw a dummy listener first.
- **P6:** `~/.a2a-hub/keys/` was empty before and after, and the two listings match. Every key was
  scratch, in `QA_TMP/keys`:
  - five made by the candidate's `hub-key.mjs init --register`;
  - two by `hub-talk --init-key`;
  - the rest by the harness.
- **P10/T** (`runs/stop-stack.log`): exit 0, and all 11 QA ports were shown free. T refused to kill
  one recorded PID that had been reused by an unrelated process. Zero QA processes remained.

### Instrument substitution: W

Claude-in-Chrome's extension was **not connected** ("Browser extension is not connected"). W ran as
**Playwright headless Chromium** instead:
- `playwright-core` from the local npx cache;
- the installed `chromium_headless_shell-1223`;
- a fresh browser context, so fresh storage, for every flow.

That is stricter than P11, because Aaron's Chrome was never touched, and there was no
`localStorage` to clear afterwards. W records method, URL and **whether** `X-Agent-Key` was sent,
never its value. Keys were filled from the key files inside the script. The clipboard path
(`hub-key.mjs copy`) was not exercised.

**W's known positive** (`W.pos`): with the page's hub box pointed at :4620, W reported both origins.

## Results

| Row | Required | Observed (tree: replay of `fdc6bfb` unless noted) | Result |
|---|---|---|---|
| A1 (replay) | `/ui/` 200 html; `/ui` redirects; hashed assets immutable; index no-cache; missing file 404 and not index; `GET /` 404 = old; old `/ui/` 404 | `/ui/` 200 `text/html`. `/ui` gives 301 to `/ui/`. The js and css assets are 200 with `public, max-age=31536000, immutable`. `index.html` (both paths) is `no-cache`. Three missing paths are 404 and not the index. Four traversal forms are 403/404 and never serve `package.json`. `GET /` is 404, byte-identical to old. Old `/ui/` is 404. `runs/rows-ac-3.log` | PASS |
| A2 | page loads nothing from another origin | Every request in the keyless load, the keyed load (127.0.0.1 and localhost), and the whole B2 to B5 flow has one origin, the page's own. The bundle contains no fetchable URL; its only URL strings are the SVG namespace and svelte.dev. `runs/w-1.log` | PASS |
| A3 | default hub = page origin | Opened as `127.0.0.1:4610` and as `localhost:4610`, the hub box showed that origin each time. | PASS |
| A4 (replay + static) | CMD/EXPOSE unchanged; compose diff empty; `/app/client` holds `dist/` only; one listener; `.dockerignore` lines | Final stage `CMD ["node","dist/src/index.js"]`, one `EXPOSE 4000`. Compose diff is 0 lines. The replay's `client/` contains only `dist`. Hub PIDs listen only on their one port (`:::4610`, `:::4620`). `.dockerignore` adds `**/node_modules` and `client/dist`. **Not observed:** `docker inspect` and `.dockerignore`'s effect (PB1, PB2) | PASS (replay) |
| A5 | no client build, no mount | The :4612 log says "UI: no build at … — /ui not served". Its `/ui/` and `/ui` are byte-identical to `cef7517`'s 404s. | PASS |
| B1 | no key: zero `/a2a`; after a key, whoami first and once | Keyless load: `GET /ui/`, two assets, `GET /health`, and 0 `/a2a` in 4 s. The key-needed text shows and the connection box is open. After the key: `/a2a/whoami` once, then `/a2a/sessions`. Same on both origins. | PASS |
| B2 | posts as the key's name | "you are aaron", and both seeded sessions are listed and open. One composer post in each read back parsed as `from: "aaron"`. | PASS |
| B3 | seed post | New chat with qa-l4a and a first message. Participants are exactly `["aaron","qa-l4a"]`, and message 1 is `from: "aaron"` with the exact content. The baseline direction is static: `cef7517` `App.svelte:162` sends `from: "alice"`. | PASS |
| B4 | panel = `agents/live` minus me and hub | When the panel opened, it and the route both returned `[qa-l4a, qa-l4b]`, with stale qa-l4c absent. 50 s after qa-l4b's heartbeat stopped, ↻ gave `[qa-l4a]` for both. After one qa-l4c heartbeat, ↻ gave `[qa-l4a, qa-l4c]` for both. | PASS |
| R-L | 45 s text; no live agents stated; sessions still load | "agents seen on this hub in the last 45 s" is visible. With everyone stale: 0 checkboxes, the route is empty, and the page reads "no agents are live on this hub right now". The history still lists both seeded sessions, and one took a post from aaron. | PASS |
| B5 | as R-L | as above | PASS |
| B6 | unrecognised key | Warn hub: whoami gives `name: null`, and the page shows "does not recognise that key". Strict hub: 403 is shown. Each made one `GET /a2a/whoami` and no POST, with no composer and no new-chat panel. | PASS |
| B7 | key change | The swap from aaron to qa-h2 made whoami the first new call. The page shows "you are qa-h2", and the open room closed. A post in qa-h2's room read back `from: "qa-h2"`. No B7 post carries aaron. | PASS |
| B8 | no cast; every `from` is `me` | G on the candidate: **0** (validated at 11 on `cef7517`). `from:` sites are `App.svelte:217` and `:247`, both `from: me`. The only `aaron` in `client/src` is the storage slot name, `:15`. | PASS |
| B9 | demo gone | `startDemo` and `HUMAN` occur 0 times in `client/src`. | PASS |
| C1 (replay) | old = new on every API route | 37 cases × 3 key states, in warn and strict: **0 differences** each. Status, parsed body and the three CORS headers were compared. The neighbours `/`, `/nope`, `/uix`, `/uix/`, `/ui-x` and `/a2a/ui` are identical. R's positive (warn vs strict on the old build) reported 24 differences. The named normalisations are listed below. | PASS |
| C2 | `convex/` unchanged | `git diff cef7517 fdc6bfb -- convex/`: 0 lines. The Dockerfile's `COPY convex/` lines are unchanged. **The fold-into-cutover condition holds.** | PASS |
| C3 | hub-talk unchanged | diff 0 lines | PASS |
| C4 | CORS unchanged | The CORS block (9 lines) is identical. Preflight headers are identical old and new (in C1). E covers the dev path. | PASS |
| D1 (replay) | no key in bundle or app | K's selftest passed first (clean 0; planted key in JS plus hash in HTML = 2; the same through a nested tar = 2). Hits: client-stage `dist` 0; the replay's whole `/app` (8,506 files, 344 MB) 0; `/app/client` 0. **Image `docker save` not scanned (PB3).** | PASS (replay) |
| D2 | no key in logs or console | 20 hub, heartbeat and vite logs: 0. W's request log: 0. The browser console: 0. QA run logs: 0. 11 keys in total, searched as the key and its sha256. The console held one line, the strict hub's 403. | PASS |
| D3 | no key in source; no dev-key site added | The `git archive` of `fdc6bfb` (1,228 files) has 0 hits. Loop 3's S keyscan over `client/` finds the same single `X-Agent-Key` header site on both SHAs, and no `dev-key`. | PASS |
| E0 | 3210/3211/4000 free before E | free, with the detector positive seen (`runs/e0.log`) | PASS |
| E1 | dev server | Candidate client via vite on :5610: `/` is 200, and the hub box defaults to `http://127.0.0.1:4000`. That default made one `GET /health` to :4000, which failed: nothing listens there (E0). Pointed at :4610 with aaron's key, the sessions list. A post reads back `from: "aaron"`. 7 cross-origin `/a2a` calls succeeded (CORS). | PASS |
| T1 | reproduce author's numbers | `tsc --noEmit` exit 0. On an LF `git archive` copy: **176 tests, 175 pass**. The one failure is `repo-reply` "real git repo", which needs a git checkout and passes in the worktree. `ui-mount.test.ts` 6/6. In the CRLF worktree, `hub-key.test.ts` cannot load (SyntaxError: its script's shebang line gets `\r\n`), **on `cef7517` too**, so that is this host, not the candidate. Rivet's "176 passed" is reproduced as 176 run; the split is explained. | PASS |
| M | each mutant caught | M1 (seed `from: "alice"`): B3 fails. The hub refused the post, so no message was stored. M1b (seed `from: picked[0]`, a participant): B3 fails with message 1 `from: "qa-l4a"`. M2 (hub hard-coded to :4620): A3 fails. M3 (keyless whoami): B1 fails. M4 (fixed extra peer): B4 fails. M5 (vite base `/`): A1 fails, assets 404 and nothing mounts. M6 (`UI_PREFIX = "/"`, hub side): C1 fails, `GET /` goes 404 to 200. M7 (planted key in source): K counts 1 in the mutant bundle. Every client mutant was built from a scratch copy, its edit shown to land, and the source restored byte-identical. M6's `ui.js` was restored from the builder output, and all of `app/dist` re-hashed equal. `runs/mut-check.log` | 8/8 caught |
| RG1 | agent path | The candidate's unchanged `hub-talk.mjs` against :4610: `--init-key` ×2 rc 0; whoami resolves each; `--say`; `--wait` delivered the turn, rc 0; reply, and `--inbox` shows it; senders in order, parsed; read receipts recorded for both. | PASS |

**C1's named normalisations.** These are the fields R treats as volatile:
- numbers under time and latency keys (`latencyMs` on `/health`);
- `[Request ID: …]` in Convex 500 strings;
- the hub's own port, in the agent-card `url`;
- the replay directory name inside Express's HTML error pages for malformed JSON (old and new run
  from different directories).

The first C1 pass, without them, showed exactly these 15 and 12 differences
(`runs/rows-ac-1.log`), and nothing else.

## Findings

No finding blocks acceptance. Each is an observation, not a diagnosis.

- **O1: a missing file under `/ui/` returns Express's development error page, including the
  absolute path of the served directory.** `GET /ui/does-not-exist` gives 404 `text/html`, and the
  body reads `Error: ENOENT: no such file or directory, stat '<absolute path>\client\dist\does-not-exist'`
  (seen by `c1-diff.mjs` on :4610 at about 02:14Z with the path redacted, and not saved to a run
  log; `rows-ac` logs its shape as `stackTrace:true, bytes:346`). The same class already exists on `cef7517`: a malformed JSON
  body returns a `SyntaxError` page with a stack trace (identical old and new, in C1). Neither
  `docker-compose.yml` nor the Dockerfile sets `NODE_ENV` (grep, `cef7517`). So on tcm I expect
  `/app/client/dist/...` to appear in this 404 too; that is **not observed**. The new surface is
  `/ui/*`, reachable without a key.
- **O2 (G3, recorded as ruled):** the key is kept in `localStorage` on an `http://` origin.
  Clearing the key box does not remove it: the page writes storage only when the key is non-empty
  (`App.svelte:19-22`, static read, **not exercised**). So a cleared key comes back on reload.
- **O3: host, not candidate.** On this machine (`core.autocrlf=true`), `tests/hub-key.test.ts`
  fails to load in any worktree, `cef7517` included. The shebang line of `scripts/hub-key.mjs`
  checks out as CRLF. `hub-key.mjs` and `hub-talk.mjs` themselves ran fine under `node`.

## What could not be verified

- **The image.** That covers `docker inspect`, `.dockerignore`'s effect on a real `docker build`,
  alpine vs Windows output, and a `docker save` key scan. These are PB1 to PB3, on tcm, before the
  swap.
- **tcm:** the tailnet address, and the page served by tcm (PD, after the swap, on Aaron's word).
- **Aaron's Chrome** and the clipboard path (`hub-key.mjs copy`, then paste): W ran headless.
- **Keys from the first two A/C1 runs** (6 scratch keys) were not recorded before K's key log
  existed, so D could search only for the 11 recorded ones. They went only to the scratch hubs, as
  headers and register bodies.
- **Liveness on tcm** for SIA's seats between turns (ruling 1's note). B4 and B5 used scratch
  heartbeats.

## What these checks cannot see

- **T-058:** the hub still accepts any `from` under any key (M1b shows the hub storing a
  participant's name under aaron's key). B proves only that **this page** posts as `me`.
- **Browsers other than Chromium,** and the page on a real network path with latency.

## Regressions confirmed

- Every API route, byte for byte after the named normalisations, in warn and strict (C1).
- The agent path through `hub-talk` (RG1).
- The dev-server client against a local hub, with CORS (E1).
- Keyless 401s, and strict-mode 403 for an unknown key (C1, B6).

## Addendum: PB and PD on tcm (T-003 deploy act, 2026-09-25)

**Authority:** Aaron's "yes" to the deploy act, recorded in `docs/loops/t-003-cutover-log.md:81`
(`docs/session-17-b`). Access was `ssh melvenac@tcm` from this seat's own key. Every tcm command was
read-only. Scripts: `loop-4-qa/pb.sh` and `loop-4-qa/pd.mjs`. Logs: `runs/pb.log`, `runs/pd.log`, and
`runs/pb-run1-void.log`.

**PB: PASS** on `sha256:648ac3963dd7c0b7a7629defa6fdb4b09ed2c145bd24274878ec9cb2c0d059ac`
(a2a-hub:latest, built by Rivet from `c4d2d1c`), run 04:11:18Z to 04:13:14Z, before the swap.
- **PB0:** the ID matches Rivet's.
- **PB1:** Cmd `["node","dist/src/index.js"]`, Entrypoint `["docker-entrypoint.sh"]`, ExposedPorts
  `{"4000/tcp":{}}`, WorkingDir `/app`. All four are identical to `a2a-hub:prev`.
- **PB2:** `/app/client` holds `[dist]` only; there is no `node_modules` or `src` under it; `dist`
  holds `[assets, index.html]`. It ran in `docker run --rm --network none` with the CMD overridden
  and no env, mounts or name. Afterwards `docker ps -a --filter ancestor=<id>` returned 0 rows. The
  same filter did see the running container from `prev`, which was the detector positive.
- **PB3:** K's selftest passed first: a planted key; a planted key inside a **gzip layer**; a
  zstd-framed file refused as opaque. `docker save`, streamed to local scratch (Relay's
  modification: nothing written on tcm), was 261,085,184 bytes, 22,770 tar members and **125 gzip
  layers opened**. Result: 0 opaque, 0 hits.
- **Cleanup:** the local save was deleted and its absence read back; tcm's `~` and `/tmp` hold no
  QA-named file.
- **Run 1 (04:10:39Z) is void. It failed because of my instrument, not the image:**
  - tcm's remote shell split PB1's format string;
  - the container read-back hit the same quoting bug, errored, and still printed "0". That was a
    fail-open, and the check now fails closed with a detector positive;
  - K's path did not resolve under `MSYS_NO_PATHCONV`.

**PD: PASS** at 04:15:05Z, after the swap (Rivet: running `648ac3963dd7`, `AUTH_MODE=warn`).
These were four GETs to `http://100.124.212.87:4000`, none with a key header:
- `/ui/`: 200, `text/html`, `no-cache`.
- `/ui/assets/index-BDybZYJ0.js`: 200, `immutable`, 55,537 bytes. **This is the same content-hashed
  file name as the local replay build, so the bundle built on tcm is the one A to E evaluated.**
- `/`: 404.
- `/health`: 200, keys `[agent, convex, status]`, status ok, convex ok.

**Still not observed on tcm:** O1's path disclosure on `/ui/<missing>`, because it was not in PD's
four reads. The page with a real key, and `aaron`'s key init, remain Aaron's steps.

**O1 on tcm, observed** at 04:27:25Z, folded into K7 on Aaron's "yes to both", relayed by Relay.
This was one keyless `GET /ui/does-not-exist-o1`. Result: 404, `text/html; charset=utf-8`, 218
bytes. The body is Express's error page, reading `Error: ENOENT: no such file or directory, stat
'/app/client/dist/<x>'`. **It discloses the served directory's absolute path in the container. It
has no stack trace.** The log is `runs/o1-tcm.log`, with the path redacted to its shape. This is
still an observation, not a fix. The sibling class is the malformed-JSON error page, present since
before Loop 4.
