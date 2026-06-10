# Railway / Docker: Vite build + Node API + Ollama (Modulon M0.1)
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 python3-pip curl ca-certificates zstd \
    libgomp1 libstdc++6 \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && curl -fsSL https://ollama.com/install.sh | sh \
  && rm -rf /var/lib/apt/lists/*

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
# Modulon M0.1 — 1b fits ~8 GB Railway RAM; use llama3.2:3b only with 16 GB+.
ENV MODULON_BACKEND=ollama
ENV OLLAMA_BASE_URL=http://127.0.0.1:11434
ENV OLLAMA_MODEL=llama3.2:1b
ENV OLLAMA_HOST=127.0.0.1:11434
ENV OLLAMA_KEEP_ALIVE=24h
ENV OLLAMA_MAX_LOADED_MODELS=1
ENV OLLAMA_NUM_PARALLEL=1
# CPU-only Railway hosts — Vulkan init can segfault llama-server.
ENV OLLAMA_VULKAN=0

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 8080

CMD ["scripts/docker-entrypoint.sh"]
