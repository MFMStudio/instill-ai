#!/usr/bin/env bash
# AI Consistency — start (or restart) the local web server.
# Usage:
#   • Double-click this file in Finder (opens Terminal).
#   • Or drag this file into Terminal and press Enter.
# Default: frees port 3500, runs `npm run build` then `npm start`.
# For faster iteration on TypeScript only, change the last line to: exec npm run dev

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3500}"
if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
  echo "Stopping existing process on port ${PORT}..."
  lsof -ti "tcp:${PORT}" | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

echo "Building..."
npm run build

echo ""
echo "Starting AI Consistency → http://localhost:${PORT}"
echo "Press Ctrl+C to stop."
echo ""

exec npm start
