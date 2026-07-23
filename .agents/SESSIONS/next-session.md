# Next Session Handoff

> Written at end of Session 6 (2026-07-23). Relay baton, not a log.

## Pick up here

1. **Per-agent personas** — alice/bob currently give generic assistant answers. Wire real roles via `--persona` or a small persona config; the daemon default persona now covers peer-identity + @mentions, so this is purely about giving each agent a specialty.
2. **`start-stack.ps1`** — CC-launched background processes (hub, daemons, vite) died silently TWICE in Session 6. Write a script Aaron runs in his own terminal: Convex (`npx convex dev --local --local-force-upgrade`), hub (`node --env-file=.env dist/src/index.js` with `CONVEX_URL`/`PORT`/`CLASSIFIER_MODEL=claude-haiku-4-5-20251001`), both daemons (`node --env-file=.env dist/src/wrapper/daemon.js --name X`), client (`node node_modules/vite/bin/vite.js` in `client/`).
3. Carried: experience dedup (forge-to-atlas.md §triggerHash), docker-compose profiles, `CLASSIFIER_MODEL` code default fix.

## Watch out for

- **`.env` at repo root holds Aaron's real `ANTHROPIC_API_KEY`** — gitignored; nothing auto-loads it (no dotenv). Always launch with `node --env-file=.env`.
- **DONE sentinel leaks**: any message *ending* with "DONE" (even "don't say DONE.") reads as a sign-off after the punctuation-tolerance fix. Phrase seeds/tests accordingly. Structured end-flag is the proper fix (INBOX v2).
- **Resumed CC sessions corrupt subprocess PATH** (npx/git break) — use `node node_modules/<pkg>/bin/...`; also TaskStop orphans node children — sweep `wrapper.daemon` processes and check port 4000 before restarts.
- The stack may still be running from Session 6 (Convex :3210, hub :4000, alice+bob real-LLM daemons, vite :5173). `node scripts/verify-client-stack.mjs` before assuming state.
- GitNexus index stale at v1.1.0; `gitnexus_detect_changes` skipped at the v1.4.0 commit (npx broken). Run `npx gitnexus analyze` from a fresh terminal.
- Mention matrix test lives at `~/.claude/jobs/973eef6e/tmp/mention-test.mjs` (job dir — copy into `scripts/` if you want it permanent).

## Open questions

- Chat UI: when does plain Svelte stop being enough (PWA/SvelteKit decision, INBOX v2)?
- Session delete: hard delete with message cascade, or archive-only?
- VPS timing unchanged — compose profiles first.
