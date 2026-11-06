import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, similarity, scoreCandidate, ACCEPT_THRESHOLD } from '../src/main/lyrics/matching.js'

describe('matching', () => {
  it('normalizes diacritics, case, brackets, and extra spaces', () => {
    assert.equal(normalize('Café (Remastered) [2020]'), 'cafe')
    assert.equal(normalize('  Hello   World  '), 'hello world')
    assert.equal(normalize('IU(아이유)'), 'iu')
  })

  it('computes similarity correctly with Levenshtein and substring matches', () => {
    assert.equal(similarity('Anti-Hero', 'Anti-Hero'), 1)
    assert.equal(similarity('Anti-Hero', 'Anti-Hero (Official)'), 1) // substring match >= 4 chars
    assert.ok(similarity('Hello', 'World') < 0.3)
  })

  it('identical song scores >= 0.95', () => {
    const want = { title: 'Anti-Hero', artist: 'Taylor Swift', durationMs: 200000, durationTrust: 'strong' }
    const got = { title: 'Anti-Hero', artist: 'Taylor Swift', durationMs: 200000 }
    const score = scoreCandidate(want, got)
    assert.ok(score >= 0.95, `Expected >= 0.95, got ${score}`)
  })

  it('wrong song with same artist scores below ACCEPT_THRESHOLD (0.75)', () => {
    const want = { title: 'Anti-Hero', artist: 'Taylor Swift', durationMs: 200000, durationTrust: 'strong' }
    const got = { title: 'Shake It Off', artist: 'Taylor Swift', durationMs: 200000 }
    const score = scoreCandidate(want, got)
    assert.ok(score < ACCEPT_THRESHOLD, `Expected < ${ACCEPT_THRESHOLD}, got ${score}`)
  })

  it('ignores diacritics and casing when scoring', () => {
    const want = { title: 'Café', artist: 'Beyoncé', durationMs: null, durationTrust: 'strong' }
    const got = { title: 'cafe', artist: 'beyonce', durationMs: null }
    const score = scoreCandidate(want, got)
    assert.equal(score, 1)
  })

  it('handles empty artist by redistributing weight to title and duration', () => {
    const want = { title: 'Anti-Hero', artist: '', durationMs: 200000, durationTrust: 'strong' }
    const got = { title: 'Anti-Hero', artist: 'Taylor Swift', durationMs: 200000 }
    const score = scoreCandidate(want, got)
    assert.equal(score, 1)
  })

  it('differentiates weak vs strong duration trust', () => {
    // 10 second difference
    const wantStrong = { title: 'Anti-Hero', artist: 'Taylor Swift', durationMs: 200000, durationTrust: 'strong' }
    const wantWeak = { title: 'Anti-Hero', artist: 'Taylor Swift', durationMs: 200000, durationTrust: 'weak' }
    const got = { title: 'Anti-Hero', artist: 'Taylor Swift', durationMs: 210000 }

    const scoreStrong = scoreCandidate(wantStrong, got)
    const scoreWeak = scoreCandidate(wantWeak, got)

    // In strong mode (maxDiff 5000), 10000 diff yields 0 duration score
    // In weak mode (maxDiff 40000), 10000 diff yields 0.75 duration score
    assert.ok(scoreWeak > scoreStrong, `Expected weak (${scoreWeak}) > strong (${scoreStrong})`)
    assert.equal(scoreStrong, 0.85) // 0.55*1 + 0.30*1 + 0.15*0 = 0.85
    assert.equal(scoreWeak, 0.9625) // 0.55*1 + 0.30*1 + 0.15*0.75 = 0.9625
  })
})

