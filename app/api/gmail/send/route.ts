import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshAccessToken } from '@/lib/gmail'
import { google } from 'googleapis'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { indexEmailReply } from '@/lib/copilot-indexer'

// Lazy-initialized Supabase client (avoids build-time errors when env vars unavailable)
let _supabase: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

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
    // Authenticate user first
    const authClient = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const {
      userId, to, subject, body, body_text: bodyTextParam, threadId, attachments,
      conversation_id: conversationId,
      draft_id: draftId,
    } = await request.json()

    if (!userId || !to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Plain-text version for body_text column + RAG indexing. Client may send
    // one; fall back to a server-side strip if not.
    const bodyTextClean = (bodyTextParam && typeof bodyTextParam === 'string' && bodyTextParam.trim())
      ? bodyTextParam.trim()
      : stripHtmlServer(body).trim()

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    // Get user's tokens
    const { data: tokenData, error: tokenError } = await (getSupabase() as any)
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

      await (getSupabase() as any)
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    }

    // Set credentials
    getOAuth2Client().setCredentials({
      access_token,
      refresh_token,
    })

    const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client() })

    // Build email with or without attachments
    let rawEmail: string

    if (attachments && attachments.length > 0) {
      rawEmail = buildEmailWithAttachments(to, subject, body, attachments)
    } else {
      rawEmail = buildSimpleEmail(to, subject, body)
    }

    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawEmail,
        threadId,
      },
    })

    // ============================================
    // Persist outbound into email_messages + index + mark draft sent
    // Best-effort: never fail the send if post-processing errors.
    // ============================================
    if (conversationId && response.data.id) {
      try {
        // Look up tenant + thread from the conversation
        const { data: conv } = await (authClient as any)
          .from('email_conversations')
          .select('id, thread_id, tenant_id, client_id')
          .eq('id', conversationId)
          .single()

        const sentAt = new Date().toISOString()
        let insertedMessageId: string | null = null

        if (conv) {
          const { data: inserted, error: insertErr } = await (authClient as any)
            .from('email_messages')
            .insert({
              conversation_id: conv.id,
              message_id: response.data.id,
              thread_id: threadId || conv.thread_id,
              direction: 'outbound',
              from_address: user.email || '',
              to_addresses: Array.isArray(to) ? to : [to],
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
            insertedMessageId = inserted.id

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

            // Bump conversation summary fields
            await (authClient as any)
              .from('email_conversations')
              .update({
                last_message_snippet: bodyTextClean.slice(0, 160),
                last_message_at: sentAt,
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

function buildSimpleEmail(to: string, subject: string, body: string): string {
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
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
  attachments: Attachment[]
): string {
  const boundary = `boundary_${Date.now()}`
  
  const emailParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
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