'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { SlotDefinition, SlotValue, RateOption, SelectedItem, PassportType } from '../types'

interface SlotRowProps {
  definition: SlotDefinition
  value: SlotValue
  options: RateOption[]
  allOptions?: RateOption[]
  passport: PassportType
  onChange: (value: SlotValue) => void
  hidden?: boolean
}

export default function SlotRow({ definition, value, options, allOptions, passport, onChange, hidden }: SlotRowProps) {
  const [search, setSearch] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  if (hidden) return null

  const rateKey = passport === 'eu' ? 'rateEur' : 'rateNonEur'

  const slotCost = definition.selectionMode === 'custom'
    ? value.customAmount
    : value.selectedItems.reduce((sum, item) => sum + item[rateKey], 0)

  const searchPool = search ? (allOptions || options) : options
  const dropdownOptions = search
    ? searchPool.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    : options

  const toggleItem = (opt: RateOption) => {
    const existing = value.selectedItems.find(i => i.rateId === opt.id)
    if (existing) {
      onChange({ ...value, selectedItems: value.selectedItems.filter(i => i.rateId !== opt.id) })
    } else {
      onChange({
        ...value,
        selectedItems: [...value.selectedItems, {
          rateId: opt.id,
          name: opt.name,
          rateEur: opt.rateEur,
          rateNonEur: opt.rateNonEur,
          // Consolidation Phase B (rich gate): propagate the rate row's
          // service_type / pricing_class so the gate can do type-aware
          // checks (route segments) and class-aware checks (mandatory
          // entrance fees). Optional — older RateOption payloads won't
          // carry these and the gate falls through to its count-based path.
          serviceType: opt.service_type,
          pricingClass: opt.pricing_class,
        }]
      })
    }
  }

  const selectSingle = (opt: RateOption | null) => {
    if (!opt) {
      onChange({ ...value, selectedItems: [] })
      return
    }
    const item: SelectedItem = {
      rateId: opt.id,
      name: opt.name,
      rateEur: opt.rateEur,
      rateNonEur: opt.rateNonEur,
      serviceType: opt.service_type,
      pricingClass: opt.pricing_class,
    }
    const items: SelectedItem[] = [item]
    if (definition.slotId === 'accommodation' && (opt as any).single_supp_eur) {
      items.push({
        rateId: `${opt.id}_supp`,
        name: 'Single Supplement',
        rateEur: (opt as any).single_supp_eur || 0,
        rateNonEur: (opt as any).single_supp_non_eur || 0,
      })
    }
    onChange({ ...value, selectedItems: items })
  }

  const unselectedCount = options.filter(o => !value.selectedItems.some(i => i.rateId === o.id)).length
  const hasValue = slotCost > 0

  return (
    <div className={`flex items-stretch border-b border-gray-50 min-h-[40px] transition-colors ${
      hasValue ? 'hover:bg-blue-50/30' : 'hover:bg-gray-50/50'
    }`}>
      {/* Label */}
      <div className="w-[140px] min-w-[140px] flex items-center gap-1.5 px-3 py-1.5 border-r border-gray-50">
        <span className="text-sm opacity-70">{definition.icon}</span>
        <span className={`text-[11px] font-medium ${hasValue ? 'text-gray-700' : 'text-gray-400'}`}>
          {definition.label}
        </span>
      </div>

      {/* Selection Area */}
      <div className="flex-1 px-3 py-1 border-r border-gray-50">
        {definition.selectionMode === 'custom' ? (
          <input
            type="number"
            min={0}
            step={0.01}
            value={value.customAmount || ''}
            onChange={(e) => onChange({ ...value, customAmount: parseFloat(e.target.value) || 0 })}
            placeholder="Enter amount..."
            className="w-full px-2 py-0.5 text-xs border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-200 transition-all"
          />
        ) : definition.selectionMode === 'single' || definition.selectionMode === 'auto' ? (
          (() => {
            const selected = value.selectedItems[0]
            const selectedInOptions = selected && options.some(o => o.id === selected.rateId)
            const displayOpts = selected && !selectedInOptions
              ? [{ id: selected.rateId, name: selected.name, rateEur: selected.rateEur, rateNonEur: selected.rateNonEur } as RateOption, ...options]
              : options
            return (
              <select
                value={selected?.rateId || ''}
                onChange={(e) => {
                  const opt = displayOpts.find(o => o.id === e.target.value)
                    || (allOptions || []).find(o => o.id === e.target.value)
                    || null
                  selectSingle(opt)
                }}
                className={`w-full px-2 py-0.5 text-xs border rounded-md transition-all ${
                  selected ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400'
                } focus:bg-white focus:ring-1 focus:ring-blue-200`}
              >
                <option value="">— Select —</option>
                {displayOpts.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} — €{opt[rateKey].toFixed(2)}
                    {opt.details ? ` (${opt.details})` : ''}
                  </option>
                ))}
              </select>
            )
          })()
        ) : (
          /* Multi-select */
          <div className="space-y-0.5">
            {value.selectedItems.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {value.selectedItems.map(item => (
                  <span
                    key={item.rateId}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-blue-50 text-blue-700 rounded cursor-pointer hover:bg-red-50 hover:text-red-600 transition-colors"
                    onClick={() => onChange({ ...value, selectedItems: value.selectedItems.filter(i => i.rateId !== item.rateId) })}
                    title="Click to remove"
                  >
                    {item.name.length > 30 ? item.name.substring(0, 30) + '...' : item.name}
                    {' '}€{item[rateKey].toFixed(2)}
                    <span className="font-bold ml-0.5 text-[10px]">×</span>
                  </span>
                ))}
              </div>
            )}

            {options.length > 0 && (
              <button
                type="button"
                onClick={() => { setIsDropdownOpen(!isDropdownOpen); setSearch('') }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                {isDropdownOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {value.selectedItems.length === 0 ? 'Select...' : `Change (${unselectedCount} more)`}
              </button>
            )}
            {options.length === 0 && value.selectedItems.length === 0 && (
              <span className="text-[11px] text-gray-300 px-1 italic">No options for this city</span>
            )}

            {isDropdownOpen && (
              <div className="border border-gray-200 rounded-md bg-white shadow-lg mt-1">
                <div className="px-2 py-1 border-b border-gray-100">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={search ? 'Searching all options...' : 'Search...'}
                    className="w-full px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
                <div className="max-h-[150px] overflow-y-auto">
                  {dropdownOptions.length === 0 && (
                    <div className="text-[11px] text-gray-400 px-2 py-2">No matching options</div>
                  )}
                  {dropdownOptions.slice(0, 25).map(opt => {
                    const isSelected = value.selectedItems.some(i => i.rateId === opt.id)
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-2 px-2 py-1 text-[11px] cursor-pointer hover:bg-blue-50 ${
                          isSelected ? 'bg-blue-50/70 font-medium' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(opt)}
                          className="w-3 h-3 text-blue-600 rounded"
                        />
                        <span className="flex-1 truncate">
                          {opt.name}
                          {opt.city && search ? ` (${opt.city})` : ''}
                        </span>
                        <span className="text-gray-500 whitespace-nowrap">€{opt[rateKey].toFixed(2)}</span>
                      </label>
                    )
                  })}
                  {dropdownOptions.length > 25 && (
                    <div className="text-[11px] text-gray-400 px-2 py-1 border-t border-gray-100">
                      +{dropdownOptions.length - 25} more — refine search
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cost */}
      <div className="w-[90px] min-w-[90px] flex items-center justify-end px-3 py-1.5">
        <span className={`text-xs font-bold tabular-nums ${
          slotCost > 0 ? 'text-green-600' : 'text-gray-200'
        }`}>
          €{slotCost.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
