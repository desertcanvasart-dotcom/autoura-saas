// ============================================================================
// One-time: copy every Twilio-hosted WhatsApp attachment into our own storage.
//
//   npx tsx --env-file=.env.local scripts/keep-whatsapp-media.ts          (dry run: lists them)
//   npx tsx --env-file=.env.local scripts/keep-whatsapp-media.ts --apply  (copies them)
//
// Until 2026-11-13 the Twilio webhook stored only Twilio's link to a file a
// customer sent; the inbox fetched it from Twilio on every view. From now on
// the webhook keeps its own copy as the message arrives
// (lib/whatsapp/keep-inbound-media.ts). This copies the ones that came before,
// with that same function, into the PRIVATE whatsapp-media bucket at
// inbound/<sid>.<ext>, and points each row at its copy. The Twilio link stays
// on the row as the fallback.
//
// Run AFTER the code that reads media_storage_path for these rows is
// deployed. Idempotent: a row that already has a copy is skipped.
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (.env.local has them).
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { keepTwilioMedia } from '../lib/whatsapp/keep-inbound-media'

const apply = process.argv.includes('--apply')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  const admin = createClient(url, key)

  const rows: Array<{ message_sid: string; media_url: string | null; media_type: string | null; created_at: string }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('whatsapp_messages')
      .select('message_sid, media_url, media_type, created_at')
      .is('media_storage_path', null)
      .like('media_url', 'https://api.twilio.com/%')
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`reading messages: ${error.message}`)
    rows.push(...(data ?? []).filter(r => r.message_sid))
    if (!data || data.length < 1000) break
  }

  console.log(`${rows.length} Twilio-hosted attachment(s) without our own copy${apply ? '' : ' — dry run, pass --apply to copy them'}`)
  let copied = 0
  for (const r of rows) {
    const line = `${r.created_at.slice(0, 16)}  ${r.media_type ?? '?'}`
    if (!apply) { console.log(line); continue }
    const res = await keepTwilioMedia(admin as never, r)
    if (res.ok) copied++
    console.log(`${line}  → ${res.ok ? 'copied' : `NOT copied (${res.reason})`}`)
  }
  if (apply) console.log(`Done: ${copied} of ${rows.length} copied.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
