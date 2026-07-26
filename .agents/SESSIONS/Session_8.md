# Session 8 — 2026-07-26

> **Objective:** Verify Session 7's uncommitted work end-to-end, then ship it as v1.5.0
> **Status:** Completed
> **Session UUID:** 7e41e596-5841-44e0-bc86-a1fa29ea0947

---

## Pre-Session Checklist

- [x] Read SUMMARY.md
- [x] Read INBOX.md
- [ ] Read ENTITIES.md (no schema work this session)
- [ ] Read relevant skills (n/a)
- [x] Run pre-session validation (`verify-client-stack.mjs`)

---

## Objective & Plan

**Goal:** Exercise `start-stack.ps1` live, demo personas, commit + tag v1.5.0.

**Approach:**
1. Launch the stack → verify: 5/5 on `verify-client-stack.mjs`
2. Persona demo via `demo-loop.mjs` → verify: GATE PASSED with DONE convergence
3. Commit + tag → verify: annotated tag on a clean tree

**User Approval:** [x] Approved (expanded mid-session: `/health` fix, repo-fixer model, A2A registration test)

---

## Work Log

### What Was Done

**Stack brought up and verified (5/5).** Found a *stale* stack first — Convex/hub/daemons/vite running since Jul 22–23 with the Convex backend on :3210 dead underneath a live hub. Killed all 8 processes, relaunched clean, verified.

**Dead `ANTHROPIC_API_KEY`.** `GET /v1/models` returned `401 authentication_error`. Aaron replaced it; new key verified `200`. Hub + both daemons restarted to pick it up (`--env-file` reads only at process start).

**Six fixes shipped as v1.5.0 (`44f647e`, tagged):**
1. `start-stack.ps1` — added `Wait-ForPort 5173`; the client was the only window with no readiness gate (caused a false FAIL on the first verify run)
2. `start-stack.ps1` — `Test-PortBusy`/`Wait-ForPort` probed IPv4 only while vite binds `::1` only; the client's skip-if-running check could never match, so a re-run would have spawned a **second vite**. Both now probe each family with the correct socket type
3. `verify-client-stack.mjs` — all fetches bounded (10s; 60s for the model leg). The round-trip fetch was unbounded and hung forever when the daemon couldn't answer
4. `verify-client-stack.mjs` — removed the stale `reply.includes("[bob")` assertion (see Gotchas)
5. `src/index.ts` — `/health` now probes Convex (bounded 3s) and returns `503 degraded` when the DB is unreachable
6. `client/src/App.svelte` — client honors `res.ok` on `/health` instead of rendering "online" from a 503 body

**v1.5.1 (`e90d461`, tagged):** `REPO_FIXER_MODEL` defaulted to `claude-sonnet-4-20250514`, which passed its retirement date 2026-06-15. Confirmed live: `GET /v1/models/claude-sonnet-4-20250514` → `404`. Now `claude-haiku-4-5-20251001`, matching classifier and daemon — the whole hub is on Haiku 4.5.

**Persona demo — GATE PASSED.** `--print-persona` confirmed per-agent composition (`personas/<name>.md` + `HUB_CONVENTIONS`). Live loop: bob held mentor character verbatim ("I need the exact error text and the command you ran"), converged in 2 turns with DONE, exit 0.

**A2A registration tested end-to-end.** Registered a `scout` agent and drove a full session against alice and bob. All six steps green; results in Gotchas.

### Files Modified
- `start-stack.ps1` — dual-family port probe, client readiness wait
- `scripts/verify-client-stack.mjs` — request timeouts, corrected round-trip assertion
- `src/index.ts` — `/health` Convex probe
- `src/repo-fixer.ts` — `REPO_FIXER_MODEL` default
- `client/src/App.svelte` — degraded-health handling
- `.env.example`, `.gitignore`, `package.json` (1.4.0 → 1.5.1), `CHANGELOG.md`, `README.md`
- `.agents/SYSTEM/{SUMMARY,DECISIONS}.md`, `.agents/TASKS/{INBOX,task}.md`

### Files Created
- `.agents/SESSIONS/Session_8.md` (this file)
- Committed previously-untracked Session 7 work: `personas/`, `start-stack.ps1`, `AGENTS.md`, `docs/`, `.claude/skills/gitnexus/`, `.agents/AGENT.md`, `Session_7.md`, `reference/MESSAGING-APP-ARCHITECTURE.md`

