'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { GridDay, GridConfig, AllRates, SlotValue, DayCalc, SelectedItem, DayType, Intercity, SlotDefinition } from '../types'
import { GROUP_SLOTS, PP_SLOTS, DAY_TYPES, DAY_TYPE_LABELS, DEFAULT_DAY_TYPE, DAY_TYPE_DEFAULTS } from '../types'
import { calculateDay, convertAmount } from '../lib/calculator'
import SlotRow from './SlotRow'
import CitySelect from '@/components/CitySelect'
import BlockPicker from './BlockPicker'
import type { GridBlock } from '@/lib/day-blocks/grid-apply'

interface DayRowProps {
  day: GridDay
  allDays: GridDay[]
  config: GridConfig
  rates: AllRates
  onToggleExpand: () => void
  onUpdateSlot: (slotId: string, value: SlotValue) => void
  onUpdateDay: (partial: Partial<GridDay>) => void
  onRemoveDay: () => void
  /** Copy one service to every day of the trip (offered on Water). */
  onApplyToAllDays?: (slotId: string, value: SlotValue) => void
  /** The agency's day blocks, to lay one onto this day. */
  blocks?: GridBlock[]
  onApplyBlock?: (block: GridBlock) => void
  /** What the last block laid here left for the operator to pick. */
  blockNote?: { code: string; toPick: string[] }
  onDismissBlockNote?: () => void
}

/** Services offered "Apply to all days" — a daily item, not a one-off. */
const APPLY_TO_ALL_SLOTS = new Set(['water'])

