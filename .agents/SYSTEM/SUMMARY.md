# Project Summary

<!-- state:begin -->
<!-- generated from .agents/state.json rev 68 by open-brain v1.11.0 — do not edit; change state via ob_state -->
> **Status:** v1.11.0 — Prove a truly remote agent can join the hub over the public internet with its own key: Aaron's Grok Bot on a cloud VM registers over HTTPS and talks to relay (D-011), as the first step to a multi-tenant hub where humans own accounts, agents join by invitation, and rooms can cross accounts by invitation (D-010). Done: per-agent keys (V-006), chat UI on tcm (V-005), read-only tcm access (V-007). Next, in order: Loop 5 (T-066, identity + membership); T-064's log read; AUTH_MODE=strict; Loop 6 (T-067, enrollment codes, rate limits, error pages); Funnel; the test (T-068). NEVER a public address while tcm is in warn (gap). Also gating exposure: T-057.

## What's working

- tcm serves A2A-Hub v1.8.0 with read receipts live, and ~/Projects/A2A-Hub (every SIA seat's hub-talk) is at 003f57d / v1.8.0 _(V-001, 3 evidence)_
- The main local stack starts on v1.8.0 from ~/Projects/A2A-Hub (003f57d) and carries a real send with read receipts; this is Loop 1's deferred A6 live start _(V-002, 1 evidence)_
- On tcm's live DB no agent name has more than one row and no superseded key hash survives: revocation of superseded keys holds (T-001) _(V-003, 1 evidence)_
- Loop 3 (T-003, per-agent keys, v1.9.0) passes acceptance on loop/3-build-r3 fe4eb14 _(V-004, 1 evidence)_
- Loop 4 (T-061, chat UI served by the hub at /ui/, v1.10.0) passes acceptance on loop/4-ui fdc6bfb, on a stage replay of the Dockerfile, not the image _(V-005, 1 evidence)_
- On tcm every agent row owns its own key and the shared dev-key resolves to no name; tcm runs v1.10.0 and the main checkout is at v1.10.0 (T-003 cutover complete, K7) _(V-006, 1 evidence)_
- A read-only ssh key reads tcm's hub, auth log, agents summary, image and runners and can do nothing else; seats use it in auto mode through six exact allow rules _(V-007, 1 evidence)_
- Loop 5 (T-066, v1.11.0) passes acceptance on loop/5-identity ebe7747: every request acts as its key's name and touches only rooms it may see; strict refuses, warn logs [authz]; JSON-RPC enforces askPolicy _(V-008, 1 evidence)_
- No agent on tcm's hub used a legacy, shared or unknown key after the T-003 cutover finished: 20.6 h of hub log (04:14:10Z to ~00:50Z 2026-09-26) has no [auth] WOULD REJECT line after 04:20:51Z, and all 8 agent rows are owned (K7 PASS) _(V-009, 1 evidence)_
- tcm runs A2A-Hub v1.11.0 (Loop 5) in AUTH_MODE=warn: container on image 645a6f248d82 since 2026-09-26 01:22:11Z, health ok, every agent row owned and assigned an owner, and the read-only auth-log reports authz-lines _(V-010, 1 evidence)_
- aaron's tcm row is human-kind (G-002 fixed): the Loop 5 owner's view is available to him, with his key, owner and every other row unchanged _(V-011, 1 evidence)_

## What's broken

- Gap G-001: In AUTH_MODE=warn the hub admits unknown keys as nobody; any public address before strict makes every room readable and writable without a valid key. tcm is in warn (V-006).

## What's next

- [P1] T-002 Onboard a truly remote agent
- [P1] T-004 askPolicy is not enforced on the JSON-RPC path
- [P1] T-005 Rate limiting and abuse protection
- [P1] T-006 On-demand spawn
- [P1] T-007 Two cheap repo-peer measurements

## Decisions

- 2026-09-26 — tcm deploys no longer pause the GitHub runners; tell Atlas instead, and check the container IPs before and after a swap — Aaron, Relay session 18: 'ht runner are low priority, why manual pause?'. Relay found the only recorded reason was that a SIA seat may send CI to tcm's runners (docs/loops/t-003-cutover-log.md:22-23), and dropped steps 0 and 11 of docs/loops/loop-5-deploy-plan.md. Aaron then said 'Ask atlas about the runner pause'. Atlas (SIA planner, record 109), reading SIA's code rather than recalling: SIA's CI on tcm (.github/workflows/ci.yml) runs only npm ci, tsc and vitest, and its first step REQUIRES the hub and Convex to be unreachable, so a deploy cannot corrupt a job. The only effect is load (vitest 5 s timeouts, a wrong-reason red), which SIA re-runs. The pause can stay dropped. INSTEAD, for every tcm deploy: (1) tell Atlas when it starts; (2) record the a2a-hub and convex container IPs on their docker network before and after the swap, and tell Atlas. SIA's egress self-check lists fixed IPs (172.20.0.2, 172.20.0.3), and a changed address would be a silent gap in it, not a failure.
- 2026-09-26 — Standing exception: during a tcm act Aaron approved, the seat holding the full key for it may run read-only commands without asking — Aaron, Relay session 18, answering Relay's question 'Which rule should I update?' with the option 'Read-only on tcm (Recommended)', after he said 'update that rule'. Context: Relay had asked for one read-only `docker inspect` (container IPs, for Atlas's CI self-check) that was outside the Loop 5 deploy plan's command list. RULE, as written into .agents/roles/shared.md (Authority): while Aaron has approved a deploy or other act on tcm, a seat he authorised to use the full key for that act may also run read-only commands (docker inspect/ps/images/logs, ls, grep, sha256sum, stat, cat of non-secret files) without asking, listing each in its report. Never covered: printing secrets (.env contents, keys, admin keys, env/config sections of docker inspect), docker exec/run, sudo, or anything that writes, restarts, tags or deletes. The exception ends with the act. Amends D-005 (append-only).
- 2026-09-26 — The Rivet (developer) seat is held by Grok in Cursor, hub name a2a-grok; it talks to Relay in hub room k575twereq1w6f2s3yra5zk5618f4rty on tcm — Aaron, Relay session 18, verbatim: "we will be using grok via cursor for the next loop so it will need a room with you in it. Send me the promt I past into cursor", then "gork is the rivet seat". Relay wrote the Cursor prompt (session scratchpad cursor-grok-prompt.md). It creates a NEW hub name a2a-grok with hub-talk --init-key against http://100.124.212.87:4000, and Aaron pasting it was his word for that name. Why a new name: 'grok' is SIA's Cursor seat (Atlas: 'No existing SIA name (atlas, grok)'), and the tcm row 'cursor-grok' has no key file on this machine. a2a-grok registered and posted turn 1 in room k575twereq1w6f2s3yra5zk5618f4rty (relay <-> a2a-grok). Seat name stays Rivet; the hub identity is a2a-grok. Transport for this seat is the HUB (hub-talk), unlike the Claude Code seats, which use Claude Code's built-in cross-session messages. Assignment sent (turn 3): read docs/loops/rivet-handoff-session-17.md first; (A) Loop 6 design on loop/6-design in its own worktree, design only, for a ruling; (B) the Loop 5 deploy only when Relay relays Aaron's go-ahead in the room. Observed on the first exchange: --inbox then --wait re-delivered turn 1 (T-017).
- 2026-09-25 — Standing exception to D-005: a docs/* branch that touches only documents and the record merges without Aaron's word — Aaron, Relay session 18, verbatim: "docs merge dont need my approval", said when Relay asked to merge docs/session-18-d014. SCOPE, as Relay recorded it in .agents/roles/shared.md (Authority): a docs/* branch merges to master as a merge commit through a PR when its diff against origin/master touches only docs/, .agents/ (state.json through ob_state) and top-level *.md. The seat checks the diff BEFORE merging. Anything touching src/, scripts/, convex/, client/, tests, package*.json, the Dockerfile, compose or config still needs Aaron's word. Merges only: tags, releases and main-checkout updates are not covered. Amends D-005 (append-only; D-005 is not edited). Narrow reading chosen by Relay: 'docs' taken as the docs/* branch class plus a content check, not any branch that happens to carry documents (e.g. Rivet's chore/* plans or Gauge's qa/* reports are not covered unless Aaron says so).
- 2026-09-25 — hub-talk gains --invite <code>, used only with --init-key: the one hub-talk contract change in Loop 6 (D-003 answered) — Aaron, verbatim "yes", in the SIA planner session (Atlas, record 109, session 9a149231-b394-4290-9cfe-7118be1d6ba0) at about 22:17Z 2026-09-25. He was answering Atlas's "Do you approve `--invite <code>`?", put with Relay's D-003 question verbatim ("when a new seat needs a name on the hub, how should it get one?") and Relay's recommendation quoted in full: `hub-talk --as <name> --init-key --invite <code>`, the code sent only on that one register, every other hub-talk command byte-identical, and Aaron issues a code before a new seat is created. Atlas's own recommendation was also yes, and it added a request, taken into the brief's acceptance A: each refusal names its condition (no code, expired, used). Relayed Atlas -> Relay by cross-session message, same evening. SCOPE: approves the option only. It does NOT choose between a one-command and a chat-page-button way of issuing codes; that stays with Loop 6's design (brief scope 1). Any further hub-talk change is a new D-003 question. Recorded in docs/loops/loop-6-enrollment-brief.md, section 'hub-talk: --invite'.
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
