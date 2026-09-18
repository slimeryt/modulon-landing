import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LifeBuoy, Mail, Monitor, Smartphone } from 'lucide-react';

const SUPPORT_EMAIL = 'support@modulon.xyz';

export default function SupportPage() {
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
            <LifeBuoy className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Support</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-white/45">
              Help with Modulon Desktop, Phone, and the web app.
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-zinc-700 dark:text-white/60">
          <section className="rounded-2xl border border-zinc-200/90 bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-3 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Mail className="h-4 w-4" aria-hidden />
              <h2 className="text-base font-semibold">Email us</h2>
            </div>
            <p className="mb-3">
              Reach the Modulon team at{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-white dark:decoration-white/30 dark:hover:decoration-white/60"
              >
                {SUPPORT_EMAIL}
              </a>
              . We read every message — include your app version, OS, and what went wrong if you can.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Modulon%20support`}
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
              Write to support
            </a>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-white">Common topics</h2>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-white/40" aria-hidden />
                <span>
                  <span className="font-medium text-zinc-900 dark:text-white">Desktop</span> — installers, sign-in,
                  maintenance screens, and Code agent issues.
                </span>
              </li>
              <li className="flex gap-3">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-white/40" aria-hidden />
                <span>
                  <span className="font-medium text-zinc-900 dark:text-white">Phone</span> — Android install and account
                  handoff from the browser.
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-white">Status</h2>
            <p>
              Check live service health on the{' '}
              <Link
                to="/status"
                className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-white dark:decoration-white/30 dark:hover:decoration-white/60"
              >
                status page
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
