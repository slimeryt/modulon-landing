import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CircleAlert,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  Trash2,
  Zap,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  DOWN_REASONS,
  getConfigStatus,
  getLiveServers,
  getMapServerDefinitions,
  reloadLiveServerStore,
  serverStatusLabel,
  subscribeLiveServers,
} from './mapServers';
import {
  applyNoteStatusRules,
  CONFIG_SERVER_STATUSES,
  noteImpliesMaintenance,
  SERVER_ROLES,
  SERVERS_UPDATED_EVENT,
  clearSavedServers,
  createServerId,
  defaultUptimeForStatus,
  DEFAULT_SERVER_PROVIDER,
  emptyServerDraft,
  removeSavedServer,
  upsertSavedServer,
} from './serverConfigStore';
import AdminCellDropdown from './AdminCellDropdown';

const API = (() => {
  const origin = (import.meta.env.VITE_PUBLIC_API_ORIGIN || '').trim().replace(/\/$/, '');
  return origin ? `${origin}/api` : '/api';
})();

const ROLE_OPTIONS = SERVER_ROLES.map((role) => ({ value: role, label: role }));

const STATUS_OPTIONS = CONFIG_SERVER_STATUSES.map((status) => ({
  value: status,
  label: serverStatusLabel(status),
  tone: status,
}));

const BUILDING_NOTE_OPTIONS = [
  'Provisioning',
  'Hardware install',
  'Network cabling',
  'Awaiting clearance',
];

const OPS_NOTE_OPTIONS = ['—', 'Reserved capacity', 'Routine check', 'Standby node'];

function statusTone(status) {
  if (
    status === 'operational' ||
    status === 'slow' ||
    status === 'maintenance' ||
    status === 'down' ||
    status === 'building'
  ) {
    return status;
  }
  return 'default';
}

function noteOptionsForStatus(status, currentText) {
  const addCustom = (options) => {
    const trimmed = currentText?.trim();
    if (trimmed && !options.some((o) => o.value === trimmed)) {
      return [{ value: trimmed, label: trimmed }, ...options];
    }
    return options;
  };

  if (status === 'down') {
    return addCustom(DOWN_REASONS.map((reason) => ({ value: reason, label: reason })));
  }
  if (status === 'building') {
    return addCustom(BUILDING_NOTE_OPTIONS.map((note) => ({ value: note, label: note })));
  }
  if (status === 'maintenance' || status === 'operational') {
    return addCustom(OPS_NOTE_OPTIONS.map((note) => ({ value: note, label: note })));
  }
  return [];
}

const cellInputClass = 'admin-cell-input';
const cellInputMonoClass = `${cellInputClass} admin-cell-input--mono`;

function formatCoord(value) {
  return Number.isFinite(value) ? String(value) : '';
}

function notesUpdatePatch(server, notes) {
  const normalized = notes === '—' ? '' : (notes || '').trim();
  let patch = applyNoteStatusRules({ ...server, notes: normalized });
  if (!noteImpliesMaintenance(normalized) && getConfigStatus(server) === 'maintenance') {
    patch = { ...patch, status: 'operational', uptime: defaultUptimeForStatus('operational') };
  }
  return patch;
}

