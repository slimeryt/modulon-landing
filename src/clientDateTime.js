/** Local clock + IANA timezone for the chat API (not stored in chat history). */
export function getClientDateTimePayload() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return { timeZone, clientTime: new Date().toISOString() };
  } catch {
    return { timeZone: 'UTC', clientTime: new Date().toISOString() };
  }
}
