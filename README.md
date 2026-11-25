# LyricFloat

LyricFloat is a lightweight, customizable desktop overlay for Windows and macOS that automatically detects the music you're playing and displays real-time, synced lyrics directly on your screen.

Built with Electron, React, and Tailwind CSS.

## Features

* **Always-on-Top Overlay:** Floats above your other applications with adjustable opacity, transparent mode, and full-window dragging from anywhere on the overlay.
* **Real-Time Sync & Free Scrolling:** Automatically syncs and scrolls with the active track (with optional bouncy spring animations). You can also scroll freely through lyrics at any time—scroll back near the active line to magnetically snap into sync, or click the floating **Sync** button.
* **Auto Lyric Translations:** Displays Spotify-style translation subtitles below lyrics for songs that aren't in your preferred language (supporting Japanese, Filipino/Taglish, Korean, Spanish, Chinese, and more), with a quick **TRANSLATE** toggle in the header.
* **Cross-Platform Music Detection:** Automatically detects active playback from Spotify, Apple Music, local media players, and web browsers (YouTube, SoundCloud, etc.) on both Windows and macOS.
* **Dynamic Album Art Theming:** Extracts the dominant color from the current track's album cover (or lets you pick a custom color / transparent glass mode) and adapts text contrast automatically.

## Installation

### Windows
1. Go to the [Releases](../../releases) page and download the latest `LyricFloat Setup .exe` file.
2. Run the installer (if Windows SmartScreen appears, click **More info** -> **Run anyway**).
3. LyricFloat will launch automatically and live in your system tray.

### macOS
1. Go to the [Releases](../../releases) page and download the latest `LyricFloat .dmg` file.
2. Open the `.dmg` and drag **LyricFloat** into your **Applications** folder.
3. Because the app is not signed with a paid Apple Developer certificate, macOS Gatekeeper may say **"LyricFloat is damaged and can't be opened"**. To fix this, open **Terminal** and run:
   ```bash
   xattr -cr /Applications/LyricFloat.app
   ```
4. Launch **LyricFloat** from Applications and grant permission when prompted so it can detect the active track from Spotify, Apple Music, or your browser.

## Good to Know

* **Where is the app?** LyricFloat runs quietly in the background. Open your system tray (bottom-right taskbar arrow on Windows, or top menu bar on macOS) and click the LyricFloat icon to show the lyrics window or open Settings.
* **Moving & Scrolling:** You can click and drag anywhere on the lyrics window to reposition it, and use your mouse wheel or trackpad anywhere on the window to scroll through the lyrics.

## Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run unit tests
npm test

# Package the app into an installer
npm run package
```
