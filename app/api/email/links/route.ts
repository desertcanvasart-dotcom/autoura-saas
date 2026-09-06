import { NextRequest, NextResponse } from 'next/server'
import { autoLinkEmails } from '@/lib/email-auto-link'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// GET /api/email/links?userId=xxx&emailAddress=xxx
// Returns linked client for an email address
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const supabase = createAdminClient()

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const emailAddress = searchParams.get('emailAddress')
    const messageId = searchParams.get('messageId')
    const clientId = searchParams.get('clientId')

    // Client-page view: every email linked to this client, newest first.
    // Tenant-checked, NOT user-checked: the CRM view is shared, and the links
    // were made by whichever staff member synced the mailbox. The admin client
    // bypasses RLS, so the tenant check here is the authorisation.
    if (clientId) {
      const { data: owned, error: ownErr } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('tenant_id', authResult.tenant_id)
        .maybeSingle()

      if (ownErr) throw ownErr
      if (!owned) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }

      const { data, error } = await supabase
        .from('email_client_links')
        .select('id, message_id, email_address, subject, snippet, sent_at, auto_linked, created_at')
        .eq('client_id', clientId)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(50)

      if (error) throw error
      return NextResponse.json({ links: data || [] })
    }

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // If messageId provided, get link for specific email
    // (scoped to the session user — never trust the query-string userId)
    if (messageId) {
      const { data, error } = await (supabase as any)
        .from('email_client_links')
        .select(`
          *,
          client:clients(id, name:full_name, email, phone, status)
        `)
        .eq('user_id', authResult.user!.id)
        .eq('message_id', messageId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error
      }

      return NextResponse.json({ link: data || null })
    }

    // If emailAddress provided, find client by email (tenant-scoped)
    if (emailAddress) {
      // `clients` has no `name` column — it is `full_name`. Aliased here so
      // ClientLinkButton (which renders client.name) needs no change. This was
      // invisible while the table was missing: the route failed one step
      // earlier, so the bad column list was never reached.
      const { data: client, error } = await (supabase as any)
        .from('clients')
        .select('id, name:full_name, email, phone, status')
        .eq('tenant_id', authResult.tenant_id)
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
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const supabase = createAdminClient()
    const sessionUserId = authResult.user!.id

    const body = await request.json()
    const { userId, messageId, clientId, emailAddress, threadId, subject, snippet, sentAt } = body

    if (!userId || !messageId || !clientId) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, messageId, clientId' },
        { status: 400 }
      )
    }

    // Check if link already exists (scoped to the session user)
    const { data: existingData } = await (supabase as any)
      .from('email_client_links')
      .select('id')
      .eq('user_id', sessionUserId)
      .eq('message_id', messageId)
      .single()

    const existing = existingData as any

    if (existing) {
      // Update existing link
      const { data, error } = await (supabase as any)
        .from('email_client_links')
        .update({
          client_id: clientId,
          // Relinking refreshes the snapshot — this is also the documented way
          // to backfill links created before migration 251.
          subject: subject || null,
          snippet: snippet || null,
          sent_at: sentAt || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', sessionUserId)
        .select(`
          *,
          client:clients(id, name:full_name, email, phone, status)
        `)
        .single()

      if (error) throw error
      return NextResponse.json({ link: data, updated: true })
    }

    // Create new link
    const { data, error } = await (supabase as any)
      .from('email_client_links')
      .insert({
        user_id: sessionUserId,
        message_id: messageId,
        thread_id: threadId || null,
        client_id: clientId,
        email_address: emailAddress || null,
        // Display snapshot for the client page — message ids are per-mailbox,
        // so a colleague viewing the client cannot fetch these from Gmail.
        subject: subject || null,
        snippet: snippet || null,
        sent_at: sentAt || null,
      })
      .select(`
        *,
        client:clients(id, name:full_name, email, phone, status)
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
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const supabase = createAdminClient()

    const body = await request.json()
    const { userId, messageId, linkId } = body

    if (!userId || (!messageId && !linkId)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Always scope deletes to the session user (never trust the body userId)
    let query = supabase
      .from('email_client_links')
      .delete()
      .eq('user_id', authResult.user!.id)

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
// Auto-link emails based on email address matching. The same pass runs
// after every email sync (lib/email-auto-link.ts); this endpoint is the
// on-demand form of it.
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const sessionUserId = authResult.user!.id

    const body = await request.json()
    const { userId, emails } = body // emails: Array<{ messageId, threadId, fromEmail, toEmails }>

    if (!userId || !emails || !Array.isArray(emails)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const result = await autoLinkEmails(createAdminClient() as unknown as Parameters<typeof autoLinkEmails>[0], authResult.tenant_id!, sessionUserId, emails)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error auto-linking emails:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
