import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

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