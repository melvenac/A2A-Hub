# Next Session Handoff

> Written at end of Session 5 (2026-07-23). Relay baton, not a log.

## Pick up here

1. **Real-LLM gate run** — blocked only on Aaron putting `ANTHROPIC_API_KEY` in `.env`. Then: restart hub + daemons (they auto-switch off fallback), `node scripts/demo-loop.mjs`. Watch token spend: daemon cap is `WRAPPER_MAX_TOKENS=300`, model `WRAPPER_MODEL` (default haiku).
2. **Experience dedup** — plan already written in `forge-to-atlas.md` (§triggerHash). ~15 LOC in `convex/experiences.ts` + schema index.
3. **docker-compose profiles** — local + VPS from one compose file; hub image CMD is `dist/src/index.js` now (postbuild copies `convex/_generated`).

## Watch out for

- **This machine's resumed CC sessions can corrupt subprocess PATH** — if `npx`/`vitest`/`git` "not recognized": use `node node_modules/<pkg>/bin/<bin>`, `npm i --ignore-scripts`, run compiled `dist/`. Fresh sessions are fine.
- **GitNexus index is stale at v1.1.0 (2474785)** — HEAD is v1.3.0 (6efa2f1). Run `npx gitnexus analyze` in a healthy terminal (embeddings are 0, no flag needed).
- Local stack may still be running from Session 5: Convex :3210, hub :4000 (compiled dist), alice+bob daemons, client :5173. Re-verify with `node scripts/verify-client-stack.mjs` before assuming state.
- `agents.register` duplicates rows on re-register (upsert fix is in INBOX v2).
- Atlas is inactive (Aaron confirmed) — log to the mailbox for the record, never wait on replies.

## Open questions

- When does the VPS come back? (Compose profiles should land first.)
- Chat UI growth: keep plain Svelte or move to SvelteKit when it becomes the real chat channel? (Atlas's original scope said plain Svelte for the test client; the PWA decision is still open.)
