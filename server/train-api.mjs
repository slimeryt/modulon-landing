import cors from 'cors';
import express from 'express';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createChatStore, openChatDatabase } from './chat-db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHATBOT_ROOT = path.resolve(__dirname, '../chatbot-ai');
const TRAIN_CONFIG_PATH = path.join(CHATBOT_ROOT, 'models', 'train_config.json');
const BEST_METRICS_PATH = path.join(CHATBOT_ROOT, 'models', 'best_metrics.json');
const CHAT_DB_PATH = path.join(__dirname, '..', 'data', 'chat.sqlite');

const CHAT_WELCOME =
  'Hi. This is a chat prototype. Send a message—the server returns a placeholder until you wire up the model.';

/** @type {ReturnType<createChatStore> | null} */
let chatStore = null;

function getChatStore() {
  if (!chatStore) {
    const db = openChatDatabase(CHAT_DB_PATH);
    chatStore = createChatStore(db);
  }
  return chatStore;
}

const DEFAULT_TRAIN_CONFIG = {
  embed_dim: 256,
  hidden_dim: 512,
  num_layers: 2,
  dropout: 0.3,
  batch_size: 64,
  num_epochs: 15,
  learning_rate: 5e-4,
  lr_min: 1e-6,
  clip: 1.0,
  max_pairs: 65000,
  weight_decay: 1e-4,
  label_smooth: 0.05,
  teacher_forcing: 0.5,
  use_decaying_teacher_forcing: false,
  teacher_forcing_start: 0.78,
  teacher_forcing_end: 0.52,
  plateau_patience: 2,
  plateau_factor: 0.5,
};

const INT_TRAIN_KEYS = new Set([
  'embed_dim',
  'hidden_dim',
  'num_layers',
  'batch_size',
  'num_epochs',
  'max_pairs',
  'plateau_patience',
]);

function normalizeTrainConfig(body) {
  const m = { ...DEFAULT_TRAIN_CONFIG };
  if (!body || typeof body !== 'object') return clampTrainConfig(m);
  for (const key of Object.keys(DEFAULT_TRAIN_CONFIG)) {
    if (body[key] === undefined || body[key] === null || body[key] === '') continue;
    if (key === 'use_decaying_teacher_forcing') {
      m[key] = body[key] === true || body[key] === 'true';
      continue;
    }
    if (INT_TRAIN_KEYS.has(key)) {
      const n = parseInt(String(body[key]), 10);
      if (Number.isFinite(n)) m[key] = n;
      continue;
    }
    const n = Number(body[key]);
    if (Number.isFinite(n)) m[key] = n;
  }
  return clampTrainConfig(m);
}

function clampTrainConfig(m) {
  const o = { ...m };
  o.num_layers = Math.min(8, Math.max(1, o.num_layers));
  o.embed_dim = Math.min(4096, Math.max(32, o.embed_dim));
  o.hidden_dim = Math.min(8192, Math.max(32, o.hidden_dim));
  o.batch_size = Math.min(2048, Math.max(1, o.batch_size));
  o.num_epochs = Math.min(500, Math.max(1, o.num_epochs));
  o.max_pairs = Math.min(2_000_000, Math.max(1000, o.max_pairs));
  o.dropout = Math.min(0.95, Math.max(0.0, o.dropout));
  o.label_smooth = Math.min(1.0, Math.max(0.0, o.label_smooth));
  o.teacher_forcing = Math.min(1.0, Math.max(0.0, o.teacher_forcing));
  o.teacher_forcing_start = Math.min(1.0, Math.max(0.0, o.teacher_forcing_start));
  o.teacher_forcing_end = Math.min(1.0, Math.max(0.0, o.teacher_forcing_end));
  o.plateau_patience = Math.min(50, Math.max(0, o.plateau_patience));
  o.plateau_factor = Math.min(1.0, Math.max(0.01, o.plateau_factor));
  o.learning_rate = Math.min(1.0, Math.max(1e-8, o.learning_rate));
  o.lr_min = Math.min(o.learning_rate, Math.max(1e-12, o.lr_min));
  o.clip = Math.min(100.0, Math.max(0.0, o.clip));
  o.weight_decay = Math.min(10.0, Math.max(0.0, o.weight_decay));
  return o;
}

function readTrainConfigFile() {
  if (!fs.existsSync(TRAIN_CONFIG_PATH)) {
    return { ...DEFAULT_TRAIN_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(TRAIN_CONFIG_PATH, 'utf8'));
    return normalizeTrainConfig(raw);
  } catch {
    return { ...DEFAULT_TRAIN_CONFIG };
  }
}

