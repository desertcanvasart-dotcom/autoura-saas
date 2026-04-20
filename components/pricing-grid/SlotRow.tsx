'use client'

import { useState, useRef, useEffect } from 'react'
import type { SlotValue, RateOption, SlotDefinition } from '@/app/pricing-grid/types'

interface SlotRowProps {
  slotDef: SlotDefinition
  value: SlotValue
  options: RateOption[]
  passport: 'eu' | 'non_eu'
  currency: string
  exchangeRate: number | null
  onChange: (value: SlotValue) => void
  disabled?: boolean
}

function convert(eur: number, rate: number | null): number {
  return rate && rate > 0 ? eur * rate : eur
}

function fmt(amount: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: '\u20AC', USD: '$', GBP: '\u00A3', EGP: 'EGP ' }
  return `${symbols[currency] || currency + ' '}${amount.toFixed(2)}`
}

export default function SlotRow({ slotDef, value, options, passport, currency, exchangeRate, onChange, disabled }: SlotRowProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const getRateForOption = (opt: RateOption) => {
    return passport === 'eu' ? opt.rateEur : (opt.rateNonEur || opt.rateEur)
  }

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const displayRate = convert(value.resolvedRate, exchangeRate)

  // --- Custom amount input ---
  if (slotDef.mode === 'custom') {
    return (
      <div className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 rounded-lg">
        <span className="text-lg w-6 text-center">{slotDef.icon}</span>
        <span className="text-sm font-medium text-gray-700 w-36 truncate">{slotDef.label}</span>
        <div className="flex-1">
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="0.00"
            value={value.customAmount ?? ''}
            onChange={(e) => {
              const amount = e.target.value ? parseFloat(e.target.value) : null
              onChange({
                ...value,
                customAmount: amount,
                resolvedRate: amount || 0,
                label: amount ? `Custom \u20AC${amount}` : '',
              })
            }}
            disabled={disabled}
            className="w-24 px-2 py-1 text-sm border border-gray-200 rounded-md focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none"
          />
          <span className="text-xs text-gray-400 ml-2">EUR pp</span>
        </div>
        <span className="text-sm font-semibold text-gray-800 w-24 text-right">
          {displayRate > 0 ? fmt(displayRate, currency) : '-'}
        </span>
      </div>
    )
  }

  // --- Single select dropdown ---
  if (slotDef.mode === 'single') {
    const selectedOption = options.find(o => o.id === value.selectedId)
    return (
      <div className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 rounded-lg" ref={dropdownRef}>
        <span className="text-lg w-6 text-center">{slotDef.icon}</span>
        <span className="text-sm font-medium text-gray-700 w-36 truncate">{slotDef.label}</span>
        <div className="flex-1 relative">
          <button
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className="w-full text-left px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:border-gray-300 focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none truncate"
          >
            {selectedOption ? selectedOption.label : <span className="text-gray-400">Select...</span>}
          </button>
          {isOpen && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded outline-none focus:border-[#647C47]"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                <button
                  onClick={() => {
                    onChange({ ...value, selectedId: null, resolvedRate: 0, label: '' })
                    setIsOpen(false)
                    setSearchTerm('')
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                >
                  Clear selection
                </button>
                {filteredOptions.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      const rate = getRateForOption(opt)
                      onChange({
                        ...value,
                        selectedId: opt.id,
                        resolvedRate: rate,
                        label: opt.label,
                      })
                      setIsOpen(false)
                      setSearchTerm('')
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[#647C47]/10 flex justify-between items-center ${opt.id === value.selectedId ? 'bg-[#647C47]/5 font-medium' : ''}`}
                  >
                    <span className="truncate mr-2">{opt.label}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">\u20AC{getRateForOption(opt).toFixed(2)}</span>
                  </button>
                ))}
                {filteredOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">No options found</div>
                )}
              </div>
            </div>
          )}
        </div>
        <span className="text-sm font-semibold text-gray-800 w-24 text-right">
          {displayRate > 0 ? fmt(displayRate, currency) : '-'}
        </span>
      </div>
    )
  }

  // --- Multi select (checkboxes) ---
  const selectedSet = new Set(value.selectedIds)
  // Build display: show labels for matched IDs, flag unmatched ones
  const matchedLabels = value.selectedIds
    .map(id => options.find(o => o.id === id)?.label)
    .filter(Boolean) as string[]
  const unmatchedCount = value.selectedIds.length - matchedLabels.length
  const displayLabel = value.selectedIds.length > 0
    ? (matchedLabels.length > 0
        ? matchedLabels.join(', ') + (unmatchedCount > 0 ? ` (+${unmatchedCount} unmatched)` : '')
        : value.label || `${value.selectedIds.length} selected`)
    : ''

  return (
    <div className="flex items-start gap-3 py-2 px-3 hover:bg-gray-50 rounded-lg" ref={dropdownRef}>
      <span className="text-lg w-6 text-center mt-0.5">{slotDef.icon}</span>
      <span className="text-sm font-medium text-gray-700 w-36 truncate mt-0.5">{slotDef.label}</span>
      <div className="flex-1 relative">
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full text-left px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:border-gray-300 focus:border-[#647C47] outline-none truncate"
          title={displayLabel}
        >
          {value.selectedIds.length > 0
            ? displayLabel
            : <span className="text-gray-400">Select items...</span>}
        </button>
        {isOpen && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-200 rounded outline-none focus:border-[#647C47]"
                autoFocus
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredOptions.map(opt => {
                const isSelected = selectedSet.has(opt.id)
                return (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#647C47]/10 cursor-pointer ${isSelected ? 'bg-[#647C47]/5' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const newIds = isSelected
                          ? value.selectedIds.filter(id => id !== opt.id)
                          : [...value.selectedIds, opt.id]
                        const newTotal = newIds.reduce((sum, id) => {
                          const o = options.find(x => x.id === id)
                          return sum + (o ? getRateForOption(o) : 0)
                        }, 0)
                        const labels = newIds.map(id => options.find(x => x.id === id)?.label || '').filter(Boolean)
                        onChange({
                          ...value,
                          selectedIds: newIds,
                          resolvedRate: newTotal,
                          label: labels.join(', '),
                        })
                      }}
                      className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
                    />
                    <span className="truncate flex-1">{opt.label}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">\u20AC{getRateForOption(opt).toFixed(2)}</span>
                  </label>
                )
              })}
              {filteredOptions.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-400">No options found</div>
              )}
            </div>
          </div>
        )}
      </div>
      <span className="text-sm font-semibold text-gray-800 w-24 text-right mt-0.5">
        {displayRate > 0 ? fmt(displayRate, currency) : '-'}
      </span>
    </div>
  )
}
