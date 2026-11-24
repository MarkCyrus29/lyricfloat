import React, { useCallback } from 'react'
import { GripHorizontal } from 'lucide-react'
import CloseButton from './CloseButton.jsx'

export default function StateScreen({ background, isTransparent, tColors, children }) {
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, a, input, select, textarea, [data-no-drag]')) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    window.electronAPI?.startWindowDrag()
  }, [])

  const handlePointerUp = useCallback((e) => {
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {}
    window.electronAPI?.stopWindowDrag()
  }, [])

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={() => window.electronAPI?.stopWindowDrag()}
      className="no-drag cursor-grab active:cursor-grabbing w-full h-full flex items-center justify-center rounded-2xl relative select-none"
      style={{ background }}
    >
      {/* Top center drag grip indicator */}
      <div className={`absolute top-2.5 left-1/2 -translate-x-1/2 pointer-events-none ${tColors.o40}`}>
        <GripHorizontal size={18} />
      </div>

      <CloseButton
        className={`no-drag cursor-pointer absolute top-4 right-4 ${tColors.o50} ${tColors.hover} z-50 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors`}
        size={16}
      />
      <div
        className="text-center flex flex-col items-center px-6 py-8 rounded-2xl"
        style={
          isTransparent
            ? {
                backgroundColor: "rgba(0,0,0,0.35)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }
            : {}
        }
      >
        {children}
      </div>
    </div>
  )
}
