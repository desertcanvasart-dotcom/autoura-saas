'use client'

// ============================================
// The one header every rate sheet uses (2026-11-07)
// ============================================
// Each of the fifteen rate pages built its own header: a two-line title, a
// stray dot, three grey CSV buttons, a "← Rates" back link and the Add
// button, all wrapping once the page had less than full width. One header
// now, on one line: the sheet's title and a short count on the left; on the
// right the page's own extra (if any), the Import / Export menu, and Add as
// the only filled button. The sidebar is the way back to other sheets.

import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'

/** The outlined button style for a page's own extra link or button. */
export const RATE_HEADER_BUTTON =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 h-9 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors'

export interface RatePageHeaderProps {
  icon: ComponentType<{ className?: string }>
  /** Short: "Hotels", not "Hotels & Accommodation" — the sidebar gives the group. */
  title: string
  /** e.g. "8 hotels · 2 cities". */
  subtitle?: ReactNode
  /** The rate table the Import / Export menu works on; omit for no menu. */
  table?: string
  onImported?: () => void
  /** The page's own extra actions, outlined (see RATE_HEADER_BUTTON). */
  extra?: ReactNode
  /** The Add button. Omit both for none (e.g. a read-only viewer). */
  addLabel?: string
  onAdd?: () => void
}

export default function RatePageHeader({ icon: Icon, title, subtitle, table, onImported, extra, addLabel, onAdd }: RatePageHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-gray-900">{title}</h1>
            {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {extra}
          {table && <BulkRateImportExport tableName={table} onImportComplete={onImported} />}
          {addLabel && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 h-9 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {addLabel}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

/** An outlined link for `extra`, e.g. "Hotel companies" → /suppliers?type=hotel. */
export function RateHeaderLink({ href, icon: Icon, children }: { href: string; icon?: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <Link href={href} className={RATE_HEADER_BUTTON}>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </Link>
  )
}
