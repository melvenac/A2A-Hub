import type { ServerCallContext, TaskStore } from "@a2a-js/sdk/server";
import type { Task } from "@a2a-js/sdk";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { callerOf } from "./a2a-executor.js";
import { note, shortId } from "./authz.js";

/**
 * TaskStore backed by Convex.
 *
 * The SDK ships InMemoryTaskStore, which loses every task on restart — the hub
 * restarts often enough during development that an in-memory store would make
 * task IDs meaningless across a rebuild. Convex is already the hub's system of
 * record, so the whole interface is two methods over one table.
 *
 * T-066 (§6): a task belongs to the caller that created it. The SDK passes the
 * call context to every save and load, so the store records the creator once
 * and loads another caller's task as absent in strict (the same JSON-RPC error
 * as a task id that does not exist, O6), and logged in warn. A task saved
 * before Loop 5 has no creator and loads for anyone, as before.
 */
export class ConvexTaskStore implements TaskStore {
  constructor(
    private readonly convex: ConvexHttpClient,
    private readonly route = "POST /a2a/jsonrpc"
  ) {}

  async save(task: Task, context?: ServerCallContext): Promise<void> {
    const createdBy = callerOf(context) ?? undefined;
    await this.convex.mutation(api.a2aTasks.save, {
      taskId: task.id,
      contextId: task.contextId,
      task,
      ...(createdBy ? { createdBy } : {}),
    });
  }

  async load(taskId: string, context?: ServerCallContext): Promise<Task | undefined> {
    const row = await this.convex.query(api.a2aTasks.loadFor, { taskId });
    // The SDK distinguishes "no such task" (undefined) from a stored task.
    // Convex returns null for a miss, and null is not undefined to the caller.
    if (!row) return undefined;
    const caller = callerOf(context);
    if (row.createdBy && row.createdBy !== caller) {
      if (note(`a2a-task=${shortId(taskId)}`, this.route, caller) === "reject") return undefined;
    }
    return row.task ?? undefined;
  }
}
