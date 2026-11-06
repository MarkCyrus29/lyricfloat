const unknownSourcesSeen = new Set()

export function classifySource(sourceApp) {
  if (!sourceApp || typeof sourceApp !== 'string') {
    return 'unknown'
  }

  const raw = sourceApp.trim()
  const lower = raw.toLowerCase()

  if (lower.includes('spotify')) {
    return 'spotify'
  }

  if (lower.includes('applemusic') || lower.includes('itunes') || raw === 'Music') {
    return 'apple-music'
  }

  const browsers = ['chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'arc', 'safari']
  if (browsers.some(b => lower.includes(b))) {
    return 'browser'
  }

  const localPlayers = ['vlc', 'musicbee', 'foobar', 'groove', 'zune', 'winamp', 'mpv']
  if (localPlayers.some(p => lower.includes(p))) {
    return 'local-player'
  }

  if (!unknownSourcesSeen.has(raw)) {
    unknownSourcesSeen.add(raw)
    console.debug('[LyricFloat] unknown sourceApp:', raw)
  }

  return 'unknown'
}

export function profileFor(category) {
  if (category === 'spotify' || category === 'apple-music' || category === 'local-player') {
    return 'light'
  }
  return 'full'
}
