# Loop 2 — revocation on tcm's live database: report (T-001)

**Date:** 2026-09-24 · **Author:** Relay (planner seat), session 16 · **Brief:** `loop-2-revocation-brief.md`

**Who ran it and on whose word.** The brief assigned the read to Rivet. Rivet could not be launched
under the SIA hold (no new A2A-Hub seats on this machine). Relay asked Aaron, and Aaron ruled in
this session, 2026-09-24, verbatim: **"you do it, turning on manual mode"**. Aaron approved each tcm
command in manual mode. This is the planner seat touching live data, **read-only**, on that ruling.

## Verdict

**Revocation holds on tcm for superseded keys.** No agent name has more than one row, and no hash
survives on a row that is not its name's current one. Read at 2026-09-24T03:27:59Z.

**But for 8 of the 10 names there is nothing to revoke per agent.** They all hold the same `dev-key`
hash, and `getByKeyHash` resolves that hash to `atlas` for all 8. That is T-003's problem, now
measured on the live database. Details under Q3.

## Answers

Source: `convex data agents` on tcm, 10 rows returned under `--limit 8000`, so the whole table was
read (the analyzer warns when the count reaches the limit). Rows were created between
2026-09-20T23:42:14Z and 2026-09-23T20:36:00Z.

1. **Rows per name:** 10 names, 10 rows, one row each: relay, cursor-grok, grok, grok-probe, cursor,
   clark, general, probe, forge, atlas. Session 14's figure of about 39 rows for about 5 agents no
   longer holds. The `register` collapse ran as designed, and every name has re-registered since.
2. **Hashes per name:** no name has more than one row, so every name has exactly one hash.
3. **Names per hash:** one shared hash, `7e9f8fd1…`, which is `sha256("dev-key")`. It is held by 8
   names: relay, grok, cursor, clark, general, probe, forge and atlas. Only `cursor-grok` and
   `grok-probe` hold keys of their own. Under `.first()` on `by_apiKeyHash` (creation order),
   **the `dev-key` resolves to `atlas` for every caller.** So on tcm, `req.agentName` is `atlas` for
   every request made with the `dev-key`, whoever sends it.
4. **Stale hashes that still resolve:** none.
5. **`AUTH_MODE` on tcm:** `warn` (read with `docker exec a2a-hub printenv AUTH_MODE`, rc 0).
6. **Sibling consumers:** for every name, `getByName`'s `.first()` row is the canonical row. So name
   claims and heartbeats read the current row.

**Consequence where the code runs.** On tcm today: warn mode lets every key through, and the `dev-key`
authenticates as `atlas`. Flipping to `AUTH_MODE=strict` now would reject nothing that uses the
`dev-key`. Revoking the `dev-key` would lock out all 8 names at once. **Strict means nothing until
T-003 gives each agent its own key.** The earlier finding, that a GET-marks-caller mutant survives
under the shared key (T-003 note), has the same root: identity collapses to one name.

## Instrument

**A local analyzer summarised the rows streamed from tcm.** It printed counts and 8-character hash
prefixes only. No full hash, key or `agentCard` entered the transcript, a file or this report.
Canonical row = newest `lastSeen`, ties broken by `_id`, the same rule `register` uses. `.first()`
order = `_creationTime` ascending.

**Validated before use against a synthetic known positive:** a two-row name with a superseded hash,
two names sharing the `dev-key`, and one non-JSON line. It flagged all four classes: stale, shared,
misresolving and `getByName` mismatch. **The live known positive also fired:** the `dev-key` hash
was present, as the brief predicted from `scripts/hub-talk.mjs:65,175`.

**It fails closed.** The first attempt (`--limit 100000`) failed server-side ("Requested too many
items: 100001"). The analyzer reported *undetermined, no rows parsed* and did not read the empty
input as an empty table.

## Every command run on tcm, in order (all read-only)

| UTC | Command | Result |
|---|---|---|
| 03:27:17 | `GET http://tcm:4000/health` (from the workstation) | ok, convex 14 ms |
| — | `docker exec a2a-hub printenv AUTH_MODE` | `warn` |
| ~03:27:34 | `cd ~/projects/a2a-hub; CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210; CONVEX_SELF_HOSTED_ADMIN_KEY=$(docker exec convex ./generate_admin_key.sh \| tail -1); ./node_modules/.bin/convex data agents --limit 100000 --format jsonl` | failed: limit too large; no rows |
| 03:27:59 | the same with `--limit 8000` (and `2>/dev/null` on the key script) | 10 rows, rc 0 |
| 03:28:29 | `GET http://tcm:4000/health` | ok, convex 4 ms |

No mutation, `deploy`, `import`, `run` or `register` was invoked. `convex data` lists documents only.
The admin key was generated inside tcm's shell and never printed. The redacted stderr confirms that
only its label appeared.

## Observations outside the question (not ruled here)

- **Every row says `status=online`**, including `clark` (last seen 2026-09-20) and `cursor-grok`
  (2026-09-21). Nothing marks an agent offline: at `ea9d057`, `offline` appears in `convex/`,
  `src/` and `scripts/` only in the schema's union (`convex/schema.ts:53`). A peer list built on `status` would show all 10 as
  present. That is the ambiguous-silence shape of ADR-013. Recorded for triage, not opened as a task.
