import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'
import { generateDraftReplies } from '@/lib/copilot-suggest'

function extractEmailAddress(from: string | null | undefined): string {
  if (!from) return ''
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : from.toLowerCase().trim()
}

function extractDisplayName(from: string | null | undefined): string | null {
  if (!from) return null
  // "John Smith <john@example.com>" → "John Smith"
  const match = from.match(/^(.*?)\s*<[^>]+>\s*$/)
  if (match) {
    const name = match[1].trim().replace(/^"(.*)"$/, '$1').trim()
    return name || null
  }
  return null
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

    // Track conversation ids that received at least one new inbound message
    // during this sync — used to fire opt-in pre-generation after the loop.
    const conversationsWithNewInbound = new Set<string>()

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

    // Process threads — write to unified_conversations (customer-scoped) and
    // email_messages (125 schema).
    for (const [threadId, messages] of threadMessages) {
      try {
        // Determine who the "customer" is for this thread. Use the latest
        // inbound's From if present, else the first message's To.
        const sorted = [...messages].sort((a: any, b: any) =>
          parseInt(a.internalDate || '0') - parseInt(b.internalDate || '0')
        )
        const lastMsg = sorted[sorted.length - 1]
        const lastDate = new Date(parseInt(lastMsg.internalDate || '0')).toISOString()

        const firstHeaders = sorted[0].payload?.headers || []
        const getH = (headers: any[], n: string) =>
          headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || ''

        const firstFrom = getH(firstHeaders, 'From')
        const firstTo = getH(firstHeaders, 'To')
        const firstDir = getDirection(firstFrom, userEmail)
        const customerHeader = firstDir === 'inbound' ? firstFrom : firstTo
        const contactEmail = extractEmailAddress(customerHeader)
        const contactName = extractDisplayName(customerHeader)

        if (!contactEmail) continue // can't route without a customer address

        // Upsert unified_conversations keyed by (tenant_id, contact_email)
        let unifiedId: string
        const { data: existingUnified } = await supabase
          .from('unified_conversations')
          .select('id, total_messages')
          .eq('tenant_id', tenant_id)
          .eq('contact_email', contactEmail)
          .maybeSingle()

        if (existingUnified) {
          await supabase
            .from('unified_conversations')
            .update({
              contact_name: contactName || undefined,
              last_message_at: lastDate,
              last_message_preview: lastMsg.snippet || null,
              last_message_channel: 'email',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingUnified.id)
          unifiedId = existingUnified.id
          result.conversations_updated++
        } else {
          const { data: newUnified, error: unifiedErr } = await supabase
            .from('unified_conversations')
            .insert({
              tenant_id,
              contact_email: contactEmail,
              contact_name: contactName,
              last_message_at: lastDate,
              last_message_preview: lastMsg.snippet || null,
              last_message_channel: 'email',
              total_messages: 0,
              unread_messages: 0,
              status: 'active',
            })
            .select('id')
            .single()
          if (unifiedErr || !newUnified) continue
          unifiedId = newUnified.id
          result.conversations_created++
        }

        // Store each message in email_messages (skip duplicates by gmail_message_id)
        for (const message of messages) {
          const mHeaders = message.payload?.headers || []
          const getMH = (n: string) => getH(mHeaders, n)
          const msgDate = new Date(parseInt(message.internalDate || '0')).toISOString()
          const fromRaw = getMH('From')
          const toRaw = getMH('To')
          const msgDir = getDirection(fromRaw, userEmail)

          let bodyHtml = '', bodyText = ''
          const extractBody = (p: any) => {
            if (p.body?.data) {
              const c = Buffer.from(p.body.data, 'base64').toString('utf-8')
              if (p.mimeType === 'text/html') bodyHtml = c
              else if (p.mimeType === 'text/plain') bodyText = c
            }
            if (p.parts) for (const part of p.parts) extractBody(part)
          }
          if (message.payload) extractBody(message.payload)

          const attachments: any[] = []
          const extractAtt = (p: any) => {
            if (p.filename && p.body?.attachmentId) attachments.push({ id: p.body.attachmentId, filename: p.filename, mimeType: p.mimeType, size: p.body.size || 0 })
            if (p.parts) for (const part of p.parts) extractAtt(part)
          }
          if (message.payload) extractAtt(message.payload)

          const { data: existingMsg } = await supabase
            .from('email_messages')
            .select('id')
            .eq('tenant_id', tenant_id)
            .eq('gmail_message_id', message.id)
            .maybeSingle()

          if (existingMsg) continue

          const fromEmail = extractEmailAddress(fromRaw)
          const fromName = extractDisplayName(fromRaw)
          const toEmail = extractEmailAddress(toRaw)
          const toName = extractDisplayName(toRaw)
          const cc = getMH('Cc')
          const ccEmails = cc ? cc.split(',').map((e: string) => extractEmailAddress(e)).filter(Boolean) : null

          const { error: insErr } = await supabase.from('email_messages').insert({
            tenant_id,
            unified_conversation_id: unifiedId,
            gmail_message_id: message.id,
            gmail_thread_id: threadId,
            from_email: fromEmail,
            from_name: fromName,
            to_email: toEmail,
            to_name: toName,
            cc_emails: ccEmails,
            subject: getMH('Subject') || null,
            body_text: bodyText || null,
            body_html: bodyHtml || null,
            snippet: message.snippet || null,
            direction: msgDir,
            attachments,
            labels: message.labelIds || null,
            is_read: !(message.labelIds || []).includes('UNREAD'),
            is_starred: (message.labelIds || []).includes('STARRED'),
            is_important: (message.labelIds || []).includes('IMPORTANT'),
            sent_at: msgDate,
            received_at: msgDir === 'inbound' ? msgDate : null,
          })

          if (insErr && insErr.code !== '23505') {
            console.error('email_messages insert failed:', insErr.message)
            continue
          }

          result.messages_created++
          if (msgDir === 'inbound') {
            conversationsWithNewInbound.add(unifiedId)
          }
        }

        // Recalculate total/unread counts for the unified conversation from source of truth
        const { count: totalCount } = await supabase
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('unified_conversation_id', unifiedId)

        const { count: unreadCount } = await supabase
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('unified_conversation_id', unifiedId)
          .eq('direction', 'inbound')
          .eq('is_read', false)

        await supabase
          .from('unified_conversations')
          .update({
            total_messages: totalCount || 0,
            unread_messages: unreadCount || 0,
          })
          .eq('id', unifiedId)
      } catch (threadErr: any) {
        console.error('[Email Sync] Thread error:', threadErr?.message || threadErr)
      }
    }

    // ============================================
    // Draft-only pre-generation for new inbound emails (opt-in per tenant)
    // ============================================
    if (conversationsWithNewInbound.size > 0) {
      try {
        const { data: features } = await supabase
          .from('tenant_features')
          .select('copilot_pregenerate_enabled')
          .eq('tenant_id', tenant_id)
          .single()

        if (features?.copilot_pregenerate_enabled) {
          const convIds = Array.from(conversationsWithNewInbound)
          after(async () => {
            // Serialize to avoid hammering Claude; cap at 10 per sync to stay sensible.
            const capped = convIds.slice(0, 10)
            for (const cid of capped) {
              try {
                await generateDraftReplies({
                  supabase: supabase as any,
                  tenantId: tenant_id,
                  channel: 'email',
                  unifiedConversationId: cid,
                  reviewerUserId: null,
                  count: 2,
                  skipIfPendingExists: true,
                })
              } catch (err: any) {
                console.error('Pre-generation (email) failed for conv', cid, err?.message)
              }
            }
          })
        }
      } catch (flagErr) {
        console.error('Pregenerate flag check failed:', flagErr)
      }
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
