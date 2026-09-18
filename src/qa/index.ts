import type { QaIssue, TranslationEntry } from '../types'
import { diffTags } from './htmlTags'
import { diffPlaceholders } from './placeholders'

export function qaCheckEntry(entry: TranslationEntry): QaIssue[] {
  const issues: QaIssue[] = []
  const translation = entry.translation ?? ''

  if (entry.source.trim() !== '' && translation.trim() === '') {
    issues.push({ key: entry.key, code: 'empty-translation', message: 'Untranslated' })
    return issues
  }
  if (translation.trim() === '') return issues

  const placeholders = diffPlaceholders(entry.source, translation)
  for (const token of placeholders.missing) {
    issues.push({
      key: entry.key,
      code: 'placeholder-missing',
      message: `Missing placeholder: ${token}`,
      detail: token,
    })
  }
  for (const token of placeholders.extra) {
    issues.push({
      key: entry.key,
      code: 'placeholder-extra',
      message: `Unexpected placeholder: ${token}`,
      detail: token,
    })
  }

  const tags = diffTags(entry.source, translation)
  for (const tag of tags.missing) {
    issues.push({ key: entry.key, code: 'html-tag-missing', message: `Missing HTML tag: <${tag}>`, detail: tag })
  }
  for (const tag of tags.extra) {
    issues.push({ key: entry.key, code: 'html-tag-extra', message: `Unexpected HTML tag: <${tag}>`, detail: tag })
  }
  return issues
}

export function qaCheckEntries(entries: TranslationEntry[]): QaIssue[] {
  return entries.flatMap(qaCheckEntry)
}

export function groupIssuesByKey(issues: QaIssue[]): Map<string, QaIssue[]> {
  const grouped = new Map<string, QaIssue[]>()
  for (const issue of issues) {
    const list = grouped.get(issue.key) ?? []
    list.push(issue)
    grouped.set(issue.key, list)
  }
  return grouped
}

export type { QaIssue } from '../types'
