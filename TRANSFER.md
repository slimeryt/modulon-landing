# Repository transfer & Cloudflare migration

Use this when moving the GitHub repo to another account/org and/or switching hosting from Railway to Cloudflare.

## Before you transfer (GitHub)

1. **Decide who receives the repo** (user or org must exist and accept the transfer).
2. **Remove or update deploy integrations** tied to the old owner:
   - **Railway:** delete the service or disconnect it from this repository so the new owner does not inherit surprise deploys.
   - **Cloudflare Pages:** after transfer, reconnect the project to the repo under its **new** URL (GitHub redirects clones, but integrations should be re-linked).
3. **Secrets:** assume anything ever committed to git may be copied with the repo. Rotate **Firebase** keys if unsure; update **Google OAuth** client allowed origins if you use Google sign-in.
4. **Firebase Authentication → Authorized domains:** after the site lives on a new domain, add the new host(s) and remove obsolete ones.

## Transfer the repository (GitHub)

1. On GitHub: **Settings → General → Danger Zone → Transfer ownership**.
2. Follow the prompts (recipient must accept).
3. Update local remotes: `git remote set-url origin https://github.com/NEW_OWNER/NEW_REPO.git` (or use the URL GitHub shows after transfer).

## Cloudflare Pages (frontend only)

Cloudflare Pages serves **static files** from `dist/`. It does **not** run the Node chat API, Python inference, or SQLite from this repo.

1. **Create a Pages project** → Connect Git → pick the repo (after transfer, under the new owner).
2. **Build settings**
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (repository root)
3. **Environment variables (Production + Preview as needed)**  
   Set all `VITE_FIREBASE_*` values here (Pages injects them at **build** time).  
   If the chat API runs on another host, set **`VITE_PUBLIC_API_ORIGIN`** to that origin with **no** trailing slash, e.g. `https://api.example.com` (see README).
4. **`public/_redirects`** is already in the repo so client-side routes (`/chat`, `/login`, …) resolve after refresh.
5. **Custom domain:** attach your domain in Cloudflare DNS/Pages; add the same domain under Firebase authorized domains.

## Where to run the chat API

Keep **`server/chat-api.mjs`** (Dockerfile or plain Node) on any host that supports **Node 20**, **Python 3** + `chatbot-ai/requirements-api.txt`, and persistent disk if you use SQLite (`CHAT_DB_PATH`). Examples: a small VPS, Fly.io, Render, or a retained Railway service **only for the API**, while Pages serves the UI.

When the API is on a **different origin** than the Pages site, **`VITE_PUBLIC_API_ORIGIN`** must be set at **build** time on Pages so the browser can call the API (CORS is already permissive on `chat-api.mjs` for development; tighten for production if you want).
