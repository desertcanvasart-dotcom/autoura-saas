// ============================================
// GET /api/bookings/[id]/extras/catalog — what can be added to this trip
// ============================================
// Ported from travel-ops-pro. Three lists, because there are three ways an
// option exists:
//
//   THIS PROGRAMME'S OPTIONS   the optional services on the tour variations of
//                              the programme this trip was quoted from. The
//                              operator curates them per package, and each can
//                              carry its own selling price. This app's
//                              itineraries carry no template id, so the
//                              programme is reached through the booking's B2B
//                              quote (b2b_quotes.variation_id).
//   ATTRACTION EXTRAS          entrance fees flagged is_sellable_extra — a
//                              site the customer can pay to add. Deliberately
//                              NOT is_addon: that means "not auto-priced", a
//                              different decision that does not imply this one.
//   CATALOGUE EXTRAS           extras_catalogue — fast-track, luggage, late
//                              check-out: sellable things that are not
//                              attractions and never will be.
//
// All are PRE-FILLS. Every price is a suggestion the office can change before
// the option is offered, and anything that cannot be priced honestly comes
// back unpriced with the reason attached — never as zero.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { extrasAdmin } from '@/lib/booking-extras-db'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'
import { resolveMarginPercent } from '@/lib/pricing/resolve-margin'
import { loadFxContext } from '@/lib/fx-report'
import { convertOnDate } from '@/lib/fx-conversion'
import { priceCatalogItem, entranceFeeBasis, type CatalogItem, type Converter } from '@/lib/extras-catalog'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const tenantId = auth.tenant_id
  const { id } = await params
  const typed = createAdminClient()
  const admin = extrasAdmin()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, currency, quote_id, quote_type, num_travelers')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const bookingCurrency = booking.currency || 'EUR'
  const [rateCurrency, tenantRow] = await Promise.all([
    getTenantRunCurrency(typed, tenantId),
    admin.from('tenants').select('default_margin_percent').eq('id', tenantId).maybeSingle(),
  ])
  // The house rate — the same resolver every quote uses (explicit → user →
  // tenant → floor); a catalogue pre-fill has no per-quote figure to prefer.
  const marginPercent = resolveMarginPercent({ tenantDefault: tenantRow.data?.default_margin_percent }).marginPercent

  // Today's rate: a pre-fill is a quote being prepared now, not a historical
  // line being restated. Null when there is no rate, which the pricing turns
  // into an unpriced item rather than a guess.
  const fx = await loadFxContext(typed, { currencies: [rateCurrency, bookingCurrency], reportingCurrency: bookingCurrency })
  const convert: Converter = (amount, from, to) =>
    convertOnDate(fx.fxIndex, amount, from, to, new Date().toISOString(), fx.liveRate).amount

  // Per-row currency: a rate row may name the currency it was entered in, and
  // it wins over the tenant's. Rows with no rate_currency fall back to the
  // tenant's, which is what every rate table did before the column existed.
  const price = (cost: unknown, sellingOverride: unknown, row?: { rate_currency?: string | null }) =>
    priceCatalogItem({
      cost,
      sellingOverride,
      marginPercent,
      rateCurrency: row?.rate_currency || rateCurrency,
      bookingCurrency,
      convert,
    })

  // ---------- this programme's own options ----------
  const packageItems: CatalogItem[] = []
  const templateId = await templateForBooking(admin, booking.quote_id, booking.quote_type, tenantId)
  if (templateId) {
    const { data: variations } = await admin
      .from('tour_variations')
      .select('id, variation_name, tier')
      .eq('template_id', templateId)
      .eq('tenant_id', tenantId)
    const variationIds = (variations ?? []).map((v: { id: string }) => v.id)
    if (variationIds.length) {
      const { data: services, error } = await admin
        .from('tour_variation_services')
        .select('id, variation_id, service_name, service_category, cost_per_unit, optional_price_override, quantity_mode, notes')
        .in('variation_id', variationIds)
        .eq('is_optional', true)
      if (error) console.error('extras catalog: variation services', error)

      const variationById = new Map<string, { id: string; variation_name: string }>((variations ?? []).map((v: { id: string; variation_name: string }) => [v.id, v]))
      // The same option usually exists on every tier of a programme. The office
      // is choosing an option, not a tier, so it is listed once — by name.
      const seen = new Set<string>()
      for (const s of services ?? []) {
        const key = String(s.service_name || '').trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        // tour_variation_services has no rate_currency column: tenant currency.
        const priced = price(s.cost_per_unit, s.optional_price_override)
        const variation = variationById.get(s.variation_id)
        packageItems.push({
          source_kind: 'package_option',
          source_id: String(s.id),
          title: String(s.service_name),
          subtitle: [s.service_category, variation?.variation_name].filter(Boolean).join(' · ') || null,
          supplier_id: null,
          ...priced,
          currency: bookingCurrency,
          // Migration 320 mapped the options' unit onto quantity_mode:
          // per_person → 'per_pax', per_booking → 'fixed'. Anything else
          // (per_day, per_night…) is not multiplied by pax.
          unit: s.quantity_mode === 'per_pax' ? 'per_person' : 'per_booking',
        })
      }
    }
  }

  // ---------- attraction extras (sellable sites) ----------
  const addonItems: CatalogItem[] = []
  const { data: addons, error: addonError } = await admin
    .from('entrance_fees')
    .select('id, attraction_name, city, eur_rate, non_eur_rate, rate_currency, is_active, addon_note, supplier_id, tenant_id')
    .eq('is_sellable_extra', true)
    // The rate catalogue is tenant rows plus the shared global rows (tenant_id
    // NULL), exactly as the engine reads it.
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
  if (addonError) console.error('extras catalog: sellable attraction extras', addonError)

  for (const a of addons ?? []) {
    if (a.is_active === false) continue
    const { cost, basis } = entranceFeeBasis(a)
    const priced = price(cost, null, a)
    addonItems.push({
      source_kind: 'entrance_fee',
      source_id: String(a.id),
      title: String(a.attraction_name),
      subtitle: [a.city, a.addon_note].filter(Boolean).join(' · ') || null,
      supplier_id: a.supplier_id ?? null,
      ...priced,
      // A booking does not record passport type, so the office is told which
      // rate this price came from.
      price_note: basis ? `${basis}, ${priced.price_note}` : priced.price_note,
      currency: bookingCurrency,
      // An entrance ticket is inherently per person.
      unit: 'per_person',
    })
  }

  // ---------- catalogue extras (not attractions) ----------
  const catalogueItems: CatalogItem[] = []
  const { data: catalogue, error: catalogueError } = await admin
    .from('extras_catalogue')
    .select('id, name, description, category, supplier_cost, supplier_id, selling_price, unit, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
  if (catalogueError) console.error('extras catalog: catalogue extras', catalogueError)

  for (const c of catalogue ?? []) {
    // Same rule as a package option: a selling price the operator set IS the
    // price (off-margin); blank means cost plus the tenant's margin.
    const priced = price(c.supplier_cost, c.selling_price)
    catalogueItems.push({
      source_kind: 'catalogue_extra',
      source_id: String(c.id),
      title: String(c.name),
      subtitle: [c.category, c.description, c.unit === 'per_booking' ? 'per booking' : 'per person'].filter(Boolean).join(' · ') || null,
      supplier_id: c.supplier_id ?? null,
      ...priced,
      currency: bookingCurrency,
      unit: c.unit === 'per_booking' ? 'per_booking' : 'per_person',
    })
  }

  return NextResponse.json({
    currency: bookingCurrency,
    rate_currency: rateCurrency,
    margin_percent: marginPercent,
    // The party size, so the picker can add per-person rows × pax.
    num_travelers: booking.num_travelers ?? 1,
    groups: [
      { source: 'package', label: 'Options in this programme', items: packageItems },
      { source: 'addon', label: 'Attraction extras', items: addonItems },
      { source: 'catalogue', label: 'Extras', items: catalogueItems },
    ].filter(g => g.items.length > 0),
  })
}

/** The tour template this trip was quoted from, if it was a B2B quote. */
async function templateForBooking(
  admin: ReturnType<typeof extrasAdmin>,
  quoteId: string | null | undefined,
  quoteType: string | null | undefined,
  tenantId: string
): Promise<string | null> {
  if (!quoteId || quoteType !== 'b2b') return null
  const { data: quote } = await admin.from('b2b_quotes').select('variation_id').eq('id', quoteId).eq('tenant_id', tenantId).maybeSingle()
  if (!quote?.variation_id) return null
  const { data: variation } = await admin.from('tour_variations').select('template_id').eq('id', quote.variation_id).maybeSingle()
  return variation?.template_id ?? null
}
