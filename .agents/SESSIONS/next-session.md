<!-- generated from .agents/state.json rev 1 by open-brain v1.7.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 15)_

### Pick up here

Write the first loop brief, for T-001: verify revocation against the live database. It is the one unmet gate before anything is exposed publicly. The brief is a read-only investigation: count agent rows per name, and check whether superseded apiKeyHash values still authenticate. It must name what has to keep working afterwards (every seat still registers and talks through hub-talk). Brief goes in docs/loops/. Gauge accepts; Rivet builds.

### Watch out

- The developer handoff in the record is Session 14's and predates the seats. It was written for a single agent, not for Rivet.
- a2a-rivet and a2a-qa have node_modules (npm ci; vitest 84/84 in a2a-rivet at 5bb0777) but no .env. The live stack and repo peers need Aaron's .env, which is his to copy.
- The main checkout's .claude/settings.local.json does not carry over to the worktrees, so each seat starts with fresh permission prompts.
- SIA's seats run load-sensitive test suites on this machine. Aaron's standing ruling: work normally; pause only when a SIA seat asks for a controlled rerun.

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both. Dogfooding the hub would exercise T-008 and T-017, but it makes the seats depend on the thing they are changing.

### Loop state

**Open PRs:** _None._

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** _None._

**Rulings made mid-loop:** _None._

## developer _(written session 14)_

### Pick up here

