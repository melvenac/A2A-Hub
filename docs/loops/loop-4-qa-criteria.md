# Loop 4: acceptance criteria (Gauge)

**Date:** 2026-09-24 · **Author:** QA seat (Gauge), session 17 · **Status:** criteria, written
before a candidate is named. Nothing has been built or run.

**Derived from:** the brief `docs/loops/loop-4-ui-on-tcm-brief.md` (`origin/docs/session-17`,
`0d50771`), ruling 1 `docs/loops/loop-4-ruling-1.md` (`f13858a`: Q1 to Q4 as recommended, R-L,
B's wording), and Rivet's design `docs/loops/loop-4-ui-on-tcm-design.md` (`origin/loop/4-ui`,
`60a4cff`), **design text only**. Code references are to `cef7517`.

**Baseline ("old"):** `cef7517` (master, v1.9.0). **Candidate:** named by Relay as a verdict SHA
on `loop/4-ui`. Every observation names that SHA. If it moves mid-evaluation, the run is void and
starts again.

---

## Objections and questions for Relay (read these first)

**G1. There is no Docker on the QA machine** (`docker` not on PATH; WSL not installed; checked
2026-09-24). Condition A says "a fresh image of the candidate", and D says "the image". Neither
can be observed here. What I can observe:

- (a) **Stage replay.** In a `git archive` copy of the candidate, run the Dockerfile's steps by
  hand into an `/app`-shaped scratch dir: `npm ci`, `vite build` in `client/`, `tsc` plus the
  `_generated` copy, `npm ci --production`, and the final stage's COPYs. Then start it with the
  image's own CMD (`node dist/src/index.js`) and cwd, so `UI_DIR` defaults as it would in the image.
- (b) **Static read** of the Dockerfile and `.dockerignore` diff against the design §2.

This is **not the image**. It cannot see: `.dockerignore` actually excluding
`client/node_modules`, alpine vs Windows differences in `npm ci`/vite output, and `docker
inspect`'s CMD and ExposedPorts. I propose the rows below are labelled **"replay, not image"**, and
that the real image is checked by **PD** (below) after the deploy act's `docker build` on tcm,
read-only, on Aaron's word. The alternative is a Docker host for QA, which is not mine to decide.
**Question: accept (a)+(b)+PD, or name a Docker host?**

**G2. E would touch the main stack.** The dev page's default hub is `http://127.0.0.1:4000`, which
is the main stack's port. If the keyless dev page calls `/health` on load (design §4 says it does),
opening it sends one read-only `GET /health` to the main checkout's hub. P1 forbids any contact
with the main stack. I propose E is run only when **4000 is shown free** before the page opens.
If it is taken, E waits, or Relay allows that one read-only request. **Question: which?**

**G3. The key sits in `localStorage` under an `http://` origin on tcm.** That is not "printed,
logged, committed or embedded", so preserve 6 is met as written. I record it as an observation in
the report and do not fail it. I looked for an objection in the brief beyond G1 and G2 and
found none.

---

## 0. Preconditions: before any row counts

Loop 3's P1 to P10 carry over (`docs/loops/loop-3-qa-criteria.md` §0): **isolation** (non-default
ports, explicit `CONVEX_URL`, the hub on a QA port via `PORT`, never 3210/3211/4000), **the
isolation check proves it looked**, **`qa-` names** (plus the literal `aaron` on the throwaway
stack only, P3's H exception), **frozen tree**, **receipts read with a parser**, **P6 no real key**
(every key is scratch; the real `~/.a2a-hub/keys` is listed by name before and after, and the two
listings must match), **P9 log capture**, **P10 stop and prove** around every SIA full stop (a B
Step 0 call from the SIA planner stops everything; kill by PID; `stop-stack.ps1` shows every QA
port free). Added for Loop 4:

- **P11 Browser.** The browser rows use Claude-in-Chrome, which drives **Aaron's real Chrome**.
  Each QA hub gets its own origin (`http://127.0.0.1:<qa-port>`), so its `localStorage` is not
  shared with any real origin. Scratch keys pasted there are cleared at the end of the run, and the
  clearing is read back (`localStorage` empty for that origin). No page is opened on tcm's address
  except under PD.
- **P12 Two hubs, one database.** The old hub (`cef7517`) and the candidate hub run against **the
  same** scratch Convex with candidate functions, which are the same functions if C2 holds. Each
  hub's `/ui/` confirms which is which: old = 404, new = 200.

## Instruments

Each is validated on a known positive before its row counts.

- **H: harness** (`qa/loop-3-harness-keys`, merged in #12). It registers `qa-` agents and scratch
  `aaron` keys, heartbeats agents, seeds sessions, and reads messages back **parsed**.
- **W: browser observer.** Claude-in-Chrome `read_network_requests` and `read_console_messages`,
  plus `read_page` for visible text. **Known positive:** the `cef7517` dev page on :5173 calls a
  hub on another origin. W must report that request as cross-origin before A2's negative counts.
- **G: cast search,** `git grep -niE "alice|bob" -- client/src`. **Validated on `cef7517`:** 11
  lines, all in `App.svelte` (138, 153, 162, 269, 270, 285, 286, 287, 291, 488, 489). Read
  2026-09-24; this matches design §6.
- **R: route comparator,** Loop 3's skew-style old/new comparison. It runs over every route
  `src/index.ts` registers at `cef7517` (20 `app.get`/`app.post` routes: `/health`,
  `/.well-known/agent-card.json` and 18 under `/a2a`; plus the `/a2a/jsonrpc` mount), plus `GET /`, `GET /nope`, `GET /uix`, `GET /ui-x`, and an
  `OPTIONS` preflight. Each runs with no key, a valid key and an unknown key, and bodies are
  compared **parsed**, with volatile fields (timestamps, generated ids) named and normalised.
  **Known positive:** a planted difference (one route pointed at a stub) must be reported.
- **K: key scanner,** Loop 3's `leakscan.mjs`, extended to walk a directory tree **and** the
  inside of tar archives. It counts every scratch key used in the run and every full sha256 of
  one, and prints counts, never values. **Known positive:** a key planted in a scratch copy of
  `client/dist` (in a JS asset and in `index.html`) must be counted before the real scan counts.
- **T: `stop-stack.ps1`,** as in Loop 3, with the new QA ports added (the vite dev port included).
- **M: mutants,** as in Loop 1 and Loop 3. Each lands in a `git archive` copy, is shown to have
  landed, and is served through `UI_DIR` from a mutant build, so no rebuild of the hub is needed.
  It is observed to fire before it is judged.

---

## Rows

For each row the report gives: the requirement, the observation, the tree, the SHA, the time, and
pass or fail. "Replay" marks rows observed on G1(a), not an image.

### A: served page (condition A; ruling Q3)

- **A1 URL (replay).** On the candidate hub:
  - `GET /ui/` returns 200 `text/html`, and the page mounts.
  - `GET /ui` redirects to `/ui/`.
  - `GET /ui/assets/<hashed>` returns 200 with `max-age=31536000, immutable`.
  - `index.html` is `Cache-Control: no-cache`.
  - `GET /ui/does-not-exist` returns 404, and **not** `index.html` (no SPA fallback).
  - `GET /` returns 404, identical to old (Q3).

  Both directions: old hub `GET /ui/` returns 404 on the same Convex.
- **A2 one origin.** On load, keyless and keyed, and through a full B2 flow, W shows **every
  request's origin equals the page's origin**. It also shows zero requests to any other host,
  fonts and CDNs included.
- **A3 default hub follows the origin.** The page is opened as `http://127.0.0.1:<p>/ui/` and again
  as `http://localhost:<p>/ui/`. Each time, the connection box shows **that** origin, and W shows
  requests going to it. This separates "own origin" from a hard-coded address.
- **A4 image shape (replay + static).**
  - The Dockerfile's final stage keeps `CMD ["node", "dist/src/index.js"]` and `EXPOSE 4000` only.
  - `docker-compose.yml` diff against `cef7517` is empty.
  - The replay's `/app/client` holds only `dist/`.
  - The hub listens on one port. W and `Get-NetTCPConnection` on the hub PID show no second
    listener.
  - The `.dockerignore` diff adds `**/node_modules` and `client/dist`.

  **Not observed here (G1):** `docker inspect`, and the effect of `.dockerignore`.
- **A5 no client build, no mount.** A replay with `client/dist` absent starts, logs the one
  "not mounted" line, and `GET /ui/` is the old 404. So a hub built without the client behaves like
  `cef7517` (design §2).

### B: identity and peers (condition B; ruling Q1, Q2, Q4, R-L)

Setup: `qa-l4a` (kind `ide-session`) and `qa-l4b` heartbeat inside 45 s. `qa-l4c` is registered
but last seen more than 45 s ago. The hub's own row and `aaron` (human) are present, as are two
seeded sessions that include `aaron`.

- **B1 no key (Q4).** Cleared storage. The page shows the key-needed state and opens the
  connection box. W shows **zero requests under `/a2a`**. The hub's log agrees: no `/a2a` line for
  the page's requests. Both directions: after a key is pasted, `/a2a/whoami` appears **exactly
  once** before any other `/a2a` call.
- **B2 posts as the key's name.** With a scratch `aaron` key, the session list loads, both seeded
  sessions open, and a composer post is read back by H **parsed**: `from == "aaron"`.
- **B3 seed post.** A new chat with `qa-l4a` picked and a first message. H reads the session back:
  participants are exactly `["aaron", "qa-l4a"]`, and the first message is `from == "aaron"`. Both
  directions: on `cef7517` the same flow's seed is `from: "alice"`. That comes from the static read
  of line 162 and is labelled static.
- **B4 peers = live minus me and hub.** When the panel opens, H takes `GET /a2a/agents/live`
  (parsed) in the same second. The panel's checkboxes equal that set minus `aaron` and `hub`,
  which is `{qa-l4a, qa-l4b}`, and `qa-l4c` is absent. Then `qa-l4b` stops heartbeating, and after
  more than 45 s, ↻ is pressed. The panel equals a fresh `agents/live` minus me and hub, which is
  `{qa-l4a}`. Then `qa-l4c` heartbeats and ↻ adds it. **Nothing is offered that the route did not
  return.**
- **B5 R-L.** The panel's visible text states that it lists only agents seen in the last 45 s.
  With every `qa-` agent stale, the panel says no agents are live. The session list **still
  loads**, and an existing session opens and takes a post read back as `from == "aaron"`.
- **B6 unrecognised key.** On a warn-mode hub, an unknown key makes whoami return `{name: null}`,
  and the page shows "not recognised". On a strict-mode hub, the unknown key returns 403 and the
  page shows it. In both cases W shows **no POST under `/a2a`**, and the page offers no composer
  that posts.
- **B7 key change.** The `aaron` key is swapped for a scratch `qa-h2` key (registered `human`).
  whoami runs again, and the sessions, the open room and `me` reset. The next post reads back as
  `from == "qa-h2"`, and no later post carries `aaron`.
- **B8 no hard-coded cast.** G on the candidate finds **0** lines (validated at 11 on `cef7517`).
  Sibling search: every `from` in `client/src` is listed, and each is `me`. A search for `aaron` in
  `client/src` finds only the `localStorage` slot name (design §4).
- **B9 demo gone (Q1).** `startDemo` and any path that posts `from` a name other than `me` are
  absent (static). This is covered at run time by B2, B3 and B7.

### C: preserves 1 to 5 (condition C)

- **C1 routes (preserve 1).** R over the full list: old and candidate return identical status and
  parsed body on every API route in all three key states. `GET /`, `/nope`, `/uix` and `/ui-x` are
  identical too, so the `/ui` mount claims no neighbour by prefix. `/ui/*` is the only new
  surface. **Replay**, and old is the `cef7517` hub run from its own replay.
- **C2 Convex (preserve 3).** `git diff cef7517 <cand> -- convex/` is empty. If it is not, only
  `_generated` may differ, and it must be shown content-identical. The Dockerfile's `COPY convex/`
  lines are unchanged. This row gates the fold-into-cutover rule, and the report says so on its own
  line.
- **C3 hub-talk (preserve 2).** `git diff cef7517 <cand> -- scripts/hub-talk.mjs` is empty.
- **C4 CORS (preserve 5).** The CORS block's diff is empty. The `OPTIONS` preflight headers are
  identical old and new (from R). E covers the dev path.

### D: no key material (condition D; preserve 6)

- **D1 bundle and replay.** K, validated on the planted positive, runs over the candidate's
  `client/dist` from the replay and from a local `npm run build`, and over the whole replay `/app`
  tree. It must find 0 of every scratch key and 0 of every hash. The **image** (`docker save`) is
  not scanned here (G1), so that goes to PD's list of what could not be verified.
- **D2 logs and console.** After B1 to B7, K runs over every hub log (P9) and W's console dump. It
  must find 0 keys and 0 hashes. The page's `localStorage` holding the key is recorded as expected
  (G3).
- **D3 source.** K runs over `git archive <cand>`. It must find 0 of the run's keys. Loop 3's `S`
  keyscan over `client/` shows no `dev-key` site was added.

### E: dev server (condition E; preserve 5)

- **E1.** Subject to G2: `npm run dev -- --port <qa-vite-port> --strictPort` in the candidate's
  `client/` loads at `/`. The connection box's default reads `http://127.0.0.1:4000`, which is read
  and not used. It is changed to the QA hub. With a scratch `aaron` key, the session list loads and
  a post reads back `from == "aaron"`. W shows cross-origin requests succeed, so CORS is intact.

### T: the author's numbers

- **T1.** On the candidate, reproduce `npm test` (including `tests/ui-mount.test.ts`) and
  `tsc --noEmit`, with counts. Any number of Rivet's that I have not reproduced is labelled.

### M: mutants (each served via `UI_DIR`, or a replay for the hub-side ones)

| Mutant | Must fail |
|---|---|
| M1 seed post `from: me` changed to `from: "alice"` | B3 |
| M2 default hub hard-coded back to `127.0.0.1:4000` | A3 |
| M3 keyless page sends one `whoami` | B1 |
| M4 panel list not filtered by `agents/live` (adds a fixed name) | B4 |
| M5 vite `base` left as `/` | A1 (assets 404) |
| M6 `mountUi` placed at `/` instead of `/ui` | C1 (`/nope` differs) |
| M7 a planted key string in `App.svelte` | D1 |

### RG: regressions

- **RG1.** Against the candidate hub, the Loop 3 harness smoke runs: register, whoami, send, `--wait`
  delivery, and a read receipt through `hub-talk`, with results parsed. This confirms that
  `mountUi` changed nothing on the agent path. C1 covers responses route by route.

### PD: post-deploy, tcm (only on Aaron's word, read-only, after the deploy act)

This is not part of the verdict. It is proposed here because of G1. From the QA seat, with **no key**
sent to tcm:

- `GET http://100.124.212.87:4000/ui/` returns 200 `text/html`, and one hashed asset returns 200.
- `GET /` returns 404.
- `/health` is unchanged in shape.

Anything that needs a key on tcm waits for `aaron`'s init there, which is Aaron's own act.

---

## What these criteria cannot see

- **The image itself** (G1): `.dockerignore`'s effect, alpine build output, and `docker inspect`.
  PD sees only the result served on tcm.
- **tcm's network:** the tailnet path to `100.124.212.87` and any browser other than Aaron's
  Chrome.
- **T-058:** the hub still accepts any `from` under any key. B proves only that **this page** posts
  as `me`. A modified page, or `curl`, still can post as anyone. That is out of scope by the brief.
- **Liveness on tcm:** B4 and B5 use scratch agents. What SIA's seats look like on tcm between turns
  (ruling 1's note) is not reproduced.
