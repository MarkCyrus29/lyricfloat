import React, { useState, useEffect, useRef } from 'react'

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
  const [opacity, setOpacity] = useState(0.92)
  const [bgColor, setBgColor] = useState('rgba(18,18,18,0.92)')
  const [loaded, setLoaded] = useState(false)

  const originalSettings = useRef({})

  // Load current settings
  useEffect(() => {
    async function load() {
      const api = window.electronAPI
      if (!api) return

      const aot = await api.getSetting('alwaysOnTop')
      const hwp = await api.getSetting('hideWhenPaused')
      const fs = await api.getSetting('fontSize')
      const op = await api.getSetting('opacity')
      const bg = await api.getSetting('bgColor')

      if (aot !== undefined) setAlwaysOnTop(aot)
      if (hwp !== undefined) setHideWhenPaused(hwp)
      if (fs !== undefined) setFontSize(fs)
      if (op !== undefined) setOpacity(op)
      if (bg !== undefined) setBgColor(bg)

      originalSettings.current = {
        alwaysOnTop: aot ?? true,
        hideWhenPaused: hwp ?? false,
        fontSize: fs ?? 'medium',
        opacity: op ?? 0.92,
        bgColor: bg ?? 'rgba(18,18,18,0.92)'
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
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const val = `rgba(${r},${g},${b},0.92)`;
    setBgColor(val);
    if (window.electronAPI) await window.electronAPI.previewSetting('bgColor', val);
  }

  const toggleTransparent = async () => {
    const val = bgColor === 'transparent' ? 'rgba(18,18,18,0.92)' : 'transparent'
    setBgColor(val)
    if (window.electronAPI) await window.electronAPI.previewSetting('bgColor', val);
  }

  const getHexColor = (rgba) => {
    if (!rgba || rgba === 'transparent') return '#121212';
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#121212';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  const isDirty = () => {
    return (
      alwaysOnTop !== originalSettings.current.alwaysOnTop ||
      hideWhenPaused !== originalSettings.current.hideWhenPaused ||
      fontSize !== originalSettings.current.fontSize ||
      opacity !== originalSettings.current.opacity ||
      bgColor !== originalSettings.current.bgColor
    )
  }

  const handleSave = async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveSetting({
        alwaysOnTop,
        hideWhenPaused,
        fontSize,
        opacity,
        bgColor
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
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

        {/* Background Color */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Background Color</p>
            <p className="text-xs text-white/40">Set the background color of the lyrics window</p>
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
          <p className="text-white/50 font-medium">LyricFloat v1.0.3</p>
          <p>Lyrics powered by LRCLIB</p>
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
