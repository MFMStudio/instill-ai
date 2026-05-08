#!/usr/bin/env bash
# Rebuild better-sqlite3 for the Node runtime Cursor MCP uses.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CURSOR_NODE_DIR="${CURSOR_NODE_DIR:-/Applications/Cursor.app/Contents/Resources/app/resources/helpers}"
if [[ ! -x "$CURSOR_NODE_DIR/node" ]]; then
  echo "Cursor Node not found at $CURSOR_NODE_DIR/node" >&2
  echo "Set CURSOR_NODE_DIR to the folder containing Cursor's node binary." >&2
  exit 1
fi

export PATH="$CURSOR_NODE_DIR:$PATH"
npm rebuild better-sqlite3
