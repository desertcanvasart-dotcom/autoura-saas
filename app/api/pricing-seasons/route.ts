// ============================================
// GET/POST /api/pricing-seasons — the operator's demand calendar (C3.1)
// ============================================
// Seasons are NAMES the operator reuses ("New Year", "Easter"); their dates
// move every year, so each season owns a list of dated windows. The engine
// reads them at pricing time (loadSeasonWindows) and adds the premium AFTER
// margin, on the selling price.
//
// Absent tables (migration 304 not applied) → success + empty, so the page
// renders and pricing simply carries no premium.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { data: seasons, error } = await supabase
      .from('pricing_seasons')
      .select('id, name, uplift_percent, colour, display_order, is_active')
      .order('display_order')
      .order('name')
    if (error) return NextResponse.json({ success: true, seasons: [] })

    const ids = (seasons ?? []).map(s => s.id)
    const { data: dates } = ids.length
      ? await supabase
          .from('pricing_season_dates')
          .select('id, season_id, start_date, end_date, label')
          .in('season_id', ids)
          .order('start_date')
      : { data: [] }

    const bySeason = new Map<string, unknown[]>()
    for (const d of dates ?? []) {
      const list = bySeason.get(d.season_id) ?? []
      list.push(d)
      bySeason.set(d.season_id, list)
    }

    return NextResponse.json({
      success: true,
      seasons: (seasons ?? []).map(s => ({ ...s, dates: bySeason.get(s.id) ?? [] })),
    })
  } catch (err) {
    console.error('pricing-seasons GET:', err)
    return NextResponse.json({ success: false, error: 'Failed to load seasons' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id, role } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    // Managers price, so they keep the demand calendar (as the sidebar shows it).
    const denied = roleDenied(role, 'manage')
    if (denied) return denied

    const body = await request.json().catch(() => ({}))
    const action = body?.action

    switch (action) {
      case 'create_season': {
        const name = String(body.name || '').trim().slice(0, 80)
        if (!name) return bad('Name is required')
        const uplift = clampUplift(body.uplift_percent)
        if (uplift === null) return bad('Premium must be between 0 and 200%')
        const { data, error } = await supabase
          .from('pricing_seasons')
          .insert({ tenant_id, name, uplift_percent: uplift, colour: colourOf(body.colour) })
          .select('id')
          .single()
        if (error) {
          if (error.code === '23505') return bad(`A season called "${name}" already exists`)
          return dbFail(error)
        }
        return NextResponse.json({ success: true, id: data.id })
      }

      case 'update_season': {
        const id = String(body.id || '')
        if (!id) return bad('id is required')
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if ('name' in body) {
          const name = String(body.name || '').trim().slice(0, 80)
          if (!name) return bad('Name is required')
          patch.name = name
        }
        if ('uplift_percent' in body) {
          const uplift = clampUplift(body.uplift_percent)
          if (uplift === null) return bad('Premium must be between 0 and 200%')
          patch.uplift_percent = uplift
        }
        if ('colour' in body) patch.colour = colourOf(body.colour)
        if ('is_active' in body) patch.is_active = body.is_active !== false
        const { data: changed, error } = await supabase.from('pricing_seasons').update(patch).eq('id', id).eq('tenant_id', tenant_id).select('id')
        if (error) {
          if (error.code === '23505') return bad('Another season already has that name')
          return dbFail(error)
        }
        if (!changed?.length) return notFound()
        return NextResponse.json({ success: true })
      }

      case 'delete_season': {
        const id = String(body.id || '')
        if (!id) return bad('id is required')
        // Dates cascade with the season (migration 304).
        const { data: removed, error } = await supabase.from('pricing_seasons').delete().eq('id', id).eq('tenant_id', tenant_id).select('id')
        if (error) return dbFail(error)
        if (!removed?.length) return notFound()
        return NextResponse.json({ success: true })
      }

      case 'add_dates': {
        const seasonId = String(body.season_id || '')
        const start = String(body.start_date || '').slice(0, 10)
        const end = String(body.end_date || '').slice(0, 10)
        if (!seasonId) return bad('season_id is required')
        if (!isDate(start) || !isDate(end)) return bad('Both dates are required')
        if (end < start) return bad('The end date cannot be before the start date')
        // The season must be this agency's: the foreign key does not check
        // the tenant, so a window could hang off another agency's season.
        const { data: season } = await supabase.from('pricing_seasons').select('id').eq('id', seasonId).eq('tenant_id', tenant_id).maybeSingle()
        if (!season) return notFound()
        const { error } = await supabase.from('pricing_season_dates').insert({
          tenant_id,
          season_id: seasonId,
          start_date: start,
          end_date: end,
          label: body.label ? String(body.label).trim().slice(0, 120) : null,
        })
        if (error) return dbFail(error)
        return NextResponse.json({ success: true })
      }

      case 'delete_dates': {
        const id = String(body.id || '')
        if (!id) return bad('id is required')
        const { data: removed, error } = await supabase.from('pricing_season_dates').delete().eq('id', id).eq('tenant_id', tenant_id).select('id')
        if (error) return dbFail(error)
        if (!removed?.length) return notFound()
        return NextResponse.json({ success: true })
      }

      default:
        return bad(`Unknown action: ${action}`)
    }
  } catch (err) {
    console.error('pricing-seasons POST:', err)
    return NextResponse.json({ success: false, error: 'Request failed' }, { status: 500 })
  }
}

function notFound() {
  return NextResponse.json({ success: false, error: 'Not found — it may have been deleted' }, { status: 404 })
}
function bad(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 })
}
function dbFail(error: { message: string }) {
  console.error('pricing-seasons db error:', error)
  return NextResponse.json({ success: false, error: error.message }, { status: 500 })
}
/** null = out of range; the CHECK enforces the same bounds in the database. */
function clampUplift(value: unknown): number | null {
  // A blank box is not 0% (it was saved as +0% with no word).
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 200) return null
  return Math.round(n * 100) / 100
}
function colourOf(value: unknown): string {
  const s = String(value ?? '')
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#647C47'
}
function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
}
