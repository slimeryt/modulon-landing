import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Monitor,
  Smartphone,
  Apple,
  Terminal,
  ExternalLink,
  CheckCircle,
  Clock,
} from 'lucide-react';
import modulonIcon from './assets/icons/Modulon_Icon.png';

const VERSION = 'v0.1.0';
const GITHUB_REPO = 'slimeryt/modulon-landing';
const RELEASE_BASE = `https://github.com/${GITHUB_REPO}/releases/latest/download`;

// Windows SVG icon
function WindowsIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

// Android SVG icon
function AndroidIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.523 15.341a.836.836 0 01-.835-.835.836.836 0 01.835-.836.836.836 0 01.835.836.836.836 0 01-.835.835m-11.046 0a.836.836 0 01-.835-.835.836.836 0 01.835-.836.836.836 0 01.835.836.836.836 0 01-.835.835m11.4-6.177l1.674-2.899a.348.348 0 00-.127-.476.348.348 0 00-.476.127l-1.696 2.936A10.29 10.29 0 0012 8.1a10.29 10.29 0 00-5.252 1.352L5.052 6.516a.348.348 0 00-.476-.127.348.348 0 00-.127.476l1.674 2.9C3.956 11.218 2.56 13.538 2.4 16.2h19.2c-.16-2.662-1.556-4.982-3.723-6.436" />
    </svg>
  );
}

// macOS icon
function MacIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

// Linux icon
function LinuxIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.504 0C6 0 2.25 5.25 2.25 10.5c0 1.5.375 2.998.75 4.5.75 2.25 2.25 4.125 3.375 5.625 1.5 2.625 2.625 4.5 2.625 7.125 0 .375.375.75.75.75h5.25c.375 0 .75-.375.75-.75 0-2.625 1.125-4.5 2.625-7.125 1.125-1.5 2.625-3.375 3.375-5.625.375-1.502.75-3 .75-4.5C21.75 5.25 18 0 12.504 0zM9 16.5c-.75 0-1.5-.75-1.5-1.5S8.25 13.5 9 13.5s1.5.75 1.5 1.5S9.75 16.5 9 16.5zm6 0c-.75 0-1.5-.75-1.5-1.5s.75-1.5 1.5-1.5 1.5.75 1.5 1.5-.75 1.5-1.5 1.5z" />
    </svg>
  );
}

const PLATFORMS = [
  {
    id: 'windows',
    label: 'Windows',
    sub: 'Windows 10 / 11  ·  x64',
    Icon: WindowsIcon,
    file: 'Modulon-Setup.exe',
    ext: '.exe',
    available: true,
    primary: true,
  },
  {
    id: 'android',
    label: 'Android',
    sub: 'Android 7.0+  ·  ARM / x86',
    Icon: AndroidIcon,
    file: 'Modulon.apk',
    ext: '.apk',
    available: true,
    primary: true,
  },
  {
    id: 'mac',
    label: 'macOS',
    sub: 'macOS 12+  ·  Intel & Apple Silicon',
    Icon: MacIcon,
    file: 'Modulon.dmg',
    ext: '.dmg',
    available: false,
  },
  {
    id: 'linux',
    label: 'Linux',
    sub: 'Ubuntu 20.04+  ·  x64  ·  AppImage',
    Icon: LinuxIcon,
    file: 'Modulon.AppImage',
    ext: '.AppImage',
    available: false,
  },
];

