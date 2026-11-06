import { classifySource, profileFor } from './sourceProfiles.js'

export const JUNK_TERMS = [
  'official video',
  'official music video',
  'official lyric video',
  'official audio',
  'lyric video',
  'lyrics',
  'audio',
  'hd',
  '4k',
  '1080p',
  'explicit',
  'visualizer',
  'mv',
  'full video',
  'official',
  'live'
]

const BRACKET_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['【', '】'],
  ['「', '」'],
  ['『', '』'],
  ['〔', '〕'],
  ['〈', '〉'],
  ['《', '》']
]

const JUNK_REGEXES = [
  /^official\s+(music\s+)?video$/i,
  /^official\s+(lyric\s+)?video$/i,
  /^official\s+audio$/i,
  /^official\s+visuali[sz]er$/i,
  /^official\s+m\/?v$/i,
  /^m\/?v$/i,
  /^music\s+video$/i,
  /^lyrics?(\s+video)?$/i,
  /^with\s+lyrics$/i,
  /^color\s+coded\s+lyrics$/i,
  /^audio(\s+only)?$/i,
  /^visuali[sz]er$/i,
  /^hd$/i,
  /^4k$/i,
  /^1080p$/i,
  /^explicit$/i,
  /^teaser$/i,
  /^performance\s+(video|ver\.?)$/i,
  /^dance\s+practice$/i,
  /^eng(lish)?\s+sub(s|titles)?$/i,
  /^full\s+(video|song|audio)$/i,
  /^(\d{4}\s+)?remaster(ed)?(\s+\d{4})?$/i,
  /^radio\s+edit$/i,
  /^single\s+version$/i,
  /^album\s+version$/i,
  /^(mono|stereo)(\s+version)?$/i
]

const VERSION_REGEXES = [
  /^(\d{4}\s+)?remaster(ed)?(\s+\d{4})?$/i,
  /^radio\s+edit$/i,
  /^single\s+version$/i,
  /^album\s+version$/i,
  /^(mono|stereo)(\s+version)?$/i
]

const UNBRACKETED_TRAILING_JUNK = [
  /\s+official\s+(music\s+)?video$/i,
  /\s+official\s+(lyric\s+)?video$/i,
  /\s+official\s+audio$/i,
  /\s+official\s+visuali[sz]er$/i,
  /\s+official\s+m\/?v$/i,
  /\s+m\/?v$/i,
  /\s+music\s+video$/i,
  /\s+lyrics?(\s+video)?$/i,
  /\s+audio(\s+only)?$/i,
  /\s+visuali[sz]er$/i,
  /\s+hd$/i,
  /\s+4k$/i,
  /\s+1080p$/i,
  /\s+explicit$/i,
  /\s+teaser$/i,
  /\s+full\s+(video|song|audio)$/i
]

function normalizeStr(str) {
  if (!str || typeof str !== 'string') return ''
  return str.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function cleanQuotes(str) {
  let s = str.trim()
  if ((s.startsWith("'") && s.endsWith("'")) ||
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith('「') && s.endsWith('」')) ||
      (s.startsWith('『') && s.endsWith('』'))) {
    s = s.slice(1, -1).trim()
  }
  return s
}

function removeUnmatchedBrackets(str) {
  let s = str
  for (const [open, close] of BRACKET_PAIRS) {
    let openCount = 0
    let closeCount = 0
    for (const char of s) {
      if (char === open) openCount++
      if (char === close) closeCount++
    }
    if (openCount !== closeCount) {
      if (openCount > closeCount) {
        while (openCount > closeCount) {
          const idx = s.lastIndexOf(open)
          if (idx === -1) break
          s = s.slice(0, idx) + s.slice(idx + 1)
          openCount--
        }
      } else {
        while (closeCount > openCount) {
          const idx = s.indexOf(close)
          if (idx === -1) break
          s = s.slice(0, idx) + s.slice(idx + 1)
          closeCount--
        }
      }
    }
  }
  for (const [open, close] of BRACKET_PAIRS) {
    const escOpen = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`${escOpen}\\s*${escClose}`, 'g'), '')
  }
  return s.replace(/\s+/g, ' ').trim()
}

