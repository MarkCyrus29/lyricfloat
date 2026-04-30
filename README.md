# LyricFloat 🎵

LyricFloat is a sleek, highly customizable desktop overlay that automatically detects the music you're playing and displays real-time, synced lyrics directly on your screen.

Built with Electron, React, and Tailwind CSS.

## ✨ Features
*   **Always-on-Top:** A floating window that stays above your other applications without getting in the way.
*   **Real-Time Sync:** Lyrics scroll and sync perfectly with the currently playing track.
*   **Auto-Detection:** Detects active music from Windows media players (Spotify, Apple Music, etc.).
*   **Customizable Design:** Adjust background opacity, font sizes, and colors directly from the app.

## 📥 Installation

1. Go to the [Releases](../../releases) page.
2. Download the latest `LyricFloat Setup .exe` file.
3. Run the installer to automatically install and launch the application.

## 💡 Good to Know (Troubleshooting)

*   **Where is the app?** LyricFloat runs quietly in the background. To find it, open your system tray (the **up arrow** in the bottom right corner of your Windows taskbar) and click on the LyricFloat icon to open the lyrics window or settings.
*   **Can't click header buttons?** If you hover over the window and find that the buttons on the top header panel (like Settings or Minimize) aren't responding to clicks, **try resizing the window slightly**. Grabbing the edge to resize it usually fixes the click-detection issue immediately.

## 🛠️ Local Development

If you want to build or run the project locally:

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Package the app into an executable
npm run package
```
