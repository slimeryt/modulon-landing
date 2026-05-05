import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  FileText,
  Hash,
  Layers,
  Moon,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Square,
  Terminal,
  XCircle,
  Zap,
} from 'lucide-react';

const API = '/api';

async function api(path, opts = {}) {
  const headers = { ...opts.headers };
  const secret = import.meta.env.VITE_ADMIN_TRAIN_SECRET;
  if (secret) headers.Authorization = `Bearer ${secret}`;
  const r = await fetch(`${API}${path}`, { ...opts, headers });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  return r.json().catch(() => ({}));
}

function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function parseTrainingInsights(log) {
  if (!log || typeof log !== 'string') {
    return {
      deviceLine: null,
      gpuLine: null,
      lastEpoch: null,
      vocabLine: null,
      paramsLine: null,
    };
  }
  const lines = log.split('\n');
  let deviceLine = null;
  let gpuLine = null;
  let vocabLine = null;
  let paramsLine = null;
  let lastEpoch = null;

  const epochRe =
    /Epoch\s+(\d+)\/(\d+)\s+\|\s+Avg Loss:\s+([\d.]+(?:e[+-]?\d+)?)\s+\|\s+lr:\s+([\d.e+-]+)\s+\|\s+tf:\s+([\d.]+)\s+\|\s+Time:\s+([\d.]+)s/;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('Device:')) deviceLine = t;
    if (t.startsWith('GPU:')) gpuLine = t;
    if (t.includes('Vocab size:') && t.includes('Training pairs:')) vocabLine = t;
    if (t.startsWith('Model parameters:')) paramsLine = t;
    const m = t.match(epochRe);
    if (m) {
      lastEpoch = {
        epoch: Number(m[1]),
        total: Number(m[2]),
        loss: m[3],
        lr: m[4],
        tf: m[5],
        timeSec: m[6],
        raw: t,
      };
    }
  }

  return { deviceLine, gpuLine, lastEpoch, vocabLine, paramsLine };
}

