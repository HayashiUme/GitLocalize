/* A tiny in-browser translation memory: exact source matches win, recency breaks ties. */

const STORAGE_KEY = 'gitlocalize.tm'
const LIMIT = 2000

type Memory = Record<string, Record<string, { value: string; at: number }>>

function read(): Memory {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}') as Memory
  } catch {
    return {}
  }
}

function write(memory: Memory): void {
  const entries = Object.entries(memory)
  if (entries.length <= LIMIT) {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(memory))
    return
  }
  entries
    .sort((a, b) => newest(b[1]) - newest(a[1]))
    .slice(0, LIMIT)
    .forEach(([source, hits]) => {
      memory[source] = hits
    })
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(memory))
}

function newest(hits: Record<string, { value: string; at: number }>): number {
  return Math.max(0, ...Object.values(hits).map((hit) => hit.at))
}

export function remember(source: string, language: string, value: string): void {
  const key = source.trim()
  const translation = value.trim()
  if (!key || !translation) return
  const memory = read()
  memory[key] = { ...memory[key], [language]: { value: translation, at: Date.now() } }
  write(memory)
}

export function suggest(source: string, language: string): string | null {
  const hit = read()[source.trim()]?.[language]
  return hit ? hit.value : null
}
