// ============================================
// A search term inside a PostgREST .or() filter
// ============================================
// `.or(\`name.ilike.%${search}%\`)` puts raw user text into PostgREST's filter
// grammar, where `,` separates conditions and `(` `)` group them. Searching
// "Smith, John" or "(Cairo)" produced a malformed filter and a 500.
//
// A double-quoted value is taken literally (PostgREST reserved characters
// included); inside it `"` and `\` are backslash-escaped. LIKE's own
// wildcards `%` and `_` are escaped too, so the term matches as typed.

/** `"%term%"` — a quoted, wildcard-escaped ILIKE pattern for `.or()`. */
export function orIlikeContains(term: string): string {
  const like = term.replace(/[\\%_]/g, ch => `\\${ch}`)
  return `"%${like.replace(/["\\]/g, ch => `\\${ch}`)}%"`
}
