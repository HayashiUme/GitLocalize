/* Layout-level parity: newlines, edge spaces, and invisible characters that break rendering. */

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/

export function diffWhitespace(source: string, translation: string): { code: string; detail?: string }[] {
  const issues: { code: string; detail?: string }[] = []
  const sourceNewlines = (source.match(/\n/g) ?? []).length
  const targetNewlines = (translation.match(/\n/g) ?? []).length
  if (sourceNewlines !== targetNewlines) {
    issues.push({ code: 'newline-count', detail: String(sourceNewlines) })
  }
  if (/^\s/.test(source) && !/^\s/.test(translation)) {
    issues.push({ code: 'space-mismatch', detail: 'leading' })
  }
  if (/\s$/.test(source) && !/\s$/.test(translation)) {
    issues.push({ code: 'space-mismatch', detail: 'trailing' })
  }
  const invisible = translation.match(ZERO_WIDTH)
  if (invisible) issues.push({ code: 'zero-width-space' })
  return issues
}
