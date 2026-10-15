import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { mailboxForSession } from '@/lib/gmail-mailbox'
import { GMAIL_LABEL_COLORS } from '@/lib/email/label-colors'

// One Gmail client per request (lib/gmail getGmailClient). A module-level
// OAuth2 client used to be shared by every request: setCredentials() for user
// A, then user B's request set B's tokens before A's Gmail call ran, so A
// could act in — or send from — B's mailbox (documents audit, round 12).

// GET - Fetch all labels
export async function GET(request: NextRequest) {
  try {
    // Authenticate user first (session + active tenant membership)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const user = authResult.user!
    // The mailbox of the company being worked in (migration 415: one per
    // person per company).
    const mailboxTenant = authResult.tenant_id!
    const supabase = createAdminClient()

    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData, error: tokenError } = await (supabase as any)
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', mailboxTenant)
      .maybeSingle()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      await (supabase as any)
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
        })
        .eq('user_id', userId)
        .eq('tenant_id', mailboxTenant)
    }

    const gmail = getGmailClient(access_token, refresh_token)

    // One folder, with how many emails it holds (the delete confirmation).
    const oneLabel = request.nextUrl.searchParams.get('labelId')
    if (oneLabel) {
      const { data } = await gmail.users.labels.get({ userId: 'me', id: oneLabel })
      return NextResponse.json({ label: data })
    }

    const response = await gmail.users.labels.list({ userId: 'me' })
    
    // Filter to show only user-created labels and some system labels
    const labels = response.data.labels?.filter(label => 
      label.type === 'user' || 
      ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'STARRED', 'IMPORTANT'].includes(label.id || '')
    ) || []

    return NextResponse.json({ labels })
  } catch (err: any) {
    console.error('Get labels error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST - Create new label
export async function POST(request: NextRequest) {
  try {
    // Authenticate user first (session + active tenant membership)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const user = authResult.user!
    // The mailbox of the company being worked in (migration 415: one per
    // person per company).
    const mailboxTenant = authResult.tenant_id!
    const supabase = createAdminClient()

    const { userId, name, backgroundColor, textColor } = await request.json()

    if (!userId || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData, error: tokenError } = await (supabase as any)
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', mailboxTenant)
      .maybeSingle()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!
    }

    const gmail = getGmailClient(access_token, refresh_token)

    const response = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
        color: backgroundColor && textColor ? {
          backgroundColor,
          textColor,
        } : undefined,
      },
    })

    return NextResponse.json({ label: response.data })
  } catch (err: any) {
    console.error('Create label error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ============================================
// Rename, recolour and delete a folder
// ============================================
// A folder is a Gmail label. Renaming one renames its subfolders too (Gmail
// stores "Clients/Smith" as its own label). Deleting one first moves every
// email in it back to the Inbox, so nothing filed there is lost from view —
// Gmail itself would just drop the label and leave archived mail hidden.

/** Most emails a folder delete moves back to the Inbox in one go. */
const MAX_MOVE_ON_DELETE = 10_000


function cleanLabelName(name: unknown): string | null {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim()
  if (!n || n.length > 225) return null
  if (/^(inbox|sent|drafts?|spam|trash|starred|important|chats?|unread)$/i.test(n)) return null
  return n
}

function labelError(err: unknown, fallback: string) {
  const e = err as { code?: number; message?: string }
  if (e?.code === 409) return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
  if (e?.code === 404) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  console.error(fallback, e?.message || err)
  return NextResponse.json({ error: e?.message || fallback }, { status: 500 })
}

// PATCH { labelId, name?, color? } — rename and/or recolour.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const session = await mailboxForSession(body.userId)
    if (!session.ok) return session.response
    const { gmail } = session
    const labelId = String(body.labelId ?? '')
    if (!labelId) return NextResponse.json({ error: 'labelId required' }, { status: 400 })

    const { data: current } = await gmail.users.labels.get({ userId: 'me', id: labelId })
    if (current.type !== 'user') return NextResponse.json({ error: 'Only your own folders can be changed' }, { status: 400 })

    const requestBody: { name?: string; color?: { backgroundColor: string; textColor: string } } = {}
    if (body.name !== undefined) {
      const name = cleanLabelName(body.name)
      if (!name) return NextResponse.json({ error: 'Choose a different folder name' }, { status: 400 })
      requestBody.name = name
    }
    if (body.color !== undefined) {
      const c = GMAIL_LABEL_COLORS.find(x => x.backgroundColor === body.color?.backgroundColor)
      if (!c) return NextResponse.json({ error: 'Choose one of the folder colours' }, { status: 400 })
      requestBody.color = c
    }
    if (!requestBody.name && !requestBody.color) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

    const { data: label } = await gmail.users.labels.patch({ userId: 'me', id: labelId, requestBody })

    // Subfolders follow a renamed parent: "Old/Child" becomes "New/Child".
    let renamedChildren = 0
    const oldName = current.name ?? ''
    if (requestBody.name && oldName && requestBody.name !== oldName) {
      const { data: all } = await gmail.users.labels.list({ userId: 'me' })
      for (const child of all.labels ?? []) {
        if (child.type !== 'user' || !child.id || !child.name?.startsWith(`${oldName}/`)) continue
        await gmail.users.labels.patch({
          userId: 'me', id: child.id, requestBody: { name: requestBody.name + child.name.slice(oldName.length) },
        })
        renamedChildren++
      }
    }
    return NextResponse.json({ label, renamedChildren })
  } catch (err) {
    return labelError(err, 'Could not change the folder')
  }
}

// DELETE { labelId } — move its emails back to the Inbox, then delete it.
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const session = await mailboxForSession(body.userId)
    if (!session.ok) return session.response
    const { gmail } = session
    const labelId = String(body.labelId ?? '')
    if (!labelId) return NextResponse.json({ error: 'labelId required' }, { status: 400 })

    const { data: label } = await gmail.users.labels.get({ userId: 'me', id: labelId })
    if (label.type !== 'user') return NextResponse.json({ error: 'Only your own folders can be deleted' }, { status: 400 })

    // Every email in the folder (not Spam or Trash — those stay where they are).
    const ids: string[] = []
    let pageToken: string | undefined
    do {
      const { data } = await gmail.users.messages.list({
        userId: 'me', labelIds: [labelId], maxResults: 500, ...(pageToken ? { pageToken } : {}),
      })
      for (const m of data.messages ?? []) if (m.id) ids.push(m.id)
      pageToken = data.nextPageToken ?? undefined
      if (ids.length > MAX_MOVE_ON_DELETE) {
        return NextResponse.json(
          { error: `This folder holds more than ${MAX_MOVE_ON_DELETE.toLocaleString()} emails. Move some out first, then delete it.` },
          { status: 413 }
        )
      }
    } while (pageToken)

    // Back to the Inbox first; only then is the folder removed.
    for (let i = 0; i < ids.length; i += 1000) {
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: ['INBOX'], removeLabelIds: [labelId] },
      })
    }
    await gmail.users.labels.delete({ userId: 'me', id: labelId })

    return NextResponse.json({ success: true, movedToInbox: ids.length })
  } catch (err) {
    return labelError(err, 'Could not delete the folder')
  }
}
