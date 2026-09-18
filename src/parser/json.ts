import type { RawDocument, TranslationParser } from '../types'

/* JSON parser keeps the source formatting predictable: two spaces, trailing newline. */
export const jsonParser: TranslationParser = {
  id: 'json',
  extensions: ['.json'],

  parse(content: string): RawDocument {
    if (content.trim() === '') return {}
    return JSON.parse(content) as RawDocument
  },

  serialize(document: RawDocument): string {
    return `${JSON.stringify(document, null, 2)}\n`
  },
}
