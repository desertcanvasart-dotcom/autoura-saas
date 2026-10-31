import { orIlikeContains } from '@/lib/postgrest-search'
import { gateRole } from '@/lib/api-role-gate'
// ============================================
// API Route: /api/guides
// ============================================
// Fetches guides from suppliers table (any supplier whose types include 'guide')
// GET: List all guides (with filters)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import type { TablesInsert } from '@/types/database.types'
import { supplierToGuide } from '@/lib/guides/supplier-guide'
import { sumByCurrency } from '@/lib/currency-totals'
import { supplierTypeKeysForBehaviors } from '@/lib/vocabulary-server'
import { supplierTypesOrFilter } from '@/lib/suppliers/type-filter'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const tenant_id = authResult.tenant_id
    const supabase = createAdminClient()
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const search = searchParams.get('search') || ''
    const is_active = searchParams.get('is_active')
    const active_only = searchParams.get('active_only')
    const availability_from = searchParams.get('availability_from')
    const availability_to = searchParams.get('availability_to')
    const exclude_itinerary_id = searchParams.get('exclude_itinerary_id')
    const with_stats = searchParams.get('with_stats') === 'true'

    // Every supplier that GUIDES, as any of its roles: the picker filtered on
    // the legacy supplier_type alone, so a transport company that also guides
    // never appeared (documents audit, round 12). The agency's own types that
    // behave as a guide count too, as on /api/suppliers; the vocabulary is
    // read through the caller's RLS client so it is this tenant's.
    const guideKeys = authResult.supabase
      ? await supplierTypeKeysForBehaviors(authResult.supabase, ['guide'])
      : ['guide']
    let query = supabase
      .from('suppliers')
      .select('*')
      .or(supplierTypesOrFilter(guideKeys) ?? 'supplier_type.eq.guide')
      .eq('tenant_id', tenant_id)
      .order('name', { ascending: true })

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.${orIlikeContains(search)},contact_email.ilike.${orIlikeContains(search)}`)
    }

    // Support both is_active and active_only parameters
    if (is_active === 'true' || active_only === 'true') {
      query = query.eq('status', 'active')
    }

    const { data: suppliers, error } = await query

    if (error) {
      console.error('Error fetching guides:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch guides' },
        { status: 500 }
      )
    }

    // One mapping for the list and /api/guides/[id] (lib/guides/supplier-guide).
    let guides = (suppliers || []).map(supplierToGuide)

    // If checking availability, filter out guides with conflicting bookings.
    // A failed read fails the request (fails closed): it used to come back
    // empty, and every guide — booked or not — was listed as free.
    if (availability_from && availability_to) {
      const { data: bookings, error: bookingsError } = await fetchAllPages((from, to) => {
        let bookingsQuery = supabase
          .from('itineraries')
          .select('id, assigned_guide_id')
          .eq('tenant_id', tenant_id)
          .not('assigned_guide_id', 'is', null)
          .or(`and(start_date.lte.${availability_to},end_date.gte.${availability_from})`)

        if (exclude_itinerary_id) {
          bookingsQuery = bookingsQuery.neq('id', exclude_itinerary_id)
        }
        return bookingsQuery.order('id').range(from, to)
      })

      if (bookingsError) {
        console.error('Error checking guide availability:', bookingsError)
        return NextResponse.json(
          { success: false, error: 'Could not check guide availability' },
          { status: 500 }
        )
      }

      const bookedGuideIds = new Set(bookings.map(b => b.assigned_guide_id))
      guides = guides.filter(g => !bookedGuideIds.has(g.id))
    }

    // Add statistics if requested: every guide's trips in one read, grouped
    // in memory (was one query per guide). A failed read is an error, not a
    // row of zeros.
    if (with_stats && guides.length > 0) {
      const guideIds = guides.map(g => g.id)
      const { data: trips, error: tripsError } = await fetchAllPages((from, to) =>
        supabase
          .from('itineraries')
          .select('id, assigned_guide_id, start_date, end_date, total_cost, currency')
          .eq('tenant_id', tenant_id)
          .in('assigned_guide_id', guideIds)
          .order('id')
          .range(from, to))

      if (tripsError) {
        console.error('Error fetching guide statistics:', tripsError)
        return NextResponse.json(
          { success: false, error: 'Failed to fetch guide statistics' },
          { status: 500 }
        )
      }

      const tripsByGuide = new Map<string, typeof trips>()
      for (const trip of trips) {
        const key = String(trip.assigned_guide_id)
        const list = tripsByGuide.get(key)
        if (list) list.push(trip)
        else tripsByGuide.set(key, [trip])
      }

      const now = new Date()
      const guidesWithStats = guides.map((guide) => {
        const bookings = tripsByGuide.get(String(guide.id)) ?? []

        const activeBookings = bookings.filter(b =>
          b.start_date !== null && b.end_date !== null &&
          new Date(b.start_date) <= now && new Date(b.end_date) >= now
        ).length

        const upcomingBookings = bookings.filter(b =>
          b.start_date !== null && new Date(b.start_date) > now
        ).length

        // Per currency: trips in yen and euros were added into one number.
        const totalRevenue = sumByCurrency(bookings, b => b.total_cost, b => b.currency)

        return {
          ...guide,
          active_bookings: activeBookings,
          upcoming_bookings: upcomingBookings,
          total_revenue: totalRevenue,
        }
      })

      return NextResponse.json({ success: true, data: guidesWithStats })
    }

    // Return wrapped format for guide-rates-content
    return NextResponse.json({ success: true, data: guides })

  } catch (error) {
    console.error('Error in guides GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Viewers read; they do not change anything (lib/api-role-gate).
  const roleGate = await gateRole('staff')
  if (roleGate) return roleGate
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

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Guide name is required' },
        { status: 400 }
      )
    }

    // Create guide as a supplier. Set BOTH type and supplier_type: the GET
    // list also matches the legacy supplier_type, and while a DB trigger mirrors the two,
    // setting both keeps this correct even if that trigger is absent.
    // Note: suppliers has no specialties/daily_rate/hourly_rate columns —
    // guide rates live in guide_rates.
    const guideData: TablesInsert<'suppliers'> = {
      ...rateCurrencyWriteField(body),
      tenant_id: authResult.tenant_id,
      type: 'guide',
      types: ['guide'],
      supplier_type: 'guide',
      name: body.name,
      company_name: body.name,
      contact_email: body.email || null,
      contact_phone: body.phone || body.contact_phone || null,
      whatsapp: body.whatsapp || null,
      city: body.city || null,
      languages: body.languages || [],
      status: body.is_active !== false ? 'active' : 'inactive',
      notes: body.notes || null,
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert([guideData])
      .select()
      .single()

    if (error) {
      console.error('Error creating guide:', error)

      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A guide with this email already exists' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { success: false, error: 'Failed to create guide' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Guide created successfully',
    }, { status: 201 })

  } catch (error) {
    console.error('Error in guides POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}