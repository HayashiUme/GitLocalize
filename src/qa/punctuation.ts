/* Weblate-style end-of-string punctuation matching, tolerant of CJK variants:
   a question stays a question in every language, even when the glyph changes. */

interface FinalRule {
  code: string
  source: RegExp
  accept: RegExp
}

const FINALS: FinalRule[] = [
  { code: 'ellipsis', source: /…$/, accept: /(?:…|\.{3})$/ },
  { code: 'ellipsis', source: /\.{3}$/, accept: /(?:…|\.{3})$/ },
  { code: 'colon', source: /:$/, accept: /[:：]$/ },
  { code: 'question', source: /\?$/, accept: /[?？]$/ },
  { code: 'exclamation', source: /!$/, accept: /[!！]$/ },
  { code: 'semicolon', source: /;$/, accept: /[;；]$/ },
  { code: 'stop', source: /\.$/, accept: /(?:\.|。)$/, },
]

export function diffEndingPunctuation(source: string, translation: string): string | null {
  const trimmedSource = source.trim()
  const trimmedTarget = translation.trim()
  for (const rule of FINALS) {
    if (rule.source.test(trimmedSource) && !rule.accept.test(trimmedTarget)) return rule.code
  }
  return null
}
