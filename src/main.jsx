import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { CookieProvider } from './CookieContext';
import { LanguageProvider } from './LanguageContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <CookieProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </CookieProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);
