import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy initialization to avoid build-time errors when env vars aren't available
export const createClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
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