# Project Summary

<!-- state:begin -->
<!-- generated from .agents/state.json rev 45 by open-brain v1.10.0 — do not edit; change state via ob_state -->
> **Status:** v1.10.0 — Prove a truly remote agent can join the hub over the public internet with its own key. Revocation of superseded keys is verified on tcm's live DB (V-003, session 16) and tcm runs v1.8.0 (V-001). Next in the ordered remote-agent sequence: per-agent keys (T-003; on tcm 8 of 10 names share the dev-key, which resolves as `atlas`, so strict means nothing until then), warn-mode soak, `AUTH_MODE=strict`, expose over HTTPS, remote registration. askPolicy on JSON-RPC (T-004) and rate limiting (T-005) also gate exposure. On-demand spawn follows.

## What's working

- tcm serves A2A-Hub v1.8.0 with read receipts live, and ~/Projects/A2A-Hub (every SIA seat's hub-talk) is at 003f57d / v1.8.0 _(V-001, 3 evidence)_
- The main local stack starts on v1.8.0 from ~/Projects/A2A-Hub (003f57d) and carries a real send with read receipts; this is Loop 1's deferred A6 live start _(V-002, 1 evidence)_
- On tcm's live DB no agent name has more than one row and no superseded key hash survives: revocation of superseded keys holds (T-001) _(V-003, 1 evidence)_
- Loop 3 (T-003, per-agent keys, v1.9.0) passes acceptance on loop/3-build-r3 fe4eb14 _(V-004, 1 evidence)_
- Loop 4 (T-061, chat UI served by the hub at /ui/, v1.10.0) passes acceptance on loop/4-ui fdc6bfb, on a stage replay of the Dockerfile, not the image _(V-005, 1 evidence)_

## What's broken

_Nothing open._

## What's next

- [P0] T-003 Per-agent key generation + rotation
- [P1] T-002 Onboard a truly remote agent
- [P1] T-004 askPolicy is not enforced on the JSON-RPC path
- [P1] T-005 Rate limiting and abuse protection
- [P1] T-006 On-demand spawn

## Decisions

- 2026-09-25 — Loop 4 merged and tagged v1.10.0; the T-003 cutover's deploy act ships v1.10.0 instead of v1.9.0, as one deploy — AUTHORITY, both links recorded: (1) Aaron to Atlas, in the SIA planner session (sia-planner-ac), 2026-09-25 ~02:50Z, verbatim "merge loop 4, I agree ship v1.10.0 directly", relayed by Atlas to Relay. Relay did not act on the relay alone: merging Loop 4 is A2A-Hub-only, so D-003's exception does not reach it, and the quoted words did not mention the tag. (2) Aaron directly to Relay, session 17, verbatim "go ahead", answering Relay's question: "Do you want me to merge Loop 4's three branches into master, tag v1.10.0 on the merge commit, and have the tcm cutover ship v1.10.0 in place of v1.9.0 as a single deploy?" DONE: PRs #14 (loop/4-ui fdc6bfb, merge 62b1d00), #15 (qa/loop-4-ui 2b4bb61, merge b85ff23), #16 (docs/session-17 0a89158, merge c4d2d1c); no file overlaps checked first; annotated tag v1.10.0 (1eeb4f1) on c4d2d1c, pushed and read back. Master's convex/ and scripts/hub-talk.mjs are unchanged from cef7517. NOT COVERED: the cutover window (the SIA planner names it once SIA's candidate A is decided), and every tcm act, each on Aaron's word at the time. The deploy act follows docs/redeploying-tcm.md:47-51 with PB1-PB3 between build and swap (ruling 2), not scripts/deploy.sh.
- 2026-09-24 — T-003's live local start moves after the main-checkout update and runs from the main checkout; order is tcm cutover, main-checkout update, local start — Aaron, Relay session 17, 2026-09-24, verbatim "yes" to Relay's question "do you agree to that reorder, with the local start moving to after the main-checkout update?". REASON: local Convex data is per checkout (Rivet, read-only: ~/Projects/A2A-Hub/.convex/local/default/convex_local_backend.sqlite3, 297 MB, holds alice/bob's rows; every worktree has its own 0.5-2 MB DB; start-stack.ps1:21 roots at $PSScriptRoot). A v1.9.0 stack from a separate worktree gets an empty DB, so N.5(b)'s migration could not be observed; from the main checkout it can, but that checkout may move only last (design section 3.6, R2). Aaron's earlier "yes" to a local start (same session) is NOT used; step 3 gets its own word. RELAY ERROR ENTRY (session 17): Relay's question to Aaron bundled 'update ~/Projects/A2A-Hub to v1.9.0' into the local start, against R2, and sent it to Rivet as scope; Relay also told the SIA planner that ruling B1 covers a v1.9.0 client against a v1.8.0 hub, without reading B1 (B1 is a new name on the old client). Caught by Relay on reading B1 and by the SIA planner's questions before any act: Rivet ran nothing, main checkout stayed 003f57d, both corrections sent. Shape: asserting without reading, again. Containment: read the design section a question cites before asking it.
- 2026-09-24 — Remove every agent row that used the shared dev-key; each agent re-registers fresh and gets its own key at that point (supersedes the SIA planner's keep-and-migrate for forge/probe) — Aaron, in Relay session 16, 2026-09-24, verbatim: "All agent have been testing agent.  The only two agents that have used the hub for real work is Atlas and forge while using cursor.  Since each agent will get a new key let's have each agent register and assign them a new key at that point.  We can remove all agents that were using the shared key." APPLIES TO the 8 dev-key names on tcm (Loop 2, V-003): relay, grok, cursor, clark, general, probe, forge, atlas. Each agents row is released (Loop 3 design section 4.3(b), internalMutation agents:release), and a name that is needed again registers fresh via --init-key, which inserts it as owned with its own key. NOT covered: cursor-grok and grok-probe, which hold their own keys and were not on the shared key; they stay, classified owned at deploy. SUPERSEDES the SIA planner's ruling (2026-09-24) to keep forge and probe and migrate them. Its reason, that their rooms are SIA history, still holds under this ruling: only convex/agents.ts reads or writes the agents table (5 queries; the search was validated on that known positive), so releasing a row leaves sessions, sessionPeers, messages and peers intact. SEQUENCING (Relay): agents:release exists only after the Loop 3 deploy. The unused test names (clark, cursor, general, probe) can be released in the deploy act. Live names are released together with their fresh --init-key at their own cutover step, so no seat is left without a row: relay as canary; atlas, forge and grok in the SIA-named window, and never while SIA candidate A7 is being built or scored. grok is SIA's live Cursor developer seat right now. This is Aaron's word for the 8 releases, to be executed at those steps. The deploy, each --init-key against tcm, and the main-checkout update each still need his word (D-006).
- 2026-09-24 — Aaron approves Loop 3's hub-talk key-contract change and staged cutover (T-003 Q1); each outward act still needs his word — Aaron, in the SIA planner session (SIA record 90), 2026-09-24 ~19:57Z, verbatim: "yes". The question he saw was Atlas's summary of Relay's Q1, verbatim: "A2A-Hub wants to give every agent its own hub key instead of the shared one, switching over in stages so no seat loses the hub. It won't happen while SIA has a candidate being built or tested. May it go ahead?" Relayed Atlas -> Relay by cross-session message under SIA D-039 / A2A D-003. Relay's Q1 behind that summary: the hub-talk contract changes in the Loop 3 design section 3.5 (no default key, exit 1 before any network call; a key file per name and hub; --init-key/--rotate-key that never print the key; register failures become rc 1; hub-side refusal of shared, short or re-keyed names), and the section 3.6/4.2 cutover (deploy in warn with the main checkout untouched; per-name --init-key from a worktree; main-checkout update only after a read-only check; new names during the window only via --init-key). The design is final at loop/3-per-agent-keys 88a8e0f. LIMIT: Aaron saw the summary, not items 1-5; if a later reading of this approval turns on a detail the summary omitted, ask him. SCOPE: this approves the contract change and the cutover plan. It is NOT authority for any single outward act: the merge, the deploy, each tcm --init-key, the main-checkout update, and any release each still need his word. TIMING (SIA planner): no cutover step touching `grok` or `atlas` while SIA candidate A7 is being built or scored (grok session record 95, then QA 96); the SIA planner names the window.
- 2026-09-23 — Standing push authority: A2A-Hub seats push their OWN working branches without asking; never master, never force, never another seat's branch; merges and tcm redeploys stay Aaron's — Aaron, in the SIA planner session (SIA record session 81), 2026-09-23, verbatim: "yes to  your quesition". The question, as Atlas put it to him: "Should A2A-Hub's seats get the same standing push authority for their own working branches?" Relayed Atlas -> Relay by cross-session message the same day under SIA D-039 / A2A D-003. The question was Atlas's own, not relayed from an A2A-Hub seat; it is recorded as Aaron's authority because the answer is his. 'The same' refers to SIA D-038 part (1), checked against SIA origin/master aef8195: any seat may push ITS OWN working branches without asking; never master, never a force push, never a branch another seat owns; every push is read back with ls-remote and named in the commit, report or message that follows it. In A2A-Hub: Rivet's loop/* and chore/*, Gauge's qa/*, Relay's docs/*. NOT imported from SIA: D-032's docs/record merge exception, and D-038 part (2). Merging to master, tagging, tcm redeploys, updating the main checkout ~/Projects/A2A-Hub, and writes to live Convex each still need Aaron's word for that act. This amends shared.md's 'Each outward-facing act needs authority for THAT act' for own-branch pushes only.
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
