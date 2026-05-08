# Instill AI — Positioning One-Pager

**Version:** 2.1 · **Date:** 2026-05-08

---

## What is Instill?

Instill is a **self-hosted preference server** that gives AI assistants a durable, versioned, auditable memory of how you want them to behave — across sessions, tools, and projects.

Think of it as infrastructure for your AI rules: not a chat plugin, not a system prompt you paste in, not a note in a README. A proper server with an API, history, and webhooks.

---

## The problem it solves

Every time you start a new session with an AI assistant, you lose context. You repeat yourself. You paste the same instructions. The assistant drifts.

Worse, when preferences are scattered across chat histories, Cursor rules files, `.github/copilot-instructions.md`, and the occasional comment in a CLAUDE.md — there is no single source of truth, no history of what changed and why, and no way to audit what rules an assistant is operating under.

---

## Who it's for

| Persona | Pain | Instill fix |
|---------|------|-------------|
| **Solo developer** | Repeating coding style rules in every new Claude/Cursor session | One-time MCP setup → rules load automatically on session start |
| **Freelancer** | Different rule sets per client, hard to switch | Categories + scopes → switch contexts in one MCP call |
| **Small team** | No canonical source of truth for AI behaviour | Shared preference server → everyone's assistant follows the same rules |
| **Enterprise** | Regulated environment needs auditable AI guardrails | Versioning + audit export → SIEM-compatible trail of all rule changes |

---

## How it compares

### vs MCP gateways (e.g. Zapier MCP, generic MCP hosts)

MCP gateways are plumbing — they let tools call APIs. They don't store preferences, don't version them, and don't fire webhooks when things change. Instill is **content** (your rules) plus **infrastructure** (the server that manages them).

### vs IDE subscriptions (e.g. Cursor Pro, GitHub Copilot)

IDE subscriptions give you a better code editor experience. They don't solve the consistency problem across different AI tools. Instill works with **any** MCP-compatible assistant: Claude, Cursor, Claude Code, ChatGPT Actions, anything that can hit an HTTP endpoint.

### vs a `.cursorrules` file or `CLAUDE.md`

Plain text files are fine for individuals. They break down when:
- You need different rules per project or client
- You want to know who changed a rule and when
- You want to push rule changes to a webhook (e.g. notify a Slack channel)
- You need a non-technical team member to manage rules via a UI

### vs building it yourself

You could build a SQLite + MCP server. We already did. Instill adds versioning, history, diff/restore, webhooks, bundle imports, rate limiting, billing, and a dashboard. That's 3–6 months of work you get in one `npm install`.

---

## The pitch (30 seconds)

> Instill is the preference server for teams who take AI consistency seriously. You connect it to Claude, Cursor, or any MCP client once — and from then on, every session starts with your full ruleset, automatically. When you update a rule, every assistant picks it up. When something breaks, you roll back to a previous version in one click. When an auditor asks what rules your AI was operating under last Tuesday, you export a signed audit log.

---

## Pricing summary

| Plan | Price | For |
|------|-------|-----|
| Free | £0 | Self-hosted, unlimited preferences, MCP + REST API |
| Pro | £12/mo | Hosted, history/rollback, bundles, webhooks |
| Team | £39/mo | Pro × team, higher rate limits |
| Business | £99/mo | Team + audit exports, SAML prep, priority support |

The free tier is full-featured self-hosted. Paid plans add managed hosting and enterprise-grade governance features.
