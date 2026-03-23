# Framework Guide
**Version 1.0 — Portable Agent Architecture**

> This document explains the framework, how to use it, and how to duplicate it for any project with any tech stack.

---

## What Is This?

This is an **AI-first development framework** — a structured set of markdown documents, workflows, and validation scripts that give AI coding agents (Cline, Claude Code, Gemini, Cursor, etc.) persistent memory, consistent behavior, and guardrails across sessions.

Without this framework, every AI session starts from zero. With it, agents:
- Know what was built, what's broken, and what's next
- Follow consistent coding standards
- Don't repeat mistakes (gotchas are documented)
- Update their own documentation as they work
- Can be validated for protocol compliance

---

## Framework Architecture

```
.agents/                          ← Agent-readable project brain
├── FRAMEWORK.md                  ← This file (how to use & duplicate)
├── SYSTEM/                       ← Project truth documents
│   ├── PRD.md                    ← Product requirements
│   ├── SUMMARY.md                ← Current state (overwritten each session)
│   ├── ENTITIES.md               ← Data model documentation
│   ├── DECISIONS.md              ← Architectural decision log
│   ├── RULES.md                  ← Coding standards & conventions
│   ├── TESTING.md                ← Testing strategy
│   ├── RUNBOOK.md                ← Production operations
│   └── SECURITY.md               ← Security audit checklist
├── TASKS/                        ← Work tracking
│   ├── INBOX.md                  ← Prioritized task backlog
│   └── task.md                   ← Current sprint/focus
├── SESSIONS/                     ← Session history
│   ├── SESSION_TEMPLATE.md       ← Template for new sessions
│   └── Session_N.md              ← Individual session logs
├── skills/                       ← Reusable agent skills
│   ├── INDEX.md                  ← Skill registry
│   └── <skill-name>/SKILL.md    ← Individual skill instructions
└── workflows/                    ← Lifecycle commands
    ├── start.md                  ← Session start protocol
    ├── end.md                    ← Session end protocol
    ├── test.md                   ← Zero-token E2E testing protocol
    └── task.md                   ← Next task selection protocol

.claude/commands/                 ← Claude Code slash commands (mirrors workflows/)
CLAUDE.md                         ← Claude Code entry point
```

### The Three Layers

| Layer | Purpose | Changes How Often |
|---|---|---|
| **SYSTEM/** | Project truth — what the project IS | Rarely (PRD, RULES) to every session (SUMMARY) |
| **TASKS/** | What needs to be DONE | Every session |
| **SESSIONS/** | What WAS done | Append-only log |

**Skills** are reusable patterns. **Workflows** are lifecycle hooks.

---

## The Session Lifecycle

Every development session follows this pattern:

```
/start
  ├── Read SUMMARY.md (current state)
  ├── Read INBOX.md (priorities)
  ├── Read ENTITIES.md (if schema work)
  ├── Create session log
  └── State objective → get approval → code

... development work ...

/test (optional — after feature work or before deploy)
  ├── Assess project structure
  ├── Author .spec.ts files (zero-token — deterministic scripts)
  ├── Execute via Playwright CLI (zero AI tokens)
  ├── Fix loop (max 3 attempts per failure)
  └── Report → feeds into /end session summary

/end
  ├── Update session log (accomplishments, files, gotchas)
  ├── Update SUMMARY.md (current state block)
  ├── Update DECISIONS.md (if applicable)
  ├── Update ENTITIES.md (if schema changed)
  ├── Mark tasks done in INBOX.md
  └── Present summary to user
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Do This Instead |
|---|---|---|
| Writing all skills upfront | Skills without real usage are speculative and wrong | Create skills when you've repeated a pattern 3+ times |
| Putting code in SYSTEM docs | SYSTEM docs are for agents to READ, not execute | Keep code in `src/scripts/`, reference from docs |
| Skipping /end | Next session starts from zero, loses all context | Always run /end, even for short sessions |
| Making SUMMARY.md too long | Agents waste tokens reading history | Archive old milestones, keep SUMMARY focused on NOW |
| Tech-specific rules in universal docs | Makes the framework non-portable | Keep tech rules in RULES.md and skills, not in workflows |
