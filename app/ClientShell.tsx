'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { captureFirstTouch } from '@/lib/marketing-attribution'
import Sidebar from "@/components/Sidebar"
import ImpersonationBanner from "@/components/ImpersonationBanner"
import SupportChatWidget from "@/components/SupportChatWidget"
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
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()

  // Pages that should NOT show the sidebar (public pages)
  const publicPages = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/terms', '/privacy', '/contact', '/integrations', '/about', '/pricing']
  // Customer-facing pages get no app chrome. /share is a traveller's itinerary
  // link — rendering the operator's sidebar ("Dashboard", "Sign out") around a
  // client's trip is both confusing and a claim they have an account here.
  // NOTE: this list is separate from middleware.ts's publicRoutes (that one
  // decides ACCESS, this one decides CHROME) — a route usually needs both.
  // /pricing was missing here until 2026-07-29: the public pricing page
  // rendered the operator sidebar for logged-in visitors.
  const isPublicPage =
    publicPages.includes(pathname) ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/share/')
  const isSuperAdminPage = pathname.startsWith('/super-admin')

  // First-touch UTM/referrer capture (sessionStorage, cookie-free) so the
  // contact form can attribute a submission to the campaign that actually
  // brought the visitor — not just whatever URL they submitted from.
  useEffect(() => {
    if (isPublicPage && !pathname.startsWith('/share/')) captureFirstTouch()
  }, [isPublicPage, pathname])

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
              {!pathname.startsWith('/share/') && <MarketingAnalytics />}
            </main>
          ) : isSuperAdminPage ? (
            // Super admin pages - own layout handles sidebar
            <>{children}</>
          ) : (
            // App pages - with sidebar
            <div className="flex h-screen overflow-hidden bg-gray-50">
              <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
              <main
                className={`flex-1 overflow-y-auto transition-all duration-300 ${
                  isCollapsed ? 'lg:ml-16' : 'lg:ml-56'
                }`}
              >
                {children}
              </main>
              <SupportChatWidget />
            </div>
          )}
        </ConfirmDialogProvider>
      </TenantProvider>
    </AuthProvider>
  )
}
