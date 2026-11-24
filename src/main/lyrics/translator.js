const TRANSLATION_CACHE_MAX = 100
const translationCache = new Map()

// Expanded Filipino / Tagalog lexicon (covers common OPM & Taglish vocabulary)
const TAGALOG_MARKERS = new Set([
  'ang', 'mga', 'sa', 'na', 'ng', 'nang', 'ay', 'ko', 'mo', 'ka',
  'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan',
  'iyon', 'dito', 'diyan', 'doon', 'hindi', 'huwag', 'wala', 'walang',
  'may', 'meron', 'mayroon', 'bakit', 'paano', 'kailan', 'saan', 'sino', 'ano',
  'anong', 'pero', 'kasi', 'kaya', 'kahit', 'kung', 'kapag', 'upang', 'para',
  'parang', 'lang', 'lamang', 'naman', 'pala', 'ba', 'din', 'rin', 'daw', 'raw',
  'po', 'opo', 'mahal', 'puso', 'pusong', 'buhay', 'mundo', 'gabi', 'araw',
  'isip', 'sinta', 'pagibig', 'hanggang', 'muli', 'parin', 'aking', 'akin',
  'iyong', 'iyo', 'kanyang', 'amin', 'atin', 'ating', 'inyo', 'kanila', 'lahat',
  'bawat', 'sarili', 'mata', 'luha', 'ngiti', 'kamay', 'yakap', 'halik',
  'tadhana', 'panahon', 'alaala', 'panaginip', 'bituin', 'langit', 'ulan',
  'hangin', 'dagat', 'daan', 'ulit', 'ngayon', 'bukas', 'kahapon', 'dati',
  'lagi', 'palagi', 'minsan', 'bigla', 'tulad', 'katulad', 'kasama', 'iwan',
  'balik', 'dating', 'tingin', 'ramdam', 'damdamin', 'sakit', 'saya', 'takot',
  'pagod', 'kulang', 'sobra', 'tama', 'mali', 'tunay', 'totoo', 'wag',
  'di', 'ba\'t', 'sayo', 'sa\'yo', 'ko\'y', 'mo\'y', 'ako\'y', 'ika\'y',
  'kita', 'nila', 'natin', 'namin', 'niya', 'kanino', 'ganito', 'ganyan',
  'ganoon', 'siguro', 'baka', 'sana', 'sakali', 'muna', 'tuloy', 'pa', 'na'
])

// Distinctive Tagalog words that almost never appear in English lyrics
const STRONG_TAGALOG_MARKERS = new Set([
  'mga', 'ng', 'nang', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila',
  'hindi', 'huwag', 'walang', 'bakit', 'paano', 'kailan', 'kahit', 'kapag',
  'naman', 'mahal', 'puso', 'buhay', 'pagibig', 'hanggang', 'aking', 'iyong',
  'lahat', 'ngayon', 'bukas', 'kahapon', 'palagi', 'kasama', 'damdamin',
  'tadhana', 'alaala', 'panaginip', 'bituin', 'langit', 'sana', 'siguro',
  'kita', 'natin', 'namin', 'niya', 'sayo', 'kasi', 'parang', 'tulad'
])

// Distinctive Romaji Japanese words for Romanized J-Pop lyrics on LRCLIB/Spotify
const ROMAJI_JAPANESE_MARKERS = new Set([
  'kimi', 'boku', 'watashi', 'kokoro', 'hikari', 'yume', 'namida', 'sekai',
  'kotoba', 'ashita', 'yoru', 'kaze', 'sora', 'hana', 'toki', 'omoi',
  'aishiteru', 'sayonara', 'arigatou', 'doko', 'dare', 'nani', 'kedo',
  'kara', 'made', 'datte', 'kitto', 'zutto', 'motto', 'sotto', 'janai',
  'desu', 'masu', 'shite', 'datta', 'nara', 'dakara', 'keredo', 'mitai',
  'youni', 'koto', 'mono', 'naka', 'futari', 'hitori', 'egao', 'koe',
  'mune', 'kisetsu', 'kioku', 'mirai', 'kako', 'unmei', 'kiseki', 'tsubasa',
  'kanashimi', 'yorokobi', 'itami', 'yasashii', 'tsuyoku', 'hontou', 'uso'
])

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'tl', label: 'Filipino (Tagalog)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'es', label: 'Spanish' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'id', label: 'Indonesian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'th', label: 'Thai' }
]

