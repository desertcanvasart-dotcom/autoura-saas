'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  Menu,
  X,
  Camera,
  BookOpen,
  Lightbulb,
} from 'lucide-react'
// One list, both renderers — the sidebar and the /docs index render the same
// app/(public)/docs/toc.ts. The sidebar used to carry its own flat NAV_ITEMS
// copy that had already drifted from the index (different order and grouping,
// and it had dropped the Integrations entry).
import { CATEGORIES } from './toc'

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
                  src="/get-autoura-logo.png"
                  alt="Autoura"
                  width={560}
                  height={219}
                  className="h-9 w-auto max-w-none"
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
            <nav className="p-4 space-y-4">
              {CATEGORIES.map((category) => (
                <div key={category.label}>
                  <p className="px-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {category.label}
                  </p>
                  <div className="space-y-0.5">
                    {category.items.map((item) => {
                      const Icon = item.icon
                      const isActive = pathname === item.href

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`
                            flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                            ${isActive
                              ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600 ml-0'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }
                          `}
                        >
                          <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                          {item.navLabel ?? item.title}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
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

    </div>
  )
}
