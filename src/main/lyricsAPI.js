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

import ColorThief from 'colorthief'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync } from 'fs'

/**
 * Fetch album art from iTunes and extract dominant color.
 * Returns rgb string like "rgb(255, 0, 0)" or null.
 */
export async function getAlbumColor(title, artist) {
  try {
    const query = encodeURIComponent(`${title} ${artist}`)
    const url = `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1`
    
    const res = await fetch(url)
    if (!res.ok) return null
    
    const data = await res.json()
    if (!data.results || data.results.length === 0) return null
    
    const artworkUrl = data.results[0].artworkUrl100
    if (!artworkUrl) return null

    // Fetch image
    const imgRes = await fetch(artworkUrl)
    if (!imgRes.ok) return null
    const arrayBuffer = await imgRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Save to temp file
    const tmpPath = join(tmpdir(), `lyricfloat_art_${Date.now()}.jpg`)
    writeFileSync(tmpPath, buffer)
    
    // Extract color
    const color = await ColorThief.getColor(tmpPath)
    
    // Cleanup
    try { unlinkSync(tmpPath) } catch(e) {}
    
    if (color && color.length === 3) {
      return `rgb(${color[0]}, ${color[1]}, ${color[2]})`
    }
  } catch (err) {
    console.error('[LyricsAPI] Error getting album color:', err.message)
  }
  return null
}

/**
 * Fetch lyrics from LRCLIB.
 * Returns { synced: boolean, lines: [{ time: number, text: string }] }
 */
export async function getLyrics(title, artist) {
  const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'LyricFloat v1.1.0 (https://github.com/lyricfloat)' }
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
