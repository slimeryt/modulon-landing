import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  clusterDotStatus,
  getDownReason,
  getLiveServers,
  serverStatusLabel,
  subscribeLiveServers,
} from './mapServers';

const MIN_ZOOM = 1;
const MAX_ZOOM = 128;
const CITY_ZOOM_THRESHOLD = 9;
const CITY_FILL_ZOOM = 15;
const MAP_ASPECT = 2;

function formatZoom(z) {
  if (z >= 40) return `${Math.round(z)}×`;
  if (z >= 10) return `${z.toFixed(1)}×`;
  return `${z.toFixed(1)}×`;
}

function zoomStep(z) {
  if (z >= 80) return 1.05;
  if (z >= 50) return 1.06;
  if (z >= 20) return 1.08;
  if (z >= 12) return 1.12;
  if (z >= 6) return 1.18;
  return 1.25;
}

function geometryBbox(geometry) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    coords.forEach(walk);
  };

  walk(geometry.coordinates);
  return { minLon, maxLon, minLat, maxLat };
}

function bboxIntersectsView(bbox, centerLon, centerLat, lonSpan, latSpan) {
  const vLatMin = centerLat - latSpan / 2;
  const vLatMax = centerLat + latSpan / 2;
  if (bbox.maxLat < vLatMin || bbox.minLat > vLatMax) return false;

  const vLonMin = centerLon - lonSpan / 2;
  const vLonMax = centerLon + lonSpan / 2;

  for (const shift of [-360, 0, 360]) {
    const bLonMin = bbox.minLon + shift;
    const bLonMax = bbox.maxLon + shift;
    if (bLonMax >= vLonMin && bLonMin <= vLonMax) return true;
  }
  return false;
}

function mapRect(containerW, containerH) {
  const pad = 16;
  const availW = Math.max(1, containerW - pad * 2);
  const availH = Math.max(1, containerH - pad * 2);
  let w = availW;
  let h = w / MAP_ASPECT;
  if (h > availH) {
    h = availH;
    w = h * MAP_ASPECT;
  }
  return {
    x: (containerW - w) / 2,
    y: (containerH - h) / 2,
    w,
    h,
  };
}

function project(lonDeg, latDeg, centerLon, centerLat, zoom, rect) {
  const lonSpan = 360 / zoom;
  const latSpan = 180 / zoom;
  const dLon = lonDeg - centerLon;
  const dLat = latDeg - centerLat;
  return {
    x: rect.x + ((dLon / lonSpan) + 0.5) * rect.w,
    y: rect.y + (0.5 - dLat / latSpan) * rect.h,
  };
}

function unproject(px, py, centerLon, centerLat, zoom, rect) {
  const lonSpan = 360 / zoom;
  const latSpan = 180 / zoom;
  const nx = (px - rect.x) / rect.w;
  const ny = (py - rect.y) / rect.h;
  return {
    lon: centerLon + (nx - 0.5) * lonSpan,
    lat: centerLat + (0.5 - ny) * latSpan,
  };
}

function centerForAnchor(px, py, anchorLon, anchorLat, zoom, rect) {
  const lonSpan = 360 / zoom;
  const latSpan = 180 / zoom;
  const nx = (px - rect.x) / rect.w;
  const ny = (py - rect.y) / rect.h;
  return {
    centerLon: anchorLon - (nx - 0.5) * lonSpan,
    centerLat: anchorLat - (0.5 - ny) * latSpan,
  };
}

/** Keep ring vertices on one continuous longitude sheet (fixes dateline chords when panning). */
function unwrapRing(ring) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    let lon = ring[i][0];
    const lat = ring[i][1];
    if (i > 0) {
      const prevLon = out[i - 1][0];
      while (lon - prevLon > 180) lon -= 360;
      while (lon - prevLon < -180) lon += 360;
    }
    out.push([lon, lat]);
  }
  return out;
}

function offsetGeometry(geometry, dLon) {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) =>
        ring.map(([lon, lat]) => [lon + dLon, lat]),
      ),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly) =>
        poly.map((ring) => ring.map(([lon, lat]) => [lon + dLon, lat])),
      ),
    };
  }
  return geometry;
}

