import { startSMTCBridge, stopSMTCBridge } from './powerShellBridge.js'
import { startMediaBridge as startMacBridge, stopMediaBridge as stopMacBridge } from './macMediaBridge.js'

let lastSongKey = ''
let warnedUnsupported = false

export function startMediaBridge(callback) {
  lastSongKey = ''

  const wrappedCallback = (info) => {
    if (!info) return
    const key = `${info.title}|${info.artist}`
    const songChanged = key !== lastSongKey
    if (songChanged) {
      lastSongKey = key
    }
    callback({
      ...info,
      songChanged
    })
  }

  if (process.platform === 'win32') {
    startSMTCBridge(wrappedCallback)
  } else if (process.platform === 'darwin') {
    startMacBridge(wrappedCallback)
  } else {
    if (!warnedUnsupported) {
      console.warn('[LyricFloat] Unsupported platform for media detection')
      warnedUnsupported = true
    }
  }
}

export function stopMediaBridge() {
  lastSongKey = ''
  if (process.platform === 'win32') {
    stopSMTCBridge()
  } else if (process.platform === 'darwin') {
    stopMacBridge()
  }
}
