// ============================================
// Who may send a message to a client, and how many
// ============================================
// Every route that sends an email or a WhatsApp message on a company's
// behalf: staff and above only (a viewer reads), and a ceiling per person and
// per company, counted in the database (lib/rate-limit-shared) so a deploy
// does not reset it. Without it, one stuck retry loop, script or compromised
// login could send thousands of messages from the shared sending domain or
// WhatsApp number — and get them suspended for every company.
//
// Returns the response to send back, or null to carry on. An unauthenticated
// request is left to the route's own auth check (null here).

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'
import { rateLimitResponse } from '@/lib/rate-limit'

export type SendChannel = 'email' | 'messaging'

export async function sendGuard(channel: SendChannel): Promise<NextResponse | null> {
  const auth = await requireAuth()
  if (auth.error !== null) return null
  const denied = roleDenied(auth.role, 'staff')
  if (denied) return denied
  const person = await checkSharedRateLimit(auth.user.id, channel)
  if (!person.success) return rateLimitResponse(person)
  const company = await checkSharedRateLimit(auth.tenant_id, channel === 'email' ? 'emailCompany' : 'messagingCompany')
  if (!company.success) return rateLimitResponse(company)
  return null
}
