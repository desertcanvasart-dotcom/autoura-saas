'use client'

import { useState, useEffect } from 'react'
import type { GridConfig, GridTotals, Tier, ClientType, PassportType } from '../types'
import { convertAmount } from '../lib/calculator'

interface GridHeaderProps {
  config: GridConfig
  onChange: (config: GridConfig) => void
  totals?: GridTotals
}

interface B2BPartner {
  id: string
  company_name: string
  partner_code: string
  default_margin_percent: number
}

const TIERS: { value: Tier; label: string }[] = [
  { value: 'budget', label: 'Budget' },
  { value: 'standard', label: 'Standard' },
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'luxury', label: 'Luxury' },
]

import { SUPPORTED_CURRENCIES, getCurrencySymbol } from '@/lib/currency'

const CURRENCIES = SUPPORTED_CURRENCIES

const DEFAULT_MARGINS: Record<ClientType, number> = {
  b2b: 10,
  b2c: 25,
}

export default function GridHeader({ config, onChange, totals }: GridHeaderProps) {
  const [partners, setPartners] = useState<B2BPartner[]>([])
  const update = (partial: Partial<GridConfig>) => onChange({ ...config, ...partial })
  const sym = getCurrencySymbol(config.currency)
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const cv = (n: number) => convertAmount(n, config.exchangeRate)

  // Fetch B2B partners when switching to B2B
  useEffect(() => {
    if (config.clientType === 'b2b' && partners.length === 0) {
      fetch('/api/b2b/partners')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) setPartners(data.data)
          else if (Array.isArray(data)) setPartners(data)
        })
        .catch(err => console.error('Failed to fetch partners:', err))
    }
  }, [config.clientType, partners.length])

  const toggleClientType = () => {
    const newType: ClientType = config.clientType === 'b2b' ? 'b2c' : 'b2b'
    update({
      clientType: newType,
      marginPercent: DEFAULT_MARGINS[newType],
      partnerId: null,
      partnerName: '',
    })
  }

  const togglePassport = () => {
    update({ passport: config.passport === 'eu' ? 'non_eu' : 'eu' })
  }

  const toggleGuide = () => {
    update({ withGuide: !config.withGuide })
  }

  const selectPartner = (partnerId: string) => {
    const partner = partners.find(p => p.id === partnerId)
    if (partner) {
      update({
        partnerId: partner.id,
        partnerName: partner.company_name,
        marginPercent: Math.min(partner.default_margin_percent || DEFAULT_MARGINS.b2b, 100),
      })
    } else {
      update({ partnerId: null, partnerName: '' })
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4">
      {/* Row 1: Trip Parameters + Pricing Mode */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-3">

        {/* ===== TRIP PARAMETERS GROUP ===== */}
        <div className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-1.5 bg-gray-50/50">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Trip</span>

          <div className="w-px h-5 bg-gray-200" />

          {/* Pax */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pax</label>
            <input
              type="number"
              min={1}
              max={50}
              value={config.pax}
              onChange={(e) => update({ pax: Math.max(1, parseInt(e.target.value) || 1) })}
              style={{ width: '4rem', padding: '0.25rem 0.5rem' }}
              className="!w-16 h-8 !p-1 text-sm border !border-gray-300 rounded-lg text-center font-bold !text-gray-900 bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
            />
          </div>

          {/* Start Date */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Start</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
              className="px-2 h-8 text-sm border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>

          <div className="w-px h-5 bg-gray-200" />

          {/* Passport Toggle */}
          <button
            type="button"
            onClick={togglePassport}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap ${
              config.passport === 'eu'
                ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
            }`}
          >
            {config.passport === 'eu' ? 'EU' : 'Non-EU'}
          </button>

          {/* Tier */}
          <select
            value={config.tier}
            onChange={(e) => update({ tier: e.target.value as Tier })}
            className="px-2 py-1 text-sm border border-gray-200 rounded-lg font-medium bg-white focus:ring-2 focus:ring-blue-200 transition-all"
          >
            {TIERS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* ===== PRICING MODE GROUP ===== */}
        <div className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-1.5 bg-gray-50/50">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pricing</span>

          <div className="w-px h-5 bg-gray-200" />

          {/* B2B / B2C Toggle */}
          <button
            type="button"
            onClick={toggleClientType}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap ${
              config.clientType === 'b2b'
                ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
            }`}
          >
            {config.clientType.toUpperCase()}
          </button>

          {/* B2B Partner Selector */}
          {config.clientType === 'b2b' && (
            <select
              value={config.partnerId || ''}
              onChange={(e) => selectPartner(e.target.value)}
              className="px-2 py-1 text-sm border border-purple-200 rounded-lg font-medium bg-purple-50 text-purple-700 focus:bg-white focus:ring-2 focus:ring-purple-200 transition-all max-w-[180px]"
            >
              <option value="">Select Partner...</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.company_name}</option>
              ))}
            </select>
          )}

          {/* Guide Toggle */}
          <button
            type="button"
            onClick={toggleGuide}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap ${
              config.withGuide
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-150'
            }`}
          >
            {config.withGuide ? 'Guide' : 'No Guide'}
          </button>

          <div className="w-px h-5 bg-gray-200" />

          {/* Currency */}
          <select
            value={config.currency}
            onChange={(e) => update({ currency: e.target.value })}
            className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white transition-all"
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Markup % — separate visible input with label */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Markup %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={config.marginPercent}
              onChange={(e) => update({ marginPercent: Math.min(parseFloat(e.target.value) || 0, 100) })}
              style={{ width: '4rem', padding: '0.25rem 0.5rem' }}
              className="!w-16 h-8 !p-1 text-sm border !border-gray-300 rounded-lg text-center font-bold !text-gray-900 bg-white focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
      </div>

      {/* Row 2: Live Pricing Summary (always visible when data exists) */}
      {totals && totals.totalCost > 0 ? (
        <div className="border-t border-green-200 bg-gradient-to-r from-green-50/60 to-white">
          <div className="flex items-center">
            {/* Live indicator */}
            <div className="px-3 py-2 flex items-center gap-1.5 border-r border-green-100">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider whitespace-nowrap">Live Quote</span>
            </div>
            <div className="flex-1 grid grid-cols-5 divide-x divide-green-100">
              <div className="px-3 py-2">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Cost/PP</div>
                <div className="text-sm font-bold text-gray-700">{sym}{fmt(cv(totals.costPerPerson))}</div>
              </div>
              <div className="px-3 py-2">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Total Cost</div>
                <div className="text-sm font-bold text-gray-700">{sym}{fmt(cv(totals.totalCost))}</div>
              </div>
              <div className="px-3 py-2">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Margin ({config.marginPercent}%)</div>
                <div className={`text-sm font-bold ${totals.marginAmount > 0 ? 'text-amber-600' : 'text-red-500'}`}>{sym}{fmt(cv(totals.marginAmount))}</div>
              </div>
              <div className="px-3 py-2 bg-green-50/50">
                <div className="text-[10px] text-green-600 uppercase tracking-wider font-medium">Sell/PP</div>
                <div className="text-sm font-extrabold text-green-700">{sym}{fmt(cv(totals.sellingPricePerPerson))}</div>
              </div>
              <div className="px-3 py-2 bg-green-50/50">
                <div className="text-[10px] text-green-600 uppercase tracking-wider font-medium">Sell Total</div>
                <div className="text-sm font-extrabold text-green-700">{sym}{fmt(cv(totals.sellingPriceTotal))}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-gray-100 px-4 py-2 bg-gray-50/50">
          <p className="text-[11px] text-gray-400 text-center">Pricing updates automatically as you add services</p>
        </div>
      )}
    </div>
  )
}
