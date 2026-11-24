import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell, powerMonitor } from 'electron'
import { join } from 'path'
import fs from 'fs'
import Store from 'electron-store'
import { startMediaBridge, stopMediaBridge } from './mediaBridge.js'
import { getAlbumColor } from './lyricsAPI.js'
import { getLyricsForSong } from './lyrics/index.js'
import { enrichLyricsWithTranslation } from './lyrics/translator.js'
import { flushCache } from './lyrics/cache.js'
import { getTextColorForBackground } from './colorUtils.js'
import { buildLookupCandidates } from './titleCleaner.js'
import { classifySource } from './sourceProfiles.js'

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
    bouncyLyrics: true,
    preferredLanguage: 'en',
    showTranslation: true,
    lyricsBounds: { width: 420, height: 600 }
  }
})

// In-memory settings cache to avoid synchronous fs.readFileSync + JSON.parse on every playback tick
const settingsCache = {
  alwaysOnTop: store.get('alwaysOnTop', true),
  hideWhenPaused: store.get('hideWhenPaused', false),
  fontSize: store.get('fontSize', 'medium'),
  opacity: store.get('opacity', 0.92),
  bgColor: store.get('bgColor', 'rgba(18,18,18,0.92)'),
  bgMode: store.get('bgMode', 'album'),
  bouncyLyrics: store.get('bouncyLyrics', true),
  preferredLanguage: store.get('preferredLanguage', 'en'),
  showTranslation: store.get('showTranslation', true)
}

let lyricsWindow = null
let settingsWindow = null
let tray = null

// Cache for frontend sync
let currentSongInfo = null
let currentLyrics = null
let lookupSeq = 0
let lastSentPlayback = null
let lastIsPlaying = null
let songAbortController = null

/* ------------------------------------------------------------------ */
/*  Display / bounds utilities                                        */
/* ------------------------------------------------------------------ */

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

