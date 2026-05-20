'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  minimize:    ()      => ipcRenderer.send('win:minimize'),
  close:       ()      => ipcRenderer.send('win:close'),
  getDefaults: ()      => ipcRenderer.invoke('get-defaults'),
  browseDir:   ()      => ipcRenderer.invoke('browse-dir'),
  install:     (opts)  => ipcRenderer.invoke('start-install', opts),
  launch:      (dir)   => ipcRenderer.send('launch-app', dir),
  onProgress:  (cb)    => ipcRenderer.on('progress', (_, d) => cb(d)),
});
