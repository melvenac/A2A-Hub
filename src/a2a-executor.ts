import { randomUUID } from "crypto";
import type { AgentExecutor, RequestContext, ExecutionEventBus, User } from "@a2a-js/sdk/server";
import type { Task, TaskStatusUpdateEvent, Message } from "@a2a-js/sdk";
import type { HubExecutor } from "./executor.js";

/**
 * The JSON-RPC caller (T-004, T-066 §6): the name the key guard resolved.
 * The SDK hands it to the executor and the task store as context.user.
 * userName is "" for the unauthenticated warn path, as the SDK's own
 * UnauthenticatedUser does.
 */
export class HubUser implements User {
  constructor(private readonly name: string | null) {}
  get isAuthenticated(): boolean {
    return !!this.name;
  }
  get userName(): string {
    return this.name ?? "";
  }
}

/** The caller from a request context, or null. */
export function callerOf(context: { user?: User } | undefined): string | null {
  return context?.user?.userName || null;
}

export type AuthorizeAsk = (
  caller: string | null,
  to: string | undefined
) => Promise<{ refusal?: string; owner?: string }>;

/**
 * Adapts the hub's existing HubExecutor to the A2A AgentExecutor interface.
 *
 * The hub's behaviour is unchanged — answer from accumulated memory, delegate
 * to a peer when memory can't — this only expresses it in the spec's vocabulary
 * so a third-party A2A client can drive it. Delegation to a better-informed peer
 * is what the spec calls task delegation, so the mapping is close to literal.
 *
 * A full Task lifecycle is published rather than the SDK README's single-message
 * shortcut. That shortcut suits an agent that answers instantly; escalation here
 * reaches a repo peer that has taken 43s to answer a real question, and holding
 * a blocking HTTP request open that long is what `submitted → working →
 * completed` exists to avoid. It also means the terminal state is a structured
 * TaskState instead of the trailing "DONE" sentinel, which mis-fires on any
 * reply that merely *ends* with the word.
 */
export class HubAgentExecutor implements AgentExecutor {
  /**
   * @param deps.authorize the hub's rules for an ask (cross-owner `to`, askPolicy),
   *        shared with POST /a2a/message/send. Absent = allow (tests).
   */
  constructor(
    private readonly hub: HubExecutor,
    private readonly deps: { authorize?: AuthorizeAsk } = {}
  ) {}

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { userMessage, taskId, contextId } = requestContext;

    const text = userMessage.parts
      .filter((p): p is { kind: "text"; text: string } => p.kind === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();

    // Address a specific peer via metadata.to, mirroring the `to` argument the
    // hub already honours (a directly addressed message skips the memory step,
    // because the sender wants that agent and not a cached answer).
    const to = typeof userMessage.metadata?.to === "string" ? userMessage.metadata.to : undefined;

    // A brand-new request arrives without a task; a follow-up carries the one
    // the store already holds and must not be re-announced as submitted.
    if (!requestContext.task) {
      const initial: Task = {
        kind: "task",
        id: taskId,
        contextId,
        status: { state: "submitted", timestamp: new Date().toISOString() },
        history: [userMessage],
      };
      eventBus.publish(initial);
    }

    eventBus.publish(this.status(taskId, contextId, "working", false));

    if (!text) {
      // An empty prompt is the caller's mistake, not a hub failure. `rejected`
      // says that; `failed` would send them looking for a broken hub.
      eventBus.publish(
        this.status(taskId, contextId, "rejected", true, "No text part in the message to act on.")
      );
      eventBus.finished();
      return;
    }

    // The same rules as the legacy route (T-004): a refusal is terminal
    // `rejected`, the JSON-RPC form of that route's 403.
    const gate = this.deps.authorize
      ? await this.deps.authorize(callerOf(requestContext.context), to)
      : {};
    if (gate.refusal) {
      eventBus.publish(this.status(taskId, contextId, "rejected", true, gate.refusal));
      eventBus.finished();
      return;
    }

    try {
      const result = await this.hub.handleMessage(text, to, gate.owner);
      eventBus.publish(
        this.status(taskId, contextId, "completed", true, result.response, {
          answeredFromMemory: result.answeredFromMemory,
          ...(result.category ? { category: result.category } : {}),
        })
      );
    } catch (error) {
      // The state must be terminal, or the client polls a task that will never
      // move again.
      eventBus.publish(
        this.status(taskId, contextId, "failed", true, (error as Error).message)
      );
    }
    eventBus.finished();
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    // Escalation to a peer is not interruptible today, so this marks the task
    // canceled without stopping in-flight work. Being explicit beats leaving
    // the caller's cancel silently ignored, but it is not a true abort.
    eventBus.publish(
      this.status(taskId, "", "canceled", true, "Canceled by request; in-flight work may continue.")
    );
    eventBus.finished();
  }

  private status(
    taskId: string,
    contextId: string,
    state: TaskStatusUpdateEvent["status"]["state"],
    final: boolean,
    text?: string,
    metadata?: Record<string, unknown>
  ): TaskStatusUpdateEvent {
    const message: Message | undefined = text
      ? {
          kind: "message",
          messageId: randomUUID(),
          role: "agent",
          parts: [{ kind: "text", text }],
          contextId,
        }
      : undefined;

    return {
      kind: "status-update",
      taskId,
      contextId,
      final,
      status: { state, timestamp: new Date().toISOString(), ...(message ? { message } : {}) },
      ...(metadata ? { metadata } : {}),
    };
  }
}
