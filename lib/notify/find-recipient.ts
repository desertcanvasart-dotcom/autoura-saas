// ============================================
// Who a WhatsApp assignment notice goes to
// ============================================
// The notify route read only `suppliers` until 2026-10-06, so every
// airport-staff, hotel-staff and directory-restaurant notice answered
// "Resource not found" — those ids are not supplier ids — and drivers were
// never sent at all. Each type is now looked up where it lives.

export type Recipient = { name: string | null; phone: string | null }
type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Where each assignable type keeps its people, and which fields hold the
 *  number — WhatsApp first, it is the channel being used. */
const SOURCES: Record<string, Array<{ table: string; phones: string[] }>> = {
  airport_staff: [{ table: 'airport_staff', phones: ['whatsapp', 'phone'] }],
  hotel_staff: [{ table: 'hotel_staff', phones: ['whatsapp', 'phone'] }],
  driver: [{ table: 'team_members', phones: ['whatsapp', 'phone'] }],
  // A restaurant is a directory contact, or (picked from Rates → Meals) the
  // supplier its meal rates are linked to.
  restaurant: [
    { table: 'restaurant_contacts', phones: ['whatsapp', 'phone'] },
    { table: 'suppliers', phones: ['whatsapp', 'contact_phone', 'phone2'] },
  ],
}
const FALLBACK = [{ table: 'suppliers', phones: ['whatsapp', 'contact_phone', 'phone2'] }]

export async function findRecipient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Supabase client, or a test double
  supabase: { from: (table: string) => any },
  tenantId: string,
  resourceType: string,
  resourceId: string
): Promise<Recipient | null> {
  for (const source of SOURCES[resourceType] ?? FALLBACK) {
    const { data } = await supabase
      .from(source.table)
      .select('*')
      .eq('id', resourceId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!data) continue
    const row = data as Row
    return {
      name: str(row.name),
      phone: source.phones.map(p => str(row[p])).find(Boolean) ?? null,
    }
  }
  return null
}
