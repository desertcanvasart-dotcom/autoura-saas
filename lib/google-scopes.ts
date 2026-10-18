// ============================================
// Did Google grant every scope we asked for?
// ============================================
// Google's granular consent screen lets the user untick individual
// permissions — "send email on your behalf" off, say — and still finishes the
// OAuth flow with a valid token. The callback saved that token as a working
// Gmail connection, and the first send or sync then failed with a 403 nobody
// could trace back to the consent screen (documents audit, round 12).

// Google may report the userinfo scopes by their short names.
const SHORT_NAMES: Record<string, string> = {
  email: 'https://www.googleapis.com/auth/userinfo.email',
  profile: 'https://www.googleapis.com/auth/userinfo.profile',
}

/**
 * The requested scopes missing from the token's granted `scope` string
 * (space-separated, as Google returns it). An absent scope string cannot be
 * checked and reports nothing missing — Google always sends one, so this only
 * keeps a provider quirk from refusing every connection.
 */
export function missingGoogleScopes(
  granted: string | null | undefined,
  required: readonly string[]
): string[] {
  if (granted == null) return []
  const have = new Set(
    granted.split(/\s+/).filter(Boolean).map(s => SHORT_NAMES[s] ?? s)
  )
  return required.filter(s => !have.has(SHORT_NAMES[s] ?? s))
}
