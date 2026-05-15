import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { useLanguage } from './LanguageContext';

/**
 * Custom language dropdown for the site header.
 * @param {{ className?: string; align?: 'left' | 'right' }} props
 */
export default function LanguagePicker({ className = '', align = 'right' }) {
  const { language, current, languages, setLanguage, translating, translateError } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const panelAlign = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        title={translateError || undefined}
        className={`inline-flex h-10 min-w-[4.25rem] shrink-0 items-center justify-center gap-1.5 rounded-full border border-zinc-300/90 bg-white/85 px-3 text-sm font-medium text-zinc-700 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-zinc-400 hover:bg-white hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/45 dark:border-white/[0.12] dark:bg-[#0c0c0e]/85 dark:text-white/85 dark:hover:border-white/30 dark:hover:bg-white/[0.08] dark:hover:text-white dark:focus-visible:ring-white/25 ${translating ? 'animate-pulse' : ''}`}
      >
        <Languages className="h-4 w-4 shrink-0 opacity-80" aria-hidden strokeWidth={2} />
        <span className="tabular-nums">{translating ? '…' : current.short}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
          strokeWidth={2}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={translating ? 'Translating' : 'Language'}
          className={`no-scrollbar absolute ${panelAlign} top-[calc(100%+0.5rem)] z-[60] max-h-[min(18rem,70vh)] w-48 overflow-y-auto rounded-xl border border-zinc-200/90 bg-white py-1 text-sm shadow-xl dark:border-white/[0.12] dark:bg-[#121214]`}
        >
          {languages.map((lang) => {
            const selected = lang.code === language;
            return (
              <li key={lang.code} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setLanguage(lang.code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'bg-zinc-100 text-zinc-900 dark:bg-white/[0.1] dark:text-white'
                      : 'text-zinc-700 hover:bg-zinc-50 dark:text-white/80 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium leading-tight">{lang.native}</span>
                    <span className="block text-xs text-zinc-500 dark:text-white/40">{lang.label}</span>
                  </span>
                  {selected ? (
                    <Check className="h-4 w-4 shrink-0 text-zinc-700 dark:text-white/90" aria-hidden strokeWidth={2} />
                  ) : (
                    <span className="w-4 shrink-0" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
