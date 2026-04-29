import React from 'react'
import { createRoot } from 'react-dom/client'
import SettingsWindow from './components/SettingsWindow.jsx'
import './styles/index.css'

const root = createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <SettingsWindow />
  </React.StrictMode>
)
