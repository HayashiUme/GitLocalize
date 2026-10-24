/* File masks follow Weblate's convention: exactly one placeholder stands for the language code.
   Older GitLocalize setups used {language}, Weblate uses *, some tools write %language%.
   Everything is normalised to the glob form because the editor matches files with globs. */

const PLACEHOLDER_PATTERN = /\{language\}|%language%|\*/g

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function hasPlaceholder(mask: string): boolean {
  return new RegExp(PLACEHOLDER_PATTERN.source).test(mask)
}

export function countPlaceholders(mask: string): number {
  return (mask.match(PLACEHOLDER_PATTERN) ?? []).length
}

export function normalizeMask(mask: string): string {
  return mask.replace(/\{language\}|%language%/g, '*')
}

export function validateMask(mask: string): string | null {
  if (!mask.trim()) return 'the file mask is required'
  const count = countPlaceholders(mask)
  if (count === 0) return 'the file mask must contain *, {language} or %language%'
  if (count > 1) return 'the file mask must contain exactly one language placeholder'
  return null
}

/** The glob passed to the file listing: "locales/app.*.yml" keeps its glob star. */
export function maskToGlob(mask: string): string {
  return normalizeMask(mask)
}

/** Directory part of a mask, e.g. "locales/app.*.yml" -> "locales". */
export function directoryFromMask(mask: string): string {
  const index = mask.lastIndexOf('/')
  return index < 0 ? '.' : mask.slice(0, index)
}

/** All distinct directories referenced by a set of globs, in declaration order. */
export function directoriesFromGlobs(files: string[]): string[] {
  const directories = new Set<string>()
  for (const pattern of files) {
    const index = pattern.lastIndexOf('/')
    directories.add(index < 0 ? '.' : pattern.slice(0, index))
  }
  return [...directories]
}

/** Extract the language code from a concrete path given its mask. */
export function languageFromMaskedPath(path: string, mask: string): string | null {
  const normalized = normalizeMask(mask)
  if (!normalized.includes('*')) return null
  const parts = normalized.split('*').map(escapeRegExp)
  const match = path.match(new RegExp(`^${parts.join('([^/]+)')}$`))
  return match ? match[1] : null
}
