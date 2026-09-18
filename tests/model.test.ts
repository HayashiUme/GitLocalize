import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROJECT_CONFIG,
  deriveLanguages,
  detectSiteTarget,
  languageFromPath,
  matchGlob,
  normalizeConfig,
  targetPathForSource,
  toTranslationFile,
} from '../src/config'
import { GitHubApiError, classifyError, codeForStatus } from '../src/github/errors'
import { assertSameHead } from '../src/github/gitData'
import { encodeRepoPath } from '../src/github/api'
import { canMaintain, canWrite, isAtLeast, rank } from '../src/github/permissions'
import { defaultPullRequestBody } from '../src/github/pullRequests'

describe('locale path handling', () => {
  it('reads the language and format from a file name', () => {
    expect(languageFromPath('locales/app.zh-CN.yml')).toBe('zh-CN')
    expect(languageFromPath('locales/errors.ja.json')).toBe('ja')
    expect(languageFromPath('locales/app.yml')).toBeNull()
  })

  it('derives the target path for a language', () => {
    expect(targetPathForSource('locales/app.en.yml', 'zh-TW')).toBe('locales/app.zh-TW.yml')
    expect(targetPathForSource('locales/errors.en.json', 'ja')).toBe('locales/errors.ja.json')
  })

  it('builds a translation file descriptor', () => {
    expect(toTranslationFile('locales/app.ja.yml')).toEqual({
      path: 'locales/app.ja.yml',
      language: 'ja',
      format: 'yaml',
    })
    expect(toTranslationFile('README.md')).toBeNull()
  })
})

describe('glob matching', () => {
  it('matches the configured patterns', () => {
    expect(matchGlob('locales/app.en.yml', 'locales/*.yml')).toBe(true)
    expect(matchGlob('locales/nested/app.en.yml', 'locales/*.yml')).toBe(false)
    expect(matchGlob('locales/nested/app.en.yml', 'locales/**/*.yml')).toBe(true)
    expect(matchGlob('locales/app.en.json', 'locales/*.yml')).toBe(false)
  })
})

describe('config normalisation', () => {
  it('falls back to defaults for missing fields', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_PROJECT_CONFIG)
  })

  it('keeps declared values and ignores unknown language entries', () => {
    const config = normalizeConfig({ languages: ['de', 42], branch: { translation: 'work' } })
    expect(config.languages).toEqual(['de'])
    expect(config.branch.translation).toBe('work')
    expect(config.branch.main).toBe('main')
  })
})

describe('language discovery', () => {
  const files = ['app.en.yml', 'app.de.yml', 'app.ja.yml', 'app.zh-CN.yml'].map((name) =>
    toTranslationFile(`locales/${name}`)!,
  )

  it('infers languages from file names and excludes the source language', () => {
    expect(deriveLanguages(files, DEFAULT_PROJECT_CONFIG)).toEqual(['de', 'ja', 'zh-CN'])
  })

  it('prefers the declared language list', () => {
    const config = { ...DEFAULT_PROJECT_CONFIG, languages: ['zh-CN'] }
    expect(deriveLanguages(files, config)).toEqual(['zh-CN'])
  })
})

describe('pages target detection', () => {
  it('reads owner and repository from a project pages URL', () => {
    const target = detectSiteTarget('https://hayashi.github.io/GitLocalize/editor.html')
    expect(target).toMatchObject({ owner: 'hayashi', repo: 'GitLocalize', translationBranch: 'i18n' })
  })

  it('handles a user pages URL without a path segment', () => {
    const target = detectSiteTarget('https://hayashi.github.io/')
    expect(target).toMatchObject({ owner: 'hayashi', repo: 'hayashi.github.io' })
  })

  it('returns null for a URL that carries no repository information', () => {
    expect(detectSiteTarget('not a url')).toBeNull()
  })
})

describe('error taxonomy', () => {
  it('maps status codes', () => {
    expect(codeForStatus(401)).toBe('unauthorized')
    expect(codeForStatus(409)).toBe('conflict')
    expect(codeForStatus(503)).toBe('server')
  })

  it('prefers body markers over the bare status', () => {
    expect(classifyError(403, 'API rate limit exceeded', '')).toBe('rate-limited')
    expect(classifyError(403, 'Resource not accessible by personal access token', '')).toBe('forbidden')
  })

  it('exposes conflict and sign-in helpers', () => {
    expect(new GitHubApiError(409, 'conflict', 'x').isConflict).toBe(true)
    expect(new GitHubApiError(401, 'unauthorized', 'x').requiresSignIn).toBe(true)
  })
})

describe('permission helpers', () => {
  it('orders permission levels', () => {
    expect(rank('admin')).toBeGreaterThan(rank('write'))
    expect(isAtLeast('maintain', 'write')).toBe(true)
    expect(canWrite('read')).toBe(false)
    expect(canMaintain('maintain')).toBe(true)
  })
})

describe('git data guards', () => {
  it('rejects a commit whose base moved', () => {
    expect(() => assertSameHead('new', 'old', 'i18n')).toThrow(GitHubApiError)
    expect(() => assertSameHead('same', 'same', 'i18n')).not.toThrow()
  })

  it('encodes repository paths segment by segment', () => {
    expect(encodeRepoPath('locales/app.zh-CN.yml')).toBe('locales/app.zh-CN.yml')
    expect(encodeRepoPath('.github/i18n.yml')).toBe('.github/i18n.yml')
  })
})

describe('pull request body', () => {
  it('lists languages and files', () => {
    const body = defaultPullRequestBody(['locales/app.zh-CN.yml'], ['zh-CN'], 'i18n')
    expect(body).toContain('## Translation Update')
    expect(body).toContain('- zh-CN')
    expect(body).toContain('`locales/app.zh-CN.yml`')
  })
})
