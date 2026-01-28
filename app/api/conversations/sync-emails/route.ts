// app/api/conversations/sync-emails/route.ts
// Sync Gmail emails to unified conversations

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()
    const body = await request.json()
    const { limit = 50, since } = body

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Get tenant_id
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 400 }
      )
    }

    // Build query for Gmail API
    let query = ''
    if (since) {
      const sinceDate = new Date(since)
      query = `after:${Math.floor(sinceDate.getTime() / 1000)}`
    }

    // Fetch emails from Gmail API
    const gmailResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/emails?maxResults=${limit}&q=${encodeURIComponent(query)}`,
      {
        headers: {
          'Cookie': request.headers.get('cookie') || ''
        }
      }
    )

    const gmailResult = await gmailResponse.json()

    // Gmail API returns { messages, nextPageToken } or { error }
    if (gmailResult.error) {
      return NextResponse.json(
        { success: false, error: gmailResult.error || 'Failed to fetch emails' },
        { status: 500 }
      )
    }

    const emails = gmailResult.messages || []
    let syncedCount = 0
    let skippedCount = 0

    // Get user's email for determining direction
    const userEmail = user.email || ''

    for (const email of emails) {
      try {
        // Check if already synced
        const { data: existing } = await supabase
          .from('email_messages')
          .select('id')
          .eq('gmail_message_id', email.id)
          .eq('tenant_id', tenantId)
          .single()

        if (existing) {
          skippedCount++
          continue
        }

        // Determine direction
        const fromEmail = extractEmail(email.from)
        const toEmail = extractEmail(email.to)
        const direction = fromEmail.toLowerCase() === userEmail.toLowerCase() ? 'outbound' : 'inbound'

        // Find or create unified conversation
        const contactEmail = direction === 'inbound' ? fromEmail : toEmail
        const contactName = direction === 'inbound' ? extractName(email.from) : extractName(email.to)

        // Find or create unified conversation for this contact
        const { data: conversationId } = await supabase.rpc(
          'find_or_create_unified_conversation',
          {
            p_tenant_id: tenantId,
            p_email: contactEmail,
            p_phone: null,
            p_name: contactName
          }
        )

        // Insert email message
        const { error: insertError } = await supabase
          .from('email_messages')
          .insert({
            tenant_id: tenantId,
            unified_conversation_id: conversationId,
            gmail_message_id: email.id,
            gmail_thread_id: email.threadId,
            from_email: fromEmail,
            from_name: extractName(email.from),
            to_email: toEmail,
            to_name: extractName(email.to),
            subject: email.subject || '(No Subject)',
            body_text: email.body?.text || email.snippet || '',
            body_html: email.body?.html || null,
            snippet: email.snippet || '',
            direction,
            attachments: email.attachments ? JSON.stringify(email.attachments) : '[]',
            labels: email.labels || [],
            is_read: !email.labelIds?.includes('UNREAD'),
            is_starred: email.labelIds?.includes('STARRED'),
            is_important: email.labelIds?.includes('IMPORTANT'),
            sent_at: email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
            received_at: direction === 'inbound' ? new Date().toISOString() : null
          })

        if (!insertError) {
          syncedCount++

          // Update conversation stats
          if (conversationId) {
            await supabase.rpc('update_unified_conversation_stats', {
              p_unified_id: conversationId
            })
          }
        }
      } catch (emailError) {
        console.error('Error syncing email:', emailError)
        skippedCount++
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total: emails.length,
        synced: syncedCount,
        skipped: skippedCount
      },
      message: `Synced ${syncedCount} emails, skipped ${skippedCount}`
    })
  } catch (error: any) {
    console.error('Sync emails error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// Helper to extract email from "Name <email@example.com>" format
function extractEmail(headerValue: string): string {
  if (!headerValue) return ''

  const match = headerValue.match(/<([^>]+)>/)
  if (match) {
    return match[1]
  }

  // Maybe it's just the email
  if (headerValue.includes('@')) {
    return headerValue.trim()
  }

  return ''
}

// Helper to extract name from "Name <email@example.com>" format
function extractName(headerValue: string): string {
  if (!headerValue) return ''

  const match = headerValue.match(/^([^<]+)</)
  if (match) {
    return match[1].trim().replace(/"/g, '')
  }

  // No name, use email
  return extractEmail(headerValue)
}
