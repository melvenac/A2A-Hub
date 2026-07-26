# Next Session Handoff

> Written at end of Session 7 (2026-07-24). Relay baton, not a log.

## Pick up here

1. **Verify the stack live** — Aaron was mid-verification of `start-stack.ps1` when the session closed. Ask him whether the five windows came up. Two failure modes already fixed this session (missing `CONVEX_URL` → code default; orphaned Convex backend → idempotent skips). If a window died, get its output.
2. **Persona demo** — seed alice↔bob from the chat client (:5173); success = clearly distinct learner-assistant vs mentor voices. `node dist\src\wrapper\daemon.js --name alice --print-persona` shows any agent's composed prompt without starting anything.
3. **Commit + tag v1.5.0** — Session 7 work is UNCOMMITTED (personas/, start-stack.ps1, daemon.ts, classifier.ts, index.ts, PRD, trackers). Run `gitnexus_detect_changes` first, add CHANGELOG entry, tag.
4. Carried: experience dedup (forge-to-atlas.md §triggerHash), docker-compose profiles.

## Watch out for

- **`.ps1` files must stay ASCII-only** — PS 5.1 reads BOM-less files as ANSI; em-dash bytes decode into smart quotes that terminate strings. There's a warning comment in start-stack.ps1; don't let an edit reintroduce non-ASCII.
- **`.env` at repo root holds Aaron's real `ANTHROPIC_API_KEY`** — gitignored; nothing auto-loads it. The start script handles `--env-file` for every process; manual launches still need it.
- **`CONVEX_URL` is NOT in `.env`** — hub now defaults to `http://127.0.0.1:3210` in code, and the script also sets it in the hub window. Don't "fix" the script by removing either.
- **DONE sentinel leaks**: any message *ending* with "DONE" reads as a sign-off. Structured end-flag still pending (INBOX v2).
- `REPO_FIXER_MODEL` default is still the 404-ing `claude-sonnet-4-20250514` (repo-fixer unused in the loop; noted in SUMMARY debt).
- Aaron launches from **Git Bash** — `.ps1` needs `powershell.exe -ExecutionPolicy Bypass -File start-stack.ps1`, not `.\start-stack.ps1`.
- Resumed CC sessions corrupt subprocess PATH (npx/git break) — use `node node_modules/<pkg>/bin/...` from agent shells; Aaron-owned terminals are fine.

## Open questions

- Did the stack come up? (Blocks everything downstream.)
- Persona voices: are alice/bob roles right, or does Aaron want different specialties (e.g., a Brian-simulation pair)?
- Chat UI: when does plain Svelte stop being enough (PWA/SvelteKit decision, INBOX v2)?
- Session delete: hard delete with message cascade, or archive-only?
