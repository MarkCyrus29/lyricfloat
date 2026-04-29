import { net } from 'electron'

/**
 * Parse LRC-format lyrics into structured lines.
 * Handles [mm:ss.xx] and [mm:ss:xx] timestamps.
 */
function parseLRC(lrcText) {
  const lines = []
  const regex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]\s*(.*)/g
  let match

  while ((match = regex.exec(lrcText)) !== null) {
    const minutes = parseInt(match[1], 10)
    const seconds = parseInt(match[2], 10)
    let centiseconds = parseInt(match[3], 10)
    // If 3 digits, it's milliseconds; otherwise centiseconds
    if (match[3].length === 2) centiseconds *= 10
    const time = minutes * 60 + seconds + centiseconds / 1000
    const text = match[4].trim()
    lines.push({ time, text })
  }

  lines.sort((a, b) => a.time - b.time)
  return lines
}

/**
 * Fetch lyrics from LRCLIB.
 * Returns { synced: boolean, lines: [{ time: number, text: string }] }
 */
export async function getLyrics(title, artist) {
  const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'LyricFloat v1.0.0 (https://github.com/lyricfloat)' }
    })

    if (!response.ok) {
      return { synced: false, lines: [] }
    }

    const data = await response.json()

    // Prefer synced lyrics
    if (data.syncedLyrics) {
      const lines = parseLRC(data.syncedLyrics)
      if (lines.length > 0) {
        return { synced: true, lines }
      }
    }

    // Fall back to plain lyrics with fake timestamps
    if (data.plainLyrics) {
      const rawLines = data.plainLyrics.split('\n').filter((l) => l.trim())
      const lines = rawLines.map((text, i) => ({
        time: i * 4, // ~4 seconds per line as fallback
        text: text.trim()
      }))
      return { synced: false, lines }
    }

    return { synced: false, lines: [] }
  } catch (err) {
    console.error('[LyricsAPI] Fetch error:', err.message)
    return { synced: false, lines: [] }
  }
}
