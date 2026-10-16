import { NextResponse } from 'next/server'
import { isInvalidGrant } from '@/lib/gmail-revoke'

/**
 * A 401 telling the page to ask for a reconnect, when Google refused the
 * stored grant; null for any other error. Without it a revoked or expired
 * Google sign-in surfaced as a bare 500 with no way forward.
 */
export function gmailReconnectResponse(err: unknown): NextResponse | null {
  if (!isInvalidGrant(err)) return null
  return NextResponse.json(
    { success: false, reconnect: true, error: 'Your Google sign-in for Gmail has expired or was revoked. Reconnect Gmail in Settings → Email.' },
    { status: 401 },
  )
}
