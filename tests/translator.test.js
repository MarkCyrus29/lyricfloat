import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectLocalLanguageHint,
  normalizeLangCode,
  enrichLyricsWithTranslation
} from '../src/main/lyrics/translator.js'

describe('translator', () => {
  it('normalizes language codes consistently', () => {
    assert.equal(normalizeLangCode('en-US'), 'en')
    assert.equal(normalizeLangCode('fil'), 'tl')
    assert.equal(normalizeLangCode('tl-PH'), 'tl')
    assert.equal(normalizeLangCode('ja'), 'ja')
    assert.equal(normalizeLangCode('zh-TW'), 'zh-tw')
    assert.equal(normalizeLangCode('zh-CN'), 'zh-cn')
  })

  it('detects Japanese lyrics from Hiragana/Katakana', () => {
    const lines = [
      { text: '夜に駆ける' },
      { text: '沈むように溶けてゆくように' }
    ]
    assert.equal(detectLocalLanguageHint(lines), 'ja')
  })

  it('detects Romanized Japanese (Romaji) lyrics', () => {
    const lines = [
      { text: 'Shizumu youni tokete yuku youni' },
      { text: 'Futari dake no sora ga hirogaru yoru ni' },
      { text: 'Sayonara dake datta sono hitokoto de subete ga wakatta' }
    ]
    assert.equal(detectLocalLanguageHint(lines), 'ja')
  })

  it('detects Korean lyrics from Hangul', () => {
    const lines = [
      { text: '사랑은 은하수 다방 문 앞에서' },
      { text: '홍차와 냉커피를 마시며' }
    ]
    assert.equal(detectLocalLanguageHint(lines), 'ko')
  })

  it('detects Filipino / Tagalog lyrics (including Taglish)', () => {
    const lines = [
      { text: 'Bakit hindi mo sinabi sa akin' },
      { text: 'Ikaw lang ang mahal ko sa buhay na ito' },
      { text: 'Baby I still remember everything' }
    ]
    assert.equal(detectLocalLanguageHint(lines), 'tl')
  })

  it('returns null for plain English lyrics so Google Translate auto-detects Latin languages', () => {
    const lines = [
      { text: 'I have this thing where I get older but just never wiser' },
      { text: 'Midnights become my afternoons' }
    ]
    assert.equal(detectLocalLanguageHint(lines), null)
  })

  it('enriches Japanese and Taglish songs when preferredLanguage is en, and hides button for English songs', async () => {
    const origFetch = globalThis.fetch
    try {
      const dictionary = {
        '夜に駆ける': 'Racing into the night',
        '沈むように溶けてゆくように': 'Like sinking, like melting away',
        'Bakit ngayon ka lang': 'Why are you only here now',
        'Ikaw ang mahal ko': 'You are my love',
        'Hello world': 'こんにちは世界',
        'I love this song': '私はこの曲が大好きです'
      }

      globalThis.fetch = async (url, opts) => {
        const parsedUrl = new URL(url)
        const tl = parsedUrl.searchParams.get('tl')
        const bodyParams = new URLSearchParams(opts?.body || '')
        const q = bodyParams.get('q') || ''
        const inputLines = q.split('\n')

        let src = 'en'
        if (q.includes('夜') || q.includes('沈')) src = 'ja'
        else if (q.includes('Bakit') || q.includes('mahal')) src = 'tl'

        const outLines = inputLines.map(line => {
          if (tl === 'en') {
            return dictionary[line] || line
          }
          if (tl === 'ja') {
            return dictionary[line] || line
          }
          return line
        })

        return {
          ok: true,
          json: async () => ({
            sentences: [{ trans: outLines.join('\n'), orig: q }],
            src
          })
        }
      }

      // 1. Japanese song -> preferredLanguage 'en' => needsTranslation: true
      const jaLyrics = {
        synced: true,
        lines: [
          { time: 1, text: '夜に駆ける' },
          { time: 5, text: '沈むように溶けてゆくように' }
        ],
        instrumental: false
      }
      const enrichedJa = await enrichLyricsWithTranslation(jaLyrics, 'en')
      assert.equal(enrichedJa.needsTranslation, true)
      assert.equal(enrichedJa.lines[0].translation, 'Racing into the night')
      assert.equal(enrichedJa.lines[1].translation, 'Like sinking, like melting away')

      // 2. Taglish song -> preferredLanguage 'en' => needsTranslation: true, English line has null translation
      const tlLyrics = {
        synced: true,
        lines: [
          { time: 1, text: 'Bakit ngayon ka lang' },
          { time: 4, text: 'Ikaw ang mahal ko' },
          { time: 8, text: 'Baby I miss you' }
        ],
        instrumental: false
      }
      const enrichedTl = await enrichLyricsWithTranslation(tlLyrics, 'en')
      assert.equal(enrichedTl.needsTranslation, true)
      assert.equal(enrichedTl.lines[0].translation, 'Why are you only here now')
      assert.equal(enrichedTl.lines[1].translation, 'You are my love')
      assert.equal(enrichedTl.lines[2].translation, null)

      // 3. English song -> preferredLanguage 'en' => needsTranslation: false
      const enLyrics = {
        synced: true,
        lines: [
          { time: 1, text: 'Hello world' },
          { time: 4, text: 'I love this song' }
        ],
        instrumental: false
      }
      const enrichedEn = await enrichLyricsWithTranslation(enLyrics, 'en')
      assert.equal(enrichedEn.needsTranslation, false)

      // 4. English song -> preferredLanguage 'ja' => needsTranslation: true
      const enrichedEnToJa = await enrichLyricsWithTranslation(enLyrics, 'ja')
      assert.equal(enrichedEnToJa.needsTranslation, true)
      assert.equal(enrichedEnToJa.lines[0].translation, 'こんにちは世界')
      assert.equal(enrichedEnToJa.lines[1].translation, '私はこの曲が大好きです')
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
