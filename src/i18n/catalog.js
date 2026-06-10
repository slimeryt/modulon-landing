/** English UI strings — keys are stable IDs; values are sent to the translation API. */
export const CATALOG = {
  // Nav
  'nav.chat': 'Chat',
  'nav.signOut': 'Sign out',
  'nav.logIn': 'Log in',
  'nav.chatAccount': 'Chat and account',

  // Hero
  'hero.phrase1': 'Hello World',
  'hero.phrase2': 'Welcome.',
  'hero.phrase3': 'From: Marlon, Robyn, Audric, Rafael',
  'hero.description':
    'An AI chatbot trained entirely from scratch on real human conversation — no pretrained weights, no black-box APIs. Just raw dialogue, a neural network, and time.',
  'hero.startChatting': 'Start Chatting',
  'hero.getStarted': 'Get started',
  'hero.viewSource': 'View Source',
  'hero.scroll': 'scroll',
  'hero.scrollToNorthstar': 'Scroll to Project Northstar',

  // Northstar
  'northstar.badge': 'In Development',
  'northstar.title': 'Project Northstar',
  'northstar.description':
    'The next generation of Modulon. A full transformer architecture, persistent memory, and multilingual reasoning — trained entirely from scratch.',
  'northstar.pillar1.title': 'Transformer Core',
  'northstar.pillar1.desc':
    'A full attention-based architecture built from the ground up — no shortcuts.',
  'northstar.pillar2.title': 'Long-Term Memory',
  'northstar.pillar2.desc':
    'Persistent context across sessions so conversations actually build on each other.',
  'northstar.pillar3.title': 'Multilingual',
  'northstar.pillar3.desc':
    'Trained on dialogue from multiple languages, starting with English and German.',

  // Footer
  'footer.copyright': '© {year} Modulon · Trained on Cornell Movie Dialogs · MIT License',
  'footer.chat': 'Chat (prototype)',
  'footer.status': 'Status',
  'footer.changelog': 'Changelog',
  'footer.cookies': 'Cookies',

  // Cookies
  'cookies.title': 'Cookies on Modulon',
  'cookies.description':
    'We use essential cookies to remember your choice, and optional cookies for features like preferences and a visitor ID. See our',
  'cookies.policy': 'cookie policy',
  'cookies.essentialOnly': 'Essential only',
  'cookies.acceptAll': 'Accept all',

  // Chat home
  'chat.greeting.morning': 'Good morning',
  'chat.greeting.afternoon': 'Good afternoon',
  'chat.greeting.evening': 'Good evening',
  'chat.greeting.default': 'What can I help you with?',
  'chat.homeHint': 'Type a message below to start a new conversation.',
  'chat.thinking': 'Modulon is thinking…',
  'chat.thinkingDeep': 'Modulon is thinking deeply…',
  'chat.messagePlaceholder': 'Message Modulon…',
  'chat.typeMessage': 'Type a message…',
  'chat.loadingMessages': 'Loading messages…',

  // Auth (common)
  'auth.welcomeBack': 'Welcome back.',
  'auth.signInSubtitle': 'Sign in to continue to Modulon.',
  'auth.createAccount': 'Create an account.',
  'auth.signUpSubtitle': 'Start chatting with Modulon in seconds.',

  // Language picker
  'lang.aria': 'Language',
  'lang.translating': 'Translating…',
};

export const CATALOG_IDS = Object.keys(CATALOG);
