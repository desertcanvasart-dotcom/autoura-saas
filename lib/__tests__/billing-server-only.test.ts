import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================
// Billing rows are written by the server only (migration 423)
// ============================================
// Pre-launch review: an owner could set their own subscription to active on
// the top plan, or point stripe_customer_id at another business and open that
// customer's Stripe billing portal; any member could reset the usage counters
// that enforce plan limits — all straight through PostgREST.

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const sql = src('supabase/migrations/423_billing_tables_server_only.sql')

describe('migration 423', () => {
  it('drops the owner write policy on subscriptions and revokes writes', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Owners can manage subscription" ON public.tenant_subscriptions')
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.tenant_subscriptions FROM authenticated, anon/)
  })
  it('drops the member write policies on usage and revokes writes', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "System can update usage" ON public.tenant_usage')
    expect(sql).toContain('DROP POLICY IF EXISTS "System can insert usage" ON public.tenant_usage')
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.tenant_usage FROM authenticated, anon/)
  })
  it('guards tenants.stripe_customer_id against signed-in writes', () => {
    expect(sql).toContain("current_user IN ('authenticated', 'anon')")
    expect(sql).toContain('NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id')
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.tenants/)
  })
  it('keeps read access (the billing pages show plan and usage)', () => {
    expect(sql).not.toMatch(/REVOKE SELECT/)
    expect(sql).not.toMatch(/DROP POLICY IF EXISTS "Users can view their tenant (subscription|usage)"/)
  })
})

describe('the billing routes', () => {
  it('checkout stores the Stripe customer with the service role', () => {
    const r = src('app/api/billing/create-checkout-session/route.ts')
    expect(r).toMatch(/getOrCreateStripeCustomer\([\s\S]{0,120}createAdminClient\(\)\s*\)/)
  })
  it('the portal reads the customer id with the service role, not the session', () => {
    const r = src('app/api/billing/create-portal-session/route.ts')
    expect(r).toMatch(/await createAdminClient\(\)\s*\.from\('tenant_subscriptions'\)\s*\.select\('stripe_customer_id'\)/)
  })
})

describe('the signup page', () => {
  it('shows no Supabase debug panel to the public', () => {
    expect(src('app/signup/page.tsx')).not.toContain('SupabaseDebug')
  })
})