1. **Verify revocation against the live database.** The one unmet condition gating public exposure. `register` collapses duplicates and deletes extras, but only ever in tests; the live DB held ~39 historical agent rows each carrying its own `apiKeyHash`, and the collapse is capped at 4000 deletes per call. If stale rows survive, a **superseded key still authenticates**. Read-only investigation first — do not improvise fixes against live data.
2. **Then the remote-agent milestone:** per-agent keys (removing `daemon.ts`'s `dev-key` fallback) → soak the warn logs → `AUTH_MODE=strict` → expose over HTTPS → the Grok bot registers from its own host. The keys-and-strict step is where a mistake logs out every agent at once, including the rooms that would carry the message about it — it wants a clear head and a rollback plan.
3. **Then on-demand spawn** — the biggest functional leap left in v2, and what retires the file mailbox.
4. Still open from Session 11, Aaron asked for these first: the two repo-peer measurements (auth without `--env-file=.env`; Opus 5 vs Sonnet 5 via `REPO_AGENT_MODEL`). See INBOX P1.

### Watch out

- **Cursor may still be live in this repo** (Session 14). Two agents in one tree collide — decide who owns it, or scope them to disjoint files.
- **Repo peers fabricate citations sometimes — check every path before acting on one.** Across four verification passes in Session 11 the `gitnexus` peer was exact three times (the lbug lock diagnosis 4/4, the version answer, a correct "no, this repo has no Stripe integration") and wrong once: it cited `gitnexus/src/cli/commands/mcp.ts` (real path `src/cli/mcp.ts` — it invented a `commands/` segment) and cited `package.json:17` as a command registration when line 17 is inside `"keywords"`. **A real line number attached to a wrong claim is the failure shape to fear** — it survives a casual glance. The provenance footer tells you which *checkout* answered; it says nothing about whether a citation is real. Weak correlation worth watching: the exact answers came from specific questions and took ~40s; the fabricated one came from "name one file…" and took 18s.
- **Which checkout a repo peer should read depends on the question, and it can't be both.** The `gitnexus` peer reads `main`, which is **353 commits ahead of the published v1.6.9** that Aaron actually runs (a clone's `package.json` reads the last released version, so "1.6.9" in the tree does NOT mean it equals the 1.6.9 tarball). That is right for *"how would I fix this upstream?"* — you patch and PR against main — and wrong for *"why does my installed binary behave this way?"*, which needs the release tag. Concretely: the peer cited `gitnexus-hook.cjs:524` from main's 552-line file while the installed hook is 502 lines. Neither reading was incorrect; they answer different questions. If both matter, run two peers (`gitnexus-main` and `gitnexus-release` on a `--branch v<version>` clone) rather than trying to make one checkout serve both.
- **`gitnexus setup` DOES refresh the hook script** even when it prints "hooks (already configured)" — that message refers only to the `settings.json` registration, which it correctly leaves byte-identical. Session 11 re-ran it and the hook went 268 → 502 lines. Back up `~/.claude/settings.json` first anyway; `setup` writes to global config across every detected editor unless scoped with `-c claude` (valid ids: `cursor`, `claude`, `antigravity`, `opencode`, `codex` — **not** `claude-code`).
- **The `gitnexus` peer now reads `C:\Users\melve\tools-src\gitnexus`** (main @ 1.6.9), not `Projects\gitnexus` — that folder was deleted in Session 11 (1.9 GB → 166 MB, stale side branch 867 commits behind main, and its version disagreed with the installed CLI). Its one local-only commit is preserved as `C:\Users\melve\tools-src\0001-chore-agents-*.patch`. The stale GitNexus index was deregistered with `gitnexus remove --force`. **The clone and the global npm install still have no link** — `npm i -g gitnexus` and `git pull` are unrelated, so drift will recur; the provenance footer makes it visible, not fixed.
- **`allowedTools` in the Agent SDK does NOT restrict the agent to that set** — it only auto-approves; unlisted tools fall through to `permissionMode` and `canUseTool`. Read-only is built on `disallowedTools`, which is the only option that actually removes a tool. If someone "simplifies" `repo-reply.ts` to an allowlist, the peer becomes write-capable with no visible change. There's a test on `resolveDisallowedTools` guarding exactly this.
- **`permissionMode: "dontAsk"` is load-bearing, not a preference.** A daemon has nobody to answer a permission prompt, so any mode that prompts would hang the reply forever rather than erroring. `dontAsk` denies instead.
- **`settingSources: ["project"]` is deliberate.** Omitting the option loads user + project + local — which would pull Aaron's global `CLAUDE.md` and context-mode routing rules into a peer answering about someone else's repo. Project-only gives the repo's own conventions without the operator's.
- **Repo replies cost real money and take ~40s.** `maxBudgetUsd` defaults to $0.50 and `maxTurns` to 12 — deliberately an order of magnitude above the hub's other budget caps (classifier 50 tokens, repo-fixer 2000), because a repo peer isn't a classifier. If cost surprises, that's the dial. The SDK's `startup()` warm-query helper is the latency lever.
- **The GitNexus lock mystery is solved** — by the gitnexus peer itself, in the live test. `gitnexus/src/core/run-analyze.ts:262-272` deletes the lbug files and **swallows every failure** (`catch { /* swallow */ }`), so a Windows sharing violation is silent; `initLbug` at line 272 is what surfaces it. `withLbugDb` retries on busy, but `initLbug` from the analyze entry point does **not**, so an analyze racing a live MCP server fails on the first lock hit. Practical rule: stop `gitnexus mcp`/`serve` before `analyze`, or delete a stale `.gitnexus/lbug.lock` if nothing holds the handle. (Session 10's re-index succeeded with the servers running — consistent with this: the pooled read-only handles just weren't open at that instant. It's a race, not a hard block.)
- **The Convex window is titled `C:\Windows\system32\cmd.exe`, not `A2A Convex`.** `npx` shells through `cmd.exe`, which overwrites the title after `start-stack.ps1` sets it. This is the most load-bearing window in the stack wearing the most disposable-looking name — close it and the hub goes `503 degraded` while every write fails, which is the Session 8 three-day outage. **Identify windows by their live node child, not by title.** Filed in INBOX.
- **`start-stack.ps1`'s 120s Convex wait is too short from cold**, and the failure cascades — Convex never binds :3210, the script continues, and the daemon windows die with it, leaving a `503 degraded` hub and verify failures unrelated to the code under test. Recovery: `npx convex dev --local --once`, then a persistent Convex window, wait for the port, then `start-stack.ps1 -SkipBuild`.
- **`Stop-Process` on a daemon window does NOT kill the daemon.** The node child is orphaned and keeps polling. Restarting a peer this way gives you *two* live daemons for one name, both answering, and `repliedTo` is per-process so nothing dedupes them — in Session 11 a stale build answered a question after what looked like a successful restart, which is how a missing feature appeared to be broken code. **Kill the node PID, not the window** (`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like "*--name <peer>*" }`), or kill both. Session 14 (ADR-011, `95f2433`) makes a daemon that sends `instanceId` supersede its orphaned predecessor, so the race self-heals within the 45s liveness window; clients without `instanceId` are unaffected.
- **Dead A2A windows accumulate.** `-NoExit` keeps a window alive after its node process dies, so a cascade leaves empty shells and a re-run stacks new windows beside them (Session 11 ended with 2 zombies of 8). To audit, map live node processes to `ParentProcessId` and compare against `Get-Process powershell | ? MainWindowTitle` — and check for a **node** child specifically, since every console window has a `conhost.exe` child and "has any child" always matches.
- **Minimum stack is 3 windows:** Convex + Hub + the repo peer you're testing. The client (:5173) is only for the chat UI, and alice/bob are only for the agent↔agent demo — neither is needed to test a repo agent.
- **GitNexus does not index `.svelte`** — `impact`/`context` return "not found" for `client/src`. Coverage gap, not a safe result.
- **`.ps1` files must stay ASCII-only** — PS 5.1 reads BOM-less files as ANSI; em-dash bytes decode into smart quotes that terminate strings.
- **Test peers accumulate** — `scout` (S8), two mention-check sessions (S10), plus `gitnexus` and an `ask-<pid>` peer from this session. Harmless; delete if they clutter.
- **`.env` holds Aaron's real `ANTHROPIC_API_KEY`** — gitignored. The Agent SDK resolves credentials itself (env or the `ant`/Claude Code profile), so a repo peer may work even where the daemon's Messages API path would 401 — don't read a working repo peer as proof the key is good.
- Aaron launches from **Git Bash** — `.ps1` needs `powershell.exe -ExecutionPolicy Bypass -File start-stack.ps1`.
- DONE sentinel still leaks: any message *ending* with "DONE" reads as a sign-off.
- **Atlas mailbox is stale** (last message 2026-04-26). Atlas is inactive — don't block on it.

### Open questions

- ~~Store-and-forward or synchronous ask first?~~ **Resolved Session 11** — synchronous ask, because it strictly dominates: hub messages already persist, so a message left for an offline peer *is* store-and-forward once the ask path exists.
- Should the entrance be an MCP server on the hub (`a2a_ask(peer, question)`) rather than a script? Cleaner, and fits how Aaron already works with 8 MCP servers registered. But ADR-006/007 already superseded an MCP channel layer once — re-read that reasoning before reviving it. The two aren't the same thing (MCP-as-transport vs MCP-as-entrance for a coding agent), but the prior rejection deserves a look.
- How should a repo peer be named and discovered? Currently the name is hand-passed (`--name gitnexus`). A registry mapping repo path → peer name would let `ask-agent.mjs` take a path instead of a name.
- Should `/health`'s 503 also cover the Anthropic API, or is Convex the only dependency worth gating on?
- Session delete: hard delete with message cascade, or archive-only?

## Last session

Session 15 — 2026-09-22 — planner — `f11f4c14-93fb-4b0f-8ba2-a716a1187e70`
