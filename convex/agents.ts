import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { decideHeartbeat } from "./instanceLogic.js";
import {
  classifyAtDeployStatus,
  decideRegister,
  decideRotate,
  describeKeyHash,
  ownedStatusFor,
  RETIRED_SHARED_KEY_HASH,
  resolveKeyHolder,
  type KeyHashStatus,
} from "./keyLogic.js";

// Convex caps mutation writes; leftover extras self-heal on the next register.
const MAX_DELETES = 4000;

/** A refusal is a throw, never a return value: the v1.8.0 hub ignores
 * register's return, so a returned { ok: false } would read as success
 * (Loop 3 §11, B2). The new hub maps `data.status` to the HTTP status. */
function refuse(status: number, reason: string): never {
  throw new ConvexError({ status, reason });
}

async function rowsByName(ctx: MutationCtx, name: string) {
  return ctx.db
    .query("agents")
    .withIndex("by_name", (q) => q.eq("name", name))
    .collect();
}

async function rowsByHash(ctx: MutationCtx, apiKeyHash: string) {
  return ctx.db
    .query("agents")
    .withIndex("by_apiKeyHash", (q) => q.eq("apiKeyHash", apiKeyHash))
    .collect();
}

// Canonical row: newest lastSeen; tie-break by _id so heartbeat's .first()
// and register agree after extras are gone.
function canonicalOf(rows: Doc<"agents">[]): Doc<"agents"> {
  let canonical = rows[0];
  for (const row of rows) {
    if (
      row.lastSeen > canonical.lastSeen ||
      (row.lastSeen === canonical.lastSeen && row._id < canonical._id)
    ) {
      canonical = row;
    }
  }
  return canonical;
}

/**
 * §1.1's attrition guard. Before a write takes `name` away from `apiKeyHash`,
 * every *unclassified* row of another name holding that hash is stamped
 * legacy, so a hash shared at deploy never becomes owned by attrition, even
 * if classifyAtDeploy runs late.
 */
async function stampCoHolders(ctx: MutationCtx, apiKeyHash: string, name: string) {
  for (const row of await rowsByHash(ctx, apiKeyHash)) {
    if (row.name !== name && row.keyStatus === undefined) {
      await ctx.db.patch(row._id, { keyStatus: "legacy" });
    }
  }
}

/** Delete `rows`, stamping co-holders first for any hash the name gives up. */
async function deleteRows(ctx: MutationCtx, rows: Doc<"agents">[], keepHash?: string) {
  let deleted = 0;
  for (const row of rows) {
    if (deleted >= MAX_DELETES) break;
    if (row.apiKeyHash !== keepHash) await stampCoHolders(ctx, row.apiKeyHash, row.name);
    await ctx.db.delete(row._id);
    deleted++;
  }
  return deleted;
}

