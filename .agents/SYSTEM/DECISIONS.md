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

### ADR-005: Drop Telegram — Build Purpose-Built Messaging App
- **Date:** 2026-03-23
- **Session:** 3
- **Status:** Accepted
- **Context:** Testing the Claude Code Telegram plugin revealed fundamental reliability issues. The plugin delivers inbound messages to Claude Code via fire-and-forget MCP notifications (no `await`, no retry, `.catch()` only logs to stderr). When Claude Code is busy processing a tool call, incoming Telegram messages are silently dropped — no queue, no buffer, no retry. Multiple messages confirmed lost during testing. This is a design limitation of the plugin architecture, not a configuration issue.
- **Decision:** Abandon Telegram as the messaging interface entirely. Instead, build a purpose-built AI messaging app using Convex + Next.js. Convex's reactive subscriptions guarantee message persistence and real-time delivery — messages write to a Convex table and persist until consumed. No fire-and-forget, no silent drops.
- **Alternatives Considered:** (1) Patch the Telegram plugin locally to add retry/queue logic (fragile, fighting upstream design). (2) Run a Telegram bot on VPS writing to Convex as intermediary (adds unnecessary dependency on Telegram). (3) Keep Telegram for v1 and build custom app later (unreliable v1 is worse than no messaging in v1).
- **Consequences:** Telegram integration removed from v1/v2 roadmap. New v2 deliverable: custom messaging frontend (Next.js + Convex). Gains full control over UX, message persistence, delivery guarantees, and multi-device support. Eliminates dependency on third-party bot APIs.

### ADR-006: Protocol Spine — Direct Addressing, Chat Channel, Atomic Claims, Turn Caps
- **Date:** 2026-07-22
- **Session:** 5
- **Status:** Accepted
- **Context:** The hub was hub-and-spoke mediation, not true A2A: escalation picked `agents[0]` with no addressing, and the responding "agent" was historically Aaron via Telegram — a human relay. Aaron's directive: true A2A (2+ agents, no human relay), one codebase for local + VPS, unified multi-orchestration ("both machinery" — runtime peers and dev-time repo agents share one coordination bus), and no Telegram anywhere in the protocol.
- **Decision:** (1) Telegram deleted entirely (code + deps), not env-gated — overrides Atlas's earlier "gate it" guidance per Aaron. Hub notifications go through the chat channel: the hub is a peer, Aaron is a peer (`HUMAN_PEER`, default "aaron"), and hub activity is a session between them. (2) `to:` addressing on `/a2a/message/send` (`params.to` or `message.metadata.to`); addressed messages skip memory and route to the named agent. (3) ADR-005's peers/sessions/sessionPeers/messages tables implemented now (not v2), replacing the dead `conversations` table; session routes: create, send message, poll messages. (4) Turn caps: sessions carry `turnCount`/`maxTurns` (default 16), enforced atomically in `messages.send`, auto-close at cap — two autonomous agents converge instead of looping. (5) `tasks.claim` atomic mutation — first agent wins; serves both runtime wrappers and future dev-time orchestration.
- **Alternatives Considered:** Env-gating Telegram (rejected by Aaron — dead code, and the chat channel replaces it outright); pure P2P agent endpoints (rejected — local agents behind NAT can't be dialed into; hub as rendezvous broker with outbound connections is the workable topology); full A2A spec compliance now (deferred — task lifecycle states, SSE streaming, per-agent cards come after the autonomous 2-agent loop is proven).
- **Consequences:** No push notifications while Aaron is away until the PWA/service-worker phase — acceptable for local-first iteration. Milestone 2 unblocked: the `a2a-agent` wrapper daemon (poll → LLM → respond) is the remaining piece for a zero-human agent exchange. `convex/_generated/api.d.ts` was extended by hand (codegen needs a running backend); regenerate with `npx convex dev` once the local stack is up.

### ADR-007: Session Lifecycle Controls + Deterministic @Mention Reply Routing
- **Date:** 2026-07-23
- **Session:** 6
- **Status:** Accepted
- **Context:** With real-LLM daemons live, three UX gaps surfaced immediately: (1) cap-closed conversations vanished from `listForPeer` and could only be continued by reseeding from scratch; (2) in group sessions (human + 2 agents), every agent answered every human message, and naive gating on "the last message" created a first-responder race that muted the slower agent; (3) agents assumed their counterpart was human and burned turns on identity confusion.
- **Decision:** (1) `sessions.extend` adds turns AND reopens a cap-closed session — conversations resume with transcript intact; `listForPeer` hides closed sessions from daemons but exposes them to viewers via `includeClosed`. (2) @mention routing is enforced **deterministically daemon-side** (regex + participant metadata, never LLM judgment): a message with `@name` mentions is only for those agents; no mentions = ask-the-room (all agents reply) in human-containing sessions; unaddressed agent→agent messages in group sessions get no auto-reply (cascade stopped — agents hand off explicitly with `@name`). Gating keys on "newest message addressed to ME that I haven't answered," not the newest message overall (race fix). (3) Persona teaches agents they are peers among humans and agents plus the @mention convention; transcript lines carry speaker labels with a deterministic strip of mimicked labels on send. DONE detection tolerates trailing punctuation/markdown.
- **Alternatives Considered:** Mention-required in group chats (rejected by Aaron — forgetting the mention would mean silence); first-agent-claims-the-message (rejected — unpredictable responder, needs new claim machinery); hub-side routing metadata (deferred — content-embedded mentions are human-typable and UI-friendly); structured end-of-conversation flag (deferred to v2 — DONE sentinel kept, now punctuation-tolerant, with the known leak that prose ending in "DONE" terminates).
- **Consequences:** Group chats behave like rooms: ask the room or target one agent; conversations are extendable instead of disposable. The sentinel leak and the lack of per-agent personas are the top follow-ups. Client grew into the de facto chat channel (v2 scope pulled forward).

### ADR-008: Persona Resolution & Composition
- **Date:** 2026-07-24
- **Session:** 7
- **Status:** Accepted
- **Context:** Agents needed real roles (mentor/learner for the teaching use case), but the daemon's default persona also carries load-bearing hub conventions (@mention protocol, speaker labels, DONE sentinel). A naive `--persona` override replaced the conventions along with the role, so custom-persona agents would lose the protocol.
- **Decision:** Split persona into two layers, composed at startup: **role text** (who the agent is) resolved by precedence `--persona` flag > `--persona-file <path>` > `personas/<name>.md` convention > none, and **hub conventions** (always appended, never overridable). Persona files live in the repo (`personas/`), resolved relative to cwd, so the launch script needs no per-agent config. `--print-persona` prints the composed system prompt and exits, for inspection without starting the stack.
- **Alternatives Considered:** Persona text inline in `start-stack.ps1` launch args (rejected — multi-line prompts in PS args are unmaintainable); single JSON config for all agents (rejected — one file per agent is git-friendlier and matches the `--name` convention); conventions overridable too (rejected — protocol adherence must be structural, not optional).
- **Consequences:** Personas only describe roles; the protocol can't be accidentally deleted. Adding an agent = one markdown file. Onboarding Brian's Alice later means shipping a persona file with the wrapper package. The agent card description now shows the role (first 120 chars of composed prompt).
