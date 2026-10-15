import { NextRequest, NextResponse } from 'next/server'
import { mailboxForSession } from '@/lib/gmail-mailbox'
import { MAX_ACTION_IDS } from '@/lib/email/mail-actions'

// GET /api/gmail/ids?query=…&labelId=…
// Every email in a folder or search — not just the loaded page — for "Select
// all N". Ids only (Gmail lists 500 a page), up to MAX_ACTION_IDS; `truncated`
// says there were more than that.
export async function GET(request: NextRequest) {
  try {
    const session = await mailboxForSession(request.nextUrl.searchParams.get('userId'))
    if (!session.ok) return session.response
    const query = request.nextUrl.searchParams.get('query') || ''
    const labelId = request.nextUrl.searchParams.get('labelId') || undefined

    const ids: string[] = []
    let pageToken: string | undefined
    let truncated = false
    do {
      const { data } = await session.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 500,
        ...(labelId ? { labelIds: [labelId] } : {}),
        ...(pageToken ? { pageToken } : {}),
      })
      for (const m of data.messages ?? []) if (m.id) ids.push(m.id)
      pageToken = data.nextPageToken ?? undefined
      if (ids.length >= MAX_ACTION_IDS) {
        truncated = Boolean(pageToken) || ids.length > MAX_ACTION_IDS
        break
      }
    } while (pageToken)

    return NextResponse.json({ ids: ids.slice(0, MAX_ACTION_IDS), truncated })
  } catch (err) {
    const e = err as { message?: string }
    console.error('List ids error:', e?.message || err)
    return NextResponse.json({ error: e?.message || 'Could not list the emails' }, { status: 500 })
  }
}
