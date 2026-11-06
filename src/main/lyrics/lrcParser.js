const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g

export function parseLRC(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') {
    return []
  }

  const lines = lrcText.split(/\r?\n/)
  const result = []

  for (let rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    // Ignore metadata tags like [ar:Artist], [ti:Title], [offset:500], etc.
    if (/^\[[a-zA-Z]+:.*\]$/.test(trimmed)) {
      continue
    }

    // Collect all leading timestamp tags
    const timestamps = []
    let match
    TIMESTAMP_REGEX.lastIndex = 0

    // Find all timestamp matches
    const tagMatches = []
    while ((match = TIMESTAMP_REGEX.exec(rawLine)) !== null) {
      tagMatches.push({
        index: match.index,
        length: match[0].length,
        min: parseInt(match[1], 10),
        sec: parseInt(match[2], 10),
        fracStr: match[3] || null
      })
    }

    if (tagMatches.length === 0) {
      continue
    }

    // Check if the tags are at the start of the line or consecutive
    // Extract remaining text by removing all timestamp tags from the line
    const textWithoutTags = rawLine.replace(TIMESTAMP_REGEX, '').trim()

    for (const tag of tagMatches) {
      let fractionMs = 0
      if (tag.fracStr) {
        if (tag.fracStr.length === 1) {
          fractionMs = parseInt(tag.fracStr, 10) * 100
        } else if (tag.fracStr.length === 2) {
          fractionMs = parseInt(tag.fracStr, 10) * 10
        } else {
          fractionMs = parseInt(tag.fracStr.slice(0, 3), 10)
        }
      }

      const timeInSeconds = tag.min * 60 + tag.sec + (fractionMs / 1000)
      result.push({
        time: parseFloat(timeInSeconds.toFixed(3)),
        text: textWithoutTags
      })
    }
  }

  result.sort((a, b) => a.time - b.time)
  return result
}

