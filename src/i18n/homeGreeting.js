import { CATALOG } from './catalog';

/**
 * @param {import('../AuthContext').AuthContextValue['user']} user
 * @param {(id: string) => string} t
 */
export function translatedHomeGreeting(user, t) {
  const h = new Date().getHours();
  const time =
    h < 12
      ? t('chat.greeting.morning')
      : h < 18
        ? t('chat.greeting.afternoon')
        : t('chat.greeting.evening');
  if (user) {
    const name = user.displayName?.trim() || user.email?.split('@')[0] || 'User';
    return `${time}, ${name}`;
  }
  return t('chat.greeting.default');
}
