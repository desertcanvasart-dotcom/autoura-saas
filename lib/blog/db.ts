// The service-role client for the blog table. Throws rather than falling
// back to the anonymous key — the table refuses anon anyway.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function blogDb(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to read the blog')
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}
