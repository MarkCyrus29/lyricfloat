import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseLRC } from '../src/main/lyrics/lrcParser.js'

describe('lrcParser', () => {
  it('parses multi-timestamp line into multiple sorted entries with same text', () => {
    const lrc = '[00:10.00][00:50.00]chorus line'
    const result = parseLRC(lrc)
    assert.equal(result.length, 2)
    assert.deepEqual(result[0], { time: 10, text: 'chorus line' })
    assert.deepEqual(result[1], { time: 50, text: 'chorus line' })
  })

  it('handles 2-digit and 3-digit fractions accurately', () => {
    const lrc = `
[01:05.25]Two digits
[01:05.250]Three digits
[01:05.5]One digit
`
    const result = parseLRC(lrc)
    assert.equal(result.length, 3)
    assert.equal(result[0].time, 65.25)
    assert.equal(result[1].time, 65.25)
    assert.equal(result[2].time, 65.5)
  })

  it('handles [mm:ss] without fraction', () => {
    const lrc = '[02:15]No fraction'
    const result = parseLRC(lrc)
    assert.equal(result.length, 1)
    assert.deepEqual(result[0], { time: 135, text: 'No fraction' })
  })

  it('ignores metadata tags like [ar:], [ti:], and [offset:]', () => {
    const lrc = `
[ar:Artist Name]
[ti:Song Title]
[al:Album Title]
[by:Author]
[length:03:45]
[offset:500]
[00:05.00]Real line
`
    const result = parseLRC(lrc)
    assert.equal(result.length, 1)
    assert.deepEqual(result[0], { time: 5, text: 'Real line' })
  })

  it('handles empty-text lines (yielding empty string)', () => {
    const lrc = '[00:12.34]'
    const result = parseLRC(lrc)
    assert.equal(result.length, 1)
    assert.deepEqual(result[0], { time: 12.34, text: '' })
  })

  it('sorts output chronologically when input lines are out of order', () => {
    const lrc = `
[00:30.00]Second
[00:10.00]First
[00:50.00]Third
`
    const result = parseLRC(lrc)
    assert.equal(result.length, 3)
    assert.equal(result[0].text, 'First')
    assert.equal(result[1].text, 'Second')
    assert.equal(result[2].text, 'Third')
  })
})

