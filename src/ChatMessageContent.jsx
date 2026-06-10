/** Renders assistant/user chat text with fenced and inline code blocks. */

const FENCE_RE = /```([\w+-]*)\r?\n([\s\S]*?)```/g;

function parseParts(text) {
  const parts = [];
  let last = 0;
  let m;
  const re = new RegExp(FENCE_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
    parts.push({ kind: 'code', lang: m[1], value: m[2].replace(/\n$/, '') });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  if (!parts.length) parts.push({ kind: 'text', value: text });
  return parts;
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
    <div className="overflow-hidden rounded-lg border border-zinc-200/90 bg-zinc-50 dark:border-white/10 dark:bg-black/40">
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
  const onlyText = parts.length === 1 && parts[0].kind === 'text';

  if (onlyText) return <InlineText value={parts[0].value} />;

  return (
    <div className="space-y-2">
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
