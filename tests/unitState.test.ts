import { describe, expect, it } from 'vitest'
import {
  canTransition,
  isFuzzy,
  isUnitStateName,
  parseUnitKey,
  stateForTranslation,
  unitKey,
} from '../src/state/unitState'
import {
  mergeStateFiles,
  parseStateFile,
  pruneStateFile,
  serializeStateFile,
  statePathForLanguage,
} from '../src/state/stateStore'

describe('unit states', () => {
  it('allows the transitions a translator performs', () => {
    expect(canTransition('empty', 'translated')).toBe(true)
    expect(canTransition('translated', 'approved')).toBe(true)
    expect(canTransition('approved', 'needs-editing')).toBe(true)
    expect(canTransition('translated', 'needs-editing')).toBe(true)
  })

  it('forbids skipping the review step and resurrecting read-only strings', () => {
    expect(canTransition('empty', 'approved')).toBe(false)
    expect(canTransition('translated', 'needs-rewriting')).toBe(true)
    expect(canTransition('read-only', 'translated')).toBe(false)
  })

  it('derives the state from the saved value', () => {
    expect(stateForTranslation('', 'translated', false)).toBe('empty')
    expect(stateForTranslation('x', 'empty', false)).toBe('translated')
    expect(stateForTranslation('x', 'needs-editing', false)).toBe('translated')
    expect(stateForTranslation('x', 'approved', true)).toBe('approved')
    expect(stateForTranslation('x', 'read-only', false)).toBe('read-only')
  })

  it('treats fuzzy states as incomplete', () => {
    expect(isFuzzy('needs-editing')).toBe(true)
    expect(isFuzzy('translated')).toBe(false)
    expect(isUnitStateName('approved')).toBe(true)
    expect(isUnitStateName('published')).toBe(false)
  })

  it('builds and parses stable unit ids', () => {
    expect(unitKey('locales/app.zh-CN.yml', 'nav.title')).toBe('locales/app.zh-CN.yml#nav.title')
    expect(parseUnitKey('locales/app.zh-CN.yml#nav.title')).toEqual({
      path: 'locales/app.zh-CN.yml',
      key: 'nav.title',
    })
    expect(parseUnitKey('loose')).toEqual({ path: '', key: 'loose' })
  })
})

describe('state files', () => {
  it('round-trips through json', () => {
    const file = parseStateFile(
      JSON.stringify({
        version: 1,
        units: { 'a.yml#k': { state: 'needs-editing', by: 'me', at: '2026-10-24T00:00:00Z' } },
      }),
    )
    expect(file.units['a.yml#k'].state).toBe('needs-editing')
    const again = parseStateFile(serializeStateFile(file))
    expect(again.units).toEqual(file.units)
  })

  it('ignores corrupt input and unknown states', () => {
    expect(parseStateFile('not json').units).toEqual({})
    expect(parseStateFile(JSON.stringify({ units: { k: { state: 'nope' } } })).units).toEqual({})
  })

  it('keeps the newer record when merging', () => {
    const base = parseStateFile(JSON.stringify({ units: { k: { state: 'translated', at: '1' } } }))
    const incoming = parseStateFile(JSON.stringify({ units: { k: { state: 'approved', at: '2' } } }))
    expect(mergeStateFiles(base, incoming).units.k.state).toBe('approved')
    const older = parseStateFile(JSON.stringify({ units: { k: { state: 'empty', at: '0' } } }))
    expect(mergeStateFiles(base, older).units.k.state).toBe('translated')
  })

  it('drops entries whose key disappeared', () => {
    const file = parseStateFile(JSON.stringify({ units: { k: { state: 'translated' }, gone: { state: 'translated' } } }))
    expect(pruneStateFile(file, new Set(['k'])).units.k).toBeDefined()
    expect(pruneStateFile(file, new Set(['k'])).units.gone).toBeUndefined()
  })

  it('names the file after the language', () => {
    expect(statePathForLanguage('zh-CN')).toBe('.gitlocalize/state/zh-CN.json')
  })
})
