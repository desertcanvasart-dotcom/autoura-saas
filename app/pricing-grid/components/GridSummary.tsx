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
  /** The selling total as last saved — the Update button shows the change. */
  savedSellingTotal?: number | null
}

export default function GridSummary({ totals, config, dayCount, unpricedGuideBedDays = [], onSave, isSaving, savedItineraryId, savedItineraryCode, savedQuoteId, savedQuoteNumber, saveMessage, savedSellingTotal = null }: GridSummaryProps) {
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

  // What a re-save would change: the selling total now vs as last saved.
  const priceDiff = savedItineraryId && savedSellingTotal != null
    ? Math.round((totals.sellingPriceTotal - savedSellingTotal) * 100) / 100
    : null
  const priceChanged = priceDiff !== null && Math.abs(priceDiff) >= 0.01

  const saveLabel = isSaving
    ? 'Saving...'
    : !savedItineraryId
      ? (isB2B ? 'Save as B2B Quote' : 'Save as Itinerary')
      : isB2B
        ? 'Update B2B Quote'
        : priceChanged
          ? `Update itinerary & quote (${priceDiff! > 0 ? '+' : '−'}${sym}${fmt(cv(Math.abs(priceDiff!)))})`
          : 'Update itinerary & quote'

  return (
    // Sticky: the price and the save button stay in view while the days
    // scroll above them.
    <div className="sticky bottom-0 z-20 mt-4 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
      {/* Throughout guide: unpriced bed nights — amber, never a silent zero
          bed (B-item 3). */}
      {unpricedGuideBedDays.length > 0 && (
        <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          ⚠ {unpricedGuideBedDays.length} night{unpricedGuideBedDays.length === 1 ? '' : 's'} without a guide bed rate
          (day{unpricedGuideBedDays.length === 1 ? '' : 's'} {unpricedGuideBedDays.join(', ')}) — the throughout
          guide&rsquo;s bed is NOT in this total. Add &ldquo;Guide Bed / Night&rdquo; to those properties&rsquo; rate periods.
        </div>
      )}

      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* Numbers */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <SummaryCell label="Cost / person" value={cv(totals.costPerPerson)} symbol={sym} />
          <SummaryCell label="Total cost" value={cv(totals.totalCost)} symbol={sym} />
          <SummaryCell
            label={`Margin (${marginPercent}%)`}
            value={cv(totals.marginAmount)}
            symbol={sym}
            color={totals.marginAmount > 0 ? 'text-amber-600' : 'text-red-500'}
          />
          <SummaryCell label="Selling / person" value={cv(totals.sellingPricePerPerson)} symbol={sym} color="text-green-600" />
          <SummaryCell label="Selling total" value={cv(totals.sellingPriceTotal)} symbol={sym} color="text-green-700" strong />
        </div>

        {/* Save + links */}
        {onSave && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {viewLink && (
              <a
                href={viewLink}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  isB2B ? 'text-purple-600 hover:bg-purple-50' : 'text-blue-600 hover:bg-blue-50'
                }`}
              >
                {viewLabel}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {!isB2B && savedQuoteId && (
              <a
                href={`/quotes/b2c/${savedQuoteId}`}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                View quote{savedQuoteNumber ? ` ${savedQuoteNumber}` : ''}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={onSave}
              disabled={isSaving}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors ${
                isB2B ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'
              } ${priceChanged ? 'ring-2 ring-offset-1 ring-amber-400' : ''}`}
              title={priceChanged ? 'The price has changed since the last save' : undefined}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saveLabel}
            </button>
          </div>
        )}
      </div>

      {/* Context + what the last save did */}
      <div className="px-4 py-1 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-x-3 text-[11px] text-gray-500">
        <span>
          {dayCount} days {'\u00B7'} {pax} pax {'\u00B7'} {config.passport === 'eu' ? 'EU' : 'Non-EU'} {'\u00B7'} {config.tier} {'\u00B7'} {config.clientType.toUpperCase()}
          {savedItineraryCode && <span className="ml-1 font-medium text-green-700">{'\u00B7'} {savedItineraryCode}</span>}
        </span>
        {priceChanged && !isSaving && (
          <span className="font-medium text-amber-700">Unsaved price change</span>
        )}
        {saveMessage && (
          <span className={`whitespace-pre-line font-medium ${saveMessage.includes('not created') ? 'text-amber-700' : 'text-green-700'}`}>{saveMessage}</span>
        )}
      </div>
    </div>
  )
}

function SummaryCell({ label, value, symbol, color, strong }: {
  label: string; value: number; symbol: string; color?: string; strong?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</div>
      <div className={`${strong ? 'text-lg' : 'text-sm'} font-bold tabular-nums ${color || 'text-gray-900'}`}>
        {symbol}{value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}
