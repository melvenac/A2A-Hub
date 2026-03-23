# Coding Standards — A2A Intelligent Hub

---

## Language & Runtime

- **TypeScript** with strict mode, ES module syntax (`import`/`export`)
- Target: Node.js 20+ with `"type": "module"` in package.json
- Build: `tsc` → `dist/`, dev: `tsx watch`

## File Organization

```
src/
├── index.ts          ← Express server entry point, route wiring
├── agent-card.ts     ← A2A protocol agent card definition
├── classifier.ts     ← Root cause classification (Anthropic API)
├── executor.ts       ← Message handling & execution logic
├── escalation.ts     ← Route tasks to available agents via A2A SDK
├── memory.ts         ← Convex client, semantic search, lesson storage
├── queue.ts          ← Agent task polling & coordination
├── repo-fixer.ts     ← Draft doc/config fixes (Anthropic API)
└── telegram.ts       ← Telegram bot notifications
convex/
└── schema.ts         ← Convex schema (source of truth for ENTITIES.md)
```

## Conventions

- One module per concern — each `src/*.ts` file owns a single responsibility
- Express 5 with async route handlers
- Convex client initialized once in `memory.ts`, shared across modules
- Anthropic SDK calls are budget-capped: classifier (50 tokens), repo-fixer (2000 tokens)
- Environment variables for all secrets and config — never hardcode

## Error Handling

- Express routes use try/catch with structured JSON error responses
- Convex operations handle network failures gracefully
- Telegram notifications are fire-and-forget (don't block on send failure)

## Testing

- **Vitest** for unit tests (`npm test`)
- Test files: `*.test.ts` or `*.spec.ts`
- Mock external services (Anthropic API, Convex, Telegram) in tests

## Environment Variables

| Variable | Purpose |
|---|---|
| `CONVEX_URL` | Convex backend URL |
| `ANTHROPIC_API_KEY` | Anthropic API access |
| `GITHUB_PAT` | Git push for approved fixes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot access |
| `TELEGRAM_GROUP_ID` | Target Telegram group |
| `HUB_BOOTSTRAP_KEY` | Admin key for agent registration |
| `HUB_URL` | Public URL of this hub |
| `REPO_PATH` | Local repo path for fix drafting |
| `CLASSIFIER_MODEL` | LLM model for classification (default: `claude-sonnet-4-20250514`) |
| `REPO_FIXER_MODEL` | LLM model for repo fix drafting (default: `claude-sonnet-4-20250514`) |
| `CONFIDENCE_THRESHOLD` | Min confidence for auto-actions (default: 0.85) |
| `PORT` | Server port (default: 4000) |
