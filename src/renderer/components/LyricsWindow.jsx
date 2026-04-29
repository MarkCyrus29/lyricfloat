import React, { useRef, useEffect, useState, useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { TriangleAlert, HeartCrack, Search } from 'lucide-react'

const FONT_SIZES = {
  small: { active: 'text-base', inactive: 'text-sm' },
  medium: { active: 'text-lg', inactive: 'text-base' },
  large: { active: 'text-2xl', inactive: 'text-lg' },
  'extra-large': { active: 'text-3xl', inactive: 'text-xl' }
}

export default function LyricsWindow() {
  const { song, playback, lyrics, lyricsLoading, settings, updateSetting } = useApp()
  const scrollRef = useRef(null)
  const activeRef = useRef(null)
  const [hovering, setHovering] = useState(false)
  const [bgColor, setBgColor] = useState(settings.bgColor || 'rgba(18,18,18,0.92)')
  const [localOpacity, setLocalOpacity] = useState(settings.opacity ?? 0.92)
  const [isTransparent, setIsTransparent] = useState(false)

  // Listen for cursor enter/leave via IPC from main process cursor tracking
  useEffect(() => {
    const unsubEnter = window.electronAPI?.onMouseEnter(() => setHovering(true))
    const unsubLeave = window.electronAPI?.onMouseLeave(() => setHovering(false))
    return () => {
      unsubEnter?.()
      unsubLeave?.()
    }
  }, [])

  // Sync bgColor from settings
  useEffect(() => {
    if (settings.bgColor) setBgColor(settings.bgColor)
  }, [settings.bgColor])

  useEffect(() => {
    if (settings.opacity !== undefined) setLocalOpacity(settings.opacity)
  }, [settings.opacity])

  // Determine active line index
  const activeLine = useMemo(() => {
    if (!lyrics?.lines?.length || !lyrics.synced) return -1
    const posSeconds = (playback.positionMs || 0) / 1000
    let active = -1
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= posSeconds) {
        active = i
      } else {
        break
      }
    }
    return active
  }, [lyrics, playback.positionMs])

  // Auto-scroll to active line
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeLine])

  const fontSize = FONT_SIZES[settings.fontSize] || FONT_SIZES.medium

  const handleOpacityChange = (e) => {
    const val = parseFloat(e.target.value)
    setLocalOpacity(val)
    window.electronAPI?.setOpacity(val)
    updateSetting('opacity', val)
  }

  const handleColorChange = (e) => {
    const hex = e.target.value
    // Convert hex to rgba with current alpha
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const color = `rgba(${r},${g},${b},0.92)`
    setBgColor(color)
    updateSetting('bgColor', color)
  }

  const toggleTransparent = () => {
    if (isTransparent) {
      setBgColor(settings.bgColor || 'rgba(18,18,18,0.92)')
      setIsTransparent(false)
    } else {
      setBgColor('transparent')
      setIsTransparent(true)
    }
  }

  /* ---- RENDER ---- */

  // Empty state: no song
  if (!song) {
    return (
      <div
        className="drag w-full h-full flex items-center justify-center rounded-2xl"
        style={{ background: bgColor }}
      >
        <div className="text-center px-6">
          <div className="text-4xl mb-4">🎵</div>
          <p className="text-white/70 text-lg font-medium">Play a song to see lyrics</p>
          <p className="text-white/40 text-sm mt-2">LyricFloat will auto-detect your music</p>
        </div>
      </div>
    )
  }

  // Loading state
  if (lyricsLoading) {
    return (
      <div
        className="drag w-full h-full flex items-center justify-center rounded-2xl"
        style={{ background: bgColor }}
      >
        <div className="text-center flex flex-col items-center px-6">
          <Search className="animate-pulse text-4xl mb-4 text-white" />
          <p className="text-white/70 text-lg font-medium">
            Looking up lyrics for
          </p>
          <p className="text-white text-xl font-semibold mt-1">
            {song.title}
          </p>
          <p className="text-white/50 text-sm mt-1">{song.artist}</p>
        </div>
      </div>
    )
  }

  // No lyrics found
  if (!lyrics?.lines?.length) {
    return (
      <div
        className="drag w-full h-full flex items-center justify-center rounded-2xl"
        style={{ background: bgColor }}
      >
        <div className="text-center flex flex-col items-center px-6">
          <HeartCrack className="animate-bounce text-4xl mb-4 text-white" />
          <p className="text-white/70 text-lg font-medium">No lyrics found</p>
          <p className="text-white text-base mt-1">{song.title} — {song.artist}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-full h-full flex flex-col rounded-2xl relative overflow-hidden"
      style={{ background: bgColor }}
    >
      {/* ---- Lyrics scroll area ---- */}
      <div ref={scrollRef} className="drag lyrics-scroll flex-1 px-6 py-16">
        {lyrics.lines.map((line, i) => {
          const isActive = i === activeLine
          const isPast = i < activeLine
          const isUpcoming = i > activeLine

          let colorClass = 'text-white/50'
          if (isActive) colorClass = 'text-white'
          if (isPast) colorClass = 'text-white/30'

          let sizeClass = fontSize.inactive
          if (isActive) sizeClass = fontSize.active

          return (
            <p
              key={i}
              ref={isActive ? activeRef : null}
              className={`lyric-line py-2 cursor-default select-none
                ${colorClass} ${sizeClass}
                ${isActive ? 'font-semibold' : 'font-normal'}`}
            >
              {line.text || '♪'}
            </p>
          )
        })}
        {/* Bottom padding so last line can center */}
        <div className="h-[50vh]" />
      </div>

      {/* ---- Hover control bar (AFTER drag area in DOM so no-drag wins in hit-test) ---- */}
      <div
        className={`no-drag absolute top-0 left-0 right-0 z-50 px-4 py-3 flex items-center gap-3
          bg-black/60 backdrop-blur-md transition-all duration-300
          ${hovering ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}
      >
        {/* Song info */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{song.title}</p>
          <p className="text-white/60 text-xs truncate">{song.artist}</p>
        </div>

        {/* Opacity slider */}
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={localOpacity}
          onChange={handleOpacityChange}
          className="w-20 h-1 accent-white cursor-pointer"
          title="Opacity"
        />

        {/* Color picker */}
        <label className="cursor-pointer" title="Background color">
          <input
            type="color"
            defaultValue="#121212"
            onChange={handleColorChange}
            className="w-6 h-6 rounded-full border-0 cursor-pointer bg-transparent"
          />
        </label>

        {/* Clear / Transparent toggle */}
        <button
          onClick={toggleTransparent}
          className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          title="Toggle transparent background"
        >
          {isTransparent ? 'FILL' : 'CLEAR'}
        </button>

        {/* Settings gear */}
        <button
          onClick={() => window.electronAPI?.openSettings()}
          className="text-white/70 hover:text-white transition-colors"
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Minimize */}
        <button
          onClick={() => window.electronAPI?.minimizeLyrics()}
          className="text-white/70 hover:text-white transition-colors"
          title="Minimize"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Synced indicator */}
      {!lyrics.synced && (
        <div className="absolute bottom-3 right-3 text-white/30 text-xs">
          <TriangleAlert className="text-white"/> Unsynced lyrics
        </div>
      )}
    </div>
  )
}
