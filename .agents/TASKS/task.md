<!-- generated from .agents/state.json rev 1 by open-brain v1.7.0 — do not edit; change state via ob_state -->

# Current Focus

## Objective

Prove a truly remote agent can join the hub over the public internet with its own key: first verify revocation against the live database (the one unmet gate), then run the ordered remote-agent sequence — redeploy tcm with v1.7.0, per-agent keys, warn-mode soak, `AUTH_MODE=strict`, expose over HTTPS, remote registration. On-demand spawn follows. _(since session 14)_

## Top tasks

- [ ] **T-001** [P0] Verify revocation against the live database
- [ ] **T-002** [P1] Onboard a truly remote agent
- [ ] **T-003** [P1] Per-agent key generation + rotation
- [ ] **T-004** [P1] askPolicy is not enforced on the JSON-RPC path
- [ ] **T-005** [P1] Rate limiting and abuse protection
