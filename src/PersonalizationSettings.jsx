import React from 'react';
import {
  estimatePersonalizationInputTokens,
  PERSONALIZATION_MAX_CHARS,
  writePersonalization,
} from './modulonPersonalization';

export default function PersonalizationSettings({ value, onChange }) {
  const extraTokens = estimatePersonalizationInputTokens(value);
  const charsLeft = PERSONALIZATION_MAX_CHARS - value.length;

  return (
    <div className="max-w-lg space-y-3">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
          Personalization
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-white/45">
          Optional instructions for Official Modulon models only. Empty keeps the default.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(writePersonalization(e.target.value))}
        maxLength={PERSONALIZATION_MAX_CHARS}
        rows={5}
        placeholder="e.g. Keep answers concise. Use bullet points when listing steps. Call me Alex."
        className="w-full resize-none rounded-2xl border border-zinc-200/90 bg-white/90 px-4 py-3 text-sm leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/25 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/85 dark:placeholder:text-white/30 dark:focus:border-white/20 dark:focus:ring-white/15"
        aria-label="Modulon personalization"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-white/35">
        <span className="font-mono tabular-nums">{charsLeft} characters left</span>
        {extraTokens > 0 ? (
          <span className="font-mono tabular-nums">~{extraTokens} extra input tokens per Modulon message</span>
        ) : (
          <span>No extra token usage</span>
        )}
      </div>
    </div>
  );
}
