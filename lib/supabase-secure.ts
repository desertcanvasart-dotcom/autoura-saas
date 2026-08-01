import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Types
export type UserRole = 'admin' | 'manager' | 'member' | 'viewer'

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
  is_active: boolean
}

interface AuthResult {
  supabase: ReturnType<typeof createServerClient>
  user: AuthenticatedUser | null
  error: string | null
}

/**
 * Creates a Supabase client using the user's session (not service role)
 * This ensures RLS policies are applied
 */
export async function createSecureClient(): Promise<ReturnType<typeof createServerClient>> {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // ANON key, not service role!
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle cookie errors in middleware
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle cookie errors
          }
        },
      },
    }
  )
}

/**
 * Get authenticated user with role from session
 * Returns null if not authenticated
 */
export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await createSecureClient()
  
  // Get user from session
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return { supabase, user: null, error: 'Not authenticated' }
  }
  
  // Get user profile with role
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email, role, is_active')
    .eq('id', user.id)
    .single()
  
  if (profileError || !profile) {
    return { supabase, user: null, error: 'Profile not found' }
  }
  
  if (!profile.is_active) {
    return { supabase, user: null, error: 'Account is deactivated' }
  }
  
  return {
    supabase,
    user: {
      id: profile.id,
      email: profile.email,
      role: profile.role as UserRole,
      is_active: profile.is_active
    },
    error: null
  }
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole)
}

/**
 * Check if user has minimum role level
 * Hierarchy: admin > manager > agent > viewer
 */
export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    admin: 4,
    manager: 3,
    member: 2,
    viewer: 1
  }
  return hierarchy[userRole] >= hierarchy[minimumRole]
}

/**
 * Helper to return unauthorized response
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  )
}

/**
 * Helper to return forbidden response
 */
export function forbiddenResponse(message = 'Insufficient permissions') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 }
  )
}

/**
 * Helper to return error response
 */
export function errorResponse(message: string, status = 500) {
  return NextResponse.json(
    { success: false, error: message },
    { status }
  )
}

/**
 * Helper to return success response
 */
export function successResponse(data: any, status = 200) {
  return NextResponse.json(
    { success: true, data },
    { status }
  )
}

// ============================================
// WRAPPER FUNCTIONS FOR COMMON PATTERNS
// ============================================

/**
 * Wrapper for API routes that require authentication
 */
export async function withAuth(
  handler: (supabase: ReturnType<typeof createServerClient>, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const { supabase, user, error } = await getAuthenticatedUser()
  
  if (error || !user) {
    return unauthorizedResponse(error || 'Not authenticated')
  }
  
  return handler(supabase, user)
}

/**
 * Wrapper for API routes that require specific roles
 */
export async function withRoles(
  requiredRoles: UserRole[],
  handler: (supabase: ReturnType<typeof createServerClient>, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const { supabase, user, error } = await getAuthenticatedUser()
  
  if (error || !user) {
    return unauthorizedResponse(error || 'Not authenticated')
  }
  
  if (!hasRole(user.role, requiredRoles)) {
    return forbiddenResponse(`Requires one of: ${requiredRoles.join(', ')}`)
  }
  
  return handler(supabase, user)
}

/**
 * Wrapper for admin-only routes
 */
export async function adminOnly(
  handler: (supabase: ReturnType<typeof createServerClient>, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withRoles(['admin'], handler)
}

/**
 * Wrapper for manager+ routes
 */
export async function managerOrAbove(
  handler: (supabase: ReturnType<typeof createServerClient>, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withRoles(['admin', 'manager'], handler)
}

/**
 * Wrapper for agent+ routes (excludes viewers)
 */
export async function agentOrAbove(
  handler: (supabase: ReturnType<typeof createServerClient>, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withRoles(['admin', 'manager', 'member'], handler)
}