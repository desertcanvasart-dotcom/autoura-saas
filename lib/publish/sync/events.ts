// ============================================
// Publish sync — the events, and what each one refreshes
// ============================================
// Step 1 of docs/publish/PLAN.md. The database writes every change Publish
// cares about to publish_change_log (migration 439). This module is the one
// place that says what a logged change MEANS: which event it is, what a valid
// payload looks like, and which page tags must be revalidated.
//
// The Sawa mirror never sent a payload because a handler was looked up by the
// wrong name, and nothing noticed. So there is no lookup by name here: every
// event type maps to a definition holding its schema and a direct reference
// to its handler, the map is checked exhaustive by the compiler
// (`satisfies Record<SyncEventType, …>`), and the dispatcher calls handlers
// only through it. lib/__tests__/publish-sync-contract.test.ts holds every
// entry to that.

import { z } from 'zod'

// ---------- what the database watches (mirrors migration 439) ----------

/** Tables with a publish_record_change() trigger. */
export const WATCHED_TABLES = [
  'tour_templates', 'tour_variations', 'tour_days', 'tour_day_activities',
  'tour_variation_services', 'variation_services', 'variation_pricing',
  'variation_daily_itinerary', 'tour_departures', 'tenants', 'exchange_rates',
  // Migration 441: the company's cancellation terms, shown on tour pages.
  'cancellation_policies',
] as const

/** Product tables that hang off a variation: the trigger finds their tour
 *  through tour_variations, which is gone if the variation was deleted. */
export const VARIATION_CHILD_TABLES = [
  'tour_variation_services', 'variation_services', 'variation_pricing', 'variation_daily_itinerary',
] as const
const PRODUCT_TABLES = ['tour_templates', 'tour_variations', 'tour_days', 'tour_day_activities', ...VARIATION_CHILD_TABLES] as const

/** The rate tables rate_audit_log covers (migration 252); their changes reach
 *  publish_change_log through the trigger on rate_audit_log. */
export const RATE_TABLES = [
  'accommodation_rates', 'transportation_rates', 'guide_rates', 'meal_rates',
  'entrance_fees', 'flight_rates', 'activity_rates', 'tipping_rates',
  'airport_staff_rates', 'hotel_staff_rates', 'nile_cruises', 'train_rates',
  'sleeping_train_rates',
] as const

export type WatchedTable = typeof WATCHED_TABLES[number]
export type RateTable = typeof RATE_TABLES[number]

/** A row of publish_change_log, as the worker reads it. */
export interface ChangeRow {
  id: number
  tenant_id: string | null
  table_name: string
  record_id: string | null
  op: string
  template_id: string | null
  changed_fields: string[]
  is_active: boolean | null
  changed_at: string
  attempts: number
}

// ---------- page tags ----------
// Keyed by company: Phase 1 has one site per company (PLAN D16). The renderer
// tags each page with these when it fetches its data.

export const publishTags = {
  /** Everything on the company's site (identity, footer, every page). */
  site: (tenantId: string) => `publish:tenant:${tenantId}`,
  /** Every tour page and tour listing of the company. */
  tours: (tenantId: string) => `publish:tenant:${tenantId}:tours`,
  /** One tour's page, in every language. */
  tour: (templateId: string) => `publish:tour:${templateId}`,
}

// ---------- events ----------

export type SyncEventType =
  | 'product.created'
  | 'product.updated'
  | 'product.unpublished'
  | 'rate.changed'
  | 'departure.changed'
  | 'policy.changed'
  | 'fx.changed'

const uuid = z.string().uuid()
const op = z.enum(['INSERT', 'UPDATE', 'DELETE'])

