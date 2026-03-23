# Session 3 — 2026-03-23

> **Objective:** Fix Convex connectivity blocker — get hub talking to Convex backend
> **Status:** Completed

---

## Pre-Session Checklist

- [x] Read SUMMARY.md
- [x] Read INBOX.md
- [x] kb_recall for Convex Docker experiences
- [ ] Read ENTITIES.md (if schema work planned)

---

## Objective & Plan

**Goal:** Fix the Convex connectivity blocker so the hub can process messages

**Approach:**
1. Deploy Convex functions to the self-hosted backend
2. Fix CONVEX_URL env var in the hub container
3. Verify end-to-end agent registration

**User Approval:** [x] Approved

---

## Work Log

### What Was Done
- Deployed Convex functions to VPS: `npx convex deploy --url http://172.86.123.176:3210 --admin-key "..."`
- All 5 tables created with indexes (agents, conversations, experiences, repoFixes, tasks)
- Fixed `CONVEX_URL` in VPS `.env`: `http://host.docker.internal:3211` → `http://convex:3210`
- Had to `docker stop/rm` + `docker compose up` (not just restart) — Docker caches env vars
- Verified agent registration end-to-end (test-agent + test-agent-2 registered)
- Added input validation + JSON error handling to all async routes in `src/index.ts`
- Default `agentCard` on register if not provided
- Multi-stage Dockerfile — TypeScript builds inside Docker, no `dist/` in git
- Fixed `.dockerignore` to allow `src/` and `*.ts` for multi-stage build
- Updated `scripts/deploy.sh` — full stop/rm/rebuild/start/verify cycle
- Updated README with Brian/alice wrapper quickstart + raw API docs
- Moved bootstrap key hardening from v1 to v2
- Discussed memory architecture alignment with Self-Improving Agent

### Files Modified
- `src/index.ts` — error handling, input validation, agentCard default
- `Dockerfile` — multi-stage build
- `.dockerignore` — allow src/ and *.ts
- `scripts/deploy.sh` — full deploy cycle
- `README.md` — Brian/alice quickstart, self-hosting docs
- `.agents/SYSTEM/SUMMARY.md` — updated project state
- `.agents/SYSTEM/DECISIONS.md` — ADR-005 already present from Session 2
- `.agents/TASKS/INBOX.md` — marked tasks done, moved bootstrap to v2
- `.agents/TASKS/task.md` — needs update
- VPS: `/home/melvenac/projects/a2a-hub/.env` — fixed CONVEX_URL

### Files Created
- `.agents/SESSIONS/Session_3.md` — this file
- `.gitignore` — dist/, node_modules/, .env

---

## Gotchas & Lessons Learned

- **Docker restart doesn't reload env vars.** Must `docker stop && docker rm` then recreate the container for `.env` changes to take effect.
- **Convex functions must be deployed separately.** The self-hosted Convex container starts empty — run `npx convex deploy` from local machine targeting VPS IP.
- **Telegram polling ECONNRESET errors are transient** — they don't prevent the hub from working.
- **`.dockerignore` must match Dockerfile strategy.** Old ignore excluded `src/` and `*.ts` — fine when copying pre-built `dist/`, breaks multi-stage build that compiles inside Docker.
- **docker compose `--build` requires `build:` in compose file.** If compose uses `image:` only, must `docker build -t` manually.
- **v1 memory stays simple** — Convex text search is enough. Vector/semantic search deferred until Makerspace integration shapes the requirements.

---

## Decisions Made

- Used Docker service name (`convex`) for CONVEX_URL instead of host.docker.internal
- Multi-stage Dockerfile over committing `dist/` to git
- Moved bootstrap key hardening to v2 — not needed until after Brian tests
- v1 memory uses Convex text search only — architecture mirrors Self-Improving Agent (curated, FTS, semantic) but defers complexity

---

## Post-Session Checklist

- [x] Session log completed (this file)
- [x] SUMMARY.md updated with current state
- [x] DECISIONS.md updated (if applicable)
- [ ] ENTITIES.md updated (no schema changes)
- [x] INBOX.md updated (tasks marked done, new tasks added)
- [ ] Validation scripts run (not configured)

---

## Next Session Recommendations

- Test `/a2a/message/send` end-to-end (tried at session end but terminal issue interrupted)
- Coordinate with Brian to run alice wrapper
- Verify experience dedup
- If message/send fails, debug the classifier + memory + escalation pipeline
