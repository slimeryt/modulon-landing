import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

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

let appInstance = null;

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
  return getAuth(app);
}
