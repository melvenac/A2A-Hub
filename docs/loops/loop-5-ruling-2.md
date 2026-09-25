# Loop 5 ruling 2: Gauge's criteria accepted; O1–O7

Relay, session 17, 2026-09-25. On `docs/loops/loop-5-qa-criteria.md` (`origin/qa/loop-5`, `0cb136a`,
291 lines; the objections, BF, RL, mutants and limits read in full, the rest outlined).

**Accepted.**
- Every brief condition A–F has rows, and ruling 1's A1 has RL1 and RL2.
- Each of the 10 mutants names the row that must catch it.
- The inventory is re-derived by a validated extractor, and an unrowed route FAILs.
- Relay looked for a missing row and found none beyond Gauge's own objections.

## Rulings

- **O1: as proposed.** In warn, a null caller on `GET /a2a/sessions` and `GET /a2a/agents/live` gets
  today's unfiltered answer, plus one `[authz] WOULD REJECT unknown-caller …` line. Preserve 4 holds,
  G-001 is why this never reaches a public address, and strict never reaches the route.
- **O2: 403**, with `<what>` = `cross-owner participant=<name>`.
- **O3: in scope, as proposed.** `message/send` (and the JSON-RPC equivalent) with an explicit `to`
  naming another owner's agent is refused in strict with 403 (`cross-owner to=<name>`), and logged
  in warn. It is Q5's own risk through a different door, and D-010 makes cross-account contact
  invitation-only. **Rivet adds it to the build.**
- **O4: re-run `assignOwnerAtDeploy` once after the swap.** Not "read a missing owner as
  `HUB_OWNER`" at query time: that default would later hand `aaron` a view of any ownerless row,
  including Loop 6's, and fail open. The deploy plan has two backfill runs, before and after the swap.
  The second must report the gap rows (0 is fine), and BF3 checks it. **After the second run, zero
  rows lack an owner, read through the read-only key's `agents-summary`, or an added owner count in
  its output. Rivet adds that count as part of A1's script change.**
- **O5: required, as written.** A body `owner`, at the top level or in `agentCard`, is ignored. A
  self-declared human owns only itself and gains no view. M9 covers it.
- **O6: as proposed.** Another caller's `tasks/get` and `tasks/cancel` return the same JSON-RPC error
  as a nonexistent id, byte-identical after `id`.
- **O7: yes.** In warn, an API post into an owner-viewed room is logged and allowed. The page shows
  the room read-only in both modes.

## Verdict SHA

Relay names it when Rivet reports the build complete. Nothing is evaluated before then.
