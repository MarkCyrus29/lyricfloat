import React from 'react'
import { X } from 'lucide-react'

export default function CloseButton({ className = '', size = 16, onClick }) {
  const handleClick = onClick || (() => window.electronAPI?.closeApp())
  return (
    <button
      onClick={handleClick}
      className={className}
      title="Close App"
    >
      <X size={size} />
    </button>
  )
}