const SCREEN_BREAK_X = 0.38;
const SCREEN_BREAK_Y = 0.42;

function shouldBreakSegment(x0, y0, x1, y1, rect) {
  if (x0 == null) return true;
  if (Math.abs(x1 - x0) > rect.w * SCREEN_BREAK_X) return true;
  if (Math.abs(y1 - y0) > rect.h * SCREEN_BREAK_Y) return true;
  return false;
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.rect(x, y, w, h);
}

function traceRing(ctx, ring, centerLon, centerLat, zoom, rect) {
  if (!ring?.length) return;

  const unwrapped = unwrapRing(ring);
  let prevX = null;
  let prevY = null;

  for (let i = 0; i < unwrapped.length; i++) {
    const [lon, lat] = unwrapped[i];
    const { x, y } = project(lon, lat, centerLon, centerLat, zoom, rect);
    if (i === 0 || shouldBreakSegment(prevX, prevY, x, y, rect)) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    prevX = x;
    prevY = y;
  }

  const first = project(unwrapped[0][0], unwrapped[0][1], centerLon, centerLat, zoom, rect);
  const last = project(
    unwrapped[unwrapped.length - 1][0],
    unwrapped[unwrapped.length - 1][1],
    centerLon,
    centerLat,
    zoom,
    rect,
  );
  if (unwrapped.length > 2 && !shouldBreakSegment(last.x, last.y, first.x, first.y, rect)) {
    ctx.closePath();
  }
}

function traceGeometry(ctx, geometry, centerLon, centerLat, zoom, rect) {
  const { type, coordinates } = geometry;
  if (type === 'Polygon') {
    coordinates.forEach((ring) => traceRing(ctx, ring, centerLon, centerLat, zoom, rect));
  } else if (type === 'MultiPolygon') {
    coordinates.forEach((poly) =>
      poly.forEach((ring) => traceRing(ctx, ring, centerLon, centerLat, zoom, rect)),
    );
  }
}

function drawFilled(ctx, geometry, centerLon, centerLat, zoom, rect, fillStyle) {
  ctx.beginPath();
  traceGeometry(ctx, geometry, centerLon, centerLat, zoom, rect);
  ctx.fillStyle = fillStyle;
  ctx.fill('evenodd');
}

