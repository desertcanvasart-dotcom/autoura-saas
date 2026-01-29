/**
 * Supabase Server Utilities for Multi-Tenancy
 *
 * This file provides authenticated Supabase clients that respect RLS policies
 * for multi-tenant data isolation.
 */

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Check if we're in build mode (no env vars available)
const isBuildTime = !process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Creates an authenticated Supabase client from request cookies.
 * This client respects Row Level Security (RLS) policies and automatically
 * filters data based on the authenticated user's tenant.
 *
 * Use this for all database operations that should respect tenant isolation.
 */
export async function createAuthenticatedClient() {
  if (isBuildTime) {
    throw new Error('Supabase client cannot be created during build time');
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase admin client that bypasses RLS policies.
 *
 * ⚠️ WARNING: Use sparingly and only for:
 * - RPC function calls (like generating quote numbers)
 * - System-level operations
 * - Migrations and setup tasks
 *
 * DO NOT use for regular CRUD operations as it bypasses tenant isolation!
 */
export function createAdminClient() {
  if (isBuildTime) {
    throw new Error('Supabase admin client cannot be created during build time');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Gets the tenant_id for the currently authenticated user.
 *
 * @returns Object containing tenant_id and user, or error response data
 */
export async function getUserTenantId() {
  const supabase = await createAuthenticatedClient();

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      error: 'Unauthorized',
      status: 401,
      user: null,
      tenant_id: null,
    };
  }

  // Get user's tenant membership
  const { data: membership, error: membershipError } = await supabase
    .from('tenant_members')
    .select('tenant_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (membershipError || !membership) {
    return {
      error: 'User does not belong to any active tenant',
      status: 403,
      user,
      tenant_id: null,
    };
  }

  return {
    error: null,
    status: 200,
    user,
    tenant_id: membership.tenant_id,
    role: membership.role,
  };
}

/**
 * Middleware-style helper for API routes that require authentication and tenant membership.
 * Returns early response if auth fails, otherwise returns supabase client and tenant info.
 *
 * Usage:
 * ```typescript
 * const authResult = await requireAuth();
 * if (authResult.error) {
 *   return NextResponse.json(
 *     { success: false, error: authResult.error },
 *     { status: authResult.status }
 *   );
 * }
 * const { supabase, tenant_id, user } = authResult;
 * ```
 */
export async function requireAuth() {
  const result = await getUserTenantId();

  if (result.error) {
    return {
      error: result.error,
      status: result.status,
      supabase: null,
      tenant_id: null,
      user: null,
      role: null,
    };
  }

  return {
    error: null,
    status: 200,
    supabase: await createAuthenticatedClient(),
    tenant_id: result.tenant_id,
    user: result.user,
    role: result.role,
  };
}
