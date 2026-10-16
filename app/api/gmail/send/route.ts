import { secretMatches } from '@/lib/support/probe-auth'
import { NextRequest, NextResponse } from 'next/server'
import { claimSend, finishSend, threadConflict, replyBodyHash } from '@/lib/email/send-guard'
import { replyHeaders } from '@/lib/email/threading'
import { buildRawEmail, parseRecipients, MAX_RECIPIENTS, type OutgoingAttachment } from '@/lib/email/compose-mime'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { indexEmailReply } from '@/lib/copilot-indexer'

// One Gmail client per request (lib/gmail getGmailClient). A module-level
// OAuth2 client used to be shared by every request: setCredentials() for user
// A, then user B's request set B's tokens before A's Gmail call ran, so A
// could act in — or send from — B's mailbox (documents audit, round 12).

/** An attachment of a message in this mailbox, carried over by a forward. */
interface ForwardedAttachment {
  messageId: string
  attachmentId: string
  filename: string
  mimeType: string
}

/** Most attachments a forward carries over from the original. */
const MAX_FORWARDED_ATTACHMENTS = 20

export async function POST(request: NextRequest) {
  try {
    // Dual gating: accept EITHER a valid user session (browser callers) OR the
    // server-to-server secret header (internal/cron callers). Fails closed:
    // if CRON_SECRET is unset, the header path is always rejected.
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = request.headers.get('x-cron-secret')
    const isTrustedServerCall = secretMatches(providedSecret, cronSecret)

    let user: { id: string; email?: string | null } | null = null
    let authClient: any = null
    // The company whose mailbox sends (migration 415: one per person per
    // company): the session's current company, or the one a trusted server
    // caller names.
    let sessionTenant: string | null = null

    if (!isTrustedServerCall) {
      const authResult = await requireAuth()
      if (authResult.error !== null) {
        return NextResponse.json(
          { success: false, error: authResult.error },
          { status: authResult.status }
        )
      }
      user = authResult.user
      authClient = authResult.supabase
      sessionTenant = authResult.tenant_id
    }

    const supabase = createAdminClient()

    const {
      userId, to, cc, bcc, subject, body, body_text: bodyTextParam, threadId, attachments,
      // A saved Gmail draft this send replaces (deleted once the mail is sent),
      // and the original's attachments a forward carries over.
      gmail_draft_id: gmailDraftId,
      forward_attachments: forwardAttachments,
      conversation_id: conversationId,
      draft_id: draftId,
      // The guard's inputs (migration 365). request_key is one key per reply,
      // repeated on retry; seen_up_to is the newest message the composer was
      // showing. Absent from a server-to-server caller, which sends nothing a
      // person could double-click.
      request_key: requestKey,
      seen_up_to: seenUpTo,
      allow_duplicate: allowDuplicate,
      tenant_id: requestedTenant,
    } = await request.json()
    const mailboxTenant: string | null = isTrustedServerCall
      ? (typeof requestedTenant === 'string' ? requestedTenant : null)
      : sessionTenant

    if (!userId || !to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // To, Cc and Bcc: real addresses only, reported back when not.
    const toList = parseRecipients(to)
    const ccList = parseRecipients(cc)
    const bccList = parseRecipients(bcc)
    const invalid = [...toList.invalid, ...ccList.invalid, ...bccList.invalid]
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Not an email address: ${invalid.slice(0, 5).join(', ')}` }, { status: 400 })
    }
    if (toList.valid.length === 0) {
      return NextResponse.json({ error: 'Add at least one recipient' }, { status: 400 })
    }
    if (toList.valid.length + ccList.valid.length + bccList.valid.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `At most ${MAX_RECIPIENTS} recipients per email` }, { status: 400 })
    }
    // Which company's mailbox: a session's current company, or the one a
    // trusted server caller names (migration 415).
    if (!mailboxTenant) {
      return NextResponse.json({ error: 'Missing company' }, { status: 400 })
    }

    // Plain-text version for body_text column + RAG indexing. Client may send
    // one; fall back to a server-side strip if not.
    const bodyTextClean = (bodyTextParam && typeof bodyTextParam === 'string' && bodyTextParam.trim())
      ? bodyTextParam.trim()
      : stripHtmlServer(body).trim()

    // Verify authenticated user matches requested userId (session path only —
    // trusted server calls are authenticated via the x-cron-secret header)
    if (user && user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    // The Gmail thread this reply goes into. The unified inbox has no Gmail
    // thread id of its own: a conversation is one CONTACT and can span several
    // Gmail threads, and the composer sent the conversation's own id as
    // `threadId` (its "legacy alias"). Gmail could not thread on that, so the
    // reply lost In-Reply-To / References (the customer saw a new email) and
    // the copy below stored the conversation id as gmail_thread_id (documents
    // audit, round 12). A named conversation replies in its newest real
    // thread; a caller without one (the Gmail inbox) passes Gmail's own id.
    let gmailThreadId: string | null = threadId ? String(threadId) : null
    if (conversationId && authClient) {
      const { data: latest } = await authClient
        .from('email_messages')
        .select('gmail_thread_id')
        .eq('unified_conversation_id', conversationId)
        .not('gmail_thread_id', 'is', null)
        .neq('gmail_thread_id', String(conversationId))
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      gmailThreadId = latest?.gmail_thread_id ?? null
    }

    // Get user's tokens
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

    // Check if token is expired
    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      await (supabase as any)
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('tenant_id', mailboxTenant)
    }

    // ============================================
    // Never the same reply twice — BEFORE Gmail is called
    // ============================================
    // Sending was unguarded: a double click, a retry, a second tab or two
    // colleagues answering the same customer each sent a real email. The only
    // duplicate check ran after Gmail had already accepted the message.
    const bodyHash = replyBodyHash(body)
    let claimed = false
    if (requestKey && user) {
      const claim = await claimSend(supabase, String(requestKey), {
        tenantId: mailboxTenant,
        userId: user.id,
        threadId: gmailThreadId,
        bodyHash,
      })
      if (!claim.ok) {
        // This exact attempt is already in flight or already sent. Answer with
        // it rather than sending a second email.
        return NextResponse.json(
          {
            success: claim.status === 'sent',
            alreadySent: claim.status === 'sent',
            messageId: claim.gmailMessageId,
            threadId: claim.gmailThreadId,
            error: claim.status === 'sent' ? undefined : 'This reply is already being sent.',
          },
          { status: claim.status === 'sent' ? 200 : 409 }
        )
      }
      claimed = true
    }

    if (gmailThreadId && !allowDuplicate) {
      const conflict = await threadConflict(supabase, {
        tenantId: mailboxTenant,
        threadId: gmailThreadId,
        requestKey: requestKey ? String(requestKey) : null,
        seenUpTo: seenUpTo === undefined ? undefined : (seenUpTo as string | null),
        bodyHash,
      })
      if (conflict) {
        if (claimed && requestKey) await finishSend(supabase, String(requestKey), { ok: false })
        return NextResponse.json(
          {
            success: false,
            conflict: conflict.code,
            error:
              conflict.code === 'ALREADY_REPLIED'
                ? `${conflict.repliedBy || 'Someone'} already replied to this conversation at ${conflict.repliedAt}. Send anyway?`
                : `The same reply was sent to this conversation at ${conflict.sentAt}. Send anyway?`,
            ...conflict,
          },
          { status: 409 }
        )
      }
    }

    // Set credentials
    const gmail = getGmailClient(access_token, refresh_token)

    // What the customer's mail client threads on. Gmail's threadId keeps the
    // conversation together for US; In-Reply-To and References keep it
    // together for THEM.
    const threading = gmailThreadId ? await replyHeaders(gmail, gmailThreadId) : {}

    // A forward carries the original's attachments: fetched here from the
    // same mailbox, so they never make a round trip through the browser.
    const carried: OutgoingAttachment[] = []
    if (Array.isArray(forwardAttachments)) {
      for (const f of (forwardAttachments as ForwardedAttachment[]).slice(0, MAX_FORWARDED_ATTACHMENTS)) {
        if (!f?.messageId || !f?.attachmentId) continue
        const { data } = await gmail.users.messages.attachments.get({
          userId: 'me', messageId: String(f.messageId), id: String(f.attachmentId),
        })
        if (!data.data) continue
        carried.push({
          filename: String(f.filename || 'attachment'),
          mimeType: String(f.mimeType || 'application/octet-stream'),
          data: Buffer.from(data.data, 'base64url').toString('base64'),
        })
      }
    }

    const rawEmail = buildRawEmail({
      to: toList.valid,
      cc: ccList.valid,
      bcc: bccList.valid,
      subject,
      html: body,
      attachments: [...((attachments as OutgoingAttachment[] | undefined) ?? []), ...carried],
      threading,
    })

    // Send email
    let response
    try {
      response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawEmail,
          threadId: gmailThreadId ?? undefined,
        },
      })
    } catch (sendError) {
      // A failed attempt releases its key, so the operator can try again.
      if (claimed && requestKey) await finishSend(supabase, String(requestKey), { ok: false })
      throw sendError
    }

    // The draft this replaced is gone once the mail is sent, as in Gmail.
    if (gmailDraftId) {
      await gmail.users.drafts.delete({ userId: 'me', id: String(gmailDraftId) }).catch(err => {
        console.error('Sent, but the draft could not be removed:', err?.message || err)
      })
    }

    if (claimed && requestKey) {
      await finishSend(supabase, String(requestKey), {
        ok: true,
        gmailMessageId: response.data.id ?? null,
        gmailThreadId: response.data.threadId ?? gmailThreadId,
      })
    }

    // ============================================
    // Persist outbound into email_messages + index + mark draft sent
    // Best-effort: never fail the send if post-processing errors.
    // conversationId is the unified_conversations.id (canonical).
    // Session path only: server-to-server callers don't pass conversation_id
    // and have no RLS session client to persist with.
    // ============================================
    if (conversationId && response.data.id && user && authClient) {
      try {
        // Look up tenant + conversation from unified_conversations
        const { data: conv } = await (authClient as any)
          .from('unified_conversations')
          .select('id, tenant_id, client_id, contact_email')
          .eq('id', conversationId)
          .single()

        const sentAt = new Date().toISOString()

        if (conv) {
          const { data: inserted, error: insertErr } = await (authClient as any)
            .from('email_messages')
            .insert({
              tenant_id: conv.tenant_id,
              unified_conversation_id: conv.id,
              gmail_message_id: response.data.id,
              // Gmail's thread, as Gmail reports it — never the conversation id.
              gmail_thread_id: response.data.threadId ?? gmailThreadId,
              direction: 'outbound',
              // Attribution (mig 269): the staff member sending.
              sent_by: user.id,
              from_email: user.email || '',
              to_email: toList.valid[0],
              cc_emails: ccList.valid.length ? ccList.valid : null,
              subject,
              body_text: bodyTextClean,
              body_html: body,
              snippet: bodyTextClean.slice(0, 200),
              sent_at: sentAt,
              is_read: true,
            })
            .select('id')
            .single()

          if (insertErr && insertErr.code !== '23505') {
            console.error('Email outbound persist failed:', insertErr.message)
          } else if (inserted?.id) {
            // Fire-and-await: index the reply pair for RAG (use plain text so
            // the embedding reflects prose, not HTML tags)
            await indexEmailReply({
              supabase: authClient as any,
              tenantId: conv.tenant_id,
              conversationId: conv.id,
              outboundMessageId: inserted.id,
              outboundSourceMessageId: response.data.id,
              outboundSubject: subject,
              outboundBody: bodyTextClean,
              outboundSentAt: sentAt,
              clientId: conv.client_id || null,
            }).catch(() => {})

            // Bump conversation summary fields on unified_conversations
            await (authClient as any)
              .from('unified_conversations')
              .update({
                last_message_at: sentAt,
                last_message_preview: bodyTextClean.slice(0, 160),
                last_message_channel: 'email',
              })
              .eq('id', conv.id)
          }
        }

        // Mark the copilot draft as sent
        if (draftId) {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`}/api/ai/suggest-reply/${draftId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              // Pass along the user's cookie for auth on the internal call
              cookie: request.headers.get('cookie') || '',
            },
            body: JSON.stringify({
              action: 'mark_sent',
              send_message_id: response.data.id,
              edited_body: bodyTextClean,
            }),
            signal: AbortSignal.timeout(10_000),
          }).catch(() => {})
        }
      } catch (postErr: any) {
        console.error('Post-send processing error:', postErr?.message || postErr)
      }
    }

    return NextResponse.json({ success: true, messageId: response.data.id })
  } catch (err: any) {
    console.error('Send email error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * Minimal server-side HTML stripper. Only used as a fallback when the client
 * didn't send an explicit plain-text version — keeps Gmail, DB, and RAG
 * bodies consistent regardless of who constructed the request.
 */
function stripHtmlServer(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
