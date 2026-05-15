import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let pollInterval = null
let lastSongKey = ''

/* ------------------------------------------------------------------ */
/*  AppleScript snippets for each supported player                    */
/* ------------------------------------------------------------------ */

// Spotify: most reliable, has full AppleScript dictionary
const SPOTIFY_SCRIPT = `
tell application "System Events"
  if not (exists process "Spotify") then return "NOT_RUNNING"
end tell
tell application "Spotify"
  if player state is stopped then return "STOPPED"
  set t to name of current track
  set a to artist of current track
  set p to player position
  set s to player state as string
  return t & "|||" & a & "|||" & (p * 1000 as integer) & "|||" & s
end tell
`.trim()

// Apple Music (Music.app)
const MUSIC_SCRIPT = `
tell application "System Events"
  if not (exists process "Music") then return "NOT_RUNNING"
end tell
tell application "Music"
  if player state is stopped then return "STOPPED"
  set t to name of current track
  set a to artist of current track
  set p to player position
  set s to player state as string
  return t & "|||" & a & "|||" & (p * 1000 as integer) & "|||" & s
end tell
`.trim()

// Browser window title scraping via System Events (catches YouTube, SoundCloud, etc.)
const BROWSER_SCRIPT = `
set output to ""
tell application "System Events"
  repeat with proc in (processes whose background only is false)
    set procName to name of proc
    if procName is in {"Google Chrome", "Safari", "Firefox", "Microsoft Edge", "Arc", "Brave Browser", "Opera"} then
      try
        set winTitle to name of front window of proc
        set output to output & procName & "|||" & winTitle & "\\n"
      end try
    end if
  end repeat
end tell
return output
`.trim()

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function runAppleScript(script) {
  try {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 3000,
      encoding: 'utf8'
    })
    return stdout.trim()
  } catch (e) {
    return null
  }
}

function parseBrowserTitle(procName, windowTitle) {
  if (!windowTitle) return null

  // YouTube: "Song Title - Artist - YouTube" or "Song Title - YouTube"
  if (windowTitle.includes(' - YouTube')) {
    const raw = windowTitle.replace(' - YouTube', '').trim()
    const dashIdx = raw.lastIndexOf(' - ')
    if (dashIdx > 0) {
      return {
        title: raw.slice(0, dashIdx).trim(),
        artist: raw.slice(dashIdx + 3).trim(),
        isPlaying: true,
        positionMs: 0
      }
    }
    // Single part — treat as title with unknown artist
    return { title: raw, artist: '', isPlaying: true, positionMs: 0 }
  }

  // SoundCloud: "Stream Title by Artist | Listen …"
  if (windowTitle.includes(' by ') && windowTitle.includes('| Listen')) {
    const stripped = windowTitle.split('| Listen')[0].trim()
    const byIdx = stripped.lastIndexOf(' by ')
    if (byIdx > 0) {
      return {
        title: stripped.slice(0, byIdx).trim(),
        artist: stripped.slice(byIdx + 4).trim(),
        isPlaying: true,
        positionMs: 0
      }
    }
  }

  // Generic "Title - Artist" pattern
  const dashIdx = windowTitle.lastIndexOf(' - ')
  if (dashIdx > 0) {
    const possibleBrowser = windowTitle.slice(dashIdx + 3).trim()
    // Skip if the right side is just a browser name
    if (!['Google Chrome', 'Safari', 'Firefox', 'Microsoft Edge', 'Arc', 'Brave Browser', 'Opera'].includes(possibleBrowser)) {
      return {
        title: windowTitle.slice(0, dashIdx).trim(),
        artist: possibleBrowser,
        isPlaying: true,
        positionMs: 0
      }
    }
  }

  return null
}

/* ------------------------------------------------------------------ */
/*  Main poll loop                                                    */
/* ------------------------------------------------------------------ */

async function pollMediaInfo(onSongChanged) {
  // 1. Try Spotify first (most common on Mac)
  const spotifyResult = await runAppleScript(SPOTIFY_SCRIPT)
  if (spotifyResult && spotifyResult !== 'NOT_RUNNING' && spotifyResult !== 'STOPPED') {
    const parts = spotifyResult.split('|||')
    if (parts.length >= 4) {
      const info = {
        title: parts[0],
        artist: parts[1],
        positionMs: parseInt(parts[2], 10) || 0,
        isPlaying: parts[3] === 'playing'
      }
      handleNewInfo(info, onSongChanged)
      return
    }
  }

  // 2. Try Apple Music
  const musicResult = await runAppleScript(MUSIC_SCRIPT)
  if (musicResult && musicResult !== 'NOT_RUNNING' && musicResult !== 'STOPPED') {
    const parts = musicResult.split('|||')
    if (parts.length >= 4) {
      const info = {
        title: parts[0],
        artist: parts[1],
        positionMs: parseInt(parts[2], 10) || 0,
        isPlaying: parts[3] === 'playing'
      }
      handleNewInfo(info, onSongChanged)
      return
    }
  }

  // 3. Fallback: scrape browser window titles
  const browserResult = await runAppleScript(BROWSER_SCRIPT)
  if (browserResult) {
    const lines = browserResult.split('\\n').filter(Boolean)
    for (const line of lines) {
      const [procName, ...titleParts] = line.split('|||')
      const windowTitle = titleParts.join('|||').trim()
      const info = parseBrowserTitle(procName, windowTitle)
      if (info) {
        handleNewInfo(info, onSongChanged)
        return
      }
    }
  }
}

function handleNewInfo(info, onSongChanged) {
  if (!info) return
  const key = `${info.title}|${info.artist}`
  const songChanged = key !== lastSongKey

  if (songChanged) {
    lastSongKey = key
    onSongChanged({ ...info, songChanged: true })
  } else {
    onSongChanged({ ...info, songChanged: false })
  }
}

/* ------------------------------------------------------------------ */
/*  Public API — same signature as powerShellBridge                   */
/* ------------------------------------------------------------------ */

export function startMediaBridge(onSongChanged) {
  stopMediaBridge()
  // Initial poll immediately
  pollMediaInfo(onSongChanged)
  // Then poll every 500ms
  pollInterval = setInterval(() => pollMediaInfo(onSongChanged), 500)
}

export function stopMediaBridge() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  lastSongKey = ''
}
