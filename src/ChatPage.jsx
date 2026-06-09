import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Check,
  ChevronDown,
  ClipboardCopy,
  Copy,
  File,
  Home,
  Image,
  Eye,
  EyeOff,
  Info,
  Key,
  LogOut,
  MessageCircle,
  Monitor,
  Moon,
  PanelLeft,
  Palette,
  Plus,
  Send,
  Settings,
  Shield,
  Sun,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useAuth, mapAuthError } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { useTheme } from './ThemeContext';
import { translatedHomeGreeting } from './i18n/homeGreeting';
import modulonIcon from './assets/icons/Modulon_Icon.png';

const API = (() => {
  const origin = (import.meta.env.VITE_PUBLIC_API_ORIGIN || '').trim().replace(/\/$/, '');
  return origin ? `${origin}/api` : '/api';
})();

/** Sole model served by the API today (shown in the composer). */
const MODULON_CHAT_MODEL_LABEL = 'Modulon M0.1';
/** Placeholder copy in the model menu until additional models ship. */
const MODULON_MODEL_MENU_SOON = 'More soon…';

const PROVIDER_MODELS = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-opus-4-5',    label: 'Claude Opus 4.5'    },
      { id: 'claude-sonnet-4-5',  label: 'Claude Sonnet 4.5'  },
      { id: 'claude-haiku-4-5',   label: 'Claude Haiku 4.5'   },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o',      label: 'GPT-4o'      },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'o3-mini',     label: 'o3-mini'     },
    ],
  },
  google: {
    label: 'Google',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro'   },
    ],
  },
  xai: {
    label: 'xAI',
    models: [
      { id: 'grok-3',      label: 'Grok 3'      },
      { id: 'grok-3-mini', label: 'Grok 3 mini' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    models: [
      { id: 'deepseek-chat',      label: 'DeepSeek V3' },
      { id: 'deepseek-reasoner',  label: 'DeepSeek R1' },
    ],
  },
};

const DAILY_USAGE_KEY = 'modulon-daily-usage';
const WEEKLY_USAGE_KEY = 'modulon-weekly-usage';
const EXTRA_USAGE_KEY = 'modulon-extra-usage';
const EXTRA_USAGE_CREDITS_KEY = 'modulon-extra-usage-credits';
const API_KEYS_STORAGE_KEY = 'modulon-api-keys';

/** Soft caps for progress UI (local counts; not enforced by the server). */
const DAILY_MESSAGE_CAP = 120;
const DAILY_MESSAGE_CAP_EXTRA = 200;
const WEEKLY_MESSAGE_CAP = DAILY_MESSAGE_CAP * 7;
const WEEKLY_MESSAGE_CAP_EXTRA = DAILY_MESSAGE_CAP_EXTRA * 7;

/** ISO 3166 region → ISO 4217 currency for display (best-effort from browser locale). */
const REGION_TO_CURRENCY = {
  US: 'USD',
  CA: 'CAD',
  MX: 'MXN',
  BR: 'BRL',
  GB: 'GBP',
  CH: 'CHF',
  NO: 'NOK',
  SE: 'SEK',
  DK: 'DKK',
  IS: 'ISK',
  AU: 'AUD',
  NZ: 'NZD',
  JP: 'JPY',
  KR: 'KRW',
  CN: 'CNY',
  TW: 'TWD',
  HK: 'HKD',
  SG: 'SGD',
  IN: 'INR',
  RU: 'RUB',
  TR: 'TRY',
  ZA: 'ZAR',
  IL: 'ILS',
  AE: 'AED',
  SA: 'SAR',
  TH: 'THB',
  MY: 'MYR',
  ID: 'IDR',
  PH: 'PHP',
  VN: 'VND',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  IE: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  LU: 'EUR',
  MT: 'EUR',
  CY: 'EUR',
  SI: 'EUR',
  SK: 'EUR',
  EE: 'EUR',
  LV: 'EUR',
  LT: 'EUR',
  HR: 'EUR',
  PL: 'PLN',
  RO: 'RON',
  CZ: 'CZK',
  HU: 'HUF',
  BG: 'BGN',
};

function getLocaleCurrency() {
  const language =
    typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
  try {
    const region = new Intl.Locale(language).maximize().region;
    const currency = (region && REGION_TO_CURRENCY[region]) || 'USD';
    return { locale: language, currency };
  } catch {
    return { locale: 'en-US', currency: 'USD' };
  }
}

function formatCreditsMoney(amount) {
  const { locale, currency } = getLocaleCurrency();
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
}

function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday of the current week (local calendar), as YYYY-MM-DD. */
function mondayLocalISO() {
  const d = new Date();
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, '0');
  const day = String(mon.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readDailyUsage() {
  const day = todayLocalISO();
  try {
    const raw = localStorage.getItem(DAILY_USAGE_KEY);
    if (!raw) return { day, messages: 0 };
    const o = JSON.parse(raw);
    if (o.day !== day) return { day, messages: 0 };
    return { day, messages: Number(o.messages) || 0 };
  } catch {
    return { day, messages: 0 };
  }
}

function writeDailyUsage(u) {
  try {
    localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
}

function readWeeklyUsage() {
  const weekStart = mondayLocalISO();
  try {
    const raw = localStorage.getItem(WEEKLY_USAGE_KEY);
    if (!raw) return { weekStart, messages: 0 };
    const o = JSON.parse(raw);
    if (o.weekStart !== weekStart) return { weekStart, messages: 0 };
    return { weekStart, messages: Number(o.messages) || 0 };
  } catch {
    return { weekStart, messages: 0 };
  }
}

function writeWeeklyUsage(u) {
  try {
    localStorage.setItem(WEEKLY_USAGE_KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
}

function readExtraUsage() {
  try {
    return localStorage.getItem(EXTRA_USAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeExtraUsage(enabled) {
  try {
    localStorage.setItem(EXTRA_USAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function readExtraUsageCredits() {
  try {
    const raw = localStorage.getItem(EXTRA_USAGE_CREDITS_KEY);
    if (raw == null || raw === '') return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

function writeExtraUsageCredits(amount) {
  try {
    localStorage.setItem(EXTRA_USAGE_CREDITS_KEY, String(amount));
  } catch {
    /* ignore */
  }
}

const API_KEYS_DEFAULT = { anthropic: '', openai: '', google: '', xai: '', deepseek: '' };

function readApiKeys() {
  try {
    const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (!raw) return { ...API_KEYS_DEFAULT };
    return { ...API_KEYS_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...API_KEYS_DEFAULT };
  }
}

function writeApiKeys(keys) {
  try {
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

const USAGE_BAR_MESSAGES =
  'from-cyan-500 via-sky-500 to-indigo-500 shadow-[0_0_22px_-6px_rgba(56,189,248,0.55)]';
const USAGE_BAR_OVER =
  'from-amber-500 via-orange-500 to-rose-500 shadow-[0_0_24px_-4px_rgba(251,146,60,0.55)]';

function UsageProgressBar({ label, current, cap, period, className = '' }) {
  const ratio = cap > 0 ? current / cap : 0;
  const over = current > cap;
  const fillWidth = Math.min(100, ratio * 100);
  const remaining = Math.max(0, cap - current);
  const usedPct = Math.round(ratio * 100);
  const remainingPct = cap > 0 && !over ? Math.round((remaining / cap) * 100) : 0;
  const fillGradient = over ? USAGE_BAR_OVER : USAGE_BAR_MESSAGES;
  const guideWord = period === 'weekly' ? 'weekly' : 'daily';

  return (
    <div className={`space-y-2.5 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white/95">{label}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-base font-bold tabular-nums tracking-tight text-zinc-900 dark:text-white">
            {usedPct}%
          </span>
          <span className="block text-xs font-medium text-zinc-400 dark:text-white/35">of {guideWord} guide</span>
        </div>
      </div>
      <div className="relative">
        <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-200/90 shadow-inner dark:bg-zinc-950/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div
            className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${fillGradient}`}
            style={{ width: `${fillWidth}%` }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-zinc-900/[0.06] dark:ring-white/[0.08]"
          aria-hidden
        />
      </div>
      <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
        <span className={over ? 'text-amber-700 dark:text-amber-300/90' : ''}>
          {over
            ? `Past ${guideWord} guide (${usedPct}% used)`
            : `${remainingPct}% of guide still available`}
        </span>
      </div>
    </div>
  );
}

function accountDisplayName(user) {
  if (!user) return 'Guest';
  return user.displayName?.trim() || user.email?.split('@')[0] || 'User';
}

function accountInitials(user) {
  const n = accountDisplayName(user);
  const parts = n.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

async function apiJson(path, opts = {}, token = null) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts = { ...opts, body: JSON.stringify(opts.body) };
  }
  const r = await fetch(`${API}${path}`, { ...opts, headers });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  return r.json();
}

function mapRowsToMessages(rows) {
  return (rows || []).map((m) => ({
    id: m.id,
    role: m.role,
    text: m.body,
    prototype: !!m.prototype,
    createdAt: m.created_at,
  }));
}

export default function ChatPage() {
  const navigate = useNavigate();
  const { firebaseConfigured, user, signOutUser, sendPasswordReset } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [err, setErr] = useState('');
  const [apiOk, setApiOk] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('account');
  const [settingsNotice, setSettingsNotice] = useState('');
  const bottomRef = useRef(null);
  const contextMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const attachPlusRef = useRef(null);
  const attachControlsRef = useRef(null);
  const attachMenuRef = useRef(null);
  const modelPickerBtnRef = useRef(null);
  const modelSelectMenuRef = useRef(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachMenuPos, setAttachMenuPos] = useState(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMenuPos, setModelMenuPos] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [dailyUsage, setDailyUsage] = useState(() => readDailyUsage());
  const [weeklyUsage, setWeeklyUsage] = useState(() => readWeeklyUsage());
  const [extraUsage, setExtraUsage] = useState(() => readExtraUsage());
  const [extraUsageCredits, setExtraUsageCredits] = useState(() => readExtraUsageCredits());
  const [apiKeys, setApiKeys] = useState(() => readApiKeys());
  const [apiKeyDrafts, setApiKeyDrafts] = useState(() => readApiKeys());
  const [apiKeysVisible, setApiKeysVisible] = useState({ anthropic: false, openai: false, google: false, xai: false, deepseek: false });
  const [selectedModel, setSelectedModel] = useState({ id: 'modulon', label: MODULON_CHAT_MODEL_LABEL, provider: 'modulon' });

  // Wraps apiJson with the current user's Firebase ID token
  const callApi = useCallback(async (path, opts = {}) => {
    const token = user ? await user.getIdToken() : null;
    return apiJson(path, opts, token);
  }, [user]);

  const refreshConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const d = await callApi('/chat/conversations');
      const list = d.conversations || [];
      setConversations(list);
      return list;
    } catch {
      setConversations([]);
      return [];
    } finally {
      setLoadingList(false);
    }
  }, [callApi]);

  const loadMessages = useCallback(async (id) => {
    if (!id) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const d = await callApi(`/chat/conversations/${id}/messages`);
      setMessages(mapRowsToMessages(d.messages));
    } catch (e) {
      setErr(e.message || String(e));
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, [callApi]);

  /** ChatGPT-style fresh screen — no active thread until the user sends or picks one. */
  const goHome = useCallback(() => {
    setErr('');
    setConversationId(null);
    setMessages([]);
    setInput('');
    setAttachMenuOpen(false);
    setModelMenuOpen(false);
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await fetch(`${API}/health`);
        if (!r.ok) {
          if (!c) setApiOk(false);
          return;
        }
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('application/json')) {
          if (!c) setApiOk(false);
          return;
        }
        const data = await r.json();
        if (!c) setApiOk(data && data.ok === true);
      } catch {
        if (!c) setApiOk(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (apiOk !== true) return;
    refreshConversations();
  }, [apiOk, refreshConversations]);

  useEffect(() => {
    if (conversationId) loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (!settingsOpen || user) return;
    if (settingsSection === 'account' || settingsSection === 'security') {
      setSettingsSection('appearance');
    }
  }, [settingsOpen, user, settingsSection]);

  // Lock page scroll: only the message list should scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  useEffect(() => {
    if (!sidebarOpen) setSettingsOpen(false);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) setContextMenu(null);
  }, [sidebarOpen]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleSidebarChatsContextMenu = useCallback(
    (e) => {
      if (settingsOpen) return;
      if (!sidebarOpen) return;
      if (!e.target.closest('[data-sidebar-chat-list]')) return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      const row = e.target.closest('[data-conversation-id]');
      const conversationId = row?.getAttribute('data-conversation-id') || null;
      setContextMenu({ x: e.clientX, y: e.clientY, conversationId });
    },
    [settingsOpen, sidebarOpen],
  );

  useEffect(() => {
    if (settingsOpen) setContextMenu(null);
  }, [settingsOpen]);

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (e) => {
      if (contextMenuRef.current?.contains(e.target)) return;
      setContextMenu(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    const onScroll = () => setContextMenu(null);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const r = el.getBoundingClientRect();
    let left = contextMenu.x;
    let top = contextMenu.y;
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 8) top = window.innerHeight - r.height - 8;
    left = Math.max(8, left);
    top = Math.max(8, top);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!attachMenuOpen) {
      setAttachMenuPos(null);
      return;
    }
    const gap = 8;
    const margin = 8;
    const menuWidth = 208;
    const fallbackMenuHeight = 112;

    const placeMenu = () => {
      const btn = attachPlusRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menu = attachMenuRef.current;
      const h = menu?.getBoundingClientRect().height ?? fallbackMenuHeight;
      const vh = window.innerHeight;

      let left = r.left;
      if (left + menuWidth > window.innerWidth - margin) left = window.innerWidth - menuWidth - margin;
      left = Math.max(margin, left);

      let top = r.bottom + gap;
      if (top + h > vh - margin) {
        top = r.top - h - gap;
      }
      top = Math.max(margin, Math.min(top, vh - h - margin));

      setAttachMenuPos({ top, left });
    };

    placeMenu();
    const raf = requestAnimationFrame(() => placeMenu());
    window.addEventListener('resize', placeMenu);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', placeMenu);
    };
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onPointerDown = (e) => {
      if (attachControlsRef.current?.contains(e.target)) return;
      if (attachMenuRef.current?.contains(e.target)) return;
      setAttachMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setAttachMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachMenuOpen]);

  useLayoutEffect(() => {
    if (!modelMenuOpen) {
      setModelMenuPos(null);
      return;
    }
    const update = () => {
      const btn = modelPickerBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menuWidth = 208;
      let left = r.right - menuWidth;
      if (left < 8) left = 8;
      if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
      const gap = 8;
      setModelMenuPos({ left, bottom: window.innerHeight - r.top + gap });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onPointerDown = (e) => {
      if (modelPickerBtnRef.current?.contains(e.target)) return;
      if (modelSelectMenuRef.current?.contains(e.target)) return;
      setModelMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setModelMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modelMenuOpen]);

  const copySelectionFromMenu = useCallback(async () => {
    const t = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : '';
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
    closeContextMenu();
  }, [closeContextMenu]);

  const openConvoFromMenu = useCallback(() => {
    if (!contextMenu?.conversationId) return;
    setErr('');
    setConversationId(contextMenu.conversationId);
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  const copyConvoTitleFromMenu = useCallback(async () => {
    if (!contextMenu?.conversationId) return;
    const c = conversations.find((x) => x.id === contextMenu.conversationId);
    if (!c?.title) return;
    try {
      await navigator.clipboard.writeText(c.title);
    } catch {
      /* ignore */
    }
    closeContextMenu();
  }, [contextMenu, conversations, closeContextMenu]);

  const deleteConvoFromMenu = useCallback(async () => {
    const id = contextMenu?.conversationId;
    if (!id) return;
    setErr('');
    try {
      await callApi(`/chat/conversations/${id}`, { method: 'DELETE' });
      await refreshConversations();
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch (errDel) {
      setErr(errDel.message || String(errDel));
    }
    closeContextMenu();
  }, [contextMenu, conversationId, refreshConversations, closeContextMenu, callApi]);

  const openSettingsFromMenu = useCallback(() => {
    setSettingsNotice('');
    setSettingsSection('appearance');
    setSettingsOpen(true);
    closeContextMenu();
  }, [closeContextMenu]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === DAILY_USAGE_KEY || e.key === WEEKLY_USAGE_KEY || e.key === null) {
        setDailyUsage(readDailyUsage());
        setWeeklyUsage(readWeeklyUsage());
      }
      if (e.key === EXTRA_USAGE_KEY || e.key === null) {
        setExtraUsage(readExtraUsage());
      }
      if (e.key === EXTRA_USAGE_CREDITS_KEY || e.key === null) {
        setExtraUsageCredits(readExtraUsageCredits());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (settingsOpen) {
      setDailyUsage(readDailyUsage());
      setWeeklyUsage(readWeeklyUsage());
      setExtraUsage(readExtraUsage());
      setExtraUsageCredits(readExtraUsageCredits());
    }
  }, [settingsOpen]);

  const bumpWeeklyMessages = useCallback((n = 1) => {
    setWeeklyUsage((prev) => {
      const weekStart = mondayLocalISO();
      const base = prev.weekStart === weekStart ? prev : { weekStart, messages: 0 };
      const next = { weekStart, messages: base.messages + n };
      writeWeeklyUsage(next);
      return next;
    });
  }, []);

  const bumpDailyMessages = useCallback((n = 1) => {
    setDailyUsage((prev) => {
      const day = todayLocalISO();
      const base = prev.day === day ? prev : { day, messages: 0 };
      const next = { day, messages: base.messages + n };
      writeDailyUsage(next);
      return next;
    });
  }, []);

  // Sync active chat when the sidebar list changes. Do not clear conversationId
  // while conversations is still [] — that races with send() creating a new chat.
  useEffect(() => {
    if (!conversationId || conversations.length === 0) return;
    if (!conversations.some((c) => c.id === conversationId)) {
      const next = conversations[0]?.id ?? null;
      setConversationId(next);
      if (!next) setMessages([]);
    }
  }, [conversations, conversationId]);

  const selectConversation = (id) => {
    setErr('');
    setConversationId(id);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setSidebarOpen(false);
    }
  };

  const deleteConversation = async (id, e) => {
    e?.stopPropagation();
    if (!id) return;
    setErr('');
    try {
      await callApi(`/chat/conversations/${id}`, { method: 'DELETE' });
      await refreshConversations();
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch (errDel) {
      setErr(errDel.message || String(errDel));
    }
  };

  const send = async (textOverride) => {
    const text = (typeof textOverride === 'string' ? textOverride : input).trim();
    if (!text || sending || apiOk === false) return;
    setInput('');
    setErr('');
    const optimisticUser = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      text,
      prototype: false,
    };
    setMessages((m) => [...m, optimisticUser]);
    setSending(true);
    try {
      const data = await callApi('/chat', {
        method: 'POST',
        body: { message: text, conversationId },
      });
      const convId = data.conversationId;
      if (convId) {
        setConversationId(convId);
      }
      await refreshConversations();
      if (convId) {
        await loadMessages(convId);
      }
      bumpDailyMessages(1);
      bumpWeeklyMessages(1);
    } catch (e) {
      setErr(e.message || String(e));
      setMessages((m) => [
        ...m.filter((x) => x.id !== optimisticUser.id),
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'Could not reach the chat API. Run `npm run dev:all` (or `dev:api`).',
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const isHome = !conversationId && apiOk !== false;

  return (
    <div className="h-screen overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-[#070708] dark:text-white font-sans selection:bg-zinc-300/40 dark:selection:bg-white/20">
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-[0.35] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.2),transparent)]" />

      {/* Mobile: full-width header so controls stay out of the message column. */}
      <header
        className="flex md:hidden fixed inset-x-0 top-0 z-[60] items-center justify-between gap-3 border-b border-zinc-200/75 bg-zinc-100/95 px-3 shadow-sm backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#070708]/95 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)]"
        style={{
          paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
          paddingBottom: '0.5rem',
        }}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-800 transition-colors active:scale-[0.98] hover:bg-zinc-300/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:bg-white/[0.1] dark:text-white dark:hover:bg-white/[0.16] dark:focus-visible:ring-white/30"
          aria-expanded={sidebarOpen}
          aria-label="Toggle chat history"
        >
          <PanelLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center px-2">
          <span className="truncate text-center text-xs font-semibold tracking-wide text-zinc-500 dark:text-white/45">
            {conversationId
              ? (conversations.find((c) => c.id === conversationId)?.title || 'Modulon')
              : 'Modulon'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="flex h-10 w-9 shrink-0 items-center justify-center"
            title={
              apiOk === true ? 'API connected' : apiOk === false ? 'API offline' : 'Checking API…'
            }
            aria-label={
              apiOk === true ? 'API connected' : apiOk === false ? 'API offline' : 'Checking API'
            }
          >
            <span
              className={`h-2 w-2 rounded-full ${
                apiOk === true
                  ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.28)] dark:shadow-[0_0_0_2px_rgba(16,185,129,0.22)]'
                  : apiOk === false
                    ? 'bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.22)] dark:shadow-[0_0_0_2px_rgba(239,68,68,0.16)]'
                    : 'bg-amber-400 animate-pulse dark:bg-amber-400/90'
              }`}
            />
          </span>
          <Link
            to="/"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-800 transition-colors active:scale-[0.98] hover:bg-zinc-300/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:bg-white/[0.1] dark:text-white dark:hover:bg-white/[0.16] dark:focus-visible:ring-white/30"
            aria-label="Home"
          >
            <Home className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </header>

      <div
        className="hidden md:flex fixed z-40 items-center gap-0.5 rounded-full border border-zinc-200/90 bg-white/90 py-1 pl-1 pr-1 shadow-sm backdrop-blur-md dark:border-white/[0.12] dark:bg-white/[0.08] dark:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.65)]"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        }}
        role="toolbar"
        aria-label="Chat toolbar"
      >
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-transparent text-zinc-600 transition-colors hover:bg-zinc-200/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:text-white/70 dark:hover:bg-white/[0.1] dark:focus-visible:ring-white/25"
          aria-expanded={sidebarOpen}
          aria-label="Toggle chat history"
        >
          <PanelLeft className="h-5 w-5" aria-hidden />
        </button>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center"
          title={
            apiOk === true ? 'API connected' : apiOk === false ? 'API offline' : 'Checking API…'
          }
          aria-label={
            apiOk === true ? 'API connected' : apiOk === false ? 'API offline' : 'Checking API'
          }
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              apiOk === true
                ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)] dark:shadow-[0_0_0_3px_rgba(16,185,129,0.2)]'
                : apiOk === false
                  ? 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.22)] dark:shadow-[0_0_0_3px_rgba(239,68,68,0.18)]'
                  : 'bg-amber-400 animate-pulse dark:bg-amber-400/90'
            }`}
          />
        </span>
        <Link
          to="/"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-transparent text-zinc-600 transition-colors hover:bg-zinc-200/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:text-white/70 dark:hover:bg-white/[0.1] dark:focus-visible:ring-white/25"
          aria-label="Home"
        >
          <Home className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      {/* Sidebar column: md+ narrows width when closed; same full height as open. Mobile still slides off. */}
      <div
        className={`fixed z-30 max-md:z-50 flex flex-col overflow-hidden transition-[width,transform] duration-200 ease-out top-[max(1rem,calc(env(safe-area-inset-top,0px)+3.25rem))] md:top-[max(1rem,env(safe-area-inset-top,0px))] ${
          sidebarOpen ? 'gap-2' : 'gap-2 md:gap-1.5'
        } ${
          sidebarOpen
            ? 'w-[min(18rem,calc(100vw-2rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)))] translate-x-0'
            : 'w-[min(18rem,calc(100vw-2rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)))] -translate-x-[calc(100%+1.5rem)] md:w-14 md:translate-x-0'
        }`}
        style={{
          left: 'max(1rem, env(safe-area-inset-left, 0px))',
          bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <aside
          className={`flex min-h-0 flex-1 flex-col overflow-hidden border border-zinc-200/90 bg-white/90 text-zinc-900 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-white dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] ${
            sidebarOpen ? 'rounded-2xl' : 'rounded-full'
          }`}
        >
        <div
          className={`shrink-0 border-b border-zinc-200/80 dark:border-white/[0.06] flex items-center gap-2 ${
            sidebarOpen ? 'p-3 justify-between' : 'p-3 justify-between max-md:p-3 md:flex-col md:justify-center md:border-0 md:p-2 md:pb-1'
          }`}
        >
          <span
            className={`text-xs font-semibold text-zinc-700 dark:text-white/80 tracking-wide ${
              sidebarOpen ? '' : 'md:sr-only'
            }`}
          >
            Chats
          </span>
          <button
            type="button"
            onClick={goHome}
            disabled={apiOk === false}
            aria-label="New chat"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 disabled:pointer-events-none disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/90 dark:focus-visible:ring-white/30"
          >
            <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div
          data-sidebar-chat-list
          onContextMenu={handleSidebarChatsContextMenu}
          onScroll={() => setContextMenu(null)}
          className={`flex-1 min-h-0 overflow-y-auto no-scrollbar p-2 space-y-1 ${
            sidebarOpen ? '' : 'md:invisible md:pointer-events-none md:select-none'
          }`}
        >
          {loadingList && conversations.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-white/35 px-2 py-3">Loading…</p>
          ) : null}
          {!loadingList && conversations.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-white/40 px-2 py-3 leading-relaxed">
              No chats yet. Start a new one.
            </p>
          ) : null}
          {conversations.map((c) => (
            <div
              key={c.id}
              data-conversation-id={c.id}
              role="button"
              tabIndex={0}
              onClick={() => selectConversation(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectConversation(c.id);
                }
              }}
              className={`group relative w-full text-left rounded-full px-3 py-2.5 pr-10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:focus-visible:ring-white/25 ${
                conversationId === c.id
                  ? 'bg-zinc-200/80 border border-zinc-300/90 dark:bg-white/[0.1] dark:border-white/15'
                  : 'border border-transparent hover:bg-zinc-100/90 dark:hover:bg-white/[0.05]'
              }`}
            >
              <p className="text-sm text-zinc-800 dark:text-white/90 line-clamp-2 leading-snug">{c.title}</p>
              <button
                type="button"
                onClick={(e) => deleteConversation(c.id, e)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-400 hover:text-red-600 dark:text-white/35 dark:hover:text-red-300 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                aria-label="Delete chat"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        </aside>
        {user ? (
          <div
            className={`shrink-0 flex items-center rounded-full border border-zinc-200/90 bg-white/90 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-white/[0.06] dark:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.45)] transition-colors hover:bg-zinc-50/90 dark:hover:bg-white/[0.04] ${
              sidebarOpen ? 'gap-2 px-2.5 py-2.5' : 'gap-2 px-2.5 py-2.5 md:justify-center md:gap-0 md:px-2 md:py-2'
            }`}
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-zinc-300/80 dark:ring-white/15 bg-zinc-200/50 dark:bg-white/10"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-100 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-300/80 dark:from-white/15 dark:to-white/5 dark:text-white/85 dark:ring-white/15"
                aria-hidden
              >
                {accountInitials(user)}
              </div>
            )}
            <div className={`min-w-0 flex-1 ${sidebarOpen ? '' : 'md:hidden'}`}>
              <p className="truncate text-sm font-medium leading-tight text-zinc-800 dark:text-white/90">
                {accountDisplayName(user)}
              </p>
              <p className="truncate text-[10px] leading-tight text-zinc-500 dark:text-white/35">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSettingsNotice('');
                setSettingsSection('account');
                setSettingsOpen(true);
              }}
              className={`shrink-0 rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:text-white/40 dark:hover:bg-white/[0.1] dark:hover:text-white/75 dark:focus-visible:ring-white/25 ${
                sidebarOpen ? '' : 'md:hidden'
              }`}
              aria-label="Open settings"
            >
              <Settings className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div
            className={`shrink-0 border border-zinc-200/90 bg-white/90 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-white/[0.06] dark:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.45)] ${
              sidebarOpen ? 'space-y-2 rounded-2xl p-3' : 'rounded-full p-2 max-md:space-y-2 max-md:rounded-2xl max-md:p-3 md:flex md:flex-col md:items-center md:justify-center md:gap-0 md:space-y-0'
            }`}
          >
            <div
              className={`flex items-center justify-between gap-2 rounded-full border border-zinc-200/80 bg-zinc-50/60 dark:border-white/[0.08] dark:bg-white/[0.04] ${
                sidebarOpen ? 'px-2 py-2' : 'px-2 py-2 max-md:px-2 md:border-0 md:bg-transparent md:p-0'
              }`}
            >
              <span className={`text-xs font-medium text-zinc-600 dark:text-white/50 ${sidebarOpen ? '' : 'md:sr-only'}`}>
                Display
              </span>
              <button
                type="button"
                onClick={() => {
                  setSettingsNotice('');
                  setSettingsSection('appearance');
                  setSettingsOpen(true);
                }}
                className="shrink-0 rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-white dark:focus-visible:ring-white/25"
                aria-label="Theme and display settings"
              >
                <Settings className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className={`px-1 text-[10px] leading-relaxed text-zinc-500 dark:text-white/30 ${sidebarOpen ? '' : 'md:hidden'}`}>
              Firebase is off — chats stay on this device. Use Display to change the site theme.
            </p>
          </div>
        )}
      </div>

      {/* Mobile backdrop — tap to close sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main
        className={`relative z-10 h-screen min-h-0 w-full overflow-hidden px-4 transition-[margin] duration-200 ease-out sm:px-6 md:py-6 ${
          sidebarOpen ? 'md:ml-[calc(18rem+2.5rem)]' : 'md:ml-[calc(3.5rem+2.5rem)]'
        } max-md:pb-[max(1rem,env(safe-area-inset-bottom,0px))] max-md:pt-[max(0.5rem,calc(env(safe-area-inset-top,0px)+3.5rem))]`}
      >
        <div className={`mx-auto flex h-full flex-col ${isHome ? 'max-w-3xl' : 'max-w-2xl'}`}>
        {apiOk === false ? (
          <div className="mb-4 rounded-xl border border-amber-500/35 bg-amber-500/[0.12] px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-50/95">
            <p className="font-semibold text-amber-950 dark:text-amber-100">Chat API is not available here.</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/85">
              Static hosts (for example Cloudflare Pages) do not run the Node chat server. Deploy{' '}
              <code className="rounded bg-black/10 px-1 font-mono text-[10px] dark:bg-black/30">server/chat-api.mjs</code>{' '}
              on a host with Node, set{' '}
              <code className="rounded bg-black/10 px-1 font-mono text-[10px] dark:bg-black/30">VITE_PUBLIC_API_ORIGIN</code>{' '}
              to that API&apos;s origin in your Pages build environment, then redeploy. Locally,{' '}
              <code className="rounded bg-black/10 px-1 font-mono text-[10px] dark:bg-black/30">npm run dev:all</code>{' '}
              proxies <code className="rounded bg-black/10 px-1 font-mono text-[10px] dark:bg-black/30">/api</code>.
            </p>
          </div>
        ) : null}

        {isHome ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-1 pb-4 pt-2 sm:gap-8 sm:pb-6">
              <div className="flex flex-col items-center text-center">
                <img
                  src={modulonIcon}
                  alt=""
                  decoding="async"
                  className="mb-4 h-11 w-11 object-contain opacity-90 dark:opacity-95 sm:h-12 sm:w-12"
                />
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                  {translatedHomeGreeting(user, t)}
                </h1>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-white/45">
                  {t('chat.homeHint')}
                </p>
              </div>
              {sending ? (
                <div className="flex w-full max-w-md justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-zinc-200/90 bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-white/40">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-white/40" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-white/40" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-white/40" style={{ animationDelay: '300ms' }} />
                    </span>
                    {t('chat.thinking')}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {loadingMessages && conversationId ? (
              <p className="mb-2 text-xs text-zinc-500 dark:text-white/35">{t('chat.loadingMessages')}</p>
            ) : null}
            <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-black rounded-br-md'
                    : msg.error
                      ? 'bg-red-500/15 text-red-800 border border-red-500/30 dark:text-red-100/90 dark:border-red-500/25 rounded-bl-md'
                      : 'bg-white text-zinc-800 border border-zinc-200/90 shadow-sm dark:bg-white/[0.06] dark:text-white/85 dark:border-white/[0.08] dark:shadow-none rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                {msg.prototype ? (
                  <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-white/35">
                    prototype reply
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-zinc-100 border border-zinc-200/90 text-sm text-zinc-500 flex items-center gap-2 dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-white/40">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                {t('chat.thinking')}
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
          </>
        )}

        {err ? (
          <p className="text-xs text-red-600 dark:text-red-300/90 mb-2 font-mono whitespace-pre-wrap">{err}</p>
        ) : null}

        <form
          className={`max-md:pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] ${
            isHome ? 'pt-2' : 'border-t border-zinc-200/80 pt-2 dark:border-white/[0.06]'
          }`}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div
            className={`flex w-full items-center gap-0.5 border bg-white transition-shadow focus-within:ring-2 dark:bg-black/35 dark:shadow-none ${
              isHome
                ? 'rounded-2xl border-zinc-300/90 px-3 py-2 shadow-md focus-within:border-zinc-400/90 focus-within:ring-zinc-400/35 dark:border-white/12 dark:focus-within:border-white/22 dark:focus-within:ring-white/15'
                : 'rounded-full border-zinc-300/90 px-3 py-1.5 shadow-sm focus-within:border-zinc-400/90 focus-within:ring-zinc-400/35 dark:border-white/10 dark:focus-within:border-white/20 dark:focus-within:ring-white/15'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              tabIndex={-1}
              multiple
              aria-hidden
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              multiple
              aria-hidden
            />
            <div ref={attachControlsRef} className="relative shrink-0">
              <button
                ref={attachPlusRef}
                type="button"
                onClick={() => {
                  setModelMenuOpen(false);
                  setAttachMenuOpen((o) => !o);
                }}
                disabled={sending || apiOk === false}
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
                aria-label="Add to message"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-zinc-600 transition-colors hover:bg-zinc-200/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 disabled:pointer-events-none disabled:opacity-35 dark:text-white/75 dark:hover:bg-white/[0.1] dark:focus-visible:ring-white/25"
              >
                <Plus className="h-5 w-5" aria-hidden strokeWidth={2} />
              </button>
            </div>
            {attachMenuOpen && attachMenuPos ? (
              <div
                ref={attachMenuRef}
                role="menu"
                aria-label="Add attachment"
                className="fixed z-[80] w-52 overflow-hidden rounded-xl border border-zinc-200/90 bg-white py-1 text-sm shadow-xl dark:border-white/[0.12] dark:bg-[#121214]"
                style={{ top: attachMenuPos.top, left: attachMenuPos.left }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-zinc-800 hover:bg-zinc-100 dark:text-white/90 dark:hover:bg-white/[0.06]"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setAttachMenuOpen(false);
                  }}
                >
                  <File className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  File
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-zinc-800 hover:bg-zinc-100 dark:text-white/90 dark:hover:bg-white/[0.06]"
                  onClick={() => {
                    imageInputRef.current?.click();
                    setAttachMenuOpen(false);
                  }}
                >
                  <Image className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  Photo
                </button>
              </div>
            ) : null}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isHome ? t('chat.messagePlaceholder') : t('chat.typeMessage')}
              disabled={sending || apiOk === false}
              className="min-w-0 flex-1 border-0 bg-transparent py-2.5 pl-0.5 pr-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-45 dark:text-white/90 dark:placeholder:text-white/25"
              autoComplete="off"
              aria-label="Message"
            />
            <button
              ref={modelPickerBtnRef}
              type="button"
              onClick={() => {
                setAttachMenuOpen(false);
                setModelMenuOpen((o) => !o);
              }}
              disabled={sending || apiOk === false}
              aria-expanded={modelMenuOpen}
              aria-haspopup="menu"
              aria-label={`Model: ${selectedModel.label}`}
              className="inline-flex h-11 min-w-0 max-w-[7rem] shrink-0 items-center gap-0.5 rounded-full border border-transparent px-2 text-[11px] font-medium leading-tight text-zinc-600 transition-colors hover:border-zinc-200/80 hover:bg-zinc-100/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 disabled:pointer-events-none disabled:opacity-35 dark:text-white/65 dark:hover:border-white/15 dark:hover:bg-white/[0.06] dark:focus-visible:ring-white/25 sm:max-w-[min(52vw,11rem)] sm:text-xs"
            >
              <span className="min-w-0 truncate">{selectedModel.label}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden strokeWidth={2} />
            </button>
            {modelMenuOpen && modelMenuPos ? (
              <div
                ref={modelSelectMenuRef}
                role="menu"
                aria-label="Models"
                className="fixed z-[80] w-56 overflow-hidden rounded-xl border border-zinc-200/90 bg-white py-1 text-sm shadow-xl dark:border-white/[0.12] dark:bg-[#121214]"
                style={{ left: modelMenuPos.left, bottom: modelMenuPos.bottom }}
              >
                <div className="max-h-72 overflow-y-auto no-scrollbar">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setSelectedModel({ id: 'modulon', label: MODULON_CHAT_MODEL_LABEL, provider: 'modulon' }); setModelMenuOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      selectedModel.id === 'modulon'
                        ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-white/[0.08] dark:text-white'
                        : 'text-zinc-800 hover:bg-zinc-50 dark:text-white/85 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{MODULON_CHAT_MODEL_LABEL}</span>
                    {selectedModel.id === 'modulon' && <Check className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />}
                  </button>
                  {Object.entries(PROVIDER_MODELS).filter(([pid]) => apiKeys[pid]).map(([pid, group]) => (
                    <React.Fragment key={pid}>
                      <div className="mx-3 my-1 border-t border-zinc-100 dark:border-white/[0.06]" />
                      <p className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400 dark:text-white/30">
                        {group.label}
                      </p>
                      {group.models.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          role="menuitem"
                          onClick={() => { setSelectedModel({ id: m.id, label: m.label, provider: pid }); setModelMenuOpen(false); }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                            selectedModel.id === m.id
                              ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-white/[0.08] dark:text-white'
                              : 'text-zinc-800 hover:bg-zinc-50 dark:text-white/85 dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate">{m.label}</span>
                          {selectedModel.id === m.id && <Check className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />}
                        </button>
                      ))}
                    </React.Fragment>
                  ))}
                  {!Object.keys(PROVIDER_MODELS).some(pid => apiKeys[pid]) && (
                    <p className="px-3 py-2 text-center text-xs italic text-zinc-400 dark:text-white/30">
                      Add API keys in Settings → API Keys
                    </p>
                  )}
                </div>
              </div>
            ) : null}
            <button
              type="submit"
              disabled={sending || !input.trim() || apiOk === false}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-zinc-600 transition-colors hover:bg-zinc-200/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 disabled:pointer-events-none disabled:opacity-35 dark:text-white/75 dark:hover:bg-white/[0.1] dark:focus-visible:ring-white/25"
              aria-label="Send"
            >
              <Send className="h-5 w-5" aria-hidden strokeWidth={2} />
            </button>
          </div>
        </form>
        </div>
      </main>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-stretch justify-center p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-settings-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] dark:bg-black/35 sm:bg-black/50 sm:backdrop-blur-sm dark:sm:bg-black/45"
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="relative z-10 flex h-[100dvh] w-full max-w-none flex-col overflow-hidden border-0 bg-white/85 shadow-none backdrop-blur-2xl dark:bg-white/[0.07] dark:backdrop-blur-2xl sm:h-[min(84vh,640px)] sm:min-h-[min(380px,68vh)] sm:max-w-[min(92vw,56rem)] sm:rounded-2xl sm:border sm:border-zinc-200/60 sm:bg-white/90 sm:shadow-[0_24px_80px_rgba(0,0,0,0.12)] dark:sm:border-white/[0.1] dark:sm:bg-white/[0.08] dark:sm:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/40 bg-transparent px-4 py-3.5 dark:border-white/[0.06] max-sm:pt-[max(0.875rem,env(safe-area-inset-top,0px))] sm:px-5 sm:py-4">
              <h2 id="chat-settings-title" className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-xl">
                Settings
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-white dark:focus-visible:ring-white/25"
                aria-label="Close settings"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-transparent sm:flex-row">
              <nav
                className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-zinc-200/20 bg-transparent p-2 no-scrollbar dark:border-white/[0.04] sm:w-52 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:border-zinc-200/15 sm:bg-transparent dark:sm:border-white/[0.04]"
                aria-label="Settings sections"
              >
                {[
                  ...(user
                    ? [
                        { id: 'account', label: 'Account', Icon: User },
                        { id: 'security', label: 'Security', Icon: Shield },
                      ]
                    : []),
                  { id: 'appearance', label: 'Appearance', Icon: Palette },
                  { id: 'usage', label: 'Usage', Icon: BarChart3 },
                  { id: 'apikeys', label: 'API Keys', Icon: Key },
                  { id: 'about', label: 'About', Icon: Info },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSettingsSection(id)}
                    aria-current={settingsSection === id ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors sm:w-full ${
                      settingsSection === id
                        ? 'bg-zinc-200/90 text-zinc-900 ring-1 ring-zinc-300/80 dark:bg-white/[0.12] dark:text-white dark:ring-white/10'
                        : 'text-zinc-600 hover:bg-zinc-100/90 hover:text-zinc-900 dark:text-white/50 dark:hover:bg-white/[0.06] dark:hover:text-white/80'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                    {label}
                  </button>
                ))}
              </nav>

              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] no-scrollbar sm:p-6 sm:pb-6">
                {settingsNotice ? (
                  <p
                    className={`mb-5 text-xs font-mono rounded-lg px-3 py-2.5 border ${
                      settingsNotice.startsWith('Error')
                        ? 'border-red-500/30 bg-red-500/10 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200/90'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200/90'
                    }`}
                  >
                    {settingsNotice}
                  </p>
                ) : null}

                {settingsSection === 'account' && user ? (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
                        Signed in as
                      </p>
                      <div className="flex items-center gap-4 rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-4 dark:border-white/[0.1] dark:bg-white/[0.05]">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt=""
                            className="h-16 w-16 shrink-0 rounded-full bg-zinc-200 object-cover ring-1 ring-zinc-300/80 dark:bg-white/10 dark:ring-white/15 sm:h-[4.5rem] sm:w-[4.5rem]"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-100 text-base font-semibold text-zinc-700 ring-1 ring-zinc-300/80 dark:from-white/15 dark:to-white/5 dark:text-white/85 dark:ring-white/15 sm:h-[4.5rem] sm:w-[4.5rem] sm:text-lg">
                            {accountInitials(user)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-medium text-zinc-900 dark:text-white sm:text-lg">
                            {accountDisplayName(user)}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-xs text-zinc-500 dark:text-white/40 sm:text-sm">{user.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="sm:max-w-md">
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsOpen(false);
                          void signOutUser().then(() => navigate('/', { replace: true }));
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-800 hover:bg-red-500/15 dark:text-red-200/90"
                      >
                        <LogOut className="h-4 w-4" aria-hidden />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : null}

                {settingsSection === 'appearance' ? (
                  <div className="max-w-lg space-y-4">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
                      Color theme
                    </p>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/45">
                      Choose how Modulon looks across the site. &ldquo;System&rdquo; follows your device light or dark
                      mode.
                    </p>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color theme">
                      {[
                        { id: 'dark', label: 'Dark', Icon: Moon },
                        { id: 'light', label: 'Light', Icon: Sun },
                        { id: 'system', label: 'System', Icon: Monitor },
                      ].map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={theme === id}
                          onClick={() => setTheme(id)}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                            theme === id
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white/25 dark:bg-white/[0.14] dark:text-white'
                              : 'border-zinc-300/90 text-zinc-700 hover:bg-zinc-100 dark:border-white/15 dark:text-white/75 dark:hover:bg-white/[0.06]'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {settingsSection === 'security' && user ? (
                  <div className="max-w-lg space-y-4">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">Password</p>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/45">
                      Sends a password reset link to your account email via Firebase Auth. Use the link in the email
                      to choose a new password.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        setSettingsNotice('');
                        try {
                          await sendPasswordReset(user.email);
                          setSettingsNotice('Check your email for a password reset link.');
                        } catch (err) {
                          setSettingsNotice(`Error: ${mapAuthError(err)}`);
                        }
                      }}
                      className="rounded-xl border border-zinc-300/90 px-4 py-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/[0.06]"
                    >
                      Send password reset email
                    </button>
                  </div>
                ) : null}

                {settingsSection === 'usage' ? (
                  <div className="w-full space-y-8">
                    <section className="space-y-4">
                      <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
                        Daily Usage
                      </h3>
                      <UsageProgressBar
                        period="daily"
                        label="Messages you send"
                        current={dailyUsage.messages}
                        cap={extraUsage ? DAILY_MESSAGE_CAP_EXTRA : DAILY_MESSAGE_CAP}
                      />
                    </section>

                    <div className="h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-white/[0.08]" />

                    <section className="space-y-4">
                      <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
                        Weekly Usage
                      </h3>
                      <UsageProgressBar
                        period="weekly"
                        label="Messages you send"
                        current={weeklyUsage.messages}
                        cap={extraUsage ? WEEKLY_MESSAGE_CAP_EXTRA : WEEKLY_MESSAGE_CAP}
                      />
                    </section>

                    <div className="h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-white/[0.08]" />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium text-zinc-900 dark:text-white">Extra usage</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={extraUsage}
                          aria-label="Extra usage"
                          onClick={() => {
                            const next = !extraUsage;
                            setExtraUsage(next);
                            writeExtraUsage(next);
                          }}
                          className={`flex h-6 w-[3.25rem] shrink-0 items-center rounded-full p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-white/30 ${
                            extraUsage
                              ? 'justify-end bg-emerald-600 dark:bg-emerald-500'
                              : 'justify-start bg-zinc-300 dark:bg-zinc-600'
                          }`}
                        >
                          <span className="pointer-events-none h-5 w-8 rounded-full bg-white shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-500 dark:text-white/40">Extra usage credits</p>
                          <p className="mt-1 font-mono text-xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-white">
                            {formatCreditsMoney(extraUsageCredits)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSettingsNotice('Buying extra usage is not available yet — no payment is connected.')
                          }
                          className="shrink-0 rounded-xl border border-zinc-300/90 px-4 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-white/85 dark:hover:bg-white/[0.06]"
                        >
                          Buy more extra usage
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {settingsSection === 'apikeys' ? (
                  <div className="w-full space-y-6">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
                        Provider API Keys
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-white/45">
                        Keys are stored locally in your browser and sent with requests to each provider.
                      </p>
                    </div>
                    {[
                      { id: 'anthropic', label: 'Anthropic',      hint: 'sk-ant-…',  dot: 'bg-amber-500'   },
                      { id: 'openai',    label: 'OpenAI',          hint: 'sk-…',      dot: 'bg-emerald-500' },
                      { id: 'google',    label: 'Google (Gemini)', hint: 'AIza…',     dot: 'bg-blue-500'    },
                      { id: 'xai',       label: 'xAI (Grok)',      hint: 'xai-…',     dot: 'bg-purple-500'  },
                      { id: 'deepseek',  label: 'DeepSeek',         hint: 'sk-…',      dot: 'bg-sky-500'     },
                    ].map(({ id, label, hint, dot }) => (
                      <div key={id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
                          <span className="text-sm font-medium text-zinc-900 dark:text-white">{label}</span>
                          {apiKeys[id] ? (
                            <span className="ml-auto text-xs font-medium text-emerald-600 dark:text-emerald-400">Saved</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative min-w-0 flex-1">
                            <input
                              type={apiKeysVisible[id] ? 'text' : 'password'}
                              placeholder={hint}
                              value={apiKeyDrafts[id]}
                              onChange={e => setApiKeyDrafts(prev => ({ ...prev, [id]: e.target.value }))}
                              className="w-full rounded-xl border border-zinc-300/90 bg-transparent px-3 py-2.5 font-mono text-sm text-zinc-900 placeholder-zinc-400/60 focus:border-zinc-400 focus:outline-none dark:border-white/15 dark:text-white dark:placeholder-white/20 dark:focus:border-white/30"
                              autoComplete="off"
                              spellCheck={false}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setApiKeysVisible(prev => ({ ...prev, [id]: !prev[id] }))}
                            aria-label={apiKeysVisible[id] ? 'Hide key' : 'Show key'}
                            className="shrink-0 rounded-xl border border-zinc-300/90 p-2.5 text-zinc-500 hover:bg-zinc-100 dark:border-white/15 dark:text-white/45 dark:hover:bg-white/[0.06]"
                          >
                            {apiKeysVisible[id]
                              ? <EyeOff className="h-4 w-4" aria-hidden />
                              : <Eye className="h-4 w-4" aria-hidden />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = { ...apiKeys, [id]: apiKeyDrafts[id] };
                              setApiKeys(next);
                              writeApiKeys(next);
                              setSettingsNotice(apiKeyDrafts[id] ? `${label} key saved.` : `${label} key cleared.`);
                            }}
                            className="shrink-0 rounded-xl border border-zinc-300/90 px-3.5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/[0.06]"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {settingsSection === 'about' ? (
                  <div className="max-w-lg space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-white/45">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">Modulon chat</p>
                    <p>
                      Conversations are stored for this session and workspace. When Firebase is enabled, your account
                      is used for sign-in only; manage credentials and recovery from this panel.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="Sidebar chat actions"
          className="fixed z-[99] min-w-[13.5rem] rounded-xl border border-zinc-200/90 bg-white/95 py-1 text-sm shadow-xl backdrop-blur-md dark:border-white/[0.12] dark:bg-[#121214]/95 dark:shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(() => {
            const cmConvo = contextMenu.conversationId
              ? conversations.find((c) => c.id === contextMenu.conversationId)
              : null;
            const sel =
              typeof window !== 'undefined' ? window.getSelection?.()?.toString().trim() ?? '' : '';
            return (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!cmConvo}
                  onClick={openConvoFromMenu}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-800 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40 dark:text-white/90 dark:hover:bg-white/[0.06]"
                >
                  <MessageCircle className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  Open chat
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!cmConvo?.title}
                  onClick={() => void copyConvoTitleFromMenu()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-800 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40 dark:text-white/90 dark:hover:bg-white/[0.06]"
                >
                  <ClipboardCopy className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  Copy title
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!cmConvo}
                  onClick={() => void deleteConvoFromMenu()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-700 hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-500/15"
                >
                  <Trash2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  Delete chat
                </button>
                <div className="my-1 h-px bg-zinc-200/80 dark:bg-white/[0.08]" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={!sel}
                  onClick={() => void copySelectionFromMenu()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-800 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40 dark:text-white/90 dark:hover:bg-white/[0.06]"
                >
                  <Copy className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  Copy selection
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={openSettingsFromMenu}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-800 hover:bg-zinc-100 dark:text-white/90 dark:hover:bg-white/[0.06]"
                >
                  <Settings className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  Open settings
                </button>
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
