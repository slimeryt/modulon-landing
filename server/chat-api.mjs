/**
 * Modulon Chat API — Express + SQLite + Python inference bridge
 *
 * Routes:
 *   GET  /api/health
 *   GET  /api/chat/conversations
 *   POST /api/chat/conversations
 *   GET  /api/chat/conversations/:id/messages
 *   DEL  /api/chat/conversations/:id
 *   POST /api/chat   { message, conversationId? }
 *
 * Run:  node server/chat-api.mjs
 *       npm run dev:all   (Vite + API together)
 *
 * Production: if ../dist/index.html exists (after `npm run build`), the same server
 * serves the React SPA and `/api/*` (Railway / Docker single process).
 */

import express   from 'express';
import Database  from 'better-sqlite3';
import { spawn } from 'child_process';
import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';
import dotenv    from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
/** Default avoids Windows Hyper-V excluded ranges that often block low ports (e.g. 3001). Override with API_PORT in `.env`. */
const DEFAULT_PORT = 4310;
/** Railway / Render set `PORT`; local dev often uses `API_PORT`. */
const PORT      = Number(process.env.PORT || process.env.API_PORT || DEFAULT_PORT);
/**
 * Bind address. Default 127.0.0.1 for local Windows safety.
 * Docker / Railway: set API_HOST=0.0.0.0 (see repo Dockerfile).
 */
const HOST      = process.env.API_HOST || '127.0.0.1';

/** Python executable for the inference subprocess (Linux images usually have `python3` only). */
function pythonExecutable() {
  if (process.env.PYTHON) return process.env.PYTHON;
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === 'win32' ? 'python' : 'python3';
}
const DB_PATH   = process.env.CHAT_DB_PATH
  || path.join(ROOT, 'chatbot-ai', 'chat.db');

const DIST_DIR   = path.join(ROOT, 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');
const SERVE_SPA  = fs.existsSync(INDEX_HTML);

/**
 * Web Firebase keys — Vite only inlines these at `vite build` if present in the build env.
 * Railway/Docker often injects secrets at **runtime** only, so we embed them into `index.html`
 * when serving the SPA (see SPA_INDEX_HTML below).
 */
function firebaseWebConfigFromEnv() {
  return {
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
  };
}

function firebaseWebConfigComplete(c) {
  return !!(c.apiKey && c.authDomain && c.projectId && c.appId);
}

/** @type {string | null} */
let SPA_INDEX_HTML = null;
if (SERVE_SPA) {
  const raw = fs.readFileSync(INDEX_HTML, 'utf8');
  const fb = firebaseWebConfigFromEnv();
  const payload = firebaseWebConfigComplete(fb) ? fb : null;
  const inject = `<script>window.__MODULON_FIREBASE__=${JSON.stringify(payload)};</script>`;
  SPA_INDEX_HTML = raw.includes('<head>')
    ? raw.replace('<head>', `<head>\n    ${inject}\n`)
    : `${inject}${raw}`;
  if (firebaseWebConfigComplete(fb)) {
    console.log('[spa] Firebase web config injected into HTML from process.env (runtime).');
  } else {
    console.log('[spa] No VITE_FIREBASE_* in env — Firebase disabled until you set them on the host.');
  }
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── SQLite ────────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('user','assistant')),
    body            TEXT NOT NULL,
    prototype       INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);

const q = {
  listConvos:   db.prepare(`SELECT id,title,created_at,updated_at FROM conversations ORDER BY updated_at DESC LIMIT 100`),
  insertConvo:  db.prepare(`INSERT INTO conversations (id,title) VALUES (?,?)`),
  deleteConvo:  db.prepare(`DELETE FROM conversations WHERE id=?`),
  listMessages: db.prepare(`SELECT id,role,body,prototype,created_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC`),
  insertMsg:    db.prepare(`INSERT INTO messages (id,conversation_id,role,body,prototype) VALUES (?,?,?,?,?)`),
  msgCount:     db.prepare(`SELECT COUNT(*) as n FROM messages WHERE conversation_id=?`),
  updateTitle:  db.prepare(`UPDATE conversations SET title=? WHERE id=?`),
  touchConvo:   db.prepare(`UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?`),
};