function drawStroked(ctx, geometry, centerLon, centerLat, zoom, rect, strokeStyle, lineWidth) {
  ctx.beginPath();
  traceGeometry(ctx, geometry, centerLon, centerLat, zoom, rect);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function bestViewLon(lon, centerLon) {
  let best = lon;
  let bestDist = Math.abs(lon - centerLon);
  for (const shift of [-360, 0, 360]) {
    const candidate = lon + shift;
    const dist = Math.abs(candidate - centerLon);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/** Below this zoom level, nearby servers render as one cluster dot. */
const SERVER_CLUSTER_MAX_ZOOM = 9;

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Stable per-server slots, blended toward geo — no abrupt mode switches while zooming. */
function spreadCityMarkers(group, centerLon, centerLat, zoom, rect, radius) {
  if (group.length <= 1) return group;

  const centroidLon = group.reduce((sum, m) => sum + m.server.lon, 0) / group.length;
  const centroidLat = group.reduce((sum, m) => sum + m.server.lat, 0) / group.length;
  const center = project(centroidLon, centroidLat, centerLon, centerLat, zoom, rect);

  const minGap = radius * 2 + 5;
  const unclusterT = smoothstep((zoom - SERVER_CLUSTER_MAX_ZOOM) / 2);
  const baseFan = Math.max(minGap * 0.48, 2 + zoom * 0.4);
  const fanPx = baseFan * (0.2 + 0.8 * unclusterT);

  const sorted = [...group].sort((a, b) => a.server.id.localeCompare(b.server.id));
  const count = sorted.length;

  return sorted.map((m, i) => {
    const slotAngle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const fanX = center.x + Math.cos(slotAngle) * fanPx;
    const fanY = center.y + Math.sin(slotAngle) * fanPx;

    const geoDist = Math.hypot(m.x - center.x, m.y - center.y);
    const geoBlend = smoothstep((geoDist - 0.5) / Math.max(fanPx * 0.9, 1));

    return {
      ...m,
      x: fanX + (m.x - fanX) * geoBlend,
      y: fanY + (m.y - fanY) * geoBlend,
    };
  });
}

function paintServerDot(ctx, x, y, radius, dark, status) {
  const isOk = status === 'operational';
  const isDown = status === 'down';
  const isSlow = status === 'slow' || status === 'degraded';
  const isBuilding = status === 'building';
  const isMaintenance = status === 'maintenance';
  const core = isOk
    ? dark
      ? '#34d399'
      : '#10b981'
    : isDown
      ? dark
        ? '#f87171'
        : '#ef4444'
      : isSlow
        ? dark
          ? '#fbbf24'
          : '#f59e0b'
        : isMaintenance
          ? dark
            ? '#c4b5fd'
            : '#8b5cf6'
          : isBuilding
            ? dark
              ? '#60a5fa'
              : '#3b82f6'
            : dark
              ? '#a1a1aa'
              : '#71717a';

  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = isOk
    ? dark
      ? 'rgba(52,211,153,0.2)'
      : 'rgba(16,185,129,0.24)'
    : isDown
      ? dark
        ? 'rgba(248,113,113,0.22)'
        : 'rgba(239,68,68,0.24)'
      : isSlow
        ? dark
          ? 'rgba(251,191,36,0.2)'
          : 'rgba(245,158,11,0.24)'
        : isMaintenance
          ? dark
            ? 'rgba(196,181,253,0.22)'
            : 'rgba(139,92,246,0.24)'
          : isBuilding
            ? dark
              ? 'rgba(96,165,250,0.22)'
              : 'rgba(59,130,246,0.24)'
            : dark
              ? 'rgba(161,161,170,0.18)'
              : 'rgba(113,113,122,0.2)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.92)' : '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function computeServerMarkers(servers, centerLon, centerLat, zoom, rect) {
  const lonSpan = 360 / zoom;
  const latSpan = 180 / zoom;
  const radius = Math.min(8, Math.max(4, 3.2 + zoom * 0.18));

  const visible = [];
  for (const server of servers) {
    const lon = bestViewLon(server.lon, centerLon);
    const lat = server.lat;
    if (Math.abs(lon - centerLon) > lonSpan / 2 + 1) continue;
    if (lat < centerLat - latSpan / 2 - 1 || lat > centerLat + latSpan / 2 + 1) continue;

    const { x, y } = project(lon, lat, centerLon, centerLat, zoom, rect);
    if (x < rect.x - 12 || x > rect.x + rect.w + 12) continue;
    if (y < rect.y - 12 || y > rect.y + rect.h + 12) continue;

    visible.push({ server, x, y, lon, lat });
  }

  if (!visible.length) return [];

  const byCity = new Map();
  for (const item of visible) {
    const key = item.server.city;
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(item);
  }

  const clustered = zoom < SERVER_CLUSTER_MAX_ZOOM;
  const markers = [];

  for (const group of byCity.values()) {
    if (clustered && group.length > 1) {
      const avgLon = group.reduce((sum, m) => sum + m.server.lon, 0) / group.length;
      const avgLat = group.reduce((sum, m) => sum + m.server.lat, 0) / group.length;
      const { x, y } = project(avgLon, avgLat, centerLon, centerLat, zoom, rect);
      markers.push({
        kind: 'cluster',
        x,
        y,
        radius: radius + 1.5,
        servers: group.map((m) => m.server),
      });
      continue;
    }

    const placed = spreadCityMarkers(group, centerLon, centerLat, zoom, rect, radius);

    for (const { server, x, y } of placed) {
      markers.push({
        kind: 'server',
        server,
        index: servers.findIndex((s) => s.id === server.id) + 1,
        x,
        y,
        radius,
      });
    }
  }

  return markers;
}

function hitTestMarker(px, py, markers) {
  for (let i = markers.length - 1; i >= 0; i--) {
    const marker = markers[i];
    const hitR = marker.radius + 8;
    if (Math.hypot(px - marker.x, py - marker.y) <= hitR) return marker;
  }
  return null;
}

function drawServerMarkers(ctx, markers, dark, zoom) {
  for (const marker of markers) {
    if (marker.kind === 'cluster') {
      paintServerDot(ctx, marker.x, marker.y, marker.radius, dark, clusterDotStatus(marker.servers));

      ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.95)' : '#ffffff';
      ctx.fillText(String(marker.servers.length), marker.x, marker.y + 0.5);

      if (zoom >= 4) {
        ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.72)' : 'rgba(39,39,42,0.78)';
        ctx.fillText(marker.servers[0].name, marker.x, marker.y + marker.radius + 6);
      }
      continue;
    }

    const { server, x, y, radius, index } = marker;
    paintServerDot(ctx, x, y, radius, dark, server.status);

    ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.95)' : '#ffffff';
    ctx.fillText(String(index), x, y + 0.5);
  }
}

