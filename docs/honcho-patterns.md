---
name: Honcho Design Patterns
description: Honcho (plastic-labs) — memory library patterns worth borrowing for A2A Hub messaging app (peer model, background reasoning, observation settings)
type: reference
---

**Source:** https://github.com/plastic-labs/honcho (Python/FastAPI/PostgreSQL — we use the patterns, not the stack)

**Patterns to borrow for A2A Hub v2:**

1. **Entity/Peer model** — users AND agents are "peers" with evolving profiles. Model Clark, Hub agents, Brian's wrapper as first-class entities with their own memory.
2. **Observation settings** — configurable visibility per peer in multi-agent sessions. Who sees what in a conversation.
3. **Background reasoning** — extract conclusions from interactions asynchronously and continuously, not just at session end. Map to Convex background functions.
4. **Multi-participant sessions** — mixed human+AI conversations natively. Each participant has persistent memory.

**Why not adopt Honcho directly:** Python/PostgreSQL stack, managed service push, no real-time reactivity like Convex. Better to build these patterns on our existing Convex + Next.js stack.

**Discovered:** 2026-03-23 during Telegram troubleshooting session.
