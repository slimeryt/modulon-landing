import {
  DEFAULT_SERVER_PROVIDER,
  normalizeServerDefinition,
  readSavedServers,
  SERVERS_UPDATED_EVENT,
  stripServerDefinition,
} from './serverConfigStore';

export const LIVE_SERVERS_TICK_MS = 4000;

/** Default server locations shown on the status map (Switzerland). */
export const MAP_SERVERS = [
  {
    id: 'zrh-db-01',
    label: 'ZRH-DB-01',
    name: 'Zürich',
    city: 'Zürich',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Primary database',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'operational',
    uptime: '99.98%',
    lon: 8.542,
    lat: 47.377,
  },
  {
    id: 'zrh-db-02',
    label: 'ZRH-DB-02',
    name: 'Zürich',
    city: 'Zürich',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Read replica',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'down',
    downReason: 'Corrupted RAM',
    uptime: '—',
    lon: 8.535,
    lat: 47.371,
  },
  {
    id: 'zrh-db-03',
    label: 'ZRH-DB-03',
    name: 'Zürich',
    city: 'Zürich',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Backup store',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'operational',
    uptime: '99.93%',
    lon: 8.551,
    lat: 47.383,
  },
  {
    id: 'zrh-web-04',
    label: 'ZRH-WEB-04',
    name: 'Zürich',
    city: 'Zürich',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Web frontend',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'operational',
    uptime: '99.97%',
    lon: 8.488,
    lat: 47.391,
  },
  {
    id: 'zrh-api-05',
    label: 'ZRH-API-05',
    name: 'Zürich',
    city: 'Zürich',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'API gateway',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'operational',
    uptime: '99.95%',
    lon: 8.562,
    lat: 47.412,
  },
  {
    id: 'zrh-ai-06',
    label: 'ZRH-AI-06',
    name: 'Zürich',
    city: 'Zürich',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Inference',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'operational',
    uptime: '99.91%',
    lon: 8.548,
    lat: 47.458,
  },
  {
    id: 'brn-api-07',
    label: 'BRN-API-07',
    name: 'Bern',
    city: 'Bern',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'API gateway',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'operational',
    uptime: '99.96%',
    lon: 7.449,
    lat: 46.952,
  },
  {
    id: 'brn-web-08',
    label: 'BRN-WEB-08',
    name: 'Bern',
    city: 'Bern',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Web frontend',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'operational',
    uptime: '99.94%',
    lon: 7.428,
    lat: 46.936,
  },
  {
    id: 'lau-ai-09',
    label: 'LAU-AI-09',
    name: 'Lausanne',
    city: 'Lausanne',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Inference',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'building',
    uptime: '—',
    lon: 6.633,
    lat: 46.519,
  },
  {
    id: 'lau-api-10',
    label: 'LAU-API-10',
    name: 'Lausanne',
    city: 'Lausanne',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'API gateway',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'building',
    uptime: '—',
    lon: 6.601,
    lat: 46.536,
  },
  {
    id: 'luz-db-11',
    label: 'LUZ-DB-11',
    name: 'Luzern',
    city: 'Luzern',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Primary database',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'building',
    uptime: '—',
    lon: 8.309,
    lat: 47.05,
  },
  {
    id: 'luz-web-12',
    label: 'LUZ-WEB-12',
    name: 'Luzern',
    city: 'Luzern',
    country: 'Switzerland',
    region: 'EU Central',
    role: 'Web frontend',
    provider: DEFAULT_SERVER_PROVIDER,
    status: 'building',
    uptime: '—',
    lon: 8.338,
    lat: 47.072,
  },
];

export const SLOW_LATENCY_MS = 62;

