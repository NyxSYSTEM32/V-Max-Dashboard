const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onF1Data: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('f1-data', handler);
    return () => ipcRenderer.removeListener('f1-data', handler);
  },
  setMode: (mode) => ipcRenderer.send('set-mode', mode),
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  setReplaySession: (sessionKey) => ipcRenderer.send('set-replay-session', sessionKey),
  setReplayControl: (command) => ipcRenderer.send('replay-control', command),
  setFocusedDriver: (driverNumber) => ipcRenderer.send('set-focused-driver', driverNumber),
  setDiscordPresenceEnabled: (enabled) => ipcRenderer.send('set-discord-presence-enabled', enabled)
});
