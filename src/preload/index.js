import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  /* ---- Settings ---- */
  getSetting: (key) => ipcRenderer.invoke('store:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('store:set', key, value),

  /* ---- Window controls ---- */
  setOpacity: (value) => ipcRenderer.invoke('window:setOpacity', value),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:setAlwaysOnTop', value),
  openSettings: () => ipcRenderer.invoke('window:openSettings'),
  closeSettings: () => ipcRenderer.invoke('window:closeSettings'),
  minimizeLyrics: () => ipcRenderer.invoke('window:minimizeLyrics'),

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

  /* ---- Cleanup ---- */
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  /* ---- Sync ---- */
  requestState: () => ipcRenderer.invoke('lyrics:request-state')
})
