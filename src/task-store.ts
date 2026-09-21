import type { TaskStore } from "@a2a-js/sdk/server";
import type { Task } from "@a2a-js/sdk";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

/**
 * TaskStore backed by Convex.
 *
 * The SDK ships InMemoryTaskStore, which loses every task on restart — the hub
 * restarts often enough during development that an in-memory store would make
 * task IDs meaningless across a rebuild. Convex is already the hub's system of
 * record, so the whole interface is two methods over one table.
 */
export class ConvexTaskStore implements TaskStore {
  constructor(private readonly convex: ConvexHttpClient) {}

  async save(task: Task): Promise<void> {
    await this.convex.mutation(api.a2aTasks.save, {
      taskId: task.id,
      contextId: task.contextId,
      task,
    });
  }

  async load(taskId: string): Promise<Task | undefined> {
    const task = await this.convex.query(api.a2aTasks.load, { taskId });
    // The SDK distinguishes "no such task" (undefined) from a stored task.
    // Convex returns null for a miss, and null is not undefined to the caller.
    return task ?? undefined;
  }
}
