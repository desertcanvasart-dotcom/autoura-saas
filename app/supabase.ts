import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

let client: SupabaseClient<Database> | null = null

export function createClient(): SupabaseClient<Database> {
  // Return existing client if already created (singleton pattern)
  if (client) {
    return client
  }

  // Check for required env vars (avoids build-time errors during static page generation)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client during build time to prevent errors.
    // This won't be used at runtime since env vars will be available.
    // Cast through `unknown` so the mock satisfies the typed return without
    // widening the public return type to `any` (which would poison every
    // caller's query result typing).
    return {
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
    } as unknown as SupabaseClient<Database>
  }

  // Create new client only if it doesn't exist
  client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

  return client
}
