#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/src/backend"
FRONTEND_DIR="$ROOT/src/frontend"
ENV_FILE="$ROOT/.env"

load_environment() {
  [[ -f "$ENV_FILE" ]] || return

  while IFS='=' read -r key value; do
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ -n "$key" && "${key:0:1}" != "#" ]] || continue
    [[ "$key" == "NEIS_API_KEY" || "$key" == "NEIS_BASE_URL" ]] || continue
    [[ -z "${!key:-}" ]] || continue

    value="${value%$'\r'}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    export "$key=$value"
  done < "$ENV_FILE"
}

load_environment

if [[ -z "${NEIS_API_KEY:-}" || "$NEIS_API_KEY" == "replace-with-your-neis-api-key" ]]; then
  echo "Set NEIS_API_KEY in .env before starting the app." >&2
  exit 1
fi

PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 &&
    "$candidate" -c "import sys; raise SystemExit(sys.version_info < (3, 11))" 2>/dev/null; then
    PYTHON="$candidate"
    break
  fi
done

if [[ -z "$PYTHON" ]]; then
  echo "Python 3.11 or newer is required." >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || {
  echo "Node.js 24 is required." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "npm is required." >&2
  exit 1
}

if ! "$PYTHON" -c "import fastapi, httpx, pydantic_settings, uvicorn" 2>/dev/null; then
  echo "Installing backend dependencies..."
  "$PYTHON" -m pip install -e "$BACKEND_DIR"
fi

VITE_ENTRY="$FRONTEND_DIR/node_modules/vite/bin/vite.js"
if [[ ! -f "$VITE_ENTRY" ]]; then
  echo "Installing frontend dependencies..."
  npm ci --prefix "$FRONTEND_DIR"
fi

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  trap - EXIT INT TERM
  [[ -z "$FRONTEND_PID" ]] || kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -z "$BACKEND_PID" ]] || kill "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$FRONTEND_PID" ]] || wait "$FRONTEND_PID" 2>/dev/null || true
  [[ -z "$BACKEND_PID" ]] || wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting API at http://127.0.0.1:8000"
"$PYTHON" -m uvicorn app.main:app \
  --app-dir "$BACKEND_DIR" \
  --host 127.0.0.1 \
  --port 8000 &
BACKEND_PID=$!

echo "Starting app at http://127.0.0.1:5173"
node "$VITE_ENTRY" "$FRONTEND_DIR" --host 127.0.0.1 --port 5173 &
FRONTEND_PID=$!

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  wait "$BACKEND_PID"
else
  wait "$FRONTEND_PID"
fi
