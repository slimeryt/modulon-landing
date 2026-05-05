# Modulon (landing + admin + chat)

Vite + React frontend, Express train/chat API, optional `chatbot-ai` Python training stack.

## Local dev

```bash
npm install
npm run dev:all
```

- Site: [http://localhost:5181](http://localhost:5181)  
- Train API: port **5182** (proxied as `/api` in dev)

Copy `.env.example` to `.env` if you use `ADMIN_TRAIN_SECRET` / `VITE_ADMIN_TRAIN_SECRET`.

## Deploy on Railway (GitHub)

1. Create a **new empty repository** on GitHub and push **only this folder** as the repo root (not your whole user directory). From this directory:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```

2. In [Railway](https://railway.app): **New Project** → **Deploy from GitHub** → pick the repo.

3. Railway will run **`npm install`**, **`npm run build`**, then **`npm start`**.  
   The server listens on **`PORT`**, serves the built SPA from `dist/`, and mounts **`/api`** on the same host (no CORS issues).

4. **Environment variables** (optional but recommended for production):

   | Variable | When |
   |----------|------|
   | `ADMIN_TRAIN_SECRET` | Random string; secures `/api/train/*` and `/api/chat/*` |
   | `VITE_ADMIN_TRAIN_SECRET` | **Same value**; must be set at **build** time so the admin/chat UI sends the header |

   In Railway, add both under **Variables**. Trigger a **redeploy** after changing `VITE_*` so the client rebuilds.

5. **SQLite** (`data/chat.sqlite`) lives on the container filesystem by default. For durable chat history across deploys, add a **Railway volume** mounted at `/app/data` (or your service root + `data`) and keep `CHAT_DB_PATH` consistent (default: `data/chat.sqlite` under the project root).

6. **Training** (`chatbot-ai`, PyTorch, GPU) is not required for the deployed site prototype; training is intended to run locally or on a GPU box. Do not expose train endpoints publicly without `ADMIN_TRAIN_SECRET`.

## Repo layout

- `src/` — React app (`/`, `/admin`, `/chat`)
- `server/` — Express API (`train-api.mjs`, `chat-db.mjs`)
- `chatbot-ai/` — Python seq2seq project (train locally; large artifacts are gitignored)