export function normalizeLangCode(code) {
  if (!code || typeof code !== 'string') return 'en'
  const lower = code.trim().toLowerCase()
  if (lower === 'fil' || lower === 'tl' || lower.startsWith('tl-') || lower.startsWith('fil-')) return 'tl'
  if (lower === 'zh-tw' || lower === 'zh-hant' || lower === 'zh-hk') return 'zh-tw'
  if (lower.startsWith('zh')) return 'zh-cn'
  if (lower === 'iw') return 'he'
  if (lower === 'jw') return 'jv'
  return lower.split('-')[0]
}

/**
 * Local script & lexicon heuristic detector for fast and offline-safe language hints.
 * Detects Japanese (Kana or Romaji), Korean (Hangul), Chinese (Han), Russian (Cyrillic),
 * Thai, and Filipino/Tagalog (including Taglish), or null if indeterminate Latin/other.
 */
export function detectLocalLanguageHint(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null
  const text = lines.map(l => (typeof l === 'string' ? l : l?.text || '')).join(' ')
  if (!text.trim()) return null

  let kanaCount = 0
  let hangulCount = 0
  let hanCount = 0
  let cyrillicCount = 0
  let thaiCount = 0
  let latinCount = 0

  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if ((cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x31f0 && cp <= 0x31ff)) {
      kanaCount++
    } else if ((cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0x1100 && cp <= 0x11ff)) {
      hangulCount++
    } else if (cp >= 0x4e00 && cp <= 0x9fff) {
      hanCount++
    } else if (cp >= 0x0400 && cp <= 0x04ff) {
      cyrillicCount++
    } else if (cp >= 0x0e00 && cp <= 0x0e7f) {
      thaiCount++
    } else if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a)) {
      latinCount++
    }
  }

  if (kanaCount >= 2) return 'ja'
  if (hangulCount >= 2) return 'ko'
  if (hanCount >= 4 && kanaCount === 0 && hangulCount === 0) return 'zh-CN'
  if (cyrillicCount >= 4) return 'ru'
  if (thaiCount >= 4) return 'th'

  if (latinCount > 8) {
    const words = text.toLowerCase().match(/[a-z']+/g) || []
    if (words.length >= 4) {
      let tlHits = 0
      let strongTlHits = 0
      const uniqueTl = new Set()
      const uniqueRomaji = new Set()

      for (const rawW of words) {
        const w = rawW.replace(/^'+|'+$/g, '')
        if (TAGALOG_MARKERS.has(w)) {
          tlHits++
          uniqueTl.add(w)
        }
        if (STRONG_TAGALOG_MARKERS.has(w)) {
          strongTlHits++
        }
        if (ROMAJI_JAPANESE_MARKERS.has(w)) {
          uniqueRomaji.add(w)
        }
      }

      if (strongTlHits >= 2 || uniqueTl.size >= 3 || (words.length >= 8 && tlHits / words.length >= 0.08)) {
        return 'tl'
      }

      if (uniqueRomaji.size >= 3) {
        return 'ja'
      }
    }
  }

  return null
}

function normalizeForComparison(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function getCachedTranslation(key) {
  if (!translationCache.has(key)) return undefined
  const val = translationCache.get(key)
  translationCache.delete(key)
  translationCache.set(key, val)
  return val
}

function setCachedTranslation(key, val) {
  if (translationCache.has(key)) translationCache.delete(key)
  translationCache.set(key, val)
  if (translationCache.size > TRANSLATION_CACHE_MAX) {
    const oldest = translationCache.keys().next().value
    if (oldest !== undefined) translationCache.delete(oldest)
  }
}

function makeTimeoutSignal(signal, ms = 6000) {
  const timeoutSignal = AbortSignal.timeout(ms)
  return signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([signal, timeoutSignal])
    : signal || timeoutSignal
}

/**
 * Queries Google Translate's `translate_a/single` via POST (with `dj=1` structured JSON)
 * so multi-byte Japanese/Korean/Tagalog payloads never hit GET URL length limits.
 * Falls back to `clients5.google.com/translate_a/t` if needed.
 *
 * @param {string} text
 * @param {string} targetLang
 * @param {string} sourceLang
 * @param {{ signal?: AbortSignal }} options
 * @returns {Promise<{ translatedText: string, detectedLang: string | null } | null>}
 */
async function requestGoogleTranslate(text, targetLang, sourceLang = 'auto', { signal } = {}) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLang,
    tl: targetLang,
    dt: 't',
    dj: '1'
  })
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`
  const body = new URLSearchParams({ q: text }).toString()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0'
      },
      body,
      signal: makeTimeoutSignal(signal, 6000)
    })

    if (res.ok) {
      const data = await res.json()
      // dj=1 format: { sentences: [{ trans, orig }], src: "ja" }
      if (data && Array.isArray(data.sentences)) {
        const translatedText = data.sentences
          .map(s => (typeof s?.trans === 'string' ? s.trans : ''))
          .join('')
        const detectedLang = typeof data.src === 'string' ? data.src : null
        return { translatedText, detectedLang }
      }
      // Fallback array format: [[[trans, orig], ...], null, "ja"]
      if (Array.isArray(data?.[0])) {
        const translatedText = data[0].map(seg => seg?.[0] || '').join('')
        const detectedLang = typeof data?.[2] === 'string' ? data[2] : null
        return { translatedText, detectedLang }
      }
    } else {
      await res.body?.cancel?.()
    }
  } catch (err) {
    if (err?.name === 'AbortError' && signal?.aborted) return null
  }

  // Fallback endpoint: clients5.google.com
  try {
    const fbUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(
      sourceLang
    )}&tl=${encodeURIComponent(targetLang)}`
    const res = await fetch(fbUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0'
      },
      body,
      signal: makeTimeoutSignal(signal, 6000)
    })
    if (!res.ok) {
      await res.body?.cancel?.()
      return null
    }
    const data = await res.json()
    if (data && Array.isArray(data.sentences)) {
      const translatedText = data.sentences.map(s => s?.trans || '').join('')
      const detectedLang = typeof data.src === 'string' ? data.src : null
      return { translatedText, detectedLang }
    }
    if (Array.isArray(data)) {
      const first = data[0]
      if (typeof first === 'string') {
        return { translatedText: first, detectedLang: null }
      }
      if (Array.isArray(first)) {
        return {
          translatedText: first[0] || '',
          detectedLang: typeof first[1] === 'string' ? first[1] : null
        }
      }
    }
  } catch {}

  return null
}

