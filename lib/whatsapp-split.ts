// ============================================================================
// A message longer than one WhatsApp message may be
// ============================================================================
// Twilio refuses a body over 1,600 characters and Meta over 4,096, with an
// error the sender could only answer by cutting the text up by hand (seen
// live, 2026-11-11). The app now does the cutting: at a paragraph break when
// one fits, else a line break, else the end of a sentence, else a space — never
// mid-word unless a single "word" is longer than the limit (a long link).
//
// Pure, and safe to use in the browser.

export const TWILIO_TEXT_LIMIT = 1600
export const META_TEXT_LIMIT = 4096

/** The parts, in order, each at most `limit` characters; [] for an empty text. */
export function splitWhatsAppText(text: string, limit: number): string[] {
  const body = String(text ?? '')
  if (!body.trim()) return []
  if (body.length <= limit) return [body]

  const parts: string[] = []
  let rest = body
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1)
    const cut = lastBreak(window, limit)
    const part = rest.slice(0, cut).trimEnd()
    if (part) parts.push(part)
    rest = rest.slice(cut).replace(/^\s+/, '')
  }
  if (rest.trim()) parts.push(rest)
  return parts
}

/** Where to cut `window` (its first `limit` characters may be kept). */
function lastBreak(window: string, limit: number): number {
  // Not so early that the first part is a sliver: at least a third of the limit.
  const floor = Math.floor(limit / 3)
  const candidates: Array<RegExp> = [/\n\s*\n/g, /\n/g, /[.!?。！？](?=\s)/g, /\s/g]
  for (const pattern of candidates) {
    let best = -1
    for (const m of window.matchAll(pattern)) {
      const end = (m.index ?? 0) + m[0].length
      if (end <= limit && end >= floor) best = end
    }
    if (best > 0) return best
  }
  return limit
}
