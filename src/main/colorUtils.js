/**
 * Calculates the text color (black or white) that provides the best contrast
 * for a given RGB background color using the YIQ formula.
 *
 * @param {string} rgbStr - An rgb color string, e.g., "rgb(255, 0, 0)"
 * @returns {string} 'black' or 'white'
 */
export function getTextColorForBackground(rgbStr) {
  if (!rgbStr) return 'white';
  
  const match = rgbStr.match(/\d+/g);
  if (!match || match.length < 3) return 'white';
  
  const r = parseInt(match[0], 10);
  const g = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  
  // Calculate relative luminance using the YIQ formula.
  // The YIQ threshold is usually 128, we use a slightly lower threshold (e.g. 135)
  // to give a bit more bias towards dark text on mid-tone backgrounds
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  
  return (yiq >= 135) ? 'black' : 'white';
}

/**
 * Extracts a dominant vibrant/non-white RGB color from a BGRA/ARGB pixel buffer.
 *
 * @param {Buffer|Uint8Array} bitmap - Raw 4-bytes-per-pixel bitmap
 * @param {boolean} isLittleEndian - True on x86/x64/ARM64 (BGRA), false for big-endian (ARGB)
 * @returns {string|null} "rgb(r, g, b)" or null
 */
export function extractDominantColorFromBitmap(bitmap, isLittleEndian = true) {
  if (!bitmap || bitmap.length < 4) return null

  const pixelCount = (bitmap.length / 4) | 0
  // Single Map of 5-bit RGB bucket -> [weightSum, rSum, gSum, bSum]
  const buckets = new Map()

  let fallbackR = 0
  let fallbackG = 0
  let fallbackB = 0
  let fallbackCount = 0

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4
    let r, g, b, a
    if (isLittleEndian) {
      b = bitmap[offset]
      g = bitmap[offset + 1]
      r = bitmap[offset + 2]
      a = bitmap[offset + 3]
    } else {
      a = bitmap[offset]
      r = bitmap[offset + 1]
      g = bitmap[offset + 2]
      b = bitmap[offset + 3]
    }

    if (a < 125) continue

    fallbackR += r
    fallbackG += g
    fallbackB += b
    fallbackCount++

    // Skip near-white pixels so white album borders don't wash out the dominant color
    if (r > 245 && g > 245 && b > 245) continue

    // 5-bit quantized key (0..31 per channel)
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)

    // Slight weight boost for colorful pixels so black/grey borders don't always dominate
    const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b)
    const minC = r < g ? (r < b ? r : b) : (g < b ? g : b)
    const weight = (maxC - minC) > 25 ? 2 : 1

    const entry = buckets.get(key)
    if (entry) {
      entry[0] += weight
      entry[1] += r * weight
      entry[2] += g * weight
      entry[3] += b * weight
    } else {
      buckets.set(key, [weight, r * weight, g * weight, b * weight])
    }
  }

  if (buckets.size > 0) {
    let bestEntry = null
    let bestScore = -1
    for (const entry of buckets.values()) {
      if (entry[0] > bestScore) {
        bestScore = entry[0]
        bestEntry = entry
      }
    }
    const r = Math.round(bestEntry[1] / bestScore)
    const g = Math.round(bestEntry[2] / bestScore)
    const b = Math.round(bestEntry[3] / bestScore)
    return `rgb(${r}, ${g}, ${b})`
  }

  if (fallbackCount > 0) {
    const r = Math.round(fallbackR / fallbackCount)
    const g = Math.round(fallbackG / fallbackCount)
    const b = Math.round(fallbackB / fallbackCount)
    return `rgb(${r}, ${g}, ${b})`
  }

  return null
}
