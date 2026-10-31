import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'

// ============================================
// /api/settings/currencies — Settings › Currencies & rates (migration 456)
// ============================================
// The currency new quotes are shown in, the conversion buffer (display
// only), which currencies quote pickers offer, and the exchange rates: the
// shared API rate per currency and the company's own override, with who set
// it and when. Every override, reset and in-use change is logged in
// exchange_rate_events. Owners and admins only.

const BASE = 'EUR' // the shared API rates are quoted 1 EUR = …
const MAX_BUFFER = 20
const supported = (c: unknown): c is string => typeof c === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(c)

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'admin')
  if (denied) return denied
  const { supabase, tenant_id } = auth

  const [tenant, shared, own] = await Promise.all([
    supabase.from('tenants')
      .select('default_currency, default_quote_currency, conversion_buffer_percent, currencies_in_use')
      .eq('id', tenant_id).single(),
    supabase.from('exchange_rates')
      .select('target_currency, rate, api_fetched_at, last_updated_at')
      .is('tenant_id', null).eq('base_currency', BASE).eq('is_active', true),
    supabase.from('exchange_rates')
      .select('target_currency, rate, set_by, set_at, last_updated_at')
      .eq('tenant_id', tenant_id).eq('base_currency', BASE).eq('is_active', true),
  ])
  const error = tenant.error ?? shared.error ?? own.error
  if (error || !tenant.data) return NextResponse.json({ success: false, error: error?.message ?? 'Company not found' }, { status: 500 })
  const company = tenant.data

  const setters = [...new Set((own.data ?? []).map(r => r.set_by).filter((v): v is string => !!v))]
  const names = new Map<string, string>()
  if (setters.length > 0) {
    const { data: people } = await supabase.from('user_profiles').select('id, full_name, email').in('id', setters)
    for (const p of people ?? []) names.set(p.id, p.full_name || p.email || 'someone')
  }

  const apiBy = new Map((shared.data ?? []).map(r => [r.target_currency, r]))
  const ownBy = new Map((own.data ?? []).map(r => [r.target_currency, r]))
  const rates = SUPPORTED_CURRENCIES.filter(c => c !== BASE).map(code => {
    const api = apiBy.get(code)
    const o = ownBy.get(code)
    return {
      currency: code,
      api_rate: api ? Number(api.rate) : null,
      override: o
        ? { rate: Number(o.rate), set_by: o.set_by ? names.get(o.set_by) ?? null : null, set_at: o.set_at ?? o.last_updated_at }
        : null,
    }
  })
  const lastApiFetch = (shared.data ?? [])
    .map(r => r.api_fetched_at)
    .filter((v): v is string => !!v)
    .sort()
    .pop() ?? null

  return NextResponse.json({
    success: true,
    data: {
      base: BASE,
      billing_currency: company.default_currency,
      default_quote_currency: company.default_quote_currency,
      conversion_buffer_percent: Number(company.conversion_buffer_percent ?? 0),
      currencies_in_use: company.currencies_in_use,
      rates,
      last_api_fetch: lastApiFetch,
    },
  })
}

