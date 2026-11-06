import { classifySource } from '../sourceProfiles.js'
import { scoreCandidate, ACCEPT_THRESHOLD } from './matching.js'
import { getCachedLyrics, setCachedLyrics } from './cache.js'
import * as lrclib from './providers/lrclib.js'
import * as netease from './providers/netease.js'
import * as lyricsOvh from './providers/lyricsOvh.js'

const MAX_REQUESTS_PER_SONG = 12

export async function getLyricsForSong(info, candidates, { signal } = {}) {
  const notFound = { synced: false, lines: [], source: null, instrumental: false }
  if (!info || !info.title) {
    return notFound
  }

  const category = classifySource(info.sourceApp)
  const durationTrust = (category === 'spotify' || category === 'apple-music' || category === 'local-player')
    ? 'strong'
    : 'weak'

  // 1. Check cache first
  const cached = getCachedLyrics(info.title, info.artist, category)
  if (cached) {
    return cached
  }

  let requestCount = 0
  const canRequest = () => !signal?.aborted && requestCount < MAX_REQUESTS_PER_SONG

  let bestPlain = null
  let bestPlainScore = 0

  function evaluateResult(res, candidate) {
    if (!res) return null

    const want = {
      title: candidate.title,
      artist: candidate.artist || '',
      durationMs: info.durationMs,
      durationTrust
    }

    const got = {
      title: res.title || candidate.title,
      artist: res.artist || candidate.artist || '',
      durationMs: res.durationMs || null
    }

    const score = res.score != null ? res.score : scoreCandidate(want, got)
    if (score < ACCEPT_THRESHOLD) {
      return null
    }

    if (res.instrumental) {
      return {
        synced: false,
        lines: [],
        source: res.source,
        instrumental: true
      }
    }

    if (res.synced && res.lines && res.lines.length > 0) {
      return {
        synced: true,
        lines: res.lines,
        source: res.source,
        instrumental: false
      }
    }

    if (!res.synced && res.lines && res.lines.length > 0) {
      if (score > bestPlainScore) {
        bestPlainScore = score
        bestPlain = {
          synced: false,
          lines: res.lines,
          source: res.source,
          instrumental: false
        }
      }
    }

    return null
  }

  const cands = (candidates && candidates.length > 0) ? candidates : [{ title: info.title, artist: info.artist }]

  // Stage 1: LRCLIB /api/get for candidates[0]
  if (canRequest() && cands[0] && cands[0].artist) {
    requestCount++
    try {
      const results = await lrclib.lookupGet({
        candidate: cands[0],
        durationMs: info.durationMs,
        durationTrust,
        signal
      })
      for (const res of results) {
        const accepted = evaluateResult(res, cands[0])
        if (accepted && (accepted.synced || accepted.instrumental)) {
          setCachedLyrics(info.title, info.artist, category, accepted)
          return accepted
        }
      }
    } catch (e) {}
  }

  // Stage 2: LRCLIB /api/search for the first 3 candidates (sequentially)
  const searchCands = cands.slice(0, 3)
  for (const cand of searchCands) {
    if (!canRequest()) break
    requestCount++
    try {
      const results = await lrclib.lookupSearch({
        candidate: cand,
        durationMs: info.durationMs,
        durationTrust,
        signal
      })
      for (const res of results) {
        const accepted = evaluateResult(res, cand)
        if (accepted && (accepted.synced || accepted.instrumental)) {
          setCachedLyrics(info.title, info.artist, category, accepted)
          return accepted
        }
      }
    } catch (e) {}
  }

  // Stage 3: NetEase for the first 2 candidates
  if (netease.ENABLED) {
    const neteaseCands = cands.slice(0, 2)
    for (const cand of neteaseCands) {
      if (!canRequest()) break
      // Note: netease lookup performs 1 search + up to 2 lyric fetches (<= 3 requests)
      requestCount++
      try {
        const results = await netease.lookup({
          candidate: cand,
          durationMs: info.durationMs,
          durationTrust,
          signal
        })
        for (const res of results) {
          const accepted = evaluateResult(res, cand)
          if (accepted && (accepted.synced || accepted.instrumental)) {
            setCachedLyrics(info.title, info.artist, category, accepted)
            return accepted
          }
        }
      } catch (e) {}
    }
  }

  // Stage 4: lyrics.ovh for the first 2 candidates that have a non-empty artist
  const ovhCands = cands.filter(c => c.artist && c.artist.trim()).slice(0, 2)
  for (const cand of ovhCands) {
    if (!canRequest()) break
    requestCount++
    try {
      const results = await lyricsOvh.lookup({
        candidate: cand,
        durationMs: info.durationMs,
        durationTrust,
        signal
      })
      for (const res of results) {
        evaluateResult(res, cand)
      }
    } catch (e) {}
  }

  // If a plain lyric result was accepted
  if (bestPlain) {
    setCachedLyrics(info.title, info.artist, category, bestPlain)
    return bestPlain
  }

  // Cache miss (only if not aborted)
  if (!signal?.aborted) {
    setCachedLyrics(info.title, info.artist, category, notFound)
  }

  return notFound
}

