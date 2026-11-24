import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMBINED_SCRIPT,
  parseMacMediaOutput,
  parseBrowserTitle,
  pollMediaInfo,
  startMediaBridge,
  stopMediaBridge
} from '../src/main/macMediaBridge.js'

describe('macMediaBridge (macOS)', () => {
  it('validates COMBINED_SCRIPT AppleScript structure and linefeed usage', () => {
    assert.ok(COMBINED_SCRIPT.includes('tell application "System Events"'))
    assert.ok(COMBINED_SCRIPT.includes('run script spotScript'))
    assert.ok(COMBINED_SCRIPT.includes('run script musicScript'))
    // Must use AppleScript `linefeed` keyword rather than escaped backslash-n literal
    assert.ok(COMBINED_SCRIPT.includes('& linefeed'))
    assert.ok(!COMBINED_SCRIPT.includes('\\\\n'))
  })

  it('parses macOS Spotify playing and paused output accurately', () => {
    const rawPlaying = 'SPOTIFY|||夜に駆ける|||YOASOBI|||45200|||playing|||261000|||THE BOOK'
    const parsed = parseMacMediaOutput(rawPlaying)
    assert.ok(parsed)
    assert.equal(parsed.isPlaying, true)
    assert.deepEqual(parsed.info, {
      title: '夜に駆ける',
      artist: 'YOASOBI',
      positionMs: 45200,
      isPlaying: true,
      durationMs: 261000,
      sourceApp: 'Spotify',
      album: 'THE BOOK'
    })

    const rawPaused = 'SPOTIFY|||Paubaya|||Moira Dela Torre|||120000|||paused|||287000|||Patawad'
    const parsedPaused = parseMacMediaOutput(rawPaused)
    assert.ok(parsedPaused)
    assert.equal(parsedPaused.isPlaying, false)
    assert.equal(parsedPaused.info.isPlaying, false)
    assert.equal(parsedPaused.info.positionMs, 120000)
  })

  it('parses macOS Apple Music output and converts seconds duration to milliseconds', () => {
    const rawMusic = 'MUSIC|||Anti-Hero|||Taylor Swift|||18500|||playing|||200.5|||Midnights'
    const parsed = parseMacMediaOutput(rawMusic)
    assert.ok(parsed)
    assert.equal(parsed.isPlaying, true)
    assert.deepEqual(parsed.info, {
      title: 'Anti-Hero',
      artist: 'Taylor Swift',
      positionMs: 18500,
      isPlaying: true,
      durationMs: 200500,
      sourceApp: 'Music',
      album: 'Midnights'
    })
  })

  it('parses macOS browser fallback across YouTube, SoundCloud, and multi-window lists', () => {
    const rawBrowsers = [
      'BROWSER|||Safari|||GitHub - Google Search - Safari',
      'BROWSER|||Google Chrome|||YOASOBI - Idol - YouTube',
      'BROWSER|||Arc|||Docs'
    ].join('\n')

    const parsed = parseMacMediaOutput(rawBrowsers)
    assert.ok(parsed)
    assert.equal(parsed.isPlaying, true)
    assert.deepEqual(parsed.info, {
      title: 'YOASOBI',
      artist: 'Idol',
      positionMs: 0,
      isPlaying: true,
      durationMs: null,
      sourceApp: 'Google Chrome',
      album: null
    })

    const sc = parseBrowserTitle('Safari', 'Stream My Track by saiky | Listen online for free on SoundCloud')
    assert.ok(sc)
    assert.equal(sc.title, 'My Track')
    assert.equal(sc.artist, 'saiky')
    assert.equal(sc.sourceApp, 'Safari')
  })

  it('ignores non-media browser titles and empty output', () => {
    assert.equal(parseMacMediaOutput(''), null)
    assert.equal(parseMacMediaOutput('BROWSER|||Safari|||New Tab - Safari'), null)
    assert.equal(parseMacMediaOutput('BROWSER|||Google Chrome|||Untitled - Google Chrome'), null)
  })

  it('runs pollMediaInfo and start/stop lifecycle with mocked osascript runner', async () => {
    const detected = []
    const mockRunner = async () => 'SPOTIFY|||Kapangyarihan|||Ben&Ben|||10000|||playing|||250000|||Pebble House'

    const playing = await pollMediaInfo((info) => detected.push(info), mockRunner)
    assert.equal(playing, true)
    assert.equal(detected.length, 1)
    assert.equal(detected[0].title, 'Kapangyarihan')
    assert.equal(detected[0].artist, 'Ben&Ben')

    startMediaBridge((info) => detected.push(info), mockRunner)
    stopMediaBridge()
  })
})
