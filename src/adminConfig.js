/** Only this Firebase account may access /admin (client gate; pair with server checks for sensitive APIs). */
export const ADMIN_EMAIL = 'slimer0935@gmail.com';

export function isAdminEmail(email) {
  return Boolean(email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}
