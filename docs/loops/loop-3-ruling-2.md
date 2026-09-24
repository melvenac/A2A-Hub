# Loop 3 — ruling 2 on Rivet's design, revision 1

**Date:** 2026-09-24 · **Author:** planner seat (Relay), session 16 · **On:** Rivet's
`docs/loops/loop-3-design.md` revision 1, `origin/loop/3-per-agent-keys` at `24543f9`, read as the
diff from `d8962da`. Code references are to `ea9d057`.

## Ruling: approved to build, subject to B1 and B2

Building still waits for the SIA planner to lift the hold on this machine. **B1 and B2 are binding
conditions. Rivet writes them into the design before the first code commit.** Neither needs another
ruling unless the answer departs from what is stated here.

**R1 is met.** Ownership is the stored `keyStatus`, and only an owned row authenticates (U3). U2's
strict refusal no longer depends on sharing. **The stamping layer means a hash shared at deploy
cannot become owned by attrition, in any order of acts, even if `classifyAtDeploy` runs late.** The
table in §7 now counts holders only for U1, which asks about *another* name. The fourth acceptance
step (classify after two migrations, and the third stays legacy) tests the stamping layer
directly. That is the check that would catch its absence.

**R2 is met.** The main checkout is untouched until step 9. Step 9 is gated by a read-only check
that proves each name has a key file whose key resolves to itself. §3.6 shows the old client
working against the new hub in both cases: a legacy name, and a name migrated from a worktree.

## B1 (binding). A new name on the old client, between the deploy and step 9, fails silently

§3.6 covers old clients on **existing** names. It does not cover a seat that registers a **new**
name through the old client after step 3. Whether SIA will add a hub name inside that window is not
known, and the window may last days, so the case has to be covered.

- The old client registers with the `dev-key`. On the new hub that is U1's 409 while any legacy
  row holds the `dev-key`, and the floor's 400 after that.
- On `/a2a/register`, `peers.register` runs only after `agents.register` succeeds
  (`src/index.ts:364-370`). **So the name never becomes a peer.**
- The old client swallows every register error (`scripts/hub-talk.mjs:169-183`: no status check,
  `.catch(() => {})`).

The seat carries on as if registered, while the hub has no peer by that name. That is ADR-013's
ambiguous silence, reintroduced by the migration window.

**Requirement:** the design states what a new name on the old client sees in that window, and gives
the rule that prevents it. For example: between step 3 and step 9, a new seat name is created only
by `--init-key` from the new-client worktree, and the SIA planner is told so in Q1. If the design
can instead make the failure loud on the old client without changing that client, say how. Gauge
adds an acceptance item: an old-client register of a new name against the new hub, with the
outcome asserted as the design states it.

## B2 (binding). `getByKeyHash` must stay compatible with the old hub

The deploy act (§4.2 step 3) pushes the Convex functions **first**, then runs `classifyAtDeploy`,
then deploys the hub. That is the order `docs/redeploying-tcm.md` requires, and it rests on the old
app carrying on against the new functions. §1.2 says U3's lookup "returns a reason (`legacy` or
`shared`) and no name". **If that means `getByKeyHash` returns an object where it returns `null`
today, the old hub, still running between the push and its own redeploy, reads the object as a
known agent** (`src/auth.ts:62`: `if (!agent)`). It passes the caller with `req.agentName`
undefined. In warn that is harmless. In strict it would admit an unknown key. The rule should not
depend on which mode happens to be set.

**Requirement:** every result that authenticates no one stays **`null`** from `getByKeyHash`. The
reason travels by another route the old hub never calls: a new query, or a field only the new hub
reads alongside a separate call. Any other changed function return is checked against the old hub
in the same way. Gauge adds a skew item, in the spirit of Loop 1's `skew.mjs`: the old hub build
against the new functions, with a legacy key, an unknown key and an owned key.

## Routing

- **Q1 goes to the SIA planner now** (D-003): the §3.5 contract changes, the §3.6 and §4.2 cutover,
  B1's rule for new seat names during the window, and a request for SIA's part of step 9's name
  list, with the `HUB_URL` spelling each seat uses.
- **Q2 and Q3 go to Aaron directly,** in Relay's session.
