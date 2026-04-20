'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plus, RotateCcw, ArrowRight, ArrowLeft, Loader2, DollarSign } from 'lucide-react'

import type {
  GridConfig, GridDay, GridTotals, AllRates, SlotValue, ExchangeRates, Currency,
  GridPhase, ReviewDay,
} from './types'
import { DEFAULT_CONFIG, EMPTY_TOTALS, DEFAULT_MARGINS } from './types'
import { createEmptySlots } from './lib/slot-mapping'
import { calculateGrandTotals } from './lib/calculator'

import GridHeader from '@/components/pricing-grid/GridHeader'
import InputPanel from '@/components/pricing-grid/InputPanel'
import ClientInfoBar from '@/components/pricing-grid/ClientInfoBar'
import DayRow from '@/components/pricing-grid/DayRow'
import GridSummary from '@/components/pricing-grid/GridSummary'
import ReviewDayCard from '@/components/pricing-grid/ReviewDayCard'

const STORAGE_KEY = 'pricing-grid-state'

// Convert reviewed days into clean text for the pricing parse
function reviewDaysToText(reviewDays: ReviewDay[], config: GridConfig): string {
  let text = ''
  if (config.tourName) text += `Tour: ${config.tourName}\n`
  if (config.clientName) text += `Client: ${config.clientName}\n`
  if (config.pax) text += `Travelers: ${config.pax}\n`
  if (config.startDate) text += `Start date: ${config.startDate}\n`
  if (config.nationality) text += `Nationality: ${config.nationality}\n`
  text += '\n'

  for (const day of reviewDays) {
    text += `Day ${day.dayNumber}: ${day.title}\n`
    text += `City: ${day.city}\n`
    if (day.description) text += `${day.description}\n`
    for (const svc of day.services) {
      const prefix = svc.category === 'group' ? '[GROUP]' : '[PP]'
      text += `- ${prefix} ${svc.text}\n`
    }
    text += '\n'
  }
  return text.trim()
}

function PricingGridContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // --- Phase State ---
  const [phase, setPhase] = useState<GridPhase>('input')
  const [reviewDays, setReviewDays] = useState<ReviewDay[]>([])

  // --- Core State ---
  const [config, setConfig] = useState<GridConfig>(DEFAULT_CONFIG)
  const [days, setDays] = useState<GridDay[]>([])
  const [rates, setRates] = useState<AllRates>({})
  const [totals, setTotals] = useState<GridTotals>(EMPTY_TOTALS)

  // --- UI State ---
  const [isParsing, setIsParsing] = useState(false)
  const [isPricing, setIsPricing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingRates, setIsLoadingRates] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [parseError, setParseError] = useState('')

  // --- Refs ---
  const exchangeRatesRef = useRef<ExchangeRates>({ EUR: 1, USD: 1.08, GBP: 0.86, EGP: 52.5 })
  const prevTierRef = useRef(config.tier)
  const isInitialLoadRef = useRef(true)

  // --- Always start fresh on mount ---
  useEffect(() => {
    localStorage.removeItem(STORAGE_KEY)
    isInitialLoadRef.current = false
  }, [])

  // --- Fetch user preferences on mount ---
  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch('/api/user-preferences')
        const data = await res.json()
        if (data.success && data.data) {
          const prefs = data.data
          setConfig(prev => ({
            ...prev,
            tier: prefs.default_tier || prev.tier,
            marginPercent: prefs.default_margin_percent ?? prev.marginPercent,
            currency: prefs.default_currency || prev.currency,
          }))
        }
      } catch {}
    }
    loadPrefs()
  }, [])

  // --- Fetch exchange rates on mount ---
  useEffect(() => {
    async function loadExchangeRates() {
      try {
        const res = await fetch('/api/exchange-rates')
        const data = await res.json()
        if (data.success && data.data) {
          const ratesMap: ExchangeRates = { EUR: 1, USD: 1.08, GBP: 0.86, EGP: 52.5 }
          for (const r of data.data) {
            if (r.target_currency && r.rate) {
              ratesMap[r.target_currency as Currency] = Number(r.rate)
            }
          }
          exchangeRatesRef.current = ratesMap
          setConfig(prev => ({
            ...prev,
            exchangeRate: prev.currency === 'EUR' ? null : ratesMap[prev.currency] || null,
          }))
        }
      } catch {}
    }
    loadExchangeRates()
  }, [])

  // --- Fetch rates when tier changes ---
  useEffect(() => {
    async function loadRates() {
      setIsLoadingRates(true)
      try {
        const res = await fetch(`/api/pricing-grid/rates?tier=${config.tier}`)
        const data = await res.json()
        if (data.success && data.rates) {
          setRates(data.rates)

          if (prevTierRef.current !== config.tier && !isInitialLoadRef.current) {
            autoSwapTierSlots(data.rates)
          }
          prevTierRef.current = config.tier
        }
      } catch (err) {
        console.error('Failed to load rates:', err)
      } finally {
        setIsLoadingRates(false)
      }
    }
    loadRates()
  }, [config.tier])

  // --- Update exchange rate when currency changes ---
  useEffect(() => {
    const rate = config.currency === 'EUR' ? null : exchangeRatesRef.current[config.currency] || null
    setConfig(prev => ({ ...prev, exchangeRate: rate }))
  }, [config.currency])

  // --- Recalculate totals on any change ---
  useEffect(() => {
    const newTotals = calculateGrandTotals(days, config)
    setTotals(newTotals)
  }, [days, config.pax, config.marginPercent, config.withGuide])

  // --- Handle URL params (from inbox integration) ---
  useEffect(() => {
    const conversation = searchParams.get('conversation')
    const clientName = searchParams.get('clientName')
    const email = searchParams.get('email')
    const phone = searchParams.get('phone')
    const paxParam = searchParams.get('pax')
    const tierParam = searchParams.get('tier')
    const tourNameParam = searchParams.get('tourName')
    const nationalityParam = searchParams.get('nationality')
    const clientIdParam = searchParams.get('clientId')

    const hasConfigParams = clientName || email || phone || paxParam || tierParam || tourNameParam || nationalityParam || clientIdParam

    if (conversation) {
      try {
        const text = decodeURIComponent(escape(atob(conversation)))
        if (text.trim()) {
          setConfig(prev => ({
            ...prev,
            clientName: clientName || prev.clientName,
            clientEmail: email || prev.clientEmail,
            clientPhone: phone || prev.clientPhone,
            ...(paxParam ? { pax: parseInt(paxParam) || prev.pax } : {}),
            ...(tierParam ? { tier: tierParam as any } : {}),
            ...(tourNameParam ? { tourName: tourNameParam } : {}),
            ...(nationalityParam ? { nationality: nationalityParam } : {}),
            ...(clientIdParam ? { clientId: clientIdParam } : {}),
          }))
          handleParse(text)
        }
      } catch {}
    } else if (hasConfigParams) {
      setConfig(prev => ({
        ...prev,
        clientName: clientName || prev.clientName,
        clientEmail: email || prev.clientEmail,
        clientPhone: phone || prev.clientPhone,
        ...(paxParam ? { pax: parseInt(paxParam) || prev.pax } : {}),
        ...(tierParam ? { tier: tierParam as any } : {}),
        ...(tourNameParam ? { tourName: tourNameParam } : {}),
        ...(nationalityParam ? { nationality: nationalityParam } : {}),
        ...(clientIdParam ? { clientId: clientIdParam } : {}),
      }))
    }
  }, [searchParams])

  // --- Auto-swap tier-dependent slots ---
  const autoSwapTierSlots = useCallback((newRates: AllRates) => {
    setDays(prevDays => prevDays.map(day => ({
      ...day,
      slots: day.slots.map(slot => {
        if (slot.slotId === 'accommodation' && slot.selectedId) {
          const city = day.city
          const match = (newRates.accommodation || []).find(
            (r: any) => r.city?.toLowerCase() === city?.toLowerCase()
          )
          if (match) {
            return { ...slot, selectedId: match.id, resolvedRate: match.rateEur, label: match.label }
          }
          return { ...slot, selectedId: null, resolvedRate: 0, label: '' }
        }
        if (slot.slotId === 'cruise' && slot.selectedId) {
          const match = (newRates.cruise || [])[0]
          if (match) {
            return { ...slot, selectedId: match.id, resolvedRate: match.rateEur, label: match.label }
          }
          return { ...slot, selectedId: null, resolvedRate: 0, label: '' }
        }
        return slot
      }),
    })))
  }, [])

  // --- Handlers ---

  const handleConfigChange = useCallback((updates: Partial<GridConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }))
  }, [])

  // Parse text into structure only (no pricing) → review phase
  const handleParse = useCallback(async (text: string) => {
    setIsParsing(true)
    setParseError('')
    setSavedUrl(null)

    try {
      const res = await fetch('/api/pricing-grid/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tier: config.tier, pax: config.pax, mode: 'structure' }),
      })
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Parse failed')
      }

      setReviewDays(data.days || [])
      setPhase('review')

      if (data.metadata) {
        const m = data.metadata
        setConfig(prev => ({
          ...prev,
          clientName: m.clientName || prev.clientName,
          clientEmail: m.clientEmail || prev.clientEmail,
          clientPhone: m.clientPhone || prev.clientPhone,
          pax: m.pax || prev.pax,
          startDate: m.startDate || prev.startDate,
          passport: m.passport || prev.passport,
          tourName: m.tourName || prev.tourName,
          nationality: m.nationality || prev.nationality,
        }))
      }
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse')
      throw err
    } finally {
      setIsParsing(false)
    }
  }, [config.tier, config.pax])

  // Submit reviewed itinerary to pricing (rate matching)
  const handleSubmitToPricing = useCallback(async () => {
    if (reviewDays.length === 0) return
    setIsPricing(true)
    setParseError('')

    try {
      const text = reviewDaysToText(reviewDays, config)
      const res = await fetch('/api/pricing-grid/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tier: config.tier, pax: config.pax, mode: 'full' }),
      })
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Pricing failed')
      }

      setDays(data.days || [])
      setPhase('pricing')
    } catch (err: any) {
      setParseError(err.message || 'Failed to apply pricing')
    } finally {
      setIsPricing(false)
    }
  }, [reviewDays, config])

  const handleBackToReview = useCallback(() => {
    setPhase('review')
    setDays([])
  }, [])

  const handleLoadItinerary = useCallback(async (id: string) => {
    setIsParsing(true)
    try {
      const res = await fetch(`/api/itineraries/${id}`)
      const data = await res.json()
      if (!data.success || !data.data) {
        throw new Error('Itinerary not found')
      }

      const itn = data.data
      setConfig(prev => ({
        ...prev,
        clientName: itn.client_name || prev.clientName,
        clientEmail: itn.client_email || prev.clientEmail,
        clientPhone: itn.client_phone || prev.clientPhone,
        tourName: itn.trip_name || prev.tourName,
        pax: itn.num_adults || prev.pax,
        tier: itn.tier || prev.tier,
        startDate: itn.start_date || prev.startDate,
        itineraryId: itn.id,
      }))

      if (itn.itinerary_days) {
        const loadedDays: GridDay[] = itn.itinerary_days.map((d: any, i: number) => ({
          id: d.id || crypto.randomUUID(),
          dayNumber: d.day_number || i + 1,
          title: d.title || `Day ${i + 1}`,
          city: d.city || '',
          description: d.description || '',
          isExpanded: i === 0,
          slots: createEmptySlots(),
        }))
        setDays(loadedDays)
        setPhase('pricing')
      }
    } catch (err: any) {
      throw err
    } finally {
      setIsParsing(false)
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (days.length === 0) return
    setIsSaving(true)
    setSavedUrl(null)

    try {
      const res = await fetch('/api/pricing-grid/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, days, totals }),
      })
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Save failed')
      }

      setConfig(prev => ({ ...prev, itineraryId: data.itineraryId }))
      setSavedUrl(data.redirectUrl || `/itineraries/${data.itineraryId}`)

      localStorage.removeItem(STORAGE_KEY)

      if (data.redirectUrl && config.clientType === 'b2b') {
        router.push(data.redirectUrl)
      }
    } catch (err: any) {
      alert(`Save failed: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [config, days, totals, router])

  const handleUpdateSlot = useCallback((dayId: string, slotId: string, value: SlotValue) => {
    setDays(prev => prev.map(d =>
      d.id === dayId
        ? { ...d, slots: d.slots.map(s => s.slotId === slotId ? value : s) }
        : d
    ))
  }, [])

  const handleUpdateDay = useCallback((dayId: string, updates: Partial<GridDay>) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, ...updates } : d))
  }, [])

  const handleToggleExpand = useCallback((dayId: string) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, isExpanded: !d.isExpanded } : d))
  }, [])

  const handleRemoveDay = useCallback((dayId: string) => {
    setDays(prev => {
      const filtered = prev.filter(d => d.id !== dayId)
      return filtered.map((d, i) => ({ ...d, dayNumber: i + 1 }))
    })
  }, [])

  const handleDuplicateDay = useCallback((dayId: string) => {
    setDays(prev => {
      const idx = prev.findIndex(d => d.id === dayId)
      if (idx === -1) return prev
      const original = prev[idx]
      const clone: GridDay = {
        ...original,
        id: crypto.randomUUID(),
        dayNumber: idx + 2,
        title: `${original.title} (copy)`,
        slots: original.slots.map(s => ({ ...s })),
      }
      const newDays = [...prev]
      newDays.splice(idx + 1, 0, clone)
      return newDays.map((d, i) => ({ ...d, dayNumber: i + 1 }))
    })
  }, [])

  const handleAddDay = useCallback(() => {
    const newDay: GridDay = {
      id: crypto.randomUUID(),
      dayNumber: days.length + 1,
      title: '',
      city: days.length > 0 ? days[days.length - 1].city : '',
      description: '',
      isExpanded: true,
      slots: createEmptySlots(),
    }
    setDays(prev => [...prev, newDay])
  }, [days.length])

  // Review phase: add/remove/duplicate/update days
  const handleReviewAddDay = useCallback(() => {
    const newDay: ReviewDay = {
      id: crypto.randomUUID(),
      dayNumber: reviewDays.length + 1,
      title: '',
      city: reviewDays.length > 0 ? reviewDays[reviewDays.length - 1].city : '',
      description: '',
      services: [],
      isExpanded: true,
    }
    setReviewDays(prev => [...prev, newDay])
  }, [reviewDays.length])

  const handleReviewUpdateDay = useCallback((dayId: string, updates: Partial<ReviewDay>) => {
    setReviewDays(prev => prev.map(d => d.id === dayId ? { ...d, ...updates } : d))
  }, [])

  const handleReviewRemoveDay = useCallback((dayId: string) => {
    setReviewDays(prev => {
      const filtered = prev.filter(d => d.id !== dayId)
      return filtered.map((d, i) => ({ ...d, dayNumber: i + 1 }))
    })
  }, [])

  const handleReviewDuplicateDay = useCallback((dayId: string) => {
    setReviewDays(prev => {
      const idx = prev.findIndex(d => d.id === dayId)
      if (idx === -1) return prev
      const original = prev[idx]
      const clone: ReviewDay = {
        ...original,
        id: crypto.randomUUID(),
        dayNumber: idx + 2,
        title: `${original.title} (copy)`,
        services: original.services.map(s => ({ ...s, id: crypto.randomUUID() })),
      }
      const newDays = [...prev]
      newDays.splice(idx + 1, 0, clone)
      return newDays.map((d, i) => ({ ...d, dayNumber: i + 1 }))
    })
  }, [])

  const handleReviewToggleExpand = useCallback((dayId: string) => {
    setReviewDays(prev => prev.map(d => d.id === dayId ? { ...d, isExpanded: !d.isExpanded } : d))
  }, [])

  const handleReset = useCallback(() => {
    if (confirm('Clear everything and start over? This cannot be undone.')) {
      setDays([])
      setReviewDays([])
      setConfig(DEFAULT_CONFIG)
      setSavedUrl(null)
      setPhase('input')
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-50">
      <GridHeader config={config} totals={totals} onConfigChange={handleConfigChange} />

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        {/* Phase indicator */}
        {phase !== 'input' && (
          <div className="flex items-center gap-2 text-xs font-medium">
            <button
              onClick={handleReset}
              className="px-3 py-1 rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors"
            >
              1. Input
            </button>
            <ArrowRight className="w-3 h-3 text-gray-400" />
            <button
              onClick={phase === 'pricing' ? handleBackToReview : undefined}
              className={`px-3 py-1 rounded-full transition-colors ${phase === 'review' ? 'bg-[#647C47] text-white' : phase === 'pricing' ? 'bg-gray-200 text-gray-500 hover:bg-gray-300 cursor-pointer' : 'bg-gray-200 text-gray-400'}`}
            >
              2. Review
            </button>
            <ArrowRight className="w-3 h-3 text-gray-400" />
            <span className={`px-3 py-1 rounded-full ${phase === 'pricing' ? 'bg-[#647C47] text-white' : 'bg-gray-200 text-gray-400'}`}>
              3. Pricing
            </span>
          </div>
        )}

        {/* Client Info */}
        <ClientInfoBar config={config} onConfigChange={handleConfigChange} />

        {/* ========== INPUT PHASE ========== */}
        {phase === 'input' && (
          <>
            <InputPanel
              onParse={handleParse}
              onLoadItinerary={handleLoadItinerary}
              isParsing={isParsing}
            />

            {parseError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-200">
                {parseError}
              </div>
            )}

            {isParsing && (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#647C47] mx-auto mb-4"></div>
                <p className="text-gray-600 font-medium">Parsing your itinerary...</p>
                <p className="text-gray-400 text-sm mt-1">AI is extracting the itinerary structure</p>
              </div>
            )}
          </>
        )}

        {/* ========== REVIEW PHASE ========== */}
        {phase === 'review' && (
          <>
            {parseError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-200">
                {parseError}
              </div>
            )}

            {/* Review day cards */}
            {reviewDays.length > 0 && (
              <div className="space-y-3">
                {reviewDays.map(day => (
                  <ReviewDayCard
                    key={day.id}
                    day={day}
                    onUpdate={updates => handleReviewUpdateDay(day.id, updates)}
                    onRemove={() => handleReviewRemoveDay(day.id)}
                    onDuplicate={() => handleReviewDuplicateDay(day.id)}
                    onToggleExpand={() => handleReviewToggleExpand(day.id)}
                  />
                ))}
              </div>
            )}

            {/* Add Day + Reset */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleReviewAddDay}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#647C47] bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg hover:bg-[#647C47]/10 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Day
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Start Over
              </button>
            </div>

            {/* Submit to Pricing */}
            {reviewDays.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {reviewDays.length} day{reviewDays.length !== 1 ? 's' : ''} &middot; {reviewDays.reduce((sum, d) => sum + d.services.length, 0)} services
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Review the itinerary above, then submit to apply pricing from your rate database
                    </p>
                  </div>
                  <button
                    onClick={handleSubmitToPricing}
                    disabled={isPricing || reviewDays.length === 0}
                    className="btn-primary px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPricing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Applying Pricing...
                      </>
                    ) : (
                      <>
                        <DollarSign className="w-4 h-4" />
                        Submit to Pricing
                      </>
                    )}
                  </button>
                </div>

                {isPricing && (
                  <div className="mt-4 bg-[#647C47]/5 rounded-lg p-4 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47] mx-auto mb-3"></div>
                    <p className="text-sm text-gray-600">Matching services to your rate database...</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ========== PRICING PHASE ========== */}
        {phase === 'pricing' && (
          <>
            {/* Back to review */}
            <button
              onClick={handleBackToReview}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#647C47] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Review
            </button>

            {/* Day Cards */}
            {!isParsing && days.length > 0 && (
              <div className="space-y-3">
                {days.map(day => (
                  <DayRow
                    key={day.id}
                    day={day}
                    config={config}
                    rates={rates}
                    onToggleExpand={() => handleToggleExpand(day.id)}
                    onUpdateSlot={(slotId, value) => handleUpdateSlot(day.id, slotId, value)}
                    onUpdateDay={(updates) => handleUpdateDay(day.id, updates)}
                    onRemove={() => handleRemoveDay(day.id)}
                    onDuplicate={() => handleDuplicateDay(day.id)}
                  />
                ))}
              </div>
            )}

            {/* Add Day + Reset */}
            {!isParsing && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAddDay}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#647C47] bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg hover:bg-[#647C47]/10 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Day
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Start Over
                </button>
              </div>
            )}

            {/* Summary */}
            <GridSummary
              config={config}
              totals={totals}
              dayCount={days.length}
              isSaving={isSaving}
              savedUrl={savedUrl}
              onSave={handleSave}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default function PricingGridPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    }>
      <PricingGridContent />
    </Suspense>
  )
}
