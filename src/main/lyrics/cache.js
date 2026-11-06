import { join } from 'path'
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs'
import { app } from 'electron'
import { normalize } from './matching.js'

const MAX_ENTRIES = 500
const MISS_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

let cacheLoaded = false
let cacheMap = new Map()
let saveTimeout = null
let cacheFilePath = null

function getFilePath() {
  if (!cacheFilePath) {
    try {
      cacheFilePath = join(app.getPath('userData'), 'lyrics-cache.json')
    } catch (e) {
      cacheFilePath = 'lyrics-cache.json'
    }
  }
  return cacheFilePath
}

function loadCache() {
  if (cacheLoaded) return
  cacheLoaded = true
  const filePath = getFilePath()
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && v.result && typeof v.at === 'number') {
          cacheMap.set(k, v)
        }
      }
    }
  } catch (e) {
    // Start empty on unreadable or missing file
    cacheMap = new Map()
  }
}

function flush() {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  const filePath = getFilePath()
  const tempPath = `${filePath}.tmp`
  try {
    const obj = {}
    for (const [k, v] of cacheMap.entries()) {
      obj[k] = v
    }
    writeFileSync(tempPath, JSON.stringify(obj), 'utf8')
    renameSync(tempPath, filePath)
  } catch (e) {
    try {
      unlinkSync(tempPath)
    } catch {}
  }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(flush, 1000)
}

function buildCacheKey(title, artist, category) {
  const normTitle = normalize(title)
  const normArtist = normalize(artist)
  const cat = (category || 'unknown').toLowerCase()
  return `${normTitle}|${normArtist}|${cat}`
}

export function getCachedLyrics(title, artist, category) {
  loadCache()
  const key = buildCacheKey(title, artist, category)
  const entry = cacheMap.get(key)
  if (!entry) return null

  const isMiss = (!entry.result.lines || entry.result.lines.length === 0) && !entry.result.instrumental
  if (isMiss) {
    if (Date.now() - entry.at > MISS_EXPIRY_MS) {
      cacheMap.delete(key)
      scheduleSave()
      return null
    }
  }

  return entry.result
}

export function setCachedLyrics(title, artist, category, result) {
  loadCache()
  const key = buildCacheKey(title, artist, category)

  cacheMap.set(key, {
    result,
    at: Date.now()
  })

  // Evict oldest if exceeding MAX_ENTRIES
  if (cacheMap.size > MAX_ENTRIES) {
    const sorted = Array.from(cacheMap.entries()).sort((a, b) => a[1].at - b[1].at)
    while (sorted.length > MAX_ENTRIES) {
      const oldest = sorted.shift()
      if (oldest) {
        cacheMap.delete(oldest[0])
      }
    }
  }

  scheduleSave()
}

export function flushCache() {
  flush()
}
