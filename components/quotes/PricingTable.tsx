'use client'

import { Users, TrendingDown, TrendingUp } from 'lucide-react'

interface PricingTableProps {
  pricingTable: Record<string, { pp: number; total: number }>
  currency: string
  tourLeaderIncluded?: boolean
  highlightPax?: number
}

export default function PricingTable({
  pricingTable,
  currency = 'EUR',
  tourLeaderIncluded = false,
  highlightPax
}: PricingTableProps) {
  // Sort pax counts numerically
  const sortedPax = Object.keys(pricingTable)
    .map(Number)
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b)

  if (sortedPax.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm text-gray-500">No pricing data available</p>
      </div>
    )
  }

  // Calculate trend (price decrease as pax increases)
  const firstPax = sortedPax[0]
  const lastPax = sortedPax[sortedPax.length - 1]
  const priceDropPercent = Math.round(
    ((pricingTable[firstPax].pp - pricingTable[lastPax].pp) / pricingTable[firstPax].pp) * 100
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Multi-Pax Pricing Table
            </h3>
            <p className="text-sm text-purple-100 mt-1">
              {tourLeaderIncluded ? 'Tour Leader +1 Included' : 'Standard Pricing'}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-white">
              <TrendingDown className="w-5 h-5" />
              <span className="text-2xl font-bold">{priceDropPercent}%</span>
            </div>
            <div className="text-xs text-purple-100">savings at {lastPax} pax</div>
          </div>
        </div>
      </div>

      {/* Pricing Grid */}
      <div className="p-6">
        <div className="grid grid-cols-5 gap-3">
          {sortedPax.map((pax) => {
            const pricing = pricingTable[pax]
            const isHighlighted = highlightPax === pax
            const effectivePax = tourLeaderIncluded ? pax + 1 : pax

            return (
              <div
                key={pax}
                className={`rounded-lg border-2 p-4 text-center transition-all ${
                  isHighlighted
                    ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500 ring-offset-2'
                    : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                }`}
              >
                {/* Pax Count */}
                <div className="flex items-center justify-center gap-1 mb-2">
                  <Users className={`w-4 h-4 ${isHighlighted ? 'text-purple-600' : 'text-gray-400'}`} />
                  <span className={`text-2xl font-bold ${isHighlighted ? 'text-purple-700' : 'text-gray-900'}`}>
                    {pax}
                  </span>
                </div>

                {/* Tour Leader Indicator */}
                {tourLeaderIncluded && (
                  <div className="text-[10px] text-purple-600 font-medium mb-2">
                    +1 TL = {effectivePax} total
                  </div>
                )}

                {/* Per Person Price */}
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-1">Per Person</div>
                  <div className={`text-lg font-bold ${isHighlighted ? 'text-purple-700' : 'text-gray-900'}`}>
                    {currency} {pricing.pp.toLocaleString()}
                  </div>
                </div>

                {/* Total Price */}
                <div className={`pt-3 border-t ${isHighlighted ? 'border-purple-200' : 'border-gray-200'}`}>
                  <div className="text-xs text-gray-500 mb-1">Total</div>
                  <div className={`text-sm font-semibold ${isHighlighted ? 'text-purple-600' : 'text-gray-700'}`}>
                    {currency} {pricing.total.toLocaleString()}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Lowest Per Person</div>
              <div className="font-bold text-gray-900">
                {currency} {pricingTable[lastPax].pp.toLocaleString()} <span className="text-gray-500">({lastPax} pax)</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Highest Per Person</div>
              <div className="font-bold text-gray-900">
                {currency} {pricingTable[firstPax].pp.toLocaleString()} <span className="text-gray-500">({firstPax} pax)</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Price Range</div>
              <div className="font-bold text-gray-900">
                {currency} {(pricingTable[firstPax].pp - pricingTable[lastPax].pp).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Note about tour leader */}
        {tourLeaderIncluded && (
          <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-xs text-purple-700">
              <strong>Tour Leader (+1):</strong> All prices include one complimentary tour leader. The cost is distributed across paying passengers.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
