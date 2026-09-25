import type { Request, Response } from "express";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { hashKey, type AuthMode } from "./auth.js";
import { KEY_FLOOR } from "../convex/keyLogic.js";

/**
 * Per-agent keys (T-003, Loop 3). The rules live in the Convex mutations
 * (design §1.3); these handlers pass the facts only the hub has (the key's
 * length, AUTH_MODE) and turn a refusal into its HTTP status. No response or
 * log line here carries a key or a hash.
 */

type Convex = Pick<ConvexHttpClient, "query" | "mutation">;

/** A mutation refusal is a ConvexError whose data is { status, reason }. */
export function refusalOf(error: unknown): { status: number; reason: string } | null {
  const data = (error as { data?: unknown })?.data;
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { status?: unknown }).status === "number" &&
    typeof (data as { reason?: unknown }).reason === "string"
  ) {
    return data as { status: number; reason: string };
  }
  return null;
}

export function makeRegisterHandler(deps: {
  convex: Convex;
  authMode: AuthMode;
  notifyHuman: (content: string) => Promise<void>;
  /** The owner of every non-human registration until Loop 6's enrollment (T-066 Q3). */
  hubOwner?: string;
}) {
  const { convex, authMode, notifyHuman } = deps;
  const hubOwner = deps.hubOwner ?? "aaron";
  return async (req: Request, res: Response) => {
    try {
      const { name, apiKey, agentCard } = req.body ?? {};
      if (!name || !apiKey || typeof name !== "string" || typeof apiKey !== "string") {
        return res.status(400).json({ error: "Missing required fields: name, apiKey" });
      }
      const card = agentCard ?? { name, description: `Agent ${name}` };
      const instanceId =
        typeof req.body.instanceId === "string" ? req.body.instanceId : undefined;

      let result: { event: string };
      try {
        result = await convex.mutation(api.agents.registerAgent, {
          name,
          apiKeyHash: hashKey(apiKey),
          agentCard: card,
          instanceId,
          keyTooShort: apiKey.length < KEY_FLOOR,
          strict: authMode === "strict",
          // T-066 (Q3, O5): a human owns only itself; anything else belongs to
          // the hub's owner. A body `owner` (top level or in agentCard) is never
          // read, so a registrant cannot choose who can see its rooms.
          owner: card?.kind === "human" ? name : hubOwner,
        });
      } catch (error) {
        const refusal = refusalOf(error);
        if (!refusal) throw error;
        console.warn(`[auth] REJECT register ${name}: ${refusal.reason}`);
        return res.status(refusal.status).json({ error: refusal.reason });
      }

      if (result.event === "legacy-same") {
        console.warn(
          `[auth] WOULD REJECT legacy key on register ${name} ` +
            `(AUTH_MODE=warn; migrate with hub-talk --init-key)`
        );
      } else if (result.event === "migrate") {
        console.warn(`[auth] MIGRATE ${name}: legacy row replaced by a fresh owned row`);
      }

      // §12 H1: never changes an existing peer's type.
      const peerType = card?.kind === "human" ? "human" : "agent";
      await convex.mutation(api.peers.ensure, { name, type: peerType });
      await notifyHuman(`Agent ${name} is now online`);
      res.json({ ok: true, message: `Agent ${name} registered` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
}

/** POST /a2a/rotate (§2.1). Inside the /a2a guard: X-Agent-Key is the proof. */
export function makeRotateHandler(deps: { convex: Convex }) {
  const { convex } = deps;
  return async (req: Request, res: Response) => {
    try {
      // Fails closed in warn as well as strict: an unknown, legacy or shared
      // key proves nothing, so a legacy name migrates by claim, never here.
      if (!req.agentName) {
        return res.status(403).json({ error: "rotation requires your current key" });
      }
      const current = req.headers["x-agent-key"] as string;
      const { newApiKey, instanceId } = req.body ?? {};
      if (typeof newApiKey !== "string" || newApiKey.length < KEY_FLOOR) {
        return res.status(400).json({ error: `key too short (min ${KEY_FLOOR})` });
      }
      if (newApiKey === current) {
        return res.status(400).json({ error: "new key must differ from the current key" });
      }
      try {
        await convex.mutation(api.agents.rotateKey, {
          name: req.agentName,
          currentHash: hashKey(current),
          newHash: hashKey(newApiKey),
          instanceId: typeof instanceId === "string" ? instanceId : undefined,
        });
      } catch (error) {
        const refusal = refusalOf(error);
        if (!refusal) throw error;
        console.warn(`[auth] REJECT rotate ${req.agentName}: ${refusal.reason}`);
        return res.status(refusal.status).json({ error: refusal.reason });
      }
      console.warn(`[auth] ROTATE ${req.agentName}: key replaced`);
      res.json({ ok: true, name: req.agentName });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
}

/** GET /a2a/whoami (§2.4): which name this key authenticates as, or null. */
export function whoami(req: Request, res: Response) {
  res.json({ name: req.agentName ?? null });
}