/**
 * Translates a small batch of lines (8 lines per chunk) and guarantees exact 1-to-1 line alignment.
 * If Google Translate merges any newline across lines, falls back to translating the lines
 * in that chunk individually so lines never shift or misalign.
 */
async function translateChunkAligned(chunk, targetLang, sourceLang, { signal } = {}) {
  const joined = chunk.join('\n')
  const batchRes = await requestGoogleTranslate(joined, targetLang, sourceLang, { signal })
  const lineMap = new Map()
  let detectedLang = batchRes?.detectedLang || null

  if (batchRes && batchRes.translatedText) {
    const split = batchRes.translatedText.split(/\r?\n/)
    if (split.length === chunk.length) {
      for (let i = 0; i < chunk.length; i++) {
        const trans = split[i].trim()
        if (trans) {
          lineMap.set(chunk[i], trans)
        }
      }
      return { lineMap, detectedLang }
    }
  }

  // Fallback when Google merged newlines in an unpunctuated stanza: translate each line in the chunk
  const singleResults = await Promise.all(
    chunk.map(async line => {
      if (signal?.aborted) return null
      const res = await requestGoogleTranslate(line, targetLang, sourceLang, { signal })
      return { line, res }
    })
  )

  for (const item of singleResults) {
    if (!item?.res) continue
    if (!detectedLang && item.res.detectedLang) {
      detectedLang = item.res.detectedLang
    }
    const trans = item.res.translatedText?.trim()
    if (trans) {
      lineMap.set(item.line, trans)
    }
  }

  return { lineMap, detectedLang }
}

