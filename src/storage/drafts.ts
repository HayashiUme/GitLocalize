const PREFIX = 'gitlocalize.draft.v1.'

export interface DraftRecord {
  key: string
  savedAt: number
  baseSha: string
  overrides: Record<string, string>
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/* Drafts hold translation text only; access tokens are deliberately never written to local storage. */
export function saveDraft(key: string, baseSha: string, overrides: Record<string, string>): void {
  const store = storage()
  if (!store) return
  const record: DraftRecord = { key, savedAt: Date.now(), baseSha, overrides }
  try {
    store.setItem(`${PREFIX}${key}`, JSON.stringify(record))
  } catch {
    /* quota exceeded: drafts are best effort */
  }
}

export function loadDraft(key: string): DraftRecord | null {
  const store = storage()
  if (!store) return null
  const raw = store.getItem(`${PREFIX}${key}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DraftRecord
  } catch {
    store.removeItem(`${PREFIX}${key}`)
    return null
  }
}

export function clearDraft(key: string): void {
  storage()?.removeItem(`${PREFIX}${key}`)
}

export function listDrafts(): DraftRecord[] {
  const store = storage()
  if (!store) return []
  const records: DraftRecord[] = []
  for (let index = 0; index < store.length; index += 1) {
    const storageKey = store.key(index)
    if (!storageKey || !storageKey.startsWith(PREFIX)) continue
    const record = loadDraft(storageKey.slice(PREFIX.length))
    if (record) records.push(record)
  }
  return records.sort((left, right) => right.savedAt - left.savedAt)
}
