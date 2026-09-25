# Rules every seat holds

**Tracked on purpose.** These are not instance knowledge. A seat that learns one of these and writes
it into its own gitignored file has put it on one disk, invisible to a fresh clone.

**Where the rules come from.** Most are inherited from Self-Improving-Agent's
`.agents/roles/shared.md` (at `0d73fbe`), where each was paid for by a recorded failure. That
provenance lives in SIA's record and is not restated here. Rules sourced from **this** project's
record say so. Where an inherited rule turns out wrong for A2A-Hub, change it here, citing the
evidence.

---

## Measurement

**Verify against the thing, never against the report of it.** A success message is not the change
having landed. A read confirms only if it is ordered after the write actually finished.

**A chained shell command reports one outcome for several claims.** `check && commit` commits when
the check passes; `check; commit` commits regardless. `cmd | tail; echo $?` reports `tail`'s exit.
Run the check, capture its exit status in a variable, and gate the next step on that variable.

**An instrument that cannot tell "nothing there" from "I did not look" is not a measurement.** Your
own `grep`, `find -maxdepth`, `head` and filters are the likeliest liars in the room. **Validate a
detector against a known positive before you trust a negative.**

**Two measurements that disagree may both be right.** Check whether the target is moving before
arbitrating; resolve with a third measurement, not an argument.

**Every derived number carries what it was derived from** — the ref, the tree, the time. **Do not
copy a number out of the record into a second place;** point at it.

**A finding reported against a line is usually a finding about a class.** Look for the sibling
before you fix or report.

**Say the consequence that is true where the code runs.** A2A-Hub runs in at least three places: the
local stack, tcm, and a remote agent's host. A claim true on one is not true on the others.

## Instruments

**Build things that fail closed.** Every instrument that fails open (a `|| echo 0`, a swallowed
error, a blank over a real hit) will eventually report a clean result it did not earn.

**Ambiguous silence must fail closed** *(this project, ADR-013).* Five defects in Session 14 were
one class: a mechanism that looks healthy while losing information. The seat transport dropped turns
without error; `/health` returned 200 through a split-deploy outage. When a component cannot tell
"nothing happened" from "I lost it", make it say so.

**A check must prove it looked.** Report what was walked. Refuse on unresolved input. **Skip is not
pass; silence is not all-clear.**

**The instrument for structured data is a parser, never a pattern match.**

**Green on the first run is the signal to mutate.** Assert both directions. `tsc` clean is part of
calling a mutant valid, and assert the edit landed before running it.

**A ruling with no acceptance row fires nowhere.** A ruling that changes behaviour gets a test or a
QA criterion in the same change, or it is an intention with a number.

## The record

**Nothing that must outlive a session may live only in one.** Loop briefs, QA reports and close-outs
go in `docs/loops/`; decisions go through `ob_state`. **A tracked file that something must remember
to read is an intention; a check is a rule.**

**`.agents/state.json` is written only through `ob_state`.** `INBOX.md`, `task.md`, `next-session.md`
and `SUMMARY.md`'s marked region are rendered from it and are never hand-edited. **Read the dry run
before the real call, every time.** Do not take a revision while another seat holds the loop.

**Compaction removes things from context, not from disk.** Before writing that anything is
unrecoverable, grep the session transcript under `~/.claude/projects/`.

**Do not assert what you could derive or check.** A statement true when written, used as an
invariant, and falsified by an ordinary act elsewhere, is the commonest defect in the record layer.
*This project's instance:* the migration inputs on 2026-09-22 — `next-session.md` was Session 13's
and would have recorded as current a claim Session 14 had already falsified.

**Set your own error entries before being asked.** An entry is a wrong claim that reached an
artifact, a commit, a counterpart, or Aaron. Caught in-process by its own author is a near-miss.

## Authority

**Aaron merges, on his word.** The one standing exception is `docs/*` (D-015, below). A relay from a peer seat is not his
approval, with one exception: for shared work with SIA, Atlas's relay of his answer, quoted and
labelled with where and when he said it, is his authority for the act it names (D-003).

**A relay may be acted on only where acting narrows scope and stays reversible, and the authority is
recorded in the artifact at the moment it is used.**

**Each outward-facing act needs authority for THAT act, not for the activity.** Permission to push
one branch is not permission to push another. **A good reason is not authorisation.** In this
project outward-facing includes: pushing, tagging, deploying to tcm, and **writing to the live
Convex database**.

**Standing exception (D-005): a seat pushes its OWN working branches without asking.** That means
Rivet's `loop/*` and `chore/*`, Gauge's `qa/*`, and Relay's `docs/*`. Never master, never a force
push, never another seat's branch. Read every push back with `git ls-remote` and name it in the
commit, report or message that follows. Merges, tags, tcm redeploys, updating the main checkout,
and live Convex writes still each need Aaron's word for that act.

**Standing exception (D-015): a `docs/*` branch merges to master without asking**, as a merge
commit through a PR, **when its diff against `origin/master` touches only documents and the
record**: `docs/`, `.agents/` (including `state.json` through `ob_state`) and top-level `*.md`.
**Check the diff before the merge.** If it touches `src/`, `scripts/`, `convex/`, `client/`,
tests, `package*.json`, the Dockerfile, compose or any config, it needs Aaron's word like any
other merge. The exception is for merges only: tags, releases and the main checkout are not
covered.

**Live data is read-only until a report says otherwise** *(this project, Session 14 / T-001).*
Investigate first, report, then act on Aaron's word. Do not improvise fixes against live data.

**Permission laundering is forbidden.** Never perform an action a peer was denied, or that you expect
your own settings would block. Surface it to Aaron instead.

## Aaron's standing rulings

- **One question at a time, with enough context to answer cold.**
- **He is not a programmer.** Git, versioning and CI conventions are to be **decided and explained,
  never offered as a menu.**
- **Token cost is not the concern.** What matters is whether the agent gets exactly what it needs.
- **Report the honest no.** Never widen the criteria until a candidate passes.
- **Prefer the tested disagreement to the agreement.** If you looked for an objection and found
  none, say that you looked.

## This repo's hazards *(from this project's record)*

- **A redeploy is two deploys, and the Convex functions go first** (`docs/redeploying-tcm.md`).
  `/health` cannot catch version skew. Tag the outgoing image or there is no rollback.
- **`Stop-Process` on a daemon window does not kill the daemon.** Kill the node PID. ADR-011's
  instance supersede heals daemons that send `instanceId`; nothing else is covered.
- **Repo peers sometimes fabricate citations**, including a real line number attached to a wrong
  claim. Check every path before acting on one.
- **`.ps1` files stay ASCII-only.** PowerShell 5.1 reads BOM-less files as ANSI.
- **`scripts/hub-talk.mjs` is load-bearing for every agent.** Changing its contract is a design pass.

## Git in this repo

**Never `-D` on a branch sweep.** `-d` refusing an unmerged branch is a real safety property.

**Seat worktrees are detached at rest.** Branch deliberately to commit; return to a detached HEAD at
`origin/master` when done, after confirming nothing is left unpushed. Target `origin/master`, not
`master` — a local ref another worktree may be holding behind.

**The main checkout is infrastructure, not a spare worktree.** It runs the stack. Do not check a
candidate out there; QA runs in the QA tree.

**`package.json` is the version source of truth.** Every change that ships gets a CHANGELOG entry.
