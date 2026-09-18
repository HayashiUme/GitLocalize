import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import appEn from '../locales/app.en.yml?raw'
import appJa from '../locales/app.ja.yml?raw'
import appZhCn from '../locales/app.zh-CN.yml?raw'
import appZhTw from '../locales/app.zh-TW.yml?raw'
import errorsEn from '../locales/errors.en.json?raw'
import errorsJa from '../locales/errors.ja.json?raw'
import errorsZhCn from '../locales/errors.zh-CN.json?raw'
import errorsZhTw from '../locales/errors.zh-TW.json?raw'
import { flatten, getParser } from '../src/parser'
import { diffTags } from '../src/qa/htmlTags'
import { diffPlaceholders } from '../src/qa/placeholders'

type Catalog = Map<string, string>

function catalogOf(source: string, format: string): Catalog {
  return new Map(flatten(getParser(format).parse(source)).map((entry) => [entry.key, entry.value]))
}

const APP: Record<string, Catalog> = {
  en: catalogOf(appEn, 'yaml'),
  'zh-CN': catalogOf(appZhCn, 'yaml'),
  'zh-TW': catalogOf(appZhTw, 'yaml'),
  ja: catalogOf(appJa, 'yaml'),
}

const ERRORS: Record<string, Catalog> = {
  en: catalogOf(errorsEn, 'json'),
  'zh-CN': catalogOf(errorsZhCn, 'json'),
  'zh-TW': catalogOf(errorsZhTw, 'json'),
  ja: catalogOf(errorsJa, 'json'),
}

const LANGUAGES = Object.keys(APP)

function walk(directory: string, extension: RegExp): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) return walk(full, extension)
    return extension.test(entry) ? [full] : []
  })
}

/* Literal keys passed to t()/tp(), plus any error.* literal that the store maps status codes onto. */
function keysUsedInSource(): { plain: Set<string>; plural: Set<string> } {
  const plain = new Set<string>()
  const plural = new Set<string>()
  for (const file of walk(join(process.cwd(), 'src'), /\.(ts|vue)$/)) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?<![\w$.])(t|tp)\(\s*'([^']+)'/g)) {
      ;(match[1] === 'tp' ? plural : plain).add(match[2])
    }
    for (const match of text.matchAll(/'((?:error)\.[\w.]+)'/g)) plain.add(match[1])
  }
  return { plain, plural }
}

function lookup(key: string): string | undefined {
  return key.startsWith('error.') ? ERRORS.en.get(key.slice(6)) : APP.en.get(key)
}

describe('interface catalogs', () => {
  it('defines exactly the same keys in every language', () => {
    for (const [name, catalogs] of [
      ['app', APP],
      ['errors', ERRORS],
    ] as const) {
      const reference = [...catalogs.en.keys()].sort()
      for (const language of Object.keys(catalogs)) {
        expect([...catalogs[language].keys()].sort(), `${name}.${language}`).toEqual(reference)
      }
    }
  })

  it('leaves no value empty', () => {
    for (const catalogs of [APP, ERRORS]) {
      for (const [language, catalog] of Object.entries(catalogs)) {
        const empty = [...catalog.entries()].filter(([, value]) => value.trim() === '').map(([key]) => key)
        expect(empty, language).toEqual([])
      }
    }
  })

  it('keeps placeholders and HTML tags identical to the source language', () => {
    for (const catalogs of [APP, ERRORS]) {
      for (const [language, catalog] of Object.entries(catalogs)) {
        if (language === 'en') continue
        for (const [key, source] of catalogs.en) {
          const translation = catalog.get(key) ?? ''
          const placeholders = diffPlaceholders(source, translation)
          const tags = diffTags(source, translation)
          expect(placeholders.missing, `${language} ${key}: missing placeholder`).toEqual([])
          expect(placeholders.extra, `${language} ${key}: extra placeholder`).toEqual([])
          expect(tags.missing, `${language} ${key}: missing tag`).toEqual([])
          expect(tags.extra, `${language} ${key}: extra tag`).toEqual([])
        }
      }
    }
  })

  it('pairs every plural key', () => {
    for (const catalogs of [APP, ERRORS]) {
      for (const catalog of Object.values(catalogs)) {
        for (const key of catalog.keys()) {
          if (key.endsWith('.one')) expect(catalog.has(key.replace(/\.one$/, '.other')), key).toBe(true)
          if (key.endsWith('.other')) expect(catalog.has(key.replace(/\.other$/, '.one')), key).toBe(true)
        }
      }
    }
  })

  it('has a string for every key the interface asks for', () => {
    const { plain, plural } = keysUsedInSource()
    const missingPlain = [...plain].filter((key) => lookup(key) === undefined).sort()
    const missingPlural = [...plural]
      .filter((key) => lookup(key) === undefined && !(lookup(`${key}.one`) && lookup(`${key}.other`)))
      .sort()
    expect({ missingPlain, missingPlural }).toEqual({ missingPlain: [], missingPlural: [] })
  })

  it('offers a catalog for each advertised interface language', () => {
    expect(LANGUAGES).toEqual(['en', 'zh-CN', 'zh-TW', 'ja'])
  })
})