function StatCard({ label, value, icon: Icon, tone = 'text-zinc-900 dark:text-white/90' }) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-white/40">{label}</p>
        <Icon className={`h-4 w-4 shrink-0 opacity-70 ${tone}`} aria-hidden />
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function ServerRow({ server, liveServer, onUpdate, onDelete }) {
  const [latText, setLatText] = useState(formatCoord(server.lat));
  const [lonText, setLonText] = useState(formatCoord(server.lon));
  const [notesText, setNotesText] = useState(
    getConfigStatus(server) === 'down' ? server.downReason || '' : server.notes || '',
  );

  useEffect(() => {
    setLatText(formatCoord(server.lat));
    setLonText(formatCoord(server.lon));
    setNotesText(getConfigStatus(server) === 'down' ? server.downReason || '' : server.notes || '');
  }, [server.id, server.lat, server.lon, server.notes, server.downReason, server.status]);

  const commitCoords = () => {
    const lat = Number(latText);
    const lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setLatText(formatCoord(server.lat));
      setLonText(formatCoord(server.lon));
      return;
    }
    if (lat === server.lat && lon === server.lon) return;
    onUpdate(server.id, { lat, lon });
  };

  const commitNotes = () => {
    const trimmed = notesText.trim();
    if (getConfigStatus(server) === 'down') {
      const reason = trimmed || DOWN_REASONS[0];
      if (reason === (server.downReason || '')) return;
      onUpdate(server.id, { downReason: reason });
      return;
    }
    const patch = notesUpdatePatch(server, trimmed);
    if (patch.notes === (server.notes || '') && patch.status === getConfigStatus(server)) return;
    onUpdate(server.id, patch);
  };

  const onStatusChange = (status) => {
    let notes = server.notes || '';
    if (status === 'operational' && noteImpliesMaintenance(notes)) {
      notes = '';
      setNotesText('');
    }
    const patch = applyNoteStatusRules({
      ...server,
      notes,
      status,
      uptime: defaultUptimeForStatus(status),
      downReason: status === 'down' ? server.downReason || notesText.trim() || DOWN_REASONS[0] : '',
    });
    onUpdate(server.id, patch);
  };

  const saveNotes = (text) => {
    const trimmed = text.trim();
    if (getConfigStatus(server) === 'down') {
      const reason = trimmed || DOWN_REASONS[0];
      if (reason !== (server.downReason || '')) onUpdate(server.id, { downReason: reason });
      return;
    }
    const patch = notesUpdatePatch(server, trimmed);
    if (patch.notes === (server.notes || '') && patch.status === getConfigStatus(server)) return;
    onUpdate(server.id, patch);
  };

  const noteOptions = useMemo(
    () => noteOptionsForStatus(getConfigStatus(server), notesText),
    [server.status, notesText],
  );

  const configStatus = getConfigStatus(server);
  const displayStatus = liveServer?.status ?? configStatus;

  return (
    <tr className="text-zinc-700 dark:text-white/75">
      <td className="px-4 py-2.5 font-mono font-medium text-zinc-900 dark:text-white/88">{server.label}</td>
      <td className="px-4 py-2.5">{server.city}</td>
      <td className="min-w-[9rem] px-4 py-2.5">
        <AdminCellDropdown
          value={server.role || SERVER_ROLES[0]}
          options={
            server.role && !SERVER_ROLES.includes(server.role)
              ? [{ value: server.role, label: server.role }, ...ROLE_OPTIONS]
              : ROLE_OPTIONS
          }
          onChange={(role) => onUpdate(server.id, { role })}
          ariaLabel={`Role for ${server.label}`}
          panelMinWidth={240}
        />
      </td>
      <td className="min-w-[8.5rem] px-4 py-2.5">
        <AdminCellDropdown
          value={configStatus}
          displayLabel={serverStatusLabel(displayStatus)}
          options={STATUS_OPTIONS}
          onChange={onStatusChange}
          ariaLabel={`Status for ${server.label}`}
          tone={statusTone(displayStatus)}
          panelMinWidth={220}
        />
      </td>
      <td className="min-w-[10rem] px-4 py-2.5">
        <div className="flex gap-1">
          <input
            className={cellInputMonoClass}
            value={latText}
            onChange={(e) => setLatText(e.target.value)}
            onBlur={commitCoords}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label={`Latitude for ${server.label}`}
            placeholder="lat"
          />
          <input
            className={cellInputMonoClass}
            value={lonText}
            onChange={(e) => setLonText(e.target.value)}
            onBlur={commitCoords}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label={`Longitude for ${server.label}`}
            placeholder="lon"
          />
        </div>
      </td>
      <td className="px-4 py-2.5 font-mono text-[10px]">{server.uptime}</td>
      <td className="min-w-[12rem] max-w-[18rem] px-4 py-2.5">
        <AdminCellDropdown
          combo
          value={notesText}
          options={noteOptions}
          onChange={(text) => {
            setNotesText(text);
            saveNotes(text);
          }}
          onInputChange={setNotesText}
          onCommit={commitNotes}
          placeholder={
            getConfigStatus(server) === 'down'
              ? 'Down reason'
              : getConfigStatus(server) === 'building'
                ? 'Provisioning'
                : 'Notes'
          }
          ariaLabel={`Notes for ${server.label}`}
          panelMinWidth={300}
        />
      </td>
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={() => onDelete(server)}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
          aria-label={`Delete ${server.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function NewServerRow({ servers, onAdd, onCancel }) {
  const [draft, setDraft] = useState(emptyServerDraft);
  const [error, setError] = useState(null);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const draftNotes = draft.status === 'down' ? draft.downReason || '' : draft.notes || '';
  const draftNoteOptions = useMemo(
    () => noteOptionsForStatus(draft.status, draftNotes),
    [draft.status, draftNotes],
  );

  const submit = () => {
    if (!draft.label?.trim()) {
      setError('Label is required.');
      return;
    }
    if (!draft.city?.trim()) {
      setError('City is required.');
      return;
    }
    const lat = Number(draft.lat);
    const lon = Number(draft.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setError('Valid coordinates are required.');
      return;
    }

    const id = createServerId(draft.label, servers);
    onAdd({
      ...draft,
      id,
      label: draft.label.trim(),
      name: (draft.name || draft.city).trim(),
      city: draft.city.trim(),
      country: draft.country || 'Switzerland',
      region: draft.region || 'EU Central',
      provider: draft.provider || DEFAULT_SERVER_PROVIDER,
      lat,
      lon,
      downReason: draft.status === 'down' ? draft.downReason || DOWN_REASONS[0] : undefined,
      notes: draft.status !== 'down' ? draft.notes || '' : undefined,
    });
    setDraft(emptyServerDraft());
    setError(null);
  };

  return (
    <tr className="bg-zinc-50/60 dark:bg-white/[0.02]">
      <td className="px-4 py-2.5">
        <input
          className={cellInputMonoClass}
          value={draft.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="ZRH-DB-13"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          className={cellInputClass}
          value={draft.city}
          onChange={(e) => set('city', e.target.value)}
          placeholder="City"
        />
      </td>
      <td className="px-4 py-2.5">
        <AdminCellDropdown
          value={draft.role || SERVER_ROLES[0]}
          options={ROLE_OPTIONS}
          onChange={(role) => set('role', role)}
          ariaLabel="Role for new server"
          panelMinWidth={240}
        />
      </td>
      <td className="px-4 py-2.5">
        <AdminCellDropdown
          value={draft.status || CONFIG_SERVER_STATUSES[0]}
          options={STATUS_OPTIONS}
          onChange={(status) => {
            setDraft((d) => ({
              ...d,
              status,
              uptime: defaultUptimeForStatus(status),
            }));
          }}
          ariaLabel="Status for new server"
          tone={statusTone(draft.status)}
          panelMinWidth={220}
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex gap-1">
          <input
            className={cellInputMonoClass}
            value={draft.lat}
            onChange={(e) => set('lat', e.target.value)}
            placeholder="lat"
          />
          <input
            className={cellInputMonoClass}
            value={draft.lon}
            onChange={(e) => set('lon', e.target.value)}
            placeholder="lon"
          />
        </div>
      </td>
      <td className="px-4 py-2.5 font-mono text-[10px] text-zinc-400">{draft.uptime}</td>
      <td className="px-4 py-2.5">
        <AdminCellDropdown
          combo
          value={draftNotes}
          options={draftNoteOptions}
          onChange={(text) => set(draft.status === 'down' ? 'downReason' : 'notes', text)}
          onInputChange={(text) => set(draft.status === 'down' ? 'downReason' : 'notes', text)}
          placeholder="Notes"
          ariaLabel="Notes for new server"
          panelMinWidth={300}
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Add
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-200/80 px-2 py-1 text-[10px] text-zinc-500 dark:border-white/[0.1]"
          >
            Cancel
          </button>
        </div>
        {error ? <p className="mt-1 text-[10px] text-red-600 dark:text-red-300">{error}</p> : null}
      </td>
    </tr>
  );
}

export default function AdminPage() {
  const { user, signOutUser } = useAuth();
  const [servers, setServers] = useState(getMapServerDefinitions);
  const [liveServers, setLiveServers] = useState(getLiveServers);
  const [adding, setAdding] = useState(false);
  const [apiHealth, setApiHealth] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const syncConfig = useCallback((nextDefinitions) => {
    setServers(nextDefinitions);
    reloadLiveServerStore(nextDefinitions);
  }, []);

  const updateServer = useCallback(
    (id, patch) => {
      const current = servers.find((s) => s.id === id);
      if (!current) return;
      const next = upsertSavedServer({ ...current, ...patch }, servers);
      syncConfig(next);
    },
    [servers, syncConfig],
  );

  const deleteServer = useCallback(
    (server) => {
      if (!window.confirm(`Delete ${server.label}?`)) return;
      const next = removeSavedServer(server.id, servers);
      syncConfig(next);
    },
    [servers, syncConfig],
  );

  const addServer = useCallback(
    (payload) => {
      const next = upsertSavedServer(payload, servers);
      syncConfig(next);
      setAdding(false);
    },
    [servers, syncConfig],
  );

  const liveById = useMemo(
    () => new Map(liveServers.map((server) => [server.id, server])),
    [liveServers],
  );

  useEffect(() => subscribeLiveServers(setLiveServers), []);

  useEffect(() => {
    const onConfigUpdate = () => setServers(getMapServerDefinitions());
    window.addEventListener(SERVERS_UPDATED_EVENT, onConfigUpdate);
    return () => window.removeEventListener(SERVERS_UPDATED_EVENT, onConfigUpdate);
  }, []);

  const counts = useMemo(() => {
    const tally = { operational: 0, slow: 0, down: 0, building: 0, maintenance: 0, other: 0 };
    for (const s of liveServers) {
      if (s.status === 'operational') tally.operational += 1;
      else if (s.status === 'slow' || s.status === 'degraded') tally.slow += 1;
      else if (s.status === 'down') tally.down += 1;
      else if (s.status === 'building') tally.building += 1;
      else if (s.status === 'maintenance') tally.maintenance += 1;
      else tally.other += 1;
    }
    return tally;
  }, [liveServers]);

  const cities = useMemo(() => new Set(servers.map((s) => s.city)).size, [servers]);

  const loadApiHealth = useCallback(async () => {
    setRefreshing(true);
    setApiError(null);
    try {
      const res = await fetch(`${API}/health`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setApiHealth({ ...data, checkedAt: new Date().toISOString() });
    } catch (err) {
      setApiHealth(null);
      setApiError(err?.message || 'Health check failed');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadApiHealth();
  }, [loadApiHealth]);

  const resetDefaults = () => {
    if (!window.confirm('Reset all servers to built-in defaults? This cannot be undone.')) return;
    clearSavedServers();
    const next = getMapServerDefinitions();
    syncConfig(next);
    setAdding(false);
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-[#070708] dark:text-white">
      <div className="mx-auto max-w-6xl px-[max(1rem,env(safe-area-inset-left))] py-8 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200/80 pb-6 dark:border-white/[0.08]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/55">
              <Shield className="h-3 w-3" aria-hidden />
              Internal
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white/95">Admin</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-white/45">
              Signed in as <span className="font-mono text-zinc-700 dark:text-white/70">{user?.email}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.07]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add server
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.07]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset defaults
            </button>
            <button
              type="button"
              onClick={loadApiHealth}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.07]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              Refresh API
            </button>
            <button
              type="button"
              onClick={() => signOutUser?.()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.07]"
            >
              Sign out
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.07]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Home
            </Link>
          </div>
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Operational" value={counts.operational} icon={Zap} tone="text-emerald-600 dark:text-emerald-300" />
          <StatCard label="Slow" value={counts.slow} icon={Activity} tone="text-amber-600 dark:text-amber-300" />
          <StatCard label="Down" value={counts.down} icon={CircleAlert} tone="text-red-600 dark:text-red-300" />
          <StatCard label="In building" value={counts.building} icon={Building2} tone="text-blue-600 dark:text-blue-300" />
          <StatCard label="Cities" value={cities} icon={Server} />
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white/90">Chat API</h2>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-white/40">GET {API}/health</p>
            {apiError ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {apiError}
              </p>
            ) : apiHealth ? (
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500 dark:text-white/40">Status</dt>
                  <dd className="font-mono text-zinc-800 dark:text-white/80">{apiHealth.status || 'ok'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500 dark:text-white/40">Model ready</dt>
                  <dd className="font-mono text-zinc-800 dark:text-white/80">{String(apiHealth.modelReady ?? '—')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500 dark:text-white/40">Checked</dt>
                  <dd className="font-mono text-zinc-800 dark:text-white/80">
                    {apiHealth.checkedAt ? new Date(apiHealth.checkedAt).toLocaleTimeString() : '—'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-zinc-500 dark:text-white/45">Checking…</p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white/90">Server configuration</h2>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-white/40">
              {servers.length} nodes · edit inline · syncs to the status map.
            </p>
            <ul className="mt-4 space-y-2 text-xs text-zinc-600 dark:text-white/60">
              <li>Status shows live health (Operational / Slow) and updates every few seconds.</li>
              <li>Open the status menu to pin a node Down or In Building.</li>
              <li>Role updates immediately on change.</li>
              <li>Coords and notes save when you leave the field (or press Enter).</li>
              <li>Routine check or Standby node notes auto-switch a server to Maintenance.</li>
              <li>Down notes appear as the outage reason on the map.</li>
            </ul>
          </div>
        </section>

        <section className="mt-8 overflow-visible rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-4 py-3 dark:border-white/[0.08]">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white/90">Server nodes</h2>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-white/50 dark:hover:text-white/80"
            >
              <Plus className="h-3.5 w-3.5" />
              Add server
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-50/80 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-white/[0.02] dark:text-white/35">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Node</th>
                  <th className="px-4 py-2.5 font-semibold">City</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Coords</th>
                  <th className="px-4 py-2.5 font-semibold">Uptime</th>
                  <th className="px-4 py-2.5 font-semibold">Notes</th>
                  <th className="px-4 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                {servers.map((server) => (
                  <ServerRow
                    key={server.id}
                    server={server}
                    liveServer={liveById.get(server.id)}
                    onUpdate={updateServer}
                    onDelete={deleteServer}
                  />
                ))}
                {adding ? (
                  <NewServerRow servers={servers} onAdd={addServer} onCancel={() => setAdding(false)} />
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-10 pb-8 text-[10px] text-zinc-400 dark:text-white/25">
          Modulon admin · not indexed · access restricted
        </footer>
      </div>
    </div>
  );
}
