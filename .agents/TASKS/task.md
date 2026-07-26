# Current Sprint

> **Focus:** v2 — Session 7's work is verified and shipped; next is the two live bugs, then registration DX

---

## Active Tasks

1. **Push v1.5.0 + v1.5.1** — `git push origin master --tags`. Both are committed and annotated-tagged locally; nothing has left the machine
2. **Fix `@`-parsing over-match** (`daemon.ts:165`) — treat `@word` as routing only when it matches a session participant. `peerNames` is already built at line 187 for label-stripping; reuse it. Add a regression test with `@anthropic-ai/sdk` in the body
3. **Fix stale turn counter** (`App.svelte:77`) — `openSession`'s poll updates `transcript` but never `activeSession`, so the cap indicator freezes. Header can render `transcript.length` for free; sidebar needs `loadSessions()` on a throttle (~every 5th poll)
4. **`scripts/register-agent.mjs`** — wrap register → heartbeat → open-or-reuse session → send → poll for reply. Doubles as the missing smoke test for the registration path
5. **Experience dedup** — `triggerHash` (sha256 of normalized trigger) + `by_triggerHash` index; patch-on-conflict in `experiences.store`
6. **docker-compose profiles** — local (no Traefik, local Convex, :5173 client) + VPS (Traefik, prod URLs); one env-gated build

## Done This Sprint (Session 8)

- [x] **Ran `start-stack.ps1` end-to-end** — cleared a 3-day-stale stack first (Convex backend dead under a live hub), then cold-started clean; `verify-client-stack` 5/5, exit 0
- [x] **Persona demo passed** — `--print-persona` confirmed per-agent composition; live loop converged with DONE in 2 turns, bob in mentor character verbatim
- [x] **Shipped v1.5.0** (`44f647e`) — six fixes: client readiness wait, dual-family port probe, verify-script timeouts, corrected round-trip assertion, `/health` Convex probe, client honors degraded health
- [x] **Shipped v1.5.1** (`e90d461`) — `REPO_FIXER_MODEL` pointed at a model retired 2026-06-15; every `draftFix` would have thrown
- [x] **Dead `ANTHROPIC_API_KEY` replaced** — confirmed `401` on the old key, `200` on the new one
- [x] **Agent registration verified** — hand-registered `scout` completed the full flow against alice and bob

## Context

Aaron chats with agents at :5173 as the `aaron` peer. `@name` targets one agent; no mention asks the room; agent→agent replies don't cascade in group chats. Launch: `powershell.exe -ExecutionPolicy Bypass -File start-stack.ps1` (from Git Bash) — no env vars needed. Gate scripts: `demo-loop.mjs "seed" [turns]`, `verify-client-stack.mjs`.

**Registering an agent by hand:** `POST /a2a/register` with `{name, apiKey, agentCard}` and **no** auth header; everything after needs `X-Agent-Key` (any non-empty value — it is never validated). Send body is `{from, content}`; read shape is `{from, fromType, content, createdAt}`. A registered peer is typed `agent`, so in *group* sessions it must use `@name` to get a reply (ADR-007 no-cascade); in a 2-participant session, unaddressed messages always get answered.

## Success Criteria

- A message containing `@anthropic-ai/sdk` does not suppress replies (task 2)
- The turn counter tracks the transcript live without a manual refresh (task 3)
- `node scripts/register-agent.mjs <name> --say "..." --to alice` registers and returns a reply in one command
- Sending the same trigger twice creates one `experiences` row (dedup task)
- `docker compose --profile local up` reproduces the scripted stack (compose task)
