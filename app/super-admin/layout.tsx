'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Shield, Building2, Users, BarChart3, LogOut } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/super-admin', icon: BarChart3 },
  { label: 'Tenants', href: '/super-admin/tenants', icon: Building2 },
  { label: 'Users', href: '/super-admin/users', icon: Users },
  { label: 'Analytics', href: '/super-admin/analytics', icon: BarChart3 },
]

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    // Quick check: try fetching super admin analytics (will 403 if not super admin)
    fetch('/api/super-admin/analytics')
      .then(res => {
        setAuthorized(res.ok)
      })
      .catch(() => setAuthorized(false))
  }, [])

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  if (authorized === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-gray-400 mb-4">You are not authorized to access the Super Admin panel.</p>
          <Link href="/dashboard" className="text-blue-400 hover:underline">Return to Dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-950 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" />
            <span className="text-white font-bold text-sm">Super Admin</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Platform Management</p>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href ||
              (item.href !== '/super-admin' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-2 py-3 border-t border-gray-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Back to App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-900">
        {children}
      </main>
    </div>
  )
}