/** A lease id that supersedes any live instance (§2.3). Stale after 45 s. */
function takeoverId(instanceId: string | undefined): string {
  return instanceId ?? `takeover-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const registerArgs = {
  name: v.string(),
  apiKeyHash: v.string(),
  agentCard: v.any(),
  instanceId: v.optional(v.string()),
  askPolicy: v.optional(
    v.object({
      allow: v.array(v.string()),
      what: v.optional(v.any()),
    })
  ),
  // New in v1.9.0, optional so the v1.8.0 hub's calls still validate. Only the
  // hub sees the plaintext key, so it reports the floor; strict comes from the
  // hub's AUTH_MODE. Absent = not short, warn.
  keyTooShort: v.optional(v.boolean()),
  strict: v.optional(v.boolean()),
};

export type RegisterEvent = "insert" | "same" | "legacy-same" | "migrate";

async function registerCore(
  ctx: MutationCtx,
  args: {
    name: string;
    apiKeyHash: string;
    agentCard: unknown;
    instanceId?: string;
    askPolicy?: { allow: string[]; what?: unknown };
    keyTooShort?: boolean;
    strict?: boolean;
  }
): Promise<{ id: Doc<"agents">["_id"]; event: RegisterEvent }> {
  const now = Date.now();
  const instanceFields = args.instanceId
    ? { activeInstanceId: args.instanceId, lastHeartbeatAt: now }
    : {};
  const policyFields =
    args.askPolicy !== undefined ? { askPolicy: args.askPolicy } : {};

  const dupes = await rowsByName(ctx, args.name);
  const canonical = dupes.length ? canonicalOf(dupes) : null;
  const holders = await rowsByHash(ctx, args.apiKeyHash);

  const decision = decideRegister({
    existing: canonical,
    presentedHash: args.apiKeyHash,
    heldByOtherName: holders.some((r) => r.name !== args.name),
    keyTooShort: args.keyTooShort === true,
    strict: args.strict === true,
  });

  switch (decision.kind) {
    case "refuse":
      return refuse(decision.status, decision.reason);

    case "insert": {
      const id = await ctx.db.insert("agents", {
        name: args.name,
        apiKeyHash: args.apiKeyHash,
        agentCard: args.agentCard,
        lastSeen: now,
        status: "online",
        keyStatus: ownedStatusFor(args.apiKeyHash),
        ...instanceFields,
        ...policyFields,
      });
      return { id, event: "insert" };
    }

    case "migrate": {
      // §4.1 / D-007: release the legacy row(s) and register fresh, in one
      // transaction. The fresh row keeps nothing from the legacy one.
      await deleteRows(ctx, dupes);
      const id = await ctx.db.insert("agents", {
        name: args.name,
        apiKeyHash: args.apiKeyHash,
        agentCard: args.agentCard,
        lastSeen: now,
        status: "online",
        keyStatus: ownedStatusFor(args.apiKeyHash),
        activeInstanceId: takeoverId(args.instanceId),
        lastHeartbeatAt: now,
        ...policyFields,
      });
      return { id, event: "migrate" };
    }

    case "same": {
      const c = canonical!;
      await ctx.db.patch(c._id, {
        agentCard: args.agentCard,
        lastSeen: now,
        status: "online",
        ...instanceFields,
        ...policyFields,
      });
      await deleteRows(
        ctx,
        dupes.filter((r) => r._id !== c._id),
        c.apiKeyHash
      );
      return { id: c._id, event: decision.legacy ? "legacy-same" : "same" };
    }
  }
}

/** The v1.8.0 hub's call. Same args (new ones optional) and return shape (B2). */
export const register = mutation({
  args: registerArgs,
  handler: async (ctx, args) => (await registerCore(ctx, args)).id,
});

/** The v1.9.0 hub's call: also says what happened, for its log line. */
export const registerAgent = mutation({
  args: registerArgs,
  handler: async (ctx, args) => registerCore(ctx, args),
});

/** §2.2: the only way an owned name changes its key. */
export const rotateKey = mutation({
  args: {
    name: v.string(),
    currentHash: v.string(),
    newHash: v.string(),
    instanceId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const rows = await rowsByName(ctx, args.name);
    const canonical = rows.length ? canonicalOf(rows) : null;
    const holders = await rowsByHash(ctx, args.newHash);
    const decision = decideRotate({
      row: canonical,
      currentHash: args.currentHash,
      newHash: args.newHash,
      newHeldByOtherName: holders.some((r) => r.name !== args.name),
    });
    if (decision.kind === "refuse") return refuse(decision.status, decision.reason);

    const c = canonical!;
    await deleteRows(
      ctx,
      rows.filter((r) => r._id !== c._id),
      c.apiKeyHash
    );
    const now = Date.now();
    await ctx.db.patch(c._id, {
      apiKeyHash: args.newHash,
      keyStatus: ownedStatusFor(args.newHash),
      activeInstanceId: takeoverId(args.instanceId),
      lastHeartbeatAt: now,
      lastSeen: now,
    });
    return { ok: true };
  },
});

/**
 * §1.1: classify rows present at deploy, once. Touches only rows with no
 * keyStatus, so a second run changes nothing. Admin key, right after the push:
 *   convex run agents:classifyAtDeploy
 * Returns counts only, never a name next to a hash.
 *
 * Ruling 3, F2: a row holding the retired shared key is never owned, even a
 * lone one (classifyAtDeployStatus). It also demotes any such row an earlier
 * build (84694b9) marked owned, so a local database classified by that build
 * is repaired by running this once more.
 */
export const classifyAtDeploy = internalMutation({
  args: {},
  handler: async (
    ctx
  ): Promise<{ owned: number; legacy: number; untouched: number; demoted: number }> => {
    const all = await ctx.db.query("agents").collect();
    let owned = 0;
    let legacy = 0;
    let untouched = 0;
    let demoted = 0;
    for (const row of all) {
      if (row.keyStatus !== undefined) {
        if (row.keyStatus === "owned" && row.apiKeyHash === RETIRED_SHARED_KEY_HASH) {
          await ctx.db.patch(row._id, { keyStatus: "legacy" });
          demoted++;
        } else {
          untouched++;
        }
        continue;
      }
      const shared = all.some(
        (r) => r.apiKeyHash === row.apiKeyHash && r.name !== row.name
      );
      const status = classifyAtDeployStatus(row.apiKeyHash, shared);
      await ctx.db.patch(row._id, { keyStatus: status });
      if (status === "owned") owned++;
      else legacy++;
    }
    return { owned, legacy, untouched, demoted };
  },
});

/**
 * §4.3 / D-007: release a name (delete its agents rows). peers, sessions and
 * messages are untouched. Admin key only, one call per name:
 *   convex run agents:release '{"name":"<name>"}'
 */
export const release = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    const rows = await rowsByName(ctx, args.name);
    return { deleted: await deleteRows(ctx, rows) };
  },
});

export const heartbeat = mutation({
  args: { name: v.string(), instanceId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ ok: true; superseded?: true }> => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (!agent) return { ok: true };

    const now = Date.now();
    const decision = decideHeartbeat({
      instanceId: args.instanceId,
      activeInstanceId: agent.activeInstanceId,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      now,
    });

    if (decision === "superseded") return { ok: true, superseded: true };

    if (decision === "legacy") {
      await ctx.db.patch(agent._id, { lastSeen: now, status: "online" });
      return { ok: true };
    }

    await ctx.db.patch(agent._id, {
      lastSeen: now,
      status: "online",
      activeInstanceId: args.instanceId,
      lastHeartbeatAt: now,
    });
    return { ok: true };
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{
    name: string;
    askPolicy?: { allow: string[] };
  } | null> => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    // No public function returns apiKeyHash (ruling 3, F1): a stored hash is
    // rotateKey's proof, so it must be readable only with the admin key.
    return agent ? { name: agent.name, askPolicy: agent.askPolicy } : null;
  },
});

// Resolves a presented X-Agent-Key (already hashed by the caller) to its agent.
// Returns null when nothing authenticates: an unknown key, a legacy key, or a
// hash two names share (U3). The shape stays { name } | null so the v1.8.0 hub
// (auth.ts: `if (!agent)`) reads every non-authenticating result as unknown.
export const getByKeyHash = query({
  args: { apiKeyHash: v.string() },
  handler: async (ctx, args): Promise<{ name: string } | null> => {
    const rows = await ctx.db
      .query("agents")
      .withIndex("by_apiKeyHash", (q) => q.eq("apiKeyHash", args.apiKeyHash))
      .take(2);
    return resolveKeyHolder(rows);
  },
});

// Why a hash does not authenticate. Only the v1.9.0 hub calls this, only after
// getByKeyHash returned null, and only to word its log line (B2).
export const keyHashStatus = query({
  args: { apiKeyHash: v.string() },
  handler: async (ctx, args): Promise<KeyHashStatus> => {
    const rows = await ctx.db
      .query("agents")
      .withIndex("by_apiKeyHash", (q) => q.eq("apiKeyHash", args.apiKeyHash))
      .take(2);
    return describeKeyHash(rows);
  },
});

// Online agents. A human-kind row (the browser client's `aaron`, §12 H3) is
// never an online agent: escalation picks agents[0] from this list. Rows are
// projected: no apiKeyHash, keyStatus or instance lease leaves this query
// (ruling 3, F1). Its callers read name, lastSeen and agentCard.kind only.
export const listOnline = query({
  args: {},
  handler: async (
    ctx
  ): Promise<{ name: string; agentCard: any; lastSeen: number; status: "online" | "offline" }[]> => {
    const rows = await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("status"), "online"))
      .collect();
    return rows
      .filter((r) => r.agentCard?.kind !== "human")
      .map((r) => ({ name: r.name, agentCard: r.agentCard, lastSeen: r.lastSeen, status: r.status }));
  },
});
