// Where a page's back arrow goes.
//
// Pages a trip leads to (its booking, invoice, contract, supplier documents)
// used to hard-wire their back arrow to their own list, so leaving a trip
// lost it: back from the booking landed on Bookings, and getting back to the
// trip meant the sidebar and a search. A link out of a trip now carries
// `?from=<path>`, and the page it opens goes back there.
//
// `from` is read from the URL, so it is only ever a path on this site: never
// a full URL, a protocol-relative "//host", or a "/\host" some browsers read
// as one — the back arrow must not become an open redirect.

export const FROM_PARAM = 'from'

/** The value as a same-site path, or null. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 500) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  return value
}

/** `href` with `?from=<from>` added (kept before any #hash). */
export function withReturnTo(href: string, from: string | null | undefined): string {
  const safe = safeReturnPath(from)
  if (!safe) return href
  const hashAt = href.indexOf('#')
  const path = hashAt === -1 ? href : href.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : href.slice(hashAt)
  return `${path}${path.includes('?') ? '&' : '?'}${FROM_PARAM}=${encodeURIComponent(safe)}${hash}`
}

/** The trip a return path is, when it is one: /itineraries/<id> or its edit page. */
export function tripIdOfPath(path: string | null | undefined): string | null {
  const m = path ? /^\/itineraries\/([^/?#]+)(?:\/edit)?\/?(?:[?#]|$)/.exec(path) : null
  if (!m || m[1] === 'new') return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}
