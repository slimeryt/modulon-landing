'use strict';
// Preload runs in the renderer with access to a limited Node API surface.
// Keep it minimal — just expose what the renderer actually needs.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
