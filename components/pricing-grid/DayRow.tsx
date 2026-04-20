'use client'

import { ChevronDown, ChevronRight, Trash2, Copy, MapPin } from 'lucide-react'
import type { GridDay, GridConfig, AllRates, DayCalc } from '@/app/pricing-grid/types'
import type { SlotValue, SlotDefinition } from '@/app/pricing-grid/types'
import { GROUP_SLOTS, PER_PERSON_SLOTS } from '@/app/pricing-grid/lib/slot-mapping'
import { calculateDay, convertAmount, formatCurrency } from '@/app/pricing-grid/lib/calculator'
import SlotRow from './SlotRow'

interface DayRowProps {
  day: GridDay
  config: GridConfig
  rates: AllRates
  onToggleExpand: () => void
  onUpdateSlot: (slotId: string, value: SlotValue) => void
  onUpdateDay: (updates: Partial<GridDay>) => void
  onRemove: () => void
  onDuplicate: () => void
}

export default function DayRow({
  day, config, rates, onToggleExpand, onUpdateSlot, onUpdateDay, onRemove, onDuplicate,
}: DayRowProps) {
  const dayCalc = calculateDay(day, config)
  const displayRate = config.exchangeRate

  const getOptionsForSlot = (slotDef: SlotDefinition): any[] => {
    if (!slotDef.rateTable) return []
    const key = slotDef.id
    return rates[key] || []
  }

  const isSlotVisible = (slotDef: SlotDefinition): boolean => {
    if (slotDef.conditionalOn === 'withGuide' && !config.withGuide) return false
    return true
  }

  // Collapsed view
  if (!day.isExpanded) {
    return (
      <div
        className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-[#647C47]/40 hover:shadow-sm transition-all"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2">
              <span className="bg-[#647C47] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                D{day.dayNumber}
              </span>
              <span className="font-medium text-gray-800">{day.title || `Day ${day.dayNumber}`}</span>
            </div>
            {day.city && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="w-3 h-3" /> {day.city}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">
              PP: <span className="font-semibold text-gray-800">
                {formatCurrency(convertAmount(dayCalc.dailyPerPerson, displayRate), config.currency)}
              </span>
            </span>
            <span className="text-gray-500">
              Total: <span className="font-semibold text-[#647C47]">
                {formatCurrency(convertAmount(dayCalc.dailyTotal, displayRate), config.currency)}
              </span>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Expanded view
  return (
    <div className="bg-white border border-[#647C47]/30 rounded-xl shadow-sm overflow-hidden">
      {/* Day Header */}
      <div className="bg-gradient-to-r from-[#647C47]/5 to-transparent px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
            <ChevronDown className="w-4 h-4 text-[#647C47]" />
            <span className="bg-[#647C47] text-white text-xs font-bold px-2 py-0.5 rounded-full">
              D{day.dayNumber}
            </span>
            <input
              type="text"
              value={day.title}
              onChange={(e) => onUpdateDay({ title: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="Day title..."
              className="font-medium text-gray-800 bg-transparent border-none outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-2 py-0.5 flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={day.city}
                onChange={(e) => onUpdateDay({ city: e.target.value })}
                placeholder="City"
                className="w-28 text-sm px-2 py-1 border border-gray-200 rounded-md focus:border-[#647C47] outline-none"
              />
            </div>
            <button onClick={onDuplicate} title="Duplicate day" className="p-1.5 text-gray-400 hover:text-[#647C47] rounded">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={onRemove} title="Remove day" className="p-1.5 text-gray-400 hover:text-red-500 rounded">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-2 border-b border-gray-50">
        <input
          type="text"
          value={day.description}
          onChange={(e) => onUpdateDay({ description: e.target.value })}
          placeholder="Day description (optional)..."
          className="w-full text-sm text-gray-500 bg-transparent border-none outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1"
        />
      </div>

      {/* Group Services */}
      <div className="px-4 py-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
          <span className="w-1 h-3 bg-blue-400 rounded-full"></span>
          Group Services
          <span className="text-[10px] font-normal normal-case">(cost shared across {config.pax} pax)</span>
        </div>
        {GROUP_SLOTS.filter(isSlotVisible).map(slotDef => {
          const slotValue = day.slots.find(s => s.slotId === slotDef.id)
          if (!slotValue) return null
          return (
            <SlotRow
              key={slotDef.id}
              slotDef={slotDef}
              value={slotValue}
              options={getOptionsForSlot(slotDef)}
              passport={config.passport}
              currency={config.currency}
              exchangeRate={config.exchangeRate}
              onChange={(newVal) => onUpdateSlot(slotDef.id, newVal)}
            />
          )
        })}
        <div className="flex justify-end px-3 py-1 text-sm text-gray-500 border-t border-gray-100 mt-1">
          Group subtotal: <span className="font-semibold text-gray-700 ml-1">
            {formatCurrency(convertAmount(dayCalc.groupTotal, displayRate), config.currency)}
          </span>
          <span className="text-xs text-gray-400 ml-2">
            ({formatCurrency(convertAmount(dayCalc.groupPerPerson, displayRate), config.currency)} pp)
          </span>
        </div>
      </div>

      {/* Per-Person Services */}
      <div className="px-4 py-2 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
          <span className="w-1 h-3 bg-green-400 rounded-full"></span>
          Per-Person Services
          <span className="text-[10px] font-normal normal-case">(cost x {config.pax} pax)</span>
        </div>
        {PER_PERSON_SLOTS.map(slotDef => {
          const slotValue = day.slots.find(s => s.slotId === slotDef.id)
          if (!slotValue) return null
          return (
            <SlotRow
              key={slotDef.id}
              slotDef={slotDef}
              value={slotValue}
              options={getOptionsForSlot(slotDef)}
              passport={config.passport}
              currency={config.currency}
              exchangeRate={config.exchangeRate}
              onChange={(newVal) => onUpdateSlot(slotDef.id, newVal)}
            />
          )
        })}
        <div className="flex justify-end px-3 py-1 text-sm text-gray-500 border-t border-gray-100 mt-1">
          Per-person subtotal: <span className="font-semibold text-gray-700 ml-1">
            {formatCurrency(convertAmount(dayCalc.perPersonTotal, displayRate), config.currency)}
          </span>
        </div>
      </div>

      {/* Day Total */}
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
        <span className="text-sm font-medium text-gray-600">Day {day.dayNumber} Total</span>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-500">
            Per Person: <span className="font-bold text-gray-800">
              {formatCurrency(convertAmount(dayCalc.dailyPerPerson, displayRate), config.currency)}
            </span>
          </span>
          <span className="text-gray-500">
            Group Total: <span className="font-bold text-[#647C47] text-base">
              {formatCurrency(convertAmount(dayCalc.dailyTotal, displayRate), config.currency)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