function isJunkText(text) {
  const t = text.trim()
  if (!t) return false
  return JUNK_REGEXES.some(r => r.test(t))
}

function isVersionText(text) {
  const t = text.trim()
  if (!t) return false
  return VERSION_REGEXES.some(r => r.test(t))
}

function stripJunkBrackets(str) {
  let s = str
  let changed = true
  while (changed) {
    changed = false
    for (const [open, close] of BRACKET_PAIRS) {
      const escOpen = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const reg = new RegExp(`${escOpen}([^${escOpen}${escClose}]+)${escClose}`, 'g')
      s = s.replace(reg, (match, inner) => {
        if (isJunkText(inner)) {
          changed = true
          return ' '
        }
        return match
      })
    }
    s = s.replace(/\s+/g, ' ').trim()
  }
  return s
}

function stripTrailingSeparators(str) {
  let s = str
  let changed = true
  const separators = [' - ', ' – ', ' — ', ' | ', ' // ', ' _ ']
  while (changed) {
    changed = false
    for (const sep of separators) {
      const lastIdx = s.lastIndexOf(sep)
      if (lastIdx > 0) {
        const tail = s.slice(lastIdx + sep.length).trim()
        if (isJunkText(tail) || isVersionText(tail)) {
          s = s.slice(0, lastIdx).trim()
          changed = true
          break
        }
      }
    }
    for (const reg of UNBRACKETED_TRAILING_JUNK) {
      if (reg.test(s)) {
        s = s.replace(reg, '').trim()
        changed = true
      }
    }
  }
  return s
}

function stripFeat(str) {
  let s = str
  s = s.replace(/\s*[\(\[]\s*(?:feat|ft)\.?\s+[^\)\]]+[\)\]]\s*$/i, '')
  s = s.replace(/\s+(?:feat|ft)\.?\s+.+$/i, '')
  return s.trim()
}

function stripVersionSuffixes(str) {
  let s = str
  let changed = true
  while (changed) {
    changed = false
    for (const [open, close] of BRACKET_PAIRS) {
      const escOpen = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const reg = new RegExp(`\\s*${escOpen}([^${escOpen}${escClose}]+)${escClose}\\s*$`, 'i')
      const m = s.match(reg)
      if (m && isVersionText(m[1])) {
        s = s.replace(reg, '').trim()
        changed = true
      }
    }
    const separators = [' - ', ' – ', ' — ']
    for (const sep of separators) {
      const lastIdx = s.lastIndexOf(sep)
      if (lastIdx > 0) {
        const tail = s.slice(lastIdx + sep.length).trim()
        if (isVersionText(tail)) {
          s = s.slice(0, lastIdx).trim()
          changed = true
          break
        }
      }
    }
  }
  return s
}

export function cleanArtistInfo(artist) {
  let a = normalizeStr(artist)
  if (!a) return { clean: '', secondary: '' }

  a = a.replace(/\s*[-–—]\s*topic$/i, '').trim()
  a = a.replace(/(?:\s+vevo|vevo)$/i, '').trim()
  a = a.replace(/\s+official(\s+channel)?$/i, '').trim()

  let secondary = ''
  const parenMatch = a.match(/^(.+?)\s*[\(\[（【「].+?[\)\]）】」]\s*$/)
  if (parenMatch && parenMatch[1].trim()) {
    secondary = parenMatch[1].trim()
  }

  return { clean: a, secondary }
}

