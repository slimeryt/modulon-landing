import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Cpu,
  Github,
  Twitter,
  ChevronRight,
} from 'lucide-react';

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
      className="text-xl md:text-2xl text-white/85 font-mono tracking-tight mb-6 min-h-[2.5rem] md:min-h-[3rem]"
      aria-live="polite"
    >
      {line}
      <span className="inline-block w-[2px] h-[1.05em] ml-0.5 bg-white/70 align-[-0.1em] animate-pulse" />
    </p>
  );
}

const HERO_TYPING_PHRASES = [
  'Hello World',
  'Welcome.',
  'From: Marlon, Robyn, Audric, Rafael',
];

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 backdrop-blur-md bg-black/60">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-white" strokeWidth={1.5} />
          <span className="text-white font-semibold tracking-tight text-lg">Modulon</span>
          <span className="text-white/30 text-xs font-mono ml-1">v0.1.0</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {['About', 'Docs'].map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase()}`}
              className="text-white/50 text-sm hover:text-white transition-colors duration-200 cursor-pointer"
            >
              {l}
            </a>
          ))}
        </div>

        <button className="bg-white text-black text-sm font-semibold px-4 py-2 rounded-md hover:bg-white/90 transition-colors duration-200 cursor-pointer flex items-center gap-1.5">
          Get Started
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
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
          'radial-gradient(ellipse 80% 60% at 20% 50%, rgba(255,255,255,0.04) 0%, transparent 70%), #0a0a0a',
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
          <h1
            className="text-6xl md:text-7xl font-bold tracking-tight leading-none text-white mb-6"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            <span
              style={{
                background: 'linear-gradient(135deg, #ffffff 30%, rgba(255,255,255,0.45))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Modulon.
            </span>
          </h1>

          <RotatingTypingText phrases={HERO_TYPING_PHRASES} />

          <p className="text-white/50 text-lg leading-relaxed mb-10 max-w-md">
            An AI chatbot trained entirely from scratch on real human conversation —
            no pretrained weights, no black-box APIs. Just raw dialogue, a neural network,
            and time.
          </p>

          <div className="flex items-center gap-4 flex-wrap">
            <Link
              to="/chat"
              className="bg-white text-black font-semibold px-6 py-3 rounded-md hover:bg-white/90 transition-all duration-200 cursor-pointer flex items-center gap-2 text-sm"
            >
              Start Chatting
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button className="border border-white/20 text-white/70 font-medium px-6 py-3 rounded-md hover:border-white/50 hover:text-white transition-all duration-200 cursor-pointer flex items-center gap-2 text-sm">
              <Github className="w-4 h-4" />
              View Source
            </button>
          </div>
        </div>
      </div>

      <div
        className="absolute z-[5] right-0 top-1/2 pointer-events-none select-none"
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

      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, #0a0a0a)' }}
      />
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-white/8 px-6 py-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-white/30" strokeWidth={1.5} />
          <span className="text-white/30 text-sm">Modulon v0.1.0</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-white/20 text-xs font-mono">
          <span>
            © {new Date().getFullYear()} Modulon · Trained on Cornell Movie Dialogs · MIT License
          </span>
          <Link
            to="/chat"
            className="text-white/35 hover:text-white/70 transition-colors"
          >
            Chat (prototype)
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <a href="#" className="text-white/25 hover:text-white/60 transition-colors duration-200 cursor-pointer">
            <Github className="w-4 h-4" />
          </a>
          <a href="#" className="text-white/25 hover:text-white/60 transition-colors duration-200 cursor-pointer">
            <Twitter className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function ModulonLanding() {
  return (
    <div className="bg-[#0a0a0a] min-h-screen font-sans antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      `}</style>

      <Navbar />
      <Hero />
      <Footer />
    </div>
  );
}
