# ACE · Instill AI (`instill-ai`)

This folder mirrors **`public/roadmap.html`** for **ACE3** (namespaces, plans, memories). Edit the HTML first for customer-facing copy, then refresh **`instill-ai-roadmap.md`** or vice versa if you treat this file as source.

## Namespace (`instill-ai`)

Registered in ACE via **`POST /api/v1/namespaces/register`** (slug **`instill-ai`**, display name **Instill AI**).

**Contents (live in ACE):**

| Kind | Name |
|------|------|
| Plan | **Instill AI — platform roadmap** — full markdown from `instill-ai-roadmap.md` plus **granular launch checklist** (dozens of tasks: pillars + GBP/Stripe + ops + GTM). |
| Memory | **Instill AI — ACE workspace binding** — short meta pointer for this repo |

The duplicate roadmap plan that had been filed under **`mfm-studio`** was **removed** so Instill material lives only under **`instill-ai`**.

### CLI default namespace for this repo

Your global ACE profile may still use `ACE_NAMESPACE=mfm-studio`. When working **this project**, point ACE at Instill:

```bash
eval "$(ace env --export)"
export ACE_NAMESPACE=instill-ai
# or one-shot:
curl -s -H "Authorization: Bearer $ACE_JWT_TOKEN" "$ACE_API_URL/api/v1/instill-ai/stats"
```

## Import into ACE (manual)

The Cursor agent cannot push to your ACE cloud unless the **ace3** MCP server is enabled and authenticated.

1. Ensure **`ace3`** appears under MCP in Cursor (this repo’s `.cursor/mcp.json` includes it).
2. Run `ace login` / complete ACE auth if tools fail with permission errors.
3. In the ACE dashboard or via MCP tools after connection:
   - Create or select namespace **`instill-ai`**.
   - Create a **plan** titled **Instill AI — platform roadmap** and paste **`instill-ai-roadmap.md`**, or attach this file if your ACE UI supports file import.
4. Optional: save **`namespace.yaml`** metadata as an ACE memory titled **Instill AI · namespace binding**.

## Automated duplicate (when MCP works)

With ace3 connected, ask the agent to run **`ace_save_plan`** (or your ACE equivalent) with namespace **`instill-ai`** and the markdown body from **`instill-ai-roadmap.md`**.

## Repo links

- Live page: **`/roadmap`**
- HTML source: **`public/roadmap.html`**
