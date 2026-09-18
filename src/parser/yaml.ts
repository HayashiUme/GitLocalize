import { isScalar, parseDocument, stringify } from 'yaml'
import type { RawDocument, TranslationParser } from '../types'
import { flatten, getPath } from './flatten'

const STRINGIFY_OPTIONS = { lineWidth: 0, indent: 2 }

/* YAML parser that edits the original document in place so comments survive a round trip. */
export const yamlParser: TranslationParser = {
  id: 'yaml',
  extensions: ['.yml', '.yaml'],

  parse(content: string): RawDocument {
    const document = parseDocument(content, { keepSourceTokens: true })
    if (document.errors.length > 0) {
      throw new Error(`Invalid YAML: ${document.errors[0].message}`)
    }
    return (document.toJS() ?? {}) as RawDocument
  },

  serialize(document: RawDocument, originalContent?: string): string {
    if (originalContent === undefined || originalContent.trim() === '') {
      return stringify(document, STRINGIFY_OPTIONS)
    }
    const parsed = parseDocument(originalContent, { keepSourceTokens: true })
    const before = new Map(flatten(parsed.toJS() ?? {}).map((entry) => [entry.key, entry.value]))
    const after = new Map(flatten(document).map((entry) => [entry.key, entry.value]))

    for (const key of before.keys()) {
      if (!after.has(key)) deletePathFromDocument(parsed, key)
    }
    for (const entry of flatten(document)) {
      if (before.get(entry.key) === entry.value) continue
      parsed.setIn(entry.path, entry.raw)
      if (entry.kind === 'multiline') {
        const node = parsed.getIn(entry.path, true)
        if (isScalar(node)) node.type = 'BLOCK_LITERAL'
      }
    }
    return parsed.toString(STRINGIFY_OPTIONS)
  },
}

function deletePathFromDocument(document: ReturnType<typeof parseDocument>, key: string): void {
  const path = key.split('.').map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment))
  if (getPath(document.toJS(), path) === undefined) return
  document.deleteIn(path)
}
