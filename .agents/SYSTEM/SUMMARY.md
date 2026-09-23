# Project Summary

<!-- state:begin -->
<!-- generated from .agents/state.json rev 1 by open-brain v1.7.0 — do not edit; change state via ob_state -->
> **Status:** v1.7.0 — Prove a truly remote agent can join the hub over the public internet with its own key: first verify revocation against the live database (the one unmet gate), then run the ordered remote-agent sequence — redeploy tcm with v1.7.0, per-agent keys, warn-mode soak, `AUTH_MODE=strict`, expose over HTTPS, remote registration. On-demand spawn follows.

## What's working

_Nothing verified yet._

## What's broken

_Nothing open._

## What's next

- [P0] T-001 Verify revocation against the live database
- [P1] T-002 Onboard a truly remote agent
- [P1] T-003 Per-agent key generation + rotation
- [P1] T-004 askPolicy is not enforced on the JSON-RPC path
- [P1] T-005 Rate limiting and abuse protection

## Decisions

- 2026-09-22 — Three seats in the SIA arrangement: Relay (planner), Rivet (developer), Gauge (QA) — Names ruled by Aaron. Relay is also Tarrant-County-Makerspace's agent name; that collision was shown and he chose it. Forge/Atlas, this repo's old names, belong to SIA's seats. Worktrees ~/Worktrees/a2a-planner, a2a-rivet, a2a-qa, detached at rest; each names its seat in gitignored .agents/AGENT.local.md, and tracked .agents/AGENT.md declares Rivet the default. The main checkout is not a seat: it runs the stack. Role knowledge is tracked in .agents/roles/ (adapted from SIA's roles at 0d73fbe). The four .claude/commands stubs that pointed at the deleted .agents/workflows/ were removed, so the global /start, /end, /task and /test apply. Commit 5bb0777.
- 2026-09-22 — Adopt the Self-Improving-Agent record: .agents/state.json (schema 2), written only through ob_state — One-shot open-brain state import, committed by Aaron (G-007: the auto-mode classifier denies --commit in an agent session). Before import: INBOX regrouped into P0-P3 (the importer reads priority sections only; roadmap version kept per task as '(roadmap vN)'), task.md given a Current Objective, next-session.md brought up to Session 14, and SIA's hardcoded seeds (V-001..V-005, G-001..G-006) removed from the draft by parser on Atlas's advice. INBOX, task.md, next-session.md and SUMMARY.md's marked region are now rendered views. .agents/** is LF via .gitattributes; the pre-migration snapshot stays local in .agents/archive/. Account: docs/loops/sia-migration-assessment.md. Commits 3beac7c, 9fa2bcb.
- 2026-09-21 — Ambiguous Silence Must Fail Closed
- 2026-09-20 — Ask Policy — Who May Ask This Peer (8.3 Concept)
- 2026-09-20 — Name Ownership (8.2 Partial) and Daemon Instance Supersede
<!-- state:end -->
---

## Architecture Overview

```
Wrapper Agents (any A2A-compliant agent — poll outbound; NAT-safe)
    ↕ HTTP (register, poll, claim, respond, sessions, extend)
A2A Intelligent Hub (Express 5, port 4000) — rendezvous broker
    ↕ Convex Client
Convex Backend (local dev now; VPS later)
    ├─ Chat channel: peers / sessions / sessionPeers / messages (replaces Telegram)
    ├─ Tasks (atomic claim), agents, experiences, repoFixes
Anthropic API (classifier + repo-fixer — model configurable per task)
GitHub (push approved fixes)
Chat client (Svelte, :5173) — history sidebar, human composer, @mentions
```

Humans are peers on the hub, not relays. Aaron chats inside sessions as the `aaron` peer; `@name` targets one agent, no mention asks the room.

---

## Roadmap

| Version | Goal | Effort |
|---|---|---|
| **v1** | ✅ Autonomous 2-agent loop (real LLM) on local stack, chat client | DONE (Session 6) |
| **v2** | **Cross-repo agent-to-agent, proven locally** — repo-resident peers (✅ v1.6.0), on-demand spawn, and the three trust-domain prerequisites. No external dependency | Days–weeks |
| **v3** | Remote teaching (Aaron + Brian) — VPS redeploy, key management, real-network failure modes, wrapper npm package, PWA client | Weeks; gated on v2 + Brian's availability |
| **v4** | Platform — multi-provider LLM, full A2A spec compliance, makerspace/billing integration | Months |

> **Priority changed 2026-07-29 (Aaron's call, PRD v1.2):** cross-repo is now the *primary* use case, ahead of the Brian/remote work. It's the same protocol at a shorter distance and the only version verifiable without a second person. The catch is that one machine has one trust domain, so auth, peer identity, and authorization are invisible locally and load-bearing remotely — PRD §8 names all three as v2 prerequisites, not later hardening.

See PRD.md §1 and §9, INBOX.md, and ADR-006/007/010 in DECISIONS.md.

---

## Key Metrics

| Metric | Value |
|---|---|
| Total Sessions | 11 |
| Version | v1.6.2 |
| Tests | 41/41 passing; `verify-client-stack` 5/5; live cross-repo asks verified against the real repo |
| Known Bugs | 0 blocking; 2 live non-blocking (citation fabrication, duplicate-peer race) |
