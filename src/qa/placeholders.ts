const PLACEHOLDER_PATTERN =
  /\{\{\s*[\w.]+\s*\}\}|\{\s*[\w.]+\s*\}|%(?:\d+\$)?[sdif]|%\([\w]+\)[sdif]/g

export function extractPlaceholders(text: string): string[] {
  if (!text) return []
  const matches = text.match(PLACEHOLDER_PATTERN) ?? []
  return matches.map((token) => token.replace(/\s+/g, ''))
}

function toCounter(items: string[]): Map<string, number> {
  const counter = new Map<string, number>()
  for (const item of items) counter.set(item, (counter.get(item) ?? 0) + 1)
  return counter
}

export function diffPlaceholders(source: string, translation: string): { missing: string[]; extra: string[] } {
  const sourceCounter = toCounter(extractPlaceholders(source))
  const targetCounter = toCounter(extractPlaceholders(translation))
  const missing: string[] = []
  const extra: string[] = []
  for (const [token, count] of sourceCounter) {
    const targetCount = targetCounter.get(token) ?? 0
    for (let index = 0; index < count - targetCount; index += 1) missing.push(token)
  }
  for (const [token, count] of targetCounter) {
    const sourceCount = sourceCounter.get(token) ?? 0
    for (let index = 0; index < count - sourceCount; index += 1) extra.push(token)
  }
  return { missing, extra }
}
