'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  Menu,
  X,
  Rocket,
  LayoutDashboard,
  Users,
  Map,
  CalendarCheck,
  FileText,
  Wallet,
  MessageCircle,
  Globe,
  FolderOpen,
  Settings,
  Lightbulb,
  Camera,
  BookOpen,
  MailPlus,
  Wand2,
  Calculator,
  Briefcase,
  ClipboardList,
  FileCheck,
  Bell,
  TrendingUp,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/docs/getting-started', label: 'Getting Started', icon: Rocket },
  { href: '/docs/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/docs/communication', label: 'Communication', icon: MessageCircle },
  { href: '/docs/clients', label: 'Clients (CRM)', icon: Users },
  { href: '/docs/itinerary-creation', label: 'Itinerary Creation', icon: Wand2 },
  { href: '/docs/itineraries', label: 'Itineraries', icon: Map },
  { href: '/docs/b2c-pricing', label: 'B2C Pricing', icon: Calculator },
  { href: '/docs/b2b-pricing', label: 'B2B Pricing', icon: Briefcase },
  { href: '/docs/tour-programs', label: 'Tour Programs Manager', icon: ClipboardList },
  { href: '/docs/b2b-quotes', label: 'B2B Quotes', icon: FileCheck },
  { href: '/docs/bookings', label: 'Bookings', icon: CalendarCheck },
  { href: '/docs/invoices-payments', label: 'Invoices & Payments', icon: FileText },
  { href: '/docs/expenses-commissions', label: 'Expenses & Commissions', icon: Wallet },
  { href: '/docs/profit-loss', label: 'Profit & Loss', icon: TrendingUp },
  { href: '/docs/followups-reminders', label: 'Follow-ups & Reminders', icon: Bell },
  { href: '/docs/tours-rates', label: 'Tours & Rates', icon: Globe },
  { href: '/docs/resources-documents', label: 'Resources & Documents', icon: FolderOpen },
  { href: '/docs/message-templates', label: 'Message Templates', icon: MailPlus },
  { href: '/docs/team-settings', label: 'Team & Settings', icon: Settings },
  { href: '/docs/workflows', label: 'Workflows & Tips', icon: Lightbulb },
]

export function ScreenshotPlaceholder({ caption }: { caption: string }) {
  return (
    <div className="my-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
      <Camera className="w-10 h-10 text-gray-400 mx-auto mb-2" />
      <p className="text-sm text-gray-500">Screenshot: {caption}</p>
    </div>
  )
}

export function DocScreenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="my-6">
      <img
        src={src}
        alt={alt}
        className="w-full border border-gray-200 rounded-lg shadow-sm"
        loading="lazy"
      />
      <p className="text-xs text-gray-400 mt-2 text-center">{alt}</p>
    </div>
  )
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg p-4">
      <div className="flex items-start gap-2">
        <Lightbulb className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-green-800">{children}</div>
      </div>
    </div>
  )
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const isHub = pathname === '/docs'

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              {!isHub && (
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700"
                  aria-label="Toggle sidebar"
                >
                  {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              )}
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/autoura-logo.png"
                  alt="Autoura"
                  width={140}
                  height={36}
                  className="h-9 w-auto"
                />
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/docs"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4" />
                All Docs
              </Link>
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Content Area */}
      {isHub ? (
        <main className="flex-1 pt-16">
          {children}
        </main>
      ) : (
        <div className="flex-1 pt-16 flex">
          {/* Sidebar Overlay (mobile) */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/30 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside
            className={`
              fixed top-16 bottom-0 left-0 z-40 w-64 bg-white border-r border-gray-200
              overflow-y-auto transition-transform duration-200 ease-in-out
              lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:translate-x-0 lg:z-0
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
          >
            <nav className="p-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${isActive
                        ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600 ml-0'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }
                    `}
                  >
                    <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </div>
          </main>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 bg-[#2d3b2d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">&copy; 2026 Autoura. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link href="/docs" className="text-gray-400 hover:text-white text-sm transition-colors">
                Docs
              </Link>
              <Link href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-gray-400 hover:text-white text-sm transition-colors">
                Terms
              </Link>
              <Link href="/contact" className="text-gray-400 hover:text-white text-sm transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