function statusBadgeClass(status) {
  if (status === 'operational') {
    return 'bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-200/90 dark:ring-emerald-400/20';
  }
  if (status === 'slow' || status === 'degraded') {
    return 'bg-amber-500/15 text-amber-900 ring-amber-500/30 dark:text-amber-100/90 dark:ring-amber-400/25';
  }
  if (status === 'down') {
    return 'bg-red-500/15 text-red-900 ring-red-500/25 dark:text-red-200/90 dark:ring-red-400/20';
  }
  if (status === 'building') {
    return 'bg-blue-500/15 text-blue-900 ring-blue-500/25 dark:text-blue-200/90 dark:ring-blue-400/20';
  }
  if (status === 'maintenance') {
    return 'bg-violet-500/15 text-violet-900 ring-violet-500/25 dark:text-violet-200/90 dark:ring-violet-400/20';
  }
  return 'bg-zinc-500/15 text-zinc-700 ring-zinc-500/20 dark:text-white/70 dark:ring-white/15';
}

function ServerHoverCard({ marker }) {
  if (!marker) return null;

  if (marker.kind === 'cluster') {
    return (
      <div className="w-[min(16rem,calc(100vw-2rem))] rounded-xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 text-left text-xs shadow-xl backdrop-blur-md dark:border-white/[0.12] dark:bg-[#141416]/95 dark:shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
        <p className="font-semibold text-zinc-900 dark:text-white/95">
          {marker.servers[0]?.city} · {marker.servers.length} servers
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-white/45">Zoom in to inspect each node</p>
        <ul className="mt-2.5 space-y-2 border-t border-zinc-200/80 pt-2 dark:border-white/[0.08]">
          {marker.servers.map((server) => {
            const downReason = getDownReason(server);
            return (
              <li key={server.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-800 dark:text-white/85">{server.label}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-white/40">{server.role}</p>
                  {downReason ? (
                    <p className="mt-1 text-[11px] leading-snug text-red-700/90 dark:text-red-200/80">
                      {downReason}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${statusBadgeClass(server.status)}`}
                >
                  {serverStatusLabel(server.status)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const { server } = marker;
  const downReason = getDownReason(server);

  return (
    <div className="w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 text-left text-xs shadow-xl backdrop-blur-md dark:border-white/[0.12] dark:bg-[#141416]/95 dark:shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white/95">{server.label}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-white/45">
            {server.city}, {server.country}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${statusBadgeClass(server.status)}`}
        >
          {serverStatusLabel(server.status)}
        </span>
      </div>
      {downReason ? (
        <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[11px] leading-snug text-red-800 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100/90">
          <span className="font-semibold text-red-900/90 dark:text-red-50/95">Reason · </span>
          {downReason}
        </p>
      ) : null}
      <dl className="mt-2.5 space-y-1 border-t border-zinc-200/80 pt-2 text-[11px] dark:border-white/[0.08]">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-white/40">Role</dt>
          <dd className="text-right text-zinc-800 dark:text-white/80">{server.role}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-white/40">Region</dt>
          <dd className="text-right text-zinc-800 dark:text-white/80">{server.region}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-white/40">Provider</dt>
          <dd className="text-right text-zinc-800 dark:text-white/80">{server.provider}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-white/40">Uptime</dt>
          <dd className="font-mono text-zinc-800 dark:text-white/80">{server.uptime}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-white/40">Latency</dt>
          <dd className="font-mono text-zinc-800 dark:text-white/80">
            {server.latencyMs != null ? `${server.latencyMs} ms` : '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function isDark() {
  return document.documentElement.classList.contains('dark');
}

function clampCenterLat(lat, zoom) {
  const half = 90 / zoom;
  const minLat = -90 + half;
  const maxLat = 90 - half;

  // At min zoom the full world fits vertically — strict pole clamp locks pan to 0°.
  // Allow slack so the map can still be nudged up/down inside the frame.
  if (maxLat <= minLat + 1e-6) {
    const slack = 48;
    return Math.min(slack, Math.max(-slack, lat));
  }

  return Math.min(maxLat, Math.max(minLat, lat));
}

export default function StatusWorldMap({ className = '' }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const landRef = useRef(null);
  const countriesRef = useRef(null);
  const urbanRef = useRef(null);
  const urbanLoadRef = useRef(null);
  const viewRef = useRef({ zoom: 1, centerLon: 10, centerLat: 20 });
  const dragRef = useRef(null);
  const markersRef = useRef([]);
  const pointerRef = useRef({ x: 0, y: 0, inside: false });
  const [zoomLabel, setZoomLabel] = useState('1×');
  const [loadError, setLoadError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(null);
  const [servers, setServers] = useState(getLiveServers);
  const serversRef = useRef(servers);
  serversRef.current = servers;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const land = landRef.current;
    const countries = countriesRef.current;
    if (!canvas || !wrap || !land?.length || !countries?.length) return;

    try {
      const bounds = wrap.getBoundingClientRect();
      const cw = Math.max(1, Math.floor(bounds.width));
      const ch = Math.max(1, Math.floor(bounds.height));
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const dark = isDark();
      const { zoom, centerLon, centerLat } = viewRef.current;
      const rect = mapRect(cw, ch);
      const lonSpan = 360 / zoom;
      const latSpan = 180 / zoom;
      const lonMin = centerLon - lonSpan / 2;
      const lonMax = centerLon + lonSpan / 2;

      ctx.beginPath();
      roundRectPath(ctx, rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2, 6);
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(24,24,27,0.09)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 4);
      ctx.clip();

      ctx.fillStyle = dark ? 'rgba(255,255,255,0.02)' : 'rgba(24,24,27,0.03)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      const landFill = dark ? 'rgba(255,255,255,0.1)' : 'rgba(63,63,70,0.16)';
      const countryBorder = dark ? 'rgba(255,255,255,0.45)' : 'rgba(39,39,42,0.58)';
      const borderWidth = zoom >= 5 ? 1.05 : zoom >= 3 ? 0.9 : zoom >= 2 ? 0.8 : 0.7;

      for (const lonShift of [-360, 0, 360]) {
        for (const feature of land) {
          if (!feature?.geometry) continue;
          drawFilled(
            ctx,
            offsetGeometry(feature.geometry, lonShift),
            centerLon,
            centerLat,
            zoom,
            rect,
            landFill,
          );
        }
      }

      for (const lonShift of [-360, 0, 360]) {
        for (const feature of countries) {
          if (!feature?.geometry) continue;
          drawStroked(
            ctx,
            offsetGeometry(feature.geometry, lonShift),
            centerLon,
            centerLat,
            zoom,
            rect,
            countryBorder,
            borderWidth,
          );
        }
      }

      if (zoom >= CITY_ZOOM_THRESHOLD && urbanRef.current?.length) {
        const cityFill = dark ? 'rgba(255,255,255,0.07)' : 'rgba(63,63,70,0.12)';
        const cityStroke = dark ? 'rgba(255,255,255,0.58)' : 'rgba(39,39,42,0.68)';
        const cityWidth =
          zoom >= 64 ? 1.5 : zoom >= 40 ? 1.35 : zoom >= 22 ? 1.25 : zoom >= 16 ? 1.1 : zoom >= 12 ? 0.95 : 0.8;
        const showFill = zoom >= CITY_FILL_ZOOM;

        for (const { feature, bbox } of urbanRef.current) {
          if (!feature?.geometry) continue;
          if (!bboxIntersectsView(bbox, centerLon, centerLat, lonSpan, latSpan)) continue;

          for (const lonShift of [-360, 0, 360]) {
            const geom = offsetGeometry(feature.geometry, lonShift);
            if (showFill) {
              drawFilled(ctx, geom, centerLon, centerLat, zoom, rect, cityFill);
            }
            drawStroked(ctx, geom, centerLon, centerLat, zoom, rect, cityStroke, cityWidth);
          }
        }
      }

      const strokeCurve = (samples, alpha, lw) => {
        if (samples.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(samples[0].x, samples[0].y);
        for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y);
        ctx.strokeStyle = dark ? `rgba(255,255,255,${alpha})` : `rgba(24,24,27,${alpha})`;
        ctx.lineWidth = lw;
        ctx.stroke();
      };

      const gridStep = zoom >= 48 ? 0.125 : zoom >= 24 ? 0.25 : zoom >= 16 ? 0.5 : zoom >= 8 ? 1 : 2;

      const equator = [];
      let prevEq = null;
      for (let lon = lonMin; lon <= lonMax; lon += gridStep) {
        const pt = project(lon, 0, centerLon, centerLat, zoom, rect);
        if (prevEq && shouldBreakSegment(prevEq.x, prevEq.y, pt.x, pt.y, rect)) {
          strokeCurve(equator, 0.06, 0.75);
          equator.length = 0;
        }
        equator.push(pt);
        prevEq = pt;
      }
      strokeCurve(equator, 0.06, 0.75);

      const latMin = centerLat - latSpan / 2;
      const latMax = centerLat + latSpan / 2;
      const meridian = [];
      for (let lat = Math.max(-85, latMin); lat <= Math.min(85, latMax); lat += gridStep) {
        meridian.push(project(0, lat, centerLon, centerLat, zoom, rect));
      }
      strokeCurve(meridian, 0.05, 0.7);

      const markers = computeServerMarkers(serversRef.current, centerLon, centerLat, zoom, rect);
      markersRef.current = markers;
      drawServerMarkers(ctx, markers, dark, zoom);

      ctx.restore();

      if (pointerRef.current.inside && !dragRef.current) {
        const hit = hitTestMarker(pointerRef.current.x, pointerRef.current.y, markers);
        setHover(hit ? { marker: hit, x: pointerRef.current.x, y: pointerRef.current.y } : null);
      }
    } catch (err) {
      console.error('StatusWorldMap draw failed:', err);
      setLoadError('Map failed to render');
    }
  }, []);

  const ensureUrbanLoaded = useCallback(() => {
    if (urbanRef.current || urbanLoadRef.current) return urbanLoadRef.current;

    urbanLoadRef.current = import('./globeLandData')
      .then((mod) => mod.loadUrbanFeatures())
      .then((features) => {
        urbanRef.current = features.map((feature) => ({
          feature,
          bbox: geometryBbox(feature.geometry),
        }));
        draw();
        return urbanRef.current;
      })
      .catch((err) => {
        console.error('StatusWorldMap urban data load failed:', err);
        urbanLoadRef.current = null;
      });

    return urbanLoadRef.current;
  }, [draw]);

  useEffect(() => {
    let cancelled = false;
    import('./globeLandData')
      .then((mod) => {
        if (cancelled) return;
        landRef.current = mod.getLandFeatures();
        countriesRef.current = mod.getCountryFeatures();
        setLoadError(null);
        draw();
      })
      .catch((err) => {
        console.error('StatusWorldMap data load failed:', err);
        if (!cancelled) setLoadError('Map data failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);

    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [servers, draw]);

  useEffect(() => subscribeLiveServers(setServers), []);

  const applyZoom = useCallback(
    (nextZoom, clientX, clientY) => {
      const wrap = wrapRef.current;
      if (!wrap) return;

      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      const { zoom, centerLon, centerLat } = viewRef.current;
      if (z === zoom) return;

      const bounds = wrap.getBoundingClientRect();
      const px = clientX - bounds.left;
      const py = clientY - bounds.top;
      const rect = mapRect(bounds.width, bounds.height);
      const anchor = unproject(px, py, centerLon, centerLat, zoom, rect);
      const nextCenter = centerForAnchor(px, py, anchor.lon, anchor.lat, z, rect);

      viewRef.current.zoom = z;
      viewRef.current.centerLon = nextCenter.centerLon;
      viewRef.current.centerLat = clampCenterLat(nextCenter.centerLat, z);
      setZoomLabel(formatZoom(z));
      if (z >= CITY_ZOOM_THRESHOLD - 1) ensureUrbanLoaded();
      draw();
    },
    [draw, ensureUrbanLoaded],
  );

  const setZoom = useCallback(
    (next) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const bounds = wrap.getBoundingClientRect();
      applyZoom(next, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    },
    [applyZoom],
  );

  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      const step = zoomStep(viewRef.current.zoom);
      const factor = e.deltaY > 0 ? 1 / step : step;
      applyZoom(viewRef.current.zoom * factor, e.clientX, e.clientY);
    },
    [applyZoom],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        lon: viewRef.current.centerLon,
        lat: viewRef.current.centerLat,
      };
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const updateHover = useCallback((clientX, clientY) => {
    const wrap = wrapRef.current;
    if (!wrap) {
      setHover(null);
      return;
    }
    const bounds = wrap.getBoundingClientRect();
    const px = clientX - bounds.left;
    const py = clientY - bounds.top;
    pointerRef.current = { x: px, y: py, inside: true };
    const hit = hitTestMarker(px, py, markersRef.current);
    setHover(hit ? { marker: hit, x: px, y: py } : null);
  }, []);

  const onPointerMove = useCallback(
    (e) => {
      const wrap = wrapRef.current;
      if (!wrap) return;

      if (dragRef.current) {
        setHover(null);
        const bounds = wrap.getBoundingClientRect();
        const rect = mapRect(bounds.width, bounds.height);
        const { zoom } = viewRef.current;
        const lonSpan = 360 / zoom;
        const latSpan = 180 / zoom;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;

        viewRef.current.centerLon = dragRef.current.lon - (dx / rect.w) * lonSpan;
        viewRef.current.centerLat = clampCenterLat(
          dragRef.current.lat + (dy / rect.h) * latSpan,
          zoom,
        );
        draw();
        return;
      }

      updateHover(e.clientX, e.clientY);
    },
    [draw, updateHover],
  );

  const endDrag = useCallback(
    (e) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (e) updateHover(e.clientX, e.clientY);
    },
    [updateHover],
  );

  const onPointerLeave = useCallback(() => {
    pointerRef.current.inside = false;
    setHover(null);
  }, []);

  return (
    <div
      className={`relative flex h-full min-h-[min(100vh,720px)] w-full ${className}`}
      aria-label="Interactive world map"
    >
      <div
        ref={wrapRef}
        className={`relative h-full w-full touch-none select-none ${
          dragging ? 'cursor-grabbing' : hover ? 'cursor-pointer' : 'cursor-grab'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={onPointerLeave}
        onLostPointerCapture={endDrag}
      >
        <canvas ref={canvasRef} className="block h-full w-full pointer-events-none" role="img" aria-hidden />
        {hover ? (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: hover.x,
              top: hover.y - (hover.marker.radius + 10),
              transform: 'translate(-50%, -100%)',
            }}
          >
            <ServerHoverCard marker={hover.marker} />
          </div>
        ) : null}
        {loadError ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-500 dark:text-white/40">
            {loadError}
          </p>
        ) : null}
      </div>

      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setZoom(viewRef.current.zoom * zoomStep(viewRef.current.zoom))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200/90 bg-white/90 text-zinc-700 shadow-sm backdrop-blur-md transition-colors hover:bg-zinc-50 dark:border-white/[0.12] dark:bg-white/[0.08] dark:text-white/85 dark:hover:bg-white/[0.12]"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setZoom(viewRef.current.zoom / zoomStep(viewRef.current.zoom))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200/90 bg-white/90 text-zinc-700 shadow-sm backdrop-blur-md transition-colors hover:bg-zinc-50 dark:border-white/[0.12] dark:bg-white/[0.08] dark:text-white/85 dark:hover:bg-white/[0.12]"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="rounded-full border border-zinc-200/80 bg-white/85 px-2 py-1 text-center font-mono text-[10px] text-zinc-500 shadow-sm backdrop-blur-md dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white/40">
          {zoomLabel}
        </span>
      </div>
    </div>
  );
}
