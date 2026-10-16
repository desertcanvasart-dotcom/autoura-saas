import { gmailReconnectResponse } from '@/lib/gmail-reconnect'
import { NextRequest, NextResponse } from 'next/server'
import { parseEmailMessage } from '@/lib/gmail'
import { mailboxForSession } from '@/lib/gmail-mailbox'

// GET /api/gmail/threads?threadId=…
// Every message of one Gmail conversation, oldest first — what the inbox shows
// when an email is opened. Drafts are left out: a draft reply is opened from
// Drafts, not read as part of the conversation.
export async function GET(request: NextRequest) {
  try {
    const session = await mailboxForSession(request.nextUrl.searchParams.get('userId'))
    if (!session.ok) return session.response

    const threadId = request.nextUrl.searchParams.get('threadId')
    if (!threadId) return NextResponse.json({ error: 'threadId required' }, { status: 400 })

    const { data } = await session.gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
    const messages = (data.messages ?? [])
      .filter(m => !(m.labelIds ?? []).includes('DRAFT'))
      .sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0))
      .map(m => parseEmailMessage(m))

    return NextResponse.json({ threadId, messages })
  } catch (err) {
    const reconnect = gmailReconnectResponse(err)
    if (reconnect) return reconnect
    const e = err as { code?: number; message?: string }
    if (e?.code === 404) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    console.error('Thread fetch error:', e?.message || err)
    return NextResponse.json({ error: e?.message || 'Could not load the conversation' }, { status: 500 })
  }
}
