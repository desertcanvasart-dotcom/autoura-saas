// ============================================
// What the app sent on WhatsApp, and whether it arrived (migration 430)
// ============================================
// Best-effort throughout: recording must never turn a successful send into a
// failure, and a callback must never 500 because of it.

import { createAdminClient, createAuthenticatedClient } from '@/lib/supabase-server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- table newer than the generated client types in some installs
type Db = any

/** The signed-in user behind this request, if any (null for webhooks/jobs). */
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await (await createAuthenticatedClient()).auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

export async function recordOutboundWhatsApp(input: {
  tenantId: string | null
  messageSid: string
  to: string
  body: string
}): Promise<void> {
  try {
    const db: Db = createAdminClient()
    const { error } = await db.from('whatsapp_outbound').insert({
      tenant_id: input.tenantId,
      message_sid: input.messageSid,
      to_number: input.to,
      body_preview: input.body.slice(0, 200),
      sent_by: await currentUserId(),
    })
    if (error && error.code !== '23505') console.error('whatsapp-outbound: could not record send', error.message)
  } catch (err) {
    console.error('whatsapp-outbound: could not record send', err)
  }
}

/** Why a WhatsApp failed, in words an operator can act on. */
export function failureReason(errorCode: string | null | undefined, errorMessage: string | null | undefined): string {
  const code = String(errorCode ?? '')
  if (code === '63016' || code === '131047') {
    return 'the client has not messaged you in the last 24 hours, so WhatsApp only allows an approved template. Send it by email, or ask the client to message you first.'
  }
  if (code === '63003' || code === '131026') return 'the number is not on WhatsApp.'
  return errorMessage ? String(errorMessage).slice(0, 200) : 'WhatsApp did not deliver it.'
}

/**
 * Apply a delivery update to the outbound record; on failure, tell the person
 * who sent it. Returns true when a record matched.
 */
export async function applyOutboundStatus(update: {
  messageSid: string
  status: string
  errorCode?: string | null
  errorMessage?: string | null
}): Promise<boolean> {
  try {
    const db: Db = createAdminClient()
    const failed = update.status === 'failed' || update.status === 'undelivered'
    const { data: rows, error } = await db
      .from('whatsapp_outbound')
      .update({
        status: update.status,
        ...(failed ? { error_code: update.errorCode ?? null, error_message: update.errorMessage ?? null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('message_sid', update.messageSid)
      .neq('status', 'failed')
      .select('tenant_id, to_number, body_preview, sent_by')
    if (error || !rows || rows.length === 0) return false
    const row = rows[0] as { tenant_id: string | null; to_number: string; body_preview: string | null; sent_by: string | null }
    if (failed && row.sent_by && row.tenant_id) {
      const { data: member } = await db
        .from('team_members')
        .select('id')
        .eq('tenant_id', row.tenant_id)
        .eq('user_id', row.sent_by)
        .maybeSingle()
      if (member?.id) {
        const { createNotification } = await import('@/lib/notifications')
        await createNotification({
          team_member_id: member.id,
          type: 'whatsapp_failed',
          title: `WhatsApp to ${row.to_number} was not delivered`,
          message: `"${(row.body_preview ?? '').slice(0, 80)}…" — ${failureReason(update.errorCode, update.errorMessage)}`,
          send_email: true,
        })
      }
    }
    return true
  } catch (err) {
    console.error('whatsapp-outbound: could not apply status', err)
    return false
  }
}
