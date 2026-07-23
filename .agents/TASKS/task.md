# Current Sprint

> **Focus:** v2 — chat channel UX & operability (v1 completed in Session 6; next session should confirm this focus or re-prioritize with Aaron)

---

## Active Tasks

1. **Per-agent personas** — give alice/bob real roles via `--persona` (or a persona config); generic assistant answers add no value in demos or real use
2. **`start-stack.ps1`** — one-click launch of Convex + hub + daemons + client in Aaron-owned terminals; CC-launched background processes die silently on this machine
3. **Experience dedup** — `triggerHash` (sha256 of normalized trigger) + `by_triggerHash` index; patch-on-conflict in `experiences.store`
4. **docker-compose profiles** — local (no Traefik, local Convex, :5173 client) + VPS (Traefik, prod URLs); one env-gated build

## Done This Sprint (Session 6)

- [x] **Real-LLM gate PASSED — v1 milestone complete** (alice↔bob on Haiku, DONE convergence, zero human)
- [x] Session extend/reopen (`sessions.extend` + route + client button) — capped conversations resume with transcript intact
- [x] Chat client rebuilt Grok-style: history sidebar, human composer (chat as `aaron`), rename, closed-session visibility
- [x] @mention reply routing, deterministic daemon-side + race fix + DONE punctuation tolerance + label-strip (ADR-007)
- [x] Persona patch: agents know they're peers among humans and agents + mention convention

## Context

Aaron chats with agents at :5173 as the `aaron` peer. `@name` targets one agent; no mention asks the room; agent→agent replies don't cascade in group chats. Hub must currently be launched with `CLASSIFIER_MODEL=claude-haiku-4-5-20251001` (code default 404s). Gate scripts: `demo-loop.mjs "seed" [turns]`, `verify-client-stack.mjs`, plus the mention matrix in the job tmp dir.

## Success Criteria

- alice and bob answer with distinct, role-appropriate voices
- Stack survives CC session churn (started from Aaron's terminals via one script)
- Sending the same trigger twice creates one `experiences` row
- `docker compose --profile local up` reproduces the hand-started stack