export function buildLookupCandidates({ title, artist, album, sourceApp, category }) {
  const normTitle = normalizeStr(title)
  const normArtist = normalizeStr(artist)

  if (!normTitle && !normArtist) {
    return [{ title: '', artist: '' }]
  }

  const cat = category || classifySource(sourceApp)
  const profile = profileFor(cat)

  const { clean: cleanArtist, secondary: secondaryArtist } = cleanArtistInfo(normArtist)

  const candidates = []
  const seen = new Set()

  function addCandidate(t, a) {
    let cleanT = cleanQuotes(removeUnmatchedBrackets(normalizeStr(t)))
    let cleanA = removeUnmatchedBrackets(normalizeStr(a))
    if (!cleanT && !cleanA) return
    const key = `${cleanT.toLowerCase()}|${cleanA.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      candidates.push({ title: cleanT, artist: cleanA })
    }
  }

  if (profile === 'light') {
    const c1Title = stripVersionSuffixes(normTitle)
    addCandidate(c1Title, cleanArtist)

    const c2Title = stripFeat(c1Title)
    if (c2Title !== c1Title) {
      addCandidate(c2Title, cleanArtist)
    }

    addCandidate(normTitle, normArtist)
    addCandidate(c1Title, '')

    return candidates.slice(0, 6)
  }

  // FULL PROFILE (browser / unknown)
  let baseTitle = stripJunkBrackets(normTitle)
  baseTitle = stripTrailingSeparators(baseTitle)
  baseTitle = removeUnmatchedBrackets(baseTitle)

  let liveSuffixRemoved = null
  const liveMatch = baseTitle.match(/^(.*?)\s*[\(\[]\s*live\b[^\)\]]*[\)\]]\s*$/i)
  if (liveMatch && liveMatch[1].trim()) {
    liveSuffixRemoved = liveMatch[1].trim()
  }

  const quoteMatch = baseTitle.match(/^(.+?)\s+['"「『](.+?)['"』」](.*)$/)
  let quotedArtist = null
  let quotedTitle = null
  if (quoteMatch) {
    let leftText = quoteMatch[1].replace(/[-–—|•_]+\s*$/, '').trim()
    const innerTitle = quoteMatch[2].trim()
    const leftParen = leftText.match(/^(.+?)\s*[\(\[（【「].+?[\)\]）】」]\s*$/)
    quotedArtist = leftParen ? leftParen[1].trim() : leftText
    quotedTitle = innerTitle
  }

  const separators = [' - ', ' – ', ' — ', ' _ ']
  let splitResult = null
  for (const sep of separators) {
    const parts = baseTitle.split(sep)
    if (parts.length === 2) {
      const left = parts[0].trim()
      const right = parts[1].trim()
      splitResult = { left, right }
      break
    }
  }

  if (splitResult) {
    const { left, right } = splitResult
    const leftLower = left.toLowerCase()
    const rightLower = right.toLowerCase()
    const artistLower = cleanArtist.toLowerCase()

    const leftMatchesArtist = artistLower && (leftLower === artistLower || leftLower.includes(artistLower) || artistLower.includes(leftLower))
    const rightMatchesArtist = artistLower && (rightLower === artistLower || rightLower.includes(artistLower) || artistLower.includes(rightLower))

    if (leftMatchesArtist && !rightMatchesArtist) {
      addCandidate(right, left)
      if (cleanArtist) addCandidate(right, cleanArtist)
    } else if (rightMatchesArtist && !leftMatchesArtist) {
      addCandidate(left, right)
      if (cleanArtist) addCandidate(left, cleanArtist)
    } else {
      const leftClean = left.replace(/\s*[\(\[（【「].+?[\)\]）】」]\s*$/, '').trim()
      addCandidate(right, leftClean || left)
      addCandidate(left, right)
    }
  }

  if (quotedTitle && quotedArtist) {
    addCandidate(quotedTitle, quotedArtist)
  }

  addCandidate(baseTitle, cleanArtist)
  if (secondaryArtist) {
    addCandidate(baseTitle, secondaryArtist)
  }

  if (liveSuffixRemoved) {
    addCandidate(liveSuffixRemoved, cleanArtist)
    if (secondaryArtist) addCandidate(liveSuffixRemoved, secondaryArtist)
  }

  const noFeatTitle = stripFeat(baseTitle)
  if (noFeatTitle !== baseTitle) {
    addCandidate(noFeatTitle, cleanArtist)
  }

  addCandidate(baseTitle, '')

  return candidates.slice(0, 6)
}

export function cleanTitleInfo(title, artist) {
  const candidates = buildLookupCandidates({ title, artist, sourceApp: 'unknown' })
  if (candidates.length > 0) {
    return {
      cleanTitle: candidates[0].title,
      cleanArtist: candidates[0].artist
    }
  }
  return { cleanTitle: title || '', cleanArtist: artist || '' }
}
