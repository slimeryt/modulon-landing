export const STORAGE_KEY = 'modulon-map-servers-config';
export const SERVERS_UPDATED_EVENT = 'modulon-servers-updated';

export const DEFAULT_SERVER_PROVIDER = 'Venda Technologies';

export const SERVER_ROLES = [
  'Primary database',
  'Read replica',
  'Backup store',
  'Web frontend',
  'API gateway',
  'Inference',
];

/** Live map status — includes latency-driven "slow". */
export const SERVER_STATUSES = ['operational', 'slow', 'down', 'building', 'maintenance'];

/** Admin-persisted status — "slow" is map-only (from latency), not a config pin. */
export const CONFIG_SERVER_STATUSES = ['operational', 'maintenance', 'down', 'building'];

/** Operational notes that auto-pin a server to Maintenance. */
export const MAINTENANCE_NOTE_TRIGGERS = ['Routine check', 'Standby node'];

export function noteImpliesMaintenance(notes) {
  const trimmed = (notes || '').trim();
  return MAINTENANCE_NOTE_TRIGGERS.includes(trimmed);
}

export function applyNoteStatusRules(server) {
  const out = stripServerDefinition(server);
  if (out.status === 'down' || out.status === 'building') return out;
  if (noteImpliesMaintenance(out.notes)) {
    out.status = 'maintenance';
    out.uptime = defaultUptimeForStatus('maintenance');
    return out;
  }
  if (out.status === 'maintenance') {
    out.uptime = defaultUptimeForStatus('maintenance');
    return out;
  }
  return out;
}

export function isStaticConfigStatus(status) {
  return status === 'down' || status === 'building' || status === 'maintenance';
}

const DEFINITION_KEYS = [
  'id',
  'label',
  'name',
  'city',
  'country',
  'region',
  'role',
  'provider',
  'status',
  'uptime',
  'lon',
  'lat',
  'downReason',
  'notes',
];

export function stripServerDefinition(server) {
  const out = {};
  for (const key of DEFINITION_KEYS) {
    if (server[key] !== undefined) out[key] = server[key];
  }
  return out;
}

export function normalizeServerDefinition(server) {
  const out = stripServerDefinition(server);
  if (!out.role || !SERVER_ROLES.includes(out.role)) {
    out.role = SERVER_ROLES[0];
  }
  const lat = Number(out.lat);
  const lon = Number(out.lon);
  out.lat = Number.isFinite(lat) ? lat : 47.37;
  out.lon = Number.isFinite(lon) ? lon : 8.54;
  if (!out.provider || out.provider === 'Modulon Cloud') {
    out.provider = DEFAULT_SERVER_PROVIDER;
  }
  if (!out.status || !CONFIG_SERVER_STATUSES.includes(out.status)) {
    if (out.status === 'slow' || out.status === 'degraded') out.status = 'operational';
    else out.status = 'operational';
  }
  return applyNoteStatusRules(out);
}

export function readSavedServers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normalizeServerDefinition);
  } catch {
    return null;
  }
}

export function writeSavedServers(servers) {
  const defs = servers.map(stripServerDefinition);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defs));
  window.dispatchEvent(new CustomEvent(SERVERS_UPDATED_EVENT));
}

export function clearSavedServers() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(SERVERS_UPDATED_EVENT));
}

export function upsertSavedServer(patch, currentList) {
  const list = currentList.map(stripServerDefinition);
  const next = stripServerDefinition(patch);
  const idx = list.findIndex((s) => s.id === next.id);
  if (idx >= 0) list[idx] = applyNoteStatusRules({ ...list[idx], ...next });
  else list.push(applyNoteStatusRules(next));
  writeSavedServers(list);
  return list;
}

export function removeSavedServer(id, currentList) {
  const list = currentList.filter((s) => s.id !== id);
  writeSavedServers(list);
  return list;
}

export function createServerId(label, existing) {
  const base = (label || 'node')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  let id = base || 'node';
  let n = 1;
  while (existing.some((s) => s.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

export function defaultUptimeForStatus(status) {
  if (status === 'down' || status === 'building' || status === 'maintenance') return '—';
  return '99.95%';
}

export function emptyServerDraft() {
  return {
    id: '',
    label: '',
    name: '',
    city: '',
    country: 'Switzerland',
    region: 'EU Central',
    role: SERVER_ROLES[0],
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'operational',
    uptime: '99.95%',
    lon: 8.54,
    lat: 47.37,
    downReason: '',
    notes: '',
  };
}
