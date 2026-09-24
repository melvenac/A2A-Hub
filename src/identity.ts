export { INSTANCE_LIVENESS_MS, decideHeartbeat } from "../convex/instanceLogic.js";

// Name ownership (ADR-011 Layer A) moved into the register mutation in Loop 3:
// see convex/keyLogic.ts decideRegister, which replaced evaluateNameClaim.
export { decideRegister, decideRotate, KEY_FLOOR } from "../convex/keyLogic.js";

export function isSupersededError(error: { message: string }): boolean {
  return error.message.includes("→ 409:") && error.message.includes("superseded");
}
