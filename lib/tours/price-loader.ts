// ============================================
// Filling tour cards in with their prices, a few at a time
// ============================================
// The tours page shows its list at once and asks for prices afterwards
// (/api/tours/browse/prices). This is the asking: small batches, a couple in
// flight, each card filled in when ITS batch answers — so one slow tour holds
// up two neighbours, not the page.
//
// A batch that fails is reported as failed for exactly its own tours, and the
// rest carry on: a price that could not be fetched must never look like a tour
// that has no price.
//
// Import-free and DOM-free: the page is a client component, and this is tested
// without a browser.

export interface StartingFrom {
  starting_from: number | null
  starting_from_tier: string | null
  /** false when the figure is from a tier that could not price every service. */
  complete?: boolean
  /** Services the chosen tier could not price; 0 when complete. */
  gaps?: number
}

export type PriceState =
  | { status: 'pending' }
  | { status: 'done'; starting_from: number | null; starting_from_tier: string | null; complete: boolean; gaps: number }
  | { status: 'failed' }

export const BATCH_SIZE = 3
export const CONCURRENCY = 2

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

export type FetchBatch = (ids: string[], signal?: AbortSignal) => Promise<Record<string, StartingFrom>>
export type OnBatch = (update: Record<string, PriceState>) => void

/**
 * Price `ids` in batches. `onBatch` is called once per batch with the state of
 * exactly that batch's tours. Resolves when every batch has been reported, or
 * quietly when `signal` is aborted (a page that has gone does not want them).
 */
export async function loadPricesInBatches(
  ids: readonly string[],
  fetchBatch: FetchBatch,
  onBatch: OnBatch,
  opts: { batchSize?: number; concurrency?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const batches = chunk([...new Set(ids)], opts.batchSize ?? BATCH_SIZE)
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      if (opts.signal?.aborted) return
      const batch = batches[next++]
      try {
        const prices = await fetchBatch(batch, opts.signal)
        if (opts.signal?.aborted) return
        onBatch(Object.fromEntries(batch.map(id => {
          const p = prices[id]
          // Not in the answer = the server did not find that tour for this
          // agency. It has no price to show; that is "done", not "failed".
          return [id, { status: 'done', starting_from: p?.starting_from ?? null, starting_from_tier: p?.starting_from_tier ?? null, complete: p?.complete ?? true, gaps: p?.gaps ?? 0 } as PriceState]
        })))
      } catch {
        if (opts.signal?.aborted) return
        onBatch(Object.fromEntries(batch.map(id => [id, { status: 'failed' } as PriceState])))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? CONCURRENCY) }, worker))
}
