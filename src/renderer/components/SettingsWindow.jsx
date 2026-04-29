import React, { useState, useEffect } from 'react'

const FONT_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'extra-large', label: 'Extra Large' }
]

export default function SettingsWindow() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [hideWhenPaused, setHideWhenPaused] = useState(false)
  const [fontSize, setFontSize] = useState('medium')
  const [loaded, setLoaded] = useState(false)

  // Load current settings
  useEffect(() => {
    async function load() {
      const api = window.electronAPI
      if (!api) return

      const aot = await api.getSetting('alwaysOnTop')
      const hwp = await api.getSetting('hideWhenPaused')
      const fs = await api.getSetting('fontSize')

      if (aot !== undefined) setAlwaysOnTop(aot)
      if (hwp !== undefined) setHideWhenPaused(hwp)
      if (fs !== undefined) setFontSize(fs)

      setLoaded(true)
    }
    load()
  }, [])

  const handleToggle = async (key, current, setter) => {
    const next = !current
    setter(next)
    const api = window.electronAPI
    if (api) {
      await api.setSetting(key, next)
      if (key === 'alwaysOnTop') await api.setAlwaysOnTop(next)
    }
  }

  const handleFontSize = async (val) => {
    setFontSize(val)
    if (window.electronAPI) await window.electronAPI.setSetting('fontSize', val)
  }

  if (!loaded) {
    return (
      <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
        <div className="animate-pulse text-white/40">Loading…</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-neutral-900 text-white flex flex-col select-none">
      {/* ---- Draggable title bar ---- */}
      <div className="drag flex items-center justify-between px-5 py-4 border-b border-white/10">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <button
          onClick={() => window.electronAPI?.closeSettings()}
          className="no-drag w-8 h-8 rounded-lg flex items-center justify-center
            hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          title="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ---- Settings content ---- */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* Always on Top toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Always on Top</p>
            <p className="text-xs text-white/40">Keep lyrics floating above other windows</p>
          </div>
          <button
            onClick={() => handleToggle('alwaysOnTop', alwaysOnTop, setAlwaysOnTop)}
            className={`no-drag relative w-11 h-6 rounded-full transition-colors duration-200 ${
              alwaysOnTop ? 'bg-green-500' : 'bg-white/20'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                alwaysOnTop ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Hide when paused */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Hide when Paused</p>
            <p className="text-xs text-white/40">Automatically hide lyrics when music is paused</p>
          </div>
          <button
            onClick={() => handleToggle('hideWhenPaused', hideWhenPaused, setHideWhenPaused)}
            className={`no-drag relative w-11 h-6 rounded-full transition-colors duration-200 ${
              hideWhenPaused ? 'bg-green-500' : 'bg-white/20'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                hideWhenPaused ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Font size selector */}
        <div>
          <p className="text-sm font-medium mb-3">Font Size</p>
          <div className="grid grid-cols-4 gap-2">
            {FONT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleFontSize(opt.value)}
                className={`no-drag px-3 py-2 rounded-lg text-sm font-medium transition-all
                  ${fontSize === opt.value
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <hr className="border-white/10" />

        {/* About */}
        <div className="text-center text-white/30 text-xs space-y-1">
          <p className="text-white/50 font-medium">LyricFloat v1.0.0</p>
          <p>Floating synced lyrics overlay</p>
          <p>Lyrics powered by LRCLIB</p>
        </div>
      </div>
    </div>
  )
}
