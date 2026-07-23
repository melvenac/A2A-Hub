# Session 6 — 2026-07-23

> **Objective:** Real-LLM gate run, then grow the client into a usable chat channel (history, human participation, @mention routing)
> **Status:** Completed

---

## Pre-Session Checklist

- [x] Read SUMMARY.md
- [x] Read INBOX.md
- [x] Read ENTITIES.md (if schema work planned) — n/a, no schema change
- [x] Read relevant skills (if applicable)
- [x] Run pre-session validation (if configured)

---

## Objective & Plan

**Goal:** Prove the autonomous loop with real LLM replies, then make conversations observable and steerable from the browser.

**Approach:**
1. Load `ANTHROPIC_API_KEY` via `node --env-file=.env` (no dotenv anywhere), restart stack → run gate
2. Add browser visibility: session viewer → full Grok-style history + human composer
3. Add control: session extend/reopen, @mention reply routing (plan-mode approved)

**User Approval:** [x] Approved (extend + chat UI built on Aaron's feature requests; mentions via approved plan)

---

## Work Log

### What Was Done
- **Real-LLM gate PASSED** (v1 milestone complete): alice↔bob, 7 turns, Haiku both sides, DONE convergence, zero human after seed
- Classifier model fixed at runtime: default `claude-sonnet-4-20250514` 404s on this key → run hub with `CLASSIFIER_MODEL=claude-haiku-4-5-20251001`
- `scripts/demo-loop.mjs`: seed message + maxTurns now CLI args; watch window scales with turns
- **Session extend** (`sessions.extend` + `POST /a2a/session/:id/extend`): adds turns and reopens cap-closed sessions; proven live — a capped interview resumed mid-thought
- **Chat client rebuilt Grok-style** (`client/src/App.svelte`): date-grouped history sidebar (all sessions via new `sessions.listAll` + `GET /a2a/sessions`), rename (`sessions.rename` + route), transcript viewer, human composer (send as `aaron` peer), extend button, agent↔agent seed row
- **@mention routing** (approved plan): deterministic daemon gating — mentions target agents; no-mention = ask-the-room; group sessions don't cascade agent→agent replies; `@alice`/`@bob` chips in composer
- Daemon fixes found by testing: failed sends no longer marked as replied (extend-resume works); capped sessions skipped before LLM spend; **first-responder race** fixed (gate on newest message addressed to *me*, not newest overall); DONE detection tolerant of punctuation/markdown (`DONE.`, `**DONE**`); transcript speaker labels + deterministic strip of mimicked labels
- Persona patch: agents know they're hub peers among humans *and* agents, and the @name convention (fixes the "you must be the human" loop)
- Verification: mention matrix 4/4, demo-loop converges, vitest 11/11, client compiles

### Files Modified
- `src/wrapper/daemon.ts` — mention gating, race fix, DONE tolerance, label strip, persona
- `src/index.ts` — routes: sessions list, rename, extend; includeClosed passthrough
- `convex/sessions.ts` — `extend`, `listAll`, `rename`, `listForPeer` participants + includeClosed
- `convex/messages.ts` — `fromType` on listed messages
- `client/src/App.svelte` — full chat UI rebuild
- `scripts/demo-loop.mjs` — CLI args, tolerant DONE regex

### Files Created
- (none in repo; verification scripts live in the job tmp dir)

---

## Gotchas & Lessons Learned

- **TaskStop orphans strike again**: old fallback daemons survived a stop and answered the first real-LLM gate run. Always sweep `wrapper.daemon` processes (`Get-CimInstance ... -match 'wrapper.daemon'`) before restarting.
- **Background-launched processes died silently twice** (hub, daemons, vite — no crash logs). If the client header says "hub: unreachable", restart the stack; consider a `start-stack.ps1` owned by Aaron's own terminal.
- **Gating on "the last message" is racy in group chats**: the first agent to answer flips the last-message identity and mutes everyone else. Gate on "newest message addressed to me that I haven't answered."
- **Sentinel tokens leak**: `DONE` in ordinary prose ("please don't say DONE.") terminates conversations once detection tolerates punctuation. A structured end-flag is the proper fix (v2).
- **Models mimic transcript labels**: label speakers for multi-party comprehension and models start prefixing replies with "name:". Strip deterministically on send; prompt-level "don't do it" is defense only.

## Decisions Made

- ADR-007 (see DECISIONS.md): session lifecycle controls + deterministic @mention reply routing

---

## Post-Session Checklist

- [x] Session log completed (this file)
- [x] SUMMARY.md updated with current state
- [x] DECISIONS.md updated (ADR-007)
- [ ] ENTITIES.md updated — n/a (no schema change; new Convex functions only)
- [x] INBOX.md updated (tasks marked done, new tasks added)
- [x] Validation scripts run (vitest 11/11, mention matrix, demo-loop)

---

## Next Session Recommendations

- Per-agent personas with real roles (generic assistant answers add no value)
- `start-stack.ps1` so the stack survives CC session churn
- Structured end-of-conversation flag to replace the DONE sentinel
- docker-compose profiles; experience dedup (carried)
