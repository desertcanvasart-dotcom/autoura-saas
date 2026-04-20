'use client'

import type { GridConfig, GridTotals, Tier, Currency, ClientType } from '@/app/pricing-grid/types'
import { TIERS, CURRENCIES, DEFAULT_MARGINS } from '@/app/pricing-grid/types'

interface GridHeaderProps {
  config: GridConfig
  totals: GridTotals
  onConfigChange: (updates: Partial<GridConfig>) => void
}

export default function GridHeader({ config, totals, onConfigChange }: GridHeaderProps) {
  const handleClientTypeToggle = () => {
    const newType: ClientType = config.clientType === 'b2c' ? 'b2b' : 'b2c'
    onConfigChange({
      clientType: newType,
      marginPercent: DEFAULT_MARGINS[newType],
    })
  }

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3">
        {/* Row 1: Trip settings */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Trip</span>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">PAX</span>
            <input
              type="number"
              min="1"
              max="50"
              value={config.pax}
              onChange={e => onConfigChange({ pax: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-14 text-sm font-bold text-center border border-gray-300 rounded-lg px-2 py-1.5 focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">START</span>
            <input
              type="date"
              value={config.startDate}
              onChange={e => onConfigChange({ startDate: e.target.value })}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:border-[#647C47] outline-none"
            />
          </div>

          <button
            onClick={() => onConfigChange({ passport: config.passport === 'eu' ? 'non_eu' : 'eu' })}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              config.passport === 'non_eu'
                ? 'bg-orange-100 text-orange-700 border border-orange-300'
                : 'bg-blue-100 text-blue-700 border border-blue-300'
            }`}
          >
            {config.passport === 'eu' ? 'EU' : 'Non-EU'}
          </button>

          <select
            value={config.tier}
            onChange={e => onConfigChange({ tier: e.target.value as Tier })}
            className="w-auto text-sm font-medium border border-[#647C47] text-[#647C47] rounded-lg px-3 py-1.5 pr-8 bg-white focus:ring-1 focus:ring-[#647C47] outline-none cursor-pointer"
          >
            {TIERS.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Row 2: Pricing settings */}
        <div className="flex items-center gap-3 mt-2.5">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pricing</span>

          <button
            onClick={handleClientTypeToggle}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              config.clientType === 'b2c'
                ? 'bg-blue-500 text-white'
                : 'bg-orange-500 text-white'
            }`}
          >
            {config.clientType.toUpperCase()}
          </button>

          <button
            onClick={() => onConfigChange({ withGuide: !config.withGuide })}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              config.withGuide
                ? 'bg-[#647C47] text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            Guide
          </button>

          <select
            value={config.currency}
            onChange={e => onConfigChange({ currency: e.target.value as Currency })}
            className="w-auto text-sm font-semibold border border-gray-300 rounded-lg px-2 py-1.5 pr-8 bg-white outline-none cursor-pointer"
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium whitespace-nowrap">MARKUP %</span>
            <input
              type="number"
              min="0"
              max="200"
              value={config.marginPercent}
              onChange={e => onConfigChange({ marginPercent: Math.max(0, Math.min(200, parseFloat(e.target.value) || 0)) })}
              className="w-20 text-sm font-bold text-center border border-gray-300 rounded-lg px-3 py-1.5 focus:border-[#647C47] outline-none"
            />
          </div>
        </div>

        {/* Subtitle */}
        <p className="text-center text-xs text-gray-400 mt-2">
          Pricing updates automatically as you add services
        </p>
      </div>
    </div>
  )
}
