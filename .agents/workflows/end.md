# /end — Session End Protocol

> **Trigger:** Run at the end of every development session, even short ones.

---

## Steps

### 1. Update Session Log
```
Update: .agents/SESSIONS/Session_N.md
```
Fill in:
- **What Was Done** — List of accomplishments
- **Files Modified** — All files changed
- **Files Created** — All new files
- **Gotchas & Lessons Learned** — Hard-won knowledge
- **Decisions Made** — Any architectural decisions

### 2. Update SUMMARY.md
```
Update: .agents/SYSTEM/SUMMARY.md
```
Overwrite the "Current State" section with:
- What's working NOW
- What's broken / blocked NOW
- What's next

### 3. Update DECISIONS.md (if applicable)
```
Update: .agents/SYSTEM/DECISIONS.md
```
Add any new entries for significant decisions made this session.

### 4. Update ENTITIES.md (if schema changed)
```
Update: .agents/SYSTEM/ENTITIES.md
```
If the data model was modified, update the entity documentation to match.

### 5. Run Entity Validation (if schema changed)
```
Run: validate:entities (if it exists and schema was modified)
```

### 6. Update INBOX.md
```
Update: .agents/TASKS/INBOX.md
```
- Mark completed tasks as `[x]`
- Add any new tasks discovered during the session
- Re-prioritize if needed

### 7. Run Post-Session Validation (if configured)
```
Run: validate:session:post (if it exists)
```

### 8. Present Summary
Present to the user:
- What was accomplished
- What's next
- Any blockers or concerns

---

## Output

After running /end, the agent should present:

```
Session N Complete — [Date]

Accomplished:
- [list of what was done]

Files Changed:
- [list of files]

Gotchas:
- [any lessons learned]

Next Session:
- [recommended focus]

Blockers:
- [any blockers, or "None"]
```

---

## Critical Rule

> **Never skip /end.** Even for short sessions. The next session's quality depends on this session's /end being thorough. Without it, the next session starts from zero.
