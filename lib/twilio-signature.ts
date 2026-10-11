// ============================================
// Which URL Twilio signed
// ============================================
// Twilio signs each webhook over the exact URL it was configured with. Behind
// Railway the request reaches Next.js with an internal URL, and the public
// host arrives in x-forwarded-*; and Twilio may be configured with the www or
// the bare address. Checking request.url alone could reject every genuine
// webhook. Every form is tried; any match is Twilio. (travel-ops-pro lost its
// inbound WhatsApp to exactly this when a www redirect was added — round 14.)

import twilio from 'twilio'
import type { NextRequest } from 'next/server'

/** The URLs Twilio may have signed for this request. */
export function twilioSignatureUrls(request: Pick<NextRequest, 'headers' | 'url'>): string[] {
  const { pathname, search } = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const app = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const urls = [
    request.url,
    host ? `${proto}://${host}${pathname}${search}` : null,
    app ? `${app}${pathname}${search}` : null,
    // The www and the bare form of the app's address.
    app && !app.includes('://www.') ? `${app.replace('://', '://www.')}${pathname}${search}` : null,
    app && app.includes('://www.') ? `${app.replace('://www.', '://')}${pathname}${search}` : null,
  ]
  return [...new Set(urls.filter((u): u is string => !!u))]
}

/** True when the signature matches any URL Twilio may have signed. */
export function isValidTwilioSignature(
  authToken: string,
  signature: string,
  request: Pick<NextRequest, 'headers' | 'url'>,
  params: Record<string, string>
): boolean {
  return twilioSignatureUrls(request).some(url => twilio.validateRequest(authToken, signature, url, params))
}
