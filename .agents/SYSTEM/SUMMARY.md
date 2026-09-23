# Project Summary

<!-- state:begin -->
<!-- generated from .agents/state.json rev 16 by open-brain v1.7.0 — do not edit; change state via ob_state -->
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

- 2026-09-23 — Standing push authority: A2A-Hub seats push their OWN working branches without asking; never master, never force, never another seat's branch; merges and tcm redeploys stay Aaron's — Aaron, in the SIA planner session (SIA record session 81), 2026-09-23, verbatim: "yes to  your quesition". The question, as Atlas put it to him: "Should A2A-Hub's seats get the same standing push authority for their own working branches?" Relayed Atlas -> Relay by cross-session message the same day under SIA D-039 / A2A D-003. The question was Atlas's own, not relayed from an A2A-Hub seat; it is recorded as Aaron's authority because the answer is his. 'The same' refers to SIA D-038 part (1), checked against SIA origin/master aef8195: any seat may push ITS OWN working branches without asking; never master, never a force push, never a branch another seat owns; every push is read back with ls-remote and named in the commit, report or message that follows it. In A2A-Hub: Rivet's loop/* and chore/*, Gauge's qa/*, Relay's docs/*. NOT imported from SIA: D-032's docs/record merge exception, and D-038 part (2). Merging to master, tagging, tcm redeploys, updating the main checkout ~/Projects/A2A-Hub, and writes to live Convex each still need Aaron's word for that act. This amends shared.md's 'Each outward-facing act needs authority for THAT act' for own-branch pushes only.
- 2026-09-23 — Correction to D-003: SIA D-039 is on SIA master (PR #123, merge 7a717ae) — D-003 says D-039 was 'not yet on SIA master when this was written'. That was true when observed (SIA origin/master was 4e334d8), but PR #123 merged afterwards at 7a717ae. Relay re-checked after Atlas reported it: 2055c65 is an ancestor of SIA origin/master at 7a717ae (git merge-base --is-ancestor, fetched 2026-09-23). Written as a new decision because ob_state has no op to amend one; D-003 stands in every other respect.
- 2026-09-23 — Mirror of SIA D-039: for hub work SIA depends on (T-160), this planner routes its questions for Aaron through the SIA planner (Atlas), who relays and does not plan A2A-Hub — Ruled by Aaron in the SIA planner session (SIA record session 81), 2026-09-23, recorded as SIA D-039 at SIA commit 2055c65 (branch chore/session-81-d039, not yet on SIA master when this was written). Verbatim as recorded there: 'route through you would give you some context about a2a hub, the projects are seperate but use each other so I think running the other planner through you is a good idea. Push back if there's a strong reason for me to talk directly to a2a planner agent. If I'm only working on a2a hub then I would talk to that planner agent only, but in this case I think through you could be helpful.' Relay checked the quote against SIA's record rather than the relay's message. SCOPE: shared work only (T-049, T-050, T-051 and anything else opened under SIA T-160); A2A-Hub-only work goes to Aaron directly. BOUNDARIES: (1) Atlas relays and does not plan A2A-Hub; its standing here is as the customer, and a view of its own is labelled as its own. Design and rulings in A2A-Hub stay with this repo's seats. (2) Quotes both ways: the question verbatim with its source, the answer verbatim with where and when it was said. (3) Outward-facing acts in A2A-Hub (push, merge, tag, tcm redeploy, live Convex writes) need Aaron's word for THAT act, relayed quoted. A relayed answer is authority only as far as its quote goes. COORDINATION, binding while the shared work runs: (a) when Atlas asks, every A2A-Hub seat pauses builds and test runs until Atlas says done (SIA QA full suite fails under machine load, SIA G-042); (b) no tcm redeploy while SIA hub traffic is live, ask Atlas first; a redeploy is image plus `npx convex deploy`, verified with a real send, never /health. SIA's D-038 does not govern this repo.
- 2026-09-22 — Three seats in the SIA arrangement: Relay (planner), Rivet (developer), Gauge (QA) — Names ruled by Aaron. Relay is also Tarrant-County-Makerspace's agent name; that collision was shown and he chose it. Forge/Atlas, this repo's old names, belong to SIA's seats. Worktrees ~/Worktrees/a2a-planner, a2a-rivet, a2a-qa, detached at rest; each names its seat in gitignored .agents/AGENT.local.md, and tracked .agents/AGENT.md declares Rivet the default. The main checkout is not a seat: it runs the stack. Role knowledge is tracked in .agents/roles/ (adapted from SIA's roles at 0d73fbe). The four .claude/commands stubs that pointed at the deleted .agents/workflows/ were removed, so the global /start, /end, /task and /test apply. Commit 5bb0777.
- 2026-09-22 — Adopt the Self-Improving-Agent record: .agents/state.json (schema 2), written only through ob_state — One-shot open-brain state import, committed by Aaron (G-007: the auto-mode classifier denies --commit in an agent session). Before import: INBOX regrouped into P0-P3 (the importer reads priority sections only; roadmap version kept per task as '(roadmap vN)'), task.md given a Current Objective, next-session.md brought up to Session 14, and SIA's hardcoded seeds (V-001..V-005, G-001..G-006) removed from the draft by parser on Atlas's advice. INBOX, task.md, next-session.md and SUMMARY.md's marked region are now rendered views. .agents/** is LF via .gitattributes; the pre-migration snapshot stays local in .agents/archive/. Account: docs/loops/sia-migration-assessment.md. Commits 3beac7c, 9fa2bcb.
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
