import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { flatten, getParser } from '../src/parser'

describe('overview statistics pipeline', () => {
  it('flattens the real locale file into countable entries', () => {
    const raw = readFileSync('locales/app.en.yml', 'utf8')
    const parsed = flatten(getParser('locales/app.en.yml').parse(raw))
    expect(parsed.length).toBeGreaterThan(10)
    for (const item of parsed) {
      expect(typeof item.key).toBe('string')
      expect(typeof item.value).toBe('string')
    }
    const translated = parsed.filter((item) => (item.value ?? '').trim() !== '').length
    expect(translated).toBe(parsed.length)
  })

  it('handles the json error catalogs the same way', () => {
    const raw = readFileSync('locales/errors.en.json', 'utf8')
    const parsed = flatten(getParser('locales/errors.en.json').parse(raw))
    expect(parsed.length).toBeGreaterThan(0)
  })
})
