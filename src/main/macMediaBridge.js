import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

let pollTimeout = null
let stopped = true

/* ------------------------------------------------------------------ */
/*  Combined AppleScript: single osascript spawn per poll             */
/* ------------------------------------------------------------------ */
export const COMBINED_SCRIPT = `
tell application "System Events"
  set procList to processes whose background only is false
  set procNames to {}
  repeat with p in procList
    set end of procNames to name of p
  end repeat
end tell

if procNames contains "Spotify" then
  tell application "Spotify"
    if player state is not stopped then
      set t to name of current track
      set a to artist of current track
      set al to album of current track
      set d to duration of current track
      set p to player position
      set s to player state as string
      return "SPOTIFY|||" & t & "|||" & a & "|||" & (p * 1000 as integer) & "|||" & s & "|||" & d & "|||" & al
    end if
  end tell
end if

if procNames contains "Music" then
  tell application "Music"
    if player state is not stopped then
      set t to name of current track
      set a to artist of current track
      set al to album of current track
      set d to duration of current track
      set p to player position
      set s to player state as string
      return "MUSIC|||" & t & "|||" & a & "|||" & (p * 1000 as integer) & "|||" & s & "|||" & d & "|||" & al
    end if
  end tell
end if

set output to ""
tell application "System Events"
  repeat with proc in procList
    set procName to name of proc
    if procName is in {"Google Chrome", "Safari", "Firefox", "Microsoft Edge", "Arc", "Brave Browser", "Opera"} then
      try
        set winTitle to name of front window of proc
        set output to output & "BROWSER|||" & procName & "|||" & winTitle & linefeed
      end try
    end if
  end repeat
end tell
return output
`.trim()

async function runAppleScript(script) {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: 3000,
      encoding: 'utf8'
    })
    return stdout.trim()
  } catch (e) {
    return null
  }
}

export function parseBrowserTitle(procName, windowTitle) {
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
        positionMs: 0,
        durationMs: null,
        sourceApp: procName,
        album: null
      }
    }
    return { title: raw, artist: '', isPlaying: true, positionMs: 0, durationMs: null, sourceApp: procName, album: null }
  }

  // SoundCloud: "Stream Title by Artist | Listen …"
  if (windowTitle.includes(' by ') && windowTitle.includes('| Listen')) {
    const stripped = windowTitle.split('| Listen')[0].trim()
    const StrippedWithoutStream = stripped.replace(/^Stream\s+/i, '').trim()
    const byIdx = StrippedWithoutStream.lastIndexOf(' by ')
    if (byIdx > 0) {
      return {
        title: StrippedWithoutStream.slice(0, byIdx).trim(),
        artist: StrippedWithoutStream.slice(byIdx + 4).trim(),
        isPlaying: true,
        positionMs: 0,
        durationMs: null,
        sourceApp: procName,
        album: null
      }
    }
  }

  // Generic "Title - Artist" pattern
  const dashIdx = windowTitle.lastIndexOf(' - ')
  if (dashIdx > 0) {
    const possibleBrowser = windowTitle.slice(dashIdx + 3).trim()
    if (!['Google Chrome', 'Safari', 'Firefox', 'Microsoft Edge', 'Arc', 'Brave Browser', 'Opera'].includes(possibleBrowser)) {
      return {
        title: windowTitle.slice(0, dashIdx).trim(),
        artist: possibleBrowser,
        isPlaying: true,
        positionMs: 0,
        durationMs: null,
        sourceApp: procName,
        album: null
      }
    }
  }

  return null
}

/**
 * Pure parser for the stdout returned by COMBINED_SCRIPT on macOS.
 * Returns { info, isPlaying } or null if no active media was found.
 */
export function parseMacMediaOutput(result) {
  if (!result || typeof result !== 'string') return null
  const trimmed = result.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('SPOTIFY|||')) {
    const parts = trimmed.split('|||')
    if (parts.length >= 5) {
      const durationRaw = parts.length >= 6 ? parseInt(parts[5], 10) : 0
      const isPlaying = parts[4] === 'playing'
      return {
        isPlaying,
        info: {
          title: parts[1],
          artist: parts[2],
          positionMs: parseInt(parts[3], 10) || 0,
          isPlaying,
          durationMs: durationRaw > 0 ? durationRaw : null,
          sourceApp: 'Spotify',
          album: parts.length >= 7 ? parts[6] || null : null
        }
      }
    }
  }

  if (trimmed.startsWith('MUSIC|||')) {
    const parts = trimmed.split('|||')
    if (parts.length >= 5) {
      const durationRaw = parts.length >= 6 ? parseFloat(parts[5]) : 0
      const durationMs = durationRaw > 0 ? Math.round(durationRaw * 1000) : null
      const isPlaying = parts[4] === 'playing'
      return {
        isPlaying,
        info: {
          title: parts[1],
          artist: parts[2],
          positionMs: parseInt(parts[3], 10) || 0,
          isPlaying,
          durationMs,
          sourceApp: 'Music',
          album: parts.length >= 7 ? parts[6] || null : null
        }
      }
    }
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    if (!line.startsWith('BROWSER|||')) continue
    const parts = line.split('|||')
    const procName = parts[1] || ''
    const windowTitle = parts.slice(2).join('|||').trim()
    const info = parseBrowserTitle(procName, windowTitle)
    if (info) {
      return { isPlaying: true, info }
    }
  }

  return null
}

export async function pollMediaInfo(onSongChanged, runner = runAppleScript) {
  const result = await runner(COMBINED_SCRIPT)
  const parsed = parseMacMediaOutput(result)
  if (!parsed) return false
  onSongChanged(parsed.info)
  return parsed.isPlaying
}

export function startMediaBridge(onSongChanged, runner = runAppleScript) {
  stopMediaBridge()
  stopped = false

  const scheduleNext = async () => {
    if (stopped) return
    const isPlaying = await pollMediaInfo(onSongChanged, runner)
    if (stopped) return
    pollTimeout = setTimeout(scheduleNext, isPlaying ? 750 : 2000)
  }

  scheduleNext()
}

export function stopMediaBridge() {
  stopped = true
  if (pollTimeout) {
    clearTimeout(pollTimeout)
    pollTimeout = null
  }
}
