'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { todayLocal } from '@/lib/today'
import { useSearchParams, useRouter } from 'next/navigation'
import type { GridConfig, GridDay, AllRates, SlotValue, GridTotals } from './types'
import { SLOT_DEFINITIONS } from './types'
import { calculateGrandTotals, calculateDay } from './lib/calculator'
import { buildGuideRateIndex, computeThroughoutGuideExtras } from './lib/throughout-guide'
import { mapServicesToSlots } from './lib/slot-mapping'
import GridHeader from './components/GridHeader'
import ClientInfoBar from './components/ClientInfoBar'
import InputPanel from './components/InputPanel'
import DayRow from './components/DayRow'
import GridSummary from './components/GridSummary'
import { showToast } from '@/app/contexts/ToastContext'

// ============================================
// LOCAL STORAGE PERSISTENCE
// ============================================

const STORAGE_KEY_CONFIG = 'pricing-grid-config'
const STORAGE_KEY_DAYS = 'pricing-grid-days'

function saveToStorage(key: string, data: any) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch (e) { /* ignore */ }
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored) return JSON.parse(stored) as T
  } catch (e) { /* ignore */ }
  return fallback
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY_CONFIG)
    localStorage.removeItem(STORAGE_KEY_DAYS)
  } catch (e) { /* ignore */ }
}

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: GridConfig = {
  pax: 2,
  passport: 'non_eu',
  tier: 'standard',
  clientType: 'b2c',
  packageType: 'full-package',
  withGuide: true,
  guideMode: 'spot',
  currency: 'EUR',
  marginPercent: 25,
  exchangeRate: null,
  startDate: todayLocal(),
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  tourName: '',
  nationality: '',
  itineraryId: null,
  itineraryCode: null,
  partnerId: null,
  partnerName: '',
  clientId: null,
}

// ============================================
// HELPERS
// ============================================

function createEmptyDay(dayNumber: number): GridDay {
  return {
    id: crypto.randomUUID(),
    dayNumber,
    title: `Day ${dayNumber}`,
    city: '',
    description: '',
    isExpanded: false,
    slots: SLOT_DEFINITIONS.map(def => ({
      slotId: def.slotId,
      selectedItems: [],
      customAmount: 0,
    })),
  }
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function PricingGridPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6 text-center text-gray-500">Loading...</div>}>
      <PricingGridContent />
    </Suspense>
  )
}

