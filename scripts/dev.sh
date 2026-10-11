#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python ]]; then
  echo 'First run: python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt'
  exit 1
fi
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
backend_pid=$!
cleanup() { kill "$backend_pid" "${frontend_pid:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
npm run dev &
frontend_pid=$!
wait "$backend_pid" "$frontend_pid"
