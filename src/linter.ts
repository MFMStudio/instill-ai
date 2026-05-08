/**
 * Instill AI — Preference linter
 * Validates preference rules for quality, safety, and conflicts.
 *
 * Severity levels: "error" | "warn" | "info"
 *
 * Usage:
 *   import { lintPreferences } from './linter';
 *   const results = lintPreferences(prefs);
 */

export type Severity = "error" | "warn" | "info";

export interface LintIssue {
  prefId: string;
  category: string;
  rule: string;
  severity: Severity;
  code: string;
  message: string;
}

export interface LintResult {
  issues: LintIssue[];
  errors: number;
  warnings: number;
  infos: number;
  passed: boolean; // true if no errors
}

export interface LintablePref {
  id: string;
  category: string;
  rule: string;
}

// ── Patterns ────────────────────────────────────────────────────────────────

/** Patterns that look like raw secrets */
const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]{20,}/i,        // Stripe live key
  /sk_test_[A-Za-z0-9]{20,}/i,        // Stripe test key
  /ghp_[A-Za-z0-9]{36}/,              // GitHub PAT v2
  /github_pat_[A-Za-z0-9_]{82}/,      // GitHub fine-grained PAT
  /AKIA[0-9A-Z]{16}/,                  // AWS access key
  /-----BEGIN (RSA |EC )?PRIVATE KEY/, // PEM private key
  /[0-9a-f]{64}/,                      // generic 64-char hex (API secrets, HMAC keys)
  /(?:password|passwd|secret|apikey|api_key)\s*[:=]\s*["']?[^\s"']{8,}/i,
];

/** Patterns that suggest unsafe or destructive instructions */
const UNSAFE_PATTERNS = [
  { re: /\bsudo\b.*\brm\s+-rf\b/i, msg: "Contains destructive shell command (sudo rm -rf)" },
  { re: /\bdrop\s+table\b/i, msg: "Contains destructive SQL (DROP TABLE)" },
  { re: /\btruncate\s+table\b/i, msg: "Contains destructive SQL (TRUNCATE TABLE)" },
  { re: /\bdelete\s+from\b/i, msg: "Contains unconstrained SQL DELETE — ensure a WHERE clause is required" },
  { re: /\beval\s*\(/i, msg: "Contains eval() — prefer explicit parsing" },
  { re: /\bexec\s*\(/i, msg: "Contains exec() — prefer explicit subprocesses" },
];

/** Known conflicting instruction pairs (simplified) */
const CONFLICT_PAIRS: Array<{ a: RegExp; b: RegExp; msg: string }> = [
  {
    a: /\balways use tabs\b/i,
    b: /\balways use spaces\b/i,
    msg: "Conflicting indentation rules: 'always use tabs' vs 'always use spaces'",
  },
  {
    a: /\buse semicolons\b/i,
    b: /\bno semicolons\b/i,
    msg: "Conflicting semicolon rules",
  },
  {
    a: /\buse single quotes\b/i,
    b: /\buse double quotes\b/i,
    msg: "Conflicting quote style rules",
  },
  {
    a: /\buse camelCase\b/i,
    b: /\buse snake_case\b/i,
    msg: "Conflicting naming convention rules (camelCase vs snake_case)",
  },
  {
    a: /\bnever\s+add\s+comments\b/i,
    b: /\balways\s+add\s+comments\b/i,
    msg: "Conflicting comment rules",
  },
];

// ── Per-rule checks ──────────────────────────────────────────────────────────

function checkRule(pref: LintablePref): LintIssue[] {
  const issues: LintIssue[] = [];
  const { id, category, rule } = pref;

  const push = (severity: Severity, code: string, message: string) =>
    issues.push({ prefId: id, category, rule, severity, code, message });

  // E001 — Empty rule
  if (!rule.trim()) {
    push("error", "E001", "Rule is empty or whitespace-only");
    return issues; // no further checks on empty rules
  }

  // E002 — Rule too short (likely a placeholder)
  if (rule.trim().length < 5) {
    push("error", "E002", "Rule is too short to be meaningful (< 5 chars)");
  }

  // E003 — Contains what looks like a secret
  for (const pat of SECRET_PATTERNS) {
    if (pat.test(rule)) {
      push("error", "E003", "Rule appears to contain a raw secret or credential — use a reference instead (e.g. $MY_SECRET)");
      break;
    }
  }

  // E004 — Unsafe destructive pattern
  for (const { re, msg } of UNSAFE_PATTERNS) {
    if (re.test(rule)) {
      push("error", "E004", msg);
    }
  }

  // W001 — Rule very long (hard for AI to parse reliably)
  if (rule.trim().length > 500) {
    push("warn", "W001", `Rule is very long (${rule.trim().length} chars). Consider splitting into multiple rules for better AI recall`);
  }

  // W002 — All caps (shouting, often a mistake)
  if (rule === rule.toUpperCase() && rule.length > 10 && /[A-Z]/.test(rule)) {
    push("warn", "W002", "Rule is ALL CAPS. This is usually a mistake — use sentence case");
  }

  // W003 — Empty category
  if (!category || !category.trim()) {
    push("warn", "W003", "Category is empty. Assign a category to improve AI context grouping");
  }

  // W004 — Category is too generic
  const genericCategories = new Set(["default", "general", "misc", "other", "none", "n/a", "undefined", "null"]);
  if (genericCategories.has(category.trim().toLowerCase())) {
    push("warn", "W004", `Category "${category}" is too generic. Use a specific category like "coding style", "behaviour", or "workflow"`);
  }

  // I001 — Rule doesn't end with punctuation (minor style note)
  const trimmed = rule.trim();
  if (trimmed.length > 0 && !/[.!?;]$/.test(trimmed)) {
    push("info", "I001", "Rule does not end with punctuation — consistent punctuation improves AI parsing");
  }

  // I002 — Rule starts with lowercase (minor style)
  if (/^[a-z]/.test(trimmed)) {
    push("info", "I002", "Rule starts with a lowercase letter — consider capitalising for consistency");
  }

  return issues;
}

// ── Cross-rule conflict checks ───────────────────────────────────────────────

function checkConflicts(prefs: LintablePref[]): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const pair of CONFLICT_PAIRS) {
    const matchA = prefs.find((p) => pair.a.test(p.rule));
    const matchB = prefs.find((p) => pair.b.test(p.rule));
    if (matchA && matchB && matchA.id !== matchB.id) {
      issues.push({
        prefId: matchA.id,
        category: matchA.category,
        rule: matchA.rule,
        severity: "error",
        code: "E005",
        message: `${pair.msg} (conflicts with pref "${matchB.id}")`,
      });
    }
  }

  // E006 — Exact duplicate rules
  const seen = new Map<string, string>(); // normalised rule → first id
  for (const p of prefs) {
    const key = p.rule.trim().toLowerCase();
    if (seen.has(key)) {
      issues.push({
        prefId: p.id,
        category: p.category,
        rule: p.rule,
        severity: "error",
        code: "E006",
        message: `Exact duplicate of preference "${seen.get(key)}"`,
      });
    } else {
      seen.set(key, p.id);
    }
  }

  return issues;
}

// ── Main export ──────────────────────────────────────────────────────────────

export function lintPreferences(prefs: LintablePref[]): LintResult {
  const issues: LintIssue[] = [];

  for (const pref of prefs) {
    issues.push(...checkRule(pref));
  }

  issues.push(...checkConflicts(prefs));

  const errors   = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warn").length;
  const infos    = issues.filter((i) => i.severity === "info").length;

  return { issues, errors, warnings, infos, passed: errors === 0 };
}
