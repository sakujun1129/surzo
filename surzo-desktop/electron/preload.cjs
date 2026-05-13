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
  generateQR:       (url)  => ipcRenderer.invoke('qr:generate', url),
  detectContext:    ()     => ipcRenderer.invoke('context:detect'),
  setWidgetMouse:   (ignore) => ipcRenderer.send('widget:mouse', ignore),
  widgetTap:        () => ipcRenderer.send('widget:tap'),
  widgetDragStart:  () => ipcRenderer.send('widget:drag-start'),
  widgetDragEnd:    () => ipcRenderer.send('widget:drag-end'),
  onNowPlaying:     (cb) => {
    const l = (_, np) => cb(np);
    ipcRenderer.on('nowPlaying:update', l);
    return () => ipcRenderer.removeListener('nowPlaying:update', l);
  },
  mediaCommand:     (app, cmd) => ipcRenderer.invoke('nowplaying:command', app, cmd),
  openMediaApp:     (app)      => ipcRenderer.invoke('nowplaying:open', app),

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

  // Theme sync (main window → widget)
  setTheme: (theme) => ipcRenderer.send('theme:set', theme),
  onThemeChange: (cb) => {
    const l = (_, t) => cb(t);
    ipcRenderer.on('theme:change', l);
    return () => ipcRenderer.removeListener('theme:change', l);
  },

  // Auto-update
  onUpdateAvailable: (cb) => {
    const l = (_, info) => cb(info);
    ipcRenderer.on('update:available', l);
    return () => ipcRenderer.removeListener('update:available', l);
  },
  onUpdateProgress: (cb) => {
    const l = (_, info) => cb(info);
    ipcRenderer.on('update:progress', l);
    return () => ipcRenderer.removeListener('update:progress', l);
  },
  onUpdateDownloaded: (cb) => {
    const l = (_, info) => cb(info);
    ipcRenderer.on('update:downloaded', l);
    return () => ipcRenderer.removeListener('update:downloaded', l);
  },
  applyUpdate:   () => ipcRenderer.invoke('update:apply'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
});