export const DOWN_REASONS = [
  'Corrupted RAM',
  'ECC memory errors exceeded threshold',
  'Power supply unit failure',
  'Redundant PSU lost — both feeds down',
  'Kernel panic on boot',
  'RAID array degraded beyond recovery',
  'Primary SSD bad blocks exceeded spare pool',
  'Storage controller fault',
  'Disk I/O timeout on primary volume',
  'Hypervisor host unreachable',
  'VM migration failed mid-transfer',
  'Container runtime crashed',
  'Out-of-memory kill (OOM)',
  'Cooling fan failure — thermal shutdown',
  'Motherboard sensor fault',
  'Firmware update bricked BMC',
  'Network interface flapping',
  'BGP route withdrawn',
  'DNS resolver unreachable',
  'TLS certificate expired',
  'Load balancer health check failing',
  'Database replication lag exceeded threshold',
  'Clock drift beyond NTP tolerance',
  'PDU circuit breaker tripped',
  'Unplanned maintenance window overrun',
  'PCIe device link training failure',
  'NIC firmware watchdog reset loop',
  'ZFS pool import blocked — metadata corruption',
  'Inode exhaustion on root volume',
  'Service dependency timeout (upstream API)',
  'Manual isolation — incident response',
  'Automated failover did not complete',
  'Bare-metal provisioning stuck in PXE loop',
];

function hashPick(id, items) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return items[Math.abs(h) % items.length];
}

export function getConfigStatus(server) {
  if (
    server.configStatus === 'operational' ||
    server.configStatus === 'maintenance' ||
    server.configStatus === 'down' ||
    server.configStatus === 'building'
  ) {
    return server.configStatus;
  }
  const persisted = server.status;
  if (
    persisted === 'down' ||
    persisted === 'building' ||
    persisted === 'maintenance' ||
    persisted === 'operational'
  ) {
    return persisted;
  }
  return 'operational';
}

export function getDownReason(server) {
  if (getConfigStatus(server) !== 'down') return null;
  return server.downReason ?? hashPick(server.id, DOWN_REASONS);
}

const ROLE_LATENCY_RANGE = {
  'Primary database': [9, 32],
  'Read replica': [11, 34],
  'Backup store': [12, 36],
  'Web frontend': [14, 42],
  'API gateway': [16, 48],
  Inference: [18, 55],
};

function randomInRange([lo, hi]) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function latencyToStatus(latencyMs) {
  return latencyMs >= SLOW_LATENCY_MS ? 'slow' : 'operational';
}

function randomNextLatency(server) {
  const range = ROLE_LATENCY_RANGE[server.role] ?? [12, 40];
  const prev = server.latencyMs ?? randomInRange(range);
  let next = prev + Math.floor(Math.random() * 19) - 7;

  if (Math.random() < 0.32) {
    next += 38 + Math.floor(Math.random() * 95);
  } else if (Math.random() < 0.24 && next >= SLOW_LATENCY_MS) {
    next = randomInRange(range);
  }

  return Math.max(6, Math.min(340, Math.round(next)));
}

const defaultServerById = new Map(
  MAP_SERVERS.map((server) => [server.id, normalizeServerDefinition(server)]),
);

export function getMapServerDefinitions() {
  const saved = readSavedServers();
  if (saved?.length) {
    return saved.map((server) => {
      const base = defaultServerById.get(server.id);
      const combined = base ? { ...base, ...server } : server;
      if (combined.status === 'down' && !combined.downReason && base?.downReason) {
        combined.downReason = base.downReason;
      }
      return normalizeServerDefinition(combined);
    });
  }
  return MAP_SERVERS.map(normalizeServerDefinition);
}

function seedLatencyMs(server) {
  if (Math.random() < 0.28) {
    return randomInRange([SLOW_LATENCY_MS, SLOW_LATENCY_MS + 48]);
  }
  return randomInRange(ROLE_LATENCY_RANGE[server.role] ?? [12, 40]);
}

function toLiveServer(definition, configStatus, liveFields) {
  const base = stripServerDefinition(definition);
  return {
    ...base,
    configStatus,
    ...liveFields,
  };
}

export function initLiveServers(definitions = getMapServerDefinitions()) {
  return definitions.map((server) => {
    const configStatus = getConfigStatus(server);
    if (configStatus === 'down') {
      return toLiveServer(server, 'down', {
        latencyMs: null,
        status: 'down',
        downReason: getDownReason({ ...server, configStatus: 'down' }),
      });
    }
    if (configStatus === 'building') {
      return toLiveServer(server, 'building', { latencyMs: null, status: 'building' });
    }
    if (configStatus === 'maintenance') {
      return toLiveServer(server, 'maintenance', { latencyMs: null, status: 'maintenance' });
    }
    const latencyMs = seedLatencyMs(server);
    return toLiveServer(server, 'operational', {
      latencyMs,
      status: latencyToStatus(latencyMs),
    });
  });
}

