import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractDominantColorFromBitmap, getTextColorForBackground } from '../src/main/colorUtils.js'

describe('colorUtils', () => {
  it('picks dominant color from BGRA bitmap while ignoring transparent and white pixels', () => {
    // 4 pixels BGRA: white, transparent, blue (0, 100, 220), blue (0, 100, 220)
    const buf = Buffer.from([
      255, 255, 255, 255, // near-white (ignored)
      0, 255, 0, 0,       // transparent (ignored)
      220, 100, 0, 255,   // B=220, G=100, R=0 -> rgb(0, 100, 220)
      220, 100, 0, 255
    ])
    assert.equal(extractDominantColorFromBitmap(buf, true), 'rgb(0, 100, 220)')
  })

  it('falls back to average when all opaque pixels are near-white', () => {
    const buf = Buffer.from([
      250, 250, 250, 255,
      252, 252, 252, 255
    ])
    assert.equal(extractDominantColorFromBitmap(buf, true), 'rgb(251, 251, 251)')
  })

  it('returns null for empty or fully transparent bitmaps', () => {
    assert.equal(extractDominantColorFromBitmap(Buffer.alloc(0), true), null)
    const transparent = Buffer.from([10, 20, 30, 0])
    assert.equal(extractDominantColorFromBitmap(transparent, true), null)
  })

  it('computes contrasting text color via YIQ', () => {
    assert.equal(getTextColorForBackground('rgb(20, 20, 20)'), 'white')
    assert.equal(getTextColorForBackground('rgb(240, 240, 240)'), 'black')
  })
})