interface PatchBody {
  default_quote_currency?: unknown
  conversion_buffer_percent?: unknown
  currencies_in_use?: unknown
  /** currency → your rate, or null to go back to the API rate. */
  overrides?: unknown
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'admin')
  if (denied) return denied
  const { supabase, tenant_id, user } = auth
  const userId = user?.id ?? null

  const body = (await request.json().catch(() => null)) as PatchBody | null
  if (!body) return NextResponse.json({ success: false, error: 'Nothing to save' }, { status: 400 })
  const bad = (msg: string) => NextResponse.json({ success: false, error: msg }, { status: 400 })

  // ---- validate everything before writing anything
  const tenantPatch: { default_quote_currency?: string | null; conversion_buffer_percent?: number; currencies_in_use?: string[] } = {}
  if ('default_quote_currency' in body) {
    const c = body.default_quote_currency
    if (c !== null && !supported(c)) return bad('Unsupported quote currency')
    tenantPatch.default_quote_currency = c as string | null
  }
  if ('conversion_buffer_percent' in body) {
    const b = body.conversion_buffer_percent
    if (typeof b !== 'number' || !Number.isFinite(b) || b < 0 || b > MAX_BUFFER) return bad(`The buffer must be between 0 and ${MAX_BUFFER}%`)
    tenantPatch.conversion_buffer_percent = Math.round(b * 100) / 100
  }
  let inUse: string[] | undefined
  if ('currencies_in_use' in body) {
    const list = body.currencies_in_use
    if (!Array.isArray(list) || !list.every(supported)) return bad('Unsupported currency in the list')
    inUse = [...new Set([BASE, ...(list as string[])])]
    tenantPatch.currencies_in_use = inUse
  }
  const overrides: Array<[string, number | null]> = []
  if (body.overrides !== undefined) {
    if (typeof body.overrides !== 'object' || body.overrides === null) return bad('Invalid rates')
    for (const [code, v] of Object.entries(body.overrides as Record<string, unknown>)) {
      if (!supported(code) || code === BASE) return bad(`Unsupported currency ${code}`)
      if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) return bad(`The rate for ${code} must be a number above 0`)
      overrides.push([code, v as number | null])
    }
  }

  // ---- the company's settings, and what changed in its currency list
  const { data: before, error: readError } = await supabase
    .from('tenants').select('currencies_in_use, default_currency').eq('id', tenant_id).single()
  if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 })
  if (tenantPatch.default_quote_currency && inUse && !inUse.includes(tenantPatch.default_quote_currency)) {
    return bad('The default quote currency must be one in use')
  }
  if (Object.keys(tenantPatch).length > 0) {
    const { error } = await supabase.from('tenants').update(tenantPatch).eq('id', tenant_id)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const events: Array<{ tenant_id: string; currency: string; action: string; old_rate?: number | null; new_rate?: number | null; user_id: string | null }> = []
  if (inUse) {
    const was = new Set(before.currencies_in_use ?? SUPPORTED_CURRENCIES)
    const now = new Set(inUse)
    for (const c of SUPPORTED_CURRENCIES) {
      if (c === BASE) continue
      if (now.has(c) && !was.has(c)) events.push({ tenant_id, currency: c, action: 'in_use', user_id: userId })
      if (!now.has(c) && was.has(c)) events.push({ tenant_id, currency: c, action: 'not_in_use', user_id: userId })
    }
  }

  // ---- overrides: write or remove the company's own row
  const nowIso = new Date().toISOString()
  for (const [code, rate] of overrides) {
    const { data: existing, error: findError } = await supabase
      .from('exchange_rates').select('id, rate')
      .eq('tenant_id', tenant_id).eq('base_currency', BASE).eq('target_currency', code).maybeSingle()
    if (findError) return NextResponse.json({ success: false, error: findError.message }, { status: 500 })
    if (rate === null) {
      if (!existing) continue
      const { error } = await supabase.from('exchange_rates').delete().eq('id', existing.id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      events.push({ tenant_id, currency: code, action: 'reset', old_rate: Number(existing.rate), new_rate: null, user_id: userId })
      continue
    }
    const row = {
      tenant_id, base_currency: BASE, target_currency: code, rate, source: 'manual', is_active: true,
      last_updated_at: nowIso, set_by: userId, set_at: nowIso,
    }
    const { error } = existing
      ? await supabase.from('exchange_rates').update(row).eq('id', existing.id)
      : await supabase.from('exchange_rates').insert(row)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    events.push({ tenant_id, currency: code, action: 'override', old_rate: existing ? Number(existing.rate) : null, new_rate: rate, user_id: userId })
  }

  if (events.length > 0) {
    const { error } = await supabase.from('exchange_rate_events').insert(events)
    // The change itself is saved; a log that failed to write is reported, not hidden.
    if (error) return NextResponse.json({ success: false, error: `Saved, but the change log could not be written: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
