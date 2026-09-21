import type { AgentCard } from "@a2a-js/sdk";

export const hubAgentCard: AgentCard = {
  name: "Intelligent-Hub",
  description:
    "Persistent AI mediator for A2A agent coordination. Accumulates knowledge from every interaction and self-corrects the repo.",
  // Must describe *this* process. The old default pointed at the (wiped) sandbox
  // VPS, so a peer resolving the card locally was handed a dead host.
  // Points at the JSON-RPC endpoint, not the legacy /a2a/* REST routes — the
  // card's url is where a client sends spec traffic, and those routes are not
  // a spec binding.
  url: `${process.env.HUB_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`}/a2a/jsonrpc`,
  // The version we actually serve, not the newest that exists. @a2a-js/sdk 0.3.13
  // implements 0.3.x; claiming "1.0" while mounting a 0.3 handler is a fresh lie.
  protocolVersion: "0.3",
  provider: {
    organization: "Tarrant County Makerspace",
    url: "https://tarrantcountymakerspace.com",
  },
  version: "1.0.0",
  capabilities: {
    // True again, but earned this time: the executor publishes to the SDK's
    // ExecutionEventBus, which is what message/stream consumes. Verified against
    // a live message/stream call returning text/event-stream, not assumed —
    // the previous `true` was a claim with no implementation behind it.
    streaming: true,
    pushNotifications: false,
  },
  // Now true: jsonRpcHandler is mounted at the url above. Stated explicitly
  // rather than relying on the spec default, so the card says what it serves.
  preferredTransport: "JSONRPC",
  securitySchemes: {
    apiKey: {
      type: "apiKey",
      name: "X-Agent-Key",
      in: "header",
    },
  },
  security: [{ apiKey: [] }],
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["text/plain", "application/json"],
  skills: [
    {
      id: "troubleshoot-installation",
      name: "Installation Troubleshooting",
      description:
        "Diagnoses and resolves A2A Hub setup errors from accumulated knowledge or by escalating to an expert agent.",
      tags: ["debugging", "installation", "setup", "configuration"],
      examples: [
        "npm ERR! code ERESOLVE during install",
        "vault-writer.mjs not found when running SessionEnd hook",
        "Smart Connections MCP fails to connect after install",
      ],
    },
    {
      id: "query-error-history",
      name: "Error History Search",
      description: "Searches past resolved issues and successful fixes.",
      tags: ["search", "history", "knowledge"],
      examples: [
        "Has anyone else seen this Obsidian vault error?",
        "What's the fix for the skill-scan permission issue?",
      ],
    },
    {
      id: "suggest-repo-fix",
      name: "Repository Improvement",
      description:
        "Proposes documentation or code changes to prevent recurring installation issues.",
      tags: ["documentation", "improvement", "self-correcting"],
      examples: [
        "Three agents hit the same npm peer dependency error",
        "Step 3 doesn't mention the required Node version",
      ],
    },
  ],
};
