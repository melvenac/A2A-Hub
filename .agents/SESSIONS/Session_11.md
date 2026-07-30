# Session 11 — 2026-07-29

> **Objective:** Make peers able to answer from a codebase they live in, so the human stops being the relay between repos
> **Status:** Complete
> **Session UUID:** f92b9797-8a0a-4018-a0f2-d65a8e82a72c

---

## Pre-Session Checklist

- [x] Read SUMMARY.md
- [x] Read INBOX.md
- [ ] Read ENTITIES.md (no schema work)
- [x] Read relevant skills — `claude-api` (which correctly refused to cover the Agent SDK and pointed at its own docs)
- [x] Run pre-session validation (`verify-client-stack.mjs`, carried from Session 10)

---

## Objective & Plan

**Goal:** Aaron described the real use case — working in one repo, hitting an issue caused by another, and hand-carrying context between them via handoff files. Remove him from that loop.

**Approach:**
1. Decide which half to build first (store-and-forward vs synchronous ask) → verify: a decision with a reason, not a coin flip
2. Repo-resident peers → verify: a live cross-repo answer with citations that check out
3. Ship, then let the priority decision follow the evidence

**User Approval:** [x] Approved — Aaron: "That's up to you" on sequencing, then "the security issue is real, update the prd"

---

## Work Log

### What Was Done

- **v1.6.0 — repo-resident peers (ADR-010).** `daemon.ts --repo <path>` generates replies from a Claude Agent SDK session rooted in that repo. Swapped at the daemon's single existing seam (`generateReply`), so mention gating, turn caps, DONE detection and the no-cascade rule are untouched. `scripts/ask-agent.mjs` is the entrance from a live coding session.
- **v1.6.1 — reply provenance.** Every repo reply carries branch, short SHA, and dirty flag. Inserted *before* a trailing DONE so convergence detection survives.
- **PRD v1.2 — cross-repo promoted to primary use case** on Aaron's call, with the roadmap renumbered (v2 cross-repo → v3 remote/Brian → v4 platform) and three trust-domain prerequisites named in §8.
- **Swapped the gitnexus checkout** — `Projects\gitnexus` (side branch @ 1.6.3, 1.9 GB, 867 commits behind main) → `tools-src\gitnexus` (main @ 1.6.9, 166 MB). Stale index deregistered, local commit preserved as a patch, old folder deleted.
- **Pruned the stack** from 8 windows to 6, two of which were zombies.

### Files Modified
- `src/wrapper/daemon.ts` — `--repo`/`--repo-bash` flags, reply-seam swap, startup mode line
- `.agents/SYSTEM/PRD.md` (v1.1 → v1.2), `DECISIONS.md` (ADR-010 + amendment), `SUMMARY.md`, `.agents/TASKS/{INBOX,task}.md`, `next-session.md`
- `CHANGELOG.md`, `README.md`, `package.json` (1.5.2 → 1.6.1)

### Files Created
- `src/wrapper/repo-reply.ts` — `makeRepoReplier`, `renderPrompt`, `resolveDisallowedTools`, `readRepoProvenance`, `withProvenance`
- `scripts/ask-agent.mjs` — register → 2-peer session → send → poll
- `tests/repo-reply.test.ts` — 19 cases
- `.agents/SESSIONS/Session_11.md`

---

## Gotchas & Lessons Learned

- **`allowedTools` in the Agent SDK does not restrict the agent to that set** — it only auto-approves; unlisted tools fall through to `permissionMode`. Read-only had to be built on `disallowedTools`, the only option that actually removes a tool. An allowlist would have shipped a write-capable peer with no visible difference. Found by reading the reference instead of trusting recall, and now guarded by a test.
- **A repo peer fabricates citations sometimes, and the dangerous shape is a real line number on a wrong claim.** Four verification passes: exact three times (lock diagnosis 4/4, version answer, a correct "no Stripe here"), wrong once — invented a `commands/` path segment and cited `package.json:17` as a command registration when line 17 is inside `"keywords"`. I had stated confidence in its accuracy one message too early. Check every path.
- **A stale checkout is silent.** The peer answered from 1.6.3 source while the installed CLI ran 1.6.9, with no hint in the reply. It only surfaced because a version question was asked directly. That is what provenance now fixes — visibility, not the drift itself.
- **`npm i -g <tool>` and a git clone of that tool are unrelated artifacts.** The global install is an extracted tarball with no `.git`; nothing links it to a checkout elsewhere on disk. "Why didn't the checkout update" has no mechanism to appeal to — there was never a sync.
- **`Stop-Process` on a daemon's window does not kill the daemon.** The node child is orphaned and keeps polling, so a restart yields two live daemons for one peer name, both answering, with `repliedTo` per-process and deduping nothing. A stale build answered a question after an apparently clean restart, and I nearly read the missing feature as broken code. Kill the node PID.
- **"Has any child process" never distinguishes a live console window from a dead one** — every console window has a `conhost.exe` child, so my first cleanup guard skipped both zombies. Check for a `node.exe` child specifically.
- **Convergence detection is a trailing-sentinel test, so anything appended to a reply can silently break it.** The provenance footer had to go before `DONE`; a naive append would have stopped every repo-peer session from ever converging, with no error. Mutation-verified: the naive version fails exactly those two tests.
- **The skill said no, and that was the useful answer.** `claude-api` explicitly declines to generate Agent SDK code and points at its own docs. Following that instead of writing from memory is why `disallowedTools` is right.

