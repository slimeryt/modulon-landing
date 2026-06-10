/** Max characters shown for a chat title in the sidebar. */
export const CHAT_SIDEBAR_TITLE_MAX = 20;

/**
 * @param {string | null | undefined} title
 * @param {number} [max]
 */
export function formatSidebarChatTitle(title, max = CHAT_SIDEBAR_TITLE_MAX) {
  const t = String(title ?? '').trim();
  if (!t) return 'New chat';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * @param {string | null | undefined} title
 * @param {number} [max]
 */
export function isSidebarTitleTruncated(title, max = CHAT_SIDEBAR_TITLE_MAX) {
  return String(title ?? '').trim().length > max;
}