---

## Gotchas & Lessons Learned

- **A green gate can be green for the wrong reason.** `verify-client-stack.mjs` asserted `reply.includes("[bob")`, but that prefix comes *only* from the `[${NAME} fallback]` path — `HUB_CONVENTIONS` tells the model to reply plain. The check therefore passed only while the API key was broken, and *failed* the moment a real key made the model answer. Assert the invariant (a reply returned), and label which path served it so a silent regression to fallback is visible.

- **A live process is not a live service.** The stale stack's `convex dev` wrapper was running with its backend on :3210 dead. `/health` returned `{"status":"ok"}` for days while every persistence call failed. Health endpoints must probe their dependencies, bounded, or they only prove the process didn't crash.

- **vite binds `::1` only; hub and Convex bind `127.0.0.1`.** Any IPv4-only TCP probe silently misses the client. This broke both the skip-if-running check and would have broken the new readiness wait. Probe both families, and construct `TcpClient` with the matching `AddressFamily` — PS 5.1's parameterless ctor is IPv4 and throws on `::1`.

- **`| tail -N` masks exit codes.** Bit me twice: I called the GitNexus re-index "exit 0" when it had failed, and briefly thought `demo-loop.mjs` swallowed a gate failure. `${PIPESTATUS[0]}` is the real status.

- **Retired models 404 rather than degrade.** `claude-sonnet-4-20250514` retired 2026-06-15, so `RepoFixer.draftFix` would have *thrown on every call*, not produced worse output. It stayed invisible because nothing in the verification path exercises repo-fixer.

- **`@`-parsing is over-eager (open bug).** `daemon.ts:165` matches `/@([a-z0-9_-]+)/gi` against raw content, so any `@word` is treated as routing. A test message containing the literal string "@mention" was read as addressing a peer named `mention` and silently muted every agent. On a hub whose agents discuss code, `@anthropic-ai/sdk`, `@media`, decorators, and email addresses all trigger this.

- **`X-Agent-Key` is never validated.** Every guarded route only checks presence (`if (!apiKey) return 401`). Verified: a deliberately bogus key returns `200`. `apiKeyHash` is stored at registration and never compared.

- **Registration is agent-typed, which changes reply behavior.** `/a2a/register` hardcodes `type: "agent"`, so a hand-registered peer hits the ADR-007 no-cascade rule: unaddressed messages in *group* sessions get no reply. Use `@name` in groups, or a 2-participant session where unaddressed replies always fire. Both verified (bob ~3s via mention; alice ~6s in 1:1).

---

## Decisions Made

- **`/health` reports the whole hub, not the process** — bounded 3s Convex probe, `503` when degraded. Chose a hard status change over an advisory field so existing `res.ok` checks catch it. (ADR-009)
- **Whole hub standardizes on Haiku 4.5** — classifier, repo-fixer, and wrapper daemon all default to `claude-haiku-4-5-20251001`. Aaron's call.
- **`.agents/reflection-queue.json` gitignored** — generated session tooling, same class as `.recalled-entries.json`.
- **`.claude/skills/gitnexus/**` committed** — `CLAUDE.md` references those files by path, so leaving them untracked would dangle the reference.

---

## Post-Session Checklist

- [x] Session log completed (this file)
- [x] SUMMARY.md updated with current state
- [x] DECISIONS.md updated (ADR-009)
- [ ] ENTITIES.md updated (no schema change)
- [x] INBOX.md updated (tasks marked done, new tasks added)
- [x] Validation scripts run (`verify-client-stack.mjs` 5/5, `demo-loop.mjs` GATE PASSED)

---

## Next Session Recommendations

- Fix the `@`-parsing over-match (`daemon.ts:165`) — gate on session participants; `peerNames` is already built at line 187
- Fix the stale turn counter (`App.svelte:77`) — the poll refreshes `transcript` but never `activeSession`, so the cap indicator freezes
- Build `scripts/register-agent.mjs` — registration path has no coverage today
- **Push** — `v1.5.0` and `v1.5.1` are committed and tagged locally, not pushed
- **GitNexus re-index is failing** — Windows file lock on `.gitnexus\lbug` held by the running `gitnexus mcp` servers; index still pinned at `e4fbdef`
