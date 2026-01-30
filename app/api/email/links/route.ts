import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase client (avoids build-time errors)
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

// GET /api/email/links?userId=xxx&emailAddress=xxx
// Returns linked client for an email address
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const emailAddress = searchParams.get('emailAddress')
    const messageId = searchParams.get('messageId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // If messageId provided, get link for specific email
    if (messageId) {
      const { data, error } = await getSupabase()
        .from('email_client_links')
        .select(`
          *,
          client:clients(id, name, email, phone, status)
        `)
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error
      }

      return NextResponse.json({ link: data || null })
    }

    // If emailAddress provided, find client by email
    if (emailAddress) {
      const { data: client, error } = await getSupabase()
        .from('clients')
        .select('id, name, email, phone, status')
        .eq('user_id', userId)
        .ilike('email', emailAddress)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return NextResponse.json({ client: client || null })
    }

    return NextResponse.json({ error: 'Provide emailAddress or messageId' }, { status: 400 })

  } catch (error: any) {
    console.error('Error fetching email link:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/email/links
// Link an email to a client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, messageId, clientId, emailAddress, threadId } = body

    if (!userId || !messageId || !clientId) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, messageId, clientId' },
        { status: 400 }
      )
    }

    // Check if link already exists
    const { data: existing } = await getSupabase()
      .from('email_client_links')
      .select('id')
      .eq('user_id', userId)
      .eq('message_id', messageId)
      .single()

    if (existing) {
      // Update existing link
      const { data, error } = await (getSupabase() as any)
        .from('email_client_links')
        .update({
          client_id: clientId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(`
          *,
          client:clients(id, name, email, phone, status)
        `)
        .single()

      if (error) throw error
      return NextResponse.json({ link: data, updated: true })
    }

    // Create new link
    const { data, error } = await (getSupabase() as any)
      .from('email_client_links')
      .insert({
        user_id: userId,
        message_id: messageId,
        thread_id: threadId || null,
        client_id: clientId,
        email_address: emailAddress || null,
      })
      .select(`
        *,
        client:clients(id, name, email, phone, status)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ link: data, created: true })

  } catch (error: any) {
    console.error('Error creating email link:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/email/links
// Remove an email-client link
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, messageId, linkId } = body

    if (!userId || (!messageId && !linkId)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    let query = getSupabase()
      .from('email_client_links')
      .delete()
      .eq('user_id', userId)

    if (linkId) {
      query = query.eq('id', linkId)
    } else {
      query = query.eq('message_id', messageId)
    }

    const { error } = await query

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error deleting email link:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT /api/email/links/auto
// Auto-link emails based on email address matching
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, emails } = body // emails: Array<{ messageId, threadId, fromEmail, toEmails }>

    if (!userId || !emails || !Array.isArray(emails)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get all clients for this user
    const { data: clients, error: clientError } = await getSupabase()
      .from('clients')
      .select('id, email')
      .eq('user_id', userId)

    if (clientError) throw clientError

    // Create email -> client lookup
    const emailToClient = new Map<string, string>()
    clients?.forEach(client => {
      if (client.email) {
        emailToClient.set(client.email.toLowerCase(), client.id)
      }
    })

    // Get existing links to avoid duplicates
    const messageIds = emails.map(e => e.messageId)
    const { data: existingLinks } = await getSupabase()
      .from('email_client_links')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', messageIds)

    const existingMessageIds = new Set(existingLinks?.map(l => l.message_id) || [])

    // Find matches and create links
    const linksToCreate: any[] = []

    for (const email of emails) {
      if (existingMessageIds.has(email.messageId)) continue

      // Check from email
      let clientId = emailToClient.get(email.fromEmail?.toLowerCase())

      // Check to emails if not found
      if (!clientId && email.toEmails) {
        for (const toEmail of email.toEmails) {
          clientId = emailToClient.get(toEmail.toLowerCase())
          if (clientId) break
        }
      }

      if (clientId) {
        linksToCreate.push({
          user_id: userId,
          message_id: email.messageId,
          thread_id: email.threadId || null,
          client_id: clientId,
          email_address: email.fromEmail,
          auto_linked: true,
        })
      }
    }

    if (linksToCreate.length > 0) {
      const { data, error } = await (getSupabase() as any)
        .from('email_client_links')
        .insert(linksToCreate)
        .select()

      if (error) throw error

      return NextResponse.json({ 
        linked: data?.length || 0,
        total: emails.length 
      })
    }

    return NextResponse.json({ linked: 0, total: emails.length })

  } catch (error: any) {
    console.error('Error auto-linking emails:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
