import { describe, it, expect } from "vitest";
import {
  renderPrompt,
  repoConventions,
  resolveDisallowedTools,
  type Turn,
} from "../src/wrapper/repo-reply.js";

describe("resolveDisallowedTools", () => {
  // The security-relevant line in this module. `allowedTools` in the Agent SDK
  // only auto-approves and does NOT restrict the agent to that set, so the deny
  // list is the only thing actually keeping a repo peer read-only.
  it("denies every mutating tool by default", () => {
    const denied = resolveDisallowedTools(false);
    expect(denied).toContain("Write");
    expect(denied).toContain("Edit");
    expect(denied).toContain("NotebookEdit");
  });

  it("denies Bash unless explicitly opted in", () => {
    expect(resolveDisallowedTools(false)).toContain("Bash");
    expect(resolveDisallowedTools(true)).not.toContain("Bash");
  });

  it("still denies mutating tools when Bash is allowed", () => {
    const denied = resolveDisallowedTools(true);
    expect(denied).toContain("Write");
    expect(denied).toContain("Edit");
    expect(denied).toContain("NotebookEdit");
  });

  it("returns a fresh array so a caller cannot mutate the shared deny list", () => {
    const first = resolveDisallowedTools(false);
    first.push("Read");
    expect(resolveDisallowedTools(false)).not.toContain("Read");
  });
});

describe("renderPrompt", () => {
  it("passes a single message through untouched", () => {
    const one: Turn[] = [{ role: "user", content: "why does analyze fail?" }];
    expect(renderPrompt(one, "gitnexus")).toBe("why does analyze fail?");
  });

  it("carries prior turns so a follow-up keeps its context", () => {
    const transcript: Turn[] = [
      { role: "user", content: "why does analyze fail?" },
      { role: "assistant", content: "A lock on .gitnexus/lbug." },
      { role: "user", content: "which process holds it?" },
    ];
    const prompt = renderPrompt(transcript, "gitnexus");
    expect(prompt).toContain("why does analyze fail?");
    expect(prompt).toContain("gitnexus: A lock on .gitnexus/lbug.");
    // The latest message must be the thing it's asked to answer, not buried
    // in history — otherwise a follow-up re-answers the original question.
    expect(prompt.indexOf("which process holds it?")).toBeGreaterThan(
      prompt.indexOf("why does analyze fail?"),
    );
  });

  it("labels its own prior replies but leaves the asker's turns bare", () => {
    const transcript: Turn[] = [
      { role: "assistant", content: "mine" },
      { role: "user", content: "theirs" },
      { role: "user", content: "latest" },
    ];
    const prompt = renderPrompt(transcript, "forge");
    expect(prompt).toContain("forge: mine");
    expect(prompt).not.toContain("forge: theirs");
  });

  it("does not throw on an empty transcript", () => {
    expect(() => renderPrompt([], "forge")).not.toThrow();
  });
});

describe("repoConventions", () => {
  it("names the peer and the repo it speaks for", () => {
    const text = repoConventions("gitnexus", "C:/repos/gitnexus");
    expect(text).toContain("gitnexus");
    expect(text).toContain("C:/repos/gitnexus");
  });

  it("keeps the DONE sign-off so the daemon's convergence check still fires", () => {
    expect(repoConventions("x", "/y")).toContain("DONE");
  });

  it("tells the peer to ground answers in the repo rather than from memory", () => {
    expect(repoConventions("x", "/y")).toMatch(/don't answer from memory/i);
  });
});
