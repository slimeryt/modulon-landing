import React from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { useCookies } from './CookieContext';
import { useLanguage } from './LanguageContext';

export default function CookieConsent() {
  const { pending, acceptAll, acceptEssentialOnly } = useCookies();
  const { t } = useLanguage();

  if (!pending) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed inset-x-0 bottom-0 z-[200] px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2 sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-zinc-200/90 bg-white/95 p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:flex-row sm:items-center sm:gap-6 sm:p-5 dark:border-white/[0.12] dark:bg-[#121214]/95 dark:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)]">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-white/80">
            <Cookie className="h-5 w-5" aria-hidden strokeWidth={2} />
          </span>
          <div className="min-w-0 text-sm leading-relaxed text-zinc-700 dark:text-white/75">
            <p id="cookie-consent-title" className="font-semibold text-zinc-900 dark:text-white">
              {t('cookies.title')}
            </p>
            <p id="cookie-consent-desc" className="mt-1 text-zinc-600 dark:text-white/50">
              {t('cookies.description')}{' '}
              <Link
                to="/cookies"
                className="font-medium text-zinc-900 underline decoration-zinc-400/80 underline-offset-2 hover:text-zinc-700 dark:text-white dark:decoration-white/30 dark:hover:text-white/90"
              >
                {t('cookies.policy')}
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={acceptEssentialOnly}
            className="rounded-full border border-zinc-300/90 bg-transparent px-4 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/45 dark:border-white/20 dark:text-white/85 dark:hover:bg-white/[0.08] dark:focus-visible:ring-white/25"
          >
            {t('cookies.essentialOnly')}
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:bg-white dark:text-black dark:hover:bg-white/90 dark:focus-visible:ring-white/30"
          >
            {t('cookies.acceptAll')}
          </button>
        </div>
      </div>
    </div>
  );
}
