/* Content-level suspicions: an untranslated string hiding as a translation, or doubled words. */

const REPEATED_WORD = /\b(\p{Lu}\p{Ll}{1,}|\p{Ll}{2,})(\s+\1)+\b/u

/* Identifiers, URLs, numbers and short tokens are legitimately kept as-is in translations. */
export function isLikelyIdentifier(source: string): boolean {
  const trimmed = source.trim()
  if (trimmed.length <= 2) return true
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(trimmed)) return true
  if (/^[\p{Nd}\s.,%:+\-/()]+$/u.test(trimmed)) return true
  /* Single camelCase / kebab-case / UPPER token without spaces: a key or brand name. */
  if (!trimmed.includes(' ') && /^[A-Za-z][\w.-]*$/.test(trimmed)) return true
  /* No word starts lowercase ("GitHub Actions", "OK HTTP"): a proper-noun phrase, not prose. */
  if (trimmed.split(/\s+/).every((word) => /^[A-Z0-9][\w.-]*$/.test(word))) return true
  return false
}

export function findTextIssues(source: string, translation: string): { code: string; detail?: string }[] {
  const issues: { code: string; detail?: string }[] = []
  const trimmedSource = source.trim()
  const trimmedTarget = translation.trim()
  if (trimmedSource === trimmedTarget && !isLikelyIdentifier(trimmedSource)) {
    issues.push({ code: 'same-as-source' })
  }
  const repeated = trimmedTarget.match(REPEATED_WORD)
  if (repeated) issues.push({ code: 'repeated-word', detail: repeated[0] })
  return issues
}
