import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ModulonLanding from './ModulonLanding';
import Admin from './Admin';
import ChatPage from './ChatPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ModulonLanding />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
