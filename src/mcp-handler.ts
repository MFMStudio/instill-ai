import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Request, Response } from "express";
import { z } from "zod";
import { prefQueries, generateId } from "./db";
import { lintPreferences } from "./linter";

export function createUserMcpServer(userId: number): McpServer {
  const server = new McpServer({
    name: "ai-consistency",
    version: "1.0.0",
  });

  // Cast to any to bypass TS2589 deep type instantiation issue with MCP SDK + TS 5.x
  const tool = (server.tool as any).bind(server);

  tool("save_preference", "Save a rule or instruction that should always be followed",
    { category: z.string(), rule: z.string() },
    async ({ category, rule }: { category: string; rule: string }) => {
      prefQueries.create.run({ id: generateId(), userId, category, rule });
      return { content: [{ type: "text", text: `Saved: [${category}] ${rule}` }] };
    }
  );

  tool("get_preferences", "Get all saved preferences — call this at the start of every session",
    {},
    async () => {
      const prefs = prefQueries.listByUser.all(userId) as any[];
      if (prefs.length === 0) {
        return { content: [{ type: "text", text: "No preferences saved yet." }] };
      }
      const grouped: Record<string, string[]> = {};
      for (const p of prefs) {
        if (!grouped[p.category]) grouped[p.category] = [];
        grouped[p.category].push(`• ${p.rule}`);
      }
      const output = Object.entries(grouped)
        .map(([cat, rules]) => `**${cat}**\n${rules.join("\n")}`)
        .join("\n\n");
      return { content: [{ type: "text", text: output }] };
    }
  );

  tool("list_preferences_with_ids", "List all preferences with their IDs",
    {},
    async () => {
      const prefs = prefQueries.listByUser.all(userId) as any[];
      if (prefs.length === 0) {
        return { content: [{ type: "text", text: "No preferences saved yet." }] };
      }
      const lines = prefs.map((p: any) => `[${p.id}] (${p.category}) ${p.rule}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  tool("delete_preference", "Delete a preference by its ID",
    { id: z.string() },
    async ({ id }: { id: string }) => {
      const result = prefQueries.delete.run(id, userId) as any;
      if (result.changes === 0) {
        return { content: [{ type: "text", text: `No preference found with ID: ${id}` }] };
      }
      return { content: [{ type: "text", text: `Deleted preference ${id}` }] };
    }
  );

  tool("update_preference", "Update the rule text (and optionally the category) of an existing preference by ID",
    { id: z.string(), rule: z.string(), category: z.string().optional() },
    async ({ id, rule, category }: { id: string; rule: string; category?: string }) => {
      const existing = prefQueries.findById.get(id, userId) as any;
      if (!existing) {
        return { content: [{ type: "text", text: `No preference found with ID: ${id}` }] };
      }
      const newCategory = category?.trim() || existing.category;
      prefQueries.updatePref.run({ category: newCategory, rule: rule.trim(), id, userId });
      return { content: [{ type: "text", text: `Updated [${newCategory}] ${rule}` }] };
    }
  );

  tool("get_preferences_by_category", "Get all preferences in a specific category",
    { category: z.string() },
    async ({ category }: { category: string }) => {
      const prefs = prefQueries.listByCategory.all(userId, category) as any[];
      if (prefs.length === 0) {
        return { content: [{ type: "text", text: `No preferences found in category: ${category}` }] };
      }
      const lines = prefs.map((p: any) => `• ${p.rule}`).join("\n");
      return { content: [{ type: "text", text: `**${category}**\n${lines}` }] };
    }
  );

  tool("list_categories", "List all preference categories with their rule counts",
    {},
    async () => {
      const rows = prefQueries.categoryBreakdownByUser.all(userId) as any[];
      if (rows.length === 0) {
        return { content: [{ type: "text", text: "No categories yet." }] };
      }
      const lines = rows.map((r: any) => `• ${r.category} (${r.count} rule${r.count === 1 ? "" : "s"})`).join("\n");
      return { content: [{ type: "text", text: lines }] };
    }
  );

  tool("search_preferences", "Search preferences by keyword across rule text and category names",
    { query: z.string() },
    async ({ query }: { query: string }) => {
      const pattern = `%${query}%`;
      const prefs = prefQueries.searchByUser.all(userId, pattern, pattern) as any[];
      if (prefs.length === 0) {
        return { content: [{ type: "text", text: `No preferences matching: ${query}` }] };
      }
      const lines = prefs.map((p: any) => `[${p.id}] (${p.category}) ${p.rule}`).join("\n");
      return { content: [{ type: "text", text: `Found ${prefs.length} result(s):\n${lines}` }] };
    }
  );

  tool("rename_category", "Rename a category — moves all its preferences to the new name",
    { old_category: z.string(), new_category: z.string() },
    async ({ old_category, new_category }: { old_category: string; new_category: string }) => {
      const result = prefQueries.renameCategory.run(new_category.trim(), old_category.trim(), userId) as any;
      if (result.changes === 0) {
        return { content: [{ type: "text", text: `No preferences found in category: ${old_category}` }] };
      }
      return { content: [{ type: "text", text: `Renamed "${old_category}" → "${new_category}" (${result.changes} rule${result.changes === 1 ? "" : "s"} moved)` }] };
    }
  );

  tool("clear_category", "Delete all preferences in a category",
    { category: z.string() },
    async ({ category }: { category: string }) => {
      const result = prefQueries.deleteByCategory.run(userId, category) as any;
      if (result.changes === 0) {
        return { content: [{ type: "text", text: `No preferences found in category: ${category}` }] };
      }
      return { content: [{ type: "text", text: `Deleted ${result.changes} preference${result.changes === 1 ? "" : "s"} from "${category}"` }] };
    }
  );

  tool("gather_context", "Consolidate all relevant context from the current conversation without making any further tool calls or API requests",
    {},
    async () => {
      return {
        content: [{
          type: "text",
          text: [
            "**Gather Context**",
            "",
            "Review the entire conversation from the beginning. Identify and consolidate:",
            "1. The user's current goal or task",
            "2. Key decisions, constraints, or requirements already established",
            "3. Progress made so far and what remains",
            "4. Any open questions or blockers",
            "",
            "Use this to inform your next response. Do not make any further tool calls or external requests for this step — work only from what is already in the conversation.",
          ].join("\n"),
        }],
      };
    }
  );

  tool("double_check_facts", "Activate stricter fact-checking — all factual claims reviewed before responding, with mandatory verification flags for finance, medical, and legal domains",
    {},
    async () => {
      return {
        content: [{
          type: "text",
          text: [
            "**Fact-Check Mode — Active**",
            "",
            "Before responding, review every factual claim you are about to make:",
            "• If you are certain — state it clearly",
            "• If you are not certain — say so explicitly, do not present it as fact",
            "• If you cannot verify — say 'I believe X, but please verify this'",
            "",
            "**High-stakes domains — mandatory flags:**",
            "",
            "Finance (tax, rates, regulations, investment): flag all uncertainty and recommend a qualified financial adviser or accountant",
            "",
            "Medical (dosages, diagnoses, treatment, symptoms): flag all uncertainty and recommend consulting a doctor or pharmacist",
            "",
            "Legal (statutes, rights, case law, contracts): flag all uncertainty and recommend consulting a solicitor or lawyer",
            "",
            "Never state high-stakes facts with confidence you do not have. Accuracy matters more than sounding authoritative.",
          ].join("\n"),
        }],
      };
    }
  );

  tool("reset_model", "Reset session state — clears accumulated drift and fatigue, reloads all preferences as if the session just started",
    {},
    async () => {
      const prefs = prefQueries.listByUser.all(userId) as any[];
      const grouped: Record<string, string[]> = {};
      for (const p of prefs) {
        if (!grouped[p.category]) grouped[p.category] = [];
        grouped[p.category].push(`• ${p.rule}`);
      }
      const prefsText = Object.entries(grouped)
        .map(([cat, rules]) => `**${cat}**\n${rules.join("\n")}`)
        .join("\n\n");

      return {
        content: [{
          type: "text",
          text: [
            "**SESSION RESET — treat everything from this point as a brand new session.**",
            "",
            "You have been operating in a long context. You may have been pattern-matching against earlier exchanges rather than reading instructions precisely, taking shortcuts, making assumptions, or conflating separate things. Stop.",
            "",
            "From this message forward:",
            "• Read each instruction as if you are seeing it for the first time",
            "• Do not assume you know what the user wants based on earlier patterns",
            "• Apply the same precision, care, and attention you would have at the very start of this conversation",
            "• If you are about to do something, check that it is exactly what was asked — not a shortcut or approximation of it",
            "• Do not carry forward any assumptions, half-formed conclusions, or habits from earlier in this session",
            "",
            "Re-apply the following preferences now, as if loading them at session start:",
            "",
            prefsText || "No preferences saved.",
            "",
            "Acknowledge this reset in one short sentence, then wait for the next instruction.",
          ].join("\n"),
        }],
      };
    }
  );

  tool("get_preferences_scoped", "Get preferences filtered to a specific scope — combines global rules with scope-specific rules",
    { env: z.string().optional(), project: z.string().optional(), client: z.string().optional() },
    async ({ env, project, client }: { env?: string; project?: string; client?: string }) => {
      const prefs = prefQueries.getScopedPrefs.all(userId, env ?? null, project ?? null, client ?? null) as any[];
      if (prefs.length === 0) {
        return { content: [{ type: "text", text: "No preferences found for this scope." }] };
      }
      const grouped: Record<string, string[]> = {};
      for (const p of prefs) {
        if (!grouped[p.category]) grouped[p.category] = [];
        grouped[p.category].push(`• ${p.rule}`);
      }
      const output = Object.entries(grouped)
        .map(([cat, rules]) => `**${cat}**\n${rules.join("\n")}`)
        .join("\n\n");
      return { content: [{ type: "text", text: output }] };
    }
  );

  tool("lint_preferences", "Run a pre-flight lint check on your saved preferences — detects empty rules, secrets, conflicts, and style issues before a session",
    {},
    async () => {
      const prefs = prefQueries.listByUser.all(userId) as any[];
      if (!prefs.length) {
        return { content: [{ type: "text", text: "No preferences to lint." }] };
      }
      const result = lintPreferences(prefs);
      if (!result.issues.length) {
        return { content: [{ type: "text", text: `✔ All ${prefs.length} preference${prefs.length === 1 ? "" : "s"} passed linting. No issues found.` }] };
      }
      const lines: string[] = [
        `Found ${result.errors} error${result.errors === 1 ? "" : "s"}, ${result.warnings} warning${result.warnings === 1 ? "" : "s"}, ${result.infos} info${result.infos === 1 ? "" : "s"} across ${prefs.length} preferences.`,
        "",
      ];
      for (const issue of result.issues) {
        const icon = issue.severity === "error" ? "✖" : issue.severity === "warn" ? "⚠" : "ℹ";
        lines.push(`${icon} [${issue.code}] ${issue.message}`);
        lines.push(`  Pref: ${issue.prefId} · Category: ${issue.category}`);
        lines.push(`  Rule: ${issue.rule.slice(0, 100)}${issue.rule.length > 100 ? "…" : ""}`);
        lines.push("");
      }
      lines.push(result.passed ? "✔ No errors — preferences are safe to use." : "✖ Errors found — review and fix before relying on these preferences.");
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  return server;
}

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const user = (req as any).mcpUser;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  const server = createUserMcpServer(user.id);

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } finally {
    await server.close();
  }
}
