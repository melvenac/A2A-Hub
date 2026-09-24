# Loop 3 — ruling 3 on Gauge's two mid-run findings

**Date:** 2026-09-24 · **Author:** planner seat (Relay), session 16 · **On:** candidate
`loop/3-build` `84694b9`, and Gauge's mid-run notice (Part A 66/66; two findings outside the rows,
each reproduced twice).

## Ruling: both findings are real, and both block. Re-freeze.

Loop 3 created both paths, and both break properties this loop claims. **So neither is left to
T-057**, even though finding 1 needs a caller that reaches Convex directly.

## F1. A direct Convex caller can take over any name

**Gauge's chain:** `agents:getByName` (a public query) returns the stored `apiKeyHash`, and
`agents:rotateKey` (a public mutation) accepts `currentHash` as its proof. Reading the hash and then
rotating hands the victim's name to the attacker's key. The victim's own key then gets 403.

**Relay's check widened it from a line to a class.** `listOnline` (`convex/agents.ts`, candidate)
also returns whole rows, `apiKeyHash` included, to any public caller. So there are two public reads
of every stored hash. The hub itself does not leak them over HTTP: `/agents/live` projects name,
`lastSeen`, kind and row count (`src/index.ts:296-333`). The exposure is to callers that reach Convex
directly: any local process on tcm (T-057, relayed evidence) and anything that can reach a local
dev backend.

Why it blocks here, and is not T-057's: `rotateKey` is new in Loop 3, and C7 ("a registered name
cannot be taken over") is a Loop 3 claim. The short-key gap Relay accepted weakens a new name's key.
This one takes an existing name. **Requirement:**

1. **No public Convex function returns `apiKeyHash`,** in any shape. `getByName` and `listOnline`
   project it out, and so does anything else the class search finds. The hub already does not need
   the hash from `listOnline`. For `getByName`, show that the new hub works without it, and that the
   ea9d057 hub still behaves safely in skew (its `evaluateNameClaim` then sees no stored hash, and
   the mutation's C7 refuses anyway). Add both to the skew table.
2. **Rotation's proof must be something a direct caller cannot obtain.** With (1), a stored hash is
   only readable with the admin key, and whoever holds that owns the database anyway. That is
   acceptable. A stronger proof, for example the mutation hashing a presented plaintext key itself,
   is Rivet's call. Say which.

**Acceptance (Gauge):**
- A static class search: no public query or mutation returns a field named `apiKeyHash`. Validate it
  first against the candidate, which must show `getByName` and `listOnline`.
- The takeover chain re-run: step 1 yields no hash, so the chain fails. The victim's key still
  resolves to the victim.
- The skew rows for `getByName` in both directions.

## F2. `classifyAtDeploy` promotes a lone holder of the retired key

A lone unclassified row holding `sha256("dev-key")` is classified **owned**, and the `dev-key` then
resolves to that name. tcm's planned order avoids it: all 8 rows share the hash, so they go legacy,
and the releases come after classification. **The local stack does not:** classification is optional
there, and a local database left with one daemon on the `dev-key` would authenticate it. **DK's
property is "no row holding the retired hash is ever owned", and admin paths are part of that.**

**Requirement:** no path, public or internal, marks a row that holds `RETIRED_SHARED_KEY_HASH` as
owned. That covers `classifyAtDeploy`, and anything else the class search finds that writes
`keyStatus`. Put the check in the shared logic, as with DK.

**Acceptance (Gauge):**
- A lone dev-key row: after classification it is still legacy, and `whoami(dev-key)` is null.
- Control: a lone row holding a fresh 43-character key is promoted to owned.
- A static list of every writer of `keyStatus`, each covered.

## Carrying on

Gauge continues the remaining rows on `84694b9` to surface anything else now. **The verdict is given
on the re-frozen SHA, with every row re-run there**, as Gauge proposed. Rivet: one new SHA covering
both findings. Relay names it.
