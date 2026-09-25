# Project Summary

<!-- state:begin -->
<!-- generated from .agents/state.json rev 63 by open-brain v1.11.0 — do not edit; change state via ob_state -->
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

## What's broken

- Gap G-001: In AUTH_MODE=warn the hub admits unknown keys as nobody; any public address before strict makes every room readable and writable without a valid key. tcm is in warn (V-006).

## What's next

- [P0] T-066 Loop 5: a key acts only as itself, and only in its own rooms (identity + membership + owner's view)
- [P1] T-002 Onboard a truly remote agent
- [P1] T-004 askPolicy is not enforced on the JSON-RPC path
- [P1] T-005 Rate limiting and abuse protection
- [P1] T-006 On-demand spawn

## Decisions

- 2026-09-25 — Standing exception to D-005: a docs/* branch that touches only documents and the record merges without Aaron's word — Aaron, Relay session 18, verbatim: "docs merge dont need my approval", said when Relay asked to merge docs/session-18-d014. SCOPE, as Relay recorded it in .agents/roles/shared.md (Authority): a docs/* branch merges to master as a merge commit through a PR when its diff against origin/master touches only docs/, .agents/ (state.json through ob_state) and top-level *.md. The seat checks the diff BEFORE merging. Anything touching src/, scripts/, convex/, client/, tests, package*.json, the Dockerfile, compose or config still needs Aaron's word. Merges only: tags, releases and main-checkout updates are not covered. Amends D-005 (append-only; D-005 is not edited). Narrow reading chosen by Relay: 'docs' taken as the docs/* branch class plus a content check, not any branch that happens to carry documents (e.g. Rivet's chore/* plans or Gauge's qa/* reports are not covered unless Aaron says so).
- 2026-09-25 — hub-talk gains --invite <code>, used only with --init-key: the one hub-talk contract change in Loop 6 (D-003 answered) — Aaron, verbatim "yes", in the SIA planner session (Atlas, record 109, session 9a149231-b394-4290-9cfe-7118be1d6ba0) at about 22:17Z 2026-09-25. He was answering Atlas's "Do you approve `--invite <code>`?", put with Relay's D-003 question verbatim ("when a new seat needs a name on the hub, how should it get one?") and Relay's recommendation quoted in full: `hub-talk --as <name> --init-key --invite <code>`, the code sent only on that one register, every other hub-talk command byte-identical, and Aaron issues a code before a new seat is created. Atlas's own recommendation was also yes, and it added a request, taken into the brief's acceptance A: each refusal names its condition (no code, expired, used). Relayed Atlas -> Relay by cross-session message, same evening. SCOPE: approves the option only. It does NOT choose between a one-command and a chat-page-button way of issuing codes; that stays with Loop 6's design (brief scope 1). Any further hub-talk change is a new D-003 question. Recorded in docs/loops/loop-6-enrollment-brief.md, section 'hub-talk: --invite'.
- 2026-09-25 — Cross-account rooms are not in Loop 6; Loop 6 enrolls agents into their owner's own account only — Relay, session 18, planner scoping ruling in docs/loops/loop-6-enrollment-brief.md (Ruling section). The record disagreed with itself: loop-5-design.md:54-55 and loop-5-ruling-1.md:35 say cross-owner rooms come 'by invitation in Loop 6'; D-011 step 4 and T-067 say Grok Bot joins Aaron's account and cross-account rooms 'come after'. RULED: after. D-011's test does not need them (Grok Bot and relay share an owner); they are a second capability, and bundling would make a Loop 6 failure harder to localise. Loop 5's createCheck keeps refusing cross-owner rooms in strict until then. Does not change D-010: Aaron's 'yes, cross-account rooms by invitation' carried no timing and stands. Corrects the two Loop 5 texts above (append-only; they are not edited).
- 2026-09-25 — Correction to D-011's order: strict comes only after Loop 5 is deployed in warn AND an [authz] soak; the read-only log must see [authz] — Relay, Loop 5 ruling 1 (docs/loops/loop-5-ruling-1.md), additions A1 and A2. Reason: Loop 5 adds new checks that log `[authz] WOULD REJECT ...` in warn, and T-064's read covers only `[auth]` (key validity) on v1.10.0. Flipping strict before an [authz] soak would refuse any seat (SIA's included) acting outside its own name or rooms without warning, e.g. hub-talk --session with a pasted room id. Also, the T-065 read-only auth-log greps the literal `\[auth\]`, which `[authz]` lines do not match, so the soak would be blind (A1: add an `authz-log` item or widen auth-log, a tcm script change in Loop 5's deploy act on Aaron's word; a 7th item needs one more exact allow rule on his word). CORRECTED ORDER (supersedes D-011's): Loop 5 build and QA -> T-064's [auth] read -> Loop 5 deploy in warn (with assignOwnerAtDeploy) -> [authz] soak, one working day -> AUTH_MODE=strict -> Loop 6 -> Funnel -> the Grok Bot test. G-001 unchanged: no public address before strict.
- 2026-09-25 — The first outside-agent test is Aaron's Grok Bot on a cloud VM registering over HTTPS, never via his tailnet; route: Loop 5, T-064, strict, Loop 6, Funnel, test — Aaron, Relay session 17, verbatim: "We started down that road by stopped, it's my grok bot running on a vm in the cloud. I don't want to expose grok bot to my tailnet network. I want grokbot to register via https as the first outside agent test of the hub", then "yes, and record the important detail of this conversation so future planner agents see it". SUPERSEDES for this test T-002's tailnet-adjacent ideas: no tailnet join, and no Tailscale node sharing (Relay had offered it; Aaron wants HTTPS). BLOCKING FINDING (Relay, src/auth.ts:95-116 at c4d2d1c): in AUTH_MODE=warn an unknown X-Agent-Key is allowed as nobody, so ANY public address before strict = an open hub (anyone reads and posts every room without a valid key). ORDER, each on Aaron's word: (1) Loop 5 (T-066): identity on every path + room membership + the owner's view (brief docs/loops/loop-5-identity-and-membership-brief.md); (2) T-064's day-long log read (after 2026-09-26 ~04:30Z); (3) AUTH_MODE=strict on tcm, its own act; (4) Loop 6 (T-067): one-time enrollment codes replacing open /a2a/register (Grok Bot joins Aaron's account; cross-account rooms come later per D-010), basic rate limiting (T-005), clean error pages (T-062); (5) Tailscale Funnel on tcm publishing only port 4000 over HTTPS at a *.ts.net name (Relay's recommendation for the TEST; hub.tarrantcountymakerspace.com stays reserved for the public launch; one command turns Funnel off; T-057's 0.0.0.0:4000 binding is reviewed before it); (6) the test (T-068): Grok Bot runs --init-key with an enrollment code against the HTTPS URL, then talks to relay in its own room and sees nothing else.
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
