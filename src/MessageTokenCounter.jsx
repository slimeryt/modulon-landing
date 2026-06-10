import React from 'react';

export function MessageTokenCounter({ outputTokens = 0 }) {
  const output = outputTokens || 0;
  if (output <= 0) return null;

  return (
    <p className="mt-1 px-1 text-[10px] tabular-nums text-zinc-400 dark:text-white/30">
      {output.toLocaleString()} tokens
    </p>
  );
}