function validateAndGetPosition(size, pos) {
  if (!pos) return { x: undefined, y: undefined }

  const candidate = { x: pos.x, y: pos.y, width: size.width, height: size.height }
  if (boundsOnScreen(candidate)) {
    return { x: pos.x, y: pos.y }
  }

  console.log('[LyricFloat] Saved window position is off-screen; resetting to primary display.')
  const wa = screen.getPrimaryDisplay().workArea
  const safeX = Math.round(wa.x + (wa.width - size.width) / 2)
  const safeY = Math.round(wa.y + (wa.height - size.height) / 2)
  store.set('lyricsPosition', { x: safeX, y: safeY })
  return { x: safeX, y: safeY }
}

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
    alwaysOnTop: settingsCache.alwaysOnTop,
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
  let cursorTracker = null
  let lastHitTestRefreshAt = Date.now()

  // Refreshes Electron's native WM_NCHITTEST draggable region mask after long idle/DWM sleep
  // without changing the visible window size, fixing the bug where buttons stop responding
  // until the window is manually resized.
  const refreshWindowHitTest = () => {
    if (!lyricsWindow || lyricsWindow.isDestroyed() || !lyricsWindow.isVisible() || lyricsWindow.isMinimized()) {
      return
    }
    const now = Date.now()
    // Only need to kick native hit-test regions if idle for > 30s
    if (now - lastHitTestRefreshAt < 30000) return
    lastHitTestRefreshAt = now
    try {
      const b = lyricsWindow.getBounds()
      lyricsWindow.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height })
      lyricsWindow.setBounds(b)
    } catch {}
  }

  const checkCursor = (forceSend = false) => {
    if (!lyricsWindow || lyricsWindow.isDestroyed()) return
    if (!lyricsWindow.isVisible() || lyricsWindow.isMinimized()) return
    const point = screen.getCursorScreenPoint()
    const wb = lyricsWindow.getBounds()
    const inside =
      point.x >= wb.x &&
      point.x <= wb.x + wb.width &&
      point.y >= wb.y &&
      point.y <= wb.y + wb.height

    if (inside !== cursorInside || forceSend) {
      if (inside && !cursorInside) {
        refreshWindowHitTest()
      } else if (!inside) {
        lastHitTestRefreshAt = lastHitTestRefreshAt // keep timestamp so next enter after idle refreshes
      }
      cursorInside = inside
      lyricsWindow.webContents.send(
        inside ? 'window:mouse-enter' : 'window:mouse-leave'
      )
    }
  }

  const startCursorTracker = () => {
    if (cursorTracker || !lyricsWindow || lyricsWindow.isDestroyed()) return
    checkCursor(true)
    cursorTracker = setInterval(() => {
      if (!lyricsWindow || lyricsWindow.isDestroyed()) {
        stopCursorTracker()
        return
      }
      checkCursor(false)
    }, 200)
  }

  const stopCursorTracker = () => {
    if (cursorTracker) {
      clearInterval(cursorTracker)
      cursorTracker = null
    }
    if (cursorInside && lyricsWindow && !lyricsWindow.isDestroyed()) {
      cursorInside = false
      lyricsWindow.webContents.send('window:mouse-leave')
    }
  }

  startCursorTracker()

  lyricsWindow.on('hide', stopCursorTracker)
  lyricsWindow.on('minimize', stopCursorTracker)
  lyricsWindow.on('show', () => {
    lastHitTestRefreshAt = 0
    refreshWindowHitTest()
    startCursorTracker()
  })
  lyricsWindow.on('restore', () => {
    lastHitTestRefreshAt = 0
    refreshWindowHitTest()
    startCursorTracker()
  })
  lyricsWindow.on('focus', () => {
    refreshWindowHitTest()
    checkCursor(true)
  })

  lyricsWindow.on('close', () => {
    stopCursorTracker()
    const b = lyricsWindow.getBounds()
    store.set({
      lyricsBounds: { width: b.width, height: b.height },
      lyricsPosition: { x: b.x, y: b.y }
    })
  })

  lyricsWindow.on('closed', () => {
    stopCursorTracker()
    lyricsWindow = null
  })

  return lyricsWindow
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
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
  let iconPath
  if (app.isPackaged) {
    iconPath = join(process.resourcesPath, 'icon.png')
  } else {
    iconPath = join(__dirname, '../../build/icon.png')
  }

  let icon
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
    const size = icon.getSize()
    if (size.width > 32 || size.height > 32) {
      icon = icon.resize({ width: 32, height: 32, quality: 'good' })
    }
  } else {
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
        if (lyricsWindow && !lyricsWindow.isDestroyed()) {
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
    if (lyricsWindow && !lyricsWindow.isDestroyed()) {
      lyricsWindow.show()
      lyricsWindow.focus()
    }
  })
}

const ALLOWED_SETTINGS_KEYS = new Set([
  'alwaysOnTop',
  'hideWhenPaused',
  'fontSize',
  'opacity',
  'bgColor',
  'bgMode',
  'bouncyLyrics',
  'preferredLanguage',
  'showTranslation'
])

let rawCurrentLyrics = null

async function retranslateCurrentLyrics(lang) {
  if (!rawCurrentLyrics || !rawCurrentLyrics.lines || rawCurrentLyrics.lines.length === 0) return
  const seq = lookupSeq
  const signal = songAbortController?.signal
  const enriched = await enrichLyricsWithTranslation(rawCurrentLyrics, lang, { signal })
  if (seq !== lookupSeq) return
  currentLyrics = enriched
  sendToLyrics('lyrics:loaded', enriched)
}

function sendToLyrics(channel, payload) {
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.webContents.send(channel, payload)
  }
}

