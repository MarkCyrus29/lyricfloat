import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  /* ---- Settings ---- */
  getSetting: (key) => ipcRenderer.invoke('store:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('store:set', key, value),
  previewSetting: (key, value) => ipcRenderer.invoke('settings:preview', key, value),
  saveSetting: (settings) => ipcRenderer.invoke('settings:save', settings),
  revertSettings: (settings) => ipcRenderer.invoke('settings:revert', settings),

  /* ---- Window controls ---- */
  setOpacity: (value) => ipcRenderer.invoke('window:setOpacity', value),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:setAlwaysOnTop', value),
  openSettings: () => ipcRenderer.invoke('window:openSettings'),
  closeSettings: () => ipcRenderer.invoke('window:closeSettings'),
  closeApp: () => ipcRenderer.invoke('window:closeApp'),

  /* ---- Event listeners (renderer ← main) ---- */
  onSongChanged: (cb) => {
    const handler = (_event, data) => cb(data)
    ipcRenderer.on('song:changed', handler)
    return () => ipcRenderer.removeListener('song:changed', handler)
  },
  onPlaybackChanged: (cb) => {
    const handler = (_event, data) => cb(data)
    ipcRenderer.on('playback:changed', handler)
    return () => ipcRenderer.removeListener('playback:changed', handler)
  },
  onLyricsLoaded: (cb) => {
    const handler = (_event, data) => cb(data)
    ipcRenderer.on('lyrics:loaded', handler)
    return () => ipcRenderer.removeListener('lyrics:loaded', handler)
  },
  onSettingsChanged: (cb) => {
    const handler = (_event, data) => cb(data)
    ipcRenderer.on('settings:changed', handler)
    return () => ipcRenderer.removeListener('settings:changed', handler)
  },

  /* ---- Cleanup ---- */
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  /* ---- Sync ---- */
  requestState: () => ipcRenderer.invoke('lyrics:request-state')
})
