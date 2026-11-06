import { fetchJson } from '../http.js'
import { parseLRC } from '../lrcParser.js'
import { scoreCandidate } from '../matching.js'

export const ENABLED = true

export async function lookup({ candidate, durationMs, durationTrust, signal }) {
  if (!ENABLED || !candidate || !candidate.title) {
    return []
  }

  const query = `${candidate.artist || ''} ${candidate.title}`.trim()
  if (!query) return []

  const searchUrl = `https://music.163.com/api/search/get?s=${encodeURIComponent(query)}&type=1&limit=5`
  const searchData = await fetchJson(searchUrl, { signal })

  if (!searchData || !searchData.result || !Array.isArray(searchData.result.songs)) {
    return []
  }

  const songs = searchData.result.songs
  if (songs.length === 0) {
    return []
  }

  const want = {
    title: candidate.title,
    artist: candidate.artist || '',
    durationMs,
    durationTrust
  }

  const scoredSongs = []
  for (const song of songs) {
    const artistStr = (song.artists && Array.isArray(song.artists))
      ? song.artists.map(a => a.name).filter(Boolean).join(', ')
      : ''

    const got = {
      title: song.name || '',
      artist: artistStr,
      durationMs: song.duration || null
    }

    const score = scoreCandidate(want, got)
    scoredSongs.push({ song, got, score })
  }

  // Sort by score descending and take the best 2 hits
  scoredSongs.sort((a, b) => b.score - a.score)
  const topHits = scoredSongs.slice(0, 2)

  const results = []
  for (const { song, got, score } of topHits) {
    if (signal?.aborted) break

    const lyricUrl = `https://music.163.com/api/song/lyric?id=${song.id}&lv=1`
    const lyricData = await fetchJson(lyricUrl, { signal })

    const lrcText = lyricData?.lrc?.lyric
    if (lrcText && typeof lrcText === 'string') {
      const lines = parseLRC(lrcText)
      if (lines.length > 0) {
        results.push({
          source: 'netease',
          synced: true,
          lines,
          title: got.title,
          artist: got.artist,
          durationMs: got.durationMs,
          instrumental: false,
          score
        })
      }
    }
  }

  return results
}
