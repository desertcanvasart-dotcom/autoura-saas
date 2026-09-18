import { NextRequest, NextResponse } from 'next/server'
import { claimSend, finishSend, threadConflict, replyBodyHash } from '@/lib/email/send-guard'
import { replyHeaders, threadingLines, type ThreadingHeaders } from '@/lib/email/threading'
import { refreshAccessToken } from '@/lib/gmail'
import { google } from 'googleapis'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { indexEmailReply } from '@/lib/copilot-indexer'

// Lazy-initialized OAuth2 client
let _oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null

function getOAuth2Client() {
  if (!_oauth2Client) {
    _oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
  }
  return _oauth2Client
}

interface Attachment {
  filename: string
  mimeType: string
  data: string // base64 encoded
}

export async function POST(request: NextRequest) {
  try {
    // Dual gating: accept EITHER a valid user session (browser callers) OR the
    // server-to-server secret header (internal/cron callers). Fails closed:
    // if CRON_SECRET is unset, the header path is always rejected.
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = request.headers.get('x-cron-secret')
    const isTrustedServerCall = Boolean(cronSecret && providedSecret === cronSecret)

    let user: { id: string; email?: string | null } | null = null
    let authClient: any = null

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
    }

    const supabase = createAdminClient()

    const {
      userId, to, subject, body, body_text: bodyTextParam, threadId, attachments,
      conversation_id: conversationId,
      draft_id: draftId,
      // The guard's inputs (migration 365). request_key is one key per reply,
      // repeated on retry; seen_up_to is the newest message the composer was
      // showing. Absent from a server-to-server caller, which sends nothing a
      // person could double-click.
      request_key: requestKey,
      seen_up_to: seenUpTo,
      allow_duplicate: allowDuplicate,
    } = await request.json()

    if (!userId || !to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Get user's tokens
    const { data: tokenData, error: tokenError } = await (supabase as any)
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

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
        userId: user.id,
        threadId: threadId ? String(threadId) : null,
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

    if (threadId && !allowDuplicate) {
      const conflict = await threadConflict(supabase, {
        threadId: String(threadId),
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
    getOAuth2Client().setCredentials({
      access_token,
      refresh_token,
    })

    const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client() })

    // What the customer's mail client threads on. Gmail's threadId keeps the
    // conversation together for US; In-Reply-To and References keep it
    // together for THEM.
    const threading = threadId ? await replyHeaders(gmail, String(threadId)) : {}

    // Build email with or without attachments
    let rawEmail: string

    if (attachments && attachments.length > 0) {
      rawEmail = buildEmailWithAttachments(to, subject, body, attachments, threading)
    } else {
      rawEmail = buildSimpleEmail(to, subject, body, threading)
    }

    // Send email
    let response
    try {
      response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawEmail,
          threadId,
        },
      })
    } catch (sendError) {
      // A failed attempt releases its key, so the operator can try again.
      if (claimed && requestKey) await finishSend(supabase, String(requestKey), { ok: false })
      throw sendError
    }

    if (claimed && requestKey) {
      await finishSend(supabase, String(requestKey), {
        ok: true,
        gmailMessageId: response.data.id ?? null,
        gmailThreadId: response.data.threadId ?? threadId ?? null,
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
              gmail_thread_id: threadId || null,
              direction: 'outbound',
              // Attribution (mig 269): the staff member sending.
              sent_by: user.id,
              from_email: user.email || '',
              to_email: Array.isArray(to) ? to[0] : to,
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

// Strip CR/LF from header values to prevent header/Bcc injection via a
// crafted recipient or subject.
function stripHeader(value: string): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

function buildSimpleEmail(to: string, subject: string, body: string, threading: ThreadingHeaders = {}): string {
  const emailLines = [
    `To: ${stripHeader(to)}`,
    `Subject: ${stripHeader(subject)}`,
    ...threadingLines(threading),
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ]
  
  return Buffer.from(emailLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function buildEmailWithAttachments(
  to: string, 
  subject: string, 
  body: string, 
  attachments: Attachment[],
  threading: ThreadingHeaders = {}
): string {
  const boundary = `boundary_${Date.now()}`
  
  const emailParts = [
    `To: ${stripHeader(to)}`,
    `Subject: ${stripHeader(subject)}`,
    ...threadingLines(threading),
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ]

  // Add attachments
  for (const attachment of attachments) {
    emailParts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      attachment.data
    )
  }

  emailParts.push(`--${boundary}--`)

  return Buffer.from(emailParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}