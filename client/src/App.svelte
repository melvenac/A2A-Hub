<script>
  import { onDestroy } from "svelte";

  // Chat client for the hub: Grok-style history sidebar + live transcripts.
  // Humans are peers — you chat inside sessions as HUMAN (default "aaron").
  const HUMAN = "aaron";
  let hubUrl = "http://127.0.0.1:4000";
  let agentKey = "dev-key";
  let health = "checking...";

  const hdrs = () => ({ "Content-Type": "application/json", "X-Agent-Key": agentKey });

  async function checkHealth() {
    try {
      const res = await fetch(`${hubUrl}/health`);
      const body = await res.json();
      // 503 means the hub is up but Convex is not. Don't report that as online
      // -- nothing will persist, and a green light there hides the real fault.
      health = res.ok
        ? `online (${body.agent})`
        : `degraded — convex ${body.convex?.status ?? "unknown"}`;
    } catch {
      health = "unreachable";
    }
  }
  checkHealth();

  // --- Session history ---
  let sessions = [];
  let sessionsError = "";

  async function loadSessions() {
    sessionsError = "";
    try {
      const res = await fetch(`${hubUrl}/a2a/sessions`, { headers: hdrs() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      sessions = (body.sessions || []).sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      sessionsError = error.message;
    }
  }

  function dayLabel(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  $: groups = sessions.reduce((acc, s) => {
    const label = dayLabel(s.createdAt);
    (acc[acc.length - 1]?.label === label ? acc[acc.length - 1].items : acc[acc.push({ label, items: [] }) - 1].items).push(s);
    return acc;
  }, []);

  // --- Active session / transcript ---
  let activeSessionId = null;
  let transcript = [];
  let converged = false;
  let watchTimer = null;

  $: activeSession = sessions.find((s) => s._id === activeSessionId) || null;

  function stopWatching() {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
  }

  function openSession(id) {
    stopWatching();
    activeSessionId = id;
    transcript = [];
    converged = false;
    const poll = async () => {
      try {
        const res = await fetch(`${hubUrl}/a2a/session/${id}/messages`, { headers: hdrs() });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        transcript = body.messages || [];
        const last = transcript[transcript.length - 1];
        converged = transcript.length >= 2 && last && /\bDONE\b\W*$/.test(last.content.trim());
      } catch (error) {
        sessionsError = error.message;
      }
    };
    poll();
    watchTimer = setInterval(poll, 2000);
  }

  // --- New chats ---
  let creating = false;

  async function newChat(agents, title) {
    if (creating) return;
    creating = true;
    sessionsError = "";
    try {
      const res = await fetch(`${hubUrl}/a2a/session`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ title, participants: [HUMAN, ...agents], maxTurns: 24 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await loadSessions();
      openSession(body.sessionId);
    } catch (error) {
      sessionsError = error.message;
    } finally {
      creating = false;
    }
  }

  // --- Agent ↔ agent demo (seeded as alice, hands-off) ---
  let seed = "";
  let seedTurns = 8;
  let seeding = false;

  async function startDemo() {
    if (!seed.trim() || seeding) return;
    seeding = true;
    sessionsError = "";
    try {
      const res = await fetch(`${hubUrl}/a2a/session`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({
          title: seed.trim().slice(0, 48),
          participants: ["alice", "bob"],
          maxTurns: Number(seedTurns) || 8,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const seedRes = await fetch(`${hubUrl}/a2a/session/${body.sessionId}/message`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ from: "alice", content: seed.trim() }),
      });
      if (!seedRes.ok) throw new Error((await seedRes.json()).error || `HTTP ${seedRes.status}`);
      seed = "";
      await loadSessions();
      openSession(body.sessionId);
    } catch (error) {
      sessionsError = error.message;
    } finally {
      seeding = false;
    }
  }

  // --- Composer: continue any session as the human peer ---
  let chatText = "";
  let sendingChat = false;

  async function sendChat() {
    if (!chatText.trim() || sendingChat || !activeSessionId) return;
    const content = chatText.trim();
    sendingChat = true;
    sessionsError = "";
    try {
      const res = await fetch(`${hubUrl}/a2a/session/${activeSessionId}/message`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ from: HUMAN, content }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (body.ok === false) {
        throw new Error(
          body.reason === "max-turns-reached" || body.reason === "session-closed"
            ? `Session is at its turn cap — use "+ extend" to continue.`
            : body.reason
        );
      }
      chatText = "";
      loadSessions();
    } catch (error) {
      sessionsError = error.message;
    } finally {
      sendingChat = false;
    }
  }

  // --- Extend ---
  let extendBy = 4;
  let extending = false;

  async function extendSession() {
    if (!activeSessionId || extending) return;
    extending = true;
    sessionsError = "";
    try {
      const res = await fetch(`${hubUrl}/a2a/session/${activeSessionId}/extend`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ addTurns: Number(extendBy) || 4 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      openSession(activeSessionId);
      loadSessions();
    } catch (error) {
      sessionsError = error.message;
    } finally {
      extending = false;
    }
  }

  // --- Rename ---
  let renamingId = null;
  let renameText = "";

  function beginRename(s) {
    renamingId = s._id;
    renameText = s.title || "";
  }

  async function commitRename() {
    const id = renamingId;
    const title = renameText.trim();
    renamingId = null;
    if (!id || !title) return;
    try {
      const res = await fetch(`${hubUrl}/a2a/session/${id}/rename`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      loadSessions();
    } catch (error) {
      sessionsError = error.message;
    }
  }

  $: agentPeers = (activeSession?.participants || []).filter((n) => n !== HUMAN && n !== "hub");

  function insertMention(name) {
    const mention = `@${name} `;
    if (!chatText.includes(mention.trim())) chatText = mention + chatText;
  }

  function roleOf(name) {
    if (name === HUMAN) return "human";
    if (name === "alice") return "alice";
    return "bob";
  }

  loadSessions();
  onDestroy(stopWatching);
</script>

<main>
  <aside>
    <div class="side-head">
      <h1>A2A Hub</h1>
      <span class="health">{health}</span>
    </div>

    <div class="new-chat">
      <button on:click={() => newChat(["alice"], "chat with alice")} disabled={creating}>+ alice</button>
      <button on:click={() => newChat(["bob"], "chat with bob")} disabled={creating}>+ bob</button>
      <button on:click={() => newChat(["alice", "bob"], "group chat")} disabled={creating}>+ both</button>
    </div>

    <form class="seed" on:submit|preventDefault={startDemo} title="Seed a hands-off agent↔agent conversation">
      <input bind:value={seed} placeholder="agent↔agent seed (as alice, to bob)…" disabled={seeding} />
      <input class="turns" type="number" bind:value={seedTurns} min="2" max="32" title="max turns" />
      <button type="submit" disabled={seeding || !seed.trim()}>▶</button>
    </form>

    <div class="history">
      <div class="history-head">
        <span>History</span>
        <button class="ghost" on:click={loadSessions}>↻</button>
      </div>
      {#each groups as g}
        <div class="day">{g.label}</div>
        {#each g.items as s}
          {#if renamingId === s._id}
            <input
              class="rename"
              bind:value={renameText}
              on:blur={commitRename}
              on:keydown={(e) => e.key === "Enter" && e.target.blur()}
              autofocus
            />
          {:else}
            <div class="item-row {s._id === activeSessionId ? 'active' : ''}">
              <button class="item" on:click={() => openSession(s._id)}>
                <span class="item-title">{s.title || s.participants?.join(" · ") || "(untitled)"}</span>
                <span class="item-meta">
                  {s.participants?.join(", ")} · {s.turnCount}/{s.maxTurns}{s.isActive ? "" : " · closed"}
                </span>
              </button>
              <button class="ghost pencil" title="rename" on:click={() => beginRename(s)}>✎</button>
            </div>
          {/if}
        {/each}
      {/each}
    </div>

    <details class="config">
      <summary>connection</summary>
      <label>Hub <input bind:value={hubUrl} on:change={checkHealth} /></label>
      <label>Key <input bind:value={agentKey} /></label>
    </details>
  </aside>

  <section class="pane">
    {#if !activeSession}
      <div class="placeholder">
        <p>Pick a conversation from the history, start a chat with an agent, or seed an agent↔agent demo.</p>
      </div>
    {:else}
      <div class="pane-head">
        <strong>{activeSession.title || "(untitled)"}</strong>
        <span class="extend-controls">
          <input class="turns" type="number" bind:value={extendBy} min="1" max="32" title="turns to add" />
          <button class="ghost" on:click={extendSession} disabled={extending}>+ extend</button>
          <span class="health">
            {#if converged}converged (DONE){:else if activeSession.isActive === false}closed{:else}live · {activeSession.turnCount}/{activeSession.maxTurns}{/if}
          </span>
        </span>
      </div>

      <div class="transcript">
        {#if transcript.length === 0}
          <p class="empty">no messages yet — say something below…</p>
        {/if}
        {#each transcript as m, i}
          <div class="entry {roleOf(m.from)}">
            <strong>turn {i + 1} — {m.from}</strong>
            <pre>{m.content}</pre>
          </div>
        {/each}
      </div>

      {#if agentPeers.length > 1}
        <div class="mention-chips">
          <span class="hint-inline">target one agent:</span>
          {#each agentPeers as name}
            <button class="ghost" on:click={() => insertMention(name)}>@{name}</button>
          {/each}
        </div>
      {/if}
      <form class="composer" on:submit|preventDefault={sendChat}>
        <input
          bind:value={chatText}
          placeholder="Message as {HUMAN}… (no @mention = every agent replies; use @name to target one)"
          disabled={sendingChat}
        />
        <button type="submit" disabled={sendingChat || !chatText.trim()}>Send</button>
      </form>
    {/if}
    {#if sessionsError}
      <p class="error-text">{sessionsError}</p>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #10131a;
    color: #e6e8ee;
  }
  main {
    display: flex;
    height: 100vh;
    box-sizing: border-box;
  }
  aside {
    width: 290px;
    flex-shrink: 0;
    border-right: 1px solid #2a3040;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 0.75rem;
    box-sizing: border-box;
    overflow-y: auto;
  }
  .side-head { display: flex; justify-content: space-between; align-items: baseline; }
  h1 { font-size: 1rem; margin: 0; }
  .health { font-size: 0.72rem; color: #8b93a7; }
  .new-chat { display: flex; gap: 0.4rem; }
  .new-chat button { flex: 1; font-size: 0.8rem; padding: 0.4rem 0; }
  .seed { display: flex; gap: 0.3rem; }
  .seed input { flex: 1; min-width: 0; }
  .seed .turns { flex: 0 0 3rem; }
  .seed button { padding: 0.4rem 0.6rem; }
  .history { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
  .history-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.78rem;
    text-transform: uppercase;
    color: #8b93a7;
  }
  .day { font-size: 0.72rem; color: #5c6478; margin-top: 0.5rem; }
  .item-row { display: flex; align-items: stretch; gap: 0.25rem; }
  .item-row.active .item { border-color: #5b8def; }
  .item {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: #1a1f2b;
    border: 1px solid #2a3040;
    color: inherit;
    border-radius: 8px;
    padding: 0.45rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    cursor: pointer;
  }
  .item-title {
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-meta { font-size: 0.68rem; color: #8b93a7; }
  .pencil { flex: 0 0 auto; }
  .rename { width: 100%; box-sizing: border-box; }
  .config { font-size: 0.78rem; color: #8b93a7; }
  .config label { display: flex; flex-direction: column; gap: 0.2rem; margin-top: 0.4rem; }
  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    box-sizing: border-box;
    min-width: 0;
  }
  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #5c6478;
  }
  .pane-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .extend-controls { display: flex; gap: 0.4rem; align-items: center; }
  .extend-controls .turns { width: 3.2rem; padding: 0.3rem 0.4rem; font-size: 0.8rem; }
  .transcript {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .entry {
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    background: #1a1f2b;
    border-left: 3px solid #4a5268;
  }
  .entry.human { border-left-color: #5b8def; }
  .entry.alice { border-left-color: #b58ae0; }
  .entry.bob { border-left-color: #e0a84a; }
  .entry strong { font-size: 0.7rem; text-transform: uppercase; color: #8b93a7; }
  .entry pre {
    margin: 0.25rem 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 0.92rem;
  }
  .empty { color: #5c6478; font-size: 0.85rem; }
  .mention-chips { display: flex; gap: 0.4rem; align-items: center; }
  .hint-inline { font-size: 0.72rem; color: #5c6478; }
  .composer { display: flex; gap: 0.5rem; }
  .composer input { flex: 1; }
  input {
    background: #1a1f2b;
    border: 1px solid #2a3040;
    color: inherit;
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
    font-size: 0.9rem;
  }
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
  button.ghost {
    background: #1a1f2b;
    border: 1px solid #2a3040;
    color: #b7bdcc;
    font-size: 0.78rem;
    padding: 0.35rem 0.6rem;
  }
  .error-text { color: #d05b5b; font-size: 0.85rem; margin: 0; }
</style>
