import type { RawDocument, ScalarKind } from '../types'

export interface FlatEntry {
  key: string
  path: (string | number)[]
  value: string
  raw: unknown
  kind: ScalarKind
}

const ARRAY_INDEX = /^\d+$/

export function scalarKind(value: unknown): ScalarKind | null {
  if (typeof value === 'string') return value.includes('\n') ? 'multiline' : 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (value === null) return 'null'
  return null
}

export function joinPath(path: (string | number)[]): string {
  return path.map((segment) => String(segment)).join('.')
}

export function splitPath(key: string): (string | number)[] {
  if (key === '') return []
  return key.split('.').map((segment) => (ARRAY_INDEX.test(segment) ? Number(segment) : segment))
}

/* Walks a parsed document and emits one flat entry per scalar leaf, keeping the key path. */
export function flatten(value: unknown, prefix: (string | number)[] = []): FlatEntry[] {
  const kind = scalarKind(value)
  if (kind) {
    return [
      {
        key: joinPath(prefix),
        path: prefix,
        value: value === null ? '' : String(value),
        raw: value,
        kind,
      },
    ]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flatten(item, [...prefix, index]))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as RawDocument).flatMap(([key, child]) => flatten(child, [...prefix, key]))
  }
  return []
}

function containerFor(nextSegment: string | number): unknown {
  return typeof nextSegment === 'number' ? [] : {}
}

/* Writes a single value into a nested clone-free document, creating containers on demand. */
export function setPath(document: RawDocument, path: (string | number)[], value: unknown): void {
  if (path.length === 0) return
  let cursor: any = document
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const next = path[index + 1]
    if (cursor[segment] === undefined || cursor[segment] === null || typeof cursor[segment] !== 'object') {
      cursor[segment] = containerFor(next)
    }
    cursor = cursor[segment]
  }
  cursor[path[path.length - 1]] = value
}

export function getPath(document: unknown, path: (string | number)[]): unknown {
  let cursor: any = document
  for (const segment of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = cursor[segment]
  }
  return cursor
}

export function deletePath(document: RawDocument, path: (string | number)[]): void {
  if (path.length === 0) return
  const parent = getPath(document, path.slice(0, -1))
  if (parent && typeof parent === 'object') {
    delete (parent as RawDocument)[path[path.length - 1] as string]
  }
}

export function cloneDocument<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}
