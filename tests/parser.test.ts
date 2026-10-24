import { describe, expect, it } from 'vitest'
import { cloneDocument, deletePath, flatten, getPath, joinPath, setPath, splitPath } from '../src/parser/flatten'
import { jsonParser } from '../src/parser/json'
import { yamlParser } from '../src/parser/yaml'
import { detectFormat, getParser } from '../src/parser'
import { parse } from 'yaml'

describe('flatten', () => {
  it('turns nested objects into dotted keys', () => {
    const entries = flatten({ menu: { settings: 'Settings', about: 'About' } })
    expect(entries.map((entry) => [entry.key, entry.value])).toEqual([
      ['menu.settings', 'Settings'],
      ['menu.about', 'About'],
    ])
  })

  it('turns arrays into numeric path segments', () => {
    const entries = flatten({ rules: ['one', 'two'] })
    expect(entries.map((entry) => entry.key)).toEqual(['rules.0', 'rules.1'])
    expect(entries[1].path).toEqual(['rules', 1])
  })

  it('keeps primitive kinds, including null, boolean and number', () => {
    const entries = flatten({ a: null, b: false, c: 30.5, d: 'plain' })
    expect(entries.map((entry) => entry.kind)).toEqual(['null', 'boolean', 'number', 'string'])
    expect(entries[0].value).toBe('')
    expect(entries[2].value).toBe('30.5')
  })

  it('marks multiline strings', () => {
    const entries = flatten({ welcome: 'line one\nline two' })
    expect(entries[0].kind).toBe('multiline')
  })

  it('ignores empty containers', () => {
    expect(flatten({ empty: {}, list: [] })).toEqual([])
  })
})

describe('path helpers', () => {
  it('round trips keys with array indexes', () => {
    expect(splitPath(joinPath(['rules', 1, 'title']))).toEqual(['rules', 1, 'title'])
    expect(splitPath('')).toEqual([])
  })

  it('creates missing containers on write', () => {
    const document: Record<string, unknown> = {}
    setPath(document, ['menu', 'login'], 'Login')
    setPath(document, ['rules', 0], 'first')
    expect(document).toEqual({ menu: { login: 'Login' }, rules: ['first'] })
    expect(getPath(document, ['rules', 0])).toBe('first')
  })

  it('deletes by path and leaves siblings alone', () => {
    const document: Record<string, unknown> = { menu: { login: 'a', logout: 'b' } }
    deletePath(document, ['menu', 'login'])
    expect(document).toEqual({ menu: { logout: 'b' } })
  })

  it('clones deeply', () => {
    const original = { a: { b: ['c'] } }
    const copy = cloneDocument(original)
    copy.a.b.push('d')
    expect(original.a.b).toEqual(['c'])
  })
})

describe('yaml parser', () => {
  const source = [
    '# keep me',
    'menu:',
    '  login: Login',
    '  logout: Logout',
    'welcome: |',
    '  Hello, {name}.',
    'limits:',
    '  maxFiles: 3',
    '  allowGuest: false',
    '',
  ].join('\n')

  it('parses nested values and scalars', () => {
    const document = yamlParser.parse(source)
    expect(document.limits).toEqual({ maxFiles: 3, allowGuest: false })
    expect(String(document.welcome)).toContain('Hello, {name}.')
  })

  it('only rewrites the keys that changed and keeps comments', () => {
    const document = yamlParser.parse(source)
    setPath(document, ['menu', 'logout'], '退出登录')
    const output = yamlParser.serialize(document, source)
    expect(output).toContain('# keep me')
    expect(output).toContain('logout: 退出登录')
    expect(output).toContain('login: Login')
    expect(parse(output)).toMatchObject({ limits: { maxFiles: 3, allowGuest: false } })
  })

  it('removes keys that disappeared from the document', () => {
    const document = yamlParser.parse(source)
    deletePath(document, ['menu', 'logout'])
    const output = yamlParser.serialize(document, source)
    expect(output).not.toContain('logout')
    expect(output).toContain('login: Login')
  })

  it('keeps multiline strings readable after an edit', () => {
    const document = yamlParser.parse(source)
    setPath(document, ['welcome'], 'Hello, {name}.\nSecond line.')
    const output = yamlParser.serialize(document, source)
    expect(output).toContain('|-')
  })

  it('rejects invalid yaml', () => {
    expect(() => yamlParser.parse('menu: [unclosed')).toThrow(/Invalid YAML/)
  })
})

describe('json parser', () => {
  it('round trips with two space indentation', () => {
    const content = '{\n  "menu": {\n    "login": "Login"\n  }\n}\n'
    const document = jsonParser.parse(content)
    setPath(document, ['menu', 'logout'], 'Logout')
    const output = jsonParser.serialize(document)
    expect(JSON.parse(output)).toEqual({ menu: { login: 'Login', logout: 'Logout' } })
    expect(output.endsWith('\n')).toBe(true)
  })

  it('treats an empty file as an empty document', () => {
    expect(jsonParser.parse('')).toEqual({})
  })
})

describe('parser registry', () => {
  it('detects formats from file names and throws on unknown ones', () => {
    expect(detectFormat('locales/app.en.yml')).toBe('yaml')
    expect(detectFormat('locales/errors.en.json')).toBe('json')
    expect(detectFormat('locales/app.po')).toBeNull()
    expect(getParser('locales/app.ja.yml').id).toBe('yaml')
    expect(() => getParser('locales/app.po')).toThrow(/Unsupported/)
  })
})
