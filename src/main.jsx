import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { DisplayPreferencesProvider } from './DisplayPreferencesContext';
import { CookieProvider } from './CookieContext';
import { LanguageProvider } from './LanguageContext';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW registration failure is non-fatal */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <DisplayPreferencesProvider>
        <LanguageProvider>
          <CookieProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </CookieProvider>
        </LanguageProvider>
      </DisplayPreferencesProvider>
    </ThemeProvider>
  </React.StrictMode>
);
