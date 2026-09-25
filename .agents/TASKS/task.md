<!-- generated from .agents/state.json rev 44 by open-brain v1.9.0 — do not edit; change state via ob_state -->

# Current Focus

## Objective

Prove a truly remote agent can join the hub over the public internet with its own key. Revocation of superseded keys is verified on tcm's live DB (V-003, session 16) and tcm runs v1.8.0 (V-001). Next in the ordered remote-agent sequence: per-agent keys (T-003; on tcm 8 of 10 names share the dev-key, which resolves as `atlas`, so strict means nothing until then), warn-mode soak, `AUTH_MODE=strict`, expose over HTTPS, remote registration. askPolicy on JSON-RPC (T-004) and rate limiting (T-005) also gate exposure. On-demand spawn follows. _(since session 16)_

## Top tasks

- [ ] **T-003** [P0] Per-agent key generation + rotation
- [ ] **T-002** [P1] Onboard a truly remote agent
- [ ] **T-004** [P1] askPolicy is not enforced on the JSON-RPC path
- [ ] **T-005** [P1] Rate limiting and abuse protection
- [ ] **T-006** [P1] On-demand spawn
