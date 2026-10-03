#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== backend =="
(cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest -q)

echo "== frontend =="
(cd frontend && npm run lint && npm run format:check && npm test && npm run build)