function PlatformCard({ platform }) {
  const { id, label, sub, Icon, file, available, primary } = platform;
  const href = `${RELEASE_BASE}/${file}`;

  return (
    <div
      className={`group relative flex flex-col gap-5 rounded-2xl border p-6 transition-all duration-200 ${
        available
          ? 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07] cursor-pointer'
          : 'border-white/[0.06] bg-white/[0.02] opacity-60'
      }`}
    >
      {/* Icon + label */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
              available
                ? 'border-white/10 bg-white/[0.08] text-white group-hover:border-white/18 group-hover:bg-white/[0.12]'
                : 'border-white/[0.06] bg-white/[0.04] text-white/40'
            } transition-colors duration-200`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className={`text-base font-semibold ${available ? 'text-white' : 'text-white/50'}`}>
              {label}
            </p>
            <p className="text-[11px] text-white/35 mt-0.5">{sub}</p>
          </div>
        </div>

        {available ? (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <CheckCircle className="w-2.5 h-2.5" />
            Available
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/35">
            <Clock className="w-2.5 h-2.5" />
            Soon
          </span>
        )}
      </div>

      {/* CTA */}
      {available ? (
        <a
          href={href}
          download
          className="flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white/90 transition-all duration-200 hover:border-white/22 hover:bg-white/[0.12] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          aria-label={`Download Modulon for ${label}`}
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden />
          Download for {label}
        </a>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/30">
          <Clock className="w-4 h-4 shrink-0" aria-hidden />
          Coming soon
        </div>
      )}
    </div>
  );
}

export default function DownloadsPage() {
  const [releaseInfo, setReleaseInfo] = useState(null);

  // Try to fetch latest release metadata from GitHub
  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setReleaseInfo(data);
      })
      .catch(() => {});
  }, []);

  const releaseDate = releaseInfo?.published_at
    ? new Date(releaseInfo.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const releaseTag = releaseInfo?.tag_name || VERSION;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-white/20">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 opacity-30 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(255,255,255,0.06),transparent)]" />

      {/* Nav */}
      <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div className="flex items-center gap-2">
          <img src={modulonIcon} alt="Modulon" className="h-6 w-6 object-contain opacity-90" />
          <span className="text-sm font-semibold tracking-tight text-white">Modulon</span>
        </div>
        <a
          href={`https://github.com/${GITHUB_REPO}/releases`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
        >
          All releases
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </nav>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pt-28 pb-24 sm:px-6 sm:pt-32">
        {/* Header */}
        <div className="mb-12 text-center">
          <img
            src={modulonIcon}
            alt=""
            className="mx-auto mb-6 h-16 w-16 object-contain opacity-90"
          />
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Download Modulon
          </h1>
          <p className="mt-4 text-base text-white/45 leading-relaxed max-w-lg mx-auto">
            Get the native app for your platform. All versions connect to the same Modulon AI.
          </p>

          {/* Version badge */}
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-mono font-medium text-white/60">
              {releaseTag}
            </span>
            {releaseDate && (
              <span className="text-xs text-white/30">Released {releaseDate}</span>
            )}
          </div>
        </div>

        {/* Platform grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <PlatformCard key={p.id} platform={p} />
          ))}
        </div>

        {/* Web fallback */}
        <div className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white/70">Prefer the browser?</p>
            <p className="text-xs text-white/35 mt-0.5">No install needed — works on any device.</p>
          </div>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/80 transition-all hover:border-white/18 hover:bg-white/[0.1] hover:text-white shrink-0"
          >
            Open in browser
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

        {/* Install notes */}
        <div className="mt-10 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-white/25">
            Install notes
          </p>
          <ul className="space-y-2 text-xs text-white/40 leading-relaxed">
            <li className="flex gap-2">
              <WindowsIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/25" />
              <span>
                <span className="text-white/60">Windows —</span> Run the installer. If SmartScreen
                warns you, click &ldquo;More info → Run anyway&rdquo;. The app auto-creates a Start
                Menu and Desktop shortcut.
              </span>
            </li>
            <li className="flex gap-2">
              <AndroidIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/25" />
              <span>
                <span className="text-white/60">Android —</span> Enable &ldquo;Install from unknown
                sources&rdquo; in Settings → Apps → Special app access, then open the APK. Required
                because the app is not on the Play Store yet.
              </span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/[0.06] pt-8 flex flex-col items-center gap-3 text-xs text-white/25">
          <p>© 2025 Modulon. All builds are unsigned — sideloading required.</p>
          <a
            href={`https://github.com/${GITHUB_REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-white/50 transition-colors"
          >
            View all releases on GitHub
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </main>
    </div>
  );
}
