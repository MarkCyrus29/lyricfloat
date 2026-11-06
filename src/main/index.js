import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell } from 'electron'
import { join } from 'path'
import fs from 'fs'
import Store from 'electron-store'
import { startMediaBridge, stopMediaBridge } from './mediaBridge.js'
import { getLyrics, getAlbumColor } from './lyricsAPI.js'
import { getTextColorForBackground } from './colorUtils.js'
import { cleanTitleInfo } from './titleCleaner.js'

const isDev = !app.isPackaged
// Default settings mirror src/renderer/context/defaults.js
const store = new Store({
  defaults: {
    alwaysOnTop: true,
    hideWhenPaused: false,
    fontSize: 'medium',
    opacity: 0.92,
    bgColor: 'rgba(18,18,18,0.92)',
    bgMode: 'album',
    lyricsBounds: { width: 420, height: 600 }
  }
})

let lyricsWindow = null
let settingsWindow = null
let tray = null

// Cache for frontend sync
let currentSongInfo = null
let currentLyrics = null
let lookupSeq = 0
let lastSentPlayback = null
let lastIsPlaying = null

/* ------------------------------------------------------------------ */
/*  Display / bounds utilities                                        */
/* ------------------------------------------------------------------ */

/**
 * Returns true if the rectangle {x, y, width, height} overlaps at least
 * one of the currently connected displays' work areas by at least 1 pixel.
 */
function boundsOnScreen(bounds) {
  const displays = screen.getAllDisplays()
  return displays.some((d) => {
    const wa = d.workArea
    return (
      bounds.x < wa.x + wa.width &&
      bounds.x + bounds.width > wa.x &&
      bounds.y < wa.y + wa.height &&
      bounds.y + bounds.height > wa.y
    )
  })
}

/**
 * Validates saved window bounds against current displays.
 * If the saved position is off-screen, returns centered coords on the primary
 * display and persists the corrected position to the store so it self-heals.
 *
 * @param {{ width: number, height: number }} size
 * @param {{ x: number, y: number } | null} pos
 * @returns {{ x: number | undefined, y: number | undefined }}
 */
function validateAndGetPosition(size, pos) {
  if (!pos) return { x: undefined, y: undefined }

  const candidate = { x: pos.x, y: pos.y, width: size.width, height: size.height }
  if (boundsOnScreen(candidate)) {
    return { x: pos.x, y: pos.y }
  }

  // Saved position is off-screen — fall back to primary display centre
  console.log('[LyricFloat] Saved window position is off-screen; resetting to primary display.')
  const wa = screen.getPrimaryDisplay().workArea
  const safeX = Math.round(wa.x + (wa.width - size.width) / 2)
  const safeY = Math.round(wa.y + (wa.height - size.height) / 2)
  store.set('lyricsPosition', { x: safeX, y: safeY })
  return { x: safeX, y: safeY }
}

/**
 * If lyricsWindow is currently positioned off all connected displays,
 * move it to the centre of the primary display.
 */
function ensureLyricsWindowOnScreen() {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return
  const b = lyricsWindow.getBounds()
  if (boundsOnScreen(b)) return

  console.log('[LyricFloat] Display removed — repositioning lyrics window to primary display.')
  const wa = screen.getPrimaryDisplay().workArea
  const newX = Math.round(wa.x + (wa.width - b.width) / 2)
  const newY = Math.round(wa.y + (wa.height - b.height) / 2)
  lyricsWindow.setPosition(newX, newY)
  store.set('lyricsPosition', { x: newX, y: newY })
}

/* ------------------------------------------------------------------ */
/*  Window creation                                                   */
/* ------------------------------------------------------------------ */
function createLyricsWindow() {
  const bounds = store.get('lyricsBounds', { width: 420, height: 600 })
  const savedPos = store.get('lyricsPosition', null)
  const safePos = validateAndGetPosition(bounds, savedPos)

  lyricsWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 280,
    x: safePos.x,
    y: safePos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: store.get('alwaysOnTop', true),
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    lyricsWindow.loadURL('http://localhost:5173/lyrics.html')
  } else {
    lyricsWindow.loadFile(join(__dirname, '../renderer/lyrics.html'))
  }

  // Track cursor position to detect hover over the window
  // (drag regions block all DOM mouse events, so we must poll at the OS level)
  let cursorInside = false
  const cursorTracker = setInterval(() => {
    if (!lyricsWindow || lyricsWindow.isDestroyed()) {
      clearInterval(cursorTracker)
      return
    }
    const point = screen.getCursorScreenPoint()
    const bounds = lyricsWindow.getBounds()
    const inside =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height

    if (inside !== cursorInside) {
      cursorInside = inside
      lyricsWindow.webContents.send(
        inside ? 'window:mouse-enter' : 'window:mouse-leave'
      )
    }
  }, 250)

  lyricsWindow.on('close', () => {
    clearInterval(cursorTracker)
    const b = lyricsWindow.getBounds()
    store.set('lyricsBounds', { width: b.width, height: b.height })
    store.set('lyricsPosition', { x: b.x, y: b.y })
  })

  lyricsWindow.on('closed', () => { lyricsWindow = null })

  return lyricsWindow
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 460,
    height: 600,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    settingsWindow.loadURL('http://localhost:5173/settings.html')
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'))
  }

  settingsWindow.on('closed', () => { settingsWindow = null })

  return settingsWindow
}

