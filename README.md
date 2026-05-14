# Modulon (landing + chat)

Vite + React frontend, Express chat API, and `chatbot-ai/` for **terminal-only** training (`python src/train.py` in that folder).

## Local dev

```bash
npm install
npm run dev:all
```

- Site: [http://localhost:5181](http://localhost:5181)  
- API: default port **4310** (Vite proxies `/api` to it in dev; override with `API_PORT` in `.env`)

Copy `.env.example` to `.env` for local API port, Firebase, etc.

## Train the model

From `chatbot-ai/` (with your Python env and deps installed):

```bash
cd chatbot-ai
python -u src/train.py
```

**Use more RAM (e.g. 32 GB machine, ~25 GB budget):** defaults are already higher (`batch_size` 256, `max_pairs` 250k). To scale to a budget in GB:

```bash
set TRAIN_TARGET_RAM_GB=25
python -u src/train.py
```

(PowerShell: `$env:TRAIN_TARGET_RAM_GB=25`.) Overrides: `TRAIN_BATCH_SIZE`, `TRAIN_MAX_PAIRS`, `TRAIN_CPU_THREADS`, `TRAIN_NUM_WORKERS`, `TRAIN_PREFETCH_FACTOR`. GPU training is limited by **VRAM**, not system RAM—reduce batch if you get CUDA OOM.

Helpers from repo root: `npm run train:loop` (back‑to‑back runs, Ctrl+C to stop), or `npm run train:overnight` with `--at` / `--repeat-daily` (see `chatbot-ai/scripts/overnight_train.py`).

## Deploy on Railway (GitHub)

The repo includes a **`Dockerfile`** that:

1. Installs **Python 3** + **`requirements-api.txt`** (torch + transformers for inference).
2. Runs **`npm run build`** (Vite → `dist/`) then **`npm prune --omit=dev`**.
3. Starts **`node server/chat-api.mjs`**, which serves **`/api/*`** and the **React SPA** from **`dist/`** on the same **`PORT`**.

**Railway:** New Project → Deploy from GitHub → ensure the **Dockerfile** builder is used.

- **Firebase (`VITE_FIREBASE_*`):** add the same variables in Railway **Variables** (service env). The server injects them into `index.html` at **runtime**, so auth works even though `npm run build` in Docker does not see those keys. You still need **Firebase Console → Authentication → Settings → Authorized domains**: add your production host (e.g. `modulon.xyz`) and `*.railway.app` if you use the default URL.
- **`API_HOST=0.0.0.0`** is set in the image; **`PORT`** comes from Railway.
- **Python**: locally on Linux use `python3` or **`PYTHON`**. In the image, **`PYTHON=python3`** is set.
- **SQLite**: set **`CHAT_DB_PATH`** (e.g. `/app/data/chat.sqlite`) and mount a volume on **`/app/data`** for persistence.

## Repo layout

- `src/` — React app (`/`, `/chat`)
- `server/` — Express chat API (`chat-api.mjs`, `chat-db.mjs`)
- `chatbot-ai/` — Python seq2seq (train in terminal; large artifacts gitignored)
