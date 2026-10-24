/* Unit states follow Weblate's model: one machine readable state per string, plus the
   transitions a translator may actually perform. Fuzzy states (needs editing / rewriting /
   checking) mean "not ready to ship"; approved is set by a reviewer, never by the editor. */

export type UnitStateName =
  | 'empty'
  | 'needs-editing'
  | 'needs-rewriting'
  | 'needs-checking'
  | 'translated'
  | 'approved'
  | 'read-only'

export const FUZZY_STATES: UnitStateName[] = ['needs-editing', 'needs-rewriting', 'needs-checking']

export const UNIT_STATES: UnitStateName[] = [
  'empty',
  'needs-editing',
  'needs-rewriting',
  'needs-checking',
  'translated',
  'approved',
  'read-only',
]

/** Legal transitions, mirroring weblate/utils/state.py plus unit.py's save path. */
const TRANSITIONS: Record<UnitStateName, UnitStateName[]> = {
  empty: ['translated', 'needs-editing', 'read-only'],
  'needs-editing': ['translated', 'approved', 'empty', 'read-only'],
  'needs-rewriting': ['translated', 'needs-editing', 'read-only'],
  'needs-checking': ['translated', 'needs-editing', 'read-only'],
  translated: ['approved', 'needs-editing', 'needs-rewriting', 'read-only', 'empty'],
  approved: ['translated', 'needs-editing', 'read-only'],
  'read-only': [],
}

export function canTransition(from: UnitStateName, to: UnitStateName): boolean {
  return TRANSITIONS[from].includes(to)
}

/** The state a string earns when its translation is saved, before any explicit marking. */
export function stateForTranslation(value: string, current: UnitStateName, reviewEnabled: boolean): UnitStateName {
  if (value.trim() === '') return 'empty'
  if (current === 'read-only') return 'read-only'
  if (current === 'approved') return reviewEnabled ? 'approved' : 'translated'
  return 'translated'
}

/** Weblate calls these "fuzzy": saved, but not fit to merge without a look. */
export function isFuzzy(state: UnitStateName): boolean {
  return FUZZY_STATES.includes(state)
}

/** Only non fuzzy states count towards progress, and approved counts as reviewed. */
export function isComplete(state: UnitStateName): boolean {
  return state === 'translated' || state === 'approved'
}

/** Stable identity for a unit: the file it lives in plus its key inside that file. */
export function unitKey(path: string, key: string): string {
  return `${path}#${key}`
}

export function parseUnitKey(id: string): { path: string; key: string } {
  const index = id.indexOf('#')
  return index < 0 ? { path: '', key: id } : { path: id.slice(0, index), key: id.slice(index + 1) }
}

export function isUnitStateName(value: unknown): value is UnitStateName {
  return typeof value === 'string' && (UNIT_STATES as string[]).includes(value)
}
