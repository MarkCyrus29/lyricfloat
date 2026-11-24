export const TITLE_WEIGHT = 0.55
export const ARTIST_WEIGHT = 0.30
export const DURATION_WEIGHT = 0.15
export const ACCEPT_THRESHOLD = 0.75

export function normalize(s) {
  if (!s || typeof s !== 'string') return ''
  let str = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  str = str.replace(/\([^\)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
  str = str.replace(/[^\p{L}\p{N}\s]/gu, '')
  return str.replace(/\s+/g, ' ').trim()
}

function levenshtein(a, b) {
  if (a.length < b.length) {
    const tmp = a
    a = b
    b = tmp
  }
  const m = a.length
  const n = b.length
  if (n === 0) return m

  // 1D rolling Uint16Array uses O(min(m, n)) memory with zero nested array allocations
  const row = new Uint16Array(n + 1)
  for (let j = 0; j <= n; j++) row[j] = j

  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0]
    row[0] = i
    const chA = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const oldAbove = row[j]
      const cost = chA === b.charCodeAt(j - 1) ? 0 : 1
      const del = oldAbove + 1
      const ins = row[j - 1] + 1
      const sub = prevDiag + cost
      let minVal = del < ins ? del : ins
      if (sub < minVal) minVal = sub
      row[j] = minVal
      prevDiag = oldAbove
    }
  }
  return row[n]
}

export function similarity(a, b) {
  const normA = normalize(a)
  const normB = normalize(b)
  if (normA === normB) return 1
  if (!normA || !normB) return 0
  if ((normA.includes(normB) && normB.length >= 4) || (normB.includes(normA) && normA.length >= 4)) {
    return 1
  }
  const dist = levenshtein(normA, normB)
  const maxLen = Math.max(normA.length, normB.length)
  return Math.max(0, 1 - dist / maxLen)
}

export function scoreCandidate(want, got) {
  if (!want || !got) return 0

  const titleSim = similarity(want.title, got.title)

  let durationScore = 1
  if (want.durationMs != null && got.durationMs != null && want.durationMs > 0 && got.durationMs > 0) {
    const maxDiff = want.durationTrust === 'strong' ? 5000 : 40000
    const diff = Math.abs(want.durationMs - got.durationMs)
    durationScore = Math.max(0, 1 - diff / maxDiff)
  }

  const hasArtist = want.artist && typeof want.artist === 'string' && want.artist.trim() !== ''

  if (!hasArtist) {
    const totalWeight = TITLE_WEIGHT + DURATION_WEIGHT
    const score = (TITLE_WEIGHT / totalWeight) * titleSim + (DURATION_WEIGHT / totalWeight) * durationScore
    return parseFloat(score.toFixed(4))
  }

  const artistSim = similarity(want.artist, got.artist)
  const score = TITLE_WEIGHT * titleSim + ARTIST_WEIGHT * artistSim + DURATION_WEIGHT * durationScore
  return parseFloat(score.toFixed(4))
}
