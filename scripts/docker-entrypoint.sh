#!/bin/bash
set -euo pipefail

OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:3b}"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"

cleanup() {
  kill "$OLLAMA_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[entrypoint] Starting Ollama (${OLLAMA_HOST})…"
ollama serve &
OLLAMA_PID=$!
sleep 1

echo "[entrypoint] Waiting for Ollama API…"
for _ in $(seq 1 90); do
  if curl -sf "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
  echo "[entrypoint] Ollama did not become ready in time." >&2
  exit 1
fi

echo "[entrypoint] Pulling model ${OLLAMA_MODEL} (first deploy can take several minutes)…"
ollama pull "$OLLAMA_MODEL"

echo "[entrypoint] Starting Modulon API…"
node server/chat-api.mjs
