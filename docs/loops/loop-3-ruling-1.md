# Loop 3 — ruling 1 on Rivet's design

**Date:** 2026-09-24 · **Author:** planner seat (Relay), session 16 · **On:** Rivet's
`docs/loops/loop-3-design.md`, `origin/loop/3-per-agent-keys` at `d8962da`, against the brief at
`fe0ef05` (Amendment 1 included). Code references are to `ea9d057`.

## Ruling: approved in direction; revise R1 and R2, then build

The design meets the brief everywhere except two places, both about ownership over time. Revise
those two and it is approved to build once the SIA hold lifts. What decided the rest:

- **The rules live in the mutation** (§1.3). The check and the write commit together, and a direct
  Convex caller cannot skip them. That is the right place, and it is why §9's port finding matters
  less for keys than it would have.
- **Client-generated keys** (§3.1) remove the path by which a key reaches a transcript, rather than
  guarding it. That meets O6 by construction.
- **Every refusal leaves the stored hash unchanged** (§7 table). K8 then does not depend on the
  order in which the rules fire.
- **The bootstrap key is refuted with an instrument that looked** (`git log --all -S` across every
  code path, with the seven doc sites listed). T-003's note will be corrected.

Claims Relay checked rather than took: U3's safety argument holds at `ea9d057`. `req.agentName` is
read only at `src/index.ts:79` (the ask gate) and `:413` (the self-skip), and `evaluateAsk` allows a
null asker (`src/ask-policy.ts:12-13`). With a null caller the self-skip matches nobody, and every
participant goes to the ask gate, which allows. So U3 can only loosen, never block.

---

## R1 (blocking). Ownership must be stored, not derived from how many names share a hash

§1 defines **owned** as "the stored hash is held by no other name", and that is recomputed on every
call. So **when the second-to-last holder of a shared hash migrates, the last holder becomes owned
without doing anything.** Two failures follow:

1. **The last seat cannot migrate.** Its `--init-key` is now "`N` owned, `H` differs", so C7
   returns 409. On the local stack this is certain on first run, where alice and bob share the
   `dev-key`. Whichever daemon registers with its new key first migrates. The other is then the
   sole `dev-key` holder, and it is refused. On tcm it is whichever of the 8 names goes
   last (probably an abandoned one).
2. **The `dev-key` authenticates again.** With one holder, U3 no longer applies. `getByKeyHash`
   resolves the public string `dev-key` to that name, and U2's strict refusal no longer fires
   because the hash is not shared. **Strict would admit it.** K7 would catch this, but only at the
   end. Between those points the design has produced exactly what the loop exists to remove.

**Requirement:** a name's status (owned, or not yet migrated) is a stored property. It is fixed when
the name acquires a key under the new rules (insert, migration, rotate), not recomputed from a
count. **A hash that was shared when the new code deployed never becomes owned by attrition, and the
`dev-key` hash resolves to no name for as long as any row holds it, even one.** Rivet chooses the
mechanism, for example a field set on acquire, with rows present at deploy classified once.
`cursor-grok` and `grok-probe` (unshared at deploy) may be classified owned. Say which.

**Acceptance (Gauge):** on a throwaway stack with three names sharing one short key, migrate two.
The third still migrates by `--init-key`, and the shared key resolves to no name at every step
(before, after one migration, after two). Both directions: the migrated names' own keys resolve to
them.

## R2 (blocking). The client cutover must not be a flag day

§3.5.1 removes hub-talk's default key. The new hub-talk exits 1, with no network call, when a seat
has no key file. **`~/Projects/A2A-Hub` is every SIA seat's hub-talk** (V-001). So the moment the
main checkout is updated, every seat without a key file stops talking at once. §4.2 does not place
the main-checkout update at all.

**Requirement:** §4.2 says when the main checkout is updated, relative to the deploy and to each
seat's `--init-key`. It must also say how a seat gets its key file before its hub-talk changes
under it. One way: run `--init-key` for each name from the new client in a seat worktree, then
update the main checkout. With that sequencing, no working seat loses its line to the hub at any
step. The brief's preservation list requires this, and Grok's A6 dependence on tcm this morning is
the live case.

## Rulings on §10

1. **U3: accepted,** with R1. It is the property that stops the `dev-key` resolving to `atlas` on
   deploy, and it only loosens askPolicy, which Relay checked.
2. **The key floor as the structural `dev-key` refusal: accepted,** as one layer, not the whole of
   it. The floor stops a name *acquiring* the `dev-key`. R1 is what stops a grandfathered holder
   from *keeping* it as an identity. Both are needed.
3. **The name-format rule (§6): struck from this loop.** It changes what registration accepts for
   SIA seats and outside bots, and the brief did not ask for it. Loop 3 stays bounded. It is
   recorded as a task for when exposure makes look-alike names matter.
4. **§9 triage:**
   - **Convex published on `3210:3210`:** opened as its own task, P1, and it gates exposure (T-002
     step 5). The first step is a read-only check of tcm's live compose and listening ports, which
     needs Aaron's word in manual mode. Not bundled into Loop 3.
   - **Other caller-asserted identities** (heartbeat `:agentId`, message `from`, task claim
     `agentName`): opened as one task, P2, for the class. Checking them the way condition 5 checks
     `/read` becomes possible once T-003 lands.
   - **The `HUB_BOOTSTRAP_KEY` docs** (§0's seven sites): **in scope,** as part of this loop's doc
     repair, alongside `joining-the-hub.md:137-141`. Docs only.

## Questions for Aaron, routed by who depends on them

- **Q1 (the §3.5 hub-talk contract): shared with SIA, so it goes through the SIA planner (D-003).**
  Relay sends it after Rivet's revision, so that Aaron sees the final contract, cutover order
  included (R2).
- **Q2 (per abandoned name) and Q3 (the browser client's name): A2A-Hub-only, so they go to Aaron
  directly,** not through Atlas. Neither blocks the build.

## Notes, not blocking

- `hub-id` comes from `HUB_URL`'s host and port. A seat that reaches tcm by two spellings (`tcm`,
  the tailnet IP, the MagicDNS name) looks for its key in two directories. That fails loud (exit 1,
  "no key"), which is acceptable. Document the one spelling to use.
- §2.3's "the daemon must treat 403 on any hub call as fatal" is right for strict. In warn a
  superseded daemon exits on the 409 heartbeat as today. Make sure Gauge's K2 second-instance case
  asserts the warn path too (Amendment O2).
