# Current Sprint

> **Focus:** v1 — Get testable with Brian

---

## Active Tasks

1. **Configure Telegram** — Set bot token + group ID env vars. Code in `telegram.ts` is ready, just needs configuration in Docker compose / .env
2. **Harden bootstrap key** — Replace `changeme123` with a properly generated key
3. **Write README.md** — Project overview, architecture diagram, wrapper quickstart so Brian can set up `alice`
4. **Test with Brian** — End-to-end: alice wrapper → real question → hub classifies → memory → repo fix → Telegram approval

## Context

Core hub is deployed and working. This sprint is configuration + docs, not new development. Goal is to get Brian running an alice wrapper and validating the full loop with real-world usage.

## Success Criteria

- Telegram bot posts hub activity to Aaron's group
- Brian can follow README to run his wrapper
- Full loop completes: question → classify → store → fix draft → Telegram approval
