<!-- generated from .agents/state.json rev 47 by open-brain v1.10.0 — do not edit; change state via ob_state -->

# Current Focus

## Objective

Prove a truly remote agent can join the hub over the public internet with its own key. Done: revocation of superseded keys (V-003); per-agent keys on tcm, where every row owns its key and the shared dev-key resolves to no one (V-006, session 17); tcm runs v1.10.0 with the chat UI at /ui/ (V-005). Next in the ordered remote-agent sequence: warn-mode soak (T-064 reads the log for legacy-key traffic), then `AUTH_MODE=strict`, then expose over HTTPS, then remote registration (T-002). askPolicy on JSON-RPC (T-004), rate limiting (T-005), error-page leaks (T-062) and the hub/Convex bindings (T-057) also gate exposure. On-demand spawn follows. _(since session 17)_

## Top tasks

- [ ] **T-002** [P1] Onboard a truly remote agent
- [ ] **T-004** [P1] askPolicy is not enforced on the JSON-RPC path
- [ ] **T-005** [P1] Rate limiting and abuse protection
- [ ] **T-006** [P1] On-demand spawn
- [ ] **T-007** [P1] Two cheap repo-peer measurements
