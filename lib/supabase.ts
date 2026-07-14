import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'
import { createClient as createSharedBrowserClient } from '@/app/supabase'

// Mock client for build time when env vars aren't available
const createMockClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  },
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    insert: async () => ({ data: null, error: null }),
    update: async () => ({ data: null, error: null }),
    delete: async () => ({ data: null, error: null })
  })
} as unknown as SupabaseClient)

// Lazy initialization to avoid build-time errors when env vars aren't available
export const createClient = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Return mock client during build time
    return createMockClient()
  }

  // In the browser, ALWAYS return the shared cookie-based @supabase/ssr client
  // (app/supabase.ts) — the one the login flow authenticates. A plain
  // supabase-js client here looks for its session in localStorage, finds
  // nothing (login stores it in cookies), and silently runs every query as
  // `anon`. In the travel-ops-pro sibling this exact split broke every direct
  // browser read of an RLS-scoped table ("Itinerary not found" on edit) the
  // moment RLS went live — fixed there 2026-07-14 (PR #40); same fix here.
  if (typeof window !== 'undefined') {
    return createSharedBrowserClient()
  }

  // Server-side (a handful of API routes import this): keep the historical
  // anon client UNCHANGED for now. Migrating those routes to the service-role
  // client with org scoping is the follow-up (travel-ops-pro did this as a
  // separate step); do not silently change their role here.
  return createSupabaseClient(url, key)
}

// Lazy-initialized singleton (only created when first accessed at runtime)
let _supabase: SupabaseClient | null = null

export const getSupabase = (): SupabaseClient => {
  if (!_supabase) {
    _supabase = createClient()
  }
  return _supabase
}

// For backward compatibility - returns the lazy-initialized client
// Note: This is now a getter function, not a constant
// Components using `supabase` directly should migrate to `createClient()` or `getSupabase()`
export { getSupabase as supabase }