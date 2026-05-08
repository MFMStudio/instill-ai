# Instill AI — Commercial Packaging Guide

Reference for operators evaluating managed hosting, air-gapped deployment, and enterprise procurement.

---

## Managed hosting tier

### What's included

Managed hosting is Instill running in an operator-controlled environment with the following SLA-grade additions:

| Component | Managed tier |
|-----------|-------------|
| SQLite WAL backups | Daily automated, 7-day retention |
| TLS termination | nginx reverse proxy, Let's Encrypt auto-renew |
| Process resilience | macOS Launch Agent or systemd unit with `Restart=always` |
| Log rotation | logrotate or equivalent, 14-day retention |
| Health endpoint | `GET /api/health` returning `{"ok":true,"ts":"..."}` |
| Update path | `git pull && npm ci && npm run build && restart` |

### Positioning

Managed Instill targets teams who:
- Cannot run raw Node.js/SQLite themselves (no DevOps capacity)
- Want preference infrastructure with zero maintenance burden
- Need a guaranteed uptime commitment

**Not** a fit for: regulated industries requiring on-premises data sovereignty (see Air-gap bundle below).

### SLA checklist (operator self-assessment)

Before offering managed Instill to customers, verify:

- [ ] `SESSION_SECRET` rotated from default, stored in secrets manager
- [ ] `NODE_ENV=production` and HTTPS-only cookies enabled
- [ ] TLS terminated at reverse proxy (nginx/Caddy), certificate auto-renewed
- [ ] `APP_URL` set to the public HTTPS URL
- [ ] Stripe live keys configured and webhook registered in Stripe Dashboard
- [ ] Automated daily backup cron running and verified (restore drill completed)
- [ ] Firewall: port 443 public, port 3500 bound to localhost only
- [ ] Log rotation configured (14+ day retention)
- [ ] First admin user registered and documented
- [ ] Health check endpoint monitored (uptime robot or equivalent)

---

## Air-gap / enterprise bundle

### When to use

For regulated environments (finance, healthcare, defence) where:
- Outbound internet access is prohibited or restricted
- External CDN-hosted fonts/assets cannot be loaded
- npm registry access is blocked during deployment
- Audit trails must be kept on-premises

### Pre-flight: offline dependencies

Package all dependencies before going air-gapped:

```bash
# On a machine WITH internet access:
npm ci
npm pack
tar czf instill-bundle.tar.gz node_modules dist bundles docs public package.json

# Transfer bundle to air-gapped machine, then:
tar xzf instill-bundle.tar.gz
node dist/server.js
```

### Offline fonts

The default build loads Inter Tight and JetBrains Mono from Google Fonts. Replace with self-hosted fonts:

1. Download the font files from Google Fonts or Fontsource.
2. Place `.woff2` files in `public/fonts/`.
3. Add `@font-face` declarations to `public/signal.css` pointing to `/fonts/*.woff2`.
4. Remove the `<link>` tags to `fonts.googleapis.com` from all HTML files.

### Install checksums

Generate SHA-256 checksums for all files in the release bundle:

```bash
find dist/ bundles/ public/ -type f | sort | xargs shasum -a 256 > CHECKSUMS.sha256
```

Verify on the air-gapped machine:

```bash
shasum -a 256 -c CHECKSUMS.sha256
```

### SAML preparation (enterprise SSO)

Instill uses session-based auth today. SAML/OIDC is forward-compatible:

1. The `users` table is already separated from credentials (passwords stored as bcrypt hashes).
2. When a SAML IdP is integrated, the `password_hash` column becomes unused for SSO users.
3. The `is_admin` flag maps to a SAML group claim (`instill:admin`).

Required pre-work for your enterprise procurement package:
- Document the SAML attributes: `email` (required), `is_admin` (optional boolean group claim)
- Confirm IdP supports SP-initiated SSO (Instill will be the SP)
- Verify session cookie `instill.sid` is compatible with IdP session lifetimes

---

## Pricing alignment

| Plan | Target buyer | Key capability |
|------|-------------|----------------|
| **Pro** (£12/mo) | Solo developers, freelancers | Full preference API, Stripe billing, history |
| **Team** (£39/mo) | Small teams | Same as Pro, higher rate limits |
| **Business** (£99/mo) | Enterprises | All features, SAML prep, audit exports, priority support |

Business plan buyers should be directed to:
- `/api/audit/export` for SIEM-compatible audit logs
- `docs/secrets-separation.md` for Vault/Doppler integration
- This document for deployment and procurement guidance

---

## Support path

| Issue | Resolution path |
|-------|----------------|
| Billing, subscriptions | Stripe Customer Portal (`/checkout/portal`) |
| Technical bugs | GitHub Issues (see `SUPPORT.md`) |
| Security disclosures | `security@instill.ai` (see `.github/SECURITY.md`) |
| Enterprise procurement | Direct contact via Business plan onboarding |