const productPayload = z.object({
  tenantId: uuid,
  templateId: uuid.nullable(),
  table: z.enum(PRODUCT_TABLES),
  op,
  changedFields: z.array(z.string()),
}).refine(
  p => p.templateId !== null || (VARIATION_CHILD_TABLES as readonly string[]).includes(p.table),
  { path: ['templateId'], message: 'a tour, day or variation change must name its tour' },
)
const ratePayload = z.object({
  tenantId: uuid.nullable(), // null = a shared rate row: every enrolled company
  table: z.enum(RATE_TABLES),
  recordId: uuid.nullable(),
  op,
  changedFields: z.array(z.string()),
})
const departurePayload = z.object({
  tenantId: uuid,
  templateId: uuid.nullable(), // a mirrored departure may name no tour
  recordId: uuid.nullable(),
  op,
})
const policyPayload = z.object({
  tenantId: uuid,
  table: z.enum(['tenants', 'cancellation_policies']),
  op,
  changedFields: z.array(z.string()),
})
const fxPayload = z.object({
  tenantId: uuid.nullable(), // null = the shared rate table
  op,
})

export type ProductPayload = z.infer<typeof productPayload>
export type RatePayload = z.infer<typeof ratePayload>
export type DeparturePayload = z.infer<typeof departurePayload>
export type PolicyPayload = z.infer<typeof policyPayload>
export type FxPayload = z.infer<typeof fxPayload>

/** What a handler decided: the tags to revalidate for ONE company. */
export interface HandlerResult {
  tags: string[]
}

/** The company fields a site shows. A change to anything else on `tenants`
 *  (billing ids, settings, email domain…) touches no page. */
export const SITE_IDENTITY_FIELDS = [
  'company_name', 'tagline', 'logo_url', 'primary_color', 'secondary_color',
  'license_number', 'company_address', 'company_phone', 'contact_email',
  'whatsapp_number', 'company_website', 'currency', 'default_currency',
  'rates_currency',
] as const

// Each handler is a named function, referenced (never named) by the registry.
// `tenantId` is the company being refreshed — for a shared row, the worker
// calls the handler once per enrolled company.

/** The tour's page and the listings; a variation-level change whose tour is
 *  no longer findable refreshes all the company's tours instead. */
function productTags(p: ProductPayload, tenantId: string): string[] {
  return p.templateId ? [publishTags.tour(p.templateId), publishTags.tours(tenantId)] : [publishTags.tours(tenantId)]
}

function handleProductCreated(p: ProductPayload, tenantId: string): HandlerResult {
  return { tags: productTags(p, tenantId) }
}

function handleProductUpdated(p: ProductPayload, tenantId: string): HandlerResult {
  // Step 7 adds: narrative-relevant fields queue a regeneration draft.
  return { tags: productTags(p, tenantId) }
}

function handleProductUnpublished(p: ProductPayload, tenantId: string): HandlerResult {
  // The page itself answers 410 once it re-renders (step 5); listings and
  // sitemaps drop it on the same refresh.
  return { tags: productTags(p, tenantId) }
}

function handleRateChanged(_p: RatePayload, tenantId: string): HandlerResult {
  // Rates reach tours only through the pricing engine's lookups (city, tier,
  // preferred hotel, season), so which tours a rate touches is not knowable
  // from the row: every tour page of the company is refreshed (PLAN D10).
  return { tags: [publishTags.tours(tenantId)] }
}

function handleDepartureChanged(p: DeparturePayload, tenantId: string): HandlerResult {
  return { tags: p.templateId ? [publishTags.tour(p.templateId)] : [publishTags.tours(tenantId)] }
}

function handlePolicyChanged(p: PolicyPayload, tenantId: string): HandlerResult {
  // Cancellation terms appear on tour pages; which tours use the default is
  // not in the row, so all of them refresh.
  if (p.table === 'cancellation_policies') return { tags: [publishTags.tours(tenantId)] }
  const shown = p.op !== 'UPDATE' || p.changedFields.some(f => (SITE_IDENTITY_FIELDS as readonly string[]).includes(f))
  return { tags: shown ? [publishTags.site(tenantId)] : [] }
}

