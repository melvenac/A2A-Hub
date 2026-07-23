<script>
  // Minimal test client (Atlas flavor #1): send a message through the hub,
  // watch the classified response. Grows into the chat UI later.
  let hubUrl = "http://127.0.0.1:4000";
  let agentKey = "dev-key";
  let to = ""; // optional: address a specific agent (e.g. "bob")
  let text = "";
  let sending = false;
  let health = "checking...";
  let entries = []; // { role: "you" | "hub" | "error", text, meta }

  async function checkHealth() {
    try {
      const res = await fetch(`${hubUrl}/health`);
      const body = await res.json();
      health = `online (${body.agent})`;
    } catch {
      health = "unreachable";
    }
  }
  checkHealth();

  async function send() {
    if (!text.trim() || sending) return;
    const message = text.trim();
    entries = [...entries, { role: "you", text: message, meta: to ? `→ ${to}` : "" }];
    text = "";
    sending = true;
    try {
      const res = await fetch(`${hubUrl}/a2a/message/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Agent-Key": agentKey },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          params: {
            to: to.trim() || undefined,
            message: { role: "aaron", parts: [{ kind: "text", text: message }] },
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const reply = body.result?.task?.artifacts?.[0]?.parts?.[0]?.text ?? "(no text in response)";
      entries = [...entries, { role: "hub", text: reply, meta: "" }];
    } catch (error) {
      entries = [...entries, { role: "error", text: error.message, meta: "" }];
    } finally {
      sending = false;
    }
  }
</script>

<main>
  <header>
    <h1>A2A Hub — Test Client</h1>
    <span class="health">hub: {health}</span>
  </header>

  <section class="config">
    <label>Hub <input bind:value={hubUrl} on:change={checkHealth} /></label>
    <label>Key <input bind:value={agentKey} /></label>
    <label>To (optional) <input bind:value={to} placeholder="e.g. bob" /></label>
  </section>

  <section class="log">
    {#if entries.length === 0}
      <p class="empty">Send a message to exercise classify → memory → escalate.</p>
    {/if}
    {#each entries as e}
      <div class="entry {e.role}">
        <strong>{e.role}{e.meta ? ` ${e.meta}` : ""}</strong>
        <pre>{e.text}</pre>
      </div>
    {/each}
    {#if sending}
      <p class="empty">waiting for hub (escalation can take a few seconds)...</p>
    {/if}
  </section>

  <form on:submit|preventDefault={send}>
    <input bind:value={text} placeholder="Type a message..." disabled={sending} />
    <button type="submit" disabled={sending || !text.trim()}>Send</button>
  </form>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #10131a;
    color: #e6e8ee;
  }
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 100vh;
    box-sizing: border-box;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h1 { font-size: 1.1rem; margin: 0; }
  .health { font-size: 0.8rem; color: #8b93a7; }
  .config { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .config label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.7rem;
    color: #8b93a7;
    flex: 1;
    min-width: 140px;
  }
  input {
    background: #1a1f2b;
    border: 1px solid #2a3040;
    color: inherit;
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
    font-size: 0.9rem;
  }
  .log {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow-y: auto;
  }
  .entry {
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    background: #1a1f2b;
    border-left: 3px solid #4a5268;
  }
  .entry.you { border-left-color: #5b8def; }
  .entry.hub { border-left-color: #46b58a; }
  .entry.error { border-left-color: #d05b5b; }
  .entry strong { font-size: 0.7rem; text-transform: uppercase; color: #8b93a7; }
  .entry pre {
    margin: 0.25rem 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 0.92rem;
  }
  .empty { color: #5c6478; font-size: 0.85rem; }
  form { display: flex; gap: 0.5rem; }
  form input { flex: 1; }
  button {
    background: #5b8def;
    border: none;
    color: white;
    border-radius: 6px;
    padding: 0.5rem 1.1rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