/* ------------------------------------------------------------------ */
/*  IPC Handlers                                                      */
/* ------------------------------------------------------------------ */
function setupIPC() {
  ipcMain.handle('store:get', (_event, key) => {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) return undefined
    return settingsCache[key]
  })
  ipcMain.handle('store:get-all', () => ({ ...settingsCache }))
  ipcMain.handle('store:set', (_event, key, value) => {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) return false
    settingsCache[key] = value
    store.set(key, value)
    return true
  })

  ipcMain.handle('settings:preview', (_event, key, value) => {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) return false
    sendToLyrics('settings:changed', { key, value })
    if (key === 'alwaysOnTop' && lyricsWindow && !lyricsWindow.isDestroyed()) {
      lyricsWindow.setAlwaysOnTop(!!value)
    }
    if (key === 'preferredLanguage' && typeof value === 'string') {
      retranslateCurrentLyrics(value)
    }
    return true
  })

  ipcMain.handle('settings:save', (_event, settings) => {
    if (!settings || typeof settings !== 'object') return false
    const prevLang = settingsCache.preferredLanguage
    const updates = {}
    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) continue
      settingsCache[key] = value
      updates[key] = value
      sendToLyrics('settings:changed', { key, value })
    }
    if (Object.keys(updates).length > 0) {
      store.set(updates)
    }
    if (settings.alwaysOnTop !== undefined && lyricsWindow && !lyricsWindow.isDestroyed()) {
      lyricsWindow.setAlwaysOnTop(!!settings.alwaysOnTop)
    }
    if (settings.preferredLanguage && settings.preferredLanguage !== prevLang) {
      retranslateCurrentLyrics(settings.preferredLanguage)
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close()
    return true
  })

  ipcMain.handle('settings:revert', (_event, settings) => {
    if (settings && typeof settings === 'object') {
      for (const [key, value] of Object.entries(settings)) {
        if (!ALLOWED_SETTINGS_KEYS.has(key)) continue
        sendToLyrics('settings:changed', { key, value })
      }
      if (settings.alwaysOnTop !== undefined && lyricsWindow && !lyricsWindow.isDestroyed()) {
        lyricsWindow.setAlwaysOnTop(!!settings.alwaysOnTop)
      }
      if (settings.preferredLanguage) {
        retranslateCurrentLyrics(settings.preferredLanguage)
      }
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close()
    return true
  })

  ipcMain.handle('window:setOpacity', (_event, value) => {
    if (lyricsWindow && !lyricsWindow.isDestroyed()) lyricsWindow.setOpacity(parseFloat(value))
    return true
  })

  ipcMain.handle('window:setAlwaysOnTop', (_event, value) => {
    const flag = !!value
    if (lyricsWindow && !lyricsWindow.isDestroyed()) lyricsWindow.setAlwaysOnTop(flag)
    settingsCache.alwaysOnTop = flag
    store.set('alwaysOnTop', flag)
    return true
  })

  ipcMain.handle('window:openSettings', () => {
    createSettingsWindow()
    return true
  })

  ipcMain.handle('window:closeSettings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close()
    return true
  })

  ipcMain.handle('window:closeApp', () => {
    stopMediaBridge()
    app.quit()
    return true
  })

  // Full-window smooth drag handler so the entire window can be dragged while still allowing mouse-wheel scrolling
  let dragInterval = null
  const stopDragLoop = () => {
    if (dragInterval) {
      clearInterval(dragInterval)
      dragInterval = null
    }
  }

  ipcMain.on('window:startDrag', () => {
    stopDragLoop()
    if (!lyricsWindow || lyricsWindow.isDestroyed()) return
    const startCursor = screen.getCursorScreenPoint()
    const startBounds = lyricsWindow.getBounds()
    let lastX = startCursor.x
    let lastY = startCursor.y

    dragInterval = setInterval(() => {
      if (!lyricsWindow || lyricsWindow.isDestroyed()) {
        stopDragLoop()
        return
      }
      const pt = screen.getCursorScreenPoint()
      if (pt.x !== lastX || pt.y !== lastY) {
        lastX = pt.x
        lastY = pt.y
        lyricsWindow.setBounds({
          x: startBounds.x + (pt.x - startCursor.x),
          y: startBounds.y + (pt.y - startCursor.y),
          width: startBounds.width,
          height: startBounds.height
        })
      }
    }, 8)
  })

  ipcMain.on('window:stopDrag', () => {
    stopDragLoop()
  })

  ipcMain.handle('lyrics:request-state', () => {
    if (lyricsWindow && !lyricsWindow.isDestroyed()) {
      if (currentSongInfo) lyricsWindow.webContents.send('song:changed', currentSongInfo)
      if (currentLyrics) {
        lyricsWindow.webContents.send('lyrics:loaded', currentLyrics)
        if (
          currentLyrics.needsTranslation === undefined &&
          currentLyrics.lines?.length > 0 &&
          !currentLyrics.instrumental
        ) {
          retranslateCurrentLyrics(settingsCache.preferredLanguage || 'en')
        }
      }
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
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:') {
        shell.openExternal(url)
        return true
      }
    } catch (e) {}
    return false
  })
}

