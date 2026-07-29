# Current Sprint

> **Focus:** v2 — repo-resident peers ship in v1.6.0; next is on-demand spawn so a peer doesn't have to be running to answer

---

## Active Tasks

1. **On-demand spawn** — hub receives a message for a repo peer with no live daemon → launches a headless agent rooted at that repo, gets the answer, lets it exit. Zero idle cost, and the piece that actually retires the file mailbox instead of out-competing it
2. **Git history for repo peers** — a repo expert should be best at "when did this change and why", but Bash is denied by default. A scoped `Bash(git log *)` / `Bash(git show *)` allow rule keeps the trust boundary while unblocking it
3. **Experience dedup** — `triggerHash` (sha256 of normalized trigger) + `by_triggerHash` index; patch-on-conflict in `experiences.store`
4. **docker-compose profiles** — local (no Traefik, local Convex, :5173 client) + VPS (Traefik, prod URLs); one env-gated build

## Done This Sprint (Session 11)

- [x] **Repo-resident peers** (ADR-010) — `--repo <path>` swaps reply generation for a Claude Agent SDK session rooted in that repo, at the daemon's single existing seam. Read-only by default; `--repo-bash` opts in
- [x] **`scripts/ask-agent.mjs`** — the entrance from a live coding session (subsumes most of the old `register-agent.mjs` task: register → session → send → poll is the same flow)
- [x] **Verified live cross-repo** — asked the `gitnexus` peer about the `.gitnexus\lbug` lock; 43s, four `file:line` citations, all four checked verbatim against the repo. It diagnosed the re-index failure that blocked Sessions 8-9 here
- [x] **Read the Agent SDK's real API rather than recalling it** — `allowedTools` does not restrict (only auto-approves), so read-only had to be built on `disallowedTools`. Getting this from the docs instead of memory is the reason the peer isn't write-capable by accident

## Done Previously (Session 10)

- [x] **Re-indexed GitNexus** — 443 symbols / 600 relationships / 3 flows; the `.gitnexus\lbug` lock that blocked Sessions 8-9 did not recur
- [x] **Fixed `@`-parsing over-match** — gating extracted to `src/wrapper/mentions.ts` and gated on session participants; 11 unit cases in `tests/mentions.test.ts`, mutation-verified (removing the participant filter fails 3 of them), then confirmed live in a 3-participant session
- [x] **Fixed stale turn counter** — header reads the live count off `transcript`; poll re-lists sessions every 5th tick so the sidebar and live/closed flag track
- [x] **Shipped v1.5.2** — full suite 22/22, `verify-client-stack` 5/5 with a real model reply

## Done Previously (Session 8)

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

- [x] A message containing `@anthropic-ai/sdk` does not suppress replies — live: alice and bob both answered
- [x] The turn counter tracks the transcript live without a manual refresh
- [x] `node scripts/ask-agent.mjs <peer> "question"` returns a grounded answer from that peer's repo in one command
- A message for a repo peer that isn't running still gets answered (on-demand spawn)
- Sending the same trigger twice creates one `experiences` row (dedup task)
- `docker compose --profile local up` reproduces the scripted stack (compose task)
