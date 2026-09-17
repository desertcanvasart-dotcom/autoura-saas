import { createAdminClient } from '@/lib/supabase-server'

/**
 * Billing Middleware
 * Handles usage tracking and limit enforcement for metered features
 */

/**
 * NOTE — the SQL enforcement path used to live here.
 *
 * `checkLimit()` called the `check_usage_limit` RPC, `trackUsage()` called
 * `increment_usage` with a legacy metric vocabulary and no window, and
 * `withBillingCheck()` wrapped both. All three were dead: `checkLimit` was
 * imported once and invoked zero times, so nothing reached the RPC.
 *
 * They could only ever express two of the five limits in lib/pricing-config.ts,
 * hard-blocked at 100% with no grace band, and read usage from whichever
 * `tenant_usage` row had not yet expired rather than the computed window the
 * gates use. Enforcement now lives entirely in lib/usage-limits.ts and
 * lib/usage-enforcement.ts; migration 241 drops the RPC and the plan limit
 * columns it read.
 *
 * `logActivity` below is unrelated and still live.
 */

/**
 * Log activity for audit trail.
 *
 * Always on the service-role client: log_activity is SECURITY DEFINER and
 * takes the tenant id as an argument, so migration 361 revoked it from anon
 * and authenticated (the signed-in client could write audit rows into any
 * tenant). `tenantId` must come from requireAuth(), never from a request body.
 * `client` exists for tests only.
 */
export async function logActivity(
  tenantId: string,
  userId: string,
  actionType: string,
  options?: {
    resourceType?: string
    resourceId?: string
    details?: any
    ipAddress?: string
    userAgent?: string
  },
  client?: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> }
): Promise<void> {
  try {
    const admin = client ?? createAdminClient()
    const { error } = await (admin as any).rpc('log_activity', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_action_type: actionType,
      p_resource_type: options?.resourceType || null,
      p_resource_id: options?.resourceId || null,
      p_details: options?.details || null,
      p_ip_address: options?.ipAddress || null,
      p_user_agent: options?.userAgent || null
    })

    if (error) {
      console.error('Error logging activity:', error)
    }
  } catch (err) {
    console.error('Error in logActivity:', err)
  }
}

