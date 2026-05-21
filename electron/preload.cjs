'use strict';
// Preload runs in the renderer with access to a limited Node API surface.
// Keep it minimal — just expose what the renderer actually needs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** The current OS platform (e.g. 'win32', 'darwin'). */
  platform: process.platform,

  /**
   * Opens /desktop/login in the user's default browser so they can
   * authenticate with Google. The browser page will redirect back to
   * modulon://auth?googleIdToken=... when sign-in succeeds.
   */
  openGoogleLogin: () => ipcRenderer.invoke('open-google-login'),

  /**
   * Register a callback that fires when the main process receives a
   * modulon://auth deep-link from the browser. The callback receives
   * { googleIdToken: string }.
   *
   * @param {(data: { googleIdToken: string }) => void} cb
   */
  onGoogleAuthCallback: (cb) => {
    ipcRenderer.on('google-auth-callback', (_event, data) => cb(data));
  },
});
