# Current Sprint

> **Focus:** v2 — local stack polish done (Session 7); verify live, then dedup + compose profiles

---

## Active Tasks

1. **Verify `start-stack.ps1` end-to-end** — Aaron runs it in his own terminal; was mid-verification at Session 7 close (two failure modes already fixed: missing CONVEX_URL, orphaned Convex backend)
2. **Persona demo** — seed an alice↔bob session via the chat client; success = distinct learner-assistant vs mentor voices
3. **Commit + tag v1.5.0** — personas, start-stack, model/URL defaults are uncommitted; run `gitnexus_detect_changes` first, CHANGELOG entry
4. **Experience dedup** — `triggerHash` (sha256 of normalized trigger) + `by_triggerHash` index; patch-on-conflict in `experiences.store`
5. **docker-compose profiles** — local (no Traefik, local Convex, :5173 client) + VPS (Traefik, prod URLs); one env-gated build

## Done This Sprint (Session 7)

- [x] PRD reframed around the real problem: remote CC teaching via agent↔agent (use case 1 drives the roadmap); roadmap reconciled, v1 marked complete
- [x] **Per-agent personas** — `personas/<name>.md` auto-load (or `--persona`/`--persona-file`), composed with hub conventions; alice=learner-assistant, bob=mentor; `--print-persona` debug
- [x] **`start-stack.ps1`** — build + Convex + hub + daemons + client in Aaron-owned windows, readiness waits, idempotent re-runs (skip-if-running per process)
- [x] `CLASSIFIER_MODEL` default → `claude-haiku-4-5-20251001`; `CONVEX_URL` default → `http://127.0.0.1:3210` (both were launch-time tribal knowledge)

## Context

Aaron chats with agents at :5173 as the `aaron` peer. `@name` targets one agent; no mention asks the room; agent→agent replies don't cascade in group chats. Launch: `powershell.exe -ExecutionPolicy Bypass -File start-stack.ps1` (from Git Bash) — no env vars needed anymore. Gate scripts: `demo-loop.mjs "seed" [turns]`, `verify-client-stack.mjs`.

## Success Criteria

- `start-stack.ps1` cold-starts the full stack; re-run starts only what's missing
- alice and bob answer with distinct, role-appropriate voices
- Sending the same trigger twice creates one `experiences` row (dedup task)
- `docker compose --profile local up` reproduces the scripted stack (compose task)
