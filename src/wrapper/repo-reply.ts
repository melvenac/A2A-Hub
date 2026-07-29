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
import { execFileSync } from "node:child_process";

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
  /**
   * Hard spend ceiling per reply.
   *
   * Sized for the peer's actual job. The first default (0.50) was set by analogy
   * to the hub's other budget caps — but the classifier is a 50-token call and a
   * repo peer reads a codebase before answering. A real scoping question ("where
   * is this logic, what config should I reuse, which files change") died on
   * `error_max_budget_usd` at 0.50 and completed for well under 3.00.
   */
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

/**
 * What the peer is actually speaking for: branch, commit, and whether the tree
 * is dirty.
 *
 * A repo peer is only as current as its checkout, and a stale checkout is
 * silent — the answer comes back just as confident. Session 11 found the
 * `gitnexus` peer answering from a side branch 867 commits behind `main` while
 * the installed CLI ran six patch versions ahead; nothing in the reply hinted at
 * it. Provenance is computed here rather than asked of the agent because Bash is
 * denied to it — the daemon can run git, the agent cannot.
 */
export function readRepoProvenance(repoPath: string): string | null {
  const git = (args: string[]) =>
    execFileSync("git", ["-C", repoPath, ...args], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const sha = git(["rev-parse", "--short", "HEAD"]);
    const dirty = git(["status", "--porcelain"]).length > 0;
    return `${branch} @ ${sha}${dirty ? " (uncommitted changes)" : ""}`;
  } catch {
    return null; // not a git repo, or git unavailable — say nothing rather than guess
  }
}

/**
 * Attach the provenance footer without breaking convergence detection.
 *
 * The daemon decides a conversation is over by testing whether the newest
 * message *ends* with DONE. A footer appended after DONE would leave the
 * sentinel mid-string and quietly stop sessions from ever converging, so the
 * footer goes before it.
 */
export function withProvenance(reply: string, provenance: string | null): string {
  if (!provenance) return reply;
  const footer = `_(answered from ${provenance})_`;
  const done = reply.match(/\s*\bDONE\b\W*$/);
  if (done) {
    const body = reply.slice(0, reply.length - done[0].length).trimEnd();
    return `${body}\n\n${footer}\n\nDONE`;
  }
  return `${reply.trimEnd()}\n\n${footer}`;
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
    maxBudgetUsd = 2,
    timeoutMs = 180_000,
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
        if (message.subtype === "success") {
          return withProvenance(
            message.result.trim(),
            readRepoProvenance(repoPath),
          );
        }
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
