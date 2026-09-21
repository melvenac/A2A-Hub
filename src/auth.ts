import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

/**
 * X-Agent-Key validation.
 *
 * The agent card advertises an apiKey security scheme, but until now every
 * guarded route only checked that the header was *present* — a bogus key
 * returned 200. `apiKeyHash` was written at registration and never read.
 *
 * Enforcing that outright would reject every daemon still running with an
 * unregistered key, so the mode is a config check rather than a flag day:
 *
 *   AUTH_MODE=warn   (default) validate, log rejections, allow through
 *   AUTH_MODE=strict          validate, reject with 403
 *
 * Run in warn until the logs are quiet, then flip. `warn` is the default
 * because this ships into a live stack; strict is the destination.
 */
export type AuthMode = "warn" | "strict";

export const authMode: AuthMode =
  process.env.AUTH_MODE === "strict" ? "strict" : "warn";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Agent name resolved from X-Agent-Key, or null if the key is unknown. */
      agentName?: string | null;
    }
  }
}

export function hashKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function requireAgentKey(convex: ConvexHttpClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers["x-agent-key"] as string | undefined;

    // A missing key was always a 401 and stays one in both modes — that check
    // was never the broken part.
    if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

    let agent: { name: string } | null = null;
    try {
      agent = await convex.query(api.agents.getByKeyHash, {
        apiKeyHash: hashKey(apiKey),
      });
    } catch (error) {
      // Convex being unreachable is not proof the key is bad. Failing closed
      // here would turn a database blip into a total hub outage, so surface it
      // as 503 rather than silently authenticating or silently rejecting.
      console.error("[auth] key lookup failed:", (error as Error).message);
      return res.status(503).json({ error: "Auth backend unavailable" });
    }

    if (!agent) {
      const where = `${req.method} ${req.path}`;
      if (authMode === "strict") {
        console.warn(`[auth] REJECT unknown X-Agent-Key on ${where}`);
        return res.status(403).json({ error: "Invalid X-Agent-Key" });
      }
      // Deliberately does not echo the key or its hash — this line goes to a
      // log Aaron reads to decide when strict is safe, not to a secret store.
      console.warn(
        `[auth] WOULD REJECT unknown X-Agent-Key on ${where} ` +
          `(AUTH_MODE=warn; set AUTH_MODE=strict to enforce)`
      );
      req.agentName = null;
      return next();
    }

    req.agentName = agent.name;
    next();
  };
}
