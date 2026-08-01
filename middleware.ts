import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin-shared'

// ============================================
// API ROUTES THAT SELF-AUTHENTICATE
// ============================================
// These don't carry a Supabase session — they verify themselves another way
// (HMAC for webhooks, OAuth state for callbacks, CRON_SECRET for cron jobs,
// or are pre-session steps in an auth flow like signup verification).
// Every other /api/* route MUST go through the session check below.
//
// Exported for app/api/__tests__/route-auth-sweep.test.ts, which (a) runs
// every discovered route through this middleware anonymously and (b) checks
// each allowlisted handler actually self-authenticates. Adding an entry here
// fails that test until its self-auth mechanism is registered there too.
export const SELF_AUTH_API_PREFIXES = [
  '/api/webhooks/',         // HMAC-verified inbound (e.g. concierge brief, departure mirror)
  '/api/integrations/',     // server-to-server feeds; verifies SAWA_SYNC_SECRET inside the handler
  '/api/auth/',             // login / signup / OAuth callbacks (no session yet)
  '/api/cron/',             // cron-job-only, verifies CRON_SECRET inside the handler
  '/api/version',           // deploy-verification probe: public by design, sha+uptime only
  '/api/health',            // health probe: public by design, dependency status only
  '/api/billing/webhook',   // Stripe → us; verifies stripe-signature inside the handler
  '/api/whatsapp/webhook',  // Twilio → us; verifies X-Twilio-Signature inside the handler
  '/api/whatsapp/status-callback', // Twilio delivery receipts; same signature check
  // Invite acceptance: the invitee has no session yet (that is the point).
  // Both verify the secret invitation_token inside the handler, which is the
  // credential. Without these the invite flow 401'd and every invitee landed
  // on the dashboard with no tenant membership.
  '/api/invitations/verify',
  '/api/invitations/accept',
  // Public marketing contact form: the sender is a prospect with no session.
  // Self-protects with a per-IP rate limit + honeypot inside the handler.
  '/api/contact',
]

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
    '/about', '/contact', '/docs', '/integrations', '/pricing', '/privacy', '/terms',
    // Crawler surfaces (Next metadata routes; .txt/.xml are NOT excluded by
    // the matcher the way images are). These redirected to /login, which
    // made organic discovery impossible.
    '/robots.txt', '/sitemap.xml',
    // Token-gated public itinerary pages. The middleware only opens the path;
    // the page itself 404s any token that does not resolve to an unrevoked
    // share (app/share/[token]/page.tsx, service-role lookup).
    '/share',
  ]
  // Exact match or a true sub-path ('/contact/foo'), never a shared prefix
  // (a protected route must NOT match public '/contact' just because it
  // shares the prefix).
  const isPublicRoute = publicRoutes.some(route =>
    request.nextUrl.pathname === route ||
    (route !== '/' && request.nextUrl.pathname.startsWith(route + '/'))
  )

  const isApiRoute = request.nextUrl.pathname.startsWith('/api')
  const isSelfAuthApi = isApiRoute && SELF_AUTH_API_PREFIXES.some(
    prefix => request.nextUrl.pathname.startsWith(prefix)
  )

  // Centralised /api/* auth gate. Every API route except the self-auth
  // allowlist (HMAC webhooks, OAuth callbacks, cron jobs) MUST have a
  // session — return 401 JSON rather than redirecting, since the caller
  // is an API client, not a browser.
  // Prior to this gate, every /api/* route was reachable without a
  // session and relied on each handler's individual auth check, which
  // is exactly the bug the main app's audit closed.
  if (isApiRoute && !isSelfAuthApi && !user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // If user is not logged in and trying to access a protected page route
  if (!user && !isPublicRoute && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If user is logged in and trying to access login/signup (but not homepage).
  // Platform owners live in /super-admin, not the agency app.
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const home = user.email && isSuperAdmin(user.email) ? '/super-admin' : '/dashboard'
    return NextResponse.redirect(new URL(home, request.url))
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