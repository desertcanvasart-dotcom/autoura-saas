// ============================================
// OAUTH REDIRECT CONFIGURATION CHECK
// ============================================
// A wrong GOOGLE_REDIRECT_URI used to surface only AFTER the operator had gone
// through Google's consent screen: Google honours whatever redirect the app
// asked for (as long as it is registered), so a stale localhost value sent a
// real customer to a dead browser tab with ERR_CONNECTION_REFUSED and no clue
// which of app, Railway or Google Console was at fault.
//
// This turns that into one message before the operator leaves the product, and
// — just as usefully — reports the value the running instance actually has, so
// a config change can be confirmed from the outside without shell access.

export interface RedirectCheck {
  ok: boolean
  /** What the running instance will send to Google. */
  redirectUri: string | null
  error?: string
  /** Safe to show an operator: names the variable and the expected value. */
  hint?: string
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return null
  }
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const isLocal = (host: string) => LOCAL_HOSTS.some(h => host === h || host.startsWith(`${h}:`))

/**
 * Verify the OAuth redirect the app is about to send.
 *
 * `appUrl` is NEXT_PUBLIC_APP_URL — the origin the product is actually served
 * from. The two must agree, because Google redirects to whatever we send and
 * the operator's browser has to be able to reach it.
 */
export function checkGoogleRedirect(
  redirectUri: string | null | undefined,
  appUrl: string | null | undefined
): RedirectCheck {
  const uri = (redirectUri ?? '').trim()

  if (!uri) {
    return {
      ok: false,
      redirectUri: null,
      error: 'Gmail connection is not configured.',
      hint: 'GOOGLE_REDIRECT_URI is not set on this deployment.',
    }
  }

  // Whitespace is the failure that looks like success: the value reads correctly
  // in a dashboard but no longer matches the Google Console entry byte for byte,
  // and Google answers redirect_uri_mismatch.
  if (uri !== redirectUri) {
    return {
      ok: false,
      redirectUri: uri,
      error: 'Gmail connection is misconfigured.',
      hint: 'GOOGLE_REDIRECT_URI has leading or trailing whitespace, so it will not match the value registered in Google Cloud Console.',
    }
  }

  const uriHost = hostOf(uri)
  if (!uriHost) {
    return {
      ok: false,
      redirectUri: uri,
      error: 'Gmail connection is misconfigured.',
      hint: `GOOGLE_REDIRECT_URI is not a valid URL: "${uri}"`,
    }
  }

  if (!uri.includes('/api/auth/google/callback')) {
    return {
      ok: false,
      redirectUri: uri,
      error: 'Gmail connection is misconfigured.',
      hint: `GOOGLE_REDIRECT_URI must end in /api/auth/google/callback — it is currently "${uri}".`,
    }
  }

  const appHost = hostOf(appUrl ?? '')

  // The case that actually happened: production still pointing at localhost.
  if (isLocal(uriHost) && appHost && !isLocal(appHost)) {
    return {
      ok: false,
      redirectUri: uri,
      error: 'Gmail connection is misconfigured.',
      hint:
        `GOOGLE_REDIRECT_URI still points to ${uriHost}, but this deployment is served from ` +
        `${appHost}. Set it to ${appUrl}/api/auth/google/callback and make sure that exact URL ` +
        `is listed under Authorized redirect URIs in Google Cloud Console.`,
    }
  }

  // A mismatched non-local host is just as broken, and harder to spot by eye.
  if (appHost && !isLocal(appHost) && uriHost !== appHost) {
    return {
      ok: false,
      redirectUri: uri,
      error: 'Gmail connection is misconfigured.',
      hint:
        `GOOGLE_REDIRECT_URI points at ${uriHost} but this deployment is served from ${appHost}. ` +
        `Google will send the operator to ${uriHost}, which is not this app.`,
    }
  }

  return { ok: true, redirectUri: uri }
}

/**
 * Base URL for redirecting a browser back into the app after OAuth.
 *
 * NOT `request.url`. Railway terminates TLS at its proxy and forwards to the
 * container on PORT (8080), so inside the handler `request.url` is
 * `http://localhost:8080/...` — an address the operator's browser cannot reach.
 * Redirecting off it sent a real customer to ERR_CONNECTION_REFUSED *after* a
 * successful Google sign-in, with the tokens already saved, which reads exactly
 * like the OAuth failure it is not.
 *
 * NEXT_PUBLIC_APP_URL is trusted configuration. The forwarded-host headers are
 * deliberately not used: they are attacker-controllable, and this value decides
 * where a browser carrying a fresh session lands.
 */
export function appRedirectBase(
  appUrl: string | null | undefined,
  requestUrl: string
): string {
  const configured = (appUrl ?? '').trim()
  if (!configured) return requestUrl
  try {
    // Must parse, or a typo would throw inside new URL() and 500 the callback.
    new URL(configured)
    return configured
  } catch {
    return requestUrl
  }
}
