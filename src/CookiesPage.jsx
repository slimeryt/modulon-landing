import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Cookie } from 'lucide-react';
import { useCookies } from './CookieContext';
import {
  COOKIE_ANALYTICS,
  COOKIE_CONSENT,
  COOKIE_FUNCTIONAL,
  COOKIE_VISITOR,
  getCookie,
} from './cookies';

export default function CookiesPage() {
  const { status, acceptAll, acceptEssentialOnly, pending } = useCookies();

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-[#070708] dark:text-white font-sans">
      <div className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-white/50 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back home
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-200/80 dark:bg-white/[0.08]">
            <Cookie className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cookie policy</h1>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-zinc-700 dark:text-white/60">
          <p>
            Modulon uses cookies and similar storage (including localStorage for some settings) to run the
            site, remember your preferences, and keep you signed in where applicable.
          </p>

          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-white">Essential</h2>
            <p>
              <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">{COOKIE_CONSENT}</code>{' '}
              stores whether you accepted cookies (1 year).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-white">Functional (optional)</h2>
            <p className="mb-2">Enabled when you choose &ldquo;Accept all&rdquo;:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code className="font-mono text-xs">{COOKIE_FUNCTIONAL}</code> — allows optional feature cookies
              </li>
              <li>
                <code className="font-mono text-xs">{COOKIE_VISITOR}</code> — anonymous visitor ID for the site
              </li>
              <li>Theme and chat usage may use localStorage on your device</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-white">Analytics</h2>
            <p>
              <code className="font-mono text-xs">{COOKIE_ANALYTICS}</code> is reserved for future analytics. It
              is not set today.
            </p>
          </section>

          {status !== 'pending' ? (
            <section className="rounded-xl border border-zinc-200/90 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
                Your choice
              </p>
              <p className="mt-1 font-medium text-zinc-900 dark:text-white">
                {status === 'accepted' ? 'Accept all' : 'Essential only'}
              </p>
              {getCookie(COOKIE_VISITOR) ? (
                <p className="mt-2 font-mono text-xs text-zinc-500 dark:text-white/40">
                  Visitor ID: {getCookie(COOKIE_VISITOR)}
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={acceptAll}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
              {pending ? 'Accept all' : 'Update — accept all'}
            </button>
            <button
              type="button"
              onClick={acceptEssentialOnly}
              className="rounded-full border border-zinc-300/90 px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-white/20 dark:text-white/85 dark:hover:bg-white/[0.08]"
            >
              {pending ? 'Essential only' : 'Update — essential only'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
