import { NextRequest, NextResponse } from 'next/server'
import type { gmail_v1 } from 'googleapis'
import { parseEmailMessage } from '@/lib/gmail'
import { mailboxForSession } from '@/lib/gmail-mailbox'
import { buildRawEmail, parseRecipients, type OutgoingAttachment } from '@/lib/email/compose-mime'
import { replyHeaders } from '@/lib/email/threading'

// ============================================
// Saved drafts — Gmail's own Drafts
// ============================================
// The composer saves as you write (POST, debounced) and a draft opened from
// Drafts carries on where it was left (GET), attachments included. They are
// Gmail drafts, not a table of our own: they show in Gmail too, attachments
// live in the mailbox, and a scheduled send is a draft with a time on it.

/** Largest total attachment size a draft takes (Gmail's own limit is 25 MB). */
const MAX_DRAFT_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** The draft id behind a message id (what the Drafts list shows). */
async function draftIdForMessage(gmail: gmail_v1.Gmail, messageId: string): Promise<string | null> {
  let pageToken: string | undefined
  do {
    const { data } = await gmail.users.drafts.list({ userId: 'me', maxResults: 500, ...(pageToken ? { pageToken } : {}) })
    const hit = (data.drafts ?? []).find(d => d.message?.id === messageId)
    if (hit?.id) return hit.id
    pageToken = data.nextPageToken ?? undefined
  } while (pageToken)
  return null
}

function attachmentParts(part: gmail_v1.Schema$MessagePart | undefined, out: gmail_v1.Schema$MessagePart[] = []) {
  if (!part) return out
  if (part.filename && part.body?.attachmentId) out.push(part)
  for (const p of part.parts ?? []) attachmentParts(p, out)
  return out
}

// GET ?draftId=… or ?messageId=… — the draft, ready to keep editing.
export async function GET(request: NextRequest) {
  try {
    const session = await mailboxForSession(request.nextUrl.searchParams.get('userId'))
    if (!session.ok) return session.response
    const { gmail } = session

    const messageId = request.nextUrl.searchParams.get('messageId')
    const draftId = request.nextUrl.searchParams.get('draftId') || (messageId ? await draftIdForMessage(gmail, messageId) : null)
    if (!draftId) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    const { data: draft } = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'full' })
    const message = draft.message
    if (!message) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    const parsed = parseEmailMessage(message)

    // Attachments come back with their content, so the composer holds them
    // exactly as it holds a file just picked — and saves them again as-is.
    const attachments: Array<OutgoingAttachment & { size: number }> = []
    for (const part of attachmentParts(message.payload)) {
      const { data } = await gmail.users.messages.attachments.get({
        userId: 'me', messageId: message.id!, id: part.body!.attachmentId!,
      })
      if (!data.data) continue
      const bytes = Buffer.from(data.data, 'base64url')
      attachments.push({
        filename: part.filename!,
        mimeType: part.mimeType || 'application/octet-stream',
        data: bytes.toString('base64'),
        size: bytes.length,
      })
    }

    return NextResponse.json({
      draftId,
      messageId: message.id,
      threadId: message.threadId ?? null,
      to: parsed.to,
      cc: parsed.cc,
      bcc: parsed.bcc,
      subject: parsed.subject,
      body: parsed.body,
      attachments,
    })
  } catch (err) {
    const e = err as { code?: number; message?: string }
    if (e?.code === 404) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    console.error('Draft fetch error:', e?.message || err)
    return NextResponse.json({ error: e?.message || 'Could not open the draft' }, { status: 500 })
  }
}

// POST { draftId?, to, cc, bcc, subject, body, threadId?, attachments? }
// Creates the draft, or replaces the content of an existing one.
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}))
    const session = await mailboxForSession(payload.userId)
    if (!session.ok) return session.response
    const { gmail } = session

    // A draft may be half-written: keep what parses as an address, and only
    // refuse nothing at all to save.
    const to = parseRecipients(payload.to).valid
    const cc = parseRecipients(payload.cc).valid
    const bcc = parseRecipients(payload.bcc).valid
    const subject = String(payload.subject ?? '')
    const body = String(payload.body ?? '')
    const attachments = (Array.isArray(payload.attachments) ? payload.attachments : []) as OutgoingAttachment[]
    const bytes = attachments.reduce((n, a) => n + Math.floor(String(a.data ?? '').length * 0.75), 0)
    if (bytes > MAX_DRAFT_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: 'Attachments are over 25 MB' }, { status: 413 })
    }

    const threadId = payload.threadId ? String(payload.threadId) : null
    const threading = threadId ? await replyHeaders(gmail, threadId) : {}
    const raw = buildRawEmail({ to, cc, bcc, subject, html: body, attachments, threading })
    const requestBody = { message: { raw, ...(threadId ? { threadId } : {}) } }

    const draftId = payload.draftId ? String(payload.draftId) : null
    let saved: gmail_v1.Schema$Draft
    if (draftId) {
      try {
        saved = (await gmail.users.drafts.update({ userId: 'me', id: draftId, requestBody: { id: draftId, ...requestBody } })).data
      } catch (err) {
        // Sent or deleted elsewhere meanwhile: start a new draft rather than lose the text.
        if ((err as { code?: number })?.code !== 404) throw err
        saved = (await gmail.users.drafts.create({ userId: 'me', requestBody })).data
      }
    } else {
      saved = (await gmail.users.drafts.create({ userId: 'me', requestBody })).data
    }

    return NextResponse.json({
      draftId: saved.id,
      messageId: saved.message?.id ?? null,
      savedAt: new Date().toISOString(),
    })
  } catch (err) {
    const e = err as { message?: string }
    console.error('Draft save error:', e?.message || err)
    return NextResponse.json({ error: e?.message || 'Could not save the draft' }, { status: 500 })
  }
}

// DELETE ?draftId=… — discard.
export async function DELETE(request: NextRequest) {
  try {
    const session = await mailboxForSession(request.nextUrl.searchParams.get('userId'))
    if (!session.ok) return session.response
    const draftId = request.nextUrl.searchParams.get('draftId')
    if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })
    await session.gmail.users.drafts.delete({ userId: 'me', id: draftId }).catch(err => {
      if ((err as { code?: number })?.code !== 404) throw err
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    const e = err as { message?: string }
    console.error('Draft delete error:', e?.message || err)
    return NextResponse.json({ error: e?.message || 'Could not discard the draft' }, { status: 500 })
  }
}