/**
 * Translates all unique lyric lines with bounded concurrency and smart mixed-language (Taglish/J-Pop) retry.
 */
async function translateAllLines(uniqueTexts, targetLang, localHint, targetNorm, { signal } = {}) {
  const translations = new Map()
  const detectedLangCounts = new Map()

  const CHUNK_SIZE = 8
  const chunks = []
  for (let i = 0; i < uniqueTexts.length; i += CHUNK_SIZE) {
    chunks.push(uniqueTexts.slice(i, i + CHUNK_SIZE))
  }

  const initialSourceLang =
    localHint && normalizeLangCode(localHint) !== targetNorm ? localHint : 'auto'

  const untriedAutoChunks = []

  // Process chunks with concurrency of 3
  const CONCURRENCY = 3
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    if (signal?.aborted) break
    const slice = chunks.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      slice.map(chunk =>
        translateChunkAligned(chunk, targetLang, initialSourceLang, { signal })
      )
    )

    for (let j = 0; j < results.length; j++) {
      const { lineMap, detectedLang } = results[j]
      const chunk = slice[j]
      for (const [orig, trans] of lineMap.entries()) {
        translations.set(orig, trans)
      }
      // Only count language detection from chunks with real lyric content (not just "oh yeah / la la")
      if (detectedLang) {
        const chunkWords = chunk.join(' ').toLowerCase().match(/[a-z\u00C0-\u024F\u0400-\u04FF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]+/g) || []
        const nonFiller = chunkWords.filter(
          w => !['oh', 'ooh', 'yeah', 'la', 'na', 'ah', 'uh', 'mm', 'mmm', 'hey', 'woah', 'whoa', 'ha', 'ba', 'da'].includes(w)
        )
        if (nonFiller.length >= 3) {
          const norm = normalizeLangCode(detectedLang)
          detectedLangCounts.set(norm, (detectedLangCounts.get(norm) || 0) + 1)
          if (initialSourceLang === 'auto' && norm === targetNorm) {
            untriedAutoChunks.push(chunk)
          }
        }
      }
    }
  }

  // Determine if any foreign (non-target) language was detected across the chunks
  let dominantForeignLang = localHint && normalizeLangCode(localHint) !== targetNorm ? localHint : null
  if (!dominantForeignLang) {
    let bestCount = 0
    for (const [lang, count] of detectedLangCounts.entries()) {
      if (lang !== targetNorm && count > bestCount) {
        bestCount = count
        dominantForeignLang = lang
      }
    }
  }

  // If the song is mixed-language (e.g. Taglish where some chunks were classified as 'en' under sl=auto
  // while other chunks were classified as 'tl'), re-translate the 'en'-classified chunks with sl=dominantForeignLang
  // so Tagalog lines inside mixed chunks also get translated!
  if (dominantForeignLang && untriedAutoChunks.length > 0 && !signal?.aborted) {
    for (let i = 0; i < untriedAutoChunks.length; i += CONCURRENCY) {
      if (signal?.aborted) break
      const slice = untriedAutoChunks.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        slice.map(chunk =>
          translateChunkAligned(chunk, targetLang, dominantForeignLang, { signal })
        )
      )
      for (const { lineMap } of results) {
        for (const [orig, trans] of lineMap.entries()) {
          translations.set(orig, trans)
        }
      }
    }
  }

  // Pick overall detected language (prefer foreign language if present, otherwise most common detected)
  let primaryDetected = dominantForeignLang
  if (!primaryDetected) {
    let maxC = 0
    for (const [lang, count] of detectedLangCounts.entries()) {
      if (count > maxC) {
        maxC = count
        primaryDetected = lang
      }
    }
  }

  return { translations, detectedLang: primaryDetected }
}

