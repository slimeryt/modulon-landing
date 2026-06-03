import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowLeft, Clock, Cpu, Globe, RefreshCw, Server } from 'lucide-react';

const API = (() => {
  const origin = (import.meta.env.VITE_PUBLIC_API_ORIGIN || '').trim().replace(/\/$/, '');
  return origin ? `${origin}/api` : '/api';
})();

const STATUS_HISTORY_KEY = 'modulon-status-day-history';
const STATUS_BAR_DAYS = 36;

function formatDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readDayHistory() {
  try {
    const raw = localStorage.getItem(STATUS_HISTORY_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (o == null || typeof o !== 'object' || Array.isArray(o)) return {};
    return o;
  } catch {
    return {};
  }
}

const LEVEL_RANK = { ok: 1, degraded: 2, outage: 3 };

function worseLevel(a, b) {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/** Legacy string or { worst, checks[] } from localStorage. */
function parseDayEntry(raw) {
  if (raw == null) return { worst: null, checks: [] };
  if (raw === 'ok' || raw === 'degraded' || raw === 'outage') return { worst: raw, checks: [] };
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const worst =
      raw.worst === 'ok' || raw.worst === 'degraded' || raw.worst === 'outage' ? raw.worst : null;
    const checks = Array.isArray(raw.checks)
      ? raw.checks.filter((c) => c && typeof c.at === 'string')
      : [];
    return { worst, checks: checks.slice(-40) };
  }
  return { worst: null, checks: [] };
}

function parseDayKeyToDate(dayKey) {
  const parts = dayKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/** When the service is reachable, seed any past empty days as 'ok' so the bar is always full. */
function seedUnknownDaysAsOk() {
  const map = { ...readDayHistory() };
  const today = new Date();
  let changed = false;
  for (let i = STATUS_BAR_DAYS - 1; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatDayKey(d);
    if (!map[key]) {
      map[key] = { worst: 'ok', checks: [] };
      changed = true;
    }
  }
  if (changed) {
    try { localStorage.setItem(STATUS_HISTORY_KEY, JSON.stringify(map)); } catch { /* ignore */ }
  }
}

function persistProbeSnapshot(snapError, snapPayload) {
  let level = 'ok';
  let detail = null;
  if (snapError) {
    level = 'outage';
    detail = snapError;
  } else if (!snapPayload?.ok) {
    level = 'outage';
    detail = 'Health response not OK';
  } else if (snapPayload.modelReady !== true) {
    level = 'degraded';
    detail = 'Inference not ready';
  }

  const day = formatDayKey(new Date());
  const map = { ...readDayHistory() };
  const parsed = parseDayEntry(map[day]);
  const checks = [
    ...parsed.checks,
    {
      at: new Date().toISOString(),
      level,
      detail,
      apiOk: !!snapPayload?.ok,
      modelReady: snapPayload?.modelReady === true,
    },
  ].slice(-40);
  const worst = parsed.worst == null ? level : worseLevel(parsed.worst, level);
  map[day] = { worst, checks };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STATUS_BAR_DAYS - 2);
  const cutoffKey = formatDayKey(cutoff);
  for (const k of Object.keys(map)) {
    if (k < cutoffKey) delete map[k];
  }

  try {
    localStorage.setItem(STATUS_HISTORY_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }

  // If the service is reachable today, assume unknown past days were also ok.
  if (!snapError && snapPayload?.ok) seedUnknownDaysAsOk();
}

function buildDayBars(historyMap) {
  const out = [];
  const today = new Date();
  for (let i = STATUS_BAR_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatDayKey(d);
    const parsed = parseDayEntry(historyMap[key]);
    const state = parsed.worst == null ? 'unknown' : parsed.worst;
    out.push({
      key,
      state,
      checks: parsed.checks,
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    });
  }
  return out;
}

function barLabel(state) {
  if (state === 'ok') return 'Operational';
  if (state === 'degraded') return 'Degraded';
  if (state === 'outage') return 'Unavailable';
  return 'No check this day';
}

function levelShort(level) {
  if (level === 'ok') return 'OK';
  if (level === 'degraded') return 'Degraded';
  if (level === 'outage') return 'Down';
  return level;
}

function DayHoverCard({ anchorLeft, anchorTop, anchorBottom, dayKey, state, checks, onPointerEnterCard, onPointerLeave }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999, ready: false });

  const dateLine = useMemo(
    () =>
      parseDayKeyToDate(dayKey).toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [dayKey],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;

    let left = anchorLeft - r.width / 2;
    left = Math.max(pad, Math.min(left, vw - pad - r.width));

    let top = anchorTop - gap - r.height;
    if (top < pad) {
      top = anchorBottom + gap;
    }
    if (top + r.height > vh - pad) {
      top = Math.max(pad, vh - pad - r.height);
    }

    setPos({ left, top, ready: true });
  }, [anchorLeft, anchorTop, anchorBottom, dayKey, state, checks]);

  const recent = useMemo(() => [...checks].reverse().slice(0, 14), [checks]);
  const issues = useMemo(() => {
    const rows = [];
    const seen = new Set();
    for (const c of [...checks].reverse()) {
      if (c.level === 'ok' && !c.detail) continue;
      const text =
        c.detail ||
        (c.level === 'degraded'
          ? 'Degraded (model not ready)'
          : c.level === 'outage'
            ? 'Unavailable'
            : '');
      if (!text) continue;
      const k = `${c.at}|${text}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ at: c.at, text, level: c.level });
      if (rows.length >= 6) break;
    }
    return rows;
  }, [checks]);

  const card = (
    <div
      ref={ref}
      role="tooltip"
      className="fixed z-[200] box-border max-h-[min(70vh,calc(100vh-24px))] w-[min(18rem,calc(100vw-24px))] overflow-y-auto rounded-xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 text-left text-xs shadow-xl backdrop-blur-md dark:border-white/[0.12] dark:bg-[#141416]/95 dark:shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
      style={{
        left: pos.left,
        top: pos.top,
        opacity: pos.ready ? 1 : 0,
      }}
      onPointerEnter={onPointerEnterCard}
      onPointerLeave={onPointerLeave}
    >
      <p className="font-semibold text-zinc-900 dark:text-white/95">{dateLine}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-white/45">
        Day summary: <span className="font-medium text-zinc-700 dark:text-white/70">{barLabel(state)}</span>
      </p>

      {recent.length > 0 ? (
        <div className="mt-2.5 border-t border-zinc-200/80 pt-2 dark:border-white/[0.08]">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-white/40">
            <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            Recent checks
          </p>
          <ul className="space-y-1 text-[11px] leading-snug text-zinc-600 dark:text-white/55">
            {recent.map((c) => (
              <li key={c.at} className="flex gap-2 font-mono">
                <span className="shrink-0 text-zinc-400 dark:text-white/35">
                  {new Date(c.at).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="min-w-0 text-zinc-700 dark:text-white/75">{levelShort(c.level)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 border-t border-zinc-200/80 pt-2 text-[11px] text-zinc-500 dark:text-white/40 dark:border-white/[0.08]">
          No timed checks stored for this day yet (legacy data has color only).
        </p>
      )}

      {issues.length > 0 ? (
        <div className="mt-2.5 border-t border-zinc-200/80 pt-2 dark:border-white/[0.08]">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700/90 dark:text-amber-300/85">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            Issues
          </p>
          <ul className="space-y-1.5 text-[11px] leading-snug text-zinc-700 dark:text-white/75">
            {issues.map((row) => (
              <li key={`${row.at}-${row.text}`} className="flex gap-2">
                <span className="shrink-0 font-mono text-zinc-400 dark:text-white/35">
                  {new Date(row.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="min-w-0">{row.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  return createPortal(card, document.body);
}

/** Full-viewport-width scroll strip; must sit outside any max-w column parent. */
function StatusHistoryTrack({ historyMap }) {
  const days = useMemo(() => buildDayBars(historyMap), [historyMap]);
  const first = days[0]?.label;
  const last = days[days.length - 1]?.label;
  const [tip, setTip] = useState(null);
  const hideTimer = useRef(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setTip(null);
    }, 180);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const showTip = useCallback(
    (e, day) => {
      clearHideTimer();
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      setTip({
        anchorLeft: rect.left + rect.width / 2,
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
        dayKey: day.key,
        state: day.state,
        checks: day.checks,
      });
    },
    [clearHideTimer],
  );

  return (
    <>
      <div className="w-full pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div className="flex w-full justify-center overflow-x-auto no-scrollbar py-0.5">
          <div className="w-max shrink-0 rounded-2xl border border-zinc-200/85 bg-white/85 px-3 py-2.5 shadow-sm backdrop-blur-sm dark:border-white/[0.1] dark:bg-white/[0.06] dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.45)]">
            <div
              className="flex h-12 items-stretch gap-1 sm:gap-1.5"
              role="img"
              aria-label="Status history by day, last several weeks"
            >
              {days.map((day) => (
                <div
                  key={day.key}
                  className={`h-full w-2 shrink-0 cursor-help rounded-full sm:w-2.5 ${
                    day.state === 'ok'
                      ? 'bg-emerald-500/85 shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)] dark:bg-emerald-500/70'
                      : day.state === 'degraded'
                        ? 'bg-amber-400/90 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] dark:bg-amber-400/75'
                        : day.state === 'outage'
                          ? 'bg-rose-500/85 shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)] dark:bg-rose-500/70'
                          : 'bg-zinc-300/55 dark:bg-white/[0.08]'
                  }`}
                  onPointerEnter={(e) => showTip(e, day)}
                  onPointerLeave={scheduleHide}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 px-0.5 font-mono text-[10px] text-zinc-400 dark:text-white/30">
              <span>{first}</span>
              <span>{last}</span>
            </div>
          </div>
        </div>
      </div>
      {tip ? (
        <DayHoverCard
          anchorLeft={tip.anchorLeft}
          anchorTop={tip.anchorTop}
          anchorBottom={tip.anchorBottom}
          dayKey={tip.dayKey}
          state={tip.state}
          checks={tip.checks}
          onPointerEnterCard={clearHideTimer}
          onPointerLeave={scheduleHide}
        />
      ) : null}
    </>
  );
}

function StatusSnapshotLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] text-zinc-500 dark:text-white/35">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500/85 dark:bg-emerald-500/70" aria-hidden />
        Operational
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-400/90 dark:bg-amber-400/75" aria-hidden />
        Degraded
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-rose-500/85 dark:bg-rose-500/70" aria-hidden />
        Unavailable
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-zinc-300/55 dark:bg-white/[0.08]" aria-hidden />
        No data
      </span>
    </div>
  );
}

function StatusRow({ icon: Icon, title, description, state, detail }) {
  const ok = state === 'operational';
  const degraded = state === 'degraded';
  const checking = state === 'checking';
  const down = state === 'outage';
  const unknown = state === 'unknown';

  const badge = ok
    ? 'bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-200/90 dark:ring-emerald-400/20'
    : degraded
      ? 'bg-amber-500/15 text-amber-900 ring-amber-500/30 dark:text-amber-100/90 dark:ring-amber-400/25'
      : checking
        ? 'bg-sky-500/12 text-sky-900 ring-sky-500/25 dark:text-sky-100/85 dark:ring-sky-400/20'
        : unknown
          ? 'bg-zinc-400/12 text-zinc-700 ring-zinc-400/25 dark:text-white/55 dark:ring-white/12'
          : 'bg-zinc-500/15 text-zinc-700 ring-zinc-500/20 dark:text-white/70 dark:ring-white/15';

  const label = ok
    ? 'Operational'
    : degraded
      ? 'Degraded'
      : checking
        ? 'Checking…'
        : unknown
          ? 'Unknown'
          : down
            ? 'Unavailable'
            : 'Unknown';

  return (
    <div className="flex gap-4 rounded-2xl border border-zinc-200/90 bg-white/80 px-4 py-4 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-white/70">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white/95">{title}</h2>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${badge}`}
          >
            {label}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-white/40">{description}</p>
        {detail ? (
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-400 dark:text-white/30">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  const [historyMap, setHistoryMap] = useState(() => ({}));

  useEffect(() => {
    setHistoryMap(readDayHistory());
  }, []);

  const probe = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    let snapError = null;
    let snapPayload = null;
    try {
      const r = await fetch(`${API}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const ms = Math.round(performance.now() - t0);
      setLatencyMs(ms);
      setCheckedAt(new Date());
      if (!r.ok) {
        setPayload(null);
        snapError = `HTTP ${r.status}`;
        setError(snapError);
        return;
      }
      const j = await r.json();
      snapPayload = j;
      setPayload(j);
    } catch (e) {
      setLatencyMs(null);
      setPayload(null);
      snapError = e.message || String(e);
      setError(snapError);
      setCheckedAt(new Date());
    } finally {
      setLoading(false);
      persistProbeSnapshot(snapError, snapPayload);
      setHistoryMap(readDayHistory());
    }
  }, []);

  useEffect(() => {
    probe();
    const id = window.setInterval(probe, 60_000);
    return () => window.clearInterval(id);
  }, [probe]);

  const apiOriginLabel = (import.meta.env.VITE_PUBLIC_API_ORIGIN || '').trim()
    ? `${(import.meta.env.VITE_PUBLIC_API_ORIGIN || '').trim().replace(/\/$/, '')}/api`
    : `${typeof window !== 'undefined' ? window.location.origin : ''}/api`;

  let apiState = 'checking';
  let apiDetail = '';
  if (loading && !checkedAt) {
    apiState = 'checking';
  } else if (error) {
    apiState = 'outage';
    apiDetail = `${error} · ${apiOriginLabel}`;
  } else if (payload?.ok) {
    apiState = 'operational';
    apiDetail =
      latencyMs != null
        ? `GET /api/health · ${latencyMs} ms · ${apiOriginLabel}`
        : `GET /api/health · ${apiOriginLabel}`;
  } else {
    apiState = 'outage';
    apiDetail = 'Unexpected response';
  }

  let modelState = 'checking';
  let modelDescription =
    'Inference worker behind the chat API. When degraded, chat may still return placeholder or error text.';
  if (loading && !checkedAt) {
    modelState = 'checking';
  } else if (error) {
    modelState = 'unknown';
    modelDescription = 'Could not reach the API to read model readiness.';
  } else if (payload?.ok && payload.modelReady) {
    modelState = 'operational';
  } else if (payload?.ok && !payload.modelReady) {
    modelState = 'degraded';
  } else {
    modelState = 'unknown';
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-100 text-zinc-900 dark:bg-[#070708] dark:text-white font-sans selection:bg-zinc-300/40 dark:selection:bg-white/20">
      <div className="pointer-events-none fixed inset-0 opacity-20 dark:opacity-[0.35] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.2),transparent)]" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="mx-auto w-full min-w-0 max-w-lg shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <header className="mb-8 flex items-center justify-between gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white/90 px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur-md transition-colors hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white/85 dark:hover:bg-white/[0.1]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Home
            </Link>
            <button
              type="button"
              onClick={() => probe()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white/90 px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur-md transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white/85 dark:hover:bg-white/[0.1]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              Refresh
            </button>
          </header>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white/95">Status</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-white/45">
              Live checks against this deployment&apos;s chat API. Refreshes automatically every minute.
            </p>
            {checkedAt ? (
              <p className="mt-2 text-[11px] font-mono text-zinc-400 dark:text-white/30">
                Last check: {checkedAt.toLocaleString()}
              </p>
            ) : null}
          </div>

          <div className="mb-4">
            <p className="text-xs font-semibold text-zinc-800 dark:text-white/85">Daily snapshot</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-white/40">
              One bar per day from checks run in this browser (worst result that day). Green API up and model ready,
              yellow model warming or partial, red unreachable.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-2 w-full shrink-0 pb-1">
          <StatusHistoryTrack historyMap={historyMap} />
        </div>

        <div className="mx-auto flex w-full min-w-0 max-w-lg flex-1 flex-col px-4 pb-12 sm:px-6">
          <StatusSnapshotLegend />

          <div className="mt-6 flex flex-col gap-3">
            <StatusRow
              icon={Globe}
              title="Web app"
              description="This page loaded from your browser. Static hosting is separate from the Node chat API."
              state="operational"
              detail={
                typeof window !== 'undefined'
                  ? `${window.location.origin} · ${import.meta.env.MODE} build`
                  : import.meta.env.MODE
              }
            />
            <StatusRow
              icon={Server}
              title="Chat API"
              description="Node server route GET /api/health. On Cloudflare Pages without a backend, this check fails until you point the build at a live API."
              state={apiState}
              detail={apiDetail || undefined}
            />
            <StatusRow
              icon={Cpu}
              title="Inference"
              description={modelDescription}
              state={modelState}
              detail={
                !error && payload && typeof payload.modelReady === 'boolean'
                  ? `modelReady: ${String(payload.modelReady)}`
                  : undefined
              }
            />
          </div>

          <footer className="mt-auto pt-10 text-center text-[10px] text-zinc-400 dark:text-white/25">
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-3 w-3" aria-hidden />
              Modulon status · not a formal SLA page
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
