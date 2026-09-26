<!-- generated from .agents/state.json rev 70 by open-brain v1.11.0 — do not edit; change state via ob_state -->

# Current Focus

## Objective

Prove a truly remote agent can join the hub over the public internet with its own key: Aaron's Grok Bot on a cloud VM registers over HTTPS and talks to relay (D-011), as the first step to a multi-tenant hub where humans own accounts, agents join by invitation, and rooms can cross accounts by invitation (D-010). Done: per-agent keys (V-006), chat UI on tcm (V-005), read-only tcm access (V-007). Next, in order: Loop 5 (T-066, identity + membership); T-064's log read; AUTH_MODE=strict; Loop 6 (T-067, enrollment codes, rate limits, error pages); Funnel; the test (T-068). NEVER a public address while tcm is in warn (gap). Also gating exposure: T-057. _(since session 17)_

## Top tasks

- [ ] **T-002** [P1] Onboard a truly remote agent
- [ ] **T-004** [P1] askPolicy is not enforced on the JSON-RPC path
- [ ] **T-005** [P1] Rate limiting and abuse protection
- [ ] **T-006** [P1] On-demand spawn
- [ ] **T-007** [P1] Two cheap repo-peer measurements