export default function DayRow({ day, allDays, config, rates, onToggleExpand, onUpdateSlot, onUpdateDay, onRemoveDay, onApplyToAllDays, blocks, onApplyBlock, blockNote, onDismissBlockNote }: DayRowProps) {
  const calc: DayCalc = calculateDay(day, config)
  const cv = (n: number) => convertAmount(n, config.exchangeRate)
  const sym = config.currency === 'EUR' ? '€' : config.currency === 'USD' ? '$' : config.currency === 'GBP' ? '£' : config.currency

  // Day-type + component override panel — collapsed by default to keep the
  // day editor tight; operators who care about the rich completeness gate
  // expand it on the days that need overrides.
  const [showDayTypeOverrides, setShowDayTypeOverrides] = useState(false)
  const activeDayType: DayType = day.dayType ?? DEFAULT_DAY_TYPE
  const preset = DAY_TYPE_DEFAULTS[activeDayType]
  // Helper: each component flag uses the preset's default unless explicitly
  // overridden. Toggling sets the override; clicking "Reset" wipes it back
  // to the preset.
  const effective = (key: 'overnight' | 'hasSightseeing' | 'airportArrival' | 'airportDeparture' | 'hotelCheckIn' | 'hotelCheckOut'): boolean =>
    (day[key] ?? preset[key]) as boolean
  const effectiveIntercity: Intercity = day.intercity ?? preset.intercity

  const getSlotValue = (slotId: string): SlotValue => {
    return day.slots.find(s => s.slotId === slotId) || { slotId, selectedItems: [], customAmount: 0 }
  }

  const getSlotOptions = (slotId: string) => {
    const key = slotId as keyof AllRates
    return rates[key] || []
  }

  // Helper: read current slot state from the slots array
  const getSlotItems = (slotId: string): SelectedItem[] => {
    const slot = day.slots.find(s => s.slotId === slotId)
    return slot?.selectedItems || []
  }

  // An open day lists the services it HAS; the empty ones wait behind
  // "Add service" (or "Show all") instead of filling the page with
  // "— Select —" rows.
  const [showEmpty, setShowEmpty] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const isFilled = (slotId: string) => {
    const slot = day.slots.find(s => s.slotId === slotId)
    return !!slot && (slot.selectedItems.length > 0 || slot.customAmount > 0)
  }
  const offered = (def: SlotDefinition) => def.slotId !== 'guide' || config.withGuide
  const shown = (def: SlotDefinition) =>
    offered(def) && (isFilled(def.slotId) || showEmpty || revealed.has(def.slotId))
  const addable = [...GROUP_SLOTS, ...PP_SLOTS].filter(def => offered(def) && !shown(def))

  // The collapsed day's services, as names.
  const chosen = [...GROUP_SLOTS, ...PP_SLOTS]
    .filter(offered)
    .flatMap(def => {
      const slot = day.slots.find(s => s.slotId === def.slotId)
      if (!slot) return []
      if (slot.customAmount > 0) return [`${def.label} ${sym}${cv(slot.customAmount).toFixed(0)}`]
      return slot.selectedItems.map(i => i.name)
    })

  // Filter options by day city/context — show only relevant items
  const getFilteredOptions = (slotId: string) => {
    const allOptions = getSlotOptions(slotId)
    const city = day.city?.toLowerCase().trim()
    const isCruiseDay = /cruise|sailing|on board/i.test(day.title || day.city || '')
    const isArrival = day.dayNumber === 1
    const overnightCity = ((day as any).overnight_city || day.city || '').toLowerCase().trim()

    const cityToAirport: Record<string, string> = {
      cairo: 'CAI', luxor: 'LXR', aswan: 'ASW', hurghada: 'HRG',
      'sharm el sheikh': 'SSH', sharm: 'SSH', giza: 'CAI',
    }

    if (slotId === 'airport_services') {
      // On flight/transfer days, show airport services for ALL relevant cities
      const isFlightDay = /flight|fly/i.test(day.title || day.description || '')
      const isTransferDay = /transfer/i.test(day.title || day.description || '')
      const codes = new Set<string>()
      if (city && cityToAirport[city]) codes.add(cityToAirport[city])
      if (overnightCity && cityToAirport[overnightCity]) codes.add(cityToAirport[overnightCity])
      // On flight days, include departure city airport (previous overnight city)
      if (isFlightDay || isTransferDay) {
        const dayIdx = allDays.findIndex(d => d.id === day.id)
        const prevDay = dayIdx > 0 ? allDays[dayIdx - 1] : null
        const prevCity = (prevDay?.city || '').toLowerCase().trim()
        if (prevCity && cityToAirport[prevCity]) codes.add(cityToAirport[prevCity])
      }
      if (codes.size > 0) return allOptions.filter(o => codes.has(o.city || ''))
      return []
    }

    if (slotId === 'entrance_fees') {
      if (isCruiseDay || !city) return []
      return allOptions.filter(o => o.city?.toLowerCase().trim() === city)
    }

    // Meals: filter by city, hide on cruise days (meals included on board)
    // On hotel days, the auto-fill already respects board_basis — the dropdown
    // shows all city meals so user can manually add/remove if needed
    if (slotId === 'meals') {
      // Hide meals on cruise sailing days (all meals on board)
      // But show on embarkation (user might want to adjust) and disembarkation (need outside meals)
      if (isCruiseDay && !/embark|disembark|east bank|west bank/i.test(day.title || '')) return []
      const mealCity = overnightCity || city
      if (!mealCity) return []
      return allOptions.filter(o => o.city?.toLowerCase().trim() === mealCity)
    }

    if (['experiences', 'boat_rides'].includes(slotId)) {
      if (!city || isCruiseDay) return []
      return allOptions.filter(o => o.city?.toLowerCase().trim() === city)
    }

    if (slotId === 'accommodation') {
      if (isCruiseDay) return []
      const accCity = overnightCity || city
      if (!accCity) return []
      return allOptions.filter(o => o.city?.toLowerCase().trim() === accCity)
    }

    // Transport (route): all transport types — day tours, airport, intercity, cruise packages
    // SYSTEMATIC RULE: Show routes relevant to ALL cities involved in this day
    // A day may involve multiple cities: departure city (previous overnight), current city, overnight city, next city
    if (slotId === 'route') {
      const selectedIds = new Set(getSlotItems('route').map(i => i.rateId))
      const isFlightDay = /flight|fly/i.test(day.title || day.description || '')
      const isTransferDay = /transfer/i.test(day.title || day.description || '')
      const isMultiCityDay = isFlightDay || isTransferDay || (overnightCity && overnightCity !== city)

      // Derive previous and next day cities from allDays
      const dayIdx = allDays.findIndex(d => d.id === day.id)
      const prevDay = dayIdx > 0 ? allDays[dayIdx - 1] : null
      const nextDay = dayIdx < allDays.length - 1 ? allDays[dayIdx + 1] : null
      const prevOvernightCity = (prevDay?.city || '').toLowerCase().trim()
      const nextCity = (nextDay?.city || '').toLowerCase().trim()

      // Build the set of ALL relevant cities for this day
      const relevantCities = new Set<string>()
      if (city && city !== 'cruise') relevantCities.add(city)
      if (overnightCity && overnightCity !== 'cruise') relevantCities.add(overnightCity)
      // On flight/transfer days, include the departure city (where we slept last night)
      if (isMultiCityDay && prevOvernightCity && prevOvernightCity !== 'cruise') {
        relevantCities.add(prevOvernightCity)
      }
      // If next day is in a different city (we might need onward transfer)
      if (nextCity && nextCity !== 'cruise' && nextCity !== city && nextCity !== overnightCity) {
        relevantCities.add(nextCity)
      }

      const cityMatches = (testCity: string) => {
        if (!testCity) return false
        const tc = testCity.toLowerCase().trim()
        for (const rc of relevantCities) {
          if (tc === rc || tc.includes(rc) || rc.includes(tc)) return true
        }
        return false
      }

      return allOptions.filter(o => {
        // Always show currently selected items
        if (selectedIds.has(o.id)) return true
        // Always show cruise transport packages on cruise-related days
        if ((o as any).service_type === 'cruise_transport_package') return isCruiseDay
        // On pure cruise sailing days (not flight/transfer), hide individual transport
        if (isCruiseDay && !isFlightDay && !isTransferDay) return false
        if (relevantCities.size === 0) return false
        const originCity = (o as any).origin_city?.toLowerCase().trim() || ''
        const destCity = (o as any).destination_city?.toLowerCase().trim() || ''
        // Day tours: match by origin_city (the city where the tour happens)
        if ((o as any).service_type === 'day_tour') {
          if (isCruiseDay) return false
          return !originCity || cityMatches(originCity)
        }
        // Airport/intercity transfers: match if EITHER origin OR destination is a relevant city
        return cityMatches(originCity) || cityMatches(destCity)
      })
    }

    if (slotId === 'hotel_services') {
      if (isCruiseDay) return []
      return allOptions.filter(o => {
        const tierOk = (o as any).category === config.tier || (o as any).category === 'all'
        if (!tierOk) return false
        const dest = o.city?.toLowerCase().trim()
        if (!dest || !city) return tierOk
        return dest === city || dest === overnightCity
      })
    }

    if (slotId === 'tipping') {
      if (isCruiseDay) {
        return allOptions.filter(o => /cruise/i.test(o.name || ''))
      }
      const hasGuide = getSlotItems('guide').length > 0 || config.withGuide
      const hasAirport = getSlotItems('airport_services').length > 0 || isArrival
      const hasRoute = getSlotItems('route').length > 0
      const hasMeals = getSlotItems('meals').length > 0
      return allOptions.filter(o => {
        const name = o.name?.toLowerCase() || ''
        if (/driver.*day|TIP-DRIVER-DAY/i.test(name)) return true
        if (/driver.*half|TIP-DRIVER-HALF/i.test(name)) return hasRoute
        if (/driver.*transfer|TIP-DRIVER-TRANSFER/i.test(name)) return hasRoute
        if (/guide/i.test(name)) return hasGuide
        if (/porter.*hotel|TIP-PORTER-HOTEL/i.test(name)) return true
        if (/porter.*airport|TIP-PORTER-AIRPORT/i.test(name)) return hasAirport
        if (/restaurant/i.test(name)) return hasMeals
        if (/cruise|felucca|motor/i.test(name)) return false
        return false
      })
    }

    if (slotId === 'flights') {
      if (!/flight|fly|domestic/i.test(day.title || day.description || '')) return []
      if (!city) return allOptions
      const matched = allOptions.filter(o => {
        const from = ((o as any).route_from || '').toLowerCase().trim()
        const to = ((o as any).route_to || '').toLowerCase().trim()
        return from === city || to === city
      })
      return matched.length > 0 ? matched : allOptions
    }

    if (slotId === 'cruise') return allOptions

    return allOptions
  }

  const getAllOptions = (slotId: string) => getSlotOptions(slotId)

  const renderSlot = (def: SlotDefinition) => (
    <SlotRow
      key={def.slotId}
      definition={def}
      value={getSlotValue(def.slotId)}
      options={getFilteredOptions(def.slotId)}
      allOptions={getAllOptions(def.slotId)}
      passport={config.passport}
      onChange={(val) => onUpdateSlot(def.slotId, val)}
      onApplyToAllDays={onApplyToAllDays && APPLY_TO_ALL_SLOTS.has(def.slotId) && allDays.length > 1
        ? () => onApplyToAllDays(def.slotId, getSlotValue(def.slotId))
        : undefined}
    />
  )

  return (
    <div id={`grid-day-${day.id}`} className={`scroll-mt-24 bg-white border rounded-xl shadow-sm overflow-hidden transition-shadow ${
      day.isExpanded ? 'shadow-md ring-1 ring-gray-200' : 'hover:shadow-md'
    }`}>
      {/* Day Header — always visible, acts as collapsed summary card */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
          day.isExpanded ? 'bg-white border-b border-gray-100' : 'hover:bg-gray-50/80'
        }`}
        onClick={onToggleExpand}
      >
        {/* Day Number Badge */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: '#556B2F' }}
        >
          {day.dayNumber}
        </div>

        {/* Title + City + Collapsed Mini Summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={day.title}
              onChange={(e) => onUpdateDay({ title: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 w-full max-w-md"
              placeholder={`Day ${day.dayNumber}`}
            />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <CitySelect
              value={day.city}
              onChange={(city) => onUpdateDay({ city })}
              onClick={(e) => e.stopPropagation()}
              placeholder="City"
              aria-label="City"
              className="text-xs text-gray-500 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 w-28"
            />
          </div>
          {/* Collapsed: what the day has, at a glance */}
          {!day.isExpanded && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {chosen.length === 0 ? (
                <span className="text-[11px] text-gray-400 italic">No services yet</span>
              ) : (
                <>
                  {chosen.slice(0, 6).map((name, i) => (
                    <span key={i} className="max-w-[220px] truncate px-1.5 py-0.5 text-[11px] bg-gray-100 text-gray-600 rounded">
                      {name}
                    </span>
                  ))}
                  {chosen.length > 6 && (
                    <span className="text-[11px] text-gray-400">+{chosen.length - 6} more</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Price */}
        <div className="text-right shrink-0 mr-2">
          <div className={`text-sm font-bold ${calc.dailyPerPerson > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
            {sym}{cv(calc.dailyPerPerson).toFixed(2)}/pp
          </div>
          <div className="text-[11px] text-gray-400">
            {sym}{cv(calc.dailyTotal).toFixed(2)} total
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {blocks && onApplyBlock && (
            <BlockPicker blocks={blocks} onPick={onApplyBlock} label="Use a block" title="Use a day block for this day" compact />
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemoveDay() }}
            className="p-1.5 text-gray-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
            title="Remove day"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <div className="p-1">
            {day.isExpanded
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />
            }
          </div>
        </div>
      </div>

      {/* What a day block could not price: the operator picks it. */}
      {blockNote && blockNote.toPick.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-900 flex items-start justify-between gap-2">
          <span>
            From block {blockNote.code} &mdash; no rate found, pick these yourself: {blockNote.toPick.join('; ')}.
          </span>
          {onDismissBlockNote && (
            <button type="button" onClick={onDismissBlockNote} className="shrink-0 text-amber-800 hover:underline">Dismiss</button>
          )}
        </div>
      )}

      {/* Expanded Grid */}
      {day.isExpanded && (
        <div>
          {/* Description */}
          {(day.description || day.isExpanded) && (
            <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-100">
              <textarea
                value={day.description}
                onChange={(e) => onUpdateDay({ description: e.target.value })}
                rows={2}
                className="w-full text-xs leading-5 text-gray-600 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 resize-none"
                placeholder="Day description / activities..."
              />
            </div>
          )}

          {/* Day Type + Component Overrides (rich gate inputs) */}
          <div className="px-4 py-2 bg-indigo-50/40 border-b border-indigo-100/40">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">Day Type</label>
              <select
                value={activeDayType}
                onChange={(e) => onUpdateDay({ dayType: e.target.value as DayType })}
                className="text-[11px] border border-indigo-200 bg-white rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {DAY_TYPES.map(t => (
                  <option key={t} value={t}>{DAY_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowDayTypeOverrides(s => !s)}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 underline-offset-2 hover:underline"
              >
                {showDayTypeOverrides ? 'hide overrides' : 'override components'}
              </button>
              <span className="text-[10px] text-indigo-500/80 ml-auto">
                The completeness gate uses these to decide what each day requires.
              </span>
            </div>

            {showDayTypeOverrides && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
                {([
                  ['overnight', 'Overnight'],
                  ['hasSightseeing', 'Sightseeing'],
                  ['airportArrival', 'Airport arrival'],
                  ['airportDeparture', 'Airport departure'],
                  ['hotelCheckIn', 'Hotel check-in'],
                  ['hotelCheckOut', 'Hotel check-out'],
                ] as const).map(([key, label]) => {
                  const isOverridden = day[key] !== undefined && day[key] !== null
                  const eff = effective(key)
                  return (
                    <label key={key} className="flex items-center gap-1.5 cursor-pointer text-gray-700">
                      <input
                        type="checkbox"
                        checked={eff}
                        onChange={(e) => onUpdateDay({ [key]: e.target.checked } as Partial<GridDay>)}
                        className="h-3 w-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                      />
                      <span className={isOverridden ? 'font-semibold text-indigo-700' : ''}>{label}</span>
                      {isOverridden && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); onUpdateDay({ [key]: undefined } as Partial<GridDay>) }}
                          className="text-[9px] text-indigo-400 hover:text-indigo-700"
                          title="Clear override (use the preset's default)"
                        >
                          ⨯
                        </button>
                      )}
                    </label>
                  )
                })}
                <label className="flex items-center gap-1.5 col-span-2 sm:col-span-3 text-gray-700">
                  <span>Intercity:</span>
                  <select
                    value={effectiveIntercity}
                    onChange={(e) => onUpdateDay({ intercity: e.target.value as Intercity })}
                    className="text-[11px] border border-gray-200 rounded px-2 py-0.5"
                  >
                    <option value="none">none</option>
                    <option value="road">road</option>
                    <option value="flight">flight</option>
                  </select>
                  {day.intercity !== undefined && day.intercity !== null && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); onUpdateDay({ intercity: undefined } as Partial<GridDay>) }}
                      className="text-[9px] text-indigo-400 hover:text-indigo-700"
                      title="Clear override"
                    >
                      reset
                    </button>
                  )}
                </label>
              </div>
            )}
          </div>

          {/* GROUP SERVICES */}
          <div className="border-b border-gray-100">
            <div className="px-4 py-1.5 bg-amber-50/70 border-b border-amber-100/50 flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Group Services</span>
              <span className="text-[11px] text-amber-600 font-medium">
                {sym}{cv(calc.groupTotal).toFixed(2)} ÷ {config.pax} pax = <strong>{sym}{cv(calc.groupPerPerson).toFixed(2)}/pp</strong>
              </span>
            </div>
            {GROUP_SLOTS.filter(shown).map(def => renderSlot(def))}
            {!GROUP_SLOTS.some(shown) && (
              <div className="px-4 py-2 text-[11px] text-gray-400 italic">No group services</div>
            )}
          </div>

          {/* PER-PERSON SERVICES */}
          <div>
            <div className="px-4 py-1.5 bg-emerald-50/70 border-b border-emerald-100/50 flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Per-Person Services</span>
              <span className="text-[11px] text-emerald-600 font-medium">
                <strong>{sym}{cv(calc.perPersonTotal).toFixed(2)}/pp</strong>
              </span>
            </div>
            {PP_SLOTS.filter(shown).map(def => renderSlot(def))}
            {!PP_SLOTS.some(shown) && (
              <div className="px-4 py-2 text-[11px] text-gray-400 italic">No per-person services</div>
            )}
          </div>

          {/* Add a service this day does not have yet */}
          <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap items-center gap-1.5">
            {addable.length > 0 && (
              <>
                <span className="text-[11px] font-medium text-gray-500 mr-1">Add service:</span>
                {addable.map(def => (
                  <button
                    key={def.slotId}
                    type="button"
                    onClick={() => setRevealed(prev => new Set(prev).add(def.slotId))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-gray-600 bg-white border border-gray-200 rounded-full hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Plus className="w-3 h-3" />
                    {def.label}
                  </button>
                ))}
              </>
            )}
            <button
              type="button"
              onClick={() => { setShowEmpty(v => !v); setRevealed(new Set()) }}
              className="ml-auto text-[11px] text-gray-400 hover:text-gray-700 underline-offset-2 hover:underline"
            >
              {showEmpty ? 'Hide empty services' : 'Show all services'}
            </button>
          </div>

          {/* DAY TOTAL */}
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Day {day.dayNumber} Total</span>
            <div className="text-right flex items-center gap-4">
              <span className="text-xs text-gray-400">× {config.pax} pax = {sym}{cv(calc.dailyTotal).toFixed(2)}</span>
              <span className="text-sm font-bold text-gray-900">{sym}{cv(calc.dailyPerPerson).toFixed(2)}/pp</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
