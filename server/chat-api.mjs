/**
 * Modulon Chat API — Express + SQLite + Python inference bridge
 *
 * Routes:
 *   GET  /api/health
 *   GET  /api/chat/conversations
 *   POST /api/chat/conversations
 *   GET  /api/chat/conversations/:id/messages
 *   POST /api/chat/conversations/:id/messages   { role, body, prototype? }
 *   DEL  /api/chat/conversations/:id
 *   POST /api/chat   { message, conversationId?, external?, assistantReply? }
 *   Modulon M0.1 uses local Ollama (OLLAMA_MODEL) with GPT-2 fallback — see MODULON_BACKEND.
 *
 * Run:  node server/chat-api.mjs
 *       npm run dev:all   (Vite + API together)
 *
 * Production: if ../dist/index.html exists (after `npm run build`), the same server
 * serves the React SPA and `/api/*` (Railway / Docker single process).
 */

import cors      from 'cors';
import express   from 'express';
import Database  from 'better-sqlite3';
import { spawn } from 'child_process';
import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';
import dotenv    from 'dotenv';
import https from 'https';
import { createRequire } from 'module';

dotenv.config();

const _require = createRequire(import.meta.url);

// ── Firebase Admin (password reset link generation) ───────────────────────────
let adminAuth = null;
try {
  const { initializeApp, getApps, cert } = _require('firebase-admin');
  const { getAuth } = _require('firebase-admin/auth');
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey  = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';
  if (clientEmail && privateKey && projectId) {
    if (getApps().length === 0) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
    adminAuth = getAuth();
    console.log('[admin] Firebase Admin initialised.');
  } else {
    console.log('[admin] Firebase Admin skipped — set FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY, and FIREBASE_ADMIN_PROJECT_ID for password reset.');
  }
} catch (e) {
  console.warn('[admin] Firebase Admin not available:', e.message);
}

// ── Resend (email delivery) ───────────────────────────────────────────────────
let resendClient = null;
try {
  const { Resend } = _require('resend');
  if (process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
    console.log('[resend] Resend client ready.');
  }
} catch (e) {
  console.warn('[resend] Resend not available:', e.message);
}

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

// ── Firebase token verification (via Identity Toolkit REST API) ───────────────
const FIREBASE_API_KEY     = process.env.VITE_FIREBASE_API_KEY     || '';
const FIREBASE_PROJECT_ID  = process.env.VITE_FIREBASE_PROJECT_ID  || '';
const FIREBASE_CONFIGURED  = !!(FIREBASE_API_KEY && FIREBASE_PROJECT_ID);

// In-process cache: token string → { uid, expiresAt }
const _tokenCache = new Map();

