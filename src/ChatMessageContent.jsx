/** Renders chat text with fenced and inline code blocks. */

function normalizeMarkdown(text) {
  return String(text).replace(/\uFF40/g, '`');
}

function parseParts(text) {
  const normalized = normalizeMarkdown(text);
  const chunks = normalized.split('```');
  if (chunks.length < 3) {
    return [{ kind: 'text', value: normalized }];
  }

  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i % 2 === 0) {
      if (chunks[i]) parts.push({ kind: 'text', value: chunks[i] });
      continue;
    }

    const block = chunks[i].replace(/^\r?\n/, '');
    const nl = block.indexOf('\n');
    let lang = '';
    let code = block;

    if (nl !== -1) {
      const firstLine = block.slice(0, nl).trim();
      if (/^[\w+#.-]+$/.test(firstLine)) {
        lang = firstLine;
        code = block.slice(nl + 1);
      }
    }

    parts.push({ kind: 'code', lang, value: code.replace(/\s+$/, '') });
  }

  return parts.length ? parts : [{ kind: 'text', value: normalized }];
}

function InlineText({ value }) {
  if (!value) return null;
  const bits = value.split(/(`[^`\n]+`)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {bits.map((bit, i) => {
        if (bit.startsWith('`') && bit.endsWith('`')) {
          return (
            <code
              key={i}
              className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10"
            >
              {bit.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{bit}</span>;
      })}
    </p>
  );
}

function CodeBlock({ lang, code }) {
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-zinc-200/90 bg-zinc-50 dark:border-white/10 dark:bg-black/40">
      {lang ? (
        <div className="border-b border-zinc-200/80 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-white/40">
          {lang}
        </div>
      ) : null}
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono text-zinc-800 dark:text-white/90">{code}</code>
      </pre>
    </div>
  );
}

export default function ChatMessageContent({ text }) {
  if (!text) return null;
  const parts = parseParts(text);
  const hasCode = parts.some((p) => p.kind === 'code');

  if (!hasCode) return <InlineText value={text} />;

  return (
    <div className="space-y-1">
      {parts.map((part, i) => {
        if (part.kind === 'code') {
          return <CodeBlock key={i} lang={part.lang} code={part.value} />;
        }
        if (!part.value.trim()) return null;
        return <InlineText key={i} value={part.value} />;
      })}
    </div>
  );
}
