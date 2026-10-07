import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { gateVolume, incrementVolumeUsage, loadUsageAnchor } from '@/lib/usage-enforcement'
import { DAY_SELECT, ITINERARY_SELECT, SERVICE_SELECT, copyCode, copyDay, copyItinerary, copyService } from '@/lib/itineraries/duplicate'

// ============================================
// POST /api/itineraries/[id]/duplicate — a new draft of the same trip
// ============================================
// Copies the itinerary, its days and its services (what the copy keeps and
// leaves behind: lib/itineraries/duplicate.ts). Counts against the plan like
// any new itinerary. Not one transaction, so a failure part-way deletes the
// copy (days and services go with it, ON DELETE CASCADE) — never a half trip.

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) {
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
  }
  const { id } = await params

  // The column lists are built at run time, so the typed client cannot name
  // the row's shape; it is a plain row here (lib/itineraries/duplicate).
  type Row = Record<string, unknown>
  const { data: found, error: loadError } = await supabase.from('itineraries').select(ITINERARY_SELECT).eq('id', id).maybeSingle()
  const original = found as unknown as Row | null
  if (loadError) return NextResponse.json({ success: false, error: loadError.message }, { status: 500 })
  if (!original) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

  const gate = await gateVolume(supabase, tenant_id, 'itineraries', 'itineraries this year')
  if (!gate.ok) return gate.response!

  const [daysRes, servicesRes] = await Promise.all([
    supabase.from('itinerary_days').select(DAY_SELECT).eq('itinerary_id', id).order('day_number'),
    supabase.from('itinerary_services').select(SERVICE_SELECT).eq('itinerary_id', id),
  ])
  if (daysRes.error) return NextResponse.json({ success: false, error: daysRes.error.message }, { status: 500 })
  if (servicesRes.error) return NextResponse.json({ success: false, error: servicesRes.error.message }, { status: 500 })

  // The new itinerary; the code is unique, so a collision draws another.
  let copy: { id: string; itinerary_code: string } | null = null
  for (let attempt = 0; attempt < 4 && !copy; attempt++) {
    const code = copyCode(original.itinerary_code as string, new Date().getFullYear(), Math.floor(Math.random() * 9000) + 1000)
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('itineraries')
      .insert({ ...copyItinerary(original, code), tenant_id, created_at: now, updated_at: now } as never)
      .select('id, itinerary_code')
      .single()
    if (data) copy = data as { id: string; itinerary_code: string }
    else if (error && error.code !== '23505') {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
  }
  if (!copy) return NextResponse.json({ success: false, error: 'Could not find a free itinerary code — try again' }, { status: 500 })

  const undo = async (message: string) => {
    const { error: cleanupError } = await supabase.from('itineraries').delete().eq('id', copy!.id)
    // If even the clean-up failed, say so: a part-made copy is on the list.
    const left = cleanupError ? ` A part-made copy (${copy!.itinerary_code}) could not be removed — delete it by hand.` : ''
    return NextResponse.json({ success: false, error: `${message}${left}` }, { status: 500 })
  }

  const days = (daysRes.data ?? []) as unknown as Row[]
  const dayIds = new Map<string, string>()
  if (days.length > 0) {
    const { data: newDays, error } = await supabase
      .from('itinerary_days')
      .insert(days.map(d => ({ ...copyDay(d, copy!.id), tenant_id })) as never)
      .select('id, day_number')
    if (error || !newDays) return undo(error?.message ?? 'Could not copy the days')
    const byNumber = new Map((newDays as { id: string; day_number: number }[]).map(d => [d.day_number, d.id]))
    for (const d of days) {
      const to = byNumber.get(d.day_number as number)
      if (to) dayIds.set(String(d.id), to)
    }
  }

  const services = ((servicesRes.data ?? []) as unknown as Row[])
    .map(s => copyService(s, copy!.id, dayIds))
    .filter((s): s is Row => s !== null)
    .map(s => ({ ...s, tenant_id }))
  if (services.length > 0) {
    const { error } = await supabase.from('itinerary_services').insert(services as never)
    if (error) return undo(error.message)
  }

  incrementVolumeUsage(tenant_id, 'itineraries', await loadUsageAnchor(supabase, tenant_id))

  return NextResponse.json({
    success: true,
    data: { id: copy.id, itinerary_code: copy.itinerary_code, days: dayIds.size, services: services.length },
    ...(gate.usage ? { usage: gate.usage } : {}),
  })
}
