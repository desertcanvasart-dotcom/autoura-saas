import { NextResponse, type NextRequest } from 'next/server'
import { getClientIdentifier } from '@/lib/rate-limit'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'

// ============================================
// Rate limits on the public supplier routes (audit SN-2 / SN-3)
// ============================================
// Sign-in is counted per address AND per phone, before the phone is looked
// up: a known supplier's number and a number nobody has hit the same limit
// and get the same answer, so the limit itself can't tell them apart.

export const SIGN_IN_SLOW_DOWN = 'Too many tries — please wait 15 minutes and try again'

function tooMany(message: string, resetTime: number) {
  const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))
  return NextResponse.json({ success: false, error: message }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
}

/** null = go ahead; otherwise the 429 to send back (the same for every phone). */
export async function supplierSignInLimited(request: NextRequest, phone: string, step: 'code' | 'verify'): Promise<NextResponse | null> {
  const byIp = await checkSharedRateLimit(`supplier-sign-in:${getClientIdentifier(request)}`, 'supplierSignInIp')
  if (!byIp.success) return tooMany(SIGN_IN_SLOW_DOWN, byIp.resetTime)
  const byPhone = await checkSharedRateLimit(`supplier-${step}:${phone}`, step === 'code' ? 'supplierCodePhone' : 'supplierVerifyPhone')
  if (!byPhone.success) return tooMany(SIGN_IN_SLOW_DOWN, byPhone.resetTime)
  return null
}

/** Taps on a supplier's reply link or own page, per address. */
export async function supplierLinkLimited(request: NextRequest): Promise<NextResponse | null> {
  const byIp = await checkSharedRateLimit(`supplier-link:${getClientIdentifier(request)}`, 'supplierLink')
  return byIp.success ? null : tooMany('Too many taps — please wait a minute and try again', byIp.resetTime)
}
