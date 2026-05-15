import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Home } from 'lucide-react';
import { useAuth, mapAuthError } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { useTheme } from './ThemeContext';
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

// ─── Globe (same as landing page, slightly larger for login hero) ────────────
const GLOBE_PX = 680;
const GLOBE_R  = 314;
const MASK_W   = 720;
const MASK_H   = 360;
const TILT     = (20 * Math.PI) / 180;

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

function DottedGlobe({ initialSpeed = 0.004 }) {
  const ref = useRef(null);

  useEffect(() => {
    const mask   = buildLandMask();
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
    for (let latDeg = -90; latDeg <= 90; latDeg += 2.5) {
      const lat    = (latDeg * Math.PI) / 180;
      const cosLat = Math.cos(lat);
      const step   = Math.max(2.5, 2.5 / Math.max(0.1, cosLat));
      for (let lonDeg = 0; lonDeg < 360; lonDeg += step) {
        const lon = (lonDeg * Math.PI) / 180;
        if (isLand(lat, lon, mask)) pts.push({ lat, lon });
      }
    }

    let angle = 0;
    let speed = initialSpeed;   // starts fast if coming from auth page
    let raf;

    const draw = () => {
      ctx.clearRect(0, 0, GLOBE_PX, GLOBE_PX);
      // Smoothly decelerate toward the normal cruise speed
      speed += (0.004 - speed) * 0.025;
      angle += speed;

      // Globe outline
      ctx.beginPath();
      ctx.arc(cx, cy, GLOBE_R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth   = 0.8;
      ctx.stroke();

      const proj = pts.map(({ lat, lon }) => {
        const theta = lon + angle;
        const x3 = GLOBE_R * Math.cos(lat) * Math.sin(theta);
        const y3 = GLOBE_R * Math.sin(lat);
        const z3 = GLOBE_R * Math.cos(lat) * Math.cos(theta);
        const y4 = y3 * Math.cos(TILT) - z3 * Math.sin(TILT);
        const z4 = y3 * Math.sin(TILT) + z3 * Math.cos(TILT);
        return { sx: cx + x3, sy: cy - y4, z: z4 };
      });
      proj.sort((a, b) => a.z - b.z);

      proj.forEach(({ sx, sy, z }) => {
        const n = z / GLOBE_R;
        const alpha = n > 0 ? 0.2 + n * 0.75 : 0.04 + (n + 1) * 0.06;
        const r     = n > 0 ? 1.4 + n * 0.7  : 0.9;
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

// ─── Login Page ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromAuth = location.state?.from === 'auth'; // coming from signup page
  const { firebaseConfigured, ready, user, signInWithEmail, signInWithGoogle, sendPasswordReset } =
    useAuth();
  const { resolved } = useTheme();
  const { t } = useLanguage();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // If from auth: globe is already "there" — no shrink needed. If from landing: shrink in.
  const [globeIn,  setGlobeIn]  = useState(fromAuth);

  useEffect(() => {
    if (fromAuth) return; // fast-spin handles the entrance, no scale animation needed
    const t = setTimeout(() => setGlobeIn(true), 30);
    return () => clearTimeout(t);
  }, [fromAuth]);

  useEffect(() => {
    if (!ready || !user || !firebaseConfigured) return;
    const dest = location.state?.from?.pathname || '/chat';
    navigate(dest, { replace: true });
  }, [ready, user, firebaseConfigured, location.state, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firebaseConfigured) {
      setError('Firebase is not configured. Add VITE_FIREBASE_* keys to .env and restart Vite.');
      return;
    }
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      const dest = location.state?.from?.pathname || '/chat';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!firebaseConfigured) {
      setError('Firebase is not configured. Add VITE_FIREBASE_* keys to .env and restart Vite.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      const dest = location.state?.from?.pathname || '/chat';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    if (!firebaseConfigured) {
      setError('Firebase is not configured.');
      return;
    }
    if (!email.trim()) {
      setError('Enter your email above, then click “Send reset link”.');
      return;
    }
    setError('');
    setResetSent(false);
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-[#0a0a0a] dark:text-white font-sans flex overflow-hidden"
      style={{
        backgroundImage:
          resolved === 'light'
            ? 'linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px)'
            : 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)',
        backgroundSize: '72px 72px',
      }}
    >
      <Link
        to="/"
        aria-label="Home"
        className="fixed left-5 top-5 z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/50 bg-white/90 text-zinc-700 shadow-sm backdrop-blur-md transition-all hover:border-zinc-300/55 hover:bg-white hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:border-white/10 dark:bg-[#0c0c0e]/90 dark:text-white/80 dark:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)] dark:hover:border-white/18 dark:hover:bg-white/[0.1] dark:hover:text-white dark:focus-visible:ring-white/25"
      >
        <Home className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
      </Link>
      {/* ── Left — form panel ── */}
      <div className="relative z-10 flex min-h-screen w-full max-w-md flex-col justify-center px-8 py-16 max-sm:pl-[4.75rem]">
        {/* Logo */}
        <Link to="/" className="mb-14 flex w-fit items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-opacity hover:opacity-90">
          <BrandMark className="h-5 w-5 ml-3 object-right opacity-90 dark:opacity-95" />
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-white">Modulon</span>
          <span className="font-mono text-xs text-zinc-500 dark:text-white/30">v0.1.0</span>
        </Link>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight mb-2">
            {t('auth.welcomeBack')}
          </h1>
          <p className="text-zinc-600 dark:text-white/40 text-sm">
            {t('auth.signInSubtitle')}
          </p>
        </div>

        {!firebaseConfigured ? (
          <p className="mb-4 rounded-2xl border border-amber-500/22 bg-amber-500/15 px-4 py-3 text-xs font-mono leading-relaxed text-amber-900 dark:border-amber-500/18 dark:bg-amber-500/10 dark:text-amber-200/90">
            Firebase env vars are missing. Copy <span className="text-amber-950 dark:text-white/90">.env.example</span> →{' '}
            <span className="text-amber-950 dark:text-white/90">.env</span>, add your Web App config from the Firebase console,
            then restart <span className="text-amber-950 dark:text-white/90">npm run dev</span>.
          </p>
        ) : null}

        {/* Form */}
        <form onSubmit={showForgot ? handlePasswordReset : handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-600 dark:text-white/50 font-medium uppercase tracking-widest pl-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-full border border-zinc-200/50 bg-white px-5 py-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-zinc-400/70 focus:outline-none focus:ring-2 focus:ring-zinc-300/25 transition-all duration-200 dark:bg-white/[0.05] dark:border-white/10 dark:text-white dark:placeholder:text-white/25 dark:focus:border-white/28 dark:focus:ring-white/15"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 pl-1">
              <label className="text-xs text-zinc-600 dark:text-white/50 font-medium uppercase tracking-widest">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowForgot((v) => !v);
                  setResetSent(false);
                  setError('');
                }}
                className="shrink-0 rounded-full border border-transparent px-3 py-1 text-xs text-zinc-600 transition-all hover:border-zinc-200/45 hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-white/40 dark:hover:border-white/08 dark:hover:bg-white/[0.06] dark:hover:text-white/75 cursor-pointer"
              >
                {showForgot ? 'Back to sign in' : 'Forgot password?'}
              </button>
            </div>
            {!showForgot ? (
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-full border border-zinc-200/50 bg-white px-5 py-3.5 pr-12 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-zinc-400/70 focus:outline-none focus:ring-2 focus:ring-zinc-300/25 transition-all duration-200 dark:bg-white/[0.05] dark:border-white/10 dark:text-white dark:placeholder:text-white/25 dark:focus:border-white/28 dark:focus:ring-white/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-white/35 dark:hover:bg-white/[0.08] dark:hover:text-white/80 cursor-pointer"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye    className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <p className="rounded-full border border-zinc-200/40 bg-white/60 px-5 py-3 text-xs leading-relaxed text-zinc-600 dark:border-white/08 dark:bg-white/[0.04] dark:text-white/40">
                We’ll email you a reset link for the address above.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-full border border-red-500/22 bg-red-500/10 px-4 py-2 text-center text-xs text-red-600 dark:text-red-300/90">{error}</p>
          )}
          {resetSent ? (
            <p className="rounded-full border border-emerald-500/22 bg-emerald-500/10 px-4 py-2 text-center text-xs text-emerald-700 dark:text-emerald-300/90">
              Check your inbox for a password reset link.
            </p>
          ) : null}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-zinc-200/45 bg-white px-8 py-3.5 text-sm font-semibold text-black shadow-sm transition-all duration-200 hover:border-zinc-300/50 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white dark:text-black dark:hover:border-white/15 dark:hover:bg-white/90"
          >
            {loading ? (
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: '300ms' }} />
              </span>
            ) : showForgot ? (
              'Send reset link'
            ) : (
              <>
                Sign in
                <ArrowRight className="h-4 w-4 shrink-0" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200/45 dark:bg-white/6" />
          <span className="font-mono text-xs text-zinc-600 dark:text-white/25">or</span>
          <div className="h-px flex-1 bg-zinc-200/45 dark:bg-white/6" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading || !firebaseConfigured}
          className="w-full cursor-pointer rounded-full border border-zinc-200/50 bg-white px-8 py-3.5 text-sm font-medium text-zinc-800 shadow-sm transition-all duration-200 hover:border-zinc-300/55 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/90 dark:hover:border-white/18 dark:hover:bg-white/[0.08]"
        >
          Continue with Google
        </button>

        {/* Sign up link */}
        <p className="text-sm text-zinc-600 dark:text-white/35 text-center">
          Don't have an account?{' '}
          <Link to="/signup" state={{ from: 'auth' }} className="text-zinc-700 dark:text-white/70 hover:text-zinc-950 dark:hover:text-white transition-colors font-medium">
            Sign up
          </Link>
        </p>
      </div>

      {/* ── Right — Globe ── */}
      <div className="hidden lg:flex flex-1 items-center justify-end relative overflow-hidden">
        {/* Radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 60% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)',
          }}
        />
        <div
          className="pointer-events-none select-none"
          style={{
            transform: `translateX(28%) scale(${globeIn ? 1 : 1.65})`,
            opacity: globeIn ? 1 : 0,
            transition: fromAuth
              ? 'none'
              : 'transform 750ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease',
          }}
        >
          <DottedGlobe initialSpeed={fromAuth ? 0.055 : 0.004} />
        </div>
      </div>
    </div>
  );
}
