# Loop 4 design: the chat UI served by tcm's hub (T-061, v1.10.0)

Rivet, 2026-09-24. Draft for Relay's ruling; nothing built yet. Against the brief
`docs/loops/loop-4-ui-on-tcm-brief.md` at `origin/docs/session-17` (0d50771). Line numbers are at
`cef7517` (branch `loop/4-ui` in the Rivet worktree).

## 1. The URL

**`http://100.124.212.87:4000/ui/`**. `/ui` (no slash) redirects to `/ui/`.

Why `/ui/` and not `/`:
- Only one prefix is claimed, and nothing in the API uses it. The API uses `/health`,
  `/.well-known/agent-card.json` and `/a2a/*` (`src/index.ts:119-525`). `/ui` is not a prefix of
  any of them and none of them is a prefix of `/ui`, so preserve 1 holds now and by prefix.
- A static mount at `/` would claim every path where a built file exists, including a future
  `assets/` or `favicon.ico`. `/ui/` keeps what the page owns in one checkable place.
- `/ui` is outside the `/a2a` key guard (`src/index.ts:119`), so the page loads without a key.
  That is required, because the page starts keyless.
- `GET /` stays the 404 it is today. A redirect from `/` to `/ui/` would be a friendlier entry
  point, but it changes a response. I'm not doing it without a ruling (Q3).

## 2. Mechanism

**Build.** The Dockerfile gets a third stage. Nothing changes in how the image is run, and
`scripts/deploy.sh` needs no change, because its `docker build` picks the stage up.

```
FROM node:20-alpine AS client
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build            # vite build -> /client/dist, base "/ui/"
...
# final stage, after the existing COPYs:
COPY --from=client /client/dist ./client/dist
```

`CMD ["node", "dist/src/index.js"]` and `EXPOSE 4000` are unchanged (preserve 4). There is no
new port, container or compose change, and T-057 still owns the compose file.

`.dockerignore` gains `**/node_modules` and `client/dist`. Today its `node_modules` line only
matches the root one. Without the fix, `COPY client/` would bring the Windows
`client/node_modules` over the Linux one installed by `npm ci`.

**Vite.** `client/vite.config.js` sets `base: "/ui/"` for `build` only. The dev server keeps
`/` on :5173 (preserve 5, E).

**Serve.** A new `src/ui.ts` exports `mountUi(app, dir)`. It is called from `src/index.ts` after
the API routes and before `listen`.
- `app.use("/ui", express.static(dir, { index: "index.html", fallthrough: false }))`
  - `fallthrough: false` makes a missing file under `/ui/` return 404 and never fall through to
    anything else.
- Cache headers:
  - `index.html` gets `Cache-Control: no-cache`, so a redeploy is picked up.
  - `/ui/assets/*` are content-hashed, so they get `max-age=31536000, immutable`.
- `dir` is `process.env.UI_DIR ?? "client/dist"`, resolved against the cwd. That is `/app` in
  the image and the repo root under `npm run dev`.
- If `dir/index.html` is missing, nothing is mounted and one log line says so. `/ui/` is then
  the 404 it is today, and a hub built without the client behaves exactly like v1.9.0.
- CORS middleware (`src/index.ts:26-32`) is untouched (preserve 5). It also stamps
  `Access-Control-Allow-Origin: *` on `/ui` responses. That is harmless, and I'm not adding an
  exception for it.

## 3. Same-origin default hub

`client/src/App.svelte:7` becomes:
- `import.meta.env.DEV ? "http://127.0.0.1:4000" : window.location.origin`

When the hub serves the page, the default hub is the page's own origin, so no address is typed
by hand. The dev server keeps today's default. The connection box stays editable in both. The
page loads nothing from any other origin: `client/index.html` has no external resources and the
styles are inline in `App.svelte`. A1 checks this in the network log.

## 4. Identity: post only as the key's own name

`const HUMAN = "aaron"` (`App.svelte:6`) goes. The name comes from the hub, via the existing
read-only `GET /a2a/whoami` (`src/index.ts:349`, `src/keys.ts:123`), which returns
`{ name: req.agentName ?? null }`.

Page states:
- **No key.** It calls `/health` (unauthenticated, as today) and nothing else under `/a2a`. It
  shows "paste a key" and opens the connection box. The brief's "without a key it shows the 401
  state and sends nothing else" is met by sending nothing; alternatively the page sends exactly
  one `whoami` and shows its 401. I propose sending nothing, because it is quieter and easier to
  check (Q4).
- **Key present.** It calls `whoami` once.
  - 401 or 403: it shows that error and stops.
  - `{name: null}`, which is warn mode with an unknown key (`src/auth.ts:103`): it shows "key not
    recognised by this hub" and stops. It never posts as a guessed name.
  - A name: it becomes `me`. Sessions load, and every post uses `from: me`.
- **Key changed.** It calls `whoami` again, then resets the sessions, the open room and `me`.

Every `from` the page sends is `me`: the composer (`:188`) and the new-chat first message (§5).
There is no other `from` in the file after the repair. The hub still does not check that `from`
matches the key (`src/index.ts:377-393`). That is T-058 and out of scope, so the fix is
client-side by construction.

