#!/usr/bin/env bash
# Start the CBZ churn API and staff screen.
# Uses 8000 and 5173, or the next free port when those are already taken.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required to start the staff screen."
  exit 1
fi

python3 scripts/ensure_env.py

port_is_free() {
  .venv/bin/python -c 'import socket, sys
port = int(sys.argv[1])
probe = socket.socket()
probe.settimeout(0.2)
try:
    if probe.connect_ex(("127.0.0.1", port)) == 0:
        sys.exit(1)
finally:
    probe.close()
listener = socket.socket()
listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    listener.bind(("127.0.0.1", port))
except OSError:
    sys.exit(1)
finally:
    listener.close()' "$1"
}

next_free_port() {
  local port="$1"
  local limit=$((port + 20))
  while ! port_is_free "$port"; do
    port=$((port + 1))
    if (( port > limit )); then
      echo "No free port found from $1 to $limit." >&2
      exit 1
    fi
  done
  echo "$port"
}

API_PORT="$(next_free_port 8000)"
UI_PORT="$(next_free_port 5173)"

if [[ "$API_PORT" != "8000" ]]; then
  echo "Port 8000 is in use. The API will use $API_PORT."
fi
if [[ "$UI_PORT" != "5173" ]]; then
  echo "Port 5173 is in use. The staff screen will use $UI_PORT."
fi

if ! (cd frontend && node --input-type=module -e "import 'vite'" >/dev/null 2>&1); then
  echo "Frontend packages do not match this operating system. Reinstalling them."
  rm -rf frontend/node_modules
  (cd frontend && npm install)
fi

API_PID=""
UI_PID=""
kill_tree() {
  local pid="$1"
  local child
  [[ -n "$pid" ]] || return 0
  for child in $(ps -o pid= --ppid "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  kill_tree "$UI_PID"
  kill_tree "$API_PID"
}
trap cleanup EXIT INT TERM

.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port "$API_PORT" &
API_PID=$!

ready=0
i=0
while (( i < 40 )); do
  i=$((i + 1))
  if .venv/bin/python -c 'import sys, urllib.request
try:
    urllib.request.urlopen(sys.argv[1], timeout=1)
except Exception:
    sys.exit(1)' "http://127.0.0.1:${API_PORT}/api/health"; then
    ready=1
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "The API stopped while starting."
    exit 1
  fi
  sleep 0.25
done
if [[ "$ready" != "1" ]]; then
  echo "The API did not become ready on port $API_PORT."
  exit 1
fi

(
  cd frontend
  CBZ_API_PORT="$API_PORT" CBZ_UI_PORT="$UI_PORT" npm run dev -- --host 127.0.0.1 --port "$UI_PORT" --strictPort
) &
UI_PID=$!

echo ""
echo "CBZ churn worklist: http://127.0.0.1:${UI_PORT}"
echo "API:                http://127.0.0.1:${API_PORT}/api/health"
echo "Press Ctrl+C to stop both."
echo ""

wait "$UI_PID"
