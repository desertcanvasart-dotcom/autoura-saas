// ============================================
// A Gmail connection Google no longer honours
// ============================================
// When someone revokes Autoura's access in their Google account (or the
// grant expires), every sync of that mailbox fails with invalid_grant — and
// the gmail-sync and mail-alerts jobs counted it a failure on every run,
// forever, so one person's revoke turned the jobs red and hid real outages.
// The connection is useless: its row is removed (so the jobs stop trying),
// and its owner is told once, in the app, to reconnect.

import { createAdminClient } from '@/lib/supabase-server'

export async function forgetRevokedMailbox(userId: string, tenantId: string | null, email: string | null): Promise<void> {
  const admin = createAdminClient()
  let del = admin.from('gmail_tokens').delete().eq('user_id', userId)
  del = tenantId ? del.eq('tenant_id', tenantId) : del.is('tenant_id', null)
  const { error } = await del
  if (error) console.error('gmail-dead-grant: could not remove the connection', error.message)

  // One notice per mailbox (dedupe_key, migration 384): a second job run
  // before they reconnect does not tell them twice.
  const { error: noteError } = await admin.from('notifications').insert({
    user_id: userId,
    dedupe_key: `gmail:disconnected:${tenantId ?? 'none'}:${email ?? ''}`,
    type: 'gmail_disconnected',
    title: 'Gmail disconnected',
    message: `Google no longer allows Autoura to read ${email ?? 'your mailbox'}. Reconnect it in Settings → Email to keep your inbox in sync.`,
    link: '/settings/email',
  })
  if (noteError && noteError.code !== '23505') {
    console.error('gmail-dead-grant: could not notify', noteError.message)
  }
}