/** Verifies a Firebase ID token via Google's Identity Toolkit and returns the UID. */
function verifyFirebaseToken(idToken) {
  const cached = _tokenCache.get(idToken);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.uid);

  return new Promise((resolve) => {
    const body = JSON.stringify({ idToken });
    const options = {
      hostname: 'identitytoolkit.googleapis.com',
      path:     `/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          const uid  = data.users?.[0]?.localId ?? null;
          if (uid) _tokenCache.set(idToken, { uid, expiresAt: Date.now() + 5 * 60 * 1000 });
          resolve(uid);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

/** Extracts the Bearer token from the Authorization header and verifies it. */
async function extractUserId(req) {
  const auth = req.headers['authorization'] ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  return verifyFirebaseToken(auth.slice(7));
}

// ── Express ───────────────────────────────────────────────────────────────────
const CORS_ORIGINS = (process.env.CORS_ORIGINS
  || 'https://modulon.xyz,https://www.modulon.xyz,http://localhost:5181,http://127.0.0.1:5181')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.includes(origin)) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    cb(null, false);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

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

// Migration: add user_id to existing databases
try { db.exec(`ALTER TABLE conversations ADD COLUMN user_id TEXT`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_convos_user ON conversations(user_id)`); } catch {}

const q = {
  listConvos:   db.prepare(`SELECT id,title,created_at,updated_at FROM conversations WHERE user_id IS ? ORDER BY updated_at DESC LIMIT 100`),
  getConvo:     db.prepare(`SELECT id,user_id FROM conversations WHERE id=?`),
  insertConvo:  db.prepare(`INSERT INTO conversations (id,title,user_id) VALUES (?,?,?)`),
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
    pythonProc.stdin.write(`${JSON.stringify({ message })}\n`);
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.post('/api/auth/send-reset-email', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!adminAuth) return res.status(503).json({ error: 'Password reset is not configured on this server. Set FIREBASE_ADMIN_* env vars.' });
  if (!resendClient) return res.status(503).json({ error: 'Email service is not configured. Set RESEND_API_KEY env var.' });
  try {
    const resetLink = await adminAuth.generatePasswordResetLink(email);
    const from = process.env.RESEND_FROM || 'Modulon <noreply@modulon.app>';
    await resendClient.emails.send({
      from,
      to: email,
      subject: 'Reset your Modulon password',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0b;color:#fff;border-radius:16px">
          <img src="https://modulon.app/icon-512.png" width="48" height="48" alt="Modulon" style="margin-bottom:24px;border-radius:10px" />
          <h1 style="font-size:22px;font-weight:600;margin:0 0 8px">Reset your password</h1>
          <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:15px;line-height:1.6">
            We received a request to reset your Modulon password for <strong style="color:#fff">${email}</strong>.
            Click the button below — it expires in 1 hour.
          </p>
          <a href="${resetLink}" style="display:inline-block;background:#fff;color:#000;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;text-decoration:none;margin-bottom:28px">
            Reset password
          </a>
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0">
            If you didn't request this, you can ignore this email. Your password won't change.
          </p>
        </div>`,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[reset-email]', err);
    return res.status(500).json({ error: err.message || 'Failed to send reset email.' });
  }
});

app.get('/api/health', async (_req, res) => {
  let ollamaReady = null;
  if (MODULON_BACKEND === 'ollama' || MODULON_BACKEND === 'ollama-first') {
    try {
      const r = await fetch(`${resolveOllamaBase()}/api/tags`, { signal: AbortSignal.timeout(5000) });
      ollamaReady = r.ok;
    } catch {
      ollamaReady = false;
    }
  }
  const modelReady =
    MODULON_BACKEND === 'python' ? pythonReady
    : MODULON_BACKEND === 'ollama' ? ollamaReady
    : ollamaReady || pythonReady;

  res.json({
    ok: true,
    modelReady,
    modulonBackend: MODULON_BACKEND,
    ollamaModel: MODULON_OLLAMA_MODEL,
    ollamaReady,
  });
});

app.get('/api/chat/conversations', async (req, res) => {
  const uid = await extractUserId(req);
  if (FIREBASE_CONFIGURED && !uid) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ conversations: q.listConvos.all(uid ?? null) });
});

app.post('/api/chat/conversations', async (req, res) => {
  const uid = await extractUserId(req);
  if (FIREBASE_CONFIGURED && !uid) return res.status(401).json({ error: 'Unauthorized' });
  const id = crypto.randomUUID();
  q.insertConvo.run(id, 'New Chat', uid ?? null);
  res.json({ id });
});

app.get('/api/chat/conversations/:id/messages', async (req, res) => {
  const uid = await extractUserId(req);
  if (FIREBASE_CONFIGURED && !uid) return res.status(401).json({ error: 'Unauthorized' });
  const convo = q.getConvo.get(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Not found' });
  if (FIREBASE_CONFIGURED && uid && convo.user_id && convo.user_id !== uid)
    return res.status(403).json({ error: 'Forbidden' });
  res.json({ messages: q.listMessages.all(req.params.id) });
});

app.delete('/api/chat/conversations/:id', async (req, res) => {
  const uid = await extractUserId(req);
  if (FIREBASE_CONFIGURED && !uid) return res.status(401).json({ error: 'Unauthorized' });
  const convo = q.getConvo.get(req.params.id);
  if (convo && FIREBASE_CONFIGURED && uid && convo.user_id && convo.user_id !== uid)
    return res.status(403).json({ error: 'Forbidden' });
  q.deleteConvo.run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/chat/conversations/:id/messages', async (req, res) => {
  const uid = await extractUserId(req);
  if (FIREBASE_CONFIGURED && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const convo = q.getConvo.get(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Not found' });
  if (FIREBASE_CONFIGURED && uid && convo.user_id && convo.user_id !== uid)
    return res.status(403).json({ error: 'Forbidden' });

  const { role, body, prototype } = req.body ?? {};
  if (!body?.trim()) return res.status(400).json({ error: 'Empty message' });
  if (role !== 'user' && role !== 'assistant')
    return res.status(400).json({ error: 'Invalid role' });

  const countBefore = q.msgCount.get(req.params.id).n;
  q.insertMsg.run(crypto.randomUUID(), req.params.id, role, body, prototype ? 1 : 0);
  q.touchConvo.run(req.params.id);

  if (countBefore === 0 && role === 'user') {
    q.updateTitle.run(body.slice(0, 60), req.params.id);
  }

  res.json({ ok: true });
});

function defaultModulonBackend() {
  if (process.env.MODULON_BACKEND) return process.env.MODULON_BACKEND.toLowerCase();
  if (process.env.RAILWAY_ENVIRONMENT) return 'ollama';
  return 'ollama-first';
}

function defaultOllamaModel() {
  if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL;
  if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') return 'phi3:mini';
  return 'llama3.1:8b';
}

const MODULON_LANG_LABELS = {
  en: 'English',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
};

function modulonLangBase(langCode) {
  return String(langCode || 'en').split('-')[0].toLowerCase();
}

function modulonLangLabel(langCode) {
  return MODULON_LANG_LABELS[modulonLangBase(langCode)] || MODULON_LANG_LABELS.en;
}

function modulonSystemPrompt(langCode = 'en') {
  if (process.env.MODULON_SYSTEM_PROMPT) return process.env.MODULON_SYSTEM_PROMPT;
  const label = modulonLangLabel(langCode);
  return (
    `You are Modulon, the built-in assistant for the Modulon app.\n` +
    `CRITICAL: The user's app language is ${label}. Every reply MUST be written entirely in ${label}.\n` +
    `Do NOT reply in Chinese, Russian, Japanese, or any other language unless the user's latest message is clearly written in that language.\n` +
    `Do not mention OpenAI, Anthropic, Ollama, Phi, or other AI brands.`
  );
}

/** Inference-only nudge for small models; not stored in chat history. */
function modulonOllamaUserTurn(message, langCode = 'en') {
  const label = modulonLangLabel(langCode);
  return `${message}\n\n(Important: write your entire reply in ${label} only.)`;
}

const MODULON_OLLAMA_MODEL = defaultOllamaModel();
const MODULON_BACKEND = defaultModulonBackend();

function resolveOllamaBase(url) {
  const raw = (url || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/$/, '');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid Ollama URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Ollama URL must use http or https.');
  }
  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
  if (process.env.OLLAMA_ALLOWED_HOST) localHosts.add(process.env.OLLAMA_ALLOWED_HOST.toLowerCase());
  if (!localHosts.has(host)) {
    throw new Error('Ollama URL must point to this machine (127.0.0.1 or localhost).');
  }
  return raw;
}

function convoHistoryRows(convId) {
  return q.listMessages.all(convId)
    .slice(0, -1)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.body }));
}

