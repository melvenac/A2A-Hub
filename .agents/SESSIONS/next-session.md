# Next Session Handoff

> Written at end of Session 11 (2026-07-29). Relay baton, not a log.

## Pick up here

1. **On-demand spawn.** A repo peer only answers if its daemon is already running. The hub should see a message for a repo peer with no live registration, launch a headless agent rooted at that repo, take the answer, and let it exit. Zero idle cost, no N-daemons-polling problem — and this is the piece that actually *retires* the file mailbox rather than out-competing it. Everything else in the ask path already works.
2. **Give repo peers git history.** Bash is denied by default (it's the trust boundary), so the peer can't answer "when did this change and why" — arguably what a repo expert should be best at. A scoped allow rule (`Bash(git log *)`, `Bash(git show *)`) keeps the boundary. Per the Agent SDK docs, a scoped rule leaves the tool available and denies non-matching calls in every permission mode.
3. **PRD §1 needs Aaron's decision, not an edit.** The PRD marks local/cross-repo multi-agent as *secondary* and argues Claude Code subagents are usually better for same-machine work. Aaron's stated primary use case is cross-repo, and that argument doesn't apply — subagents are better *because they share context*, but the whole value here is that the target repo's agent already holds its own `.agents/` state and gotchas. This is cross-**context**, not cross-machine. Flagged, deliberately not amended unilaterally.
4. Carried: experience dedup (forge-to-atlas.md §triggerHash), docker-compose profiles.

## Watch out for

- **`allowedTools` in the Agent SDK does NOT restrict the agent to that set** — it only auto-approves; unlisted tools fall through to `permissionMode` and `canUseTool`. Read-only is built on `disallowedTools`, which is the only option that actually removes a tool. If someone "simplifies" `repo-reply.ts` to an allowlist, the peer becomes write-capable with no visible change. There's a test on `resolveDisallowedTools` guarding exactly this.
- **`permissionMode: "dontAsk"` is load-bearing, not a preference.** A daemon has nobody to answer a permission prompt, so any mode that prompts would hang the reply forever rather than erroring. `dontAsk` denies instead.
- **`settingSources: ["project"]` is deliberate.** Omitting the option loads user + project + local — which would pull Aaron's global `CLAUDE.md` and context-mode routing rules into a peer answering about someone else's repo. Project-only gives the repo's own conventions without the operator's.
- **Repo replies cost real money and take ~40s.** `maxBudgetUsd` defaults to $0.50 and `maxTurns` to 12 — deliberately an order of magnitude above the hub's other budget caps (classifier 50 tokens, repo-fixer 2000), because a repo peer isn't a classifier. If cost surprises, that's the dial. The SDK's `startup()` warm-query helper is the latency lever.
- **The GitNexus lock mystery is solved** — by the gitnexus peer itself, in the live test. `gitnexus/src/core/run-analyze.ts:262-272` deletes the lbug files and **swallows every failure** (`catch { /* swallow */ }`), so a Windows sharing violation is silent; `initLbug` at line 272 is what surfaces it. `withLbugDb` retries on busy, but `initLbug` from the analyze entry point does **not**, so an analyze racing a live MCP server fails on the first lock hit. Practical rule: stop `gitnexus mcp`/`serve` before `analyze`, or delete a stale `.gitnexus/lbug.lock` if nothing holds the handle. (Session 10's re-index succeeded with the servers running — consistent with this: the pooled read-only handles just weren't open at that instant. It's a race, not a hard block.)
- **`start-stack.ps1`'s 120s Convex wait is too short from cold**, and the failure cascades — Convex never binds :3210, the script continues, and the daemon windows die with it, leaving a `503 degraded` hub and verify failures unrelated to the code under test. Recovery: `npx convex dev --local --once`, then a persistent Convex window, wait for the port, then `start-stack.ps1 -SkipBuild`.
- **GitNexus does not index `.svelte`** — `impact`/`context` return "not found" for `client/src`. Coverage gap, not a safe result.
- **`.ps1` files must stay ASCII-only** — PS 5.1 reads BOM-less files as ANSI; em-dash bytes decode into smart quotes that terminate strings.
- **`X-Agent-Key` is never validated** — every guarded route only checks presence. Fine for local dev; must land before any non-local exposure. Note this now matters more: `ask-agent.mjs` registers ephemeral peers freely.
- **Test peers accumulate** — `scout` (S8), two mention-check sessions (S10), plus `gitnexus` and an `ask-<pid>` peer from this session. Harmless; delete if they clutter.
- **`.env` holds Aaron's real `ANTHROPIC_API_KEY`** — gitignored. The Agent SDK resolves credentials itself (env or the `ant`/Claude Code profile), so a repo peer may work even where the daemon's Messages API path would 401 — don't read a working repo peer as proof the key is good.
- Aaron launches from **Git Bash** — `.ps1` needs `powershell.exe -ExecutionPolicy Bypass -File start-stack.ps1`.
- DONE sentinel still leaks: any message *ending* with "DONE" reads as a sign-off.
- **Atlas mailbox is stale** (last message 2026-04-26). Atlas is inactive — don't block on it.

## Open questions

- ~~Store-and-forward or synchronous ask first?~~ **Resolved Session 11** — synchronous ask, because it strictly dominates: hub messages already persist, so a message left for an offline peer *is* store-and-forward once the ask path exists.
- Should the entrance be an MCP server on the hub (`a2a_ask(peer, question)`) rather than a script? Cleaner, and fits how Aaron already works with 8 MCP servers registered. But ADR-006/007 already superseded an MCP channel layer once — re-read that reasoning before reviving it. The two aren't the same thing (MCP-as-transport vs MCP-as-entrance for a coding agent), but the prior rejection deserves a look.
- How should a repo peer be named and discovered? Currently the name is hand-passed (`--name gitnexus`). A registry mapping repo path → peer name would let `ask-agent.mjs` take a path instead of a name.
- Should `/health`'s 503 also cover the Anthropic API, or is Convex the only dependency worth gating on?
- Session delete: hard delete with message cascade, or archive-only?
