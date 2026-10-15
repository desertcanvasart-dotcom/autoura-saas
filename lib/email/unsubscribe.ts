// ============================================
// Unsubscribe from a newsletter (List-Unsubscribe)
// ============================================
// Newsletters that support it say how to unsubscribe in their headers
// (RFC 2369), and many support a one-click POST (RFC 8058). The inbox shows
// "Unsubscribe" on such an email and uses, in order of preference:
//   1. one-click: POST "List-Unsubscribe=One-Click" to the https link
//   2. the https link, opened for the person to confirm on the sender's page
//   3. the mailto: address, sent an unsubscribe email from their mailbox
// The request is made by the person's browser (or their own mailbox), never
// by our server, so a link in an email cannot make our server call anything.

export type UnsubscribeMethod =
  | { kind: 'oneClick'; url: string }
  | { kind: 'link'; url: string }
  | { kind: 'mailto'; to: string; subject: string; body: string }

function httpsUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

function mailto(raw: string): { to: string; subject: string; body: string } | null {
  if (!/^mailto:/i.test(raw)) return null
  const rest = raw.slice('mailto:'.length)
  const [addrPart, query = ''] = rest.split('?')
  const to = decodeURIComponent(addrPart).trim()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) return null
  const params = new URLSearchParams(query)
  return { to, subject: params.get('subject') || 'unsubscribe', body: params.get('body') || 'unsubscribe' }
}

/** How to unsubscribe from this email, or null when it does not say. */
export function unsubscribeMethod(listUnsubscribe?: string | null, listUnsubscribePost?: string | null): UnsubscribeMethod | null {
  if (!listUnsubscribe) return null
  const targets = [...listUnsubscribe.matchAll(/<([^>]+)>/g)].map(m => m[1].trim())
  const https = targets.map(httpsUrl).find((u): u is string => Boolean(u))
  const oneClick = /List-Unsubscribe=One-Click/i.test(listUnsubscribePost ?? '')
  if (https && oneClick) return { kind: 'oneClick', url: https }
  if (https) return { kind: 'link', url: https }
  const mail = targets.map(mailto).find(Boolean)
  return mail ? { kind: 'mailto', ...mail } : null
}
