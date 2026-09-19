import type { QaIssue, TranslationEntry } from '../types'
import { diffTags } from './htmlTags'
import { diffPlaceholders } from './placeholders'
import { diffEndingPunctuation } from './punctuation'
import { findTextIssues, isLikelyIdentifier } from './textQuality'
import { diffWhitespace } from './whitespace'

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

  const punctuation = diffEndingPunctuation(entry.source, translation)
  if (punctuation) {
    issues.push({
      key: entry.key,
      code: 'punctuation-missing',
      message: `The sentence-ending punctuation does not match the source (${punctuation})`,
      detail: punctuation,
    })
  }

  for (const finding of diffWhitespace(entry.source, translation)) {
    issues.push({
      key: entry.key,
      code: finding.code,
      message: `Whitespace mismatch: ${finding.detail ?? 'invisible character'}`,
      detail: finding.detail,
    })
  }

  for (const finding of findTextIssues(entry.source, translation)) {
    issues.push({
      key: entry.key,
      code: finding.code,
      message: `Suspect content: ${finding.detail ?? 'identical to the source'}`,
      detail: finding.detail,
    })
  }

  return issues
}

/* Weblate's inconsistency check: one source translated differently within the same file. */
function consistencyIssues(entries: TranslationEntry[]): QaIssue[] {
  const variants = new Map<string, Map<string, string[]>>()
  for (const entry of entries) {
    if (!entry.translated) continue
    const source = entry.source.trim()
    if (!source || isLikelyIdentifier(source)) continue
    const translation = (entry.translation ?? '').trim()
    if (!translation) continue
    const bucket = variants.get(source) ?? new Map<string, string[]>()
    const keys = bucket.get(translation) ?? []
    keys.push(entry.key)
    bucket.set(translation, keys)
    variants.set(source, bucket)
  }

  const issues: QaIssue[] = []
  for (const bucket of variants.values()) {
    if (bucket.size < 2) continue
    for (const keys of bucket.values()) {
      for (const key of keys) {
        issues.push({
          key,
          code: 'inconsistent',
          message: `The same source string is translated ${bucket.size} different ways in this file`,
          detail: String(bucket.size),
        })
      }
    }
  }
  return issues
}

export function qaCheckEntries(entries: TranslationEntry[]): QaIssue[] {
  return [...entries.flatMap(qaCheckEntry), ...consistencyIssues(entries)]
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
