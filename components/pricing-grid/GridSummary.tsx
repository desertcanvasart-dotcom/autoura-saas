'use client'

import { Save, ExternalLink, Loader2 } from 'lucide-react'
import type { GridConfig, GridTotals } from '@/app/pricing-grid/types'
import { convertAmount, formatCurrency } from '@/app/pricing-grid/lib/calculator'

interface GridSummaryProps {
  config: GridConfig
  totals: GridTotals
  dayCount: number
  isSaving: boolean
  savedUrl: string | null
  onSave: () => void
}

export default function GridSummary({ config, totals, dayCount, isSaving, savedUrl, onSave }: GridSummaryProps) {
  const displayRate = config.exchangeRate
  const cur = config.currency

  if (dayCount === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Grand Totals */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">Grand Totals</h3>
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <span className="text-xs text-gray-400 block">Cost PP</span>
            <span className="text-lg font-bold text-gray-800">
              {formatCurrency(convertAmount(totals.costPerPerson, displayRate), cur)}
            </span>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <span className="text-xs text-gray-400 block">Total Cost</span>
            <span className="text-lg font-bold text-gray-800">
              {formatCurrency(convertAmount(totals.totalCost, displayRate), cur)}
            </span>
          </div>
          <div className="bg-[#647C47]/5 rounded-lg p-3 text-center border border-[#647C47]/20">
            <span className="text-xs text-[#647C47] block">Selling PP</span>
            <span className="text-lg font-bold text-[#647C47]">
              {formatCurrency(convertAmount(totals.sellingPricePerPerson, displayRate), cur)}
            </span>
          </div>
          <div className="bg-[#647C47]/10 rounded-lg p-3 text-center border border-[#647C47]/30">
            <span className="text-xs text-[#647C47] block">Selling Total</span>
            <span className="text-xl font-bold text-[#647C47]">
              {formatCurrency(convertAmount(totals.sellingPriceTotal, displayRate), cur)}
            </span>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
            <span className="text-xs text-amber-600 block">Margin ({config.marginPercent}%)</span>
            <span className="text-lg font-bold text-amber-600">
              {formatCurrency(convertAmount(totals.marginAmount, displayRate), cur)}
            </span>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-400 text-center">
          {dayCount} days | {config.pax} pax | {config.tier} tier | {config.clientType.toUpperCase()} | {cur}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <div>
          {savedUrl && (
            <a
              href={savedUrl}
              className="flex items-center gap-1.5 text-sm text-[#647C47] hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              View saved itinerary
            </a>
          )}
        </div>
        <button
          onClick={onSave}
          disabled={isSaving || dayCount === 0}
          className="btn-primary px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save {config.clientType === 'b2b' ? 'as B2B Quote' : 'as Itinerary'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
