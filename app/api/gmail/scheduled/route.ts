import { NextRequest, NextResponse } from 'next/server'
import { mailboxForSession } from '@/lib/gmail-mailbox'
import { parseRecipients } from '@/lib/email/compose-mime'
import { scheduleTimeProblem } from '@/lib/email/scheduled-send'

// ============================================
// Schedule send — the person's own scheduled emails
// ============================================
// GET     the Scheduled list (waiting, and recent failures)
// POST    { draftId, sendAt } — send this saved draft at that time
// DELETE  ?id=… — cancel; the draft stays in Drafts to edit or send
//
// The email is the Gmail draft the composer saved; /api/cron/scheduled-send
// sends it when it is due (migration 421).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

const LIST_COLUMNS = 'id, gmail_draft_id, gmail_thread_id, send_at, status, to_summary, subject, error, created_at'

export async function GET(request: NextRequest) {
  const session = await mailboxForSession(request.nextUrl.searchParams.get('userId'))
  if (!session.ok) return session.response
  const db = session.admin as unknown as Db
  const { data, error } = await db
    .from('scheduled_emails')
    .select(LIST_COLUMNS)
    .eq('tenant_id', session.tenantId)
    .eq('user_id', session.userId)
    .in('status', ['pending', 'sending', 'failed'])
    .order('send_at', { ascending: true })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ scheduled: data ?? [] })
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}))
    const session = await mailboxForSession(payload.userId)
    if (!session.ok) return session.response

    const problem = scheduleTimeProblem(payload.sendAt)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    const draftId = String(payload.draftId ?? '')
    if (!draftId) return NextResponse.json({ error: 'Save the message first' }, { status: 400 })

    // The draft is what will be sent: check it has someone to go to now,
    // rather than failing silently at the scheduled time.
    const { data: draft } = await session.gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'metadata' })
    const headers = draft.message?.payload?.headers ?? []
    const h = (n: string) => headers.find(x => x.name?.toLowerCase() === n.toLowerCase())?.value ?? ''
    const to = parseRecipients(h('To'))
    if (to.valid.length === 0) return NextResponse.json({ error: 'Add at least one recipient' }, { status: 400 })
    const invalid = [...to.invalid, ...parseRecipients(h('Cc')).invalid, ...parseRecipients(h('Bcc')).invalid]
    if (invalid.length) return NextResponse.json({ error: `Not an email address: ${invalid.slice(0, 5).join(', ')}` }, { status: 400 })

    const row = {
      tenant_id: session.tenantId,
      user_id: session.userId,
      gmail_draft_id: draftId,
      gmail_thread_id: draft.message?.threadId ?? null,
      send_at: new Date(payload.sendAt).toISOString(),
      status: 'pending',
      to_summary: to.valid.join(', ').slice(0, 500),
      subject: h('Subject').slice(0, 500) || null,
      error: null,
      updated_at: new Date().toISOString(),
    }
    const db = session.admin as unknown as Db
    // Rescheduling the same draft moves its time rather than adding a second.
    const { data: existing } = await db
      .from('scheduled_emails')
      .select('id, status')
      .eq('user_id', session.userId)
      .eq('gmail_draft_id', draftId)
      .in('status', ['pending', 'sending'])
      .maybeSingle()
    if (existing?.status === 'sending') {
      return NextResponse.json({ error: 'This email is being sent right now' }, { status: 409 })
    }
    const { data, error } = existing
      ? await db.from('scheduled_emails').update(row).eq('id', existing.id).select(LIST_COLUMNS).single()
      : await db.from('scheduled_emails').insert(row).select(LIST_COLUMNS).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ scheduled: data })
  } catch (err) {
    const e = err as { code?: number; message?: string }
    if (e?.code === 404) return NextResponse.json({ error: 'The draft was not found — it may have been sent or deleted' }, { status: 404 })
    console.error('Schedule send error:', e?.message || err)
    return NextResponse.json({ error: e?.message || 'Could not schedule the email' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await mailboxForSession(request.nextUrl.searchParams.get('userId'))
  if (!session.ok) return session.response
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const db = session.admin as unknown as Db
  // Only a waiting (or failed) one can be cancelled: one being sent is past it.
  const { data, error } = await db
    .from('scheduled_emails')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', session.tenantId)
    .eq('user_id', session.userId)
    .in('status', ['pending', 'failed'])
    .select('id, gmail_draft_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Too late to cancel — it is being sent or already went' }, { status: 409 })
  }
  return NextResponse.json({ success: true, draftId: data[0].gmail_draft_id })
}
