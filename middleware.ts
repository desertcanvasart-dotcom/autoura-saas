import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Define route permissions - which roles can access which routes
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // Admin only
  '/settings': ['admin'],
  '/users': ['admin'],
  
  // Admin and Manager
  '/team-members': ['admin', 'manager'],
  '/financial-reports': ['admin', 'manager'],
  '/profit-loss': ['admin', 'manager'],
  '/accounts-receivable': ['admin', 'manager'],
  '/accounts-payable': ['admin', 'manager'],
  '/rates': ['admin', 'manager'],
  '/pricing-grid': ['admin', 'manager', 'agent'],
  '/hotels': ['admin', 'manager'],
  '/restaurants': ['admin', 'manager'],
  '/guides': ['admin', 'manager'],
  '/transportation': ['admin', 'manager'],
  '/attractions': ['admin', 'manager'],
  
  // Admin, Manager, Agent
  '/clients': ['admin', 'manager', 'agent'],
  '/itineraries': ['admin', 'manager', 'agent'],
  '/invoices': ['admin', 'manager', 'agent'],
  '/payments': ['admin', 'manager', 'agent'],
  '/tasks': ['admin', 'manager', 'agent'],
  '/inbox': ['admin', 'manager', 'agent'],
  '/whatsapp-inbox': ['admin', 'manager', 'agent'],
  '/whatsapp-parser': ['admin', 'manager', 'agent'],
  '/contacts': ['admin', 'manager', 'agent'],
  '/communications': ['admin', 'manager', 'agent'],
  '/followups': ['admin', 'manager', 'agent'],
  '/tours': ['admin', 'manager', 'agent'],
  '/expenses': ['admin', 'manager', 'agent'],
  '/reminders': ['admin', 'manager', 'agent'],
  
  // All authenticated users (including viewer)
  '/dashboard': ['admin', 'manager', 'agent', 'viewer'],
  '/analytics': ['admin', 'manager', 'agent', 'viewer'],
  '/calendar': ['admin', 'manager', 'agent', 'viewer'],
  '/notifications': ['admin', 'manager', 'agent', 'viewer'],
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Public routes that don't require authentication.
  // Keep in sync with app/(public)/* — the route-group folder name does NOT
  // grant public access automatically; the middleware has to know.
  const publicRoutes = [
    '/', '/login', '/signup', '/forgot-password', '/reset-password', '/invite/accept',
    '/about', '/contact', '/docs', '/integrations', '/privacy', '/terms',
  ]
  const isPublicRoute = publicRoutes.some(route => 
    request.nextUrl.pathname === route || 
    (route !== '/' && request.nextUrl.pathname.startsWith(route))
  )

  // Allow all API routes (they handle their own auth)
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  // If user is not logged in and trying to access protected route
  if (!user && !isPublicRoute && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If user is logged in and trying to access login/signup (but not homepage)
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ============================================
  // ROLE-BASED ACCESS CONTROL
  // ============================================
  
  if (user && !isPublicRoute && !isApiRoute) {
    const pathname = request.nextUrl.pathname

    // Super admin routes: only require authentication (super admin check at page/API level)
    if (pathname.startsWith('/super-admin')) {
      return response
    }

    // Check if this route has permission restrictions
    const matchedRoute = Object.keys(ROUTE_PERMISSIONS).find(route => {
      return pathname === route || pathname.startsWith(route + '/')
    })

    if (matchedRoute) {
      // Get user's role from profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()

      // Check if user is active
      if (profile && !profile.is_active) {
        // User is deactivated - sign them out and redirect
        return NextResponse.redirect(new URL('/login?error=account_inactive', request.url))
      }

      const userRole = profile?.role || 'viewer'
      const allowedRoles = ROUTE_PERMISSIONS[matchedRoute]

      // Check if user's role is allowed
      if (!allowedRoles.includes(userRole)) {
        // User doesn't have permission - redirect to dashboard with error
        return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}