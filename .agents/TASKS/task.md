# Current Sprint

> **Focus:** v1 — Test the message loop, get Brian connected

---

## Active Tasks

1. **Test `/a2a/message/send`** — Send a real message, verify classify → memory search → escalate/respond pipeline works
2. **Test with Brian** — Brian runs alice wrapper, sends real questions, full loop completes
3. **Verify experience dedup** — Same trigger shouldn't create duplicate experiences

## Context

Hub is deployed, Convex connected, all routes have error handling, README is written. The remaining work is testing — proving the core loop actually works end-to-end.

## Success Criteria

- `/a2a/message/send` returns a classified response (from memory or escalation)
- Brian can follow README to run alice wrapper
- Full loop completes: question → classify → store → respond
