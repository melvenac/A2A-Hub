# Loop 3 — ruling 4: acceptance

**Date:** 2026-09-24 · **Author:** planner seat (Relay), session 16 · **On:** Gauge's report
`docs/loops/loop-3-qa-report.md`, `qa/loop-3-harness-keys` at `b6f1cef`, for the candidate
`loop/3-build-r3` at `fe4eb14` (v1.9.0).

## Ruling: Loop 3 is ACCEPTED on `fe4eb14`

Every row passed on `fe4eb14` itself, on fresh deployments: rows A–F 122/122, H1 after a restart,
H3.2, K3 (the mutant is killed), N.4 (Loop 1's rows, with A4 recorded as replaced, not skipped), K6
clean apart from the one granted exception, and P1–P10. Three findings came up during the run, and
all three were fixed and re-verified in the verdict SHA:

- **F1:** hash exposure plus `rotateKey` takeover (ruling 3);
- **F2:** classification promoting the retired key (ruling 3);
- **F3:** the B1.2 rule missing from `joining-the-hub.md`.

## H4.2: the criterion's wording is corrected, not widened

H4.2 required `hub-key.mjs copy` to print exactly `copied key for aaron@<hub-id> (prefix xxxxxxxx)`,
a string Gauge copied from design §12. The candidate prints `copied key for aaron@<hub-id> to the
clipboard (prefix xxxxxxxx)` (`scripts/hub-key.mjs:330`, read by Relay).

**What H4.2 protects** is that the command prints one line, carrying the name, the hub and an
8-hex prefix, and nothing key-shaped. Gauge verified every part of that: one line, the prefix
matches the stored hash, no key-shaped run, the clipboard equalled the key file, and it was then
emptied. The three extra words carry no information about the key. **Relay rules that the exact
string in §12 was over-specified.** The protective properties are the criterion. That is a
correction to what the row checks, made because the difference is not a property. It is not a pass
obtained by widening a property. Gauge was right to report it rather than decide it. The clipboard
step ran once, 21:36:31Z–21:36:34Z, on Relay's go after Aaron's "yes".

## Observations, carried forward, none blocking

- Convex echoes a failed call's arguments into its log. Loop 3 sends Convex hashes, never keys, but
  a hash sent to the wrong function lands in that log. Carried to T-057 (the direct-caller class).
- In v1.9.0 `convex/peers.ts` also reads the agents table, for error text only. D-007's statement
  that only `convex/agents.ts` touches that table was true at `ea9d057`. Its conclusion, that a
  release leaves peers, sessions and messages intact, is unaffected (REL passed).
- `scripts/verify-client-stack.mjs` hardcodes `:4000`, the main hub's port, and was checked
  statically only. It is a sibling of the port hazard. Noted for triage, not bundled.

## What follows, each on Aaron's word

1. **Merge:** Rivet's `loop/3-build-r3` and Gauge's `qa/loop-3-harness-keys`, as few PRs as
   sensible (no CI runs in A2A-Hub). Tag `v1.9.0` after the merge.
2. **Live local start (N.5(b)):** alice and bob get key files and migrate, and the browser page
   gets `aaron`'s key.
3. **tcm cutover, design §4.2:** the pre-deploy read, the deploy act (Convex push,
   `classifyAtDeploy`, the four unused releases, the hub), relay as canary, then atlas, forge and
   grok in a SIA-named window (not during A7), the main-checkout update after `hub-key check`, and
   K7's reads.

T-003 stays open until K7's end state is read on tcm.