function PricingGridContent() {
  const router = useRouter()
  const [config, setConfig] = useState<GridConfig>(() =>
    loadFromStorage(STORAGE_KEY_CONFIG, DEFAULT_CONFIG)
  )
  const [days, setDays] = useState<GridDay[]>(() =>
    loadFromStorage(STORAGE_KEY_DAYS, [])
  )
  const [rates, setRates] = useState<AllRates | null>(null)
  const [loading, setLoading] = useState(true)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null)
  const [savedQuoteNumber, setSavedQuoteNumber] = useState<string | null>(null)

  const isInitialLoad = useRef(true)

  // Persist to localStorage
  useEffect(() => {
    if (isInitialLoad.current) return
    saveToStorage(STORAGE_KEY_CONFIG, config)
  }, [config])

  useEffect(() => {
    if (isInitialLoad.current) return
    saveToStorage(STORAGE_KEY_DAYS, days)
  }, [days])

  useEffect(() => {
    isInitialLoad.current = false
  }, [])

  // Load user preferences as defaults (tier, margin, currency) on first load
  const hasLoadedPrefs = useRef(false)
  useEffect(() => {
    if (hasLoadedPrefs.current) return
    hasLoadedPrefs.current = true
    // Only apply preferences if config is at defaults (no localStorage override)
    const isDefault = config.tier === DEFAULT_CONFIG.tier &&
      config.marginPercent === DEFAULT_CONFIG.marginPercent &&
      config.currency === DEFAULT_CONFIG.currency
    if (!isDefault) return

    const loadPrefs = async () => {
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
      } catch (err) {
        console.error('Failed to load user preferences:', err)
      }
    }
    loadPrefs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch rates
  const fetchRates = useCallback(async (tier: string) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/pricing-grid/rates?tier=${tier}`)
      const data = await res.json()
      if (data.success) setRates(data.data)
    } catch (err) {
      console.error('Failed to fetch rates:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRates(config.tier)
  }, [config.tier, fetchRates])

  // Auto-swap accommodation and cruise when tier changes
  const prevTierRef = useRef(config.tier)
  useEffect(() => {
    if (!rates || days.length === 0) return
    // Only run when tier actually changed (not on initial load)
    if (prevTierRef.current === config.tier) return
    prevTierRef.current = config.tier

    setDays(prevDays => prevDays.map(day => ({
      ...day,
      slots: day.slots.map(slot => {
        // Swap accommodation: match by city
        if (slot.slotId === 'accommodation' && slot.selectedItems.length > 0) {
          const dayCity = day.city?.toLowerCase()?.trim()
          const newHotel = (rates as AllRates).accommodation.find(
            (r: any) => r.city?.toLowerCase()?.trim() === dayCity
          )
          if (newHotel) {
            return {
              ...slot,
              selectedItems: [{
                rateId: newHotel.id,
                name: newHotel.name,
                rateEur: newHotel.rateEur,
                rateNonEur: newHotel.rateNonEur,
              }],
            }
          }
          // No hotel in new tier for this city — clear selection
          return { ...slot, selectedItems: [] }
        }

        // Swap cruise: pick the first cruise in the new tier
        if (slot.slotId === 'cruise' && slot.selectedItems.length > 0) {
          const newCruise = (rates as AllRates).cruise[0]
          if (newCruise) {
            return {
              ...slot,
              selectedItems: [{
                rateId: newCruise.id,
                name: newCruise.name,
                rateEur: newCruise.rateEur,
                rateNonEur: newCruise.rateNonEur,
              }],
            }
          }
          return { ...slot, selectedItems: [] }
        }

        return slot
      }),
    })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates])

  // Pre-fetch all exchange rates once on mount, then currency switching is instant
  const exchangeRatesCache = useRef<Record<string, number> | null>(null)
  useEffect(() => {
    const prefetch = async () => {
      try {
        const res = await fetch('/api/exchange-rates?base=EUR')
        const data = await res.json()
        if (data.success && data.data?.rates) {
          exchangeRatesCache.current = data.data.rates
          // Apply if currency is already non-EUR
          if (config.currency !== 'EUR' && data.data.rates[config.currency]) {
            setConfig(prev => ({ ...prev, exchangeRate: data.data.rates[prev.currency] }))
          }
        }
      } catch (err) {
        console.error('Failed to prefetch exchange rates:', err)
      }
    }
    prefetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply exchange rate instantly from cache when currency changes
  useEffect(() => {
    if (config.currency === 'EUR') {
      if (config.exchangeRate !== null) {
        setConfig(prev => ({ ...prev, exchangeRate: null }))
      }
      return
    }
    // Use cached rates (instant) — no API call needed
    const cached = exchangeRatesCache.current
    if (cached && cached[config.currency]) {
      setConfig(prev => ({ ...prev, exchangeRate: cached[prev.currency] }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.currency])

  // --- URL Params: Auto-load conversation from inbox redirect ---
  const searchParams = useSearchParams()
  const hasProcessedParams = useRef(false)
  const pendingParseText = useRef<string | null>(null)

  // Effect 1: Decode URL params and store text for parsing
  useEffect(() => {
    if (hasProcessedParams.current) return
    const conversationParam = searchParams?.get('conversation')
    if (!conversationParam) return
    hasProcessedParams.current = true

    // Decode conversation (handle both standard and URL-safe base64)
    const isBase64 = searchParams?.get('encoded') === 'base64'
    let decodedText = conversationParam

    if (isBase64) {
      try {
        // Convert URL-safe base64 back to standard base64
        let base64 = conversationParam.replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4) base64 += '='
        // Proper Unicode base64 decoding
        const binaryString = atob(base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        decodedText = new TextDecoder('utf-8').decode(bytes)
      } catch (e) {
        console.error('Failed to decode base64 conversation:', e)
        try { decodedText = decodeURIComponent(conversationParam) } catch { /* use raw */ }
      }
    }

    // Clear existing state — start fresh for this new conversation
    setDays([])
    setSaveMessage(null)
    setSavedQuoteId(null)
    setSavedQuoteNumber(null)

    // Pre-fill client info from URL params and reset itinerary link
    const emailParam = searchParams?.get('email')
    const phoneParam = searchParams?.get('phone')
    const clientNameParam = searchParams?.get('clientName')
    setConfig(prev => ({
      ...prev,
      clientEmail: emailParam || '',
      clientPhone: phoneParam || '',
      clientName: clientNameParam || '',
      itineraryId: null,
      itineraryCode: null,
    }))

    // Clear localStorage so reload doesn't bring back old data
    clearStorage()

    // Clean URL (remove params without page reload)
    window.history.replaceState({}, '', '/pricing-grid')

    // Store decoded text — the rates effect will trigger parsing when ready
    if (decodedText.trim()) {
      pendingParseText.current = decodedText
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Effect 2: Auto-parse once rates are loaded (fires immediately if rates already exist)
  useEffect(() => {
    if (!rates || !pendingParseText.current) return
    const text = pendingParseText.current
    pendingParseText.current = null // Clear to prevent re-firing
    handleParseDays(text)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates])

  // --- Day Management ---
  const addDay = () => setDays(prev => [...prev, createEmptyDay(prev.length + 1)])

  const removeDay = (dayId: string) => {
    setDays(prev => prev.filter(d => d.id !== dayId).map((d, i) => ({ ...d, dayNumber: i + 1 })))
  }

  const toggleExpand = (dayId: string) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, isExpanded: !d.isExpanded } : d))
  }

  const expandAll = () => setDays(prev => prev.map(d => ({ ...d, isExpanded: true })))
  const collapseAll = () => setDays(prev => prev.map(d => ({ ...d, isExpanded: false })))

  const updateDay = (dayId: string, partial: Partial<GridDay>) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, ...partial } : d))
  }

  const updateSlot = (dayId: string, slotId: string, value: SlotValue) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d
      let updatedSlots = d.slots.map(s => s.slotId === slotId ? value : s)

      // Reactive meal adjustment: when accommodation changes, update meals based on board basis
      if (slotId === 'accommodation' && rates) {
        const hotelId = value.selectedItems[0]?.rateId
        const hotelRate = (rates as AllRates).accommodation.find((r: any) => r.id === hotelId)
        const boardBasis = ((hotelRate as any)?.board_basis || 'BB').toUpperCase()
        const cityLower = d.city?.toLowerCase()?.trim()

        // Determine which outside meals are needed
        let needsLunch = false
        let needsDinner = false
        switch (boardBasis) {
          case 'FB': case 'AI': break // All meals included
          case 'HB': needsLunch = true; break // Dinner included, need lunch
          case 'BB': case 'RO': default: needsLunch = true; needsDinner = true; break
        }

        // Find meal rates for this city
        const cityMeals = (rates as AllRates).meals.filter(
          (m: any) => m.city?.toLowerCase()?.trim() === cityLower
        )
        const lunch = cityMeals.find((m: any) => /lunch/i.test(m.category || m.name || ''))
        const dinner = cityMeals.find((m: any) => /dinner/i.test(m.category || m.name || ''))

        const mealItems: typeof value.selectedItems = []
        if (needsLunch && lunch) {
          mealItems.push({ rateId: lunch.id, name: lunch.name, rateEur: lunch.rateEur, rateNonEur: lunch.rateNonEur })
        }
        if (needsDinner && dinner) {
          mealItems.push({ rateId: dinner.id, name: dinner.name, rateEur: dinner.rateEur, rateNonEur: dinner.rateNonEur })
        }

        updatedSlots = updatedSlots.map(s =>
          s.slotId === 'meals' ? { ...s, selectedItems: mealItems } : s
        )
      }

      return { ...d, slots: updatedSlots }
    }))
  }

  // --- Clear All ---
  const handleClearAll = () => {
    setDays([])
    setConfig(DEFAULT_CONFIG)
    clearStorage()
    setSaveMessage(null)
  }

  // --- Parse Text via AI ---
  const handleParseDays = async (text: string) => {
    try {
      setIsParsing(true)
      setSaveMessage(null)
      // Clear old data immediately so the loading indicator shows
      // and the user knows a fresh parse is starting
      setDays([])
      setConfig(prev => ({ ...prev, itineraryId: null, itineraryCode: null }))
      const res = await fetch('/api/pricing-grid/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tier: config.tier, pax: config.pax, package_type: config.packageType })
      })
      const data = await res.json()
      if (data.success && data.days) {
        const parsedDays: GridDay[] = data.days.map((pd: any, idx: number) => ({
          id: crypto.randomUUID(),
          dayNumber: pd.dayNumber || idx + 1,
          title: pd.title || `Day ${idx + 1}`,
          city: pd.city || '',
          description: pd.description || '',
          isExpanded: false,
          slots: SLOT_DEFINITIONS.map(def => {
            const slotData = pd.slots?.[def.slotId]
            if (!slotData) return { slotId: def.slotId, selectedItems: [], customAmount: 0 }
            return {
              slotId: def.slotId,
              selectedItems: (slotData.selectedItems || []).map((item: any) => ({
                rateId: item.rateId,
                name: item.name,
                rateEur: item.rateEur || 0,
                rateNonEur: item.rateNonEur || 0,
              })),
              customAmount: slotData.customAmount || 0,
            }
          }),
        }))
        setDays(parsedDays)
        // Show indicator if itinerary was AI-generated (not parsed from detailed text)
        if (data.generationMode === 'generated') {
          setSaveMessage('✨ AI-suggested itinerary based on inquiry — review and adjust as needed')
        }
        // Apply AI-extracted metadata to config (URL params take precedence)
        const meta = data.metadata
        setConfig(prev => ({
          ...prev,
          itineraryId: null,
          itineraryCode: null,
          // Only apply metadata fields if they exist and the field isn't already set
          ...(meta?.pax != null && { pax: meta.pax }),
          ...(meta?.startDate && { startDate: meta.startDate }),
          ...(meta?.passport && { passport: meta.passport as 'eu' | 'non_eu' }),
          ...(meta?.tourName && { tourName: meta.tourName }),
          ...(meta?.nationality && { nationality: meta.nationality }),
          // Client name: URL param takes precedence, then AI-extracted
          ...(meta?.clientName && !prev.clientName && { clientName: meta.clientName }),
        }))
      } else {
        showToast('error', data.error || 'Failed to parse text')
      }
    } catch (err) {
      console.error('Parse error:', err)
      showToast('error', 'Failed to parse text')
    } finally {
      setIsParsing(false)
    }
  }

  // --- Load from Existing Itinerary (full restore) ---
  const handleLoadItinerary = async (itineraryId: string) => {
    try {
      // Fetch itinerary header
      const headerRes = await fetch(`/api/itineraries/${itineraryId}`)
      const headerData = await headerRes.json()

      if (!headerData.success || !headerData.data) {
        showToast('error', 'Failed to load itinerary')
        return
      }

      const itn = headerData.data

      // Update config from itinerary
      setConfig(prev => ({
        ...prev,
        clientName: itn.client_name || '',
        clientEmail: itn.client_email || '',
        clientPhone: itn.client_phone || '',
        tourName: itn.trip_name || '',
        pax: itn.num_adults || 2,
        tier: itn.tier || 'standard',
        currency: itn.currency || 'EUR',
        startDate: itn.start_date || prev.startDate,
        clientType: itn.source?.startsWith('b2b') ? 'b2b' : 'b2c',
        // The itinerary's declared product decides what the gate requires.
        // Grid saves used to stamp every trip 'land-package' regardless, so
        // a stored value may be that stamp rather than a choice — it is
        // still the best information available, and new saves are honest.
        packageType: (itn.package_type as GridConfig['packageType']) || 'full-package',
        partnerId: itn.partner_id || null,
        itineraryId: itn.id,
        itineraryCode: itn.itinerary_code,
      }))

      // Fetch days with services
      const daysRes = await fetch(`/api/itineraries/${itineraryId}/days?language=en`)
      const daysData = await daysRes.json()

      if (daysData.success && daysData.data) {
        const loadedDays: GridDay[] = daysData.data.map((dayData: any, idx: number) => {
          // Reverse-map services to slots
          const services = dayData.services || []
          const slots = services.length > 0
            ? mapServicesToSlots(services, itn.num_adults || 2)
            : SLOT_DEFINITIONS.map(def => ({ slotId: def.slotId, selectedItems: [], customAmount: 0 }))

          return {
            id: crypto.randomUUID(),
            dayNumber: dayData.day_number || idx + 1,
            title: dayData.title || `Day ${idx + 1}`,
            city: dayData.city || '',
            description: dayData.description || '',
            isExpanded: false,
            slots,
            // Consolidation Phase B: restore the day-type preset + component
            // overrides so the rich gridCompleteness gate has its inputs.
            // Columns may be undefined for pre-migration rows — that's fine,
            // resolveComponents() falls back to DAY_TYPE_DEFAULTS[DEFAULT_DAY_TYPE].
            dayType: dayData.day_type ?? undefined,
            overnight: dayData.overnight ?? undefined,
            hasSightseeing: dayData.has_sightseeing ?? undefined,
            airportArrival: dayData.airport_arrival ?? undefined,
            airportDeparture: dayData.airport_departure ?? undefined,
            hotelCheckIn: dayData.hotel_check_in ?? undefined,
            hotelCheckOut: dayData.hotel_check_out ?? undefined,
            intercity: dayData.intercity ?? undefined,
          }
        })
        setDays(loadedDays)
        setSaveMessage(`Loaded ${itn.itinerary_code}`)
      }
    } catch (err) {
      console.error('Load error:', err)
      showToast('error', 'Failed to load itinerary')
    }
  }

  // Auto-load an itinerary passed via ?itinerary=<id> (e.g. from the itinerary
  // editor's "Price in Grid"). The grid is the single pricing surface, so the
  // editor redirects here instead of calling the retired calculate-pricing route.
  const hasLoadedItineraryParam = useRef(false)
  useEffect(() => {
    if (hasLoadedItineraryParam.current) return
    const itineraryParam = searchParams?.get('itinerary')
    if (!itineraryParam) return
    hasLoadedItineraryParam.current = true
    handleLoadItinerary(itineraryParam)
    // Clean the URL so a reload doesn't reload-by-param.
    window.history.replaceState({}, '', '/pricing-grid')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // --- Save to Database ---
  const handleSave = async () => {
    if (days.length === 0) {
      showToast('error', 'No days to save. Parse or add days first.')
      return
    }

    try {
      setIsSaving(true)
      setSaveMessage(null)

      const res = await fetch('/api/pricing-grid/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          days,
          totals,
          // Synthetic group rows carrying the throughout guide's money onto
          // the saved itinerary (B-item 3); the reload parser skips them.
          throughout_extras: config.guideMode === 'throughout' ? throughoutGuide.extras : [],
        })
      })

      const data = await res.json()

      if (data.success) {
        setConfig(prev => ({
          ...prev,
          itineraryId: data.itineraryId,
          itineraryCode: data.itineraryCode,
        }))

        // For B2B: create quote + template, then redirect to /tours/manage
        if (config.clientType === 'b2b') {
          try {
            // Step 1: Create B2B quote
            const quoteRes = await fetch('/api/b2b/quote-from-itinerary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itinerary_id: data.itineraryId,
                partner_id: config.partnerId || undefined,
                margin_percent: config.marginPercent,
                is_eur_passport: config.passport === 'eu',
                language: 'English',
                // Stored via B1's columns, non-default only.
                guide_mode: config.guideMode === 'throughout' ? 'throughout' : undefined,
              })
            })
            const quoteData = await quoteRes.json()
            const quoteId = quoteData.data?.id || quoteData.id
            const quoteNum = quoteData.data?.quote_number || quoteData.quote_number
            if (quoteId) {
              setSavedQuoteId(quoteId)
              setSavedQuoteNumber(quoteNum || null)
            }

            // Step 2: Create tour template from itinerary
            const templateRes = await fetch('/api/b2b/create-template-from-itinerary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itinerary_id: data.itineraryId,
                tier: config.tier || 'standard',
              })
            })
            const templateData = await templateRes.json()

            if (templateData.success && templateData.data?.variation_id) {
              setSaveMessage(`Saved as ${data.itineraryCode} + B2B Quote ${quoteNum || ''} — Redirecting to B2B Calculator...`)
              // Redirect to B2B calculator which has full Plus 0/Plus 1 pricing table
              setTimeout(() => {
                router.push(`/b2b/calculator/${templateData.data.variation_id}`)
              }, 1000)
            } else {
              setSaveMessage(`Saved as ${data.itineraryCode} + B2B Quote ${quoteNum || ''} (template creation: ${templateData.error || 'failed'})`)
            }
          } catch (quoteErr) {
            console.error('B2B quote/template creation error:', quoteErr)
            setSaveMessage(`Saved as ${data.itineraryCode} (B2B processing failed)`)
          }
        } else {
          setSavedQuoteId(null)
          setSavedQuoteNumber(null)
          setSaveMessage(`Saved as ${data.itineraryCode}`)
        }
      } else {
        showToast('error', `Save failed: ${data.error}`)
      }
    } catch (err: any) {
      console.error('Save error:', err)
      showToast('error', `Failed to save itinerary: ${err?.message || 'Network error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  // --- Calculate Totals ---
  // Throughout guide (B-item 3): pure grid math from what the slots hold —
  // the option payloads carry the guide rates, nothing is fetched here.
  const throughoutGuide = computeThroughoutGuideExtras(
    days,
    config,
    buildGuideRateIndex(rates ?? {})
  )
  const totals: GridTotals = days.length > 0
    ? calculateGrandTotals(days, config, { throughoutGroupExtraEur: throughoutGuide.totalEur })
    : { costPerPerson: 0, totalCost: 0, marginAmount: 0, sellingPricePerPerson: 0, sellingPriceTotal: 0 }

  // --- Render ---
  if (loading && !rates) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-20 text-gray-500">Loading rates...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 bg-gray-50 min-h-screen">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-2 bg-gray-50">
        <GridHeader config={config} onChange={setConfig} totals={totals} />
      </div>

      {/* Client Info */}
      <ClientInfoBar config={config} onChange={setConfig} />

      {/* Input Panel */}
      <InputPanel
        onParseDays={handleParseDays}
        onAddDay={addDay}
        onLoadItinerary={handleLoadItinerary}
        packageType={config.packageType ?? 'full-package'}
        onPackageTypeChange={(p) => setConfig(prev => ({ ...prev, packageType: p }))}
        onClearAll={handleClearAll}
        isParsing={isParsing}
        hasDays={days.length > 0}
      />

      {/* Days Grid */}
      {days.length === 0 ? (
        isParsing ? (
          <div className="text-center py-24 border-2 border-dashed border-green-200 rounded-xl bg-white">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-green-50">
              <svg className="w-8 h-8 text-green-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1">Building your itinerary...</p>
            <p className="text-sm text-gray-500 mb-4">Matching services to rates and filling in details</p>
            <div className="flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : (
          <div className="text-center py-24 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white">
            <div className="text-3xl mb-3 opacity-50">+</div>
            <p className="text-base mb-1 font-medium">No days yet</p>
            <p className="text-sm text-gray-400">Paste text, load an itinerary, or add days manually</p>
          </div>
        )
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{days.length}</span> days
              {' · '}
              <span className="font-semibold text-gray-700">{config.pax}</span> pax
              {' · '}
              <span className="font-semibold text-gray-700 capitalize">{config.tier}</span>
              {config.itineraryCode && (
                <>
                  {' · '}
                  <span className="font-semibold text-green-700">{config.itineraryCode}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={expandAll} className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                Expand All
              </button>
              <span className="text-gray-300">|</span>
              <button onClick={collapseAll} className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                Collapse All
              </button>
            </div>
          </div>

          {/* Day Cards */}
          <div className="space-y-2">
            {days.map(day => (
              <DayRow
                key={day.id}
                day={day}
                allDays={days}
                config={config}
                rates={rates || {} as AllRates}
                onToggleExpand={() => toggleExpand(day.id)}
                onUpdateSlot={(slotId, value) => updateSlot(day.id, slotId, value)}
                onUpdateDay={(partial) => updateDay(day.id, partial)}
                onRemoveDay={() => removeDay(day.id)}
              />
            ))}
          </div>

          {/* Grand Summary + Save */}
          <GridSummary
            totals={totals}
            config={config}
            dayCount={days.length}
            unpricedGuideBedDays={config.guideMode === 'throughout' ? throughoutGuide.unpricedBedDays : []}
            onSave={handleSave}
            isSaving={isSaving}
            savedItineraryId={config.itineraryId}
            savedItineraryCode={config.itineraryCode}
            savedQuoteId={savedQuoteId}
            savedQuoteNumber={savedQuoteNumber}
            saveMessage={saveMessage}
          />
        </>
      )}
    </div>
  )
}
