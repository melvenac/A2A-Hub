import { describe, it, expect, vi } from "vitest";
import { HubExecutor } from "../src/executor.js";

describe("HubExecutor", () => {
  it("answers from memory when confidence is high", async () => {
    const executor = new HubExecutor({
      searchMemory: vi.fn().mockResolvedValue({
        confidence: 0.9,
        experience: {
          trigger: "npm ERR! ERESOLVE",
          action: "Run: npm install --legacy-peer-deps",
          outcome: "Resolved peer dependency conflict",
        },
      }),
      escalate: vi.fn(),
      storeLesson: vi.fn(),
      classify: vi.fn(),
    });

    const result = await executor.handleMessage("npm ERR! ERESOLVE peer dependency");
    expect(result.answeredFromMemory).toBe(true);
    expect(result.response).toContain("--legacy-peer-deps");
  });

  it("escalates when memory confidence is low", async () => {
    const escalateFn = vi.fn().mockResolvedValue("Try reinstalling Node.js");

    const executor = new HubExecutor({
      searchMemory: vi.fn().mockResolvedValue({ confidence: 0.3, experience: null }),
      escalate: escalateFn,
      storeLesson: vi.fn(),
      classify: vi.fn().mockResolvedValue("user-env"),
    });

    const result = await executor.handleMessage("Something weird happened");
    expect(result.answeredFromMemory).toBe(false);
    expect(escalateFn).toHaveBeenCalled();
  });

  it("skips memory and routes to the named agent when addressed", async () => {
    const searchFn = vi.fn();
    const escalateFn = vi.fn().mockResolvedValue("alice here — done");

    const executor = new HubExecutor({
      searchMemory: searchFn,
      escalate: escalateFn,
      storeLesson: vi.fn(),
      classify: vi.fn().mockResolvedValue("user-env"),
    });

    const result = await executor.handleMessage("Review this diff", "alice");
    expect(searchFn).not.toHaveBeenCalled();
    expect(escalateFn).toHaveBeenCalledWith("Review this diff", "alice");
    expect(result.answeredFromMemory).toBe(false);
    expect(result.response).toBe("alice here — done");
  });

  it("still delivers the response when classify/store fails", async () => {
    const executor = new HubExecutor({
      searchMemory: vi.fn().mockResolvedValue({ confidence: 0.1, experience: null }),
      escalate: vi.fn().mockResolvedValue("bob's answer"),
      storeLesson: vi.fn(),
      classify: vi.fn().mockRejectedValue(new Error("401 invalid api key")),
    });

    const result = await executor.handleMessage("anything");
    expect(result.response).toBe("bob's answer");
    expect(result.category).toBeUndefined();
  });
});

describe("End-to-end flow", () => {
  it("complete flow: receive → memory miss → escalate → store → classify", async () => {
    const stored: any[] = [];

    const executor = new HubExecutor({
      searchMemory: vi.fn().mockResolvedValue({ confidence: 0.2, experience: null }),
      escalate: vi.fn().mockResolvedValue("Run: cp scripts/vault-writer.mjs ~/.claude/knowledge-mcp/scripts/"),
      storeLesson: vi.fn().mockImplementation((lesson) => { stored.push(lesson); }),
      classify: vi.fn().mockResolvedValue("repo-docs"),
    });

    const result = await executor.handleMessage("vault-writer.mjs not found");

    expect(result.answeredFromMemory).toBe(false);
    expect(result.response).toContain("vault-writer.mjs");
    expect(result.category).toBe("repo-docs");
    expect(stored).toHaveLength(1);
    expect(stored[0].category).toBe("repo-docs");
  });
});
