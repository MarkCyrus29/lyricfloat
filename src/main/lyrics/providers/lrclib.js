import { fetchJson } from '../http.js'
import { parseLRC } from '../lrcParser.js'

function toResult(item) {
  if (!item) return null

  const title = item.trackName || item.name || ''
  const artist = item.artistName || ''
  const durationMs = item.duration != null && item.duration > 0 ? Math.round(item.duration * 1000) : null

  if (item.instrumental) {
    return {
      source: 'lrclib',
      synced: false,
      lines: [],
      title,
      artist,
      durationMs,
      instrumental: true
    }
  }

  if (item.syncedLyrics && typeof item.syncedLyrics === 'string') {
    const lines = parseLRC(item.syncedLyrics)
    if (lines.length > 0) {
      return {
        source: 'lrclib',
        synced: true,
        lines,
        title,
        artist,
        durationMs,
        instrumental: false
      }
    }
  }

  if (item.plainLyrics && typeof item.plainLyrics === 'string') {
    const lines = item.plainLyrics
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(text => ({ time: 0, text }))

    return {
      source: 'lrclib',
      synced: false,
      lines,
      title,
      artist,
      durationMs,
      instrumental: false
    }
  }

  return null
}

export async function lookupGet({ candidate, durationMs, durationTrust, signal }) {
  if (!candidate || !candidate.title || !candidate.artist) {
    return []
  }

  const params = new URLSearchParams()
  params.set('track_name', candidate.title)
  params.set('artist_name', candidate.artist)

  if (durationTrust === 'strong' && durationMs != null && durationMs > 0) {
    params.set('duration', Math.round(durationMs / 1000).toString())
  }

  const data = await fetchJson(`https://lrclib.net/api/get?${params.toString()}`, { signal })
  const result = toResult(data)
  return result ? [result] : []
}

export async function lookupSearch({ candidate, durationMs, durationTrust, signal }) {
  if (!candidate || !candidate.title) {
    return []
  }

  const q = `${candidate.artist || ''} ${candidate.title}`.trim()
  if (!q) return []

  const params = new URLSearchParams()
  params.set('q', q)

  const data = await fetchJson(`https://lrclib.net/api/search?${params.toString()}`, { signal })
  if (!Array.isArray(data)) {
    return []
  }

  const results = []
  for (const item of data) {
    const res = toResult(item)
    if (res) results.push(res)
  }
  return results
}

export async function lookup(args) {
  const getResults = await lookupGet(args)
  if (getResults.length > 0) {
    return getResults
  }
  return await lookupSearch(args)
}

