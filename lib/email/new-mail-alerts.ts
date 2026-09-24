import type { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase-server'
import { notifyUserOnce } from '@/lib/notifications'
import { senderName } from '@/lib/email-sender-name'

// Unread Primary emails from the last day that the bell has not announced yet
// become one notification each ("New email from X" / the subject), which also
// rings the owner's phone/desktop (lib/notifications notifyUserOnce → push).
// Runs from two places, both harmless to repeat:
//   - the badge check while Autoura is open (POST /api/gmail/poll, each tab,
//     once a minute), and
//   - the server every 5 minutes (/api/cron/mail-alerts) — so mail is
//     announced while nobody has Autoura open (operator, 2026-09-24).
// Rules:
//   - Last day only, newest 10: the first run after connecting, or after a
//     week away, must not bury the bell under old mail.
//   - Once per message, guaranteed by the (user_id, dedupe_key) unique index
//     (migration 384) — two tabs racing insert the same key, one is ignored.
//   - Already-announced ids are filtered BEFORE asking Gmail for headers, so
//     a quiet inbox costs one list call, not ten message reads, per check.
const MAX_NEW_PER_CHECK = 10

export async function notifyNewEmails(gmail: ReturnType<typeof google.gmail>, userId: string) {
  const recent = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX', 'CATEGORY_PERSONAL', 'UNREAD'],
    q: 'newer_than:1d',
    maxResults: MAX_NEW_PER_CHECK,
    fields: 'messages/id',
  })
  const ids = (recent.data.messages ?? []).map(m => m.id).filter((id): id is string => !!id)
  if (ids.length === 0) return

  const keys = ids.map(id => `gmail:${id}`)
  const { data: done } = await createAdminClient()
    .from('notifications')
    .select('dedupe_key')
    .eq('user_id', userId)
    .in('dedupe_key', keys)
  const announced = new Set((done ?? []).map(r => r.dedupe_key))

  for (const id of ids) {
    if (announced.has(`gmail:${id}`)) continue
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject'],
    })
    const header = (name: string) =>
      msg.data.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
    await notifyUserOnce({
      user_id: userId,
      dedupe_key: `gmail:${id}`,
      type: 'new_email',
      title: `New email from ${senderName(header('From'))}`,
      message: header('Subject') || '(no subject)',
      link: '/inbox',
    })
  }
}

