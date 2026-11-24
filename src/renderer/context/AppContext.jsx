import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { DEFAULT_SETTINGS } from './defaults.js'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [song, setSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [lyrics, setLyrics] = useState(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS)

  // Ref for the high-frequency interpolated position to prevent React render thrashing
  const playbackRef = useRef({ isPlaying: false, positionMs: 0, lastUpdateTime: performance.now() })
  const playbackListenersRef = useRef(new Set())
  const prevSongRef = useRef(null)

  const subscribePlayback = useCallback((fn) => {
    playbackListenersRef.current.add(fn)
    return () => {
      playbackListenersRef.current.delete(fn)
    }
  }, [])

  // Load initial settings
  useEffect(() => {
    async function loadSettings() {
      const api = window.electronAPI
      if (!api?.getAllSettings) return

      const loaded = await api.getAllSettings()
      if (loaded) {
        setSettingsState((prev) => ({ ...prev, ...loaded }))
      }
    }
    loadSettings()
  }, [])

  // Listen for IPC events from main
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const unsubs = []

    unsubs.push(
      api.onSettingsChanged && api.onSettingsChanged(({ key, value }) => {
        setSettingsState((prev) => ({ ...prev, [key]: value }))
      })
    )

    unsubs.push(
      api.onSongChanged((data) => {
        const prev = prevSongRef.current
        const changed = !prev || prev.title !== data.title || prev.artist !== data.artist
        if (changed) {
          prevSongRef.current = { title: data.title, artist: data.artist }
          setLyrics(null)
          setLyricsLoading(true)
        }
        setSong((current) => {
          return changed
            ? { ...data, albumColor: data.albumColor || null, textColor: data.textColor || 'white' }
            : { ...current, albumColor: data.albumColor ?? current?.albumColor, textColor: data.textColor ?? current?.textColor }
        })
      })
    )

    unsubs.push(
      api.onPlaybackChanged((data) => {
        playbackRef.current = {
          isPlaying: data.isPlaying,
          positionMs: data.positionMs,
          lastUpdateTime: performance.now()
        }

        // Only update React state when play/pause changes; position drifts notify imperative subscribers
        setIsPlaying((prev) => (prev !== data.isPlaying ? data.isPlaying : prev))

        for (const fn of playbackListenersRef.current) {
          fn(playbackRef.current)
        }
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

  const playback = useMemo(() => ({ isPlaying }), [isPlaying])

  return (
    <AppContext.Provider
      value={{
        song,
        playback,
        playbackRef,
        subscribePlayback,
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
