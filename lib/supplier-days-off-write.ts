// ============================================
// A supplier marks or clears a day off — the one writer for both doors
// ============================================
// The supplier's own page (app/api/supplier-page/[token]/days-off) and the
// signed-in inbox (app/api/supplier-account/days-off) take the same taps.
// The caller has already proved which agency and supplier; this writes the
// day (lib/supplier-days-off checks it) and tells the office. Server only:
// lib/supplier-days-off stays pure because a client component imports it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { checkDayOff, cleanNote } from '@/lib/supplier-days-off'
import { notifyTeam } from '@/lib/notifications'

export type DayOffWrite = { ok: true } | { ok: false; status: 400 | 500; error: string }

/** Which supplier at which agency — proved by the caller, never read from the body. */
export interface DayOffWho { tenantId: string; supplierId: string }

const today = () => new Date().toISOString().slice(0, 10)

/** Mark `day` off for this supplier at this agency, then alert the office. */
export async function markSupplierDayOff(
  db: SupabaseClient,
  who: DayOffWho,
  body: { day?: unknown; note?: unknown },
  opts: { via: string; today?: string },
): Promise<DayOffWrite> {
  const checked = checkDayOff(body.day, opts.today ?? today())
  if (!checked.ok) return { ok: false, status: 400, error: checked.error }
  const note = cleanNote(body.note)

  const { error } = await db.from('supplier_unavailable_days').upsert(
    { tenant_id: who.tenantId, supplier_id: who.supplierId, day: checked.day, note, marked_by: 'supplier' },
    { onConflict: 'tenant_id,supplier_id,day', ignoreDuplicates: true },
  )
  if (error) return { ok: false, status: 500, error: 'Could not save — please try again' }

  const { data: supplier } = await db.from('suppliers').select('name, company_name')
    .eq('id', who.supplierId).eq('tenant_id', who.tenantId).maybeSingle()
  void notifyTeam({
    tenant_id: who.tenantId,
    dedupe_key: `supplier-day-off:${who.supplierId}:${checked.day}`,
    type: 'supplier',
    title: `${(supplier?.name || supplier?.company_name) ?? 'A supplier'} is not available on ${checked.day}`,
    message: note ?? opts.via,
    link: '/suppliers',
  }).catch(e => console.error('[days off] notify:', e))
  return { ok: true }
}

/** Remove a day off — only one the supplier marked (the office's stay). */
export async function clearSupplierDayOff(
  db: SupabaseClient,
  who: DayOffWho,
  day: unknown,
): Promise<DayOffWrite> {
  if (typeof day !== 'string') return { ok: false, status: 400, error: 'Choose a date' }
  const { error } = await db.from('supplier_unavailable_days').delete()
    .eq('tenant_id', who.tenantId).eq('supplier_id', who.supplierId).eq('day', day).eq('marked_by', 'supplier')
  if (error) return { ok: false, status: 500, error: 'Could not save — please try again' }
  return { ok: true }
}