/* ------------------------------------------------------------------ */
/*  Song detection → lyrics pipeline                                  */
/* ------------------------------------------------------------------ */
function startSongDetection() {
  startMediaBridge(async (info) => {
    if (!lyricsWindow || lyricsWindow.isDestroyed()) return

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
      sendToLyrics('playback:changed', {
        isPlaying: info.isPlaying,
        positionMs: info.positionMs
      })
    }

    // If user paused and hideWhenPaused is on, toggle window on transition
    if (lastIsPlaying !== info.isPlaying) {
      if (settingsCache.hideWhenPaused) {
        if (!info.isPlaying) lyricsWindow.hide()
        else lyricsWindow.show()
      }
      lastIsPlaying = info.isPlaying
    }

    // Only fetch lyrics when the song actually changes
    if (info.songChanged) {
      const seq = ++lookupSeq
      if (songAbortController) {
        songAbortController.abort()
      }
      songAbortController = new AbortController()
      const signal = songAbortController.signal

      currentLyrics = null
      rawCurrentLyrics = null
      const songInfo = {
        title: info.title,
        artist: info.artist,
        isPlaying: info.isPlaying,
        albumColor: null,
        textColor: 'white'
      }
      currentSongInfo = songInfo
      sendToLyrics('song:changed', songInfo)

      const bgMode = settingsCache.bgMode || 'album'
      const preferredLanguage = settingsCache.preferredLanguage || 'en'
      const category = classifySource(info.sourceApp)
      const candidates = buildLookupCandidates({ ...info, category })
      const firstCand = candidates[0] || { title: info.title, artist: info.artist }
      const fetchColor = bgMode === 'album'
        ? getAlbumColor(firstCand.title, firstCand.artist, { signal })
        : Promise.resolve(null)

      Promise.all([
        getLyricsForSong(info, candidates, { signal }),
        fetchColor
      ]).then(async ([lyrics, color]) => {
        if (seq !== lookupSeq || !lyrics) return
        rawCurrentLyrics = lyrics
        currentLyrics = lyrics
        songInfo.albumColor = color
        songInfo.textColor = getTextColorForBackground(color)
        currentSongInfo = songInfo

        // Send lyrics immediately so UI displays without waiting for translation network call
        sendToLyrics('lyrics:loaded', lyrics)
        sendToLyrics('song:changed', songInfo)

        // Enrich with translations in background if lyrics have lines
        if (lyrics.lines && lyrics.lines.length > 0 && !lyrics.instrumental) {
          const enriched = await enrichLyricsWithTranslation(lyrics, preferredLanguage, { signal })
          if (seq !== lookupSeq) return
          currentLyrics = enriched
          sendToLyrics('lyrics:loaded', enriched)
        }
      }).catch((err) => {
        console.error('[LyricFloat] Error fetching lyrics or color:', err)
        if (seq !== lookupSeq) return
        const emptyLyrics = { synced: false, lines: [], source: null, instrumental: false }
        currentLyrics = emptyLyrics
        sendToLyrics('lyrics:loaded', emptyLyrics)
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

  screen.on('display-removed', () => ensureLyricsWindowOnScreen())
  screen.on('display-metrics-changed', () => ensureLyricsWindowOnScreen())

  // When PC resumes from sleep or screen unlock, force a hit-test region refresh on the lyrics window
  const onSystemWake = () => {
    if (!lyricsWindow || lyricsWindow.isDestroyed() || !lyricsWindow.isVisible()) return
    try {
      const b = lyricsWindow.getBounds()
      lyricsWindow.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height })
      lyricsWindow.setBounds(b)
    } catch {}
  }
  powerMonitor.on('resume', onSystemWake)
  powerMonitor.on('unlock-screen', onSystemWake)

  app.on('activate', () => {
    if (!lyricsWindow) createLyricsWindow()
  })
})

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
})

app.on('before-quit', () => {
  stopMediaBridge()
  flushCache()
})
