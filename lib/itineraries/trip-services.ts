// ============================================
// A trip's services, by its days
// ============================================
// itinerary_services.itinerary_id is NOT set by the main writers (AI
// generation and the itinerary editor insert itinerary_day_id only), so a
// read by itinerary_id found no lines for most trips — or only the copied
// ones on a duplicated trip — and the client total fell back to the stale
// cache. The days are the trip's; their services are the trip's services.

type Db = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c: string, v: string) => PromiseLike<{ data: Array<{ id: string }> | null; error: unknown }>
      in: (c: string, v: string[]) => unknown
    }
  }
}

export async function tripServices<T>(db: unknown, itineraryId: string, columns: string): Promise<{ ok: boolean; rows: T[] }> {
  const client = db as Db
  const { data: days, error } = await client.from('itinerary_days').select('id').eq('itinerary_id', itineraryId)
  if (error) return { ok: false, rows: [] }
  const dayIds = (days ?? []).map(d => d.id)
  if (dayIds.length === 0) return { ok: true, rows: [] }
  const { data, error: servicesError } = await (client
    .from('itinerary_services')
    .select(columns)
    .in('itinerary_day_id', dayIds) as PromiseLike<{ data: T[] | null; error: unknown }>)
  if (servicesError) return { ok: false, rows: [] }
  return { ok: true, rows: data ?? [] }
}
