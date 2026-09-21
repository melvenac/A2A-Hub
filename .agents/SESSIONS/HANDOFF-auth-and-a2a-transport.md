# Handoff — uncommitted auth + spec-transport work in `src/index.ts`

**Status:** unlanded, sitting in the working copy. Not abandoned, not broken — just never committed.
**Found:** 2026-09-20, by the `general` seat while fixing the hub-talk cursor bug.
**Origin:** the session that ended at `d373524` ("Session 11 addendum: close out post-v1.6.1 work, hand off the auth/model experiments").

## Why this file exists

`src/index.ts` carries ~120 changed lines that are **not** part of any committed work, alongside four untracked files. Anyone opening this repo will see a dirty tree and has to work out whether it is live work, junk, or a half-finished experiment. It is none of those: it is two coherent features that were written, left uncommitted, and handed off.

Do not `git checkout` this away without reading it.

## What is in it

**1. Centralized `/a2a` auth** — `src/auth.ts` (untracked)

A `requireAgentKey` middleware guarding the whole `/a2a` prefix, replacing the same check copy-pasted into eleven route handlers. `/register` is exempt, since registration is how an agent obtains a key.

Its own comment records the bug it fixes: the per-route pattern **only tested that the header was present, so a bogus key returned 200**, and a newly added route stayed unguarded until someone remembered to paste the block in.

**2. Spec A2A transport** — `src/task-store.ts`, `src/a2a-executor.ts`, `convex/a2aTasks.ts` (all untracked)

The real Agent2Agent JSON-RPC transport via `@a2a-js/sdk/server`: `DefaultRequestHandler` + `jsonRpcHandler`, backed by a `ConvexTaskStore` and `HubAgentExecutor`. Mounted on its own path, additively — the legacy `/a2a/<name>` routes keep working and retire only once the daemons and chat client speak JSON-RPC.

Also untracked: `scripts/a2a-compliance-probe.mjs`.

## Open security question this blocks

The hub accepts the literal default `X-Agent-Key: dev-key`, and `AUTH_MODE` defaults to WARN (unknown keys are logged and allowed). On the tailnet IP that means **anyone on the tailnet can read every room**. Aaron was told on 2026-09-20 and chose to leave it for now.

The fix is largely this uncommitted work plus `AUTH_MODE=strict` and a real key. The cost is not "build auth" — it is "land auth".

## One line that is mine, not theirs

`src/index.ts` also holds a 2-line passthrough I added for `GET /a2a/session/:id/messages?after=<turn>`, wiring the turn-indexed cursor through to `convex/messages.ts`:

```ts
const after = req.query.after !== undefined ? Number(req.query.after) : undefined;
// …passed to api.messages.list as: after: Number.isFinite(after!) ? after : undefined
```

It sits in the same hunk as the auth deletion, so it could not be staged separately. It is **not required** — `scripts/hub-cursor.mjs` derives turn from position when the hub does not send one, which is why the cursor fix works against the un-redeployed hub. Landing it only moves filtering server-side. Whoever commits this route should take it along.

## Sequencing

Long-poll (`?since=N&wait=<seconds>`, cap 600) was specified and deliberately deferred: every seat already wakes on process exit at a 2–3s poll, so long-poll is load reduction, not correctness. It touches this same route, so it should ride on whatever commit lands it.

Order when someone picks this up:

1. Read and test the auth middleware; confirm a bogus key is now rejected, not just a missing one
2. Land it with the 2-line `after` passthrough
3. `AUTH_MODE=strict` + a real key — needs a redeploy on tcm
4. Long-poll on top
5. Retire the legacy routes only once the clients speak JSON-RPC

Redeploy is Atlas's, not a seat's: tar to `~/projects/a2a-hub`, docker build, `compose up -d --force-recreate a2a-hub`. The `Dockerfile` fix (`54d35e1`) must travel with it or the image crashes at import.
