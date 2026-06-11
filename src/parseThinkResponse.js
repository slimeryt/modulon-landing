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
  'Think mode is ON for complex questions only. First write brief private reasoning inside <thinking>...</thinking> tags, ' +
  'then write the user-facing answer after the closing tag.\n' +
  'If the user asks for the current time, date, day, or sends a short greeting, answer in one direct sentence only — no <thinking> tags.';
