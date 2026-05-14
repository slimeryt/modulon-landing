# Modulon (landing + chat)

Vite + React frontend, Express chat API, and `chatbot-ai/` for **terminal-only** training (`python src/train.py` in that folder).

## Local dev

```bash
npm install
npm run dev:all
```

- Site: [http://localhost:5181](http://localhost:5181)  
- API: port **5182** (Vite proxies `/api` in dev)

Copy `.env.example` to `.env` if you use `ADMIN_TRAIN_SECRET` / `VITE_ADMIN_TRAIN_SECRET` for `/api/chat`.

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

1. **New Project** → **Deploy from GitHub** → pick the repo.
2. Railway runs **`npm install`**, **`npm run build`**, **`npm start`**. The app serves the SPA from `dist/` and **`/api`** on the same host.
3. **Variables** (optional): `ADMIN_TRAIN_SECRET` and matching `VITE_ADMIN_TRAIN_SECRET` for chat; redeploy after changing `VITE_*`.
4. **SQLite**: default on Railway is `/app/data/chat.sqlite` when `RAILWAY_ENVIRONMENT` is set; mount a volume at `/app/data` for persistence.

## Repo layout

- `src/` — React app (`/`, `/chat`)
- `server/` — Express API (`train-api.mjs`, `chat-db.mjs`)
- `chatbot-ai/` — Python seq2seq (train in terminal; large artifacts gitignored)
