'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Inter } from "next/font/google"
import "./globals.css"
import Sidebar from "@/components/Sidebar"
import ImpersonationBanner from "@/components/ImpersonationBanner"
import SupportChatWidget from "@/components/SupportChatWidget"
import { AuthProvider } from './contexts/AuthContext'
import { TenantProvider } from './contexts/TenantContext'
import { ConfirmDialogProvider } from '@/components/ConfirmDialog'
import { Toaster } from './contexts/ToastContext'

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()
  
  // Pages that should NOT show the sidebar (public pages)
  const publicPages = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/terms', '/privacy', '/contact', '/integrations', '/about']
  // Customer-facing pages get no app chrome. /share is a traveller's itinerary
  // link — rendering the operator's sidebar ("Dashboard", "Sign out") around a
  // client's trip is both confusing and a claim they have an account here.
  // NOTE: this list is separate from middleware.ts's publicRoutes (that one
  // decides ACCESS, this one decides CHROME) — a route usually needs both.
  const isPublicPage =
    publicPages.includes(pathname) ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/share/')
  const isSuperAdminPage = pathname.startsWith('/super-admin')

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <TenantProvider>
            <ConfirmDialogProvider>
              <Toaster />
              <ImpersonationBanner />
              {isPublicPage ? (
                // Public pages - no sidebar
                <main className="min-h-screen">
                  {children}
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
      </body>
    </html>
  )
}