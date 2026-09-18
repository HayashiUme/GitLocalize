const TAG_PATTERN = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g

export function extractTags(text: string): string[] {
  if (!text) return []
  const tags: string[] = []
  for (const match of text.matchAll(TAG_PATTERN)) {
    tags.push(match[1].toLowerCase())
  }
  return tags.sort()
}

export function diffTags(source: string, translation: string): { missing: string[]; extra: string[] } {
  const sourceTags = extractTags(source)
  const targetTags = extractTags(translation)
  const targetPool = [...targetTags]
  const missing: string[] = []
  for (const tag of sourceTags) {
    const index = targetPool.indexOf(tag)
    if (index >= 0) targetPool.splice(index, 1)
    else missing.push(tag)
  }
  return { missing, extra: targetPool }
}
