import React from 'react'

export default function CloseButton({ className = '', size = 16, onClick }) {
  const handleClick = onClick || (() => window.electronAPI?.closeApp())
  return (
    <button
      onClick={handleClick}
      className={className}
      title="Close App"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}
