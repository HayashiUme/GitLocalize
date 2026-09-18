import { describe, expect, it } from 'vitest'
import { extractPlaceholders, diffPlaceholders } from '../src/qa/placeholders'
import { diffTags, extractTags } from '../src/qa/htmlTags'
import { qaCheckEntries, qaCheckEntry } from '../src/qa'
import type { TranslationEntry } from '../src/types'

function entry(source: string, translation: string): TranslationEntry {
  return { key: 'k', path: ['k'], source, translation, kind: 'string', translated: translation.trim() !== '' }
}

describe('placeholders', () => {
  it('extracts braces, printf and named placeholders', () => {
    expect(extractPlaceholders('Hello {name}, you have {count} of { 0 }')).toEqual(['{name}', '{count}', '{0}'])
    expect(extractPlaceholders('{{name}} and {name}')).toEqual(['{{name}}', '{name}'])
    expect(extractPlaceholders('%s %1$s %(user)s')).toEqual(['%s', '%1$s', '%(user)s'])
  })

  it('reports a missing placeholder', () => {
    const result = diffPlaceholders('Hello {0}', '你好')
    expect(result.missing).toEqual(['{0}'])
    expect(result.extra).toEqual([])
  })

  it('reports a duplicated placeholder as extra', () => {
    const result = diffPlaceholders('Hello {0}', '{0} 你好 {0}')
    expect(result.missing).toEqual([])
    expect(result.extra).toEqual(['{0}'])
  })
})

describe('html tags', () => {
  it('extracts tag names case insensitively and sorted', () => {
    expect(extractTags('Read the <b>guide</b> <a href="#">now</a>')).toEqual(['a', 'a', 'b', 'b'])
  })

  it('detects a dropped tag', () => {
    expect(diffTags('Hello <b>world</b>', '你好').missing).toEqual(['b', 'b'])
    expect(diffTags('Hello <b>world</b>', '你好<b>世界</b>').missing).toEqual([])
  })
})

describe('qaCheckEntry', () => {
  it('flags an empty translation', () => {
    const issues = qaCheckEntry(entry('Settings', ''))
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('empty-translation')
  })

  it('flags placeholders and tags together', () => {
    const issues = qaCheckEntry(entry('Hello <b>{name}</b>', '你好'))
    const codes = issues.map((issue) => `${issue.code}:${issue.detail}`).sort()
    expect(codes).toEqual(['html-tag-missing:b', 'html-tag-missing:b', 'placeholder-missing:{name}'])
  })

  it('passes a faithful translation', () => {
    expect(qaCheckEntry(entry('Hello <b>{name}</b>', '你好，<b>{name}</b>'))).toEqual([])
  })

  it('leaves rows without a source untouched', () => {
    expect(qaCheckEntry(entry('', ''))).toEqual([])
  })
})

describe('qaCheckEntries', () => {
  it('reports the number of untranslated rows through empty-translation issues', () => {
    const issues = qaCheckEntries([entry('a', 'a'), entry('b', ''), entry('c', '')])
    expect(issues.filter((issue) => issue.code === 'empty-translation')).toHaveLength(2)
  })
})
