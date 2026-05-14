# Railway / Docker: Vite build + Node API + Python inference (GPT-2)
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
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

EXPOSE 8080

CMD ["node", "server/chat-api.mjs"]