/**
 * Enriches a lyrics object with line-by-line translations and `needsTranslation` metadata
 * relative to the user's preferredLanguage.
 */
export async function enrichLyricsWithTranslation(lyrics, preferredLanguage = 'en', { signal } = {}) {
  if (!lyrics || !Array.isArray(lyrics.lines) || lyrics.lines.length === 0 || lyrics.instrumental) {
    return { ...lyrics, needsTranslation: false, detectedLanguage: null }
  }

  const targetNorm = normalizeLangCode(preferredLanguage)
  const localHint = detectLocalLanguageHint(lyrics.lines)

  // Deduplicate non-empty lyric lines so repeated chorus lines are only translated once
  const uniqueTexts = []
  const seen = new Set()
  for (const line of lyrics.lines) {
    const t = line.text?.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      uniqueTexts.push(t)
    }
  }

  if (uniqueTexts.length === 0) {
    return { ...lyrics, needsTranslation: false, detectedLanguage: null }
  }

  const cacheKey = `v2|${targetNorm}|${uniqueTexts.slice(0, 12).join('||')}|${uniqueTexts.length}`
  const cached = getCachedTranslation(cacheKey)
  if (cached) {
    return cached
  }

  try {
    const { translations, detectedLang } = await translateAllLines(
      uniqueTexts,
      preferredLanguage,
      localHint,
      targetNorm,
      { signal }
    )

    if (signal?.aborted) {
      return { ...lyrics, needsTranslation: false, detectedLanguage: null }
    }

    const effectiveDetected = localHint || detectedLang || 'en'
    const detectedNorm = normalizeLangCode(effectiveDetected)

    let changedLinesCount = 0
    const enrichedLines = lyrics.lines.map(line => {
      const orig = line.text?.trim() || ''
      if (!orig) {
        return { ...line, translation: null }
      }
      const trans = translations.get(orig) || null
      if (!trans) {
        return { ...line, translation: null }
      }

      const normOrig = normalizeForComparison(orig)
      const normTrans = normalizeForComparison(trans)
      if (!normTrans || normOrig === normTrans) {
        return { ...line, translation: null }
      }

      changedLinesCount++
      return { ...line, translation: trans }
    })

    // Only mark as needing translation when a non-preferred language was actually detected
    // (either via local script/lexicon hint or Google Translate's chunk language detection)
    const isDifferentLang =
      detectedNorm !== targetNorm && changedLinesCount > 0

    const result = {
      ...lyrics,
      lines: isDifferentLang
        ? enrichedLines
        : lyrics.lines.map(l => ({ ...l, translation: null })),
      needsTranslation: Boolean(isDifferentLang && changedLinesCount > 0),
      detectedLanguage: effectiveDetected
    }

    console.log(
      `[LyricFloat] Translation (${effectiveDetected} -> ${preferredLanguage}): ${changedLinesCount}/${lyrics.lines.length} lines translated (needsTranslation=${result.needsTranslation})`
    )

    // Only cache when we actually got responses from the translation API
    if (translations.size > 0) {
      setCachedTranslation(cacheKey, result)
    }
    return result
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('[LyricFloat translator] translation failed:', err.message)
    }
    return { ...lyrics, needsTranslation: false, detectedLanguage: localHint }
  }
}
