import React from 'react'
import CloseButton from './CloseButton.jsx'

export default function StateScreen({ background, isTransparent, tColors, children }) {
  return (
    <div
      className="drag w-full h-full flex items-center justify-center rounded-2xl relative"
      style={{ background }}
    >
      <CloseButton
        className={`no-drag absolute top-4 right-4 ${tColors.o50} ${tColors.hover} z-50 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors`}
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