/* ------------------------------------------------------------------ */
/*  System Tray                                                       */
/* ------------------------------------------------------------------ */
function createTray() {
  let iconPath;
  if (app.isPackaged) {
    iconPath = join(process.resourcesPath, 'icon.png');
  } else {
    iconPath = join(__dirname, '../../build/icon.png');
  }

  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Fallback to simple 16x16 tray icon programmatically
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVQ4T2P8z8BQz0BAwMDAwMDIQCRg' +
      'YGBgYPj//389AwODADEaR8NgNAxGfBgAAOJBD/Hy8bUAAAAASUVORK5CYII='
    )
  }

  tray = new Tray(icon)
  tray.setToolTip('LyricFloat')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Lyrics Window',
      click: () => {
        if (lyricsWindow) {
          lyricsWindow.show()
          lyricsWindow.focus()
        }
      }
    },
    {
      label: 'Settings',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        stopMediaBridge()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (lyricsWindow) {
      lyricsWindow.show()
      lyricsWindow.focus()
    }
  })
}

/* ------------------------------------------------------------------ */
/*  IPC Handlers                                                      */
/* ------------------------------------------------------------------ */
function setupIPC() {
  ipcMain.handle('store:get', (_event, key) => store.get(key))
  ipcMain.handle('store:get-all', () => ({
    alwaysOnTop: store.get('alwaysOnTop'),
    hideWhenPaused: store.get('hideWhenPaused'),
    fontSize: store.get('fontSize'),
    opacity: store.get('opacity'),
    bgColor: store.get('bgColor'),
    bgMode: store.get('bgMode')
  }))
  ipcMain.handle('store:set', (_event, key, value) => {
    store.set(key, value)
    return true
  })

  ipcMain.handle('settings:preview', (_event, key, value) => {
    if (lyricsWindow) lyricsWindow.webContents.send('settings:changed', { key, value })
    if (key === 'alwaysOnTop' && lyricsWindow) lyricsWindow.setAlwaysOnTop(!!value)
    return true
  })

  ipcMain.handle('settings:save', (_event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
      store.set(key, value)
      if (lyricsWindow) lyricsWindow.webContents.send('settings:changed', { key, value })
    }
    if (settings.alwaysOnTop !== undefined && lyricsWindow) {
      lyricsWindow.setAlwaysOnTop(!!settings.alwaysOnTop)
    }
    if (settingsWindow) settingsWindow.close()
    return true
  })

  ipcMain.handle('settings:revert', (_event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
      if (lyricsWindow) lyricsWindow.webContents.send('settings:changed', { key, value })
    }
    if (settings.alwaysOnTop !== undefined && lyricsWindow) {
      lyricsWindow.setAlwaysOnTop(!!settings.alwaysOnTop)
    }
    if (settingsWindow) settingsWindow.close()
    return true
  })

  ipcMain.handle('window:setOpacity', (_event, value) => {
    if (lyricsWindow) lyricsWindow.setOpacity(parseFloat(value))
    return true
  })

  ipcMain.handle('window:setAlwaysOnTop', (_event, value) => {
    if (lyricsWindow) lyricsWindow.setAlwaysOnTop(!!value)
    store.set('alwaysOnTop', !!value)
    return true
  })

  ipcMain.handle('window:openSettings', () => {
    createSettingsWindow()
    return true
  })

  ipcMain.handle('window:closeSettings', () => {
    if (settingsWindow) settingsWindow.close()
    return true
  })

  // Mouse forwarding for transparent window hover detection
  ipcMain.handle('window:setIgnoreMouseEvents', (_event, ignore, options) => {
    if (lyricsWindow) {
      if (ignore) {
        lyricsWindow.setIgnoreMouseEvents(true, { forward: true })
      } else {
        lyricsWindow.setIgnoreMouseEvents(false)
      }
    }
    return true
  })

  ipcMain.handle('window:closeApp', () => {
    stopMediaBridge()
    app.quit()
    return true
  })

  ipcMain.handle('lyrics:request-state', () => {
    if (lyricsWindow) {
      if (currentSongInfo) lyricsWindow.webContents.send('song:changed', currentSongInfo)
      if (currentLyrics) lyricsWindow.webContents.send('lyrics:loaded', currentLyrics)
      if (lastSentPlayback) {
        lyricsWindow.webContents.send('playback:changed', {
          isPlaying: lastSentPlayback.isPlaying,
          positionMs: lastSentPlayback.isPlaying
            ? Math.round(lastSentPlayback.positionMs + (Date.now() - lastSentPlayback.at))
            : lastSentPlayback.positionMs
        })
      }
    }
    return true
  })

  ipcMain.handle('open-external', (_event, url) => {
    shell.openExternal(url)
    return true
  })
}

