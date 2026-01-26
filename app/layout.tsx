'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Inter } from "next/font/google"
import "./globals.css"
import Sidebar from "@/components/Sidebar"
import { AuthProvider } from './contexts/AuthContext'
import { TenantProvider } from './contexts/TenantContext'
import { ConfirmDialogProvider } from '@/components/ConfirmDialog'

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
  const isPublicPage = publicPages.includes(pathname)

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <TenantProvider>
            <ConfirmDialogProvider>
              {isPublicPage ? (
                // Public pages - no sidebar
                <main className="min-h-screen">
                  {children}
                </main>
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
                </div>
              )}
            </ConfirmDialogProvider>
          </TenantProvider>
        </AuthProvider>
      </body>
    </html>
  )
}