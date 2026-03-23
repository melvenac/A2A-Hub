# Architectural Decision Log

> **Purpose:** Record significant architectural and technical decisions so future sessions have context on WHY things are the way they are.

---

## How to Use This Document

When a significant decision is made (technology choice, pattern adoption, trade-off), add an entry below using this format:

```markdown
### ADR-NNN: [Title]
- **Date:** YYYY-MM-DD
- **Session:** N
- **Status:** Accepted | Superseded | Deprecated
- **Context:** What situation prompted this decision?
- **Decision:** What did we decide?
- **Alternatives Considered:** What else was on the table?
- **Consequences:** What are the trade-offs?
```

---

## Decisions

### ADR-001: Self-Hosted Convex for Persistence
- **Date:** 2026-03-22
- **Session:** 0 (pre-framework)
- **Status:** Accepted
- **Context:** Hub needs persistent state for experiences, tasks, agents, conversations, and repo fixes. Needed semantic search on experience triggers.
- **Decision:** Use Convex (self-hosted via Docker) for all persistent state. Convex provides built-in search indexes and real-time subscriptions.
- **Alternatives Considered:** SQLite (simpler but no built-in search), PostgreSQL (heavier), plain JSON files (no search/indexing).
- **Consequences:** Requires running a Convex container alongside the hub. Schema changes require `npx convex deploy`. Gains semantic search and real-time capabilities.

### ADR-002: Minimal API Token Budget
- **Date:** 2026-03-22
- **Session:** 0 (pre-framework)
- **Status:** Accepted
- **Context:** Hub makes Anthropic API calls for classification and repo fix drafting. Want to minimize costs since heavy LLM work runs on wrapper agents via Claude Max subscription.
- **Decision:** Cap classifier at 50 tokens/call, repo-fixer at 2000 tokens/call. All other LLM work happens on wrapper agents.
- **Alternatives Considered:** Route all LLM calls through wrappers (zero API cost but more complex), run Claude Code on VPS (requires auth setup).
- **Consequences:** ~$0.01/day API cost at moderate usage. Future option to eliminate API dependency entirely by routing through wrappers.

### ADR-003: Express 5 over Alternatives
- **Date:** 2026-03-22
- **Session:** 0 (pre-framework)
- **Status:** Accepted
- **Context:** Need an HTTP server for A2A protocol endpoints and agent coordination API.
- **Decision:** Use Express 5 with async handlers. Simple, well-known, sufficient for the hub's HTTP API surface.
- **Alternatives Considered:** Fastify (faster but more complex), Hono (lighter but less ecosystem), raw Node HTTP (too low-level).
- **Consequences:** Express 5 has native async/await support. Large ecosystem for middleware if needed.

### ADR-004: Per-Task Configurable LLM Models
- **Date:** 2026-03-22
- **Session:** 1
- **Status:** Accepted
- **Context:** Hub's internal LLM tasks (classifier, repo-fixer) were hardcoded to a single Anthropic model. The hub is agent-agnostic — wrapper agents can use any LLM. The hub's own internal tasks should also be flexible, since different models excel at different tasks (fast/cheap for classification, strong reasoning for code fixes).
- **Decision:** Each internal LLM task gets its own env var (`CLASSIFIER_MODEL`, `REPO_FIXER_MODEL`) with sensible defaults. Currently Anthropic SDK only, but structured so multi-provider support can be added later.
- **Alternatives Considered:** Single `ANTHROPIC_MODEL` env var (too coarse — can't optimize per task), multi-provider abstraction now (premature — only 2 LLM tasks exist today).
- **Consequences:** Easy to swap models per task without code changes. Future milestone: abstract the LLM layer to support multiple providers (OpenAI, Gemini, Grok, local) per task.
