// ============================================
// Reading `limit` / `page` off a list request
// ============================================
// `parseInt(searchParams.get('limit') || '50')` takes whatever the caller
// sends: `limit=100000` asked for everything (PostgREST then stopped at 1000
// without saying so, and totalPages was computed on the number asked for, not
// the rows returned), and `limit=abc` became NaN in the range maths.

/** A whole number from a query value, kept within [min, max]. A missing,
 *  unreadable or non-positive value is the fallback. */
export function clampedIntParam(
  raw: string | null | undefined,
  { fallback, min = 1, max }: { fallback: number; min?: number; max: number },
): number {
  const n = parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n < min) return Math.min(Math.max(fallback, min), max)
  return Math.min(n, max)
}

/** The most rows one list request returns. */
export const MAX_LIST_LIMIT = 200