function handleFxChanged(_p: FxPayload, tenantId: string): HandlerResult {
  // Indicative currency figures, and costs priced in another currency.
  return { tags: [publishTags.tours(tenantId)] }
}

export interface EventDefinition<P> {
  schema: z.ZodType<P>
  handle: (payload: P, tenantId: string) => HandlerResult
}

export const SYNC_EVENTS = {
  'product.created': { schema: productPayload, handle: handleProductCreated },
  'product.updated': { schema: productPayload, handle: handleProductUpdated },
  'product.unpublished': { schema: productPayload, handle: handleProductUnpublished },
  'rate.changed': { schema: ratePayload, handle: handleRateChanged },
  'departure.changed': { schema: departurePayload, handle: handleDepartureChanged },
  'policy.changed': { schema: policyPayload, handle: handlePolicyChanged },
  'fx.changed': { schema: fxPayload, handle: handleFxChanged },
} satisfies { [K in SyncEventType]: { schema: z.ZodType; handle: (payload: never, tenantId: string) => HandlerResult } }

// ---------- from a logged row to an event ----------

export type ClassifiedChange =
  | { ok: true; type: SyncEventType; payload: unknown }
  | { ok: false; error: string }

/** Which event a logged change is, and its payload — not yet validated. */
export function classifyChange(row: ChangeRow): ClassifiedChange {
  const base = { op: row.op, changedFields: row.changed_fields ?? [] }
  switch (row.table_name) {
    case 'tour_templates':
    case 'tour_variations':
    case 'tour_days':
    case 'tour_day_activities':
    case 'tour_variation_services':
    case 'variation_services':
    case 'variation_pricing':
    case 'variation_daily_itinerary': {
      const payload = { ...base, tenantId: row.tenant_id, templateId: row.template_id, table: row.table_name }
      const unpublished = row.table_name === 'tour_templates'
        && (row.op === 'DELETE' || (row.op === 'UPDATE' && row.changed_fields.includes('is_active') && row.is_active === false))
      if (unpublished) return { ok: true, type: 'product.unpublished', payload }
      if (row.table_name === 'tour_templates' && row.op === 'INSERT') return { ok: true, type: 'product.created', payload }
      return { ok: true, type: 'product.updated', payload }
    }
    case 'tour_departures':
      return { ok: true, type: 'departure.changed', payload: { tenantId: row.tenant_id, templateId: row.template_id, recordId: row.record_id, op: row.op } }
    case 'tenants':
    case 'cancellation_policies':
      return { ok: true, type: 'policy.changed', payload: { ...base, tenantId: row.tenant_id, table: row.table_name } }
    case 'exchange_rates':
      return { ok: true, type: 'fx.changed', payload: { tenantId: row.tenant_id, op: row.op } }
    default:
      if ((RATE_TABLES as readonly string[]).includes(row.table_name)) {
        return { ok: true, type: 'rate.changed', payload: { ...base, tenantId: row.tenant_id, table: row.table_name, recordId: row.record_id } }
      }
      return { ok: false, error: `no event for table "${row.table_name}"` }
  }
}

export type DispatchResult =
  | { ok: true; type: SyncEventType; tags: string[] }
  | { ok: false; error: string }

/**
 * Classify, validate and run the handler for one company. The handler is
 * reached only through SYNC_EVENTS[type] — the single dispatch path.
 */
export function dispatchChange(row: ChangeRow, tenantId: string): DispatchResult {
  const classified = classifyChange(row)
  if (!classified.ok) return classified
  const def = SYNC_EVENTS[classified.type] as EventDefinition<unknown>
  const parsed = def.schema.safeParse(classified.payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `${classified.type}: invalid payload (${issue?.path.join('.') || 'root'}: ${issue?.message})` }
  }
  return { ok: true, type: classified.type, tags: def.handle(parsed.data, tenantId).tags }
}
