import React from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './context/AppContext.jsx'
import LyricsWindow from './components/LyricsWindow.jsx'
import './styles/index.css'

const root = createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <AppProvider>
      <LyricsWindow />
    </AppProvider>
  </React.StrictMode>
)
