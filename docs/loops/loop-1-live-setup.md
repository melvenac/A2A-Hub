# Loop 1 — running the candidate against an isolated live stack

**Author:** developer seat (Rivet), session 16, 2026-09-23. **For:** Gauge, running A1–A7 in
a2a-qa. These are the steps I used for implementation-time evidence in a2a-rivet. Your acceptance
must use your own instruments. The hazards below are the ways mine were wrong before I fixed them.

## Never touch the main stack

- **Convex 3210/3211 and hub 4000 belong to the main checkout** (`~/Projects/A2A-Hub`, anonymous
  deployment `anonymous-A2A-Hub`, state in that checkout's `.convex/local/`). Do not copy its
  `.env.local`, and do not point `convex dev`/`deploy`/`run` at it.
- **The hub falls back to `http://127.0.0.1:3210` when `CONVEX_URL` is unset** (`src/index.ts:35`).
  Set it explicitly on every start.
- **Check that a port is free before binding it, then check who holds it.** `app.listen` logs
  "Hub running on port N" even when N is taken, and the process exits 0 (Gauge's finding,
  baseline behaviour). Confirm the listener PID is yours:
  `netstat -ano | grep LISTENING | grep ":<port> "`.
- Kill a hub by its **node PID tree** (`taskkill //F //T //PID <pid>`), not by closing a window.

## 1. An isolated Convex backend

From the QA tree, on ports nobody else uses (I used 3310/3311; pick others):

```bash
CONVEX_AGENT_MODE=anonymous npx convex dev --local \
  --local-cloud-port <cport> --local-site-port <cport+1> --tail-logs disable
```

Leave it running; it watches and re-pushes. The first push creates `.env.local` (gitignored) with
`CONVEX_URL=http://127.0.0.1:<cport>` and a fresh deployment whose state lives in **this tree's**
`.convex/local/`. Check that the push listed every index as `[+]` (new), which proves it isn't
an existing database. `convex dev` also regenerates `convex/_generated/*`. Apart from `api.d.ts`,
the changes are line endings only; `git checkout --` them before any commit. It also writes an
untracked `convex/tsconfig.json`.

## 2. The candidate hub

```bash
PORT=<hport> CONVEX_URL=http://127.0.0.1:<cport> npx tsx src/index.ts
```

Then `GET http://127.0.0.1:<hport>/health` must return `"convex":{"status":"ok"}`.

## 3. The skew rows (A4)

- **Old code:** `git worktree add --detach <scratch>/old 2eb7928`, then junction its `node_modules`
  to the QA tree's (`cmd //c mklink //J <old>\node_modules <qa>\node_modules`).
- **Old Convex:** step 1 run inside `<old>` on a second port pair. It gets its own deployment.
- **Old app:** step 2 run inside `<old>`. You need three hubs:
  - app old → Convex new (the safe deploy order)
  - app old → Convex old (both halves old)
  - app new → Convex old (the wrong order)
- **Old client:** `<old>/scripts/hub-talk.mjs`.
- **Remove it afterwards** with `git worktree remove --force <old>`. The junction goes with it,
  and so does the old deployment's state, which lives in that tree.

## 4. Instrument hazards I hit (each made a check pass that could not fail)

- **`agents:getByName` returns only `{name, apiKeyHash, askPolicy}`.** It cannot see the
  `agentCard`, `lastSeen` or `status` that a restored `register(PEER)` rewrites, and under the
  shared dev-key the hash does not change either. So an A5 check built on it passes against the
  mutant. Read whole rows (`agents:listOnline`, filtered by name, exactly one row). Also assert the
  distinctive card was seen **before** the call.
- **A3 under the shared dev-key cannot see the realistic mutant.** A GET handler that marks read
  "for the caller" uses `req.agentName`, which under a shared key resolves to whichever agent row
  matches the hash first. That is usually not a participant, so the mark 404s silently and
  `/reads` never moves. **Give each seat its own key** (register A and B with distinct `apiKey`s,
  and run each seat's `hub-talk` with its own `AGENT_KEY`). Then issue the non-reader fetches with
  B's key as well as the dev-key. With per-seat keys, both mutant forms were killed: "mark the
  caller" and "mark every participant".
- **`cmd.exe` strips the quotes from a JSON argument.** `npx convex run agents:getByName
  '{"name":"x"}'` through a shell arrives as `{name:x}` and fails. Call
  `node node_modules/convex/bin/main.js run <fn> <json>` with an args array and no shell.
- `hub-talk` registers `--as` on every call **with its `AGENT_KEY`**. A seat run without its own
  key re-registers itself under the dev-key.

## What I observed (evidence, not acceptance)

Candidate at the SHA named in my report to Relay; the hub on 4100, backed by Convex 3310.

- **A1, A2, A3, A5 and the `markRead` guards:** 31/31 checks passed, read from `GET /reads`.
- **A5 mutant** (`register(PEER)` restored, in `hub-talk`): 6 checks fail. B's card becomes
  `kind: "ide-session"`, and the unregistered peer gets rows and a room with a delivered turn.
- **A3 mutants** (a GET that marks read, in `src/index.ts`, `tsc`-clean): both forms fail 6 checks.
- **A4:** six combinations were run. New client against the new hub, against app old/Convex new,
  against both old, and against app new/Convex old. Old client against both old, and against the
  new hub. All six gave identical exit codes and stdout. The new client reports receipts as
  unavailable on a single stderr line (404 or 500). The old client on the new hub leaves B
  "never read" (L4).
