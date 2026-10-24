/* Per-language state files: .gitlocalize/state/<lang>.json on the translation branch.
   Keeping one file per language limits merge conflicts to the people editing that language,
   and makes the file diffable in review. */

import { isUnitStateName, parseUnitKey, type UnitStateName } from './unitState'

export interface UnitStateRecord {
  state: UnitStateName
  by?: string
  at?: string
}

export interface StateFile {
  version: 1
  units: Record<string, UnitStateRecord>
}

export const STATE_FILE_VERSION = 1

export function parseStateFile(text: string): StateFile {
  try {
    const parsed = JSON.parse(text) as Partial<StateFile>
    const units: Record<string, UnitStateRecord> = {}
    for (const [id, record] of Object.entries(parsed.units ?? {})) {
      if (!record || !isUnitStateName(record.state)) continue
      units[id] = { state: record.state, by: record.by, at: record.at }
    }
    return { version: STATE_FILE_VERSION, units }
  } catch {
    return { version: STATE_FILE_VERSION, units: {} }
  }
}

export function serializeStateFile(file: StateFile): string {
  const sorted: Record<string, UnitStateRecord> = {}
  for (const id of Object.keys(file.units).sort()) sorted[id] = file.units[id]
  return JSON.stringify({ version: STATE_FILE_VERSION, units: sorted }, null, 2) + '\n'
}

export function statePathForLanguage(language: string): string {
  return `.gitlocalize/state/${language}.json`
}

/** Merge two versions of the same file: the newer record wins, unknown records are kept. */
export function mergeStateFiles(base: StateFile, incoming: StateFile): StateFile {
  const merged: StateFile = { version: STATE_FILE_VERSION, units: { ...base.units } }
  for (const [id, record] of Object.entries(incoming.units)) {
    const current = merged.units[id]
    if (!current || (record.at ?? '') >= (current.at ?? '')) merged.units[id] = record
  }
  return merged
}

/** Entries whose key no longer exists in the file are dropped, so the file cannot grow forever. */
export function pruneStateFile(file: StateFile, liveKeys: Set<string>): StateFile {
  const units: Record<string, UnitStateRecord> = {}
  for (const [id, record] of Object.entries(file.units)) {
    if (liveKeys.has(id)) units[id] = record
  }
  return { version: STATE_FILE_VERSION, units }
}

/** Keys that carry a state worth showing, keyed by unit id. */
export function stateMap(file: StateFile): Map<string, UnitStateRecord> {
  return new Map(Object.entries(file.units))
}

export { parseUnitKey }
