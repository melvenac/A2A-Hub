<!-- generated from .agents/state.json rev 30 by open-brain v1.8.0 — do not edit; change state via ob_state -->

# Inbox

Legend: `[ ]` open · `[~]` in_progress · `[!]` blocked

Titles only. Full rationale for a task is its `note` in `.agents/state.json` under `tasks[]` — read it when you work the task, not when you pick one.

## P0

- [ ] **T-003** Per-agent key generation + rotation

## P1

- [ ] **T-002** Onboard a truly remote agent
- [ ] **T-004** askPolicy is not enforced on the JSON-RPC path
- [ ] **T-005** Rate limiting and abuse protection
- [ ] **T-006** On-demand spawn
- [ ] **T-007** Two cheap repo-peer measurements
- [ ] **T-008** `hub-talk` exit code 1 means two opposite things
- [ ] **T-017** `--inbox` then `--wait` re-delivers turns already read (two cursors disagree)
- [ ] **T-050** Wake an idle IDE seat that has an unread turn in its room
- [ ] **T-057** Convex may be reachable from the tailnet on 3210, bypassing the hub

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

## Done (last 3 sessions)

- [x] **T-001** Verify revocation against the live database (session 16) — Read-only on tcm 2026-09-24T03:27:59Z by Relay, on Aaron's word this session, verbatim "you do it, turning on manual mode" (the brief assigned Rivet; the SIA hold barred launching Rivet). Report: docs/loops/loop-2-revocation-report.md. 10 names, 10 rows, no stale hash: revocation of superseded keys holds (V-003). The dev-key finding moves to T-003.
- [x] **T-049** Read receipts: a sender can see a turn is unread by participant X, and since when (session 15) — SIA requirement R-a (SIA T-160, evidence at SIA 4e334d8). On 2026-09-23 Atlas sent turns 6 and 7 into room k579hndqdr1mxnahy0px1dy8ks8eyef3; Grok 4.7 in Cursor, holding SIA's developer seat, was idle and never read them. The send receipts were true and said nothing about reading, so neither side could tell; Aaron found it by looking at the Cursor window. Today the only read cursor is client-side (scripts/hub-cursor.mjs, a local file written only by --wait); the server holds no read state, checked at f7f102d. Requirement: visible to the sender with no client-side change needed to see it. ADR-013's class: silence that cannot tell 'no messages' from 'no listener'. WHAT MARKS A TURN READ (SIA's requirement, from Atlas as customer, 2026-09-23): read means delivered into the AGENT'S context, not fetched by a process. A background listener or daemon that consumes turns for a seat whose model never sees them would make receipts lie in exactly the Grok case. The honest reader is the seat's own foreground hub-talk (--inbox or --wait) whose output the agent reads. If a design cannot tell these apart, the row states it as a named limit. How it is met is this repo's call. IDENTITY LIMIT, accepted by SIA as customer (Atlas, 2026-09-23): under the shared dev-key any seat can mark turns read as any participant, so 'unread by X' means unread by whoever uses the name X. SIA accepts this for local trusted seats until T-003, because it needs to tell silence from absence, not to authenticate. This is SIA's acceptance with its limit, not a property of the feature. Live use needs a tcm redeploy (D-003 coordination).
- [x] **T-051** `hub-talk --peer <name>` registers the peer's name, rewriting its agent card (session 15) — Found 2026-09-23 by Grok (SIA rulings-8), confirmed at scripts/hub-talk.mjs:220 on f7f102d: `if (PEER) await register(PEER)`. Naming a peer overwrites that peer's registration with hub-talk's defaults. Seats use --session only as a workaround. hub-talk.mjs is load-bearing for every agent; removing the call changes what --peer does for a peer that is not yet registered, so the fix states that case.
- [x] **T-040** Validate `X-Agent-Key` (session 14) — keys resolve against the stored hash; `AUTH_MODE=warn` logs rejections without enforcing. `95ca5c6`, PRD §8.1 (Session 14)
- [x] **T-041** Name ownership + daemon instance supersede (session 14) — PRD §8.2 partial: names are owned via `apiKeyHash`, and a daemon's `instanceId` supersedes an orphaned predecessor, which closes the two-daemons-race-one-name bug. Full `owner/name` namespacing waits for per-agent keys. `95f2433`, ADR-011 (Session 14)
- [x] **T-042** "Who may ask this peer what" (session 14) — optional `askPolicy`, absent = allow-all. `d9dfaed`, ADR-012, PRD §8.3. JSON-RPC gap tracked at P1 (Session 14)
- [x] **T-043** `agents.register` upserts (session 14) — patches a canonical row and deletes the extras; live-data verification tracked at P0 (Session 14)
- [x] **T-044** Shipped v1.7.0, tagged and deployed to tcm (session 14) — all three §8 prerequisites, the spec JSON-RPC transport, a truthful agent card (Session 14)
- [x] **T-045** Fixed the seat transport silently dropping turns (session 14) — the cursor is now a turn number only a print moves; `--inbox` reports without consuming (Session 14)
- [x] **T-046** ADR-013 (session 14) — **ambiguous silence must fail closed** (Session 14)
- [x] **T-047** Recovered the split-deploy outage and wrote `docs/redeploying-tcm.md` (session 14) — (Session 14)
- [x] **T-048** `docs/joining-the-hub.md` (session 14) — how a third-party agent registers, from a live probe (Session 14)
