# Changelog — Instill AI

All notable changes to the platform. Format: [Semantic Versioning](https://semver.org).

---

## [2.1.0] — 2026-05-08

### Added

#### Governance & lifecycle
- **Preference versioning** — every create/update writes an immutable snapshot to `preference_revisions`. History timeline with version diffs accessible in the dashboard via the 🕐 button. Restore to any version via `POST /api/preferences/:id/restore/:revisionId`.
- **Scopes & environments** — preferences can be bound to `scope_env` (dev/stage/prod), `scope_project` (repo/project key), and `scope_client` labels. `get_preferences_scoped` MCP tool resolves global + scope-specific rules contextually. Dashboard modal includes scope fields.
- **Preference lint & CI** — `src/linter.ts` checks for empty rules, raw secrets (E003), unsafe patterns, conflicts, duplicates, and style issues. `npm run lint:preferences` CLI with coloured output and exit codes. `lint_preferences` MCP tool for pre-flight checks in assistants. GitHub Action template at `.github/workflows/lint-preferences.yml`.
- **Team workflow** — draft/pending_review/active status on preferences. `POST /api/preferences/:id/submit-review`, `/approve`, `/reject`. Admin review queue at `GET /api/admin/review-queue`. `pref_audit` table records actor, action, diff hash (SHA-256 of category+rule — never rule text) on every state change.

#### Distribution
- **Outbound webhooks** — HTTPS endpoints for `preference.created`, `preference.updated`, `preference.deleted`. HMAC-SHA256 signed (`X-Instill-Signature`). Retries 3× with 2s/4s backoff. Dashboard CRUD + test delivery button. Reference examples (Node.js, Python, Slack bridge, curl) in `docs/webhooks.md`.
- **Bundle starter packs** — curated bundles in `/bundles/`. Import via `POST /api/bundles/import`. Ships with: Security Baseline, TypeScript Stack, Accessibility (a11y).

#### Ops & trust
- **Privacy-preserving telemetry** — aggregate MCP/API call counts, error rates, and latency buckets per hour. No rule text, no request bodies stored. Admin metrics page at `/metrics` with hourly chart, endpoint breakdown, top users. CSV/NDJSON export at `GET /api/admin/metrics/export`.
- **Audit exports** — NDJSON/CSV stream of revision events + webhook delivery history. `GET /api/audit/export` (own user), `GET /api/admin/audit/export` (all users). Paginated by window (`?days=`, max 90).
- **Secrets separation** — `${{ env.VAR }}` and `${{ vault.key }}` reference syntax documented. Resolvers resolve at MCP read time; references never stored with resolved values. Rotation playbook in `docs/secrets-separation.md`.
- **Rate limiting** — auth routes: 10 req/15 min per IP. MCP/API routes: 300 req/min per IP.
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy`, `Strict-Transport-Security` (prod only).
- **Structured JSON logging** — all requests and errors log as `{ts, level, msg, ...meta}` to stdout. Ready for Datadog, CloudWatch, Loki.
- **Prod cookie hardening** — `httpOnly`, `sameSite: lax`, `secure` (prod), named cookie `instill.sid`.

#### Billing
- **Stripe Checkout** — hosted sessions for Pro/Team/Business plans. Webhook handler for subscription lifecycle events. Customer Portal for self-serve billing management.
- **Plan on `/api/me`** — response includes `plan` field.

#### Docs
- `docs/operator-guide.md` — SQLite backup/restore (WAL, restore drill), nginx TLS, macOS Launch Agent, logrotate, pre-launch security checklist.
- `docs/webhooks.md` — signature verification examples in Node.js, Python, Slack bridge, and curl.
- `docs/secrets-separation.md` — reference syntax, env/Vault resolvers, rotation playbook, lint enforcement.
- `docs/commercial-packaging.md` — managed hosting SLA checklist, air-gap bundle (offline fonts, checksums, SAML prep), pricing alignment.
- `docs/positioning.md` — one-pager vs MCP gateways vs IDE subscriptions vs plain text rules.
- `docs/v2.1-launch-scope.md` — must-have vs post-launch decision record.
- `docs/demo-script.md` — 3-minute live demo walkthrough with curl examples and talking points.

### Changed
- `express.json()` body limit capped at 256 KB.
- `/openapi.json` updated to version 2.1.0 with PUT and APP_URL-based server URL.
- Server logs structured JSON on boot instead of plain text.
- Metrics purge runs on boot and every 24 hours (90-day retention).

### Fixed
- Dark mode: `btn-signal`, `tier-badge`, `nav-badge` all use fixed `#14130f` text — no longer invisible on neon green background in dark theme.
- Dashboard theme toggle conflict — removed duplicate `toggleTheme()` inline function.
- Nav order consistent across all pages.
- `tools.html` correctly hides Dashboard/Setup for logged-out users.

---

## [2.0.0] — 2026-05 (initial public release)

### Added
- Self-hosted MCP preference server (Streamable HTTP transport).
- 13 MCP tools: save, get, list, update, delete, search, category filters, session reset, gather context, double-check facts, reset model.
- REST + OpenAPI surface for ChatGPT Actions.
- Per-user SQLite stores, admin panel, API key rotation.
- Signal design system — warm paper theme, dark mode, Inter Tight + JetBrains Mono.
- Marketing pages: home, integrations, tools, pricing, setup, roadmap.
- macOS Launch Agent for auto-start and resilience.