function Card({ className = '', children }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export default function Admin() {
  const [log, setLog] = useState('');
  const [running, setRunning] = useState(false);
  const [apiOk, setApiOk] = useState(null);
  const [err, setErr] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [pid, setPid] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [logLineCount, setLogLineCount] = useState(0);
  const [meta, setMeta] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [logFilter, setLogFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startingLoop, setStartingLoop] = useState(false);
  const [loopMode, setLoopMode] = useState(false);
  const [hParams, setHParams] = useState(null);
  const [trainConfigPath, setTrainConfigPath] = useState(null);
  const [savingHparams, setSavingHparams] = useState(false);
  const [hParamMsg, setHParamMsg] = useState('');
  const logRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const s = await api('/train/status');
      setRunning(!!s.running);
      setLoopMode(!!s.continuousTraining);
      setLog(s.log || '');
      setStartedAt(s.startedAt ?? null);
      setPid(s.pid ?? null);
      setLastRun(s.lastRun ?? null);
      setLogLineCount(s.logLineCount ?? 0);
      setMeta(s.meta ?? null);
      setErr('');
      setApiOk(true);
    } catch (e) {
      setErr(
        e.message ||
          'Train API unreachable. Run: npm run dev:all (or npm run dev:api in a second terminal).'
      );
      try {
        const r = await fetch(`${API}/health`);
        setApiOk(r.ok);
      } catch {
        setApiOk(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = {};
        const secret = import.meta.env.VITE_ADMIN_TRAIN_SECRET;
        if (secret) headers.Authorization = `Bearer ${secret}`;
        const r = await fetch(`${API}/health`, { headers });
        if (!cancelled) {
          setApiOk(r.ok);
          if (r.ok) {
            const j = await r.json().catch(() => ({}));
            if (j.meta) setMeta(j.meta);
          }
        }
      } catch {
        if (!cancelled) setApiOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (apiOk !== true) return;
    poll();
    const id = setInterval(poll, 1400);
    return () => clearInterval(id);
  }, [apiOk, poll]);

  useEffect(() => {
    if (apiOk !== true) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await api('/train/config');
        if (!cancelled) {
          setHParams(d.config);
          setTrainConfigPath(d.path ?? null);
        }
      } catch {
        if (!cancelled) setHParams(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiOk]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const insights = useMemo(() => parseTrainingInsights(log), [log]);

  const elapsedMs = useMemo(() => {
    if (!running || !startedAt) return null;
    const t0 = Date.parse(startedAt);
    if (Number.isNaN(t0)) return null;
    return nowTick - t0;
  }, [running, startedAt, nowTick]);

  const lastRunDurationMs = useMemo(() => {
    if (!lastRun?.startedAt || !lastRun?.endedAt) return null;
    const a = Date.parse(lastRun.startedAt);
    const b = Date.parse(lastRun.endedAt);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return b - a;
  }, [lastRun]);

  const filteredLog = useMemo(() => {
    if (!logFilter.trim()) return log;
    const q = logFilter.trim().toLowerCase();
    return log
      .split('\n')
      .filter((line) => line.toLowerCase().includes(q))
      .join('\n');
  }, [log, logFilter]);

  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    const el = logRef.current;
    el.scrollTop = el.scrollHeight;
  }, [filteredLog, autoScroll, running]);

  const start = async () => {
    setErr('');
    setStarting(true);
    try {
      await api('/train/start', { method: 'POST' });
      setRunning(true);
      setLoopMode(false);
      poll();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setStarting(false);
    }
  };

  const startLoop = async () => {
    setErr('');
    setStartingLoop(true);
    try {
      await api('/train/start-continuous', { method: 'POST' });
      setLoopMode(true);
      setRunning(true);
      poll();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setStartingLoop(false);
    }
  };

  const stop = async () => {
    setErr('');
    try {
      await api('/train/stop', { method: 'POST' });
      setLoopMode(false);
    } catch (e) {
      setErr(e.message || String(e));
    }
    poll();
  };

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(log);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Could not copy to clipboard.');
    }
  };

  const saveHParams = async () => {
    if (!hParams) return;
    setErr('');
    setSavingHparams(true);
    setHParamMsg('');
    try {
      const d = await api('/train/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hParams),
      });
      setHParams(d.config);
      setHParamMsg('Saved. Used on the next training run.');
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSavingHparams(false);
    }
  };

  const resetHParams = async () => {
    setErr('');
    setSavingHparams(true);
    setHParamMsg('');
    try {
      await api('/train/config/reset', { method: 'POST' });
      const d = await api('/train/config');
      setHParams(d.config);
      setTrainConfigPath(d.path ?? null);
      setHParamMsg('Reverted to built-in defaults (config file removed).');
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSavingHparams(false);
    }
  };

  const setHp = (patch) => {
    setHParams((p) => (p ? { ...p, ...patch } : p));
  };

  const statusLabel =
    apiOk !== true
      ? 'API offline'
      : running
        ? loopMode
          ? 'Training (loop)'
          : 'Training'
        : loopMode
          ? 'Loop idle'
          : 'Idle';
  const statusTone =
    apiOk !== true ? 'amber' : running || loopMode ? 'emerald' : 'zinc';

  return (
    <div className="min-h-screen bg-[#070708] text-white font-sans selection:bg-white/20">
      <div className="fixed inset-0 pointer-events-none opacity-[0.35] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.25),transparent)]" />

      <header className="relative z-10 border-b border-white/[0.06] px-4 sm:px-8 py-4 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-white/45 hover:text-white text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md px-1 -ml-1"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
          Home
        </Link>
        <span className="text-white/20 hidden sm:inline">/</span>
        <span className="text-sm font-medium text-white/80 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-white/50 shrink-0" aria-hidden />
          Admin
        </span>
        <span className="sm:ml-1 text-[11px] font-mono text-white/35 uppercase tracking-widest">
          Training
        </span>
        <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2 justify-end">
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
              apiOk === true
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/35 bg-amber-500/10 text-amber-100'
            }`}
          >
            API {apiOk === true ? 'connected' : apiOk === false ? 'offline' : '…'}
          </span>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-[min(100%,1680px)] mx-auto pl-3 pr-4 sm:pl-5 sm:pr-6 lg:pl-6 lg:pr-8 py-8 sm:py-10 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-2">
              Training dashboard
            </h1>
            <p className="text-white/45 text-sm max-w-xl leading-relaxed">
              Control runs, watch live output, and skim parsed signals (device, epoch, loss) without
              digging through the whole log.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={start}
              disabled={running || apiOk === false || starting || startingLoop}
              aria-busy={starting}
              className="inline-flex items-center justify-center gap-2 bg-white text-black font-medium px-5 py-2.5 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 cursor-pointer min-h-[44px]"
            >
              <Play className="w-4 h-4 shrink-0" aria-hidden />
              {starting ? 'Starting…' : 'Start training'}
            </button>
            <button
              type="button"
              onClick={startLoop}
              disabled={
                apiOk === false || starting || startingLoop || loopMode
              }
              aria-busy={startingLoop}
              title="After each full training run finishes, start again until you press Stop"
              className="inline-flex items-center justify-center gap-2 border border-violet-400/35 bg-violet-500/10 text-violet-100 font-medium px-5 py-2.5 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-violet-500/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 cursor-pointer min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4 shrink-0" aria-hidden />
              {startingLoop ? 'Starting loop…' : 'Train in a loop'}
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={apiOk === false}
              title="Stops the current training process and turns off loop mode. Usable whenever the API is connected."
              className="inline-flex items-center justify-center gap-2 border border-white/20 text-white/90 font-medium px-5 py-2.5 rounded-xl text-sm disabled:opacity-35 disabled:cursor-not-allowed hover:border-white/35 hover:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 cursor-pointer min-h-[44px]"
            >
              <Square className="w-4 h-4 shrink-0" aria-hidden />
              Stop
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(420px,0.52fr)_minmax(380px,0.48fr)] gap-6 xl:gap-8 xl:items-stretch">
          {/* Left: log (readable width ~half row) */}
          <Card className="order-2 xl:order-1 overflow-hidden flex flex-col min-h-[min(52vh,480px)] xl:min-h-[min(70vh,720px)] xl:max-h-[min(85vh,880px)] min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-black/20 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Server className="w-4 h-4 text-white/35 shrink-0" aria-hidden />
                <span className="text-sm font-medium text-white/80">Output</span>
                <span className="text-[11px] font-mono text-white/30 truncate">{meta?.platform ?? ''}</span>
              </div>
              <div className="flex flex-1 flex-col sm:flex-row gap-2 sm:justify-end sm:items-center">
                <label className="relative flex-1 sm:max-w-xs min-w-0">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input
                    type="search"
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    placeholder="Filter lines…"
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-white/45 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded border-white/20 bg-black/40 text-emerald-500 focus:ring-emerald-500/30"
                  />
                  Auto-scroll
                </label>
                <button
                  type="button"
                  onClick={copyLogs}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-white/15 text-white/70 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 cursor-pointer min-h-[40px]"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden />
                  {copied ? 'Copied' : 'Copy all'}
                </button>
              </div>
            </div>
            <pre
              ref={logRef}
              className="no-scrollbar flex-1 min-h-0 overflow-auto px-5 py-4 text-xs sm:text-[13px] font-mono text-white/80 leading-7 tracking-wide whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
              aria-live="polite"
            >
              {filteredLog || (running ? '…' : '—')}
            </pre>
          </Card>

          {/* Right: status & metrics (uses remaining width) */}
          <div className="order-1 xl:order-2 flex flex-col gap-4 min-w-0">
            <Card className="p-5 sm:p-6 overflow-hidden relative">
              <div
                className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-25 -translate-y-1/2 translate-x-1/2 ${
                  statusTone === 'emerald'
                    ? 'bg-emerald-500'
                    : statusTone === 'amber'
                      ? 'bg-amber-500'
                      : 'bg-zinc-500'
                }`}
              />
              <div className="relative flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                        running
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : apiOk === false
                            ? 'border-amber-500/40 bg-amber-500/10'
                            : 'border-white/10 bg-white/[0.04]'
                      }`}
                    >
                      <Activity
                        className={`w-5 h-5 ${
                          running ? 'text-emerald-300' : apiOk === false ? 'text-amber-200' : 'text-white/50'
                        } ${running ? 'motion-safe:animate-pulse' : ''}`}
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/40">
                        Job status
                      </p>
                      <p className="text-xl font-semibold tracking-tight truncate">{statusLabel}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">
                      Elapsed
                    </p>
                    <p className="text-2xl font-semibold tabular-nums tracking-tight">
                      {formatDuration(elapsedMs)}
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-white/35">Command</dt>
                    <dd className="font-mono text-white/70 break-all" title={meta?.command}>
                      {meta?.command ?? '—'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-white/35">Working dir</dt>
                    <dd className="font-mono text-white/65 break-all text-[11px] sm:text-xs" title={meta?.cwd}>
                      {meta?.cwd ?? '—'}
                    </dd>
                  </div>
                  {running && pid != null ? (
                    <div className="flex gap-2 items-baseline">
                      <dt className="text-white/35 shrink-0">PID</dt>
                      <dd className="font-mono text-emerald-200/90">{pid}</dd>
                    </div>
                  ) : null}
                  {running && startedAt ? (
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-white/35">Started</dt>
                      <dd className="font-mono text-white/65 text-[11px]">
                        {new Date(startedAt).toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {lastRun && !running ? (
                  <p className="text-xs text-white/40 border-t border-white/[0.06] pt-3">
                    Last run: {formatDuration(lastRunDurationMs)}
                    {lastRun.exitCode != null ? (
                      <span
                        className={lastRun.exitCode === 0 ? ' text-emerald-400/80' : ' text-red-300/90'}
                      >
                        {' '}
                        · exit {lastRun.exitCode}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
              <Card className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                    Progress
                  </span>
                  <Layers className="w-4 h-4 text-white/25" aria-hidden />
                </div>
                {insights.lastEpoch ? (
                  <>
                    <p className="text-2xl font-semibold tabular-nums">
                      Epoch {insights.lastEpoch.epoch}
                      <span className="text-white/35 font-normal text-lg">/{insights.lastEpoch.total}</span>
                    </p>
                    <p className="text-sm text-white/50">
                      Loss <span className="text-white/80 font-mono">{insights.lastEpoch.loss}</span>
                      <span className="text-white/30 mx-1.5">·</span>
                      lr{' '}
                      <span className="text-white/80 font-mono text-xs">{insights.lastEpoch.lr}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-white/40 leading-relaxed">
                    {running
                      ? 'Waiting for first epoch line in log…'
                      : 'No epoch lines yet. Start a run.'}
                  </p>
                )}
              </Card>

              <Card className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                    Device
                  </span>
                  <Cpu className="w-4 h-4 text-white/25" aria-hidden />
                </div>
                <p
                  className="text-sm text-white/80 leading-snug line-clamp-3"
                  title={insights.deviceLine || ''}
                >
                  {insights.deviceLine?.replace(/^Device:\s*/i, '') || '—'}
                </p>
                {insights.gpuLine ? (
                  <p className="text-xs text-white/45 truncate" title={insights.gpuLine}>
                    {insights.gpuLine.replace(/^GPU:\s*/i, '')}
                  </p>
                ) : null}
              </Card>

              <Card className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                    Log buffer
                  </span>
                  <FileText className="w-4 h-4 text-white/25" aria-hidden />
                </div>
                <p className="text-2xl font-semibold tabular-nums">{logLineCount.toLocaleString()}</p>
                <p className="text-xs text-white/40">Lines kept server-side (tail in output panel)</p>
              </Card>

              <Card className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                    Last finished
                  </span>
                  <Clock className="w-4 h-4 text-white/25" aria-hidden />
                </div>
                {lastRun?.endedAt ? (
                  <>
                    <p className="text-sm text-white/80">
                      {new Date(lastRun.endedAt).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      {lastRun.exitCode === 0 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" aria-hidden />
                      )}
                      <span
                        className={lastRun.exitCode === 0 ? 'text-emerald-200/80' : 'text-red-200/90'}
                      >
                        {lastRun.exitCode === 0
                          ? 'Exited cleanly'
                          : lastRun.exitCode != null
                            ? `Exit code ${lastRun.exitCode}`
                            : 'Ended with error'}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-white/40">No completed run in this API session yet.</p>
                )}
              </Card>
            </div>

            <Card className="p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-sky-300/80 shrink-0" aria-hidden />
                  <h2 className="text-sm font-semibold text-white/90">Hyperparameters</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveHParams}
                    disabled={!hParams || savingHparams || apiOk === false}
                    className="text-xs font-medium px-3 py-2 rounded-lg bg-sky-500/20 text-sky-100 border border-sky-400/30 hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingHparams ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={resetHParams}
                    disabled={savingHparams || apiOk === false}
                    className="text-xs font-medium px-3 py-2 rounded-lg border border-white/15 text-white/65 hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    Reset defaults
                  </button>
                </div>
              </div>
              <p className="text-xs text-white/40 mb-3 leading-relaxed">
                Stored in <code className="text-white/55">chatbot-ai/models/train_config.json</code>.
                Changing embed/hidden/layers may require a fresh checkpoint for stable training.
              </p>
              {trainConfigPath ? (
                <p className="text-[10px] font-mono text-white/25 truncate mb-4" title={trainConfigPath}>
                  {trainConfigPath}
                </p>
              ) : null}
              {hParamMsg ? (
                <p className="text-xs text-emerald-300/90 mb-4">{hParamMsg}</p>
              ) : null}
              {!hParams ? (
                <p className="text-sm text-white/35">Loading config…</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">embed_dim</span>
                    <input
                      type="number"
                      min={32}
                      value={hParams.embed_dim}
                      onChange={(e) =>
                        setHp({ embed_dim: parseInt(e.target.value, 10) || hParams.embed_dim })
                      }
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">hidden_dim</span>
                    <input
                      type="number"
                      min={32}
                      value={hParams.hidden_dim}
                      onChange={(e) =>
                        setHp({ hidden_dim: parseInt(e.target.value, 10) || hParams.hidden_dim })
                      }
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">num_layers</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={hParams.num_layers}
                      onChange={(e) =>
                        setHp({ num_layers: parseInt(e.target.value, 10) || hParams.num_layers })
                      }
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">dropout</span>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      value={hParams.dropout}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({ dropout: Number.isFinite(v) ? v : hParams.dropout });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">batch_size</span>
                    <input
                      type="number"
                      min={1}
                      value={hParams.batch_size}
                      onChange={(e) =>
                        setHp({ batch_size: parseInt(e.target.value, 10) || hParams.batch_size })
                      }
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">num_epochs</span>
                    <input
                      type="number"
                      min={1}
                      value={hParams.num_epochs}
                      onChange={(e) =>
                        setHp({ num_epochs: parseInt(e.target.value, 10) || hParams.num_epochs })
                      }
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">learning_rate</span>
                    <input
                      type="number"
                      step="any"
                      value={hParams.learning_rate}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({ learning_rate: Number.isFinite(v) ? v : hParams.learning_rate });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">lr_min</span>
                    <input
                      type="number"
                      step="any"
                      value={hParams.lr_min}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({ lr_min: Number.isFinite(v) ? v : hParams.lr_min });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">clip (grad)</span>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={hParams.clip}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({ clip: Number.isFinite(v) ? v : hParams.clip });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">max_pairs</span>
                    <input
                      type="number"
                      min={1000}
                      value={hParams.max_pairs}
                      onChange={(e) =>
                        setHp({ max_pairs: parseInt(e.target.value, 10) || hParams.max_pairs })
                      }
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">weight_decay</span>
                    <input
                      type="number"
                      step="any"
                      value={hParams.weight_decay}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({ weight_decay: Number.isFinite(v) ? v : hParams.weight_decay });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">label_smooth</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={1}
                      value={hParams.label_smooth}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({ label_smooth: Number.isFinite(v) ? v : hParams.label_smooth });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">teacher_forcing</span>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      value={hParams.teacher_forcing}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({ teacher_forcing: Number.isFinite(v) ? v : hParams.teacher_forcing });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">plateau_patience</span>
                    <input
                      type="number"
                      min={0}
                      value={hParams.plateau_patience}
                      onChange={(e) =>
                        setHp({
                          plateau_patience: parseInt(e.target.value, 10) || hParams.plateau_patience,
                        })
                      }
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">plateau_factor</span>
                    <input
                      type="number"
                      step="0.05"
                      min={0.01}
                      max={1}
                      value={hParams.plateau_factor}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({ plateau_factor: Number.isFinite(v) ? v : hParams.plateau_factor });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">teacher_forcing_start</span>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      value={hParams.teacher_forcing_start}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({
                          teacher_forcing_start: Number.isFinite(v)
                            ? v
                            : hParams.teacher_forcing_start,
                        });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/40">teacher_forcing_end</span>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      value={hParams.teacher_forcing_end}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setHp({
                          teacher_forcing_end: Number.isFinite(v) ? v : hParams.teacher_forcing_end,
                        });
                      }}
                      className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white/90 font-mono text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 sm:col-span-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={hParams.use_decaying_teacher_forcing}
                      onChange={(e) =>
                        setHp({ use_decaying_teacher_forcing: e.target.checked })
                      }
                      className="rounded border-white/20 bg-black/40 text-sky-500"
                    />
                    <span className="text-xs text-white/65">use_decaying_teacher_forcing</span>
                  </label>
                </div>
              )}
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <Moon className="w-4 h-4 text-violet-300/80" aria-hidden />
                <h2 className="text-sm font-semibold text-white/90">Unattended / overnight</h2>
              </div>
              <p className="text-xs text-white/45 leading-relaxed mb-4">
                Keep the PC awake (disable sleep) so training does not stop. Two options: run the
                Python helper in a terminal or Task Scheduler, or set env vars on the train API when
                you use <code className="text-white/55">npm run dev:all</code>.
              </p>
              <div className="rounded-xl bg-black/35 border border-white/[0.06] p-3 mb-3 space-y-2 text-[11px] sm:text-xs font-mono text-white/60 break-all">
                <p>
                  <span className="text-white/35">CLI · once at 23:45</span>
                  <br />
                  <span className="text-emerald-200/90">
                    npm run train:overnight -- --at 23:45 --log chatbot-ai/logs/overnight.log
                  </span>
                </p>
                <p>
                  <span className="text-white/35">CLI · every night after first run</span>
                  <br />
                  <span className="text-emerald-200/90">
                    npm run train:overnight -- --at 02:00 --repeat-daily --log
                    chatbot-ai/logs/nightly.log
                  </span>
                </p>
              </div>
              {(meta?.autoTrain?.onStart ||
                meta?.autoTrain?.at ||
                meta?.autoTrain?.repeatDaily) && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-100/90 space-y-1">
                  <p className="font-medium text-emerald-200/95">Train API auto-run (env)</p>
                  {meta.autoTrain.onStart ? (
                    <p>
                      <code className="text-emerald-100/80">AUTO_TRAIN_ON_START=1</code> — starts{' '}
                      {meta.autoTrain.onStartDelayMs != null
                        ? `~${Math.round(meta.autoTrain.onStartDelayMs / 1000)}s`
                        : 'shortly'}{' '}
                      after the API boots.
                    </p>
                  ) : null}
                  {meta.autoTrain.at ? (
                    <p>
                      <code className="text-emerald-100/80">AUTO_TRAIN_AT={meta.autoTrain.at}</code>
                      {meta.autoTrain.repeatDaily
                        ? ' — next local time, then again after each run finishes.'
                        : ' — once at the next occurrence.'}
                    </p>
                  ) : null}
                </div>
              )}
            </Card>

            {(insights.vocabLine || insights.paramsLine) && (
              <Card className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Hash className="w-4 h-4 text-violet-300/70" aria-hidden />
                  <h2 className="text-sm font-semibold text-white/90">Run snapshot</h2>
                </div>
                <ul className="space-y-2 text-xs sm:text-sm text-white/55 font-mono break-all">
                  {insights.vocabLine ? <li>{insights.vocabLine}</li> : null}
                  {insights.paramsLine ? <li>{insights.paramsLine}</li> : null}
                </ul>
              </Card>
            )}

            {err ? (
              <Card className="p-4 border-red-500/25 bg-red-500/[0.06]">
                <div className="flex gap-3">
                  <Zap className="w-5 h-5 text-red-300 shrink-0 mt-0.5" aria-hidden />
                  <pre className="text-red-200/90 text-xs font-mono whitespace-pre-wrap flex-1">
                    {err}
                  </pre>
                </div>
              </Card>
            ) : null}
          </div>
        </div>

        <p className="text-white/30 text-xs leading-relaxed max-w-3xl">
          Run <code className="text-white/50">npm run dev:all</code> for Vite (5181) + train API (5182).
          Optional: <code className="text-white/50">ADMIN_TRAIN_SECRET</code> and matching{' '}
          <code className="text-white/50">VITE_ADMIN_TRAIN_SECRET</code> in{' '}
          <code className="text-white/50">.env</code>.
        </p>
      </main>
    </div>
  );
}
