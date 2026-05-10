const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Session lifecycle
  startSession: (data) => ipcRenderer.invoke('session:start', data),
  endSession:   ()     => ipcRenderer.invoke('session:end'),

  // Phone events (logged from UI buttons)
  phoneCheckStart: ()   => ipcRenderer.invoke('phone:start'),
  phoneCheckEnd:   ()   => ipcRenderer.invoke('phone:end'),

  // Live updates streamed from main process
  onSessionUpdate: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('session:update', listener);
    return () => ipcRenderer.removeListener('session:update', listener);
  },

  // Persistent storage
  getSessions:    ()         => ipcRenderer.invoke('sessions:get'),
  saveSession:    (session)  => ipcRenderer.invoke('sessions:save', session),

  // Permissions
  checkAccessibility: () => ipcRenderer.invoke('permissions:accessibility'),

  // AI / config
  onAiAnalysis: (cb) => {
    const l = (_, d) => cb(d);
    ipcRenderer.on('ai:analysis', l);
    return () => ipcRenderer.removeListener('ai:analysis', l);
  },
  onAiError: (cb) => {
    const l = (_, d) => cb(d);
    ipcRenderer.on('ai:error', l);
    return () => ipcRenderer.removeListener('ai:error', l);
  },
  getConfig:        ()     => ipcRenderer.invoke('config:get'),
  setConfig:        (data) => ipcRenderer.invoke('config:set', data),
  checkScreen:      ()     => ipcRenderer.invoke('permissions:screen'),
  writeToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  openExternal:     (url)  => ipcRenderer.invoke('shell:open', url),

  // Alert (widget-integrated)
  onAlertMobile: (cb) => {
    const l = (_, d) => cb(d);
    ipcRenderer.on('alert:mobile', l);
    return () => ipcRenderer.removeListener('alert:mobile', l);
  },
  onAlertData: (cb) => {
    const l = (_, d) => cb(d);
    ipcRenderer.on('alert:data', l);
    return () => ipcRenderer.removeListener('alert:data', l);
  },
  onAlertClear: (cb) => {
    const l = () => cb();
    ipcRenderer.on('alert:clear', l);
    return () => ipcRenderer.removeListener('alert:clear', l);
  },
});
