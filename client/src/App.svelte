<script>
  import { onDestroy } from "svelte";

  // Chat client for the hub: Grok-style history sidebar + live transcripts.
  // Humans are peers. You chat as whoever your key belongs to: the name comes
  // from the hub (GET /a2a/whoami), never from this file (Loop 4, T-061).
  //
  // Served by the hub at /ui/, the page's hub is its own origin. Under the dev
  // server (npm run dev, :5173) it is the local hub, as before.
  let hubUrl = import.meta.env.DEV ? "http://127.0.0.1:4000" : window.location.origin;
  // Your key (T-003, Loop 3 §12). There is no default: get it with
  // `node scripts/hub-key.mjs copy --as <you>` (clipboard only) and paste it
  // into connection → Key. Kept in this browser's localStorage; the page works
  // without storage, you just paste again.
  const KEY_STORE = "a2a-hub:aaron-key";
  let agentKey = "";
  try {
    agentKey = localStorage.getItem(KEY_STORE) ?? "";
  } catch {}
  $: {
    try {
      if (agentKey) localStorage.setItem(KEY_STORE, agentKey);
    } catch {}
  }
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

  // --- Identity: who this key is, according to the hub ---
  // Nothing under /a2a is sent until `me` is known. With no key the page sends
  // no /a2a request at all; a key the hub does not recognise (warn mode answers
  // whoami with name: null) never gets a guessed name to post as.
  let me = null;
  let authState = "nokey"; // nokey | checking | ok | error
  let authError = "";
  let connOpen = !agentKey;

  async function identify() {
    stopWatching();
    me = null;
    sessions = [];
    activeSessionId = null;
    livePeers = [];
    peersLoaded = false;
    authError = "";
    const key = agentKey.trim();
    if (!key) {
      authState = "nokey";
      connOpen = true;
      return;
    }
    authState = "checking";
    try {
      const res = await fetch(`${hubUrl}/a2a/whoami`, { headers: hdrs() });
      const body = await res.json().catch(() => ({}));
      if (key !== agentKey.trim()) return; // superseded by a newer key
      if (!res.ok) throw new Error(`${res.status}: ${body.error || "request refused"}`);
      if (!body.name) throw new Error("this hub does not recognise that key");
      me = body.name;
      authState = "ok";
      loadSessions();
    } catch (error) {
      authState = "error";
      authError = error.message;
      connOpen = true;
    }
  }

  function reconnect() {
    checkHealth();
    identify();
  }

  // --- Session history ---
  let sessions = [];
  let sessionsError = "";

  async function loadSessions() {
    if (!me) return;
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
    if (!me) return;
    stopWatching();
    activeSessionId = id;
    transcript = [];
    converged = false;
    // The poll only refreshes the transcript. `activeSession` is derived from
    // `sessions`, so its turnCount/isActive would sit at their load-time values
    // and freeze the cap indicator -- which is the one warning that says the
    // session is about to auto-close. Re-list every 5th tick (~10s) so the
    // sidebar and the closed/live flag catch up; the header reads the live
    // count off `transcript` (turnCount is incremented once per message).
    let ticks = 0;
    const poll = async () => {
      try {
        const res = await fetch(`${hubUrl}/a2a/session/${id}/messages`, { headers: hdrs() });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        transcript = body.messages || [];
        const last = transcript[transcript.length - 1];
        converged = transcript.length >= 2 && last && /\bDONE\b\W*$/.test(last.content.trim());
        if (++ticks % 5 === 0) loadSessions();
      } catch (error) {
        sessionsError = error.message;
      }
    };
    poll();
    watchTimer = setInterval(poll, 2000);
  }

  // --- New chat: peers come from the hub, not from this file ---
  // GET /a2a/agents/live lists agents seen in the last 45 s, so the list is a
  // snapshot: a seat between turns is missing from it. Existing sessions stay
  // listed and joinable whoever is live (Loop 4 ruling 1, R-L).
  let livePeers = [];
  let peersLoaded = false;
  let peersError = "";
  let picked = [];
  let firstMessage = "";
  let newTurns = 24;
  let creating = false;

  async function loadPeers() {
    if (!me) return;
    peersError = "";
    try {
      const res = await fetch(`${hubUrl}/a2a/agents/live`, { headers: hdrs() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      livePeers = (body.agents || []).filter((a) => a.name !== me && a.name !== "hub");
      picked = picked.filter((n) => livePeers.some((a) => a.name === n));
    } catch (error) {
      peersError = error.message;
    } finally {
      peersLoaded = true;
    }
  }

  function onPanelToggle(e) {
    if (e.currentTarget.open) loadPeers();
  }

  async function startChat() {
    if (!me || creating || picked.length === 0) return;
    creating = true;
    sessionsError = "";
    const text = firstMessage.trim();
    try {
      const res = await fetch(`${hubUrl}/a2a/session`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({
          title: text ? text.slice(0, 48) : `chat with ${picked.join(", ")}`,
          participants: [me, ...picked],
          maxTurns: Number(newTurns) || 24,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (text) {
        const seedRes = await fetch(`${hubUrl}/a2a/session/${body.sessionId}/message`, {
          method: "POST",
          headers: hdrs(),
          body: JSON.stringify({ from: me, content: text }),
        });
        const seedBody = await seedRes.json();
        if (!seedRes.ok) throw new Error(seedBody.error || `HTTP ${seedRes.status}`);
        if (seedBody.ok === false) throw new Error(seedBody.reason);
      }
      firstMessage = "";
      picked = [];
      await loadSessions();
      openSession(body.sessionId);
    } catch (error) {
      sessionsError = error.message;
    } finally {
      creating = false;
    }
  }

  // --- Composer: continue any session as yourself ---
  let chatText = "";
  let sendingChat = false;

  async function sendChat() {
    if (!me || !chatText.trim() || sendingChat || !activeSessionId) return;
    const content = chatText.trim();
    sendingChat = true;
    sessionsError = "";
    try {
      const res = await fetch(`${hubUrl}/a2a/session/${activeSessionId}/message`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ from: me, content }),
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
    if (!me || !activeSessionId || extending) return;
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
    if (!me || !id || !title) return;
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

  $: agentPeers = (activeSession?.participants || []).filter((n) => n !== me && n !== "hub");

  function insertMention(name) {
    const mention = `@${name} `;
    if (!chatText.includes(mention.trim())) chatText = mention + chatText;
  }

  // You are "human"; every other sender gets one of four colours by its place
  // in the session's participant list, so no peer name is special here.
  function roleOf(name) {
    if (name === me) return "human";
    const i = agentPeers.indexOf(name);
    return `agent c${(i < 0 ? agentPeers.length : i) % 4}`;
  }

  identify();
  onDestroy(stopWatching);
</script>

<main>
  <aside>
    <div class="side-head">
      <h1>A2A Hub</h1>
      <span class="health">{health}</span>
    </div>
    <div class="whoami">
      {#if authState === "ok"}you are <strong>{me}</strong>
      {:else if authState === "checking"}checking key…
      {:else if authState === "error"}<span class="error-text">key refused — {authError}</span>
      {:else}no key — paste yours under connection{/if}
    </div>

    {#if me}
      <details class="new-chat" on:toggle={onPanelToggle}>
        <summary>+ new chat</summary>
        <div class="panel-head">
          <span class="hint-inline">agents seen on this hub in the last 45 s</span>
          <button class="ghost" on:click={loadPeers} title="refresh">↻</button>
        </div>
        {#if peersError}
          <p class="error-text">{peersError}</p>
        {:else if peersLoaded && livePeers.length === 0}
          <p class="hint-inline">no agents are live on this hub right now — existing chats below still open</p>
        {/if}
        {#each livePeers as a (a.name)}
          <label class="peer">
            <input type="checkbox" value={a.name} bind:group={picked} />
            {a.name}{#if a.kind}<span class="kind">{a.kind}</span>{/if}
          </label>
        {/each}
        <form class="start" on:submit|preventDefault={startChat}>
          <input bind:value={firstMessage} placeholder="first message (optional, sent as {me})…" disabled={creating} />
          <input class="turns" type="number" bind:value={newTurns} min="2" max="64" title="max turns" />
          <button type="submit" disabled={creating || picked.length === 0}>Start</button>
        </form>
      </details>
    {/if}

    <div class="history">
      <div class="history-head">
        <span>History</span>
        <button class="ghost" on:click={loadSessions} disabled={!me}>↻</button>
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

    <details class="config" bind:open={connOpen}>
      <summary>connection</summary>
      <label>Hub <input bind:value={hubUrl} on:change={reconnect} /></label>
      <label>Key <input type="password" autocomplete="off" placeholder="hub-key.mjs copy --as <you>" bind:value={agentKey} on:change={identify} /></label>
    </details>
  </aside>

  <section class="pane">
    {#if !me}
      <div class="placeholder">
        {#if authState === "error"}
          <p>This hub refused the key ({authError}). Paste the key for your name under connection.</p>
        {:else if authState === "checking"}
          <p>Checking the key…</p>
        {:else}
          <p>No key yet. Get yours with <code>node scripts/hub-key.mjs copy --as &lt;you&gt;</code> and paste it under connection → Key.</p>
        {/if}
      </div>
    {:else if !activeSession}
      <div class="placeholder">
        <p>Pick a conversation from the history, or start a new chat with the agents live on this hub.</p>
      </div>
    {:else}
      <div class="pane-head">
        <strong>{activeSession.title || "(untitled)"}</strong>
        <span class="extend-controls">
          <input class="turns" type="number" bind:value={extendBy} min="1" max="32" title="turns to add" />
          <button class="ghost" on:click={extendSession} disabled={extending}>+ extend</button>
          <span class="health">
            {#if converged}converged (DONE){:else if activeSession.isActive === false}closed{:else}live · {Math.max(transcript.length, activeSession.turnCount)}/{activeSession.maxTurns}{/if}
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
          placeholder="Message as {me}… (no @mention = every agent replies; use @name to target one)"
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
  .whoami { font-size: 0.78rem; color: #8b93a7; }
  .whoami strong { color: #e6e8ee; }
  .new-chat { font-size: 0.85rem; }
  .new-chat summary { cursor: pointer; color: #b7bdcc; }
  .panel-head { display: flex; justify-content: space-between; align-items: center; margin: 0.4rem 0; }
  .peer { display: flex; align-items: center; gap: 0.4rem; padding: 0.15rem 0; }
  .kind { font-size: 0.68rem; color: #8b93a7; margin-left: 0.3rem; }
  .start { display: flex; gap: 0.3rem; margin-top: 0.4rem; }
  .start input { flex: 1; min-width: 0; }
  .start .turns { flex: 0 0 3rem; }
  .start button { padding: 0.4rem 0.6rem; }
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
  .entry.c0 { border-left-color: #b58ae0; }
  .entry.c1 { border-left-color: #e0a84a; }
  .entry.c2 { border-left-color: #5bc0a0; }
  .entry.c3 { border-left-color: #d07a7a; }
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
