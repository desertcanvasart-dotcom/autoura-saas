import { orIlikeContains } from '@/lib/postgrest-search'
import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_CLIENT_STAGE } from '@/lib/client-stage'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { parseClientWrite, clientFullName, LEAD_SOURCES } from '@/lib/clients/client-fields'

/** No caller should need more than this in one list. */
const MAX_LIST = 5000

/**
 * GET /api/clients — the agency's clients, by name.
 *
 * `?search=` matches name, email, phone or code; `?limit=` caps the list
 * (all of them, up to 5000, when absent — it stopped at 50, so the Invoices
 * and Tasks pickers and the itinerary's "find this client" missed everyone
 * after the 50th and made duplicates). The list is answered under both
 * `clients` and `data`, as callers read either.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult

    const { searchParams } = new URL(request.url)
    // Raw text: orIlikeContains does the escaping (orSearchTerm escaped it a
    // second time, so a search for an email with `_` matched nothing).
    const search = (searchParams.get('search') || '').trim()
    const asked = parseInt(searchParams.get('limit') || '', 10)
    const limit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_LIST) : MAX_LIST

    const { data: clients, error } = await fetchAllPages<Record<string, unknown>>((from, to) => {
      if (from >= limit) return Promise.resolve({ data: [], error: null })
      let query = supabase
        .from('clients')
        .select('id, first_name, last_name, full_name, email, phone, status, client_code')
        .eq('tenant_id', tenant_id)
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, Math.min(to, limit - 1))
      if (search) {
        const q = orIlikeContains(search)
        query = query.or(`full_name.ilike.${q},first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q},client_code.ilike.${q}`)
      }
      return query
    })
    if (error) throw error

    const rows = clients.slice(0, limit).map(c => ({
      id: c.id,
      name: (c.full_name as string) || clientFullName(c.first_name as string, c.last_name as string),
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone,
      status: c.status,
      client_code: c.client_code,
    }))

    return NextResponse.json({ success: true, clients: rows, data: rows })
  } catch (error: any) {
    console.error('Error fetching clients:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/clients — a new client. Staff and above (viewers read only).
 * Takes only the fields the client forms edit, checked (lib/clients/client-fields).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const denied = roleDenied(authResult.role, 'staff')
    if (denied) return denied

    const { supabase, tenant_id } = authResult
    const body = await request.json()

    const parsed = parseClientWrite(body, 'create')
    if ('error' in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }
    const fields = parsed.data

    // The surname stays blank when not given (it was set to the first name, so
    // "Ahmed" became "Ahmed Ahmed"); nationality likewise (it was "Unknown").
    // The source an automatic caller names is also the lead source the pages
    // show, when it is one of theirs.
    const source = (fields.client_source as string | null) ?? null
    const clientData = {
      ...fields,
      tenant_id,
      full_name: clientFullName(fields.first_name as string, fields.last_name as string),
      status: fields.status ?? DEFAULT_CLIENT_STAGE,
      client_type: fields.client_type ?? 'individual',
      client_source: source ?? 'direct',
      lead_source: fields.lead_source ?? (source && LEAD_SOURCES.some(s => s.value === source) ? source : null),
      vip_status: fields.vip_status ?? false,
    }

    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert(clientData)
      .select()
      .single()

    if (clientError) {
      console.error('❌ Client insert error:', clientError)
      return NextResponse.json(
        { success: false, error: clientError.message },
        { status: 500 }
      )
    }

    // Save preferences if provided
    if (body.preferences) {
      try {
        await supabase
          .from('client_preferences')
          .insert({
            tenant_id,
            client_id: newClient.id,
            preferred_accommodation_type: body.preferences.accommodation_type || '3-star',
            tour_pace_preference: body.preferences.tour_pace || 'moderate',
            interests: body.preferences.interests || '',
            special_needs: body.preferences.special_needs || null,
            preferred_tier: body.preferences.tier || 'standard'
          })

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
            tenant_id,
            client_id: newClient.id,
            note_text: body.note,
            note_type: 'general',
            is_internal: true
          })

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
            client_name: clientData.full_name
          })
          .eq('tenant_id', tenant_id)
          .eq('phone_number', body.link_whatsapp_phone)

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