import "./env-bootstrap";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "child_process";
import path from "path";

function ensureSqliteNativeAddon(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("better-sqlite3");
    return;
  } catch {
    // Continue to rebuild attempt below.
  }

  const cursorNodeDir =
    process.env.CURSOR_NODE_DIR ||
    "/Applications/Cursor.app/Contents/Resources/app/resources/helpers";
  const nodeBin = path.join(cursorNodeDir, "node");
  const projectRoot = path.join(__dirname, "..");

  try {
    execSync("npm rebuild better-sqlite3", {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${cursorNodeDir}${path.delimiter}${process.env.PATH || ""}`,
      },
    });
  } catch {
    // Fall through to the final require to emit actionable error.
  }

  // If this throws, it preserves the exact loader error in MCP logs.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("better-sqlite3");
}

async function main(): Promise<void> {
  ensureSqliteNativeAddon();

  const { userQueries } = await import("./db");
  const { createUserMcpServer } = await import("./mcp-handler");
  const apiKey = process.env.AI_CONSISTENCY_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "AI_CONSISTENCY_API_KEY is missing. Copy .env.example to .env in this repo and set your dashboard API key (hex only, no Bearer prefix)."
    );
    process.exit(1);
  }
  const user = userQueries.findByApiKey.get(apiKey) as { id: number } | undefined;
  if (!user) {
    console.error("Invalid API key: no user matches this key in data/platform.db.");
    process.exit(1);
  }

  const server = createUserMcpServer(user.id);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
