'use client'

import { useState, useEffect } from 'react'
import { getCurrencySymbol as canonicalCurrencySymbol } from '@/lib/currency'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Percent,
  ChevronDown,
  ChevronUp,
  PieChart
} from 'lucide-react'

interface Service {
  id: string
  service_type: string
  service_name: string
  quantity: number
  total_cost: number
  client_price?: number
}

interface DayWithServices {
  id: string
  day_number: number
  services: Service[]
}

interface ItineraryPLProps {
  itineraryId: string
  totalCost: number  // This is client price (total_revenue) for backward compat
  currency: string
  marginPercent?: number
  days: DayWithServices[]
}

interface PLBreakdown {
  service_type: string
  supplier_cost: number
  client_price: number
  margin: number
  margin_percent: number
  count: number
}

const SERVICE_ICONS: Record<string, string> = {
  transportation: '🚗',
  guide: '👨‍🏫',
  entrance: '🎫',
  meal: '🍽️',
  accommodation: '🏨',
  tips: '💵',
  supplies: '💧',
  activity: '🎭',
  other: '📦'
}

export default function ItineraryPL({ 
  itineraryId, 
  totalCost, 
  currency, 
  marginPercent = 25,
  days 
}: ItineraryPLProps) {
  const [expanded, setExpanded] = useState(false)
  const [breakdown, setBreakdown] = useState<PLBreakdown[]>([])
  const [totals, setTotals] = useState({
    supplierCost: 0,
    clientPrice: 0,
    margin: 0,
    marginPercent: 0
  })

  useEffect(() => {
    calculatePL()
  }, [days])

  const calculatePL = () => {
    const byType: Record<string, PLBreakdown> = {}
    let totalSupplierCost = 0
    let totalClientPrice = 0

    days.forEach(day => {
      (day.services || []).forEach(service => {
        const supplierCost = Number(service.total_cost) || 0
        // If client_price exists, use it; otherwise calculate from margin
        const clientPrice = service.client_price 
          ? Number(service.client_price) 
          : supplierCost * (1 + marginPercent / 100)

        totalSupplierCost += supplierCost
        totalClientPrice += clientPrice

        if (!byType[service.service_type]) {
          byType[service.service_type] = {
            service_type: service.service_type,
            supplier_cost: 0,
            client_price: 0,
            margin: 0,
            margin_percent: 0,
            count: 0
          }
        }

        byType[service.service_type].supplier_cost += supplierCost
        byType[service.service_type].client_price += clientPrice
        byType[service.service_type].count += 1
      })
    })

    // Calculate margins per type
    Object.values(byType).forEach(item => {
      item.margin = item.client_price - item.supplier_cost
      item.margin_percent = item.supplier_cost > 0 
        ? (item.margin / item.supplier_cost) * 100 
        : 0
    })

    // Sort by margin descending
    const sortedBreakdown = Object.values(byType).sort((a, b) => b.margin - a.margin)

    const totalMargin = totalClientPrice - totalSupplierCost
    const overallMarginPercent = totalSupplierCost > 0 
      ? (totalMargin / totalSupplierCost) * 100 
      : 0

    setBreakdown(sortedBreakdown)
    setTotals({
      supplierCost: totalSupplierCost,
      clientPrice: totalClientPrice,
      margin: totalMargin,
      marginPercent: overallMarginPercent
    })
  }

  const getCurrencySymbol = (curr: string) => {
    return canonicalCurrencySymbol(curr)
  }

  const formatCurrency = (amount: number) => {
    return `${getCurrencySymbol(currency)}${amount.toFixed(2)}`
  }

  const getMarginColor = (percent: number) => {
    if (percent >= 25) return 'text-green-600'
    if (percent >= 15) return 'text-amber-600'
    if (percent >= 0) return 'text-orange-600'
    return 'text-red-600'
  }

  const getMarginBg = (percent: number) => {
    if (percent >= 25) return 'bg-green-50 border-green-200'
    if (percent >= 15) return 'bg-amber-50 border-amber-200'
    if (percent >= 0) return 'bg-orange-50 border-orange-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header - Always Visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">Profit & Loss</h3>
            <p className="text-xs text-gray-500">Cost breakdown and margins</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Quick Stats */}
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-500">Supplier Cost</p>
              <p className="text-sm font-medium text-gray-900">{formatCurrency(totals.supplierCost)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Client Price</p>
              <p className="text-sm font-medium text-blue-600">{formatCurrency(totals.clientPrice)}</p>
            </div>
            <div className={`px-3 py-1.5 rounded-lg border ${getMarginBg(totals.marginPercent)}`}>
              <p className="text-xs text-gray-500">Margin</p>
              <p className={`text-sm font-bold ${getMarginColor(totals.marginPercent)}`}>
                {formatCurrency(totals.margin)} ({totals.marginPercent.toFixed(1)}%)
              </p>
            </div>
          </div>

          {expanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Mobile Quick Stats */}
      <div className="md:hidden px-5 pb-4 grid grid-cols-3 gap-3">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500">Cost</p>
          <p className="text-sm font-medium text-gray-900">{formatCurrency(totals.supplierCost)}</p>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <p className="text-xs text-gray-500">Price</p>
          <p className="text-sm font-medium text-blue-600">{formatCurrency(totals.clientPrice)}</p>
        </div>
        <div className={`text-center p-2 rounded-lg ${getMarginBg(totals.marginPercent)}`}>
          <p className="text-xs text-gray-500">Margin</p>
          <p className={`text-sm font-bold ${getMarginColor(totals.marginPercent)}`}>
            {totals.marginPercent.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-200">
          {/* Summary Cards */}
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <span className="text-xs text-gray-500">Supplier Cost</span>
              </div>
              <p className="text-xl font-semibold text-gray-900">{formatCurrency(totals.supplierCost)}</p>
              <p className="text-xs text-gray-400 mt-1">What you pay</p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-gray-500">Client Price</span>
              </div>
              <p className="text-xl font-semibold text-blue-600">{formatCurrency(totals.clientPrice)}</p>
              <p className="text-xs text-gray-400 mt-1">What client pays</p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-xs text-gray-500">Gross Profit</span>
              </div>
              <p className={`text-xl font-semibold ${getMarginColor(totals.marginPercent)}`}>
                {formatCurrency(totals.margin)}
              </p>
              <p className="text-xs text-gray-400 mt-1">Your earnings</p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-gray-500">Margin %</span>
              </div>
              <p className={`text-xl font-semibold ${getMarginColor(totals.marginPercent)}`}>
                {totals.marginPercent.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-400 mt-1">Markup on cost</p>
            </div>
          </div>

          {/* Breakdown by Service Type */}
          <div className="p-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">Breakdown by Service Type</h4>
            <div className="space-y-3">
              {breakdown.map((item) => {
                const icon = SERVICE_ICONS[item.service_type] || SERVICE_ICONS.other
                const marginWidth = Math.min(Math.max(item.margin_percent, 0), 50) * 2 // Scale to max 100%
                
                return (
                  <div key={item.service_type} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{icon}</span>
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {item.service_type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-400">({item.count} items)</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500">{formatCurrency(item.supplier_cost)}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-blue-600">{formatCurrency(item.client_price)}</span>
                        <span className={`font-semibold ${getMarginColor(item.margin_percent)}`}>
                          +{formatCurrency(item.margin)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Margin Bar */}
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          item.margin_percent >= 25 ? 'bg-green-500' :
                          item.margin_percent >= 15 ? 'bg-amber-500' :
                          item.margin_percent >= 0 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${marginWidth}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1 text-right">
                      {item.margin_percent.toFixed(1)}% margin
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer Note */}
          <div className="px-5 pb-5">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> Tips and water are typically pass-through costs with no margin. 
                Transportation, guides, and entrances carry the standard {marginPercent}% markup.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}