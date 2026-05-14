# Modulon (landing + chat)

Vite + React frontend, Express chat API (`server/chat-api.mjs`), and `chatbot-ai/` for **terminal-only** training (`python src/train.py` in that folder).

## Local dev

```bash
npm install
npm run dev:all
```

- Site: [http://localhost:5181](http://localhost:5181)  
- API: default port **4310** (Vite proxies `/api` to it in dev; override with `API_PORT` in `.env`)

Copy `.env.example` to `.env` for local API port, Firebase, etc.

## Deploy: Cloudflare Pages (static frontend)

Pages builds the **React app** only (`npm run build` → `dist/`). It does **not** run Node, SQLite, or Python inference.

1. **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.**
2. **Build command:** `npm run build`  
   **Output directory:** `dist`  
   **Environment variables:** add all `VITE_FIREBASE_*` (and optionally `VITE_PUBLIC_API_ORIGIN` — see below). Pages exposes them at **build** time to Vite.
3. **`public/_redirects`** is included so deep links (`/chat`, `/login`, …) serve `index.html` (SPA fallback).

**Chat API on another host:** set **`VITE_PUBLIC_API_ORIGIN`** to the API origin with **no** trailing slash, e.g. `https://api.yourdomain.com`. The app will request `https://api.yourdomain.com/api/...`. That host must run `chat-api.mjs` (or a reverse proxy to it). Leave unset to keep same-origin **`/api`** (Docker or dev with proxy).

**Firebase:** add your Pages domain (and preview URL if needed) under **Firebase Console → Authentication → Settings → Authorized domains.**

## Deploy: full stack in Docker (optional)

The **`Dockerfile`** installs Python + `requirements-api.txt`, runs `npm run build`, then starts **`node server/chat-api.mjs`**, which serves **`/api/*`** and the SPA from **`dist/`** on one **`PORT`**. Suitable for Railway, Fly.io, a VPS, or “API only” behind a domain while Pages serves the UI.

- **Firebase:** set `VITE_FIREBASE_*` on the host; the server injects them into `index.html` at **runtime** so auth works even when the Docker build did not see those keys.
- **`API_HOST=0.0.0.0`** in the image; **`PORT`** is set by the platform.
- **SQLite:** set **`CHAT_DB_PATH`** and mount a volume for persistence.

## GitHub: transfer this repository

Short checklist (details in **[TRANSFER.md](./TRANSFER.md)**):

1. Disconnect **Railway** (and any other CI/deploy) from this repo if you do not want them to follow the transfer.
2. In GitHub: **Settings → General → Danger Zone → Transfer ownership** (recipient accepts).
3. Reconnect **Cloudflare Pages** (and any API host) to the repo at its **new** location.
4. Rotate secrets if the repo was ever public with mistakes.

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

## Repo layout

- `src/` — React app (`/`, `/chat`)
- `server/` — Express chat API (`chat-api.mjs`, `chat-db.mjs`)
- `public/` — static assets + `_redirects` for Pages/SPA
- `chatbot-ai/` — Python seq2seq (train in terminal; large artifacts gitignored)

## License

See [LICENSE](./LICENSE) (MIT).
