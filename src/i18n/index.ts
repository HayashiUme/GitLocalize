import { computed, reactive } from 'vue'
import appEn from '../../locales/app.en.yml?raw'
import appJa from '../../locales/app.ja.yml?raw'
import appZhCn from '../../locales/app.zh-CN.yml?raw'
import appZhTw from '../../locales/app.zh-TW.yml?raw'
import errorsEn from '../../locales/errors.en.json?raw'
import errorsJa from '../../locales/errors.ja.json?raw'
import errorsZhCn from '../../locales/errors.zh-CN.json?raw'
import errorsZhTw from '../../locales/errors.zh-TW.json?raw'
import { flatten, getParser } from '../parser'

export const DEFAULT_UI_LOCALE = 'en'
export const UI_LOCALE_STORAGE_KEY = 'gitlocalize.ui.locale'
const ERROR_NAMESPACE = 'error.'

const APP_SOURCES: Record<string, string> = { en: appEn, 'zh-CN': appZhCn, 'zh-TW': appZhTw, ja: appJa }
const ERROR_SOURCES: Record<string, string> = { en: errorsEn, 'zh-CN': errorsZhCn, 'zh-TW': errorsZhTw, ja: errorsJa }

type Catalog = Record<string, string>

/* The editor's own strings are shipped as locale files, so the site eats what it serves. */
function buildCatalogs(sources: Record<string, string>, format: string): Record<string, Catalog> {
  const catalogs: Record<string, Catalog> = {}
  for (const [locale, source] of Object.entries(sources)) {
    const catalog: Catalog = {}
    for (const entry of flatten(getParser(format).parse(source))) catalog[entry.key] = entry.value
    catalogs[locale] = catalog
  }
  return catalogs
}

const appCatalogs = buildCatalogs(APP_SOURCES, 'yaml')
const errorCatalogs = buildCatalogs(ERROR_SOURCES, 'json')

export const AVAILABLE_UI_LOCALES = Object.keys(APP_SOURCES)

const state = reactive({ locale: DEFAULT_UI_LOCALE })

export const uiLocale = computed(() => state.locale)

function resolve(locale: string, key: string): string | undefined {
  if (key.startsWith(ERROR_NAMESPACE)) return errorCatalogs[locale]?.[key.slice(ERROR_NAMESPACE.length)]
  return appCatalogs[locale]?.[key]
}

export function hasKey(key: string): boolean {
  return resolve(DEFAULT_UI_LOCALE, key) !== undefined
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = resolve(state.locale, key) ?? resolve(DEFAULT_UI_LOCALE, key) ?? key
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

export function tp(base: string, count: number, params: Record<string, string | number> = {}): string {
  const suffixed = `${base}.${count === 1 ? 'one' : 'other'}`
  return t(hasKey(suffixed) ? suffixed : base, { count, ...params })
}

export function matchLocale(candidate?: string | null): string | null {
  if (!candidate) return null
  if (AVAILABLE_UI_LOCALES.includes(candidate)) return candidate
  const primary = candidate.split('-')[0].toLowerCase()
  return (
    AVAILABLE_UI_LOCALES.find((locale) => locale.toLowerCase() === primary) ??
    AVAILABLE_UI_LOCALES.find((locale) => locale.split('-')[0].toLowerCase() === primary) ??
    null
  )
}

/* Order of preference: explicit ?lang=, stored choice, browser language, source language. */
export function pickUiLocale(candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const matched = matchLocale(candidate)
    if (matched) return matched
  }
  return DEFAULT_UI_LOCALE
}

export function setUiLocale(locale: string): void {
  const matched = matchLocale(locale)
  if (!matched || matched === state.locale) return
  state.locale = matched
  persistUiLocale(matched)
  applyDocumentLanguage(matched)
}

export function initialiseUiLocale(href: string): void {
  const requested = readQueryLocale(href)
  const locale = pickUiLocale([requested, readStoredLocale(), readBrowserLocale()])
  state.locale = locale
  applyDocumentLanguage(locale)
  if (!requested) persistUiLocale(locale)
}

function readQueryLocale(href: string): string | null {
  try {
    return new URL(href).searchParams.get('lang')
  } catch {
    return null
  }
}

function readStoredLocale(): string | null {
  try {
    return globalThis.localStorage?.getItem(UI_LOCALE_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function readBrowserLocale(): string | null {
  return globalThis.navigator?.language ?? null
}

function persistUiLocale(locale: string): void {
  try {
    globalThis.localStorage?.setItem(UI_LOCALE_STORAGE_KEY, locale)
  } catch {
    /* storage disabled: the choice simply does not survive a reload */
  }
}

function applyDocumentLanguage(locale: string): void {
  if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = locale
}