// ── Python inference bridge ───────────────────────────────────────────────────
let pythonProc   = null;
let pendingQueue = [];
let stdoutBuf    = '';
let pythonReady  = false;

function startPython() {
  const script = path.join(ROOT, 'chatbot-ai', 'gpt2', 'api_server.py');
  const cwd    = path.join(ROOT, 'chatbot-ai');
  const py     = pythonExecutable();

  console.log(`[python] Starting inference server (${py})…`);
  pythonProc = spawn(py, [script], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

  pythonProc.on('error', (err) => {
    console.error('[python] Failed to spawn:', err.message);
    console.error(`[python] Fix: install Python 3, or set PYTHON to the interpreter path (e.g. PYTHON=python3).`);
    pythonReady = false;
    pythonProc = null;
  });

  pythonProc.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.status === 'ready') {
        pythonReady = true;
        console.log('[python] Model ready ✓');
        continue;
      }
      const pending = pendingQueue.shift();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(obj.response ?? '…');
      }
    }
  });

  pythonProc.stderr.on('data', (d) => process.stderr.write('[python] ' + d));
  pythonProc.on('exit', (code) => {
    console.log(`[python] Exited (code ${code})`);
    pythonReady = false;
    pythonProc  = null;
    for (const p of pendingQueue) { clearTimeout(p.timer); p.reject(new Error('Python exited')); }
    pendingQueue = [];
  });
}

function askPython(message) {
  return new Promise((resolve, reject) => {
    if (!pythonProc || !pythonReady) {
      return reject(new Error('Model not ready — wait for inference to start or check server logs.'));
    }
    const timer = setTimeout(() => {
      pendingQueue = pendingQueue.filter((p) => p.resolve !== resolve);
      reject(new Error('Inference timed out (30s)'));
    }, 30_000);
    pendingQueue.push({ resolve, reject, timer });
    pythonProc.stdin.write(JSON.stringify({ message }) + '\n');
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, modelReady: pythonReady });
});

app.get('/api/chat/conversations', (_req, res) => {
  res.json({ conversations: q.listConvos.all() });
});

app.post('/api/chat/conversations', (_req, res) => {
  const id = crypto.randomUUID();
  q.insertConvo.run(id, 'New Chat');
  res.json({ id });
});

app.get('/api/chat/conversations/:id/messages', (req, res) => {
  res.json({ messages: q.listMessages.all(req.params.id) });
});

app.delete('/api/chat/conversations/:id', (req, res) => {
  q.deleteConvo.run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  const { message, conversationId } = req.body ?? {};
  if (!message?.trim()) return res.status(400).json({ error: 'Empty message' });

  let convId = conversationId;
  if (!convId) {
    convId = crypto.randomUUID();
    q.insertConvo.run(convId, message.slice(0, 60));
  }

  q.insertMsg.run(crypto.randomUUID(), convId, 'user', message, 0);

  if (q.msgCount.get(convId).n === 1) {
    q.updateTitle.run(message.slice(0, 60), convId);
  }

  let reply;
  let proto = false;
  try {
    reply = await askPython(message);
  } catch (err) {
    reply = `⚠ ${err.message}`;
    proto = true;
  }

  q.insertMsg.run(crypto.randomUUID(), convId, 'assistant', reply, proto ? 1 : 0);
  q.touchConvo.run(convId);

  res.json({ conversationId: convId, response: reply });
});

// ── Static SPA (production: `dist/` next to this file’s project root) ─────────
if (SERVE_SPA) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET') return next();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(SPA_INDEX_HTML);
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
startPython();
app.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${PORT}`;
  console.log(`\nModulon API → ${base}/api/health`);
  if (SERVE_SPA) console.log(`Modulon app  → ${base}/`);
  else console.log('(No dist/index.html — run `npm run build` to serve the SPA from this process.)');
  console.log('');
});
