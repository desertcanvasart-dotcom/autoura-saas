// ============================================
// Previous / next at the foot of a docs page — from the TOC
// ============================================
// Every page wrote its own two links, and they drifted from the table of
// contents (the Communication page pointed back to Dashboard and on to
// Clients long after both had moved). They are read from toc.ts now, so
// reordering the docs reorders every page's neighbours with it.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CATEGORIES } from './toc'

const ORDER = CATEGORIES.flatMap(c => c.items)

/** The pages before and after `href` in the docs order. */
export function docNeighbours(href: string) {
  const at = ORDER.findIndex(item => item.href === href)
  if (at < 0) return { prev: null, next: null }
  return { prev: ORDER[at - 1] ?? null, next: ORDER[at + 1] ?? null }
}

export function DocPager({ href }: { href: string }) {
  const { prev, next } = docNeighbours(href)
  return (
    <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
      {prev ? (
        <Link
          href={prev.href}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          {prev.navLabel ?? prev.title}
        </Link>
      ) : <span />}
      {next ? (
        <Link
          href={next.href}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: {next.navLabel ?? next.title}
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : <span />}
    </div>
  )
}
