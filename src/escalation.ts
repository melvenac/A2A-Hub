import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { randomUUID } from "crypto";

export class Escalation {
  private client: ConvexHttpClient;

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl);
  }

  /**
   * @param owner the caller's owner (T-066 Q5). When set and no agent is named,
   *              only that owner's agents are candidates, so a stranger's
   *              question never lands on someone else's agent. Unset (warn,
   *              unknown caller) keeps today's "any online agent".
   */
  async escalateToAgent(message: string, agentName?: string, owner?: string): Promise<string> {
    // Find an online agent
    const agents = await this.client.query(api.agents.listOnline, {});
    const candidates = owner ? agents.filter((a: any) => a.owner === owner) : agents;
    const target = agentName
      ? agents.find((a: any) => a.name === agentName)
      : candidates[0];

    if (!target) {
      return "No agents are currently online. Please try again later or check the documentation at https://github.com/melvenac/A2A-Hub";
    }

    const taskId = randomUUID();

    // Create escalated task in Convex
    await this.client.mutation(api.tasks.create, {
      taskId,
      messages: [{ role: "user", content: message, timestamp: Date.now() }],
      assignedAgent: target.name,
    });
    await this.client.mutation(api.tasks.updateStatus, {
      taskId,
      status: "escalated",
      assignedAgent: target.name,
    });

    // Wait for response (poll with timeout)
    const timeout = 120_000; // 2 minutes
    const start = Date.now();

    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, 3000)); // check every 3s

      const task = await this.client.query(api.tasks.getByTaskId, { taskId });
      if (task && task.status === "completed") {
        const lastMessage = task.messages[task.messages.length - 1];
        return lastMessage.content;
      }
    }

    return "Escalation timed out — the agent did not respond within 2 minutes.";
  }
}
