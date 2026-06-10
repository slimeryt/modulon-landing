# Railway / Docker: Vite build + Node API + Ollama (Modulon M0.1)
# Pin Ollama 0.5.13 — install.sh pulls 0.30.x whose llama-server segfaults on Railway CPU.
FROM ollama/ollama:0.5.13 AS ollama

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 python3-pip curl ca-certificates zstd \
    libgomp1 libstdc++6 \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ollama /usr/bin/ollama /usr/bin/ollama
COPY --from=ollama /usr/lib/ollama /usr/lib/ollama

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY chatbot-ai/requirements-api.txt /tmp/requirements-api.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements-api.txt

COPY . .

RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV PYTHON=python3
ENV MODULON_BACKEND=ollama
ENV OLLAMA_BASE_URL=http://127.0.0.1:11434
ENV OLLAMA_MODEL=phi3:mini
ENV OLLAMA_HOST=127.0.0.1:11434
ENV OLLAMA_KEEP_ALIVE=24h
ENV OLLAMA_MAX_LOADED_MODELS=1
ENV OLLAMA_NUM_PARALLEL=1
ENV OLLAMA_VULKAN=0
ENV OLLAMA_LLM_LIBRARY=cpu_avx2

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 8080

CMD ["scripts/docker-entrypoint.sh"]
