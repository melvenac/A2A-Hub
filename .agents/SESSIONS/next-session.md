# Next Session Handoff

> Written at end of Session 10 (2026-07-28). Relay baton, not a log.

## Pick up here

1. **`scripts/register-agent.mjs`** — Aaron asked for this after the two bug fixes, which are now done. Wraps register → heartbeat → open-or-reuse session → send → poll for reply. Proposed shape is in the Session 8 log; the registration path still has zero automated coverage (`verify-client-stack.mjs` never registers an agent).
2. **Eyeball the turn counter at :5173.** The fix is in and the data invariant is confirmed (`turnCount` == `messages.length`, checked live), but the rendered header was never seen — the Chrome extension was not connected this session. Open a session with a few turns and confirm the `N/M` indicator tracks without a manual refresh.
3. Carried: experience dedup (forge-to-atlas.md §triggerHash), docker-compose profiles.

## Also open (from Session 9, not A2A-Hub work)

- **Two skill drafts await Aaron's review** — `~/Obsidian Vault/Skill-Candidates/drafts/subagent-orchestration/SKILL.md` and `.../verification-discipline/SKILL.md`. Approve → move to `~/.claude/skills/`. They are in `drafts/` precisely so they don't load before that call.
- **`skill-scan.mjs` clustering fix** is written up in Self-Improving-Agent's `next-session.md` (top section). Not this project's work — don't pull it into an A2A-Hub session.

## Watch out for

- **`start-stack.ps1`'s 120s Convex wait is too short from cold.** Session 10 hit the timeout; the script continued, and the Convex window died without ever binding :3210 — which then took the alice/bob windows with it, leaving a hub that answered `503 degraded` and a `verify-client-stack` that failed on two checks that had nothing to do with the code under test. Recovery: `npx convex dev --local --once` to deploy functions (~8s once warm), then open a persistent Convex window, wait for :3210, then re-run `start-stack.ps1 -SkipBuild` to fill in the missing daemons. Consider raising the wait.
- **GitNexus re-index works again** — `npx gitnexus analyze` completed clean in Session 10 (443 symbols / 600 relationships / 3 flows) with the MCP servers still running; the `.gitnexus\lbug` lock did not recur. Note it re-writes its own block in `CLAUDE.md`/`AGENTS.md` and the `.claude/skills/gitnexus/*` files, so expect those in `git status` after any analyze.
- **GitNexus does not index `.svelte`** — `impact`/`context` return "not found" for anything in `client/src`. That is a coverage gap, not a safe result; reason about client changes by hand.
- **`.ps1` files must stay ASCII-only** — PS 5.1 reads BOM-less files as ANSI; em-dash bytes decode into smart quotes that terminate strings. `start-stack.ps1` currently has 0 non-ASCII bytes; verify with a byte check after any edit.
- **`| tail -N` masks exit codes.** Use `${PIPESTATUS[0]}` when you need the real status.
- **vite binds `::1` only**; hub and Convex bind `127.0.0.1`. Any IPv4-only TCP probe silently misses the client. `start-stack.ps1` probes both families — don't "simplify" it back.
- **`X-Agent-Key` is never validated** — every guarded route only checks presence; a deliberately bogus key returns 200. `apiKeyHash` is stored at registration and never compared. Fine for local dev; must land before any non-local exposure.
- **Test agents/sessions accumulate** — `scout` from Session 8, plus two `pkgname-no-mute` / `addressed-still-routes` sessions from Session 10's live check. Harmless; delete if they clutter.
- **`.env` at repo root holds Aaron's real `ANTHROPIC_API_KEY`** — gitignored, nothing auto-loads it. If calls start 401ing, check the key before debugging anything else.
- **`--env-file` reads only at process start** — after editing `.env`, the hub and both daemons must be restarted or they keep the old value.
- Aaron launches from **Git Bash** — `.ps1` needs `powershell.exe -ExecutionPolicy Bypass -File start-stack.ps1`, not `.\start-stack.ps1`.
- DONE sentinel still leaks: any message *ending* with "DONE" reads as a sign-off (structured end-flag pending, INBOX v2).
- **Atlas mailbox is stale** (last message 2026-04-26, predates Sessions 5-10). Atlas is inactive — don't block on it; get Aaron's go-ahead directly.

## Open questions

- ~~Push now, or keep accumulating locally?~~ **Resolved Session 10** — pushed, tags included.
- ~~Does the `@`-fix need to handle a mention of a non-participant?~~ **Resolved Session 10** — an unmatched `@word` leaves the message unaddressed, so it falls through to the normal rule and reads as a question to the room. No error surfaced; silence was the failure mode being fixed.
- Should `/health`'s 503 also cover the Anthropic API, or is Convex the only dependency worth gating on?
- Session delete: hard delete with message cascade, or archive-only?
- Chat UI: when does plain Svelte stop being enough (PWA/SvelteKit decision, INBOX v2)?
