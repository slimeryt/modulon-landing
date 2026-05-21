import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence } from 'firebase/auth';

// In Electron the page is served via app:// which is not an http/https origin.
// Firebase's default indexedDB persistence uses a hidden iframe loaded from
// authDomain that communicates back via postMessage — but that iframe rejects
// non-http(s) parent origins, so auth silently breaks.
// browserLocalPersistence uses localStorage directly with no iframe needed.
const isElectron =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');

function readFirebaseConfig() {
  if (typeof window !== 'undefined') {
    const w = window.__MODULON_FIREBASE__;
    if (w && w.apiKey && w.authDomain && w.projectId && w.appId) {
      return {
        apiKey: w.apiKey,
        authDomain: w.authDomain,
        projectId: w.projectId,
        storageBucket: w.storageBucket || '',
        messagingSenderId: w.messagingSenderId || '',
        appId: w.appId,
      };
    }
  }
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

const firebaseConfig = readFirebaseConfig();

export function isFirebaseConfigured() {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

let appInstance  = null;
let authInstance = null;

/** @returns {import('firebase/app').FirebaseApp | null} */
export function getFirebaseApp() {
  if (!isFirebaseConfigured()) return null;
  if (!appInstance) {
    appInstance = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return appInstance;
}

/** @returns {import('firebase/auth').Auth | null} */
export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!authInstance) {
    authInstance = isElectron
      ? initializeAuth(app, { persistence: browserLocalPersistence })
      : getAuth(app);
  }
  return authInstance;
}
