// ============================================
// Ask the database each thing once per calculation
// ============================================
// Measured against live data on 2026-09-18: ONE tour card on /tours cost 48
// round trips to the database and 6.8 seconds, because the "starting from"
// price is computed once per tier and each tier re-fetched the same things —
// the same template row four times, the same alias table four times, the same
// entrance fee twelve times. Every round trip costs ~200ms through PostgREST,
// so the repeats were most of the wait.
//
// This is a memo SCOPE, not a cache. Inside one calculation, identical reads
// happen once; outside a scope memoRead is a plain pass-through, so nothing is
// ever remembered between requests and no operator can be shown a stale rate.
// The promise is stored rather than the result, so tiers running concurrently
// share one in-flight request instead of racing to make the same one.

import { AsyncLocalStorage } from 'node:async_hooks'

type Store = Map<string, Promise<unknown>>

const storage = new AsyncLocalStorage<Store>()

/** Run a calculation with a memo scope around it. */
export function withQueryMemo<T>(run: () => Promise<T>): Promise<T> {
  // Already inside one (a nested calculation): keep the outer scope, so the
  // whole tree shares it.
  const existing = storage.getStore()
  if (existing) return run()
  return storage.run(new Map(), run)
}

/**
 * One read, memoised by key for the life of the surrounding scope.
 *
 * The key must name EVERY argument that changes the answer — tier, tenant,
 * date, id. A key that leaves one out would hand a deluxe price to a standard
 * quote, which is worse than any number of round trips.
 */
export async function memoRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const store = storage.getStore()
  if (!store) return read()

  const hit = store.get(key)
  if (hit) return hit as Promise<T>

  const pending = read()
  store.set(key, pending)
  try {
    return await pending
  } catch (err) {
    // A failed read is not an answer: let the next caller try again.
    store.delete(key)
    throw err
  }
}

/** Test seam: how many distinct reads the current scope has served. */
export function memoSize(): number {
  return storage.getStore()?.size ?? 0
}
