# A2A Intelligent Hub — Agent Instructions

## Project Context

This is the **A2A Intelligent Hub** — a central coordination server for agent-to-agent communication with persistent memory, root cause classification, and automated repo fixing.

## Framework

This project uses the **AI-first development framework**. All project knowledge lives in `.agents/`:

| Document | Purpose |
|---|---|
| `.agents/SYSTEM/SUMMARY.md` | Current project state (read first every session) |
| `.agents/SYSTEM/PRD.md` | Product requirements |
| `.agents/SYSTEM/ENTITIES.md` | Data model (synced with `convex/schema.ts`) |
| `.agents/SYSTEM/RULES.md` | Coding standards and conventions |
| `.agents/SYSTEM/DECISIONS.md` | Architectural decision log |
| `.agents/TASKS/INBOX.md` | Prioritized task backlog |
| `.agents/TASKS/task.md` | Current sprint focus |
| `.agents/skills/INDEX.md` | Registered skills |

## Session Lifecycle

Use `/start` at the beginning and `/end` at the end of every session. This gives you continuity across sessions.

## Key Rules

- TypeScript with strict mode, ES modules
- Express 5 with async handlers
- Convex for all persistence — schema is source of truth in `convex/schema.ts`
- Keep ENTITIES.md in sync with schema.ts when making data model changes
- Anthropic API calls are budget-capped: classifier (50 tokens), repo-fixer (2000 tokens)
- Mock external services in tests (Anthropic, Convex, Telegram)
- Environment variables for all secrets — never hardcode
