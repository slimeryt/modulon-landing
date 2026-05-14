import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';

const AuthContext = createContext(null);

export function mapAuthError(err) {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'That email is already registered.';
    case 'auth/weak-password':
      return 'Password is too weak.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    default:
      return err?.message || 'Something went wrong. Try again.';
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setUser(null);
      setReady(true);
      return undefined;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  const value = useMemo(
    () => ({
      firebaseConfigured: configured,
      ready,
      user,
      async signInWithEmail(email, password) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error('Firebase is not configured.');
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      async signUpWithEmail(name, email, password) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error('Firebase is not configured.');
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name?.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() });
        }
      },
      async signInWithGoogle() {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error('Firebase is not configured.');
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      },
      async signOutUser() {
        const auth = getFirebaseAuth();
        if (!auth) return;
        await signOut(auth);
      },
      async sendPasswordReset(email) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error('Firebase is not configured.');
        await sendPasswordResetEmail(auth, email.trim());
      },
    }),
    [configured, ready, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
