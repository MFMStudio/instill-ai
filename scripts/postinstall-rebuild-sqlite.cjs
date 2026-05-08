/**
 * Keep Cursor MCP stable on macOS:
 * after npm install/prepare, rebuild better-sqlite3 using Cursor's bundled Node ABI.
 * If Cursor is unavailable, emit a warning (no hard failure for generic installs).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform !== "darwin") process.exit(0);

const root = path.join(__dirname, "..");
const cursorNodeDir =
  process.env.CURSOR_NODE_DIR ||
  "/Applications/Cursor.app/Contents/Resources/app/resources/helpers";
const cursorNode = path.join(cursorNodeDir, "node");

if (!fs.existsSync(cursorNode)) {
  console.warn(
    "[postinstall] Cursor node not found; skipping Cursor ABI rebuild. If MCP fails, run: npm run rebuild:cursor-mcp"
  );
  process.exit(0);
}

try {
  execSync("bash scripts/rebuild-for-cursor-mcp.sh", {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, CURSOR_NODE_DIR: cursorNodeDir },
  });
} catch (error) {
  console.warn(
    "[postinstall] Cursor ABI rebuild failed. MCP may fail until you run: npm run rebuild:cursor-mcp"
  );
}
