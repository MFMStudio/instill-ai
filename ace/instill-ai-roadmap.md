---
ace_namespace: instill-ai
project: ai-consistency-platform
title: Instill AI — Platform roadmap
source: public/roadmap.html
synced: duplicate of marketing roadmap (keep in lockstep when editing)
---

# Instill AI — Roadmap & direction

**Canonical web copy:** `/roadmap` (`public/roadmap.html`)

Shipped today is the self-hosted preference core (MCP, API, dashboard, billing hooks). Everything else is sequenced below.

## Feedback & summary

Instill wins when preferences are treated as **infrastructure**, not chat snippets: durable, scoped, reviewable, and observable without becoming generic MCP hosting. Work clusters into four pillars:

1. **Governance & lifecycle** — Versioning, scopes, lint, semantic search, and team approvals turn rules into policy you can trust in regulated settings.
2. **Distribution** — Curated bundles and webhooks make onboarding fast and connect preferences to the rest of your stack.
3. **Ops & trust** — Privacy-preserving telemetry, secret references, and audit exports answer “who changed what” without shipping preference bodies to third parties.
4. **Commercial shape** — Managed hosting and air-gapped enterprise packaging meet buyers who cannot run raw Node/SQLite themselves or cannot touch the public internet.

**Status legend:** Live · Next · Planned

---

## Shipped core · v2 baseline

| Capability | Status | Notes |
|------------|--------|--------|
| MCP preference tools | **Live** | Streamable HTTP MCP: save, list, get, update, delete, search, category filters, session reset. |
| REST & OpenAPI | **Live** | Dashboard CRUD + OpenAPI for ChatGPT Actions. |
| Categories & keyword search | **Live** | SQLite-backed text search; semantic layer planned separately. |
| Teams & admin | **Live** | Per-user stores, admin panel, API key rotation, Stripe plan hooks. |

---

## Governance & lifecycle

| Capability | Status | Outcome |
|------------|--------|---------|
| Versioning & rollback | **Next** | Snapshots, diff, restore; optional named releases. |
| Scopes & environments | **Next** | Bind rules to repo/project/client/env; contextual `get_preferences`. |
| Rule lint & CI checks | Planned | Validate packs; CLI + optional MCP gate. |
| Semantic search & clustering | Planned | Embeddings; optional local / BYO endpoint. |
| Team workflow & audit | Planned | Draft → review → approve; audit trail (ties to versioning). |

---

## Distribution & integrations

| Capability | Status | Outcome |
|------------|--------|---------|
| Policy bundles marketplace | Planned | Curated starter packs; free templates first. |
| Webhooks & event stream | Planned | `preference.created|updated|deleted` → HTTPS / Slack / queue. |

---

## Ops & trust

| Capability | Status | Outcome |
|------------|--------|---------|
| Usage & health telemetry | Planned | Aggregates only — **no rule body** by default. |
| Secrets separation | Planned | References from env/Vault/Doppler-style providers. |
| Audit exports API | Planned | SIEM-friendly exports; scheduled dumps. |

---

## Commercial packaging

| Capability | Status | Outcome |
|------------|--------|---------|
| Managed hosting tier | Planned | Operator-run backups, TLS, upgrades; separate SKU. |
| Air-gapped / enterprise bundle | Planned | Offline docs, SAML-forward packaging, hardening guides. |

---

## Scope & expectations

Full delivery is a **multi-release programme**. Priority follows demand: governance-heavy buyers pull versioning and approvals; platform teams pull webhooks and telemetry; regulated buyers pull audit and air-gap packaging.