---

## Decisions Made

- **ADR-010: Repo-resident peers** — replies from a rooted Agent SDK session; read-only via `disallowedTools`; `permissionMode: "dontAsk"` so a daemon denies rather than hangs; `settingSources: ["project"]` so the target repo's conventions load but not the operator's.
- **ADR-010 amendment:** repo peers have **no network access**, now deliberate rather than accidental (`dontAsk` denies `WebFetch`/`WebSearch`). Kept because an isolated peer can't become an exfiltration path for a question arriving from another machine. Cost: it can't answer "is this dependency current."
- **ADR-010 amendment:** replies carry provenance.
- **PRD v1.2 (Aaron's call):** cross-repo is the primary use case. Auth, peer identity, and authorization are v2 *prerequisites* rather than later hardening, because a single machine has a single trust domain and no local test can fail on them.
- **Synchronous ask before store-and-forward** — the ask path strictly dominates, since hub messages already persist and a message left for an offline peer *is* store-and-forward.
- **Did not amend the PRD unilaterally** when the tension was first spotted; flagged it and waited. Aaron's framing then improved the rationale (locally verifiable beats theoretically primary).

---

## Addendum — work after the first close-out

- **Re-indexed GitNexus** (496 nodes / 700 edges / 5 flows). First run failed in `copyCsvWithRetry` → `copyNodeCSVs`, a plain re-run succeeded, third said "Already up to date" — live confirmation of the *race* the peer diagnosed, not a hard block. Practical rule is "re-run it," not "stop the MCP servers."
- **Traced the staleness hook to GitNexus, not SIA** — `~/.claude/hooks/gitnexus/gitnexus-hook.cjs`, registered in *global* `~/.claude/settings.json`. Its gate is a bare HEAD-vs-`lastCommit` comparison with no file check, so it has a guaranteed false positive: `analyze` rewrites `CLAUDE.md`/`AGENTS.md`, committing them moves HEAD, hook fires. No quiet state exists.
- **Used the peer for its first real errand** — scoping the fix. It returned 4/4 verified citations and found two things I would have missed: **three copies** of the hook (`hooks/claude`, `gitnexus-claude-plugin/hooks`, `hooks/antigravity`), and that the hooks are plain CJS and cannot import the shared TypeScript extension map, with an existing parity-test precedent in the repo for that exact problem.
- **Re-ran `gitnexus setup -c claude`** — refreshed the installed hook 268 → 502 lines. Valid agent ids are `cursor`/`claude`/`antigravity`/`opencode`/`codex` (not `claude-code`). Backed up `settings.json` first; it was left byte-identical.
- **Shipped v1.6.2** — budget default 0.5 → 2, timeout 120s → 180s.
- **Measured what the peer actually runs:** `claude-opus-5[1m]`, credential source `ANTHROPIC_API_KEY`, ~$0.10/turn floor.

### Two corrections I had to make
- Told Aaron the swap gave "a peer whose answers match the 1.6.9 you run." Wrong — `main` is **353 commits ahead** of the v1.6.9 tag; a clone's `package.json` shows the last *released* version. The mismatch flipped from 867 behind to 353 ahead. Which checkout is right depends on the question: main for "how do I fix this upstream," a release tag for "why does my binary do this."
- Guessed `gitnexus setup` might not refresh a stale hook script. It does — "hooks (already configured)" refers only to the settings registration.

## Post-Session Checklist

- [x] Session log completed (this file)
- [x] SUMMARY.md updated
- [x] DECISIONS.md updated (ADR-010 + amendments)
- [ ] ENTITIES.md (no schema change)
- [x] INBOX.md updated and re-prioritized behind the v2 prerequisites
- [x] Validation run — suite 41/41, `tsc` clean, live cross-repo asks verified

---

## Next Session Recommendations

- On-demand spawn — the last "wait for a human to start something," and what retires the file mailbox
- The three trust-domain prerequisites (they will keep feeling like busywork; that is the trap)
- Measure the citation self-check before adopting it — verification instructions can cause over-verification
