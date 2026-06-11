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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
try { db.exec(`ALTER TABLE messages ADD COLUMN input_tokens INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN output_tokens INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE conversations ADD COLUMN memory_enabled INTEGER NOT NULL DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN thinking TEXT`); } catch {}

const q = {
  listConvos:   db.prepare(`SELECT id,title,created_at,updated_at,COALESCE(memory_enabled,1) AS memory_enabled FROM conversations WHERE user_id IS ? ORDER BY updated_at DESC LIMIT 100`),
  getConvo:     db.prepare(`SELECT id,user_id,COALESCE(memory_enabled,1) AS memory_enabled FROM conversations WHERE id=?`),
  insertConvo:  db.prepare(`INSERT INTO conversations (id,title,user_id,memory_enabled) VALUES (?,?,?,?)`),
  updateConvoMemory: db.prepare(`UPDATE conversations SET memory_enabled=? WHERE id=?`),
  deleteConvo:  db.prepare(`DELETE FROM conversations WHERE id=?`),
  listMessages: db.prepare(`SELECT id,role,body,prototype,created_at,input_tokens,output_tokens,thinking FROM messages WHERE conversation_id=? ORDER BY created_at ASC`),
  insertMsg:    db.prepare(`INSERT INTO messages (id,conversation_id,role,body,prototype,input_tokens,output_tokens,thinking) VALUES (?,?,?,?,?,?,?,?)`),
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

app.patch('/api/chat/conversations/:id', async (req, res) => {
  const uid = await extractUserId(req);
  if (FIREBASE_CONFIGURED && !uid) return res.status(401).json({ error: 'Unauthorized' });
  const convo = q.getConvo.get(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Not found' });
  if (FIREBASE_CONFIGURED && uid && convo.user_id && convo.user_id !== uid)
    return res.status(403).json({ error: 'Forbidden' });
  const { memoryEnabled } = req.body ?? {};
  if (typeof memoryEnabled !== 'boolean') {
    return res.status(400).json({ error: 'memoryEnabled must be a boolean' });
  }
  q.updateConvoMemory.run(memoryEnabled ? 1 : 0, req.params.id);
  res.json({ ok: true, memoryEnabled });
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
  const inTok = Math.max(0, Number(req.body?.inputTokens) || 0);
  const outTok = Math.max(0, Number(req.body?.outputTokens) || 0);
  q.insertMsg.run(crypto.randomUUID(), req.params.id, role, body, prototype ? 1 : 0, inTok, outTok, null);
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

const PERSONALIZATION_MAX_CHARS = 500;

function sanitizePersonalization(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, PERSONALIZATION_MAX_CHARS);
}

const THINK_MODE_SYSTEM_HINT =
  'Think mode is ON for complex questions only. First write brief private reasoning inside <thinking>...</thinking> tags, ' +
  'then write the user-facing answer after the closing tag.\n' +
  'If the user asks for the current time, date, day, or sends a short greeting, answer in one direct sentence only — no <thinking> tags.';

function parseThinkResponse(text) {
  const raw = String(text || '');
  const match = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (!match) {
    return { thinking: '', reply: raw.trim() };
  }
  const thinking = match[1].trim();
  const reply = raw.replace(/<thinking>[\s\S]*?<\/thinking>/i, '').trim();
  return { thinking, reply: reply || thinking };
}

/** Phi-3 and small models sometimes echo the user, leak tokens, or run on with junk. */
const MODULON_REPLY_STOP_MARKERS = [
  /\n---+\s*\n/i,
  /\nGiven document:/i,
  /\nDocument Content Summary/i,
  /\nAnalyze the given document/i,
  /\n\| Misconception\s*\|/i,
  /\nProvide a detailed, master-level solution/i,
];

const OLLAMA_STOP_SEQUENCES = [
  '<|end|>',
  '<|endoftext|>',
  '<|end of response|>',
  '<|assistant|>',
  '<|user|>',
  '<|system|>',
  '\n---\n',
  'Given document:',
  'Document Content Summary',
];

const SIMPLE_GREETING_RE = new RegExp(
  '^(' +
    'hi|hello|hey|howdy|yo|sup|hiya|' +
    'good\\s+(morning|afternoon|evening|night)|' +
    'how\\s+are\\s+you(?:\\s+doing)?|' +
    'how(?:\'s|\\s+is)\\s+it\\s+going|' +
    'what(?:\'s|\\s+is)\\s+up' +
  ')(?:\\s+there)?[\\s!?.]*$',
  'i',
);

const IDENTITY_LEAK_RE =
  /\b(as an? |i'?m an? )?(ai|artificial intelligence|language model|large language model|chatbot|virtual assistant)\b|\b(developed|created|made) by (microsoft|openai|google|anthropic|meta)\b|\bmicrosoft'?s?\b.*\b(ai|copilot|assistant)\b|\b(copilot|chatgpt|gemini|claude|phi-?3)\b|\bmy purpose is to (assist|help)\b/i;

const TIME_QUESTION_RE =
  /\b(what(?:'s| is) the (time|date|day)|what (time|day) is it|current (time|date)|today(?:'s)? date|tell me the time|know what time)\b/i;

const GREETING_REPLIES = {
  en: {
    morning: ['Good morning! How can I help you today?', "Morning! What's on your mind?"],
    afternoon: ['Good afternoon! What can I help you with?', "Afternoon! How's it going?"],
    evening: ['Good evening! How can I help?', "Evening! What's on your mind?"],
    default: ["Hey! I'm doing well — what can I help you with?", 'Hi there! How can I help today?'],
  },
  de: {
    morning: ['Guten Morgen! Wie kann ich dir helfen?', 'Morgen! Was kann ich für dich tun?'],
    afternoon: ['Guten Tag! Wobei kann ich helfen?', 'Hallo! Was beschäftigt dich?'],
    evening: ['Guten Abend! Wie kann ich helfen?', 'Abend! Was kann ich für dich tun?'],
    default: ['Hallo! Wie kann ich dir heute helfen?'],
  },
  es: {
    morning: ['¡Buenos días! ¿En qué puedo ayudarte?', '¡Buen día! ¿Qué necesitas?'],
    afternoon: ['¡Buenas tardes! ¿En qué puedo ayudarte?', '¡Hola! ¿Qué tienes en mente?'],
    evening: ['¡Buenas noches! ¿Cómo puedo ayudar?', '¡Hola! ¿En qué te ayudo?'],
    default: ['¡Hola! ¿En qué puedo ayudarte hoy?'],
  },
  fr: {
    morning: ['Bonjour ! Comment puis-je t’aider ?', 'Bon matin ! De quoi as-tu besoin ?'],
    afternoon: ['Bon après-midi ! Comment puis-je t’aider ?', 'Salut ! De quoi as-tu besoin ?'],
    evening: ['Bonsoir ! Comment puis-je t’aider ?', 'Bonsoir ! Qu’est-ce qui t’amène ?'],
    default: ['Salut ! Comment puis-je t’aider aujourd’hui ?'],
  },
  pt: {
    morning: ['Bom dia! Como posso ajudar?', 'Olá! Em que posso ajudar hoje?'],
    afternoon: ['Boa tarde! Como posso ajudar?', 'Oi! O que você precisa?'],
    evening: ['Boa noite! Como posso ajudar?', 'Oi! Em que posso ajudar?'],
    default: ['Olá! Como posso ajudar hoje?'],
  },
  zh: {
    morning: ['早上好！今天我能帮你什么？', '你好！有什么我可以帮你的吗？'],
    afternoon: ['下午好！有什么我可以帮你的吗？', '你好！需要什么帮助？'],
    evening: ['晚上好！有什么我可以帮你的吗？', '你好！今晚需要什么帮助？'],
    default: ['你好！今天我能帮你什么？'],
  },
  ja: {
    morning: ['おはようございます！今日は何をお手伝いしましょうか？', 'こんにちは！何かお手伝いできることはありますか？'],
    afternoon: ['こんにちは！何かお手伝いできることはありますか？', '午後もよろしく！何をしましょうか？'],
    evening: ['こんばんは！何かお手伝いできることはありますか？', '夜更かしですね。何か手伝いましょうか？'],
    default: ['こんにちは！今日は何をお手伝いしましょうか？'],
  },
};

function sanitizeTimeZone(raw) {
  if (typeof raw !== 'string') return null;
  const tz = raw.trim().slice(0, 64);
  if (!tz) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function resolveClientDate(clientTime, timeZone) {
  let date;
  if (clientTime) {
    const parsed = new Date(clientTime);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  if (!date) date = new Date();
  const tz = sanitizeTimeZone(timeZone) || 'UTC';
  return { date, tz };
}

function getHourInTimeZone(clientTime, timeZone) {
  const { date, tz } = resolveClientDate(clientTime, timeZone);
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? Number(hourPart.value) : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

function dayPartFromHour(hour) {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function formatUserDateTime(clientTime, timeZone) {
  const { date, tz } = resolveClientDate(clientTime, timeZone);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toUTCString();
  }
}

function modulonDateTimeBlock(timeZone, clientTime) {
  const { tz } = resolveClientDate(clientTime, timeZone);
  const formatted = formatUserDateTime(clientTime, tz);
  const part = dayPartFromHour(getHourInTimeZone(clientTime, tz));
  return (
    `Current date and time for the user (${tz}): ${formatted}.\n` +
    `It is ${part} for them. Use this when answering about now, today, schedules, or time-of-day greetings.`
  );
}

function isTimeQuestion(message) {
  const t = String(message || '').trim();
  if (!t || t.length > 80) return false;
  return TIME_QUESTION_RE.test(t);
}

/** Time, date, and greetings always get a direct factual answer — never fake think-mode reasoning. */
function applyFactualOverrides(message, langCode, timeZone, clientTime, reply, thinking) {
  if (isTimeQuestion(message)) {
    return { reply: modulonTimeReply(langCode, timeZone, clientTime), thinking: '' };
  }
  if (isSimpleGreeting(message)) {
    return { reply: modulonGreetingReply(langCode, timeZone, clientTime), thinking: '' };
  }
  return { reply, thinking };
}

function modulonTimeReply(langCode = 'en', timeZone, clientTime) {
  const formatted = formatUserDateTime(clientTime, timeZone);
  const base = modulonLangBase(langCode);
  const replies = {
    en: `It's ${formatted}.`,
    de: `Es ist ${formatted}.`,
    es: `Son las ${formatted}.`,
    fr: `Il est ${formatted}.`,
    pt: `São ${formatted}.`,
    zh: `现在是 ${formatted}。`,
    ja: `今は ${formatted} です。`,
  };
  return replies[base] || replies.en;
}

function isSimpleGreeting(message) {
  const t = String(message || '').trim();
  if (!t || t.length > 48) return false;
  return SIMPLE_GREETING_RE.test(t);
}

function modulonGreetingReply(langCode = 'en', timeZone, clientTime) {
  const base = modulonLangBase(langCode);
  const hour = getHourInTimeZone(clientTime, timeZone);
  const part = dayPartFromHour(hour);
  const langPool = GREETING_REPLIES[base] || GREETING_REPLIES.en;
  const pool = langPool[part] || langPool.default || GREETING_REPLIES.en.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

function containsIdentityLeak(text) {
  return IDENTITY_LEAK_RE.test(String(text || ''));
}

function rewriteIdentityLeaks(text, userMessage, langCode = 'en') {
  if (!containsIdentityLeak(text)) return text;
  if (isSimpleGreeting(userMessage)) return modulonGreetingReply(langCode, null, null);
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  const cleaned = sentences.filter((s) => !containsIdentityLeak(s)).join(' ').trim();
  if (cleaned) return cleaned;
  return "I'm here to help — what would you like to talk about?";
}

function sanitizeModulonReply(raw, userMessage = '', langCode = 'en') {
  let text = String(raw || '').replace(/<\|[^|>]*\|>/gi, '').trim();
  if (!text) return '';

  for (const re of MODULON_REPLY_STOP_MARKERS) {
    const idx = text.search(re);
    if (idx > 0) text = text.slice(0, idx).trim();
  }

  const user = String(userMessage || '').trim();
  if (user) {
    const escaped = user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^${escaped}\\s*`, 'i'), '').trim();
  }

  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return rewriteIdentityLeaks(text, userMessage, langCode);
}

function modulonSystemPrompt(langCode = 'en', personalization = '', thinkMode = false, timeZone, clientTime) {
  if (process.env.MODULON_SYSTEM_PROMPT) return process.env.MODULON_SYSTEM_PROMPT;
  const label = modulonLangLabel(langCode);
  let base =
    `You are Modulon, the built-in assistant for the Modulon app.\n` +
    `${modulonDateTimeBlock(timeZone, clientTime)}\n` +
    `CRITICAL: The user's app language is ${label}. Every reply MUST be written entirely in ${label}.\n` +
    `Do NOT reply in Chinese, Russian, Japanese, or any other language unless the user's latest message is clearly written in that language.\n` +
    `Never say you are an AI, artificial intelligence, language model, or bot. Speak naturally as Modulon.\n` +
    `You are NOT Microsoft Copilot, NOT Phi, NOT ChatGPT, and NOT made by Microsoft or any other company.\n` +
    `Never say you were developed by Microsoft, OpenAI, Google, or anyone else. You are Modulon only.\n` +
    `Do not mention OpenAI, Anthropic, Ollama, Phi, Microsoft, or other AI brands.\n` +
    `Reply only to the user's latest message. Never repeat their message back.\n` +
    `For greetings and small talk, answer in one or two short, friendly sentences.\n` +
    `Never invent assignments, essays, tables, document analyses, or follow-up tasks. Stop when your answer is complete.`;
  if (thinkMode) {
    base += `\n\n${THINK_MODE_SYSTEM_HINT}`;
  }
  const extra = sanitizePersonalization(personalization);
  if (!extra) return base;
  return (
    `${base}\n\n` +
    `The user set personalization preferences below. Follow them when they do not conflict with the rules above.\n` +
    `Personalization:\n${extra}`
  );
}

/** Inference-only nudge for small models; not stored in chat history. */
function modulonOllamaUserTurn(message, langCode = 'en') {
  const label = modulonLangLabel(langCode);
  return (
    `${message}\n\n` +
    `(Reply as Modulon only — not Microsoft, not an AI. Write your entire reply in ${label} only.)`
  );
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

async function chatOllama({ message, model, history = [], systemPrompt, baseUrl, thinkMode = false }) {
  const ollamaBase = resolveOllamaBase(baseUrl);
  const chatMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...history,
    { role: 'user', content: message },
  ];
  const defaultPredict = Number(process.env.OLLAMA_NUM_PREDICT || 256);
  const thinkPredict = Number(process.env.OLLAMA_THINK_NUM_PREDICT || 896);
  const r = await fetch(`${ollamaBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      stream: false,
      options: {
        num_ctx: Number(process.env.OLLAMA_NUM_CTX || 2048),
        num_predict: thinkMode ? thinkPredict : defaultPredict,
        stop: OLLAMA_STOP_SEQUENCES,
        temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.7),
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
async function askModulon(message, history = [], langCode = 'en', personalization = '', thinkMode = false, timeZone, clientTime) {
  if (isTimeQuestion(message) || isSimpleGreeting(message)) {
    const { reply, thinking } = applyFactualOverrides(message, langCode, timeZone, clientTime, '', '');
    return { reply, thinking, proto: false, inputTokens: 0, outputTokens: 0 };
  }

  if (MODULON_BACKEND === 'python') {
    const raw = sanitizeModulonReply(await askPython(message), message, langCode) || '…';
    const { reply, thinking } = applyFactualOverrides(message, langCode, timeZone, clientTime, raw, '');
    return { reply, thinking: thinkMode ? thinking : '', proto: false, inputTokens: 0, outputTokens: 0 };
  }

  if (MODULON_BACKEND === 'ollama' || MODULON_BACKEND === 'ollama-first') {
    try {
      const { text, inputTokens, outputTokens } = await chatOllama({
        message: modulonOllamaUserTurn(message, langCode),
        model: MODULON_OLLAMA_MODEL,
        history,
        systemPrompt: modulonSystemPrompt(langCode, personalization, thinkMode, timeZone, clientTime),
        thinkMode,
      });
      const parsed = parseThinkResponse(text || '…');
      let reply = sanitizeModulonReply(parsed.reply, message, langCode) || '…';
      let thinking = thinkMode ? sanitizeModulonReply(parsed.thinking, message, langCode) : '';
      ({ reply, thinking } = applyFactualOverrides(message, langCode, timeZone, clientTime, reply, thinking));
      if (!thinkMode) thinking = '';
      return {
        reply,
        thinking,
        proto: false,
        inputTokens,
        outputTokens,
      };
    } catch (err) {
      console.error('[modulon] Ollama error:', err.message);
      if (MODULON_BACKEND === 'ollama') {
        return { reply: `⚠ Modulon is temporarily unavailable. (${err.message})`, thinking: '', proto: true, inputTokens: 0, outputTokens: 0 };
      }
      console.warn('[modulon] Ollama unavailable, falling back to GPT-2:', err.message);
    }
  }

  try {
    const raw = sanitizeModulonReply(await askPython(message), message, langCode) || '…';
    const { reply, thinking } = applyFactualOverrides(message, langCode, timeZone, clientTime, raw, '');
    return { reply, thinking: thinkMode ? thinking : '', proto: false, inputTokens: 0, outputTokens: 0 };
  } catch (err) {
    return { reply: `⚠ ${err.message}`, thinking: '', proto: true, inputTokens: 0, outputTokens: 0 };
  }
}

function insertAssistantMsg(convId, body, prototype, inTok, outTok, thinking = '') {
  const thinkText = thinking?.trim() ? thinking.trim() : null;
  q.insertMsg.run(crypto.randomUUID(), convId, 'assistant', body, prototype ? 1 : 0, inTok, outTok, thinkText);
}

app.post('/api/chat', async (req, res) => {
  try {
    const uid = await extractUserId(req);
    if (FIREBASE_CONFIGURED && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const {
      message,
      conversationId,
      assistantReply,
      external,
      language,
      inputTokens,
      outputTokens,
      personalization,
      chatMemory,
      thinkMode,
      assistantThinking,
      timeZone,
      clientTime,
    } = req.body ?? {};
    if (!message?.trim()) return res.status(400).json({ error: 'Empty message' });

    const chatMemoryPref = chatMemory !== false;

    let convId = conversationId;
    if (!convId) {
      convId = crypto.randomUUID();
      q.insertConvo.run(convId, message.slice(0, 60), uid ?? null, chatMemoryPref ? 1 : 0);
    } else {
      const convo = q.getConvo.get(convId);
      if (convo && FIREBASE_CONFIGURED && uid && convo.user_id && convo.user_id !== uid)
        return res.status(403).json({ error: 'Forbidden' });
    }

    q.insertMsg.run(crypto.randomUUID(), convId, 'user', message, 0, 0, 0, null);

    if (q.msgCount.get(convId).n === 1) {
      q.updateTitle.run(message.slice(0, 60), convId);
    }

    if (external && assistantReply?.trim()) {
      const extIn = Math.max(0, Number(inputTokens) || 0);
      const extOut = Math.max(0, Number(outputTokens) || 0);
      const extThinking = typeof assistantThinking === 'string' && assistantThinking.trim()
        ? assistantThinking.trim()
        : null;
      q.insertMsg.run(crypto.randomUUID(), convId, 'assistant', assistantReply, 0, extIn, extOut, extThinking);
      q.touchConvo.run(convId);
      return res.json({
        conversationId: convId,
        response: assistantReply,
        thinking: extThinking || undefined,
        inputTokens: extIn,
        outputTokens: extOut,
      });
    }

    const convo = q.getConvo.get(convId);
    const useChatMemory = convo?.memory_enabled !== 0;
    const history = useChatMemory ? convoHistoryRows(convId) : [];
    const modPersonalization = sanitizePersonalization(personalization);

    const useThinkMode = !!thinkMode;
    const { reply, thinking, proto, inputTokens: modIn, outputTokens: modOut } = await askModulon(
      message,
      history,
      language || 'en',
      modPersonalization,
      useThinkMode,
      timeZone,
      clientTime,
    );
    const inTok = modIn || Math.ceil(message.length / 4);
    const outTok = modOut || Math.ceil(String(reply).length / 4);

    insertAssistantMsg(convId, reply, proto, inTok, outTok, thinking);
    q.touchConvo.run(convId);

    res.json({
      conversationId: convId,
      response: reply,
      thinking: thinking || undefined,
      inputTokens: inTok,
      outputTokens: outTok,
    });
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
