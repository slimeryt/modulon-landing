#!/bin/bash
set -euo pipefail

OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:1b}"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"

export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-24h}"
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-1}"

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

echo "[entrypoint] Warming model ${OLLAMA_MODEL} into RAM (can take 1–2 min on CPU)…"
curl -sf "http://${OLLAMA_HOST}/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${OLLAMA_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":false,\"options\":{\"num_ctx\":512,\"num_predict\":8}}" \
  || { echo "[entrypoint] Model warm-up failed — try a smaller OLLAMA_MODEL or more RAM." >&2; exit 1; }

echo "[entrypoint] Starting Modulon API…"
node server/chat-api.mjs