/* ------------------------------------------------------------------ */
/*  Song detection → lyrics pipeline                                  */
/* ------------------------------------------------------------------ */
function startSongDetection() {
  startMediaBridge(async (info) => {
    if (!lyricsWindow) return

    const now = Date.now()
    let shouldSendPlayback = false

    if (!lastSentPlayback || info.songChanged || info.isPlaying !== lastSentPlayback.isPlaying) {
      shouldSendPlayback = true
    } else {
      const elapsed = now - lastSentPlayback.at
      const expectedPosition = lastSentPlayback.isPlaying
        ? lastSentPlayback.positionMs + elapsed
        : lastSentPlayback.positionMs
      if (Math.abs(info.positionMs - expectedPosition) > 1500 || elapsed >= 10000) {
        shouldSendPlayback = true
      }
    }

    if (shouldSendPlayback) {
      lastSentPlayback = {
        isPlaying: info.isPlaying,
        positionMs: info.positionMs,
        at: now
      }
      lyricsWindow.webContents.send('playback:changed', {
        isPlaying: info.isPlaying,
        positionMs: info.positionMs
      })
    }

    // If user paused and hideWhenPaused is on, toggle window on transition
    if (lastIsPlaying !== info.isPlaying) {
      const hideWhenPaused = store.get('hideWhenPaused', false)
      if (hideWhenPaused) {
        if (!info.isPlaying) lyricsWindow.hide()
        else lyricsWindow.show()
      }
      lastIsPlaying = info.isPlaying
    }

    // Only fetch lyrics when the song actually changes
    if (info.songChanged) {
      const seq = ++lookupSeq
      // Immediately clear old data so renderer shows loading state
      currentLyrics = null
      const songInfo = {
        title: info.title,
        artist: info.artist,
        isPlaying: info.isPlaying,
        albumColor: null,
        textColor: 'white'
      }
      currentSongInfo = songInfo
      lyricsWindow.webContents.send('song:changed', songInfo)

      // Fetch lyrics and album color in parallel
      const bgMode = store.get('bgMode', 'album')
      const { cleanTitle, cleanArtist } = cleanTitleInfo(info.title, info.artist)
      const fetchColor = bgMode === 'album' ? getAlbumColor(cleanTitle, cleanArtist) : Promise.resolve(null)

      Promise.all([
        getLyrics(cleanTitle, cleanArtist),
        fetchColor
      ]).then(([lyrics, color]) => {
        if (seq !== lookupSeq) return
        currentLyrics = lyrics
        songInfo.albumColor = color
        songInfo.textColor = getTextColorForBackground(color)
        currentSongInfo = songInfo
        
        if (lyricsWindow) {
          lyricsWindow.webContents.send('lyrics:loaded', lyrics)
          // Always re-send song info so renderer picks up color (or null)
          lyricsWindow.webContents.send('song:changed', songInfo)
        }
      }).catch((err) => {
        console.error('[LyricFloat] Error fetching lyrics or color:', err)
        if (seq !== lookupSeq) return
        const emptyLyrics = { synced: false, lines: [] }
        currentLyrics = emptyLyrics
        if (lyricsWindow) {
          lyricsWindow.webContents.send('lyrics:loaded', emptyLyrics)
        }
      })
    }
  })
}

/* ------------------------------------------------------------------ */
/*  App lifecycle                                                     */
/* ------------------------------------------------------------------ */
app.whenReady().then(() => {
  setupIPC()
  createLyricsWindow()
  createTray()
  
  if (lyricsWindow) {
    startSongDetection()
  }

  // Live monitor-disconnect handling: reposition the lyrics window if its
  // current display is unplugged while the app is running.
  screen.on('display-removed', () => ensureLyricsWindowOnScreen())
  screen.on('display-metrics-changed', () => ensureLyricsWindowOnScreen())

  app.on('activate', () => {
    if (!lyricsWindow) createLyricsWindow()
  })
})

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
})

app.on('before-quit', () => {
  stopMediaBridge()
})