export function tickLiveServers(servers) {
  return servers.map((server) => {
    const configStatus = getConfigStatus(server);
    if (configStatus === 'down') {
      return {
        ...server,
        configStatus: 'down',
        latencyMs: null,
        status: 'down',
        downReason: getDownReason({ ...server, configStatus: 'down' }),
      };
    }
    if (configStatus === 'building') {
      return { ...server, configStatus: 'building', latencyMs: null, status: 'building' };
    }
    if (configStatus === 'maintenance') {
      return { ...server, configStatus: 'maintenance', latencyMs: null, status: 'maintenance' };
    }
    const latencyMs = randomNextLatency(server);
    const status = latencyToStatus(latencyMs);
    return { ...server, configStatus: 'operational', latencyMs, status };
  });
}

/** Re-apply saved config; preserve latency ticks only for unchanged operational nodes. */
export function reloadLiveServers(prev, definitions = getMapServerDefinitions()) {
  const fresh = initLiveServers(definitions);
  if (!prev?.length) return fresh;

  const prevById = new Map(prev.map((server) => [server.id, server]));
  const defById = new Map(definitions.map((server) => [server.id, server]));

  return fresh.map((next) => {
    const old = prevById.get(next.id);
    const def = defById.get(next.id);
    if (!old || !def) return next;

    const oldCfg = getConfigStatus(old);
    const nextCfg = getConfigStatus(def);
    const notesUnchanged = (old.notes || '') === (def.notes || '');

    if (
      oldCfg === 'operational' &&
      nextCfg === 'operational' &&
      notesUnchanged &&
      old.role === def.role &&
      old.lat === def.lat &&
      old.lon === def.lon &&
      (old.downReason || '') === (def.downReason || '') &&
      old.latencyMs != null
    ) {
      const latencyMs = old.latencyMs;
      return {
        ...next,
        notes: def.notes,
        configStatus: 'operational',
        latencyMs,
        status: latencyToStatus(latencyMs),
      };
    }
    return next;
  });
}

export function clusterDotStatus(servers) {
  if (servers.some((s) => s.status === 'down')) return 'down';
  if (servers.some((s) => s.status === 'slow')) return 'slow';
  if (servers.some((s) => s.status === 'building')) return 'building';
  if (servers.some((s) => s.status === 'maintenance')) return 'maintenance';
  return 'operational';
}

export function serverStatusLabel(status) {
  if (status === 'operational') return 'Operational';
  if (status === 'slow') return 'Slow';
  if (status === 'degraded') return 'Degraded';
  if (status === 'building') return 'In Building';
  if (status === 'maintenance') return 'Maintenance';
  if (status === 'down') return 'Down';
  return 'Unavailable';
}

/** Shared live fleet — one simulation for status map + admin. */
let liveServers = initLiveServers();
let tickIntervalId = null;
const liveListeners = new Set();

function notifyLiveListeners() {
  const snapshot = liveServers;
  for (const listener of liveListeners) listener(snapshot);
}

function runLiveTick() {
  liveServers = tickLiveServers(liveServers);
  notifyLiveListeners();
}

function startLiveTicks() {
  if (tickIntervalId != null) return;
  tickIntervalId = window.setInterval(runLiveTick, LIVE_SERVERS_TICK_MS);
}

function stopLiveTicks() {
  if (tickIntervalId == null) return;
  window.clearInterval(tickIntervalId);
  tickIntervalId = null;
}

export function getLiveServers() {
  return liveServers;
}

export function reloadLiveServerStore(definitions = getMapServerDefinitions()) {
  liveServers = reloadLiveServers(liveServers, definitions);
  notifyLiveListeners();
}

/**
 * Subscribe to the shared live server simulation.
 * @param {(servers: ReturnType<typeof initLiveServers>) => void} listener
 */
export function subscribeLiveServers(listener) {
  liveListeners.add(listener);
  if (liveListeners.size === 1) startLiveTicks();
  listener(liveServers);
  return () => {
    liveListeners.delete(listener);
    if (liveListeners.size === 0) stopLiveTicks();
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener(SERVERS_UPDATED_EVENT, () => {
    reloadLiveServerStore();
  });
}
