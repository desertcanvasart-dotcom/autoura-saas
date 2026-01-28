import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/clients
 * List all clients for the authenticated user's tenant
 * RLS policies automatically filter by tenant_id
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone, status')
      .order('first_name', { ascending: true })
      .limit(limit)

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: clients, error } = await query

    if (error) {
      throw error
    }

    // Transform to include combined name field
    const transformedClients = (clients || []).map(client => ({
      id: client.id,
      name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
      email: client.email,
      phone: client.phone,
      status: client.status
    }))

    return NextResponse.json({ clients: transformedClients })

  } catch (error: any) {
    console.error('Error fetching clients:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/clients
 * Create a new client for the authenticated user's tenant
 * RLS policies will validate tenant_id
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Validate required fields
    if (!body.first_name) {
      return NextResponse.json(
        { success: false, error: 'First name is required' },
        { status: 400 }
      )
    }

    // Create client with tenant_id
    const clientData = {
      tenant_id,
      first_name: body.first_name,
      last_name: body.last_name || body.first_name,
      email: body.email || null,
      phone: body.phone || null,
      nationality: body.nationality || 'Unknown',
      status: body.status || 'prospect',
      client_type: body.client_type || 'individual',
      passport_type: body.passport_type || 'other',
      preferred_language: body.preferred_language || 'English',
      client_source: body.client_source || 'whatsapp',
      vip_status: body.vip_status || false
    }

    console.log('📝 Creating client:', clientData)

    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert(clientData)
      .select()
      .single()

    if (clientError) {
      console.error('❌ Client insert error:', clientError)
      return NextResponse.json(
        { success: false, error: clientError.message, details: clientError },
        { status: 500 }
      )
    }

    console.log('✅ Client created:', newClient.id)

    // Save preferences if provided
    if (body.preferences) {
      try {
        await supabase
          .from('client_preferences')
          .insert({
            client_id: newClient.id,
            preferred_accommodation_type: body.preferences.accommodation_type || '3-star',
            tour_pace_preference: body.preferences.tour_pace || 'moderate',
            interests: body.preferences.interests || '',
            special_needs: body.preferences.special_needs || null,
            preferred_tier: body.preferences.tier || 'standard'
          })
        console.log('✅ Client preferences saved')
      } catch (e) {
        console.warn('⚠️ Could not save preferences:', e)
      }
    }

    // Save note if provided
    if (body.note) {
      try {
        await supabase
          .from('client_notes')
          .insert({
            client_id: newClient.id,
            note_text: body.note,
            note_type: 'general',
            is_internal: true
          })
        console.log('✅ Client note saved')
      } catch (e) {
        console.warn('⚠️ Could not save note:', e)
      }
    }

    // Link WhatsApp conversation if phone provided
    if (body.link_whatsapp_phone) {
      try {
        await supabase
          .from('whatsapp_conversations')
          .update({
            client_id: newClient.id,
            client_name: `${clientData.first_name} ${clientData.last_name}`.trim()
          })
          .eq('phone_number', body.link_whatsapp_phone)
        console.log('✅ WhatsApp conversation linked')
      } catch (e) {
        console.warn('⚠️ Could not link WhatsApp:', e)
      }
    }

    return NextResponse.json({
      success: true,
      data: newClient
    }, { status: 201 })

  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create client' },
      { status: 500 }
    )
  }
}