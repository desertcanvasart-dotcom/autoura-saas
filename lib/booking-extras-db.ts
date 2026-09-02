// ============================================
// Service-role access to the booking-extras tables, loosely typed
// ============================================
// booking_extras, bookings.base_total_cost / extras_total and
// entrance_fees.is_sellable_extra arrive with migration 321. Until it is
// applied and `npm run types:generate` re-run, the generated Database type does
// not know them, and the typed client would refuse every query at compile
// time. So the extras code reaches the database through this one loosely typed
// accessor — the same trick lib/rates/activity-tiers.ts used before migration
// 306 — and there is exactly one `any` in the whole feature, here.
//
// Every caller still scopes by tenant_id explicitly: the service-role client
// bypasses RLS.

import { createAdminClient } from '@/lib/supabase-server'

export type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export function extrasAdmin(): DbClient {
  return createAdminClient() as unknown as DbClient
}
