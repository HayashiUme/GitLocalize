import type { TranslationParser } from '../types'
import { jsonParser } from './json'
import { yamlParser } from './yaml'

export const parsers: TranslationParser[] = [yamlParser, jsonParser]

export function detectFormat(path: string): string | null {
  const lower = path.toLowerCase()
  const match = parsers.find((parser) => parser.extensions.some((extension) => lower.endsWith(extension)))
  return match ? match.id : null
}

export function getParser(formatOrPath: string): TranslationParser {
  const byId = parsers.find((parser) => parser.id === formatOrPath)
  if (byId) return byId
  const format = detectFormat(formatOrPath)
  const found = format ? parsers.find((parser) => parser.id === format) : undefined
  if (!found) {
    throw new Error(`Unsupported translation format: ${formatOrPath}`)
  }
  return found
}

export function registerParser(parser: TranslationParser): void {
  const index = parsers.findIndex((item) => item.id === parser.id)
  if (index >= 0) parsers.splice(index, 1, parser)
  else parsers.push(parser)
}

export * from './flatten'
