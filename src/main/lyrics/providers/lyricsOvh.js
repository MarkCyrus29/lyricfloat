import { fetchJson } from '../http.js'

export async function lookup({ candidate, durationMs, durationTrust, signal }) {
  if (!candidate || !candidate.title || !candidate.artist || !candidate.artist.trim()) {
    return []
  }

  const artist = candidate.artist.trim()
  const title = candidate.title.trim()

  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
  const data = await fetchJson(url, { signal })

  if (!data || !data.lyrics || typeof data.lyrics !== 'string') {
    return []
  }

  const lines = data.lyrics
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(text => ({ time: 0, text }))

  if (lines.length === 0) {
    return []
  }

  return [{
    source: 'lyrics.ovh',
    synced: false,
    lines,
    title,
    artist,
    durationMs: null,
    instrumental: false
  }]
}

