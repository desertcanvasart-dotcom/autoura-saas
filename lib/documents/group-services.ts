// ============================================
// Supplier documents — helpers kept from the per-city generator
// ============================================
// The grouping itself moved to lib/documents/sync-plan (one document per
// kind for the whole trip, one hotel voucher per stay, Sync instead of
// skip-if-exists). Two pieces live on here:
//
// Entrance fees name their sites. The AI builder writes a day's fees as ONE
// line, "Entrance Fees (non-EUR)", with the sites only in its notes — and the
// PDF never printed notes, so no document said which sites were booked.

const clean = (s: unknown): string => String(s ?? '').trim()

const GENERIC_ENTRANCE = /^entrance fees?\b/i

/**
 * The name an entrance line goes out under: its own when it names a site;
 * the sites from its notes ("Sites: …", "Inside: … | Photo stops: …") or the
 * day's attractions when it is the generic "Entrance Fees" line.
 */
export function entranceLineName(
  service: { service_name?: string | null; notes?: string | null },
  dayAttractions: readonly unknown[] | null | undefined,
): string {
  const name = clean(service.service_name)
  if (name && !GENERIC_ENTRANCE.test(name)) return name
  const notes = clean(service.notes)
  const fromNotes = notes.match(/(?:Sites|Inside):\s*([^|]+)/i)?.[1]?.trim()
  const sites = fromNotes || (dayAttractions ?? []).map(a => clean(a)).filter(Boolean).join(', ')
  if (!sites) return name || 'Entrance Fees'
  return `${name || 'Entrance Fees'} — ${sites}`
}

/** "Generate" may be asked for some document types only. The button sent
 *  `documentTypes` while the route read `document_types`, so asking for hotel
 *  vouchers made every kind. Either name is accepted. */
export function requestedDocTypes(body: unknown): string[] | null {
  const b = (body ?? {}) as Record<string, unknown>
  const list = b.document_types ?? b.documentTypes
  return Array.isArray(list) && list.length > 0 ? list.map(String) : null
}
