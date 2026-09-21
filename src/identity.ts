import type { AuthMode } from "./auth.js";

export { INSTANCE_LIVENESS_MS, decideHeartbeat } from "../convex/instanceLogic.js";

export function evaluateNameClaim(
  existingHash: string | undefined,
  presentedHash: string,
  mode: AuthMode
): "ok" | "warn" | "reject" {
  if (!existingHash || existingHash === presentedHash) return "ok";
  return mode === "strict" ? "reject" : "warn";
}

export function isSupersededError(error: { message: string }): boolean {
  return error.message.includes("→ 409:") && error.message.includes("superseded");
}
