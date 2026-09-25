# Loop 5 ruling 1: design approved to build, with Q1–Q9 and two additions

Relay, session 17, 2026-09-25. On Rivet's `docs/loops/loop-5-design.md` (`origin/loop/5-identity`,
`6687e7c`, 257 lines, read in full). Brief: `docs/loops/loop-5-identity-and-membership-brief.md`
(`66b1e0d`).

## What Relay checked, at c4d2d1c

- **`denyNamedAsk` refuses in every mode** (`src/index.ts:73-88`: `evaluateAsk(...) === "deny"`
  gives 403, with no `authMode` in the path). So `askPolicy` has never been a warn-mode soft check.
  JSON-RPC skipping it is the defect (T-004), not a stricter new rule.
- **No live row can hold an `askPolicy`.** Only four files mention it: `src/ask-policy.ts`,
  `src/index.ts`, `convex/agents.ts` and `convex/schema.ts`. It is set only through `registerAgent`'s
  optional argument (`convex/agents.ts:114-124`), which no hub route or script passes. The T-003
  step-2 read found none on all 10 rows, including `cursor-grok` and `grok-probe`, which are
  unchanged since. The four rows made on 2026-09-25 (`relay`, `atlas`, `grok`, `aaron`) came through
  the hub, which passes none. **Q9's parity changes nothing live.** Gauge confirms on the scratch
  stack; no pre-build tcm read is needed.
- **The design's siblings are real and in scope:** `agents/live` (#9), A2A tasks by id (#19),
  escalation to any owner (#4), and a create naming another owner's agents (#10).

## Ruling: approved to build. Q1–Q8 as recommended; Q9 as recommended, with the reason corrected

- **Q1: yes.** The owner view is read-only. The page shows a room `aaron` isn't in as read-only.
- **Q2: yes.** Strict answers 404 for a session or task the caller may not see.
- **Q3: yes, bound to G-001.** The interim `HUB_OWNER` default (`aaron`) means that, while
  `register` is open, any new registrant becomes `aaron`-owned: his page would see its rooms, and
  escalation would treat it as his. That is acceptable **only** because the hub has no public address
  until strict and Loop 6 (G-001, D-011). Loop 6's enrollment code replaces it. The design says so in
  §4.
- **Q4: yes.** `agents/live` is filtered to the caller's owner.
- **Q5: yes.** Escalation with no `to` picks only the caller's owner's agents, and `notifyHuman`
  relays only callers `aaron` owns.
- **Q6: yes.** A create includes the caller, and in strict every participant shares the caller's
  owner. Cross-account rooms come by invitation in Loop 6.
- **Q7: yes.** `demo-loop.mjs` runs with alice's own key (local only).
- **Q8: yes.** Only `assignedAgent` responds, claimed or not, and completion keeps `assignedAgent`.
- **Q9: parity (refuse in warn too).** This does **not** conflict with Preserve 4. Preserve 4 governs
  *new* checks; `askPolicy` is an existing rule the legacy route already enforces in every mode, and
  JSON-RPC's gap is the bug. Brief Preserve 4 is to be read that way.

## Additions (binding)

**A1. The read-only log must see `[authz]`.** `a2a-readonly`'s `auth-log` greps the literal
`\[auth\]` (T-065), and `[authz]` does not contain that string. The soak read before strict would
be blind to every Loop 5 line. Rivet chooses one of two fixes:
- a seventh menu item, `authz-log`, built the same way (count, first and last timestamps, and
  mask, with no silent cap);
- or `auth-log` covering both prefixes, with separate counts in its header.

This is a change on tcm (script plus hash), shipped in Loop 5's deploy act on Aaron's word. If a
seventh item is added, it needs one more exact allow rule on Aaron's word. Gauge re-runs T-065's N
and L rows on the new script.

**A2. The soak before strict covers `[authz]`, not only `[auth]`.** T-064's read (a working day
after the T-003 cutover) is of `[auth]` lines on v1.10.0. Once Loop 5 is deployed in warn, a
**second soak** reads `[authz]` lines for a working day before `AUTH_MODE=strict`. That catches any
seat, SIA's included, that acts outside its own name or rooms (for example `hub-talk --session`
with a pasted room id, design §1). **So D-011's order becomes:** Loop 5 → T-064's `[auth]` read →
Loop 5 deploy (warn) → `[authz]` soak → strict → Loop 6 → Funnel → test. Strict never precedes the
`[authz]` soak.

## Unchanged

Everything else in the brief stands. Merging, tagging, the deploy, the backfill run and strict each
need Aaron's word for that act.
