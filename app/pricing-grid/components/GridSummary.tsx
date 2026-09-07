'use client'

import { Save, ExternalLink, Loader2 } from 'lucide-react'
import type { GridTotals, GridConfig } from '../types'
import { convertAmount } from '../lib/calculator'
import { getCurrencySymbol } from '@/lib/currency'

interface GridSummaryProps {
  totals: GridTotals
  config: GridConfig
  dayCount: number
  /** Throughout mode: nights whose chosen property has NO guide rate —
   *  shown amber above the summary, never a silent zero bed (B-item 3). */
  unpricedGuideBedDays?: number[]
  onSave?: () => void
  isSaving?: boolean
  savedItineraryId?: string | null
  savedItineraryCode?: string | null
  savedQuoteId?: string | null
  savedQuoteNumber?: string | null
  saveMessage?: string | null
}

export default function GridSummary({ totals, config, dayCount, unpricedGuideBedDays = [], onSave, isSaving, savedItineraryId, savedItineraryCode, savedQuoteId, savedQuoteNumber, saveMessage }: GridSummaryProps) {
  const { pax, marginPercent, currency } = config
  const sym = getCurrencySymbol(currency)
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const cv = (n: number) => convertAmount(n, config.exchangeRate)

  const isB2B = config.clientType === 'b2b'

  // Determine the primary view link based on B2B/B2C
  const viewLink = isB2B && savedQuoteId
    ? `/quotes/b2b/${savedQuoteId}`
    : savedItineraryId
      ? `/itineraries/${savedItineraryId}`
      : null

  const viewLabel = isB2B && savedQuoteId
    ? `View B2B Quote${savedQuoteNumber ? ` (${savedQuoteNumber})` : ''}`
    : 'View Itinerary'

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-4">
      {/* Throughout guide: unpriced bed nights — amber, never a silent zero
          bed (B-item 3). */}
      {unpricedGuideBedDays.length > 0 && (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          ⚠ {unpricedGuideBedDays.length} night{unpricedGuideBedDays.length === 1 ? '' : 's'} without a guide bed rate
          (day{unpricedGuideBedDays.length === 1 ? '' : 's'} {unpricedGuideBedDays.join(', ')}) — the throughout
          guide&rsquo;s bed is NOT in this total. Add &ldquo;Guide Bed / Night&rdquo; to those properties&rsquo; rate periods.
        </div>
      )}
      {/* Header */}
      <div className="px-5 py-3 bg-gray-800 text-white flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Grand Summary</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {dayCount} days {'\u00B7'} {pax} pax {'\u00B7'} {config.passport === 'eu' ? 'EU' : 'Non-EU'} {'\u00B7'} {config.tier} {'\u00B7'} {config.clientType.toUpperCase()}
            {savedItineraryCode && <span className="ml-2 text-green-400">{'\u2014'} {savedItineraryCode}</span>}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400 uppercase">Avg per day</div>
          <div className="text-sm font-bold text-gray-300">
            {sym}{dayCount > 0 ? fmt(cv(totals.costPerPerson / dayCount)) : '0.00'}/pp
          </div>
        </div>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-100">
        <SummaryCell label="Cost / Person" value={cv(totals.costPerPerson)} symbol={sym} />
        <SummaryCell label="Total Cost" value={cv(totals.totalCost)} symbol={sym} />
        <SummaryCell
          label={`Margin (${marginPercent}%)`}
          value={cv(totals.marginAmount)}
          symbol={sym}
          color={totals.marginAmount > 0 ? 'text-amber-600' : 'text-red-500'}
        />
        <SummaryCell label="Selling / Person" value={cv(totals.sellingPricePerPerson)} symbol={sym} color="text-green-600" highlight />
        <SummaryCell label="Selling Total" value={cv(totals.sellingPriceTotal)} symbol={sym} color="text-green-700" highlight />
      </div>

      {/* Save Actions */}
      {onSave && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Save Button */}
            <button
              onClick={onSave}
              disabled={isSaving}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors ${
                isB2B
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving
                ? 'Saving...'
                : savedItineraryId
                  ? (isB2B ? 'Update B2B Quote' : 'Update Itinerary')
                  : (isB2B ? 'Save as B2B Quote' : 'Save as Itinerary')
              }
            </button>

            {/* Success message */}
            {saveMessage && (
              <span className={`text-sm font-medium whitespace-pre-line ${saveMessage.includes('not created') ? 'text-amber-700' : 'text-green-600'}`}>{saveMessage}</span>
            )}
          </div>

          {/* View Link — routes to B2B quotes for B2B, itineraries for B2C */}
          <div className="flex items-center gap-2">
            {viewLink && (
              <a
                href={viewLink}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isB2B
                    ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-50'
                    : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                }`}
              >
                {viewLabel}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {/* B2C only: show itinerary link */}
            {!isB2B && savedItineraryId && (
              <a
                href={`/itineraries/${savedItineraryId}`}
                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                View Itinerary
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCell({ label, value, symbol, color, highlight }: {
  label: string; value: number; symbol: string; color?: string; highlight?: boolean
}) {
  return (
    <div className={`px-4 py-3 ${highlight ? 'bg-green-50/50' : ''}`}>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color || 'text-gray-900'}`}>
        {symbol}{value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}
