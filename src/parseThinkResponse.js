/** Split model output into optional <thinking> block and user-facing reply. */
export function parseThinkResponse(text) {
  const raw = String(text || '');
  const match = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (!match) {
    return { thinking: '', reply: raw.trim() };
  }
  const thinking = match[1].trim();
  const reply = raw.replace(/<thinking>[\s\S]*?<\/thinking>/i, '').trim();
  return { thinking, reply: reply || thinking };
}

export const THINK_MODE_SYSTEM_HINT =
  'Think mode is ON. First write brief private reasoning inside <thinking>...</thinking> tags. ' +
  'Then write the user-facing answer after the closing tag only — no preamble or repeat of the reasoning.';
