#!/usr/bin/env bash
# Self-healing Cursor MCP launcher:
# - validates better-sqlite3 against Cursor's Node ABI
# - auto-rebuilds if mismatch is detected
# - then starts MCP stdio
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CURSOR_NODE_DIR="${CURSOR_NODE_DIR:-/Applications/Cursor.app/Contents/Resources/app/resources/helpers}"
if [[ -x "$CURSOR_NODE_DIR/node" ]]; then
  NODE_BIN="$CURSOR_NODE_DIR/node"
else
  NODE_BIN="$(command -v node)"
fi

if [[ -z "${NODE_BIN:-}" || ! -x "$NODE_BIN" ]]; then
  echo "Node runtime not found. Install Node or set CURSOR_NODE_DIR." >&2
  exit 1
fi

ensure_sqlite_abi() {
  if "$NODE_BIN" -e "require('better-sqlite3')" >/dev/null 2>&1; then
    return 0
  fi

  echo "better-sqlite3 ABI mismatch detected. Rebuilding for Cursor MCP runtime..." >&2
  bash "$ROOT/scripts/rebuild-for-cursor-mcp.sh"

  if ! "$NODE_BIN" -e "require('better-sqlite3')" >/dev/null 2>&1; then
    echo "better-sqlite3 still failed to load after rebuild." >&2
    exit 1
  fi
}

if [[ "${1:-}" == "--check-only" ]]; then
  ensure_sqlite_abi
  echo "MCP preflight OK (better-sqlite3 loads with $("$NODE_BIN" -p "process.version + ' ABI ' + process.versions.modules") )."
  exit 0
fi

ensure_sqlite_abi
exec "$NODE_BIN" "$ROOT/dist/mcp-stdio.js"
