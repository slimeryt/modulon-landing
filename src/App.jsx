import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ModulonLanding from './ModulonLanding';
import ChatPage from './ChatPage';
import DesktopChatPage from './DesktopChatPage';
import DesktopLoginPage from './DesktopLoginPage';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';
import StatusPage from './StatusPage';
import ChangelogPage from './ChangelogPage';
import DownloadsPage from './DownloadsPage';
import CookiesPage from './CookiesPage';
import CookieConsent from './CookieConsent';
import { useAuth } from './AuthContext';

function RequireAuth({ children }) {
  const { firebaseConfigured, ready, user } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-[#070708] dark:text-white flex items-center justify-center text-sm text-zinc-500 dark:text-white/50">
        Loading…
      </div>
    );
  }

  if (firebaseConfigured && !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ModulonLanding />} />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/desktop"
          element={
            <RequireAuth>
              <DesktopChatPage />
            </RequireAuth>
          }
        />
        <Route path="/desktop/login" element={<DesktopLoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CookieConsent />
    </BrowserRouter>
  );
}
