import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildLookupCandidates, cleanTitleInfo } from '../src/main/titleCleaner.js'
import { classifySource, profileFor } from '../src/main/sourceProfiles.js'

describe('sourceProfiles', () => {
  it('classifies known sources correctly', () => {
    assert.equal(classifySource('Spotify.exe'), 'spotify')
    assert.equal(classifySource('Music'), 'apple-music')
    assert.equal(classifySource('iTunes'), 'apple-music')
    assert.equal(classifySource('Google Chrome'), 'browser')
    assert.equal(classifySource('msedge.exe'), 'browser')
    assert.equal(classifySource('firefox'), 'browser')
    assert.equal(classifySource('vlc.exe'), 'local-player')
    assert.equal(classifySource('foobar2000'), 'local-player')
    assert.equal(classifySource('RandomAppXYZ'), 'unknown')
  })

  it('resolves correct profile strategy', () => {
    assert.equal(profileFor('spotify'), 'light')
    assert.equal(profileFor('apple-music'), 'light')
    assert.equal(profileFor('local-player'), 'light')
    assert.equal(profileFor('browser'), 'full')
    assert.equal(profileFor('unknown'), 'full')
  })
})

describe('titleCleaner - buildLookupCandidates', () => {
  it('Row 1: Taylor Swift - Anti-Hero (Official Music Video)', () => {
    const candidates = buildLookupCandidates({
      title: 'Taylor Swift - Anti-Hero (Official Music Video)',
      artist: 'Taylor Swift',
      category: 'browser'
    })
    assert.ok(candidates.length > 0)
    assert.equal(candidates[0].title, 'Anti-Hero')
    assert.equal(candidates[0].artist, 'Taylor Swift')
  })

  it('Row 2: BLACKPINK - \'Pink Venom\' M/V', () => {
    const candidates = buildLookupCandidates({
      title: "BLACKPINK - 'Pink Venom' M/V",
      artist: 'BLACKPINK',
      category: 'browser'
    })
    const found = candidates.some(c => c.title === 'Pink Venom' && c.artist === 'BLACKPINK')
    assert.ok(found, "Candidates should contain 'Pink Venom' / 'BLACKPINK'")
  })

  it('Row 3: Moira Dela Torre - Paubaya (Official Lyric Video)', () => {
    const candidates = buildLookupCandidates({
      title: 'Moira Dela Torre - Paubaya (Official Lyric Video)',
      artist: 'Moira Dela Torre',
      category: 'browser'
    })
    assert.ok(candidates.length > 0)
    assert.equal(candidates[0].title, 'Paubaya')
    assert.equal(candidates[0].artist, 'Moira Dela Torre')
  })

  it('Row 4: Ed Sheeran - Shape of You [Official Video] | 4K', () => {
    const candidates = buildLookupCandidates({
      title: 'Ed Sheeran - Shape of You [Official Video] | 4K',
      artist: 'Ed Sheeran VEVO',
      category: 'browser'
    })
    assert.ok(candidates.length > 0)
    assert.equal(candidates[0].title, 'Shape of You')
    assert.equal(candidates[0].artist, 'Ed Sheeran')
  })

  it('Row 5: Hello / Adele - Topic', () => {
    const candidates = buildLookupCandidates({
      title: 'Hello',
      artist: 'Adele - Topic',
      category: 'browser'
    })
    const found = candidates.some(c => c.title === 'Hello' && c.artist === 'Adele')
    assert.ok(found, "Candidates should contain 'Hello' / 'Adele'")
  })

  it('Row 6: Live Forever / Oasis', () => {
    const candidates = buildLookupCandidates({
      title: 'Live Forever',
      artist: 'Oasis',
      category: 'browser'
    })
    assert.ok(candidates.length > 0)
    assert.equal(candidates[0].title, 'Live Forever')
    assert.equal(candidates[0].artist, 'Oasis')
    assert.ok(!candidates.some(c => c.title === 'Forever'), "Must NOT have title equal to 'Forever'")
  })

  it('Row 7: Lose Yourself (Live at 8 Mile) / Eminem', () => {
    const candidates = buildLookupCandidates({
      title: 'Lose Yourself (Live at 8 Mile)',
      artist: 'Eminem',
      category: 'browser'
    })
    const found = candidates.some(c => c.title === 'Lose Yourself' && c.artist === 'Eminem')
    assert.ok(found, "Candidates should contain 'Lose Yourself' / 'Eminem'")
    for (const c of candidates) {
      if (c.title.includes(')') && !c.title.includes('(')) {
        assert.fail(`Unbalanced parentheses in: ${c.title}`)
      }
    }
  })

  it('Row 8: 【MV】Ben&Ben - Kapangyarihan', () => {
    const candidates = buildLookupCandidates({
      title: '【MV】Ben&Ben - Kapangyarihan',
      artist: 'Ben&Ben',
      category: 'browser'
    })
    assert.ok(candidates.length > 0)
    assert.equal(candidates[0].title, 'Kapangyarihan')
    assert.equal(candidates[0].artist, 'Ben&Ben')
    for (const c of candidates) {
      assert.ok(!c.title.includes('【') && !c.title.includes('】'), "Must not contain 【 or 】")
      assert.ok(!c.artist.includes('【') && !c.artist.includes('】'), "Must not contain 【 or 】")
    }
  })

  it('Row 9: IU(아이유) _ Love wins all [MV]', () => {
    const candidates = buildLookupCandidates({
      title: 'IU(아이유) _ Love wins all [MV]',
      artist: '1theK (원더케이)',
      category: 'browser'
    })
    const found = candidates.some(c => c.title === 'Love wins all' && c.artist === 'IU')
    assert.ok(found, "Candidates should contain 'Love wins all' / 'IU'")
  })

  it('Row 10: NewJeans (뉴진스) \'Hype Boy\' Official MV (Performance ver.)', () => {
    const candidates = buildLookupCandidates({
      title: "NewJeans (뉴진스) 'Hype Boy' Official MV (Performance ver.)",
      artist: 'HYBE LABELS',
      category: 'browser'
    })
    const found = candidates.some(c => c.title === 'Hype Boy' && c.artist === 'NewJeans')
    assert.ok(found, "Candidates should contain 'Hype Boy' / 'NewJeans'")
  })

  it('Row 11: Anti-Hero / Taylor Swift (spotify)', () => {
    const candidates = buildLookupCandidates({
      title: 'Anti-Hero',
      artist: 'Taylor Swift',
      category: 'spotify'
    })
    assert.ok(candidates.length > 0)
    assert.equal(candidates[0].title, 'Anti-Hero')
    assert.equal(candidates[0].artist, 'Taylor Swift')
  })

  it('Row 12: Yellow - Remastered 2011 / Coldplay (spotify)', () => {
    const candidates = buildLookupCandidates({
      title: 'Yellow - Remastered 2011',
      artist: 'Coldplay',
      category: 'spotify'
    })
    assert.ok(candidates.length > 0)
    assert.equal(candidates[0].title, 'Yellow')
    assert.equal(candidates[0].artist, 'Coldplay')
  })

  it('Row 13: Song (feat. Someone) / Artist (spotify)', () => {
    const candidates = buildLookupCandidates({
      title: 'Song (feat. Someone)',
      artist: 'Artist',
      category: 'spotify'
    })
    const found = candidates.some(c => c.title === 'Song' && c.artist === 'Artist')
    assert.ok(found, "Candidates should contain 'Song' / 'Artist'")
  })

  it('cleanTitleInfo backward compatibility', () => {
    const res = cleanTitleInfo('Ed Sheeran - Shape of You [Official Video] | 4K', 'Ed Sheeran VEVO')
    assert.equal(res.cleanTitle, 'Shape of You')
    assert.equal(res.cleanArtist, 'Ed Sheeran')
  })
})