async function chatOllama({ message, model, history = [], systemPrompt, baseUrl }) {
  const ollamaBase = resolveOllamaBase(baseUrl);
  const chatMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...history,
    { role: 'user', content: message },
  ];
  const r = await fetch(`${ollamaBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      stream: false,
      options: {
        num_ctx: Number(process.env.OLLAMA_NUM_CTX || 2048),
        num_predict: Number(process.env.OLLAMA_NUM_PREDICT || 512),
      },
    }),
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || 180_000)),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data);
    throw new Error(detail || `Ollama error ${r.status}`);
  }
  return {
    text: data.message?.content ?? '',
    inputTokens: data.prompt_eval_count ?? 0,
    outputTokens: data.eval_count ?? 0,
  };
}

/** Modulon M0.1 — uses local Ollama by default; falls back to the GPT-2 bridge. */
async function askModulon(message, history = [], langCode = 'en') {
  if (MODULON_BACKEND === 'python') {
    return { reply: await askPython(message), proto: false };
  }

  if (MODULON_BACKEND === 'ollama' || MODULON_BACKEND === 'ollama-first') {
    try {
      const { text } = await chatOllama({
        message: modulonOllamaUserTurn(message, langCode),
        model: MODULON_OLLAMA_MODEL,
        history,
        systemPrompt: modulonSystemPrompt(langCode),
      });
      return { reply: text || '…', proto: false };
    } catch (err) {
      console.error('[modulon] Ollama error:', err.message);
      if (MODULON_BACKEND === 'ollama') {
        return { reply: `⚠ Modulon is temporarily unavailable. (${err.message})`, proto: true };
      }
      console.warn('[modulon] Ollama unavailable, falling back to GPT-2:', err.message);
    }
  }

  try {
    return { reply: await askPython(message), proto: false };
  } catch (err) {
    return { reply: `⚠ ${err.message}`, proto: true };
  }
}

app.post('/api/chat', async (req, res) => {
  try {
    const uid = await extractUserId(req);
    if (FIREBASE_CONFIGURED && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const { message, conversationId, assistantReply, external, language } = req.body ?? {};
    if (!message?.trim()) return res.status(400).json({ error: 'Empty message' });

    let convId = conversationId;
    if (!convId) {
      convId = crypto.randomUUID();
      q.insertConvo.run(convId, message.slice(0, 60), uid ?? null);
    } else {
      const convo = q.getConvo.get(convId);
      if (convo && FIREBASE_CONFIGURED && uid && convo.user_id && convo.user_id !== uid)
        return res.status(403).json({ error: 'Forbidden' });
    }

    q.insertMsg.run(crypto.randomUUID(), convId, 'user', message, 0);

    if (q.msgCount.get(convId).n === 1) {
      q.updateTitle.run(message.slice(0, 60), convId);
    }

    if (external && assistantReply?.trim()) {
      q.insertMsg.run(crypto.randomUUID(), convId, 'assistant', assistantReply, 0);
      q.touchConvo.run(convId);
      return res.json({ conversationId: convId, response: assistantReply });
    }

    const history = convoHistoryRows(convId);
    const { reply, proto } = await askModulon(message, history, language || 'en');

    q.insertMsg.run(crypto.randomUUID(), convId, 'assistant', reply, proto ? 1 : 0);
    q.touchConvo.run(convId);

    res.json({ conversationId: convId, response: reply });
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
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
if (MODULON_BACKEND !== 'ollama') startPython();
console.log(`[modulon] M0.1 backend: ${MODULON_BACKEND}, ollama model: ${MODULON_OLLAMA_MODEL}`);
const server = app.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${PORT}`;
  console.log(`\nModulon API → ${base}/api/health`);
  if (SERVE_SPA) console.log(`Modulon app  → ${base}/`);
  else console.log('(No dist/index.html — run `npm run build` to serve the SPA from this process.)');
  console.log('');
});
// Ollama on CPU can take a few minutes on first reply.
server.timeout = 300_000;
server.keepAliveTimeout = 310_000;
