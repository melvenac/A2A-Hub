# Session 7 — 2026-07-23/24

> **Objective:** Sharpen the PRD around the real problem (remote teaching via agent↔agent), then land the local-stack gate: personas, one-click launch, classifier default fix
> **Status:** Completed
> **Session UUID:** 973eef6e-1f9f-4d4d-980d-fbe2070b0c1b

---

## Pre-Session Checklist

- [x] Read SUMMARY.md
- [x] Read INBOX.md
- [ ] Read ENTITIES.md (if schema work planned)
- [ ] Read relevant skills (if applicable)
- [ ] Run pre-session validation (if configured)

---

## Objective & Plan

**Goal:** PRD problem statement + roadmap reconcile; then personas → start-stack.ps1 → CLASSIFIER_MODEL default.

**Approach:**
1. Aaron articulated the origin problem (teaching Brian/Hisham CC remotely; agent↔agent instead of human relay) → rewrote PRD §1 + §9 around it
2. Persona resolution in daemon: `--persona` > `--persona-file` > `personas/<name>.md` > generic; role composed with hub conventions
3. `start-stack.ps1`: build + 5 Aaron-owned windows with readiness waits; hardened to idempotent after live-fire failures

**User Approval:** [x] Approved

---

## Work Log

### What Was Done
- PRD §1 rewritten: real problem story (remote CC teaching, human-as-relay → agents talk directly, humans watch as peers) + two ranked use cases
- PRD §9 reconciled: v1 marked complete (v1.4.0) with as-shipped table; superseded MCP-channel design collapsed to a pivot note; v2 retitled "Remote Teaching Ready" with Path-to-Brian in dependency order
- Persona system: role text auto-loads from `personas/<name>.md` (or `--persona`/`--persona-file`), always composed with hub conventions; `--print-persona` debug flag; alice=learner-assistant, bob=mentor personas written
- `CLASSIFIER_MODEL` code default → `claude-haiku-4-5-20251001` (no more mandatory env override)
- `CONVEX_URL` code default → `http://127.0.0.1:3210` (hub crashed on undefined during live test; local-first default)
- `start-stack.ps1` written, then hardened through two live failures: ANSI/em-dash parse bug (ASCII-only now) and orphaned Convex backend (idempotent skip-if-running checks for all 5 processes)
- Killed orphaned `convex-local-backend.exe` (PID 15588, alive since Session 6 — proof the backend detaches; it was hub/daemons/watcher that died)

### Files Modified
- `.agents/SYSTEM/PRD.md` (v1.1 — problem statement + roadmap)
- `src/wrapper/daemon.ts` (persona resolution + composition + `--print-persona`)
- `src/classifier.ts` (default model)
- `src/index.ts` (CONVEX_URL local-first default)
- `.agents/TASKS/INBOX.md`, `.agents/SYSTEM/SUMMARY.md`, `.agents/TASKS/task.md`, `.agents/SESSIONS/next-session.md`
- `README.md`, `.agents/SYSTEM/RULES.md`, `.env.example` (model-default drift)

### Files Created
- `personas/alice.md`, `personas/bob.md`
- `start-stack.ps1`

---

## Gotchas & Lessons Learned

- **PowerShell 5.1 reads BOM-less UTF-8 as ANSI**: em-dash (U+2014) bytes decode so the last byte (0x94) becomes a smart closing quote — which PS accepts as a string delimiter. Strings terminate mid-sentence; parse errors point at innocent lines. Keep `.ps1` files ASCII-only (or write with BOM).
- **`convex-local-backend.exe` detaches and survives** CC session death; `convex dev --local` then refuses to start ("backend still running on 3210"). Start scripts must be idempotent: skip-if-port-busy for servers, skip-if-cmdline-match for daemons.
- **Node `--env-file` never overrides already-set env vars** — a `$env:` assignment in the launch window deterministically beats `.env`.
- The hub crashed on missing `CONVEX_URL` because Session 6 passed it by hand — tribal launch knowledge is exactly what the start script exists to eliminate; code-level defaults are the deterministic fix.

---

## Decisions Made

- ADR-008: Persona resolution & composition (role file convention, conventions always appended)
- PRD reframing: remote teaching (use case 1) is the primary problem; local orchestration secondary (CC native subagents better same-machine; hub's edge is cross-machine/owner/LLM)

---

## Post-Session Checklist

- [x] Session log completed (this file)
- [x] SUMMARY.md updated with current state
- [x] DECISIONS.md updated (ADR-008)
- [ ] ENTITIES.md updated (no schema change)
- [x] INBOX.md updated (tasks marked done, new tasks added)
- [ ] Validation scripts run (n/a)

---

## Next Session Recommendations

- Aaron runs `start-stack.ps1` end-to-end (was mid-verification when session closed); then persona demo via chat client
- Commit + tag v1.5.0 once stack verified (uncommitted at session end)
- Then: experience dedup, docker-compose profiles
