import ColorThief from 'colorthief'

/**
 * Fetch album art from iTunes and extract dominant color.
 * Returns rgb string like "rgb(255, 0, 0)" or null.
 */
export async function getAlbumColor(title, artist) {
  try {
    const query = encodeURIComponent(`${title} ${artist}`)
    const url = `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1`
    
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    
    const data = await res.json()
    if (!data.results || data.results.length === 0) return null
    
    const artworkUrl = data.results[0].artworkUrl100
    if (!artworkUrl) return null

    // Fetch image
    const imgRes = await fetch(artworkUrl, { signal: AbortSignal.timeout(5000) })
    if (!imgRes.ok) return null
    const arrayBuffer = await imgRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Extract color directly from buffer
    const color = await ColorThief.getColor(buffer)
    
    if (color && color.length === 3) {
      return `rgb(${color[0]}, ${color[1]}, ${color[2]})`
    }
  } catch (err) {
    console.error('[LyricsAPI] Error getting album color:', err.message)
  }
  return null
}
