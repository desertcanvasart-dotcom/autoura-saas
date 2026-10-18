// ============================================
// Rate limits counted in the database (migration 427)
// ============================================
// For the limits that must survive a deploy and hold across replicas: a
// company's hourly AI ceiling and invitation sending. The per-minute limits
// stay in memory (lib/rate-limit.ts) — cheap, and a restart resetting a
// one-minute window costs nothing.
//
// If the database cannot answer (migration not applied, a blip), the
// in-memory count is used instead: a limit that briefly forgets is better
// than refusing every request.

import { createAdminClient } from '@/lib/supabase-server'
import { checkRateLimit, RATE_LIMITS, type RateLimitResult } from '@/lib/rate-limit'

let warned = false

export async function checkSharedRateLimit(
  identifier: string,
  type: keyof typeof RATE_LIMITS,
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[type]
  try {
    const { data, error } = await (createAdminClient() as unknown as {
      rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
    }).rpc('rate_limit_take', {
      p_key: `${type}:${identifier}`,
      p_limit: config.limit,
      p_window_seconds: Math.round(config.windowMs / 1000),
    })
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; remaining?: number; reset_at?: string } | null
    if (error || !row || typeof row.allowed !== 'boolean') throw error ?? new Error('no answer')
    return {
      success: row.allowed,
      limit: config.limit,
      remaining: Number(row.remaining ?? 0),
      resetTime: Date.parse(String(row.reset_at)) || Date.now() + config.windowMs,
    }
  } catch (err) {
    if (!warned) {
      warned = true
      console.warn('Shared rate limit unavailable; counting in memory instead:', err instanceof Error ? err.message : err)
    }
    return checkRateLimit(identifier, type)
  }
}
