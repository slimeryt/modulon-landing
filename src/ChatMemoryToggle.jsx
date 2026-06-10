import React from 'react';
import { Brain, Check } from 'lucide-react';

export default function ChatMemoryToggle({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={enabled}
      aria-label="Remember earlier messages in this chat"
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`flex w-fit items-center gap-2 rounded-full border border-zinc-200/80 bg-white/80 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/50 dark:hover:bg-white/[0.06] dark:focus-visible:ring-white/25 ${
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
      }`}
    >
      <Brain className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden />
      <span>Remember this chat</span>
      <span
        aria-hidden
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
          enabled
            ? 'border-zinc-900 bg-zinc-900 dark:border-white/90 dark:bg-white'
            : 'border-zinc-300/70 bg-white dark:border-white/15 dark:bg-white/[0.06]'
        }`}
      >
        {enabled ? <Check className="h-2.5 w-2.5 text-white dark:text-black" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
