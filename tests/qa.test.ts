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

  it('flags the same source string translated differently', () => {
    const first = { ...entry('Open file', '打开文件'), key: 'first' }
    const second = { ...entry('Open file', '开启文件'), key: 'second' }
    const issues = qaCheckEntries([first, second])
    expect(issues.filter((issue) => issue.code === 'inconsistent')).toHaveLength(2)
  })

  it('accepts one consistent translation for a repeated source', () => {
    const first = { ...entry('Open file', '打开文件'), key: 'first' }
    const second = { ...entry('Open file', '打开文件'), key: 'second' }
    expect(qaCheckEntries([first, second]).filter((issue) => issue.code === 'inconsistent')).toHaveLength(0)
  })
})

describe('weblate-style checks', () => {
  it('flags a dropped question mark', () => {
    expect(qaCheckEntry(entry('Are you sure?', '确定'))[0]).toMatchObject({ code: 'punctuation-missing' })
  })

  it('accepts the CJK counterpart of the punctuation', () => {
    expect(qaCheckEntry(entry('Are you sure?', '确定吗？'))).toEqual([])
  })

  it('flags a changed line-break count', () => {
    const issues = qaCheckEntry(entry('Line one\nLine two', '第一行第二行'))
    expect(issues.some((issue) => issue.code === 'newline-count')).toBe(true)
  })

  it('flags edge whitespace differences', () => {
    const issues = qaCheckEntry(entry(' Settings ', '设置'))
    expect(issues.some((issue) => issue.code === 'space-mismatch')).toBe(true)
  })

  it('flags invisible zero-width characters', () => {
    const issues = qaCheckEntry(entry('Settings', '设\u200B置'))
    expect(issues.some((issue) => issue.code === 'zero-width-space')).toBe(true)
  })

  it('flags a translation identical to the source', () => {
    expect(qaCheckEntry(entry('Save changes', 'Save changes'))[0]).toMatchObject({ code: 'same-as-source' })
  })

  it('keeps proper-noun phrases and identifiers out of the identical check', () => {
    expect(qaCheckEntry(entry('GitHub Actions', 'GitHub Actions'))).toEqual([])
    expect(qaCheckEntry(entry('OK', 'OK'))).toEqual([])
  })

  it('flags a repeated word in the translation', () => {
    const issues = qaCheckEntry(entry('Save changes', 'Save changes changes'))
    expect(issues.some((issue) => issue.code === 'repeated-word')).toBe(true)
  })
})
