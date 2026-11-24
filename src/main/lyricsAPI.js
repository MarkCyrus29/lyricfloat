import os from 'os'
import { nativeImage } from 'electron'
import { extractDominantColorFromBitmap } from './colorUtils.js'

const IS_LITTLE_ENDIAN = os.endianness() === 'LE'
const COLOR_CACHE_MAX = 200
const colorCache = new Map()

function getCachedColor(key) {
  if (!colorCache.has(key)) return undefined
  const val = colorCache.get(key)
  colorCache.delete(key)
  colorCache.set(key, val)
  return val
}

function setCachedColor(key, val) {
  if (colorCache.has(key)) colorCache.delete(key)
  colorCache.set(key, val)
  if (colorCache.size > COLOR_CACHE_MAX) {
    const oldestKey = colorCache.keys().next().value
    if (oldestKey !== undefined) colorCache.delete(oldestKey)
  }
}

/**
 * Fetch album art from iTunes and extract dominant color using Chromium's nativeImage.
 * Returns rgb string like "rgb(255, 0, 0)" or null.
 */
export async function getAlbumColor(title, artist, { signal } = {}) {
  const cacheKey = `${(title || '').trim().toLowerCase()}|${(artist || '').trim().toLowerCase()}`
  const cached = getCachedColor(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  try {
    const query = encodeURIComponent(`${title || ''} ${artist || ''}`.trim())
    if (!query) return null

    const url = `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1`
    const timeoutSignal = AbortSignal.timeout(5000)
    const combinedSignal = signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeoutSignal])
      : (signal || timeoutSignal)

    const res = await fetch(url, { signal: combinedSignal })
    if (!res.ok) {
      await res.body?.cancel?.()
      return null
    }

    const data = await res.json()
    if (!data.results || data.results.length === 0) {
      setCachedColor(cacheKey, null)
      return null
    }

    const artworkUrl = data.results[0].artworkUrl100
    if (!artworkUrl) {
      setCachedColor(cacheKey, null)
      return null
    }

    const imgTimeoutSignal = AbortSignal.timeout(5000)
    const imgSignal = signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, imgTimeoutSignal])
      : (signal || imgTimeoutSignal)

    const imgRes = await fetch(artworkUrl, { signal: imgSignal })
    if (!imgRes.ok) {
      await imgRes.body?.cancel?.()
      return null
    }

    const arrayBuffer = await imgRes.arrayBuffer()
    if (signal?.aborted) return null

    const buffer = Buffer.from(arrayBuffer)
    const img = nativeImage.createFromBuffer(buffer)
    if (img.isEmpty()) return null

    // Downscale to 24x24 in native C++ Skia so JS scans only 576 pixels
    const resized = img.resize({ width: 24, height: 24, quality: 'good' })
    const color = extractDominantColorFromBitmap(resized.toBitmap(), IS_LITTLE_ENDIAN)

    setCachedColor(cacheKey, color)
    return color
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('[LyricsAPI] Error getting album color:', err.message)
    }
  }
  return null
}
