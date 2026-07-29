/**
 * Repo-backed reply generation.
 *
 * The stock daemon answers from a persona string alone — it has no tools, so it
 * cannot answer "why does your MCP server hold a lock on .gitnexus\lbug". This
 * replaces the reply step with a Claude Agent SDK query rooted at a repo, so the
 * peer answers from that repo's actual files, and turns a hub peer into a
 * standing expert on one codebase.
 *
 * Read-only by default: mutation tools are denied outright, and `dontAsk` mode
 * denies anything that would otherwise wait for a human — a daemon has nobody to
 * approve a prompt, so the alternative to denying is hanging.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface RepoReplierConfig {
  /** Absolute path to the repo this peer answers about. */
  repoPath: string;
  /** This peer's hub name, used in the appended conventions. */
  name: string;
  /** Model override; omit to use the SDK default. */
  model?: string;
  /** Hard spend ceiling per reply. */
  maxBudgetUsd?: number;
  /** Wall-clock ceiling per reply. */
  timeoutMs?: number;
  /** Allow shell access (git log, test runs). Off by default — Bash is the trust boundary. */
  allowBash?: boolean;
}

/** Tools that change the repo. Denied in every permission mode. */
const MUTATING_TOOLS = ["Write", "Edit", "NotebookEdit"];

/**
 * The deny list for a repo peer.
 *
 * Deny, not allow: `allowedTools` only auto-approves — it does not restrict the
 * agent to that set, so an allowlist would leave Write reachable through the
 * permission flow. `disallowedTools` is the only option that actually removes a
 * tool. Bash is the trust boundary and stays out unless explicitly opted in.
 */
export function resolveDisallowedTools(allowBash: boolean): string[] {
  return allowBash ? [...MUTATING_TOOLS] : [...MUTATING_TOOLS, "Bash"];
}

/**
 * Render the hub transcript as one labelled prompt.
 *
 * `query()` takes a prompt, not a message array, and each question is answered
 * by a fresh rooted query — so the prior turns have to travel inside the prompt
 * or the peer loses the thread mid-conversation.
 */
export function renderPrompt(transcript: Turn[], name: string): string {
  if (transcript.length === 1) return transcript[0].content;
  const history = transcript
    .slice(0, -1)
    .map((t) => (t.role === "assistant" ? `${name}: ${t.content}` : t.content))
    .join("\n\n");
  const latest = transcript[transcript.length - 1]?.content ?? "";
  return `Earlier in this conversation:\n\n${history}\n\n---\n\nRespond to the latest message:\n\n${latest}`;
}

export function repoConventions(name: string, repoPath: string): string {
  return [
    `You are ${name}, answering as a peer agent on the A2A hub about the repository at ${repoPath}.`,
    `Another agent — not a human — is usually asking, on behalf of someone debugging a different repo.`,
    `Ground every claim in this repo: read the files, don't answer from memory of similar projects.`,
    `If the answer isn't in this repo, say so plainly rather than guessing.`,
    `Lead with the answer, then the evidence (file path and line). Keep it brief.`,
    `Write replies plain — never prefix them with your own name.`,
    `When the exchange reaches a natural conclusion, end your reply with DONE.`,
  ].join(" ");
}

/**
 * Build a reply function with the same shape as the daemon's stock
 * `generateReply`, so the session loop is unchanged.
 */
export function makeRepoReplier(config: RepoReplierConfig) {
  const {
    repoPath,
    name,
    model,
    maxBudgetUsd = 0.5,
    timeoutMs = 120_000,
    allowBash = false,
  } = config;

  const disallowedTools = resolveDisallowedTools(allowBash);

  return async function generateRepoReply(transcript: Turn[]): Promise<string> {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const messages = query({
        prompt: renderPrompt(transcript, name),
        options: {
          cwd: repoPath,
          // "project" only: load the target repo's own CLAUDE.md and
          // .claude/settings.json, but not the operator's global settings —
          // those describe how Aaron works, not how this repo behaves.
          settingSources: ["project"],
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: repoConventions(name, repoPath),
          },
          disallowedTools,
          // Deny rather than wait: nothing here can answer a permission prompt.
          permissionMode: "dontAsk",
          ...(model ? { model } : {}),
          maxTurns: 12,
          maxBudgetUsd,
          abortController,
        },
      });

      for await (const message of messages) {
        if (message.type !== "result") continue;
        if (message.subtype === "success") return message.result.trim();
        // Budget and turn ceilings are expected outcomes, not crashes — report
        // them into the conversation so the asking agent can narrow its question
        // instead of watching a silent non-answer.
        return `I couldn't finish that against ${repoPath} (${message.subtype}). Try narrowing the question to a specific file or symbol.`;
      }
      return `No answer came back from ${repoPath}.`;
    } catch (error: any) {
      if (abortController.signal.aborted) {
        return `Timed out reading ${repoPath} after ${Math.round(timeoutMs / 1000)}s. Try a narrower question.`;
      }
      return `Error reading ${repoPath}: ${error?.message ?? String(error)}`;
    } finally {
      clearTimeout(timer);
    }
  };
}
