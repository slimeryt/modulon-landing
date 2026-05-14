import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Github,
  LogIn,
  LogOut,
  MessageCircle,
  Twitter,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import modulonIcon from './assets/icons/Modulon_Icon.png';

function BrandMark({ className = 'h-5 w-5' }) {
  return (
    <img
      src={modulonIcon}
      alt=""
      decoding="async"
      className={`object-contain shrink-0 ${className}`}
    />
  );
}

// ─── Brand diagonal-l glyph (Anthropic-i style) ──────────────────────────────
function BrandL({ style = {} }) {
  return (
    <svg
      aria-hidden="true"
      style={{ display: 'inline-block', width: '0.48em', height: '1em', verticalAlign: '-0.08em', ...style }}
      viewBox="0 0 48 100"
      fill="currentColor"
    >
      <line x1="13" y1="2" x2="38" y2="97" stroke="currentColor" strokeWidth="8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const GLOBE_PX = 1000;
const GLOBE_R  = 462;
const GLOBE_SCALE = GLOBE_PX / 580;
const MASK_W   = 720;
const MASK_H   = 360;
const VIEW_PITCH = (22 * Math.PI) / 180;
const cosPitch = Math.cos(VIEW_PITCH);
const sinPitch = Math.sin(VIEW_PITCH);

function globeToView(lat, lon, spin) {
  const theta = lon + spin;
  const x0 = GLOBE_R * Math.cos(lat) * Math.sin(theta);
  const y0 = GLOBE_R * Math.sin(lat);
  const z0 = GLOBE_R * Math.cos(lat) * Math.cos(theta);
  return {
    x: x0,
    y: y0 * cosPitch - z0 * sinPitch,
    z: y0 * sinPitch + z0 * cosPitch,
  };
}

const LAND_POLYS = [
  [[-170,64],[-168,72],[-145,73],[-130,72],[-100,74],[-85,73],
   [-75,83],[-60,82],[-52,73],[-52,67],[-57,58],[-62,48],
   [-67,44],[-70,43],[-75,35],[-80,25],[-84,22],[-90,19],
   [-92,16],[-88,15],[-83,10],[-77,8],[-80,8],[-83,11],
   [-90,20],[-97,26],[-110,23],[-117,32],[-122,37],[-124,46],
   [-132,56],[-148,60],[-165,60],[-170,64]],
  [[-46,60],[-25,62],[-18,73],[-18,77],[-33,83],
   [-50,83],[-65,78],[-68,72],[-60,66],[-46,60]],
  [[-80,12],[-75,12],[-62,12],[-60,7],[-52,4],[-50,0],
   [-35,-5],[-35,-12],[-38,-16],[-40,-22],[-43,-23],[-44,-30],
   [-52,-34],[-58,-38],[-62,-42],[-65,-55],[-68,-55],
   [-72,-46],[-72,-38],[-68,-30],[-72,-18],[-76,-10],[-80,0],[-80,12]],
  [[-10,36],[5,37],[15,37],[28,36],[32,40],[36,42],
   [40,41],[44,44],[50,44],[60,52],[58,60],[50,70],
   [30,72],[15,70],[5,62],[-2,58],[-5,54],[-10,52],[-10,36]],
  [[-18,16],[-16,11],[-15,5],[-8,5],[2,5],[9,5],
   [10,0],[10,-5],[12,-10],[12,-18],[18,-35],[26,-35],
   [33,-28],[40,-14],[43,-12],[44,12],[42,12],[50,12],
   [44,16],[38,22],[36,30],[32,32],[24,37],[14,37],
   [10,37],[0,32],[-5,33],[-8,28],[-18,22],[-18,16]],
  [[26,72],[60,73],[100,73],[140,73],[160,73],[170,65],
   [163,58],[150,48],[145,44],[140,36],[130,42],[122,32],
   [118,22],[110,15],[105,5],[104,-2],[110,-8],[118,-9],
   [118,5],[125,10],[130,20],[140,35],[145,44],[150,50],
   [140,52],[132,65],[100,73],[60,73],[26,72]],
  [[32,30],[37,22],[44,13],[50,12],[56,22],[60,22],
   [58,26],[55,24],[50,30],[45,32],[38,37],[32,30]],
  [[62,22],[70,24],[72,20],[78,35],[80,28],[90,28],
   [92,22],[88,20],[80,10],[77,8],[68,22],[62,22]],
  [[114,-22],[118,-20],[122,-18],[132,-12],[136,-12],
   [140,-14],[148,-20],[152,-24],[154,-28],[152,-32],
   [150,-38],[146,-40],[140,-38],[130,-33],[126,-34],
   [118,-34],[114,-34],[113,-26],[114,-22]],
  [[-180,-65],[180,-65],[180,-90],[-180,-90],[-180,-65]],
];

function buildLandMask() {
  const c = document.createElement('canvas');
  c.width = MASK_W; c.height = MASK_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MASK_W, MASK_H);
  ctx.fillStyle = '#fff';
  LAND_POLYS.forEach(poly => {
    ctx.beginPath();
    poly.forEach(([lon, lat], i) => {
      const x = (lon + 180) / 360 * MASK_W;
      const y = (90 - lat) / 180 * MASK_H;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  });
  return ctx.getImageData(0, 0, MASK_W, MASK_H).data;
}

function isLand(latRad, lonRad, mask) {
  let lon = lonRad % (2 * Math.PI);
  if (lon < 0) lon += 2 * Math.PI;
  const x = Math.min(MASK_W - 1, Math.floor(lon / (2 * Math.PI) * MASK_W));
  const y = Math.min(MASK_H - 1, Math.floor((Math.PI / 2 - latRad) / Math.PI * MASK_H));
  return mask[(y * MASK_W + x) * 4] > 128;
}

function DottedGlobe() {
  const ref = useRef(null);

  useEffect(() => {
    const mask = buildLandMask();
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = GLOBE_PX * dpr;
    canvas.height = GLOBE_PX * dpr;
    ctx.scale(dpr, dpr);

    const cx = GLOBE_PX / 2;
    const cy = GLOBE_PX / 2;

    const pts = [];
    const latStepBase = 2.0 / GLOBE_SCALE;
    for (let latDeg = -90; latDeg <= 90; latDeg += latStepBase) {
      const lat    = (latDeg * Math.PI) / 180;
      const cosLat = Math.cos(lat);
      const step   = Math.max(latStepBase, latStepBase / Math.max(0.1, cosLat));
      for (let lonDeg = 0; lonDeg < 360; lonDeg += step) {
        const lon = (lonDeg * Math.PI) / 180;
        if (isLand(lat, lon, mask)) pts.push({ lat, lon });
      }
    }

    let angle = 0;
    let raf;

    const draw = () => {
      ctx.clearRect(0, 0, GLOBE_PX, GLOBE_PX);
      angle += 0.004;

      const strokeCurve = (segments, alpha, lw) => {
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = lw;
        segments.forEach(pts => {
          if (pts.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(pts[0].sx, pts[0].sy);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
          ctx.stroke();
        });
      };

      const splitByFront = (samples, zMin) => {
        const out = [];
        let cur = [];
        for (const p of samples) {
          if (p.z > zMin) {
            cur.push(p);
          } else if (cur.length) {
            out.push(cur);
            cur = [];
          }
        }
        if (cur.length) out.push(cur);
        return out;
      };

      const samplesEquator = [];
      const curveStep = 0.045 / GLOBE_SCALE;
      for (let lon = -Math.PI; lon <= Math.PI + 0.001; lon += curveStep) {
        const { x, y, z } = globeToView(0, lon, angle);
        samplesEquator.push({ sx: cx + x, sy: cy - y, z });
      }
      strokeCurve(splitByFront(samplesEquator, 0), 0.1, 0.9);

      const meridianLons = [0, Math.PI / 2];
      const meridStep = 0.04 / GLOBE_SCALE;
      meridianLons.forEach(lon0 => {
        const samp = [];
        for (let lat = -Math.PI / 2; lat <= Math.PI / 2 + 0.001; lat += meridStep) {
          const { x, y, z } = globeToView(lat, lon0, angle);
          samp.push({ sx: cx + x, sy: cy - y, z });
        }
        strokeCurve(splitByFront(samp, 0), 0.08, 0.85);
      });

      const lx = -0.42;
      const ly = -0.52;
      const lz = 0.74;
      const lLen = Math.hypot(lx, ly, lz);
      const rimSegs = 96;
      for (let i = 0; i < rimSegs; i++) {
        const a0 = (i / rimSegs) * Math.PI * 2;
        const a1 = ((i + 1) / rimSegs) * Math.PI * 2;
        const nx0 = Math.cos(a0);
        const ny0 = Math.sin(a0);
        const nx1 = Math.cos(a1);
        const ny1 = Math.sin(a1);
        const nd =
          (Math.max(0, (nx0 * lx + ny0 * ly) / lLen) +
            Math.max(0, (nx1 * lx + ny1 * ly) / lLen)) /
          2;
        const rimA = 0.07 + 0.38 * (0.2 + 0.8 * nd);
        ctx.beginPath();
        ctx.moveTo(cx + GLOBE_R * nx0, cy - GLOBE_R * ny0);
        ctx.lineTo(cx + GLOBE_R * nx1, cy - GLOBE_R * ny1);
        ctx.strokeStyle = `rgba(255,255,255,${rimA.toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      const proj = pts.map(({ lat, lon }) => {
        const { x, y, z } = globeToView(lat, lon, angle);
        return { sx: cx + x, sy: cy - y, z };
      });
      proj.sort((a, b) => a.z - b.z);

      proj.forEach(({ sx, sy, z }) => {
        const n = z / GLOBE_R;
        let alpha, r;
        if (n > 0) {
          alpha = 0.2 + n * 0.75;
          r     = 1.4 + n * 0.7;
        } else {
          alpha = 0.04 + (n + 1) * 0.06;
          r     = 0.9;
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ width: `${GLOBE_PX}px`, height: `${GLOBE_PX}px`, display: 'block' }}
    />
  );
}

function RotatingTypingText({
  phrases,
  typeMs = 46,
  deleteMs = 30,
  holdMs = 2200,
  gapMs = 380,
}) {
  const [line, setLine] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const target = phrases[phraseIndex % phrases.length];

  useEffect(() => {
    let timeoutId;

    if (!deleting) {
      if (line.length < target.length) {
        timeoutId = window.setTimeout(() => {
          setLine(target.slice(0, line.length + 1));
        }, typeMs);
      } else {
        timeoutId = window.setTimeout(() => setDeleting(true), holdMs);
      }
    } else if (line.length > 0) {
      timeoutId = window.setTimeout(() => setLine((s) => s.slice(0, -1)), deleteMs);
    } else {
      timeoutId = window.setTimeout(() => {
        setDeleting(false);
        setPhraseIndex((i) => (i + 1) % phrases.length);
      }, gapMs);
    }

    return () => clearTimeout(timeoutId);
  }, [line, deleting, phraseIndex, target, typeMs, deleteMs, holdMs, gapMs]);

  return (
    <p
      className="text-xl md:text-2xl text-zinc-600 dark:text-white/85 font-mono tracking-tight mb-6 min-h-[2.5rem] md:min-h-[3rem]"
      aria-live="polite"
    >
      {line}
      <span className="inline-block w-[2px] h-[1.05em] ml-0.5 bg-zinc-800/60 align-[-0.1em] animate-pulse dark:bg-white/70" />
    </p>
  );
}

const HERO_TYPING_PHRASES = [
  'Hello World',
  'Welcome.',
  'From: Marlon, Robyn, Audric, Rafael',
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { firebaseConfigured, user, signOutUser } = useAuth();

  const authPillShell =
    'inline-flex shrink-0 items-stretch rounded-full border border-zinc-300/90 bg-white/80 shadow-sm backdrop-blur-sm transition-[border-color,box-shadow] duration-200 hover:border-zinc-400/90 dark:border-white/[0.12] dark:bg-[#0c0c0e]/80 dark:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)] dark:hover:border-white/25';
  const authPillSeg =
    'flex min-w-10 items-center justify-center py-2 text-zinc-700 transition-colors duration-200 hover:bg-zinc-200/90 hover:text-zinc-900 focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-0 dark:text-white/85 dark:hover:bg-white/[0.1] dark:hover:text-white dark:focus-visible:ring-white/25';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-xl transition-[background-color,box-shadow,border-color] duration-300 ${
        scrolled
          ? 'border-zinc-200/90 bg-white/92 shadow-[0_1px_0_rgba(0,0,0,0.04),0_12px_40px_-16px_rgba(0,0,0,0.12)] dark:border-white/[0.08] dark:bg-[#0a0a0a]/92 dark:shadow-[0_1px_0_rgba(255,255,255,0.04),0_20px_50px_-24px_rgba(0,0,0,0.75)]'
          : 'border-zinc-200/80 bg-white/85 dark:border-white/[0.06] dark:bg-[#0a0a0a]/80'
      }`}
    >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 rounded-lg -ml-1 pl-1 pr-2 py-1 hover:opacity-90 transition-opacity">
            <BrandMark className="h-5 w-5 opacity-90 dark:opacity-95" />
            <span className="text-zinc-900 dark:text-white font-semibold tracking-tight text-lg">Modulon</span>
            <span className="text-zinc-600 dark:text-white/30 text-xs font-mono ml-1">v0.1.0</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {['About', 'Docs'].map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`} className="text-zinc-600 dark:text-white/50 text-sm hover:text-zinc-900 dark:hover:text-white transition-colors duration-200 cursor-pointer">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              {firebaseConfigured && user ? (
                <>
                  <span className="hidden sm:inline text-xs text-zinc-600 dark:text-white/45 max-w-[12rem] truncate" title={user.email || ''}>
                    {user.email}
                  </span>
                  <div className={authPillShell} role="group" aria-label="Chat and account">
                    <Link
                      to="/chat"
                      aria-label="Chat"
                      className={`${authPillSeg} group rounded-l-full pl-2.5 pr-2`}
                    >
                      <span className="flex items-center overflow-hidden transition-transform duration-300 ease-out will-change-transform group-hover:-translate-x-1">
                        <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                        <span
                          className="text-sm font-medium whitespace-nowrap max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity,margin] duration-300 ease-out group-hover:max-w-[4rem] group-hover:opacity-100 group-hover:ml-2"
                          aria-hidden
                        >
                          Chat
                        </span>
                      </span>
                    </Link>
                    <span
                      className="pointer-events-none self-center h-5 w-px shrink-0 rounded-full bg-zinc-300/80 dark:bg-white/15"
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() => void signOutUser()}
                      aria-label="Sign out"
                      className={`${authPillSeg} group rounded-r-full pl-2 pr-2.5`}
                    >
                      <span className="flex flex-row-reverse items-center overflow-hidden transition-transform duration-300 ease-out will-change-transform group-hover:translate-x-1">
                        <LogOut className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                        <span
                          className="text-sm font-medium whitespace-nowrap max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity,margin] duration-300 ease-out group-hover:max-w-[6rem] group-hover:opacity-100 group-hover:mr-2"
                          aria-hidden
                        >
                          Sign out
                        </span>
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <Link
                  to="/login"
                  aria-label="Log in"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-300/90 bg-white/85 text-zinc-700 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-zinc-400 hover:bg-white hover:text-zinc-900 dark:border-white/[0.12] dark:bg-[#0c0c0e]/85 dark:text-white/85 dark:hover:border-white/30 dark:hover:bg-white/[0.08] dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/45 focus-visible:ring-offset-0 dark:focus-visible:ring-white/25"
                >
                  <LogIn className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                </Link>
              )}
            </div>
          </div>
        </div>
    </nav>
  );
}

function Hero() {
  return (
    <section
      id="about"
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 20% 50%, rgba(255,255,255,0.04) 0%, transparent 70%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-16 w-full flex items-center">
        <div className="flex-1 max-w-xl">
          <h1 className="text-6xl md:text-7xl font-bold tracking-tight leading-none mb-6 font-sans">
            <span className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-500 bg-clip-text text-transparent dark:from-white dark:via-white dark:to-white/45">
              Modulon.
            </span>
          </h1>

          <RotatingTypingText phrases={HERO_TYPING_PHRASES} />

          <p className="text-zinc-600 dark:text-white/50 text-lg leading-relaxed mb-10 max-w-md">
            An AI chatbot trained entirely from scratch on real human conversation —
            no pretrained weights, no black-box APIs. Just raw dialogue, a neural network,
            and time.
          </p>

          <div className="flex items-center gap-4 flex-wrap">
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white/90 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-white/30"
            >
              Start Chatting
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300/90 bg-white/60 px-6 py-3 text-sm font-medium text-zinc-800 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-zinc-400 hover:bg-white/90 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:border-white/20 dark:bg-white/[0.06] dark:text-white/80 dark:hover:border-white/45 dark:hover:bg-white/[0.1] dark:hover:text-white dark:focus-visible:ring-white/30"
            >
              Get started
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300/90 bg-white/60 px-6 py-3 text-sm font-medium text-zinc-800 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-zinc-400 hover:bg-white/90 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:border-white/20 dark:bg-white/[0.06] dark:text-white/80 dark:hover:border-white/45 dark:hover:bg-white/[0.1] dark:hover:text-white dark:focus-visible:ring-white/30"
            >
              <Github className="h-4 w-4 shrink-0" aria-hidden />
              View Source
            </button>
          </div>
        </div>
      </div>

      <div
        className="fixed z-[1] right-0 top-1/2 pointer-events-none select-none"
        style={{
          transform:
            'translateY(-50%) translateX(max(28%, calc(64px + 8vw)))',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <DottedGlobe />
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none dark:hidden"
        style={{ background: 'linear-gradient(to bottom, transparent, rgb(244 244 245))' }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 hidden h-32 pointer-events-none dark:block"
        style={{ background: 'linear-gradient(to bottom, transparent, #0a0a0a)' }}
      />

      {/* Scroll indicator */}
      <button
        onClick={() => document.getElementById('northstar').scrollIntoView({ behavior: 'smooth' })}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 cursor-pointer group"
        aria-label="Scroll to Project Northstar"
      >
        <span className="text-xs font-mono tracking-widest uppercase text-zinc-500 transition-colors group-hover:text-zinc-700 dark:text-white/20 dark:group-hover:text-white/40">
          scroll
        </span>
        <svg
          className="h-4 w-4 text-zinc-500 transition-colors animate-bounce group-hover:text-zinc-700 dark:text-white/20 dark:group-hover:text-white/50"
          fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v10M3 9l5 5 5-5" />
        </svg>
      </button>
    </section>
  );
}

// ─── Scroll-reveal hook ───────────────────────────────────────────────────────
function useReveal(threshold = 0.2) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

// ─── North Star SVG ───────────────────────────────────────────────────────────
function NorthStar({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* 4-point star */}
      <path
        d="M32 2 L35 29 L62 32 L35 35 L32 62 L29 35 L2 32 L29 29 Z"
        fill="white"
        opacity="0.9"
      />
      {/* Subtle glow ring */}
      <circle cx="32" cy="32" r="28" stroke="white" strokeWidth="0.5" opacity="0.12" />
    </svg>
  );
}

// ─── Project Northstar section ────────────────────────────────────────────────
function ProjectNorthstar() {
  const [ref, visible] = useReveal(0.15);

  const pillars = [
    {
      icon: '◈',
      title: 'Transformer Core',
      desc: 'A full attention-based architecture built from the ground up — no shortcuts.',
    },
    {
      icon: '◉',
      title: 'Long-Term Memory',
      desc: 'Persistent context across sessions so conversations actually build on each other.',
    },
    {
      icon: '◎',
      title: 'Multilingual',
      desc: 'Trained on dialogue from multiple languages, starting with English and German.',
    },
  ];

  return (
    <section
      id="northstar"
      className="relative z-10 overflow-hidden py-40 px-6 bg-zinc-200/30 backdrop-blur-[2px] dark:bg-[#0a0a0a]/80"
    >
      {/* Radial glow behind star */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(255,255,255,0.055) 0%, transparent 65%)',
        }}
      />

      {/* Horizontal rule top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
      />

      {/* Everything fades in as one block */}
      <div
        ref={ref}
        className="relative z-10 max-w-3xl mx-auto flex flex-col items-center text-center gap-10"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 900ms ease, transform 900ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Badge */}
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300/90 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-zinc-600 dark:border-white/15 dark:text-white/40">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-white/30" />
          In Development
        </span>

        <NorthStar size={56} />

        <h2 className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-500 bg-clip-text pb-[0.12em] text-5xl font-bold leading-none tracking-tight text-transparent md:text-7xl dark:from-white dark:via-white dark:to-white/35">
          Project Northstar
        </h2>

        <p className="text-zinc-600 dark:text-white/40 text-lg leading-relaxed max-w-lg">
          The next generation of Modulon. A full transformer architecture, persistent memory,
          and multilingual reasoning — trained entirely from scratch.
        </p>

        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {pillars.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200/90 bg-white/90 p-6 text-left shadow-sm dark:border-white/10 dark:bg-[#111111] dark:shadow-none"
            >
              <span className="text-xl font-mono text-zinc-500 dark:text-white/30">{icon}</span>
              <span className="text-sm font-semibold text-zinc-800 dark:text-white/80">{title}</span>
              <span className="text-sm leading-relaxed text-zinc-600 dark:text-white/35">{desc}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 h-12 w-px bg-gradient-to-b from-zinc-400/40 to-transparent dark:from-white/20" />
      </div>

      {/* Horizontal rule bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
      />
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-zinc-200 bg-zinc-100 px-6 py-10 dark:border-white/8 dark:bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BrandMark className="h-4 w-4 opacity-50" />
          <span className="text-zinc-600 dark:text-white/30 text-sm">Modulon v0.1.0</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-zinc-600 dark:text-white/20 text-xs font-mono">
          <span>
            © {new Date().getFullYear()} Modulon · Trained on Cornell Movie Dialogs · MIT License
          </span>
          <Link
            to="/chat"
            className="text-zinc-500 transition-colors hover:text-zinc-800 dark:text-white/35 dark:hover:text-white/70"
          >
            Chat (prototype)
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <a href="#" className="cursor-pointer text-zinc-500 transition-colors duration-200 hover:text-zinc-800 dark:text-white/25 dark:hover:text-white/60">
            <Github className="w-4 h-4" />
          </a>
          <a href="#" className="cursor-pointer text-zinc-500 transition-colors duration-200 hover:text-zinc-800 dark:text-white/25 dark:hover:text-white/60">
            <Twitter className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function ModulonLanding() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = ''; };
  }, []);

  return (
    <div className="bg-zinc-100 text-zinc-900 dark:bg-[#0a0a0a] dark:text-white min-h-screen font-sans antialiased">
      <Navbar />
      <Hero />
      <ProjectNorthstar />
      <Footer />
    </div>
  );
}
