import { app } from 'electron'

function getUserAgent() {
  const version = (app && typeof app.getVersion === 'function') ? app.getVersion() : '1.1.1'
  return `LyricFloat/${version} (https://github.com/MarkCyrus29/lyricfloat)`
}

export async function fetchJson(url, { signal, timeoutMs = 5000, headers = {} } = {}) {
  try {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    let combinedSignal = timeoutSignal
    if (signal) {
      combinedSignal = typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeoutSignal])
        : signal
    }

    const res = await fetch(url, {
      signal: combinedSignal,
      headers: {
        'User-Agent': getUserAgent(),
        ...headers
      }
    })

    if (!res.ok) {
      return null
    }

    return await res.json()
  } catch (err) {
    console.debug(`[LyricFloat http] fetch failed for ${url}:`, err.message)
    return null
  }
}
