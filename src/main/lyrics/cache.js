import { join } from 'path'
import { readFileSync, writeFileSync, renameSync, unlinkSync, promises as fsPromises } from 'fs'
import { app } from 'electron'
import { normalize } from './matching.js'

const MAX_ENTRIES = 500
const HOT_CACHE_MAX = 32
const MISS_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

let cacheLoaded = false
// Cold store: key -> { raw: string (JSON of {result, at}), at: number, isMiss: boolean }
// Keeps V8 heap tiny (no 40,000+ line objects retained for 500 songs)
let cacheMap = new Map()
// Hot LRU: key -> parsed result object for instant repeat hits
const hotCache = new Map()

let saveTimeout = null
let cacheFilePath = null
let dirty = false
let writeInFlight = null

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

function isMissResult(result) {
  return (!result?.lines || result.lines.length === 0) && !result?.instrumental
}

function setHot(key, result) {
  if (hotCache.has(key)) hotCache.delete(key)
  hotCache.set(key, result)
  if (hotCache.size > HOT_CACHE_MAX) {
    const oldest = hotCache.keys().next().value
    if (oldest !== undefined) hotCache.delete(oldest)
  }
}

function loadCache() {
  if (cacheLoaded) return
  cacheLoaded = true
  const filePath = getFilePath()
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const now = Date.now()
      for (const [k, v] of Object.entries(parsed)) {
        if (v && v.result && typeof v.at === 'number') {
          const miss = isMissResult(v.result)
          if (miss && now - v.at > MISS_EXPIRY_MS) {
            dirty = true
            continue
          }
          cacheMap.set(k, {
            raw: JSON.stringify(v),
            at: v.at,
            isMiss: miss
          })
        }
      }
    }
  } catch (e) {
    cacheMap = new Map()
  }
}

function buildSerializedJson() {
  const parts = []
  for (const [k, entry] of cacheMap.entries()) {
    parts.push(`${JSON.stringify(k)}:${entry.raw}`)
  }
  return `{${parts.join(',')}}`
}

async function flushAsync() {
  if (!dirty) return
  const filePath = getFilePath()
  const tempPath = `${filePath}.tmp`
  const payload = buildSerializedJson()
  dirty = false
  try {
    await fsPromises.writeFile(tempPath, payload, 'utf8')
    await fsPromises.rename(tempPath, filePath)
  } catch (e) {
    dirty = true
    try {
      await fsPromises.unlink(tempPath)
    } catch {}
  }
}

function flushSync() {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  if (!dirty) return
  const filePath = getFilePath()
  const tempPath = `${filePath}.tmp`
  try {
    writeFileSync(tempPath, buildSerializedJson(), 'utf8')
    renameSync(tempPath, filePath)
    dirty = false
  } catch (e) {
    try {
      unlinkSync(tempPath)
    } catch {}
  }
}

function scheduleSave() {
  dirty = true
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveTimeout = null
    if (!writeInFlight) {
      writeInFlight = flushAsync().finally(() => {
        writeInFlight = null
        if (dirty && !saveTimeout) {
          scheduleSave()
        }
      })
    }
  }, 1500)
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

  if (entry.isMiss && Date.now() - entry.at > MISS_EXPIRY_MS) {
    cacheMap.delete(key)
    hotCache.delete(key)
    scheduleSave()
    return null
  }

  // O(1) LRU bump in Map order
  cacheMap.delete(key)
  cacheMap.set(key, entry)

  if (hotCache.has(key)) {
    const hot = hotCache.get(key)
    setHot(key, hot)
    return hot
  }

  try {
    const parsed = JSON.parse(entry.raw)
    setHot(key, parsed.result)
    return parsed.result
  } catch {
    cacheMap.delete(key)
    return null
  }
}

export function setCachedLyrics(title, artist, category, result) {
  loadCache()
  const key = buildCacheKey(title, artist, category)
  const at = Date.now()
  const entry = {
    raw: JSON.stringify({ result, at }),
    at,
    isMiss: isMissResult(result)
  }

  if (cacheMap.has(key)) cacheMap.delete(key)
  cacheMap.set(key, entry)
  setHot(key, result)

  // O(1) LRU eviction via Map insertion order
  while (cacheMap.size > MAX_ENTRIES) {
    const oldestKey = cacheMap.keys().next().value
    if (oldestKey === undefined) break
    cacheMap.delete(oldestKey)
    hotCache.delete(oldestKey)
  }

  scheduleSave()
}

export function flushCache() {
  flushSync()
}