function writeTrainConfig(cfg) {
  fs.mkdirSync(path.dirname(TRAIN_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(TRAIN_CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}
/** Railway and other hosts set PORT; local dev can use TRAIN_API_PORT (e.g. 5182). */
const PORT = Number(process.env.PORT || process.env.TRAIN_API_PORT || 5182);
const SECRET = process.env.ADMIN_TRAIN_SECRET || '';

const AUTO_TRAIN_AT = (process.env.AUTO_TRAIN_AT || '').trim();
const AUTO_TRAIN_REPEAT_DAILY = process.env.AUTO_TRAIN_REPEAT_DAILY === '1';
const AUTO_TRAIN_ON_START = process.env.AUTO_TRAIN_ON_START === '1';
const AUTO_TRAIN_ON_START_DELAY_MS = Number(process.env.AUTO_TRAIN_ON_START_DELAY_MS || 12_000);

const app = express();
app.use(express.json());
app.use(cors({ origin: true }));

let child = null;
const logLines = [];
const MAX_LINES = 4000;

let currentStartedAt = null;
let currentPid = null;
/** @type {{ startedAt: string, endedAt: string, exitCode: number | null, signal: string | null } | null} */
let lastRun = null;

let autoTrainTimer = null;

/** When true, a new `train.py` run starts after the current one exits (until /train/stop or manual start). */
let continuousTraining = false;

const pythonExe = () => process.env.PYTHON || 'python';

function pushLog(text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (line.length) logLines.push(line);
  }
  while (logLines.length > MAX_LINES) logLines.shift();
}

function requireAuth(req, res, next) {
  if (!SECRET) return next();
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (tok !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function parseAtHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59 || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function msUntilNextLocal(hour, minute) {
  const now = new Date();
  const t = new Date(now);
  t.setSeconds(0, 0);
  t.setHours(hour, minute, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime() - now.getTime();
}

function clearAutoTrainTimer() {
  if (autoTrainTimer) {
    clearTimeout(autoTrainTimer);
    autoTrainTimer = null;
  }
}

function scheduleAutoTrainArm() {
  clearAutoTrainTimer();
  if (!AUTO_TRAIN_AT) return;
  const parsed = parseAtHHMM(AUTO_TRAIN_AT);
  if (!parsed) {
    console.warn('[train-api] AUTO_TRAIN_AT must be HH:MM (24h)');
    return;
  }
  const ms = msUntilNextLocal(parsed.hour, parsed.minute);
  console.log(
    `[train-api] AUTO_TRAIN_AT ${AUTO_TRAIN_AT} -> first trigger in ${Math.round(ms / 60_000)} min`,
  );
  autoTrainTimer = setTimeout(() => {
    autoTrainTimer = null;
    const r = beginTraining({ clearLog: true, source: 'AUTO_TRAIN_AT' });
    if (!r.ok) {
      pushLog(`[train-api] AUTO_TRAIN_AT skipped (${r.error})`);
      if (AUTO_TRAIN_REPEAT_DAILY && AUTO_TRAIN_AT) scheduleAutoTrainArm();
    }
  }, ms);
}

function maybeRestartContinuous() {
  if (!continuousTraining) return;
  pushLog('[train-api] continuous: starting next run...');
  setImmediate(() => {
    const r = beginTraining({ clearLog: false, source: 'continuous_loop' });
    if (!r.ok) {
      pushLog(`[train-api] continuous: stopped (${r.error})`);
      continuousTraining = false;
    }
  });
}

function onTrainProcessClosed(code, signal) {
  pushLog(`[train-api] exited code=${code} signal=${signal ?? 'none'}`);
  lastRun = {
    startedAt: currentStartedAt,
    endedAt: new Date().toISOString(),
    exitCode: code,
    signal: signal ?? null,
  };
  child = null;
  currentStartedAt = null;
  currentPid = null;
  if (continuousTraining) {
    maybeRestartContinuous();
  } else if (AUTO_TRAIN_AT && AUTO_TRAIN_REPEAT_DAILY) {
    scheduleAutoTrainArm();
  }
}

function onTrainProcessError(err) {
  pushLog(`[train-api] spawn error: ${err.message}`);
  lastRun = {
    startedAt: currentStartedAt,
    endedAt: new Date().toISOString(),
    exitCode: null,
    signal: null,
  };
  child = null;
  currentStartedAt = null;
  currentPid = null;
  if (continuousTraining) {
    pushLog('[train-api] continuous: retrying in 3s...');
    setTimeout(() => {
      if (!continuousTraining) return;
      const r = beginTraining({ clearLog: false, source: 'continuous_retry' });
      if (!r.ok) {
        continuousTraining = false;
        pushLog('[train-api] continuous: aborted after spawn error');
      }
    }, 3000);
  } else if (AUTO_TRAIN_AT && AUTO_TRAIN_REPEAT_DAILY) {
    scheduleAutoTrainArm();
  }
}

/**
 * @param {{ clearLog?: boolean, source?: string }} opts
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function beginTraining(opts = {}) {
  const { clearLog = true, source = 'api' } = opts;
  if (child) return { ok: false, error: 'already_running' };
  if (clearLog) logLines.length = 0;
  else {
    pushLog('');
    pushLog(`[train-api] --- next run --- ${new Date().toISOString()}`);
  }
  pushLog(`[train-api] start (${source}) ${new Date().toISOString()}`);
  pushLog(`[train-api] cwd: ${CHATBOT_ROOT}`);

  const py = pythonExe();
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    TRAIN_CONFIG: TRAIN_CONFIG_PATH,
  };
  child = spawn(py, ['-u', 'src/train.py'], {
    cwd: CHATBOT_ROOT,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  currentStartedAt = new Date().toISOString();
  currentPid = child.pid ?? null;

  child.stdout.on('data', (d) => pushLog(d));
  child.stderr.on('data', (d) => pushLog(d));
  child.on('close', (code, signal) => onTrainProcessClosed(code, signal));
  child.on('error', (err) => onTrainProcessError(err));

  return { ok: true };
}

function autoTrainMeta() {
  return {
    at: AUTO_TRAIN_AT || null,
    repeatDaily: AUTO_TRAIN_REPEAT_DAILY,
    onStart: AUTO_TRAIN_ON_START,
    onStartDelayMs: AUTO_TRAIN_ON_START ? AUTO_TRAIN_ON_START_DELAY_MS : null,
  };
}

function statusPayload() {
  const tail = logLines.slice(-800);
  return {
    running: child !== null,
    continuousTraining,
    startedAt: currentStartedAt,
    pid: currentPid,
    lastRun,
    logLineCount: logLines.length,
    log: tail.join('\n'),
    bestMetrics: readBestMetrics(),
    meta: {
      cwd: CHATBOT_ROOT,
      command: `${pythonExe()} -u src/train.py`,
      apiPort: PORT,
      platform: process.platform,
      autoTrain: autoTrainMeta(),
    },
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    trainApi: true,
    chat: { sqlitePath: CHAT_DB_PATH },
    meta: {
      cwd: CHATBOT_ROOT,
      command: `${pythonExe()} -u src/train.py`,
      apiPort: PORT,
      autoTrain: autoTrainMeta(),
    },
  });
});

app.post('/api/train/start', requireAuth, (req, res) => {
  continuousTraining = false;
  const r = beginTraining({ clearLog: true, source: 'manual' });
  if (!r.ok) return res.status(409).json({ error: 'Training already running' });
  return res.json({ ok: true, continuousTraining });
});

app.post('/api/train/start-continuous', requireAuth, (_req, res) => {
  continuousTraining = true;
  if (child) {
    return res.json({
      ok: true,
      continuousTraining: true,
      message: 'Loop enabled; will start next run after this one finishes',
    });
  }
  const r = beginTraining({ clearLog: true, source: 'continuous' });
  if (!r.ok) {
    continuousTraining = false;
    return res.status(409).json({ error: 'Training already running' });
  }
  return res.json({ ok: true, continuousTraining: true });
});

app.post('/api/train/stop', requireAuth, (_req, res) => {
  continuousTraining = false;
  if (!child) {
    return res.json({ ok: true, message: 'No training process', continuousTraining: false });
  }
  const proc = child;
  const pid = proc.pid;
  try {
    if (process.platform === 'win32' && pid) {
      execFile(
        'taskkill',
        ['/PID', String(pid), '/T', '/F'],
        { windowsHide: true },
        () => {
          /* 'close' on proc clears child; taskkill may fail if already exited */
        },
      );
    } else {
      proc.kill('SIGTERM');
    }
  } catch (_) {
    try {
      proc.kill('SIGTERM');
    } catch (_) {
      /* ignore */
    }
  }
  return res.json({ ok: true, message: 'Stop requested', continuousTraining: false });
});

