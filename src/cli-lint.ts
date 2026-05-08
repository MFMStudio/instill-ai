#!/usr/bin/env node
/**
 * Instill AI — CLI preference linter
 * Usage: npm run lint:preferences
 *        npx ts-node src/cli-lint.ts
 *
 * Exit codes:
 *   0 — no errors (warnings/infos may be present)
 *   1 — one or more lint errors found
 *   2 — fatal error (DB unreachable, bad args)
 */

import { db } from "./db";
import { lintPreferences, LintIssue } from "./linter";

const SEVERITY_ICON: Record<string, string> = {
  error: "✖",
  warn:  "⚠",
  info:  "ℹ",
};

const SEVERITY_COLOR: Record<string, string> = {
  error: "\x1b[31m",  // red
  warn:  "\x1b[33m",  // yellow
  info:  "\x1b[36m",  // cyan
};

const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";
const DIM   = "\x1b[2m";

function color(text: string, sev: string) {
  return (SEVERITY_COLOR[sev] || "") + text + RESET;
}

function formatIssue(issue: LintIssue): string {
  const icon = SEVERITY_ICON[issue.severity] || "•";
  const code = DIM + `[${issue.code}]` + RESET;
  const where = DIM + `pref:${issue.prefId} (${issue.category})` + RESET;
  const msg = color(`${icon} ${issue.message}`, issue.severity);
  return `  ${msg} ${code}\n  ${where}\n  ${DIM}Rule: ${issue.rule.slice(0, 80)}${issue.rule.length > 80 ? "…" : ""}${RESET}`;
}

async function main() {
  // Optionally filter to a single user
  const args = process.argv.slice(2);
  const userIdx = args.indexOf("--user");
  const userId: string | null = userIdx !== -1 ? args[userIdx + 1] : null;

  let rows: Array<{ id: string; category: string; rule: string }>;

  try {
    if (userId) {
      rows = db.prepare("SELECT id, category, rule FROM preferences WHERE user_id = ?").all(userId) as any;
    } else {
      rows = db.prepare("SELECT id, category, rule FROM preferences").all() as any;
    }
  } catch (err: any) {
    console.error(`${BOLD}Fatal:${RESET} Could not query preferences — ${err.message}`);
    process.exit(2);
  }

  if (!rows.length) {
    console.log(`\n${DIM}No preferences found${RESET}${userId ? ` for user ${userId}` : ""}.\n`);
    process.exit(0);
  }

  console.log(`\n${BOLD}Instill AI — Preference Linter${RESET}`);
  console.log(`${DIM}Checking ${rows.length} preference${rows.length === 1 ? "" : "s"}…${RESET}\n`);

  const result = lintPreferences(rows);

  if (!result.issues.length) {
    console.log(`\x1b[32m✔ All preferences passed linting.\x1b[0m\n`);
    process.exit(0);
  }

  // Group by severity
  const errors   = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warn");
  const infos    = result.issues.filter((i) => i.severity === "info");

  for (const group of [errors, warnings, infos]) {
    for (const issue of group) {
      console.log(formatIssue(issue));
      console.log();
    }
  }

  const summary: string[] = [];
  if (errors.length)   summary.push(color(`${errors.length} error${errors.length === 1 ? "" : "s"}`, "error"));
  if (warnings.length) summary.push(color(`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`, "warn"));
  if (infos.length)    summary.push(color(`${infos.length} info${infos.length === 1 ? "" : "s"}`, "info"));

  console.log(`${BOLD}Summary:${RESET} ${summary.join(" · ")}\n`);

  process.exit(result.passed ? 0 : 1);
}

main();
