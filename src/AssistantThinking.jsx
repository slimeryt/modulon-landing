import React from 'react';
import ChatMessageContent from './ChatMessageContent';

export default function AssistantThinking({ thinking }) {
  if (!thinking?.trim()) return null;

  return (
    <details className="mb-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2 text-xs text-zinc-600 open:pb-2.5 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55">
      <summary className="cursor-pointer select-none font-medium text-zinc-500 dark:text-white/40">
        Thought process
      </summary>
      <div className="mt-2 leading-relaxed text-zinc-600 dark:text-white/55">
        <ChatMessageContent text={thinking} />
      </div>
    </details>
  );
}
