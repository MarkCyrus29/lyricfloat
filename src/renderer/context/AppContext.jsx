import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [song, setSong] = useState(null)
  const [playback, setPlayback] = useState({ isPlaying: false, positionMs: 0 })
  const [lyrics, setLyrics] = useState(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [settings, setSettingsState] = useState({
    alwaysOnTop: true,
    hideWhenPaused: false,
    fontSize: 'medium',
    opacity: 0.92,
    bgColor: 'rgba(18,18,18,0.92)'
  })

  // Load initial settings
  useEffect(() => {
    async function loadSettings() {
      const api = window.electronAPI
      if (!api) return

      const keys = ['alwaysOnTop', 'hideWhenPaused', 'fontSize', 'opacity', 'bgColor']
      const loaded = {}
      for (const key of keys) {
        const val = await api.getSetting(key)
        if (val !== undefined && val !== null) loaded[key] = val
      }
      setSettingsState((prev) => ({ ...prev, ...loaded }))
    }
    loadSettings()
  }, [])

  // Listen for IPC events from main
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const unsubs = []

    unsubs.push(
      api.onSongChanged((data) => {
        setSong(data)
        setLyrics(null)
        setLyricsLoading(true)
      })
    )

    unsubs.push(
      api.onPlaybackChanged((data) => {
        setPlayback(data)
        // Force recovery if we somehow missed the song:changed event
        setSong((current) => {
          if (!current && data.title) {
            // Un-hide the "Play a song to see lyrics" prompt
            return { title: data.title, artist: data.artist, isPlaying: data.isPlaying }
          }
          if (current && (current.title !== data.title || current.artist !== data.artist)) {
            return { title: data.title, artist: data.artist, isPlaying: data.isPlaying }
          }
          return current
        })
      })
    )

    unsubs.push(
      api.onLyricsLoaded((data) => {
        setLyrics(data)
        setLyricsLoading(false)
      })
    )

    return () => {
      unsubs.forEach((fn) => fn && fn())
    }
  }, [])

  // Sync state on load
  useEffect(() => {
    window.electronAPI?.requestState()
  }, [])

  const updateSetting = useCallback(async (key, value) => {
    setSettingsState((prev) => ({ ...prev, [key]: value }))
    const api = window.electronAPI
    if (api) await api.setSetting(key, value)
  }, [])

  return (
    <AppContext.Provider
      value={{
        song,
        playback,
        lyrics,
        lyricsLoading,
        settings,
        updateSetting
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
