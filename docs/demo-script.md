# Instill AI — Demo Script

**Duration:** ~3 minutes  
**Audience:** Technical buyers, solo developers, team leads  
**Goal:** Show the full loop — set a rule once, watch every AI session pick it up automatically

---

## Setup (do before the demo)

1. Start the server: `node dist/server.js`
2. Have a terminal and a browser open side by side
3. Log in at `http://localhost:3500/login` as your demo user
4. Open Cursor or Claude with the MCP server already configured

---

## Script

### 1 — The problem (30 seconds)

> "Every time you start a new session with Claude or Cursor, you lose context. You paste the same instructions. The assistant drifts. You get inconsistent output.
>
> Instill fixes this. One server. Every session starts with your full ruleset — automatically."

### 2 — Add a rule (30 seconds)

1. Go to the Dashboard (`/dashboard`)
2. Click **+ Add rule**
3. Fill in:
   - Category: `coding style`
   - Rule: `Always use TypeScript strict mode. Never use any. Prefer const over let.`
4. Click **Save**

> "I just added a coding rule. Watch what happens next time an AI assistant starts up."

### 3 — MCP call picks it up (45 seconds)

Open a terminal and show the raw MCP call:

```bash
curl -X POST http://localhost:3500/mcp \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_preferences",
      "arguments": {}
    }
  }'
```

Expected response shows:
```
**coding style**
• Always use TypeScript strict mode. Never use any. Prefer const over let.
```

> "That's the MCP server returning my rule. Claude, Cursor — any MCP client calls this automatically at session start."

### 4 — Version history (30 seconds)

1. In the Dashboard, click the **🕐 history** icon on the rule
2. Show the version timeline sliding in from the right
3. Edit the rule slightly, save it
4. Open history again — show v1 and v2

> "Every edit is versioned. If a rule causes problems, roll back in one click — no data loss."

### 5 — Webhook (30 seconds)

1. Go to **Outbound Webhooks** section in Dashboard
2. Click **+ Add endpoint**
3. Enter a webhook.site URL (open it in a tab)
4. Save, then click **Test**
5. Switch to the webhook.site tab — show the delivery

> "Webhooks fire on every change. Connect it to Slack, a CI pipeline, or any HTTPS endpoint. HMAC-signed, retried automatically."

### 6 — Import a starter bundle (15 seconds)

In the terminal:

```bash
curl -X POST http://localhost:3500/api/bundles/import \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"bundleId":"instill:security-baseline-v1"}'
```

> "We ship curated packs — security baselines, TypeScript standards, accessibility rules. One API call to import the whole set."

### 7 — Close (15 seconds)

> "Instill is the preference server for teams who take AI consistency seriously.
>
> Self-hosted, open source, MIT licensed. Pro/Team/Business plans for managed hosting and governance features.
>
> `npm install`, configure MCP, and you're done. Link in the description."

---

## Key URLs to have open

| What | URL |
|------|-----|
| Dashboard | `http://localhost:3500/dashboard` |
| Setup guide | `http://localhost:3500/setup` |
| Tools reference | `http://localhost:3500/tools` |
| Pricing | `http://localhost:3500/pricing` |
| Webhook.site (test) | `https://webhook.site` |

---

## Talking points if asked

**"Why not just use a system prompt?"**
> System prompts are session-scoped and tool-specific. Instill persists rules across sessions, tools, and team members — with version history and audit logs.

**"How is this different from Cursor rules files?"**
> `.cursorrules` is a file per project, manual, no history, no webhooks, no team sharing. Instill is infrastructure: one server, every AI tool, every project.

**"Is it open source?"**
> Yes — MIT. You can self-host for free. Paid plans add managed hosting, higher rate limits, and enterprise features like audit exports and SAML prep.

**"What if the server goes down?"**
> AI assistants don't block on MCP calls. Most fall back gracefully. For production, run behind nginx + systemd with `Restart=always`. See the operator guide.
