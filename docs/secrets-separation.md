# Instill AI — Secrets Separation Guide

How to keep raw credentials out of preference rules and reference them safely.

---

## The problem

Preference rules are stored in SQLite and returned verbatim to AI assistants. Embedding raw secrets or API keys in rules creates two risks:

1. **Exposure** — Rules appear in MCP responses, dashboard, audit exports, and potentially backups.
2. **Rotation pain** — Rotating a key means editing every rule that references it.

---

## Secret reference syntax

Use the `${{ }}` placeholder syntax anywhere in a rule's text to reference a secret by name instead of value:

```
Always authenticate with GitHub using token ${{ env.GITHUB_TOKEN }}.
Use the production Stripe key ${{ env.STRIPE_SECRET_KEY }} for billing checks.
Connect to the DB at ${{ env.DATABASE_URL }}.
```

### Supported sources

| Prefix | Source | Example |
|--------|--------|---------|
| `env.` | `process.env` (server environment) | `${{ env.MY_API_KEY }}` |
| `vault.` | Pluggable Vault/Doppler-style resolver | `${{ vault.my-secret }}` |

---

## How resolution works

When an AI assistant calls `get_preferences` via MCP, Instill resolves `${{ }}` references server-side before returning the rule text. The rule is **never stored with the resolved value** — resolution happens at read time only.

```
Stored rule:   "Auth with ${{ env.API_KEY }}"
Returned rule: "Auth with sk_live_abc123..."  ← resolved at MCP response time
```

If a reference cannot be resolved (missing env var, Vault unreachable), the placeholder is left in place and a warning is appended:

```
"Auth with ${{ env.API_KEY }} [⚠ unresolved: env.API_KEY not set]"
```

---

## Environment variables

Set secrets in the server's environment before starting:

```bash
# .env (never commit this file)
GITHUB_TOKEN=ghp_...
STRIPE_SECRET_KEY=sk_live_...
DATABASE_URL=postgres://...

# Load with dotenv (dev only)
node -r dotenv/config dist/server.js

# Or export directly (production)
export GITHUB_TOKEN=ghp_...
node dist/server.js
```

In the **macOS Launch Agent** plist:

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>SESSION_SECRET</key><string>your-session-secret</string>
  <key>GITHUB_TOKEN</key><string>ghp_...</string>
</dict>
```

---

## Pluggable Vault resolver

For Vault, Doppler, AWS Secrets Manager, or 1Password, implement the resolver interface:

```typescript
// src/secret-resolver.ts
export type SecretResolver = (name: string) => Promise<string | null>;

// Example: Doppler
export const dopplerResolver: SecretResolver = async (name) => {
  const res = await fetch(`https://api.doppler.com/v3/configs/config/secret?name=${name}`, {
    headers: { Authorization: `Bearer ${process.env.DOPPLER_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.value?.raw ?? null;
};
```

Register your resolver in `src/server.ts`:

```typescript
import { setSecretResolver } from './secret-resolver';
setSecretResolver(dopplerResolver);
```

---

## Rotation playbook

Rotating a secret **never requires touching preference rows**:

1. Generate the new secret in your secrets provider.
2. Update the environment variable (or Vault key) on the server.
3. Restart the server (or send `SIGHUP` if using pm2/systemd reload).
4. Rules referencing `${{ env.MY_SECRET }}` automatically resolve to the new value on the next `get_preferences` call.
5. Verify: call `get_preferences` via MCP and confirm the new value appears.
6. Revoke the old secret.

No database migration, no preference edits required.

---

## Forbid raw secrets (optional policy)

Enable the "forbid raw secrets" lint rule in `npm run lint:preferences` to enforce that no preference rule contains patterns matching known secret formats:

The linter checks for:
- Stripe live/test keys (`sk_live_*`, `sk_test_*`)
- GitHub PATs (`ghp_*`, `github_pat_*`)
- AWS access keys (`AKIA*`)
- PEM private keys
- Generic 64-char hex strings

Violations are reported as **lint error E003** and will fail CI if you use the GitHub Action template.

---

## Security checklist

- [ ] No raw API keys in rule text — use `${{ env.* }}`
- [ ] `.env` file listed in `.gitignore`
- [ ] `SESSION_SECRET` set to a 32+ char random value
- [ ] Vault/Doppler token stored in OS keychain or secrets manager (not in a preference rule)
- [ ] `npm run lint:preferences` runs in CI with E003 treated as a blocker
