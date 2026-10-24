import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_CONFIG, normalizeConfig } from '../src/config'
import {
  directoriesFromGlobs,
  directoryFromMask,
  languageFromMaskedPath,
  normalizeMask,
  validateMask,
} from '../src/config/filemask'

describe('normalizeConfig', () => {
  it('keeps the legacy schema byte for byte', () => {
    const legacy = {
      source: { language: 'ja', directory: 'translations' },
      languages: ['zh-CN', 'ja'],
      files: ['translations/*.yaml'],
      branch: { translation: 'l10n', main: 'develop' },
      pullRequest: { title: 'l10n: sync' },
      editor: { rememberToken: true, deviceFlowClientId: 'abc' },
    }
    const config = normalizeConfig(legacy)
    expect(config.source).toEqual({ language: 'ja', directory: 'translations' })
    expect(config.languages).toEqual(['zh-CN', 'ja'])
    expect(config.files).toEqual(['translations/*.yaml'])
    expect(config.branch).toEqual({ translation: 'l10n', main: 'develop' })
    expect(config.pullRequest.title).toEqual('l10n: sync')
    expect(config.commitMessage).toEqual(DEFAULT_PROJECT_CONFIG.commitMessage)
    expect(config.editor?.rememberToken).toBe(true)
  })

  it('maps the Weblate-style project file onto the runtime config', () => {
    const config = normalizeConfig({
      vcs: 'github',
      repo: 'acme/site',
      branch: 'develop',
      push_branch: 'l10n',
      file_format: 'yaml',
      filemask: 'locales/app.*.yml',
      template: 'locales/app.en.yml',
      source_language: 'en',
      languages: [
        { code: 'zh-CN', name: '简体中文' },
        { code: 'ja', name: '日本語' },
      ],
      commit_message: 'l10n(%language%): sync',
      pull_message: 'Translations for %language%',
      create_merge_request: true,
    })
    expect(config.files).toEqual(['locales/app.*.yml'])
    expect(config.source).toEqual({ language: 'en', directory: 'locales' })
    expect(config.languages).toEqual(['zh-CN', 'ja'])
    expect(config.languageNames).toEqual({ 'zh-CN': '简体中文', ja: '日本語' })
    expect(config.branch).toEqual({ main: 'develop', translation: 'l10n' })
    expect(config.pullRequest.title).toEqual('Translations for %language%')
    expect(config.commitMessage).toEqual('l10n(%language%): sync')
  })

  it('derives the directory from the mask when none is declared', () => {
    const config = normalizeConfig({ filemask: 'src/i18n/messages.*.json', push_branch: 'i18n' })
    expect(config.source.directory).toEqual('src/i18n')
    expect(config.files).toEqual(['src/i18n/messages.*.json'])
  })

  it('falls back to defaults for an invalid mask', () => {
    const config = normalizeConfig({ filemask: 'locales/app.en.yml', push_branch: 'i18n' })
    expect(config.files).toEqual(DEFAULT_PROJECT_CONFIG.files)
  })

  it('treats a read-only project (empty push_branch) as the base branch', () => {
    const config = normalizeConfig({ filemask: 'locales/app.*.yml', branch: 'main', push_branch: '' })
    expect(config.branch.translation).toEqual('main')
    expect(config.branch.main).toEqual('main')
  })
})

describe('file masks', () => {
  it('normalises all three placeholder styles', () => {
    expect(normalizeMask('locales/app.*.yml')).toEqual('locales/app.*.yml')
    expect(normalizeMask('locales/app.{language}.yml')).toEqual('locales/app.*.yml')
    expect(normalizeMask('locales/app.%language%.yml')).toEqual('locales/app.*.yml')
  })

  it('validates the placeholder count', () => {
    expect(validateMask('locales/app.*.yml')).toBeNull()
    expect(validateMask('locales/app.{language}.yml')).toBeNull()
    expect(validateMask('locales/app.en.yml')).toMatch(/must contain/)
    expect(validateMask('*/*.yml')).toMatch(/exactly one/)
  })

  it('extracts directory and language from a concrete path', () => {
    expect(directoryFromMask('locales/app.*.yml')).toEqual('locales')
    expect(directoryFromMask('app.*.yml')).toEqual('.')
    expect(languageFromMaskedPath('locales/app.zh-CN.yml', 'locales/app.*.yml')).toEqual('zh-CN')
    expect(languageFromMaskedPath('locales/app.zh-CN.yml', 'locales/other.*.yml')).toBeNull()
  })

  it('collects distinct directories for multi-component projects', () => {
    expect(directoriesFromGlobs(['locales/app.*.yml', 'locales/errors.*.json', 'web/ui.*.json'])).toEqual([
      'locales',
      'web',
    ])
  })
})