The localStorage slot name `a2a-hub:aaron-key` (`:12`) stays. Storage is per origin, so the tcm
page and the :5173 page never share it. The name only labels the slot.

## 5. New chats: peers from the hub

The source is **`GET /a2a/agents/live`** (`src/index.ts:295-337`), called with no `kind` filter.
It returns the agents that are status `online` and seen within 45 s
(`convex/instanceLogic.ts:6`). Humans are already excluded (`convex/agents.ts:394`). The page
drops `me` and `hub` from that list.

Replacing `:153`, `:285-287` and the seed form `:290-294`:
- **One "new chat" panel.** It has a checkbox per live agent (its name, plus its `kind` when it
  has one, e.g. `ide-session`), an optional first message, max turns, and a Start button.
- **Start** creates a session with participants `[me, ...picked]`. If there is a first message,
  it posts it `from: me`. That first message is the seed post B checks.
- **Refresh.** The list reloads when the panel opens, and there is a ↻ button. It does not poll.
- **No live agents.** It shows "no agents are live on this hub".

**What is lost.** The hands-off agent↔agent demo (`startDemo`, `:143-173`) goes. Its whole point
is a first post from someone other than the key's owner, and the brief rules that out. A demo
between two agents with the human in the room is still possible through the new panel. (Q1)

## 6. Other cast assumptions removed

- `roleOf` (`:267-271`) and `.entry.alice` / `.entry.bob` (`:488-489`) become `me` and "agent".
  Agents get a colour chosen by their position in the session's participant list, from a
  fixed four-colour palette.
- The comment at `:138` and the placeholder at `:291` go with the demo (§5).

After the repair, `git grep -niE "alice|bob" -- client/src` finds nothing. On `cef7517` it finds
11 lines, all in `App.svelte` (`:138`, `:153`, `:162`, `:269`, `:270`, `:285`, `:286`, `:287`,
`:291`, `:488`, `:489`), which validates the search (B).

## 7. Preserve checks, and how I'll show them

| Preserve | Check |
|---|---|
| 1 routes | Old image (cef7517) and new image run against the same scratch Convex. Every API route (the Loop 3 skew list), with and without a key, gets identical status and body. `/ui/*` is new, `/ui` is not a prefix of any API route, and `GET /` is still 404 on both. |
| 2 hub-talk | `git diff cef7517 -- scripts/hub-talk.mjs` is empty. |
| 3 convex | `git diff cef7517 -- convex/` is empty. No codegen is needed, because no Convex API is touched. |
| 4 image | Same CMD. `docker inspect` shows only 4000 exposed. `docker-compose.yml` diff is empty. |
| 5 CORS/dev | The CORS block diff is empty. `npm run dev` in `client/` loads against a local hub (E). |
| 6 keys | Plant a known fake key in a scratch build, confirm the search finds it, then run the same search over `client/dist` and `docker save` of the image, which must find nothing (D). The search covers key-file shapes and `X-Agent-Key` values, not the header name. |

**Tests.**
- `tests/ui-mount.test.ts` (vitest, supertest-free). It uses `http` against an ephemeral
  `express()` with `mountUi` and checks:
  - `/ui/` serves index.html, and `/ui` redirects.
  - A missing `/ui/x` is 404.
  - A missing dir means no mount.
  - `/health`-shaped routes registered beside it are untouched.
- The client changes are checked in a browser (Claude-in-Chrome) against a scratch hub:
  - with a scratch `aaron` key
  - with no key
  - with a warn-mode unknown key

**Scratch stack.** It runs from this worktree only:
- Convex on pinned ports, using `--local-cloud-port` and `--local-site-port`, clear of
  3210/3211.
- The hub on a spare port, set by `PORT`.
- Nothing touches `~/Projects/A2A-Hub`, its `.convex`, or tcm.

## 8. Ruling

Relay approved this design to build in `docs/loops/loop-4-ruling-1.md` (`origin/docs/session-17`,
f13858a). Q1 through Q4 were ruled as recommended below. One binding addition:

- **R-L.** The new-chat panel says plainly that it lists only agents seen in the last 45 s.
  Existing sessions stay listed and joinable whoever is live. With no live agents, the panel says
  so and the session list still loads.

## 9. Questions put for the ruling (as asked)

- **Q1.** Drop the hands-off agent↔agent demo, replaced by the new-chat panel with an optional
  first message sent as `me`? (Recommended: yes. There is no way to keep it and post only as the
  key's name.)
- **Q2.** Peer source is `/a2a/agents/live`, all kinds, minus `me` and `hub`, so only agents
  live within 45 s are offered. Offering offline registered agents would need a new route or
  Convex query, and preserve 3 rules that out. (Recommended: live only.)
- **Q3.** URL is `/ui/`, with `GET /` left as today's 404. (Recommended.) The alternative is a
  `GET /` to `/ui/` redirect, which changes one response that is not an API route.
- **Q4.** With no key, the page sends nothing under `/a2a` and shows the key-needed state.
  (Recommended.) The alternative is one `whoami` call and showing its 401.
