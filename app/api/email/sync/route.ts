import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'

function extractEmailAddress(from: string | null | undefined): string {
  if (!from) return ''
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : from.toLowerCase()
}

function getDirection(from: string | null | undefined, userEmail: string): 'inbound' | 'outbound' {
  if (!from || !userEmail) return 'inbound'
  return extractEmailAddress(from) === userEmail.toLowerCase() ? 'outbound' : 'inbound'
}

// GET - Sync status
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const userId = request.nextUrl.searchParams.get('user_id') || authResult.user?.id
    if (!userId) return NextResponse.json({ error: 'User ID required', success: false }, { status: 400 })

    const { data } = await supabase.from('email_sync_state').select('*').eq('user_id', userId).single()
    return NextResponse.json({ sync_state: data || { user_id: userId, sync_status: 'idle', emails_synced: 0 }, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// POST - Trigger email sync
export async function POST(request: NextRequest) {
  let userId: string | undefined
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const body = await request.json()
    const { user_id, full_sync = false, max_results = 100, days_back = 30 } = body
    userId = user_id || authResult.user?.id
    if (!userId) return NextResponse.json({ error: 'User ID required', success: false }, { status: 400 })

    // Get Gmail tokens
    const { data: tokenRecord } = await supabase.from('gmail_tokens').select('access_token, refresh_token, email_address').eq('user_id', userId).single()
    if (!tokenRecord) return NextResponse.json({ error: 'Gmail not connected', success: false }, { status: 401 })

    let accessToken = tokenRecord.access_token
    try {
      const refreshed = await refreshAccessToken(tokenRecord.refresh_token)
      accessToken = refreshed.access_token || accessToken
    } catch {}

    const gmail = getGmailClient(accessToken, tokenRecord.refresh_token)
    const userEmail = tokenRecord.email_address || ''

    // Update sync state
    await supabase.from('email_sync_state').upsert({ user_id: userId, sync_status: 'running', updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

    // Build query
    let query = ''
    if (!full_sync) {
      const daysAgo = new Date(); daysAgo.setDate(daysAgo.getDate() - days_back)
      query = `after:${daysAgo.getFullYear()}/${String(daysAgo.getMonth() + 1).padStart(2, '0')}/${String(daysAgo.getDate()).padStart(2, '0')}`
    }

    const response = await gmail.users.messages.list({ userId: 'me', maxResults: max_results, q: query || undefined })
    const messageIds = response.data.messages || []

    const result = { success: true, conversations_created: 0, conversations_updated: 0, messages_created: 0, history_id: null as string | null }

    // Group by thread
    const threadMessages = new Map<string, any[]>()
    for (const msg of messageIds) {
      try {
        const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' })
        const threadId = detail.data.threadId!
        if (!threadMessages.has(threadId)) threadMessages.set(threadId, [])
        threadMessages.get(threadId)!.push(detail.data)
      } catch {}
    }

    // Process threads
    for (const [threadId, messages] of threadMessages) {
      try {
        const firstMsg = messages[0]
        const headers = firstMsg.payload?.headers || []
        const getHeader = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || ''

        const from = getHeader('From'), to = getHeader('To'), subject = getHeader('Subject')
        const direction = getDirection(from, userEmail)
        const clientEmail = direction === 'inbound' ? extractEmailAddress(from) : extractEmailAddress(to)

        const lastMsg = messages.reduce((latest: any, msg: any) => {
          return parseInt(msg.internalDate || '0') > parseInt(latest.internalDate || '0') ? msg : latest
        }, messages[0])
        const lastDate = new Date(parseInt(lastMsg.internalDate || '0')).toISOString()

        // Upsert conversation
        const { data: existing } = await supabase.from('email_conversations').select('id').eq('thread_id', threadId).single()
        let conversationId: string

        if (existing) {
          await supabase.from('email_conversations').update({ subject, last_message_snippet: lastMsg.snippet, last_message_at: lastDate, message_count: messages.length, last_sync_at: new Date().toISOString() }).eq('id', existing.id)
          conversationId = existing.id
          result.conversations_updated++
        } else {
          const { data: newConv, error } = await supabase.from('email_conversations').insert({ tenant_id, thread_id: threadId, user_id: userId, client_email: clientEmail, subject, last_message_snippet: lastMsg.snippet, last_message_at: lastDate, message_count: messages.length, status: 'active', is_hidden: false, last_sync_at: new Date().toISOString() }).select().single()
          if (error) continue
          conversationId = newConv.id
          result.conversations_created++
        }

        // Store messages
        for (const message of messages) {
          const mHeaders = message.payload?.headers || []
          const getMH = (n: string) => mHeaders.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || ''
          const msgDate = new Date(parseInt(message.internalDate || '0')).toISOString()
          const msgDir = getDirection(getMH('From'), userEmail)

          let bodyHtml = '', bodyText = ''
          const extractBody = (p: any) => {
            if (p.body?.data) { const c = Buffer.from(p.body.data, 'base64').toString('utf-8'); if (p.mimeType === 'text/html') bodyHtml = c; else if (p.mimeType === 'text/plain') bodyText = c }
            if (p.parts) for (const part of p.parts) extractBody(part)
          }
          if (message.payload) extractBody(message.payload)

          const attachments: any[] = []
          const extractAtt = (p: any) => {
            if (p.filename && p.body?.attachmentId) attachments.push({ id: p.body.attachmentId, filename: p.filename, mimeType: p.mimeType, size: p.body.size || 0 })
            if (p.parts) for (const part of p.parts) extractAtt(part)
          }
          if (message.payload) extractAtt(message.payload)

          const { data: existingMsg } = await supabase.from('email_messages').select('id').eq('message_id', message.id).single()
          if (!existingMsg) {
            await supabase.from('email_messages').insert({
              conversation_id: conversationId, message_id: message.id, thread_id: threadId, direction: msgDir,
              from_address: getMH('From'), to_addresses: getMH('To') ? getMH('To').split(',').map((e: string) => e.trim()) : [],
              cc_addresses: getMH('Cc') ? getMH('Cc').split(',').map((e: string) => e.trim()) : null,
              subject: getMH('Subject'), body_text: bodyText || null, body_html: bodyHtml || null,
              snippet: message.snippet, attachments, is_read: !message.labelIds?.includes('UNREAD'),
              is_starred: message.labelIds?.includes('STARRED') || false, labels: message.labelIds, sent_at: msgDate,
            })
            result.messages_created++
          }
        }
      } catch {}
    }

    // Update sync state
    await supabase.from('email_sync_state').upsert({ user_id: userId, sync_status: 'idle', last_full_sync_at: full_sync ? new Date().toISOString() : undefined, last_incremental_sync_at: new Date().toISOString(), emails_synced: result.messages_created, error_message: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Email Sync] Error:', error.message)
    if (userId) {
      try {
        const authResult = await requireAuth()
        if (authResult.supabase) {
          await authResult.supabase.from('email_sync_state').upsert({ user_id: userId, sync_status: 'failed', error_message: error.message, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        }
      } catch {}
    }
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}
