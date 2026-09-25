<!-- generated from .agents/state.json rev 50 by open-brain v1.10.0 — do not edit; change state via ob_state -->

# Inbox

Legend: `[ ]` open · `[~]` in_progress · `[!]` blocked

Titles only. Full rationale for a task is its `note` in `.agents/state.json` under `tasks[]` — read it when you work the task, not when you pick one.

## P0

- [ ] **T-066** Loop 5: a key acts only as itself, and only in its own rooms (identity + membership + owner's view)

## P1

- [ ] **T-002** Onboard a truly remote agent
- [ ] **T-004** askPolicy is not enforced on the JSON-RPC path
- [ ] **T-005** Rate limiting and abuse protection
- [ ] **T-006** On-demand spawn
- [ ] **T-007** Two cheap repo-peer measurements
- [ ] **T-008** `hub-talk` exit code 1 means two opposite things
- [ ] **T-017** `--inbox` then `--wait` re-delivers turns already read (two cursors disagree)
- [ ] **T-050** Wake an idle IDE seat that has an unread turn in its room
- [ ] **T-057** Convex is callable without the hub: tracked compose publishes 3210 on all interfaces; on tcm, any local process can call it
- [ ] **T-061** Chat UI served by tcm's hub (Loop 4, v1.10.0)
- [ ] **T-067** Loop 6: enrollment codes replace open registration; rate limiting; clean error pages
- [ ] **T-068** First outside-agent test: Grok Bot (cloud VM) registers over HTTPS via Funnel and talks to relay

## P2

- [ ] **T-009** Confirm the myvps host-key change before any VPS work
- [ ] **T-010** Redeploy hub + Convex on VPS with docker-compose profiles
- [ ] **T-011** Real-network failure modes
- [ ] **T-012** Scoped Bash for repo peers
- [ ] **T-013** Test a citation self-check in `repoConventions`
- [ ] **T-014** Vague questions get sloppy citations
- [ ] **T-015** Repo → peer discovery
- [ ] **T-016** Decide the entrance shape
- [ ] **T-018** `start-stack.ps1`: Convex window loses its title
- [ ] **T-019** `start-stack.ps1`: clean up orphaned A2A windows
- [ ] **T-020** Raise `start-stack.ps1`'s Convex readiness wait
- [ ] **T-021** Experience dedup
- [ ] **T-022** npm wrapper package
- [ ] **T-023** End-to-end test with Brian
- [ ] **T-024** Structured end-of-conversation flag
- [ ] **T-025** Request validation middleware
- [ ] **T-026** A2A spec alignment
- [ ] **T-027** Repo-fix approval flow through the chat channel
- [ ] **T-052** Read receipts for a member who has left the room
- [ ] **T-053** Hub reports "running" and exits 0 when its port is taken
- [ ] **T-055** Malformed or unknown session id returns 500, not 4xx
- [ ] **T-056** alice daemon did not answer a relay turn on the local stack
- [ ] **T-058** Caller-asserted identities beyond /read (heartbeat, message from, task claim)
- [ ] **T-060** `start-stack.ps1` starts local Convex without --local-cloud-port
- [ ] **T-062** Express development error pages leak paths and stacks (no NODE_ENV on tcm)
- [ ] **T-064** Read tcm's hub log after a working day for WOULD REJECT legacy (T-003 second signal)

## P3

- [ ] **T-028** Client: session delete + bookmarks
- [ ] **T-029** PWA setup
- [ ] **T-030** Structured logging
- [ ] **T-031** Register dev agents on the hub
- [ ] **T-032** Orchestrator role
- [ ] **T-033** Multi-provider LLM abstraction
- [ ] **T-034** Makerspace website integration
- [ ] **T-035** Advanced escalation
- [ ] **T-036** SECURITY.md
- [ ] **T-037** Decide whether `scripts/register-agent.mjs` is still wanted
- [ ] **T-038** Resolve the stale Session 12 stub
- [ ] **T-039** Buzz is parked
- [ ] **T-054** Committed convex/_generated is stale (no instanceLogic); `convex dev` dirties the tree
- [ ] **T-059** Agent name format rule (look-alike and junk names)
- [ ] **T-063** Chat page: clearing the key box does not clear the stored key

## Done (last 3 sessions)

- [x] **T-003** Per-agent key generation + rotation (session 17) — CLOSED session 17 on K7 (V-006). Cutover 2026-09-25 03:57-04:27Z inside the SIA-named window, every act on Aaron's word, log docs/loops/t-003-cutover-log.md. Order as run: pre-deploy read; runner pause (Aaron, sudo); Convex push + classifyAtDeploy (8 legacy, 2 owned); release clark/cursor/general/probe/forge; build v1.10.0 with prev kept; PB pass; swap; PD pass; re-read (5 rows); runner resume (Aaron); relay canary; atlas and grok migrated (Atlas); main checkout to v1.10.0 (Rivet); aaron created (human); K7 pass. Rollback held on tcm: ~/projects/a2a-hub.old (v1.8.0), a2a-hub:prev 13aeef206f7b. Follow-ups: T-064 (second signal), T-060 and D-008 step 3 (local start), T-057 (0.0.0.0:4000 note).
- [x] **T-065** Read-only ssh key for tcm, enforced by a forced command (session 17) — CLOSED session 17 (V-007). Built by Rivet on Aaron's word ('set that up on tcm, manual mode is on'), every tcm write approved by Aaron in manual mode; accepted by Gauge; W ruled by Relay (a correction of the rule's wording). Menu: health, auth-mode, image, runners, auth-log, agents-summary. Call: ssh -i C:/Users/melve/.ssh/tcm-readonly -o IdentitiesOnly=yes melvenac@100.124.212.87 <item>. Keys on this PC only; never copy ~/.ssh/tcm-readonly. On tcm by design: ~/.ssh/authorized_keys.bak-t065-20260925, .bak-t065-g4, ~/bin/a2a-readonly.bak-t065-g1. Nit left: the line-5 comment in a2a-readonly predates from=. Found in passing: the Convex CLI retries forever against a dead port (now under timeout 60 in the script).
- [x] **T-001** Verify revocation against the live database (session 16) — Read-only on tcm 2026-09-24T03:27:59Z by Relay, on Aaron's word this session, verbatim "you do it, turning on manual mode" (the brief assigned Rivet; the SIA hold barred launching Rivet). Report: docs/loops/loop-2-revocation-report.md. 10 names, 10 rows, no stale hash: revocation of superseded keys holds (V-003). The dev-key finding moves to T-003.
- [x] **T-049** Read receipts: a sender can see a turn is unread by participant X, and since when (session 15) — SIA requirement R-a (SIA T-160, evidence at SIA 4e334d8). On 2026-09-23 Atlas sent turns 6 and 7 into room k579hndqdr1mxnahy0px1dy8ks8eyef3; Grok 4.7 in Cursor, holding SIA's developer seat, was idle and never read them. The send receipts were true and said nothing about reading, so neither side could tell; Aaron found it by looking at the Cursor window. Today the only read cursor is client-side (scripts/hub-cursor.mjs, a local file written only by --wait); the server holds no read state, checked at f7f102d. Requirement: visible to the sender with no client-side change needed to see it. ADR-013's class: silence that cannot tell 'no messages' from 'no listener'. WHAT MARKS A TURN READ (SIA's requirement, from Atlas as customer, 2026-09-23): read means delivered into the AGENT'S context, not fetched by a process. A background listener or daemon that consumes turns for a seat whose model never sees them would make receipts lie in exactly the Grok case. The honest reader is the seat's own foreground hub-talk (--inbox or --wait) whose output the agent reads. If a design cannot tell these apart, the row states it as a named limit. How it is met is this repo's call. IDENTITY LIMIT, accepted by SIA as customer (Atlas, 2026-09-23): under the shared dev-key any seat can mark turns read as any participant, so 'unread by X' means unread by whoever uses the name X. SIA accepts this for local trusted seats until T-003, because it needs to tell silence from absence, not to authenticate. This is SIA's acceptance with its limit, not a property of the feature. Live use needs a tcm redeploy (D-003 coordination).
- [x] **T-051** `hub-talk --peer <name>` registers the peer's name, rewriting its agent card (session 15) — Found 2026-09-23 by Grok (SIA rulings-8), confirmed at scripts/hub-talk.mjs:220 on f7f102d: `if (PEER) await register(PEER)`. Naming a peer overwrites that peer's registration with hub-talk's defaults. Seats use --session only as a workaround. hub-talk.mjs is load-bearing for every agent; removing the call changes what --peer does for a peer that is not yet registered, so the fix states that case.
