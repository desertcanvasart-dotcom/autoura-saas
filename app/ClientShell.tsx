'use client'
import { useState, useEffect, Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { captureFirstTouch } from '@/lib/marketing-attribution'
import Sidebar from "@/components/Sidebar"
import TopBar from "@/components/nav/TopBar"
import ImpersonationBanner from "@/components/ImpersonationBanner"
import SupportChatWidget from "@/components/SupportChatWidget"
import ClosureBanner from "@/components/account/ClosureBanner"
import { AuthProvider } from './contexts/AuthContext'
import { TenantProvider } from './contexts/TenantContext'
import { ConfirmDialogProvider } from '@/components/ConfirmDialog'
import { Toaster } from './contexts/ToastContext'
import MarketingAnalytics from '@/components/MarketingAnalytics'

// Client half of the root layout: chrome selection (sidebar vs public) and
// the provider tree. The root layout itself is a server component so the
// site can export metadata (titles, Open Graph, canonical) — a client root
// layout cannot.
export default function ClientShell({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Pages that should NOT show the sidebar (public pages)
  const publicPages = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/terms', '/privacy', '/contact', '/integrations', '/about', '/pricing', '/demo', '/blog']
  // Customer-facing pages get no app chrome. /share is a traveller's itinerary
  // link — rendering the operator's sidebar ("Dashboard", "Sign out") around a
  // client's trip is both confusing and a claim they have an account here.
  // NOTE: this list is separate from middleware.ts's publicRoutes (that one
  // decides ACCESS, this one decides CHROME) — a route usually needs both.
  // /pricing was missing here until 2026-07-29: the public pricing page
  // rendered the operator sidebar for logged-in visitors.
  // Token pages: held by a traveller (/share, /portal), a no-login staff
  // member (/staff) or a supplier (/reply, /supplier, and their sign-in and
  // home). No sidebar, no support chat, no analytics, no first-touch capture —
  // and no notification-polling nav 401ing in their console. Found missing
  // for the supplier pages in the 2026-10-30 click-through.
  const TOKEN_PREFIXES = ['/share/', '/staff/', '/portal/', '/reply/', '/supplier/']
  const TOKEN_PAGES = ['/supplier-login', '/supplier-home']
  const isTokenPage = TOKEN_PREFIXES.some(p => pathname.startsWith(p)) || TOKEN_PAGES.includes(pathname)
  const isPublicPage =
    publicPages.includes(pathname) ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/blog/') ||
    // The invitation page (often logged out) and the setup wizard: no app
    // navigation around them, so nobody wanders off mid-way.
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/onboarding') ||
    isTokenPage
  const isSuperAdminPage = pathname.startsWith('/super-admin')
  // The Settings area has its own layout (app/settings/layout.tsx): its own
  // grouped sidebar and a way back, never the main sidebar.
  const isSettingsPage = pathname === '/settings' || pathname.startsWith('/settings/')

  // First-touch UTM/referrer capture (sessionStorage, cookie-free) so the
  // contact form can attribute a submission to the campaign that actually
  // brought the visitor — not just whatever URL they submitted from.
  useEffect(() => {
    if (isPublicPage && !isTokenPage) captureFirstTouch()
  }, [isPublicPage, isTokenPage, pathname])

  return (
    <AuthProvider>
      <TenantProvider>
        <ConfirmDialogProvider>
          <Toaster />
          <ImpersonationBanner />
          {isPublicPage ? (
            // Public pages - no sidebar. Marketing analytics (consent-gated)
            // lives ONLY here — never on app or traveller-share pages.
            <main className="min-h-screen">
              {children}
              {!isTokenPage && <MarketingAnalytics />}
            </main>
          ) : isSuperAdminPage ? (
            // Super admin pages - own layout handles sidebar
            <>{children}</>
          ) : (
            // App pages: the top bar over the main sidebar and the page. The
            // Settings area swaps the main sidebar for its own (its layout).
            <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
              <TopBar
                variant={isSettingsPage ? 'settings' : 'app'}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen(o => !o)}
              />
              <div className="flex flex-1 min-h-0">
                {!isSettingsPage && (
                  // The sidebar reads the query (?channel= picks Email or
                  // WhatsApp); useSearchParams needs a Suspense boundary.
                  <Suspense fallback={<div className="hidden lg:block w-64 shrink-0 bg-white border-r border-gray-200" />}>
                    <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
                  </Suspense>
                )}
                <main className="app-main flex-1 min-w-0 overflow-y-auto">
                  <ClosureBanner />
                  {children}
                </main>
              </div>
              <SupportChatWidget />
            </div>
          )}
        </ConfirmDialogProvider>
      </TenantProvider>
    </AuthProvider>
  )
}