app.get('/api/train/status', requireAuth, (_req, res) => {
  res.json(statusPayload());
});

app.get('/api/train/config', requireAuth, (_req, res) => {
  res.json({
    config: readTrainConfigFile(),
    defaults: { ...DEFAULT_TRAIN_CONFIG },
    path: TRAIN_CONFIG_PATH,
  });
});

app.put('/api/train/config', requireAuth, (req, res) => {
  const cfg = normalizeTrainConfig(req.body);
  try {
    writeTrainConfig(cfg);
    res.json({ ok: true, config: cfg });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post('/api/train/config/reset', requireAuth, (_req, res) => {
  try {
    if (fs.existsSync(TRAIN_CONFIG_PATH)) {
      fs.unlinkSync(TRAIN_CONFIG_PATH);
    }
    res.json({ ok: true, config: { ...DEFAULT_TRAIN_CONFIG } });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/chat/conversations', requireAuth, (_req, res) => {
  try {
    const conversations = getChatStore().listConversations();
    res.json({ conversations });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/chat/conversations/:id/messages', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'invalid conversation id' });
  }
  const chat = getChatStore();
  if (!chat.conversationExists(id)) {
    return res.status(404).json({ error: 'conversation not found' });
  }
  const messages = chat.getMessages(id);
  res.json({ conversationId: id, messages });
});

app.post('/api/chat/conversations', requireAuth, (_req, res) => {
  try {
    const chat = getChatStore();
    const id = chat.createConversation();
    chat.appendMessage(id, 'assistant', CHAT_WELCOME, 0);
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.delete('/api/chat/conversations/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'invalid conversation id' });
  }
  try {
    getChatStore().deleteConversation(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.patch('/api/chat/conversations/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'invalid conversation id' });
  }
  const ok = getChatStore().renameConversation(id, req.body?.title);
  if (!ok) return res.status(400).json({ error: 'invalid title' });
  res.json({ ok: true });
});

/** Prototype chat: persists to SQLite; replace reply with Python inference when ready. */
app.post('/api/chat', requireAuth, (req, res) => {
  const msg = String(req.body?.message ?? '').trim();
  if (!msg) {
    return res.status(400).json({ error: 'message required' });
  }
  let convId = req.body?.conversationId;
  convId =
    convId != null && convId !== '' ? parseInt(String(convId), 10) : Number.NaN;
  const chat = getChatStore();
  if (!Number.isFinite(convId) || convId < 1) {
    convId = chat.createConversation();
    chat.appendMessage(convId, 'assistant', CHAT_WELCOME, 0);
  } else if (!chat.conversationExists(convId)) {
    return res.status(404).json({ error: 'conversation not found' });
  }
  chat.maybeSetTitleFromFirstUser(convId, msg);
  chat.appendMessage(convId, 'user', msg, 0);
  const preview = msg.length > 160 ? `${msg.slice(0, 160)}...` : msg;
  const reply = `Prototype: received your message (${preview}). Next step: call inference from this route or a dedicated chat service.`;
  chat.appendMessage(convId, 'assistant', reply, 1);
  res.json({ prototype: true, reply, conversationId: convId });
});

const DIST_DIR = path.join(__dirname, '..', 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  getChatStore();
  console.log(`train-api listening on http://127.0.0.1:${PORT}`);
  console.log(`chat sqlite: ${CHAT_DB_PATH}`);
  if (!SECRET) {
    console.warn('train-api: ADMIN_TRAIN_SECRET not set — /api/train is open to this machine');
  }
  if (AUTO_TRAIN_ON_START) {
    const d = Number.isFinite(AUTO_TRAIN_ON_START_DELAY_MS) ? AUTO_TRAIN_ON_START_DELAY_MS : 12_000;
    console.log(`[train-api] AUTO_TRAIN_ON_START: will begin training in ${d} ms`);
    setTimeout(() => {
      const r = beginTraining({ clearLog: true, source: 'AUTO_TRAIN_ON_START' });
      if (!r.ok) console.warn(`[train-api] AUTO_TRAIN_ON_START skipped: ${r.error}`);
    }, d);
  }
  if (AUTO_TRAIN_AT) {
    if (AUTO_TRAIN_REPEAT_DAILY) scheduleAutoTrainArm();
    else {
      const parsed = parseAtHHMM(AUTO_TRAIN_AT);
      if (!parsed) console.warn('[train-api] AUTO_TRAIN_AT invalid, expected HH:MM');
      else {
        const ms = msUntilNextLocal(parsed.hour, parsed.minute);
        console.log(
          `[train-api] AUTO_TRAIN_AT ${AUTO_TRAIN_AT} (once) in ${Math.round(ms / 60_000)} min`,
        );
        autoTrainTimer = setTimeout(() => {
          autoTrainTimer = null;
          const r = beginTraining({ clearLog: true, source: 'AUTO_TRAIN_AT' });
          if (!r.ok) pushLog(`[train-api] AUTO_TRAIN_AT skipped (${r.error})`);
        }, ms);
      }
    }
  }
});
