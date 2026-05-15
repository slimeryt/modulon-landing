import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ScrollText } from 'lucide-react';

/**
 * Release notes shown on /changelog. Append new versions at the top when you ship.
 */
const RELEASES = [
  {
    version: '0.1.0',
    date: '2026-05-12',
    sections: [
      {
        title: 'Added',
        items: [
          'Public status page at /status with live GET /api/health checks and model readiness.',
          'This changelog page at /changelog.',
          'Mobile chat header: full-width bar for history, API indicator, and home; desktop keeps the compact floating toolbar.',
        ],
      },
      {
        title: 'Changed',
        items: [
          'Chat history sidebar defaults to closed on narrow viewports so the conversation uses full width first.',
        ],
      },
      {
        title: 'Fixed',
        items: [
          'Mobile: history toggle stayed under the open sidebar drawer; header stacking and sidebar top offset corrected.',
        ],
      },
    ],
  },
];

function SectionTitle({ children }) {
  return (
    <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 first:mt-0 dark:text-white/40">
      {children}
    </h3>
  );
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-[#070708] dark:text-white font-sans selection:bg-zinc-300/40 dark:selection:bg-white/20">
      <div className="pointer-events-none fixed inset-0 opacity-20 dark:opacity-[0.35] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.2),transparent)]" />

      <div className="relative z-10 mx-auto max-w-lg px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white/90 px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur-md transition-colors hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white/85 dark:hover:bg-white/[0.1]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Home
          </Link>
          <Link
            to="/status"
            className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-white/40 dark:hover:text-white/70"
          >
            System status →
          </Link>
        </header>

        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-white/70">
            <ScrollText className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white/95">Changelog</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-white/45">
              Notable updates to the Modulon web app and chat prototype. Source of truth is this page until a repo{' '}
              <code className="rounded bg-zinc-200/80 px-1 font-mono text-[11px] dark:bg-white/10">CHANGELOG.md</code>{' '}
              exists.
            </p>
          </div>
        </div>

        <div className="space-y-10">
          {RELEASES.map((release) => (
            <article
              key={release.version}
              className="rounded-2xl border border-zinc-200/90 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-200/70 pb-4 dark:border-white/[0.06]">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white/95">v{release.version}</h2>
                <time
                  className="font-mono text-xs text-zinc-500 dark:text-white/35"
                  dateTime={release.date}
                >
                  {release.date}
                </time>
              </div>
              {release.sections.map((section) => (
                <div key={section.title}>
                  <SectionTitle>{section.title}</SectionTitle>
                  <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-relaxed text-zinc-700 dark:text-white/70">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
