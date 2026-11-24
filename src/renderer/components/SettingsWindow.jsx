import React, { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, Check, Globe } from 'lucide-react'
import { DEFAULT_SETTINGS } from '../context/defaults.js'

const FONT_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'extra-large', label: 'Extra Large' }
]

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'tl', label: 'Filipino (Tagalog)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'id', label: 'Indonesian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'ru', label: 'Russian' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'th', label: 'Thai' }
]

export default function SettingsWindow() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(DEFAULT_SETTINGS.alwaysOnTop)
  const [hideWhenPaused, setHideWhenPaused] = useState(DEFAULT_SETTINGS.hideWhenPaused)
  const [bouncyLyrics, setBouncyLyrics] = useState(DEFAULT_SETTINGS.bouncyLyrics)
  const [preferredLanguage, setPreferredLanguage] = useState(DEFAULT_SETTINGS.preferredLanguage)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize)
  const [opacity, setOpacity] = useState(DEFAULT_SETTINGS.opacity)
  const [bgColor, setBgColor] = useState(DEFAULT_SETTINGS.bgColor)
  const [bgMode, setBgMode] = useState(DEFAULT_SETTINGS.bgMode)
  const [loaded, setLoaded] = useState(false)

  const originalSettings = useRef({ ...DEFAULT_SETTINGS })
  const langDropdownRef = useRef(null)

  // Close custom language menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!langMenuOpen) return
    const handleClickOutside = (e) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setLangMenuOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setLangMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [langMenuOpen])

  // Load current settings
  useEffect(() => {
    async function load() {
      const api = window.electronAPI
      if (!api?.getAllSettings) return

      const s = await api.getAllSettings()
      if (s) {
        if (s.alwaysOnTop !== undefined) setAlwaysOnTop(s.alwaysOnTop)
        if (s.hideWhenPaused !== undefined) setHideWhenPaused(s.hideWhenPaused)
        if (s.bouncyLyrics !== undefined) setBouncyLyrics(s.bouncyLyrics)
        if (s.preferredLanguage !== undefined) setPreferredLanguage(s.preferredLanguage)
        if (s.fontSize !== undefined) setFontSize(s.fontSize)
        if (s.opacity !== undefined) setOpacity(s.opacity)
        if (s.bgColor !== undefined) setBgColor(s.bgColor)
        if (s.bgMode !== undefined) setBgMode(s.bgMode)

        originalSettings.current = {
          ...DEFAULT_SETTINGS,
          ...s
        }
      }

      setLoaded(true)
    }
    load()
  }, [])

  const handleToggle = async (key, current, setter) => {
    const next = !current
    setter(next)
    const api = window.electronAPI
    if (api) {
      await api.previewSetting(key, next)
    }
  }

  const handleSelectLanguage = async (val) => {
    setPreferredLanguage(val)
    setLangMenuOpen(false)
    if (window.electronAPI) {
      await window.electronAPI.previewSetting('preferredLanguage', val)
    }
  }

  const selectedLanguageLabel =
    LANGUAGE_OPTIONS.find((l) => l.value === preferredLanguage)?.label || 'English'

  const handleFontSize = async (val) => {
    setFontSize(val)
    if (window.electronAPI) await window.electronAPI.previewSetting('fontSize', val)
  }

  const handleOpacity = async (e) => {
    const val = parseFloat(e.target.value)
    setOpacity(val)
    if (window.electronAPI) {
      await window.electronAPI.previewSetting('opacity', val)
      await window.electronAPI.setOpacity(val)
    }
  }

  const handleColor = async (e) => {
    const hex = e.target.value
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const val = `rgba(${r},${g},${b},0.92)`
    setBgColor(val)
    if (window.electronAPI) await window.electronAPI.previewSetting('bgColor', val)
  }

  const toggleTransparent = async () => {
    const val = bgColor === 'transparent' ? 'rgba(18,18,18,0.92)' : 'transparent'
    setBgColor(val)
    if (window.electronAPI) await window.electronAPI.previewSetting('bgColor', val)
  }

  const handleBgMode = async (mode) => {
    setBgMode(mode)
    if (window.electronAPI) await window.electronAPI.previewSetting('bgMode', mode)
  }

  const getHexColor = (rgba) => {
    if (!rgba || rgba === 'transparent') return '#121212'
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!match) return '#121212'
    const r = parseInt(match[1]).toString(16).padStart(2, '0')
    const g = parseInt(match[2]).toString(16).padStart(2, '0')
    const b = parseInt(match[3]).toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
  }

  const isDirty = () => {
    return (
      alwaysOnTop !== originalSettings.current.alwaysOnTop ||
      hideWhenPaused !== originalSettings.current.hideWhenPaused ||
      bouncyLyrics !== originalSettings.current.bouncyLyrics ||
      preferredLanguage !== originalSettings.current.preferredLanguage ||
      fontSize !== originalSettings.current.fontSize ||
      opacity !== originalSettings.current.opacity ||
      bgColor !== originalSettings.current.bgColor ||
      bgMode !== originalSettings.current.bgMode
    )
  }

  const handleSave = async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveSetting({
        alwaysOnTop,
        hideWhenPaused,
        bouncyLyrics,
        preferredLanguage,
        fontSize,
        opacity,
        bgColor,
        bgMode
      })
    }
  }

  const handleClose = async () => {
    if (window.electronAPI) {
      await window.electronAPI.revertSettings(originalSettings.current)
    }
  }

  if (!loaded) {
    return (
      <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
        <div className="animate-pulse text-white/40">Loading…</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-neutral-900 text-white flex flex-col select-none relative">
      {/* ---- Draggable title bar ---- */}
      <div className="drag flex items-center justify-between px-5 py-4 border-b border-white/10">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <button
          onClick={handleClose}
          className="no-drag w-8 h-8 rounded-lg flex items-center justify-center
            hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          title="Close (Revert changes)"
        >
          <X size={16} />
        </button>
      </div>

      {/* ---- Settings content ---- */}
      <div className="flex-1 overflow-y-auto settings-scroll px-5 py-5 space-y-6 pb-24">
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

        {/* Bouncy lyrics animation toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Bouncy Lyrics</p>
            <p className="text-xs text-white/40">Lively spring bounce and pop effects on scrolling lyrics</p>
          </div>
          <button
            onClick={() => handleToggle('bouncyLyrics', bouncyLyrics, setBouncyLyrics)}
            className={`no-drag relative w-11 h-6 rounded-full transition-colors duration-200 ${
              bouncyLyrics ? 'bg-green-500' : 'bg-white/20'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                bouncyLyrics ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Custom Preferred Translation Language Dropdown */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Preferred Language</p>
            <p className="text-xs text-white/40">
              Translate songs that aren&apos;t in this language
            </p>
          </div>

          <div ref={langDropdownRef} className="no-drag relative">
            <button
              type="button"
              onClick={() => setLangMenuOpen((prev) => !prev)}
              className={`min-w-[175px] px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-between gap-2 transition-all border ${
                langMenuOpen
                  ? 'bg-white/15 border-green-500/70 text-white shadow-lg shadow-green-500/10'
                  : 'bg-white/10 hover:bg-white/15 border-white/10 text-white/90 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Globe size={14} className="text-green-400 flex-shrink-0" />
                <span className="truncate">{selectedLanguageLabel}</span>
              </span>
              <ChevronDown
                size={15}
                className={`text-white/50 flex-shrink-0 transition-transform duration-200 ${
                  langMenuOpen ? 'rotate-180 text-green-400' : ''
                }`}
              />
            </button>

            {langMenuOpen && (
              <div
                className="absolute right-0 mt-1.5 w-52 max-h-56 overflow-y-auto settings-scroll
                  rounded-xl bg-neutral-800/95 backdrop-blur-md border border-white/15
                  shadow-2xl shadow-black/70 py-1.5 z-50"
              >
                {LANGUAGE_OPTIONS.map((lang) => {
                  const isSelected = lang.value === preferredLanguage
                  return (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() => handleSelectLanguage(lang.value)}
                      className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-green-500/15 text-green-400 font-semibold'
                          : 'text-white/80 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{lang.label}</span>
                      {isSelected && <Check size={14} className="text-green-400 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
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

        {/* Opacity slider */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Window Opacity</p>
            <p className="text-xs text-white/40">Adjust the transparency of the window</p>
          </div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={opacity}
            onChange={handleOpacity}
            className="no-drag w-24 h-1 accent-green-500 cursor-pointer"
          />
        </div>

        {/* Background Theme */}
        <div>
          <p className="text-sm font-medium mb-1">Background Theme</p>
          <p className="text-xs text-white/40 mb-3">Choose how the background color is determined</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleBgMode('album')}
              className={`no-drag px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex flex-col items-center gap-0
                ${bgMode === 'album'
                  ? 'bg-green-500 text-black'
                  : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                }`}
            >
              <span>Album Art</span>
              <span className={`text-[10px] ${bgMode === 'album' ? 'text-black/60' : 'text-white/30'}`}>Color from cover</span>
            </button>
            <button
              onClick={() => handleBgMode('classic')}
              className={`no-drag px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex flex-col items-center gap-0
                ${bgMode === 'classic'
                  ? 'bg-green-500 text-black'
                  : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                }`}
            >
              <span>Classic</span>
              <span className={`text-[10px] ${bgMode === 'classic' ? 'text-black/60' : 'text-white/30'}`}>Plain dark</span>
            </button>
          </div>
        </div>

        {/* Background Color */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Background Color</p>
            <p className="text-xs text-white/40">{bgMode === 'classic' ? 'Set the background color' : 'Fallback color when album art is unavailable'}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input
                type="color"
                value={getHexColor(bgColor)}
                onChange={handleColor}
                className="no-drag w-8 h-8 rounded-full border-0 cursor-pointer bg-transparent"
              />
            </label>
            <button
              onClick={toggleTransparent}
              className="no-drag text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
            >
              {bgColor === 'transparent' ? 'FILL' : 'CLEAR'}
            </button>
          </div>
        </div>

        {/* Divider */}
        <hr className="border-white/10" />

        {/* About */}
        <div className="text-center text-white/30 text-xs space-y-1">
          <p className="text-white/50 font-medium">LyricFloat v1.3.0</p>
          <p>Lyrics from LRCLIB, NetEase Cloud Music and lyrics.ovh</p>
          <p>Made by <span onClick={() => window.electronAPI.openExternal('https://markcyruss.com')} className="text-green-500 hover:text-green-400 underline underline-offset-2 cursor-pointer">markcyruss.com</span></p>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-5 bg-neutral-900 border-t border-white/10">
        <button
          onClick={handleSave}
          disabled={!isDirty()}
          className={`no-drag w-full py-2.5 rounded-xl font-medium transition-colors ${
            isDirty()
              ? 'bg-green-500 hover:bg-green-400 text-black'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          Save Settings
        </button>
      </div>
    </div>
  )
}
