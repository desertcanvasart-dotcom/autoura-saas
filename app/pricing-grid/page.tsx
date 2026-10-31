'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { todayLocal } from '@/lib/today'
import { useSearchParams, useRouter } from 'next/navigation'
import type { GridConfig, GridDay, AllRates, SlotValue, GridTotals } from './types'
import { SLOT_DEFINITIONS } from './types'
import { calculateGrandTotals, calculateDay, convertAmount } from './lib/calculator'
import { getCurrencySymbol } from '@/lib/currency'
import { buildGuideRateIndex, computeThroughoutGuideExtras } from './lib/throughout-guide'
import { mapServicesToSlots } from './lib/slot-mapping'
import { parsedDaysToGrid } from './lib/parsed-days'
import { hydrateDayRates } from './lib/hydrate-rates'
import { repickVehicles } from './lib/option-filters'
import { optionItems, cruiseForTier, hotelForTier } from './lib/option-item'
import { linkParsedTransport, transportTypeWarnings } from './lib/parsed-transport'
import { applyPackageToDays, describeRemoved } from './lib/package-apply'
import { PACKAGE_TYPE_CONFIGS, type PackageType } from '@/lib/package-types'
import { applyBlockToGridDay, type GridBlock } from '@/lib/day-blocks/grid-apply'
import type { DayMatch } from '@/lib/day-blocks/match'
import SaveAsBlockDialog from '@/components/day-blocks/SaveAsBlockDialog'
import { preParseRawItinerary } from '@/lib/ai/parsing-utils'
import type { BlockNote } from './components/DayRow'
import GridHeader from './components/GridHeader'
import ClientInfoBar from './components/ClientInfoBar'
import { alignGuideLanguage, guideLanguages, majorityGuideLanguage } from './lib/guide-language'
import InputPanel from './components/InputPanel'
import DayRow from './components/DayRow'
import GridSummary from './components/GridSummary'
import { showToast } from '@/app/contexts/ToastContext'
import { useTenant } from '@/app/contexts/TenantContext'
import type { ExchangeRate } from '@/lib/currency'
import { displayRate } from './lib/display-rate'
import { takeConversation } from '@/lib/grid-handoff'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { readbackDays, readbackText } from './lib/readback'
import { isStructuredItinerary, parseStructuredItinerary, readStructuredHeader, itineraryTemplate, namesList } from './lib/structured-itinerary'
import type { LibraryGap, WrittenSource } from './components/DayRow'

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
  clientSource: null,
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
  const guideLanguageList = useMemo(() => guideLanguages(rates?.guide ?? []), [rates])
  // The agency's day blocks (Settings → Day blocks); empty until imported.
  const [blocks, setBlocks] = useState<GridBlock[]>([])
  // May this user add to the catalog ("Save as a block")?
  const [canWriteBlocks, setCanWriteBlocks] = useState(false)
  const [savingBlockDayId, setSavingBlockDayId] = useState<string | null>(null)
  // Per day: what the last block laid on it left for the operator to pick.
  const [blockNotes, setBlockNotes] = useState<Record<string, BlockNote>>({})
  const [loading, setLoading] = useState(true)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null)
  // The selling total as last saved (or loaded), so the Update button can
  // show what a re-save changes. Only meaningful while config.itineraryId is set.
  const [savedSellingTotal, setSavedSellingTotal] = useState<number | null>(null)
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

  // The company's pricing defaults (Settings › Pricing defaults and
  // Currencies, migration 456) start a fresh grid: tier, markup, currency.
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
        const res = await fetch('/api/settings/pricing')
        const data = await res.json()
        if (data.success && data.data) {
          const prefs = data.data
          setConfig(prev => ({
            ...prev,
            tier: prefs.default_tier || prev.tier,
            marginPercent: prefs.default_margin_percent ?? prev.marginPercent,
            currency: prefs.default_quote_currency || prev.currency,
          }))
        }
      } catch (err) {
        console.error('Failed to load the pricing defaults:', err)
      }
    }
    loadPrefs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch rates. A tier or date change starts a new request while an older
  // one may still be in flight; only the latest may land — a late answer for
  // the old tier put that tier's hotels in the list (operator, 2026-10-10:
  // the budget hotel missing on one device). The tier the rates were fetched
  // for travels with them, so the hotel swap below never reads another tier's.
  const ratesRequestRef = useRef(0)
  const [ratesTier, setRatesTier] = useState<string | null>(null)
  const fetchRates = useCallback(async (tier: string, startDate: string, mode: 'missing' | 'all' = 'missing') => {
    const requestId = ++ratesRequestRef.current
    try {
      setLoading(true)
      const params = new URLSearchParams({ tier })
      if (startDate) params.set('date', startDate)
      const res = await fetch(`/api/pricing-grid/rates?${params}`)
      const data = await res.json()
      if (requestId !== ratesRequestRef.current) return
      if (data.success) {
        setRates(data.data)
        setRatesTier(tier)
        // A draft restored from this browser may hold items with no price, or
        // water as a hidden amount (hydrate-rates.ts) — fill them from the rates.
        // After a save that repriced ('all'), every item takes today's rate.
        setDays(prev => hydrateDayRates(prev, data.data, mode).days)
      }
    } catch (err) {
      console.error('Failed to fetch rates:', err)
    } finally {
      if (requestId === ratesRequestRef.current) setLoading(false)
    }
  }, [])

  // A new start date can fall in another rate period: the hotels and cruises
  // already picked take that period's rates ('all'), as the save would. They
  // kept the old period's price on screen until the save repriced them.
  const prevStartRef = useRef(config.startDate)
  useEffect(() => {
    const dateChanged = prevStartRef.current !== config.startDate
    prevStartRef.current = config.startDate
    fetchRates(config.tier, config.startDate, dateChanged ? 'all' : undefined)
  }, [config.tier, config.startDate, fetchRates])

  // Auto-swap accommodation and cruise when tier changes
  // Runs on the rates OF the new tier (ratesTier), never on a list still
  // held from the old one. A tier set by opening a saved itinerary is not a
  // change: that itinerary's hotels are its own (loadItinerary sets the ref).
  const prevTierRef = useRef(config.tier)
  useEffect(() => {
    if (!rates || !ratesTier || ratesTier !== config.tier) return
    // Only run when tier actually changed (not on initial load)
    if (prevTierRef.current === ratesTier) return
    prevTierRef.current = ratesTier
    if (days.length === 0) return

    setDays(prevDays => prevDays.map(day => ({
      ...day,
      slots: day.slots.map(slot => {
        // Swap accommodation: match by city
        if (slot.slotId === 'accommodation' && slot.selectedItems.length > 0) {
          // The same hotel in the new tier when it has it (option-item.ts).
          const newHotel = hotelForTier(slot.selectedItems[0], day.city, (rates as AllRates).accommodation)
          // With its single supplement, as a pick in the row makes it.
          if (newHotel) return { ...slot, selectedItems: optionItems('accommodation', newHotel) }
          // No hotel in new tier for this city — clear selection
          return { ...slot, selectedItems: [] }
        }

        // Swap cruise: the same ship in the new tier, else one from the
        // day's city, else the tier's first (option-item.ts).
        if (slot.slotId === 'cruise' && slot.selectedItems.length > 0) {
          const newCruise = cruiseForTier(slot.selectedItems[0], day.city, (rates as AllRates).cruise)
          if (newCruise) return { ...slot, selectedItems: optionItems('cruise', newCruise) }
          return { ...slot, selectedItems: [] }
        }

        return slot
      }),
    })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, ratesTier])

  // The vehicle follows the group: a change of travellers moves every picked
  // route to the vehicle that seats them (option-filters.ts), as the list and
  // the B2B rate sheet already do. Nothing moves when nothing needs to.
  useEffect(() => {
    const routes = rates?.route
    if (!routes?.length) return
    setDays(prev => repickVehicles(prev, routes, config.pax))
  }, [config.pax, rates])

  // The rates, once; the display currency converts from the run currency
  // (display-rate.ts). A currency with no rate goes back to the run currency
  // rather than show its symbol on unconverted amounts.
  const { tenant } = useTenant()
  const runCurrency = (tenant as { rates_currency?: string | null } | null)?.rates_currency || 'EUR'
  const [fxRates, setFxRates] = useState<ExchangeRate[] | null>(null)
  useEffect(() => {
    fetch('/api/exchange-rates')
      .then(r => r.json())
      .then(d => setFxRates(d?.success && Array.isArray(d.data) ? d.data : []))
      .catch(() => setFxRates([]))
  }, [])
  useEffect(() => {
    const buffer = Number((tenant as { conversion_buffer_percent?: number | null } | null)?.conversion_buffer_percent ?? 0)
    const shown = displayRate(runCurrency, config.currency, fxRates, buffer)
    if (shown.ok) {
      if (config.exchangeRate !== shown.rate) setConfig(prev => ({ ...prev, exchangeRate: shown.rate }))
    } else if (shown.reason !== 'loading') {
      showToast('error', shown.reason)
      setConfig(prev => ({ ...prev, currency: runCurrency, exchangeRate: null }))
    }
  }, [config.currency, config.exchangeRate, runCurrency, fxRates, tenant])

  // --- URL Params: Auto-load conversation from inbox redirect ---
  const searchParams = useSearchParams()
  const hasProcessedParams = useRef(false)
  const pendingParseText = useRef<string | null>(null)

  // Effect 1: Decode URL params and store text for parsing
  useEffect(() => {
    if (hasProcessedParams.current) return
    // ?handoff=<id>: the conversation waits in sessionStorage (grid-handoff.ts);
    // ?conversation= (base64) is the older way, still read.
    const handoffParam = searchParams?.get('handoff')
    const handedOff = handoffParam ? takeConversation(handoffParam) : null
    const conversationParam = handedOff ?? searchParams?.get('conversation')
    if (!conversationParam) {
      // No conversation: "New booking" from a client's page (?clientId=) or
      // "New quote" from the quotes lists (?type=b2b|b2c) — a fresh grid for
      // that client / audience.
      const clientIdOnly = searchParams?.get('clientId')
      const typeParam = searchParams?.get('type')
      if (!clientIdOnly && typeParam !== 'b2b' && typeParam !== 'b2c') return
      hasProcessedParams.current = true
      setDays([])
      setSaveMessage(null)
      setSavedQuoteId(null)
      setSavedQuoteNumber(null)
      clearStorage()
      setConfig(prev => ({
        ...DEFAULT_CONFIG,
        currency: prev.currency,
        exchangeRate: prev.exchangeRate,
        ...(typeParam === 'b2b' || typeParam === 'b2c' ? { clientType: typeParam } : {}),
        clientId: clientIdOnly || null,
      }))
      window.history.replaceState({}, '', '/pricing-grid')
      if (clientIdOnly) {
        fetch(`/api/clients/${clientIdOnly}`)
          .then(r => (r.ok ? r.json() : null))
          .then(c => {
            if (!c?.id) return
            setConfig(prev => ({
              ...prev,
              clientId: c.id,
              clientName: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
              clientEmail: c.email || '',
              clientPhone: c.phone || '',
              nationality: c.nationality && c.nationality !== 'Unknown' ? c.nationality : prev.nationality,
            }))
          })
          .catch(() => showToast('error', 'Could not load the client'))
      }
      return
    }
    hasProcessedParams.current = true

    // Decode conversation (handle both standard and URL-safe base64)
    const isBase64 = !handedOff && searchParams?.get('encoded') === 'base64'
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
    const clientIdParam = searchParams?.get('clientId')
    const sourceParam = searchParams?.get('source')
    setConfig(prev => ({
      ...prev,
      clientEmail: emailParam || '',
      clientPhone: phoneParam || '',
      clientName: clientNameParam || '',
      // The CRM client the inbox already knows this person as.
      clientId: clientIdParam || null,
      clientSource: sourceParam === 'email' || sourceParam === 'whatsapp' ? sourceParam : null,
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

  // --- Day blocks ---
  useEffect(() => {
    let live = true
    fetch('/api/day-blocks')
      .then(res => res.json())
      .then(json => {
        if (!live || !json?.success) return
        setBlocks((json.data.blocks as (GridBlock & { is_active: boolean })[]).filter(b => b.is_active))
        setCanWriteBlocks(json.data.canWrite === true)
      })
      // No library (or no table yet): the Grid simply offers no blocks.
      .catch(() => {})
    return () => { live = false }
  }, [])

  const blockSummary = (code: string, filled: string[], toPick: string[]) =>
    `${code}: ${filled.length ? filled.join(', ') : 'nothing priced'}${toPick.length ? ` — ${toPick.length} to pick yourself` : ''}`

  const addDayFromBlock = (block: GridBlock) => {
    if (!rates) return
    const fresh = createEmptyDay(days.length + 1)
    const { day, filled, toPick } = applyBlockToGridDay(fresh, block, rates, config.pax, { guideLanguage: tripGuideLanguage() })
    setDays(prev => [...prev, { ...day, dayNumber: prev.length + 1, isExpanded: true }])
    setBlockNotes(prev => ({ ...prev, [day.id]: { kind: 'applied', code: block.code, by: 'manual', toPick } }))
    showToast(toPick.length ? 'warning' : 'success', `Day ${days.length + 1} from ${blockSummary(block.code, filled, toPick)}`)
  }

  const applyBlockToDay = (dayId: string, block: GridBlock) => {
    const target = days.find(d => d.id === dayId)
    if (!rates || !target) return
    const { day, filled, toPick } = applyBlockToGridDay(target, block, rates, config.pax, { guideLanguage: tripGuideLanguage() })
    setDays(prev => prev.map(d => (d.id === dayId ? day : d)))
    setBlockNotes(prev => ({ ...prev, [dayId]: { kind: 'applied', code: block.code, by: 'manual', toPick } }))
    showToast(toPick.length ? 'warning' : 'success', `Day ${target.dayNumber} ← ${blockSummary(block.code, filled, toPick)}`)
  }

  // A day kept as a new block: it joins the catalog, and the day is now from it.
  const blockSaved = (dayId: string, block: GridBlock) => {
    setBlocks(prev => [...prev.filter(b => b.code !== block.code), block].sort((a, b) => a.code.localeCompare(b.code)))
    setDays(prev => prev.map(d => (d.id === dayId ? { ...d, blockCode: block.code } : d)))
    setBlockNotes(prev => { const next = { ...prev }; delete next[dayId]; return next })
    setSavingBlockDayId(null)
    showToast('success', `Saved to your catalog as day block ${block.code}`)
  }

  // The trip's guide language: the header's choice, else the one most days' guides speak.
  const tripGuideLanguage = () =>
    config.guideLanguage || (rates ? majorityGuideLanguage(days, rates.guide) : null)

  // The header's guide language changed: every day's guide moves to it.
  const changeConfig = (next: GridConfig) => {
    if (rates && next.guideLanguage && next.guideLanguage !== config.guideLanguage) {
      const { days: aligned, changed, unmatched } = alignGuideLanguage(days, rates.guide, next.guideLanguage)
      if (changed.length) setDays(aligned)
      if (unmatched.length) {
        showToast('warning', `No ${next.guideLanguage} guide in the city of day ${unmatched.join(', ')} — those days keep their guide.`)
      } else if (changed.length) {
        showToast('success', `${next.guideLanguage} guide on day ${changed.join(', ')}`)
      }
    }
    setConfig(next)
  }

  const removeDay = (dayId: string) => {
    setDays(prev => prev.filter(d => d.id !== dayId).map((d, i) => ({ ...d, dayNumber: i + 1 })))
  }

  const toggleExpand = (dayId: string) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, isExpanded: !d.isExpanded } : d))
  }

  const expandAll = () => setDays(prev => prev.map(d => ({ ...d, isExpanded: true })))
  const collapseAll = () => setDays(prev => prev.map(d => ({ ...d, isExpanded: false })))

  // Jump to a day from the day bar: open it and bring it into view.
  const jumpToDay = (dayId: string) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, isExpanded: true } : d))
    requestAnimationFrame(() =>
      document.getElementById(`grid-day-${dayId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // Copy one service to every day (offered on Water, a daily item).
  const applySlotToAllDays = (slotId: string, value: SlotValue) => {
    const copy = (): SlotValue => ({ ...value, slotId, selectedItems: value.selectedItems.map(i => ({ ...i })) })
    setDays(prev => prev.map(d => ({
      ...d,
      slots: d.slots.some(s => s.slotId === slotId)
        ? d.slots.map(s => (s.slotId === slotId ? copy() : s))
        : [...d.slots, copy()],
    })))
    showToast('success', `Applied to all ${days.length} days`)
  }

  const updateDay = (dayId: string, partial: Partial<GridDay>) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, ...partial } : d))
  }

  // --- Write descriptions (lib/ai/day-writer.ts) ---
  // From what each day sells and the agency's Content Library, in its
  // Writing Rules. 'fill' writes only days with no description; 'rewrite'
  // replaces the days named. The text lands on the days; the save stores it.
  const dialog = useConfirmDialog()
  const [writing, setWriting] = useState<'all' | number | null>(null)
  const [writtenFrom, setWrittenFrom] = useState<Record<number, WrittenSource[]>>({})
  const [libraryMissing, setLibraryMissing] = useState<LibraryGap[]>([])
  // What the parser wants the operator to know (a named hotel saved under
  // another tier, a transport rate whose type contradicts its route …).
  const [parseNotes, setParseNotes] = useState<string[]>([])
  // After a parse: the grid read back as lines, to check the reading at a glance.
  const [showReadback, setShowReadback] = useState(false)
  const readback = useMemo(() => (showReadback ? readbackDays(days) : []), [showReadback, days])
  const [offerWrite, setOfferWrite] = useState(false)
  const writeDescriptions = async (mode: 'fill' | 'rewrite', dayNumbers?: number[]) => {
    if (writing !== null || days.length === 0) return
    setWriting(dayNumbers?.length === 1 ? dayNumbers[0] : 'all')
    setOfferWrite(false)
    try {
      const res = await fetch('/api/pricing-grid/write-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, tier: config.tier, tourName: config.tourName, pax: config.pax, mode, dayNumbers }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        showToast('error', data.error || 'Could not write the descriptions')
        return
      }
      const written = (data.data?.written ?? []) as Array<{ dayNumber: number; title: string; description: string; sources: WrittenSource[] }>
      if (written.length === 0) {
        showToast('info', data.data?.note || 'Nothing to write')
        return
      }
      const byDay = new Map(written.map(w => [w.dayNumber, w]))
      setDays(prev => prev.map(d => {
        const w = byDay.get(d.dayNumber)
        return w ? { ...d, title: w.title, description: w.description } : d
      }))
      setWrittenFrom(prev => ({ ...prev, ...Object.fromEntries(written.map(w => [w.dayNumber, w.sources])) }))
      const writtenDays = new Set(written.map(w => w.dayNumber))
      setLibraryMissing(prev => [
        ...prev.filter(m => !writtenDays.has(m.dayNumber)),
        ...((data.data?.missing ?? []) as LibraryGap[]),
      ])
      showToast('success', `Wrote ${written.length} day${written.length === 1 ? '' : 's'} from your Content Library`)
    } catch {
      showToast('error', 'Could not write the descriptions')
    } finally {
      setWriting(null)
    }
  }
  const rewriteDay = async (day: GridDay) => {
    if (day.description.trim() && !(await dialog.confirm({
      title: `Rewrite day ${day.dayNumber}?`,
      message: 'Its title and description are replaced with new text from your Content Library.',
      confirmText: 'Rewrite',
    }))) return
    await writeDescriptions('rewrite', [day.dayNumber])
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
    setBlockNotes({})
    setConfig(DEFAULT_CONFIG)
    clearStorage()
    setSaveMessage(null)
  }

  // --- Day blocks for a parsed itinerary ---
  const matchParsedDaysToBlocks = async (text: string, parsed: GridDay[], pax: number, guideLanguage: string | null) => {
    if (!rates) return
    try {
      // The day's own words, when the text is split into D1 / Day 1 parts.
      const segments = preParseRawItinerary(text)
      const rawFor = (n: number) => (segments.length > 1 ? segments.find(s => s.dayNumber === n)?.rawContent ?? null : null)
      const res = await fetch('/api/day-blocks/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: parsed.map(d => ({ dayNumber: d.dayNumber, title: d.title, city: d.city, description: d.description, raw: rawFor(d.dayNumber) })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'matching failed')
      const matches: DayMatch[] = json.data.matches
      const byCode = new Map(blocks.map(b => [b.code, b]))
      const byNumber = new Map(parsed.map(d => [d.dayNumber, d]))
      const applied = new Map<string, GridDay>()
      const notes: Record<string, BlockNote> = {}
      for (const m of matches) {
        const day = byNumber.get(m.dayNumber)
        if (!day) continue
        const block = m.code ? byCode.get(m.code) : undefined
        if (block && m.confidence === 'high') {
          const result = applyBlockToGridDay(day, block, rates, pax, { guideLanguage })
          applied.set(day.id, result.day)
          notes[day.id] = { kind: 'applied', code: block.code, by: m.by === 'shorthand' ? 'shorthand' : 'ai', toPick: result.toPick, reason: m.reason }
        } else if (block) {
          notes[day.id] = { kind: 'suggested', code: block.code, toPick: [], reason: m.reason }
        } else {
          notes[day.id] = { kind: 'unmatched', code: null, toPick: [], reason: m.reason }
        }
      }
      // Only the days still there: the operator may have edited meanwhile.
      setDays(prev => prev.map(d => applied.get(d.id) ?? d))
      setBlockNotes(prev => ({ ...prev, ...notes }))
      const count = (k: BlockNote['kind']) => Object.values(notes).filter(n => n.kind === k).length
      const unmatched = count('unmatched'), suggested = count('suggested')
      showToast(unmatched || suggested ? 'warning' : 'success',
        `Day blocks: ${count('applied')} of ${parsed.length} day(s) built from your blocks` +
        (suggested ? `, ${suggested} to confirm` : '') +
        (unmatched ? `, ${unmatched} with no block (check the AI's reading)` : ''))
    } catch (err) {
      console.error('Matching days to blocks:', err)
      showToast('info', "Couldn't match the days to your day blocks — the days show the AI's reading.")
    }
  }

  // --- Parse Text via AI ---
  // A package change applies to the days already built: what the new
  // package does not sell is removed, after the operator agrees to it
  // (package-apply.ts). It only used to steer the next parse.
  const changePackageType = async (p: PackageType) => {
    const pkg = PACKAGE_TYPE_CONFIGS.find(c => c.slug === p)
    if (pkg && days.length > 0) {
      const result = applyPackageToDays(days, pkg)
      const what = describeRemoved(result.removed)
      if (what) {
        const ok = await dialog.confirm({
          title: `Switch to ${pkg.name}?`,
          message: `${pkg.name} does not include them, so ${what} will be removed from this trip.`,
          confirmText: 'Switch and remove',
          cancelText: 'Keep the current package',
          variant: 'warning',
        })
        if (!ok) return
        setDays(result.days)
      }
    }
    setConfig(prev => ({ ...prev, packageType: p }))
  }

  // The format's text names this tier's rates: when it asks for another
  // tier, that tier's list is fetched first, and the tier switch is not
  // treated as a change (its hotels are already the ones written).
  const readStructuredText = async (text: string) => {
    const header = readStructuredHeader(text)
    let list = rates as AllRates
    const tier = header.tier && header.tier !== config.tier ? header.tier : null
    if (tier) {
      const params = new URLSearchParams({ tier })
      const startDate = header.startDate ?? config.startDate
      if (startDate) params.set('date', startDate)
      const data = await fetch(`/api/pricing-grid/rates?${params}`).then(r => r.json()).catch(() => null)
      if (!data?.success) { showToast('error', `Could not load your ${tier} rates`); return }
      list = data.data
      prevTierRef.current = tier
    }
    const { days: read, unmatched } = parseStructuredItinerary(text, list, header.pax ?? config.pax, () => crypto.randomUUID())
    setDays(read)
    setShowReadback(read.length > 0)
    setParseNotes([...unmatched, ...transportTypeWarnings(read, list.route)])
    setWrittenFrom({})
    setLibraryMissing([])
    setOfferWrite(read.length > 0)
    setConfig(prev => ({
      ...prev,
      ...(header.packageType && { packageType: header.packageType }),
      ...(tier && { tier }),
      ...(header.pax && { pax: header.pax }),
      ...(header.startDate && { startDate: header.startDate }),
    }))
    setSaveMessage(`Read from your itinerary format — ${read.length} day${read.length === 1 ? '' : 's'}, matched by name, no AI used`)
  }

  const formatTemplate = () => {
    const pkg = PACKAGE_TYPE_CONFIGS.find(c => c.slug === config.packageType)
    return itineraryTemplate(rates, { packageName: pkg?.name, tier: config.tier, pax: config.pax, startDate: config.startDate })
  }

  const handleParseDays = async (text: string) => {
    try {
      setIsParsing(true)
      setSaveMessage(null)
      // Clear old data immediately so the loading indicator shows
      // and the user knows a fresh parse is starting
      setDays([])
      setBlockNotes({})
      setParseNotes([])
      setShowReadback(false)
      setConfig(prev => ({ ...prev, itineraryId: null, itineraryCode: null }))
      // Written in the agency's format: read here, by name, without the AI
      // (structured-itinerary.ts) — exact, instant, and free.
      if (rates && isStructuredItinerary(text)) {
        await readStructuredText(text)
        return
      }
      const res = await fetch('/api/pricing-grid/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tier: config.tier, pax: config.pax, package_type: config.packageType, start_date: config.startDate || null })
      })
      const data = await res.json()
      if (data.success && data.days) {
        const parsedPax = Number(data.metadata?.pax) > 0 ? Number(data.metadata.pax) : config.pax
        // The parser picks transport ROWS; the grid lists routes by vehicle —
        // linked here, at the vehicle for the party (parsed-transport.ts).
        const parsedDays: GridDay[] = rates
          ? linkParsedTransport(parsedDaysToGrid(data.days, () => crypto.randomUUID()), rates.route, parsedPax)
          : parsedDaysToGrid(data.days, () => crypto.randomUUID())
        // The parser's prices are its own derivation (a seasonal hotel came in
        // at 0); the grid's rate list is the authority (hydrate-rates.ts).
        let hydrated = rates ? hydrateDayRates(parsedDays, rates, 'all').days : parsedDays
        // One guide language for the trip: the one set in the header, else
        // the one most days came back with (guide-language.ts).
        const guideLanguage = rates ? (config.guideLanguage || majorityGuideLanguage(hydrated, rates.guide)) : null
        if (rates && guideLanguage) {
          hydrated = alignGuideLanguage(hydrated, rates.guide, guideLanguage).days
          if (!config.guideLanguage) setConfig(prev => ({ ...prev, guideLanguage }))
        }
        setDays(hydrated)
        setShowReadback(hydrated.length > 0)
        setParseNotes([
          ...(Array.isArray(data.notes) ? data.notes.map(String) : []),
          ...(rates ? transportTypeWarnings(hydrated, rates.route) : []),
        ])
        // The parse wrote its own brief descriptions: offer the library's.
        setWrittenFrom({})
        setLibraryMissing([])
        setOfferWrite(hydrated.length > 0)
        // Which of the agency's day blocks is each day? The blocks then supply
        // the services (lib/day-blocks/match.ts); the AI's reading stays only
        // where no block fits, and is flagged.
        if (rates && blocks.length > 0) {
          void matchParsedDaysToBlocks(text, hydrated, data.metadata?.pax ?? config.pax, guideLanguage)
        }
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
          // The email and phone the AI found (asked for, then dropped here).
          // The office's own address is filtered at the save (own-address).
          ...(meta?.clientEmail && !prev.clientEmail && { clientEmail: String(meta.clientEmail).trim() }),
          ...(meta?.clientPhone && !prev.clientPhone && { clientPhone: String(meta.clientPhone).trim() }),
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
      // The itinerary's tier comes with its own hotels: not a change to swap for.
      prevTierRef.current = itn.tier || 'standard'
      // Nor is its date a change: its lines keep the prices they were saved at.
      if (itn.start_date) prevStartRef.current = itn.start_date

      // Update config from itinerary
      setConfig(prev => ({
        ...prev,
        clientName: itn.client_name || '',
        clientEmail: itn.client_email || '',
        clientPhone: itn.client_phone || '',
        // Keep the itinerary's CRM client, so a re-save stays linked.
        clientId: itn.client_id || null,
        clientSource: null,
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
        // The trip's own pricing settings, so a re-save prices it as it was
        // priced — reopening reset the margin, passport and nationality to
        // whatever the last trip had.
        ...(itn.margin_percent != null ? { marginPercent: Number(itn.margin_percent) } : {}),
        ...(itn.is_euro_passport != null ? { passport: itn.is_euro_passport ? 'eu' as const : 'non_eu' as const } : {}),
        ...(itn.nationality ? { nationality: itn.nationality } : {}),
        itineraryId: itn.id,
        itineraryCode: itn.itinerary_code,
        // A saved trip's guides are its own; the language follows them
        // (guide-language.ts), not the last trip's choice.
        guideLanguage: '',
      }))
      setSavedSellingTotal(typeof itn.total_cost === 'number' ? itn.total_cost : Number(itn.total_cost) || null)

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
            blockCode: dayData.block_code ?? null,
            overnight: dayData.overnight ?? undefined,
            hasSightseeing: dayData.has_sightseeing ?? undefined,
            airportArrival: dayData.airport_arrival ?? undefined,
            airportDeparture: dayData.airport_departure ?? undefined,
            hotelCheckIn: dayData.hotel_check_in ?? undefined,
            hotelCheckOut: dayData.hotel_check_out ?? undefined,
            intercity: dayData.intercity ?? undefined,
          }
        })
        // The guide as it was saved: a priced trip with no guide line was
        // saved with No Guide, and the throughout guide leaves its tagged
        // bed / meal / seat lines. Reopening reset both to the defaults.
        const allServices = (daysData.data as Array<{ services?: Array<{ description?: string | null }> }>).flatMap(d => d.services || [])
        if (allServices.length > 0) {
          const hasGuide = loadedDays.some(d => d.slots.some(sl => sl.slotId === 'guide' && (sl.selectedItems.length > 0 || sl.customAmount > 0)))
          const throughout = allServices.some(sv => String(sv.description ?? '').includes('[pricing-grid:throughout_guide]'))
          setConfig(prev => ({ ...prev, withGuide: hasGuide || throughout, guideMode: throughout ? 'throughout' : 'spot' }))
        }
        // A saved line with no price (rate_eur defaults to 0) takes the rate
        // list's; priced lines keep the price they were saved at.
        setDays(rates ? hydrateDayRates(loadedDays, rates, 'missing').days : loadedDays)
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
        // The picks only: the save prices them from the rates as they are now
        // and works out the totals and the throughout guide itself.
        body: JSON.stringify({ config, days })
      })

      const data = await res.json()

      if (data.success) {
        // What the save changed: an office address offered as the client's
        // was dropped; a rate changed since it was picked was saved at
        // today's figure; a line with no current rate kept its price.
        if (Array.isArray(data.warnings)) for (const w of data.warnings as string[]) showToast('error', w)
        setConfig(prev => ({
          ...prev,
          itineraryId: data.itineraryId,
          itineraryCode: data.itineraryCode,
          clientId: data.clientId ?? prev.clientId,
          ...(data.clientEmailDropped ? { clientEmail: '' } : {}),
        }))
        // The trip was saved at today's rates: show them, so the grid's total
        // is the one stored.
        if (data.repricedLines > 0) fetchRates(config.tier, config.startDate, 'all')
        if (typeof data.sellingTotal === 'number') setSavedSellingTotal(data.sellingTotal)

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
                // The partner price list (b2b-rate-sheet.ts) is worked out by
                // the route from these picks, priced from today's rates.
                grid: { days, config },
              })
            })
            const quoteData = await quoteRes.json()
            // Incomplete pricing is refused, not saved with holes (harness:
            // deliverable only when complete). Say what is missing and stop.
            if (!quoteData.success) {
              const holes: { message: string }[] = quoteData.holes || []
              setSavedQuoteId(null)
              setSavedQuoteNumber(null)
              setSaveMessage(
                `Saved as ${data.itineraryCode} — B2B quote not created: ${quoteData.error || 'pricing failed'}` +
                (holes.length ? `\n• ${holes.map(h => h.message).join('\n• ')}` : '')
              )
              return
            }
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
              const verb = quoteData.data?.action === 'updated' ? 'B2B Quote updated' : 'B2B Quote'
              setSaveMessage(`Saved as ${data.itineraryCode} + ${verb} ${quoteNum || ''} — Redirecting to B2B Calculator...`)
              // Redirect to B2B calculator which has full Plus 0/Plus 1 pricing table
              setTimeout(() => {
                // On the quote just saved: the calculator's Save reprices it.
                router.push(`/b2b/calculator/${templateData.data.variation_id}${quoteId ? `?quote=${quoteId}` : ''}`)
              }, 1000)
            } else {
              setSaveMessage(`Saved as ${data.itineraryCode} + B2B Quote ${quoteNum || ''} (template creation: ${templateData.error || 'failed'})`)
            }
          } catch (quoteErr) {
            console.error('B2B quote/template creation error:', quoteErr)
            setSaveMessage(`Saved as ${data.itineraryCode} (B2B processing failed)`)
          }
        } else {
          // B2C: the save repriced the itinerary's open quote, or created one.
          setSavedQuoteId(data.quoteId ?? null)
          setSavedQuoteNumber(data.quoteNumber ?? null)
          const money = (n: number) => `${getCurrencySymbol(config.currency)}${convertAmount(n, config.exchangeRate).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          if (data.quoteAction === 'updated') {
            const before = typeof data.previousSellingTotal === 'number' ? data.previousSellingTotal : null
            setSaveMessage(
              `Saved ${data.itineraryCode} · quote ${data.quoteNumber} repriced` +
              (before !== null && Math.abs(before - data.sellingTotal) >= 0.01 ? `: ${money(before)} → ${money(data.sellingTotal)}` : ' (price unchanged)')
            )
          } else if (data.quoteAction === 'created') {
            setSaveMessage(`Saved as ${data.itineraryCode} + quote ${data.quoteNumber}`)
          } else {
            setSaveMessage(`Saved as ${data.itineraryCode}`)
          }
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
        <GridHeader config={config} onChange={changeConfig} totals={totals} guideLanguages={guideLanguageList} />
      </div>

      {/* Client Info */}
      <ClientInfoBar config={config} onChange={setConfig} />

      {/* Input Panel */}
      <InputPanel
        onParseDays={handleParseDays}
        formatTemplate={rates ? formatTemplate : undefined}
        namesList={rates ? () => namesList(rates) : undefined}
        onAddDay={addDay}
        blocks={rates ? blocks : []}
        onAddDayFromBlock={addDayFromBlock}
        onLoadItinerary={handleLoadItinerary}
        packageType={config.packageType ?? 'full-package'}
        onPackageTypeChange={changePackageType}
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
            {/* The plus was a decorative <div> — clicking it did nothing, so the
                "add days manually" hint pointed at a dead control. It is now the
                same addDay action as the toolbar button. */}
            <button
              type="button"
              onClick={addDay}
              className="inline-flex items-center justify-center w-14 h-14 mb-3 rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-colors"
              aria-label="Add a day"
            >
              <svg className="w-7 h-7" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <p className="text-base mb-1 font-medium text-gray-500">No days yet</p>
            <p className="text-sm text-gray-400">Add a day, paste text, or load an itinerary</p>
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
              <button
                onClick={() => writeDescriptions('fill')}
                disabled={writing !== null}
                title="Write the days that have no description, from your Content Library and Writing Rules"
                className="px-2.5 py-1 text-xs font-medium text-[#556B2F] hover:bg-[#556B2F]/10 rounded-md transition-colors disabled:opacity-50"
              >
                {writing === 'all' ? 'Writing…' : 'Write descriptions'}
              </button>
              <span className="text-gray-300">|</span>
              <button onClick={expandAll} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                Expand All
              </button>
              <span className="text-gray-300">|</span>
              <button onClick={collapseAll} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                Collapse All
              </button>
            </div>
          </div>

          {offerWrite && (
            <div className="mb-2 flex items-center justify-between gap-3 px-3 py-2 text-xs bg-[#556B2F]/5 border border-[#556B2F]/20 rounded-lg">
              <span className="text-gray-700">
                The days have the parser&apos;s brief descriptions. Write them from your Content Library, in your house style?
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => writeDescriptions('rewrite', days.map(d => d.dayNumber))}
                  className="px-2.5 py-1 font-medium text-white bg-[#556B2F] rounded-md hover:bg-[#465a26]">
                  Write descriptions
                </button>
                <button type="button" onClick={() => setOfferWrite(false)} className="text-gray-500 hover:underline">Not now</button>
              </span>
            </div>
          )}
          {parseNotes.length > 0 && (
            <div role="status" className="mb-2 px-3 py-2 text-xs bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
              <p className="font-medium mb-1">Check before pricing</p>
              <ul className="space-y-0.5 list-disc pl-4">
                {parseNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
          {showReadback && readback.length > 0 && (
            <details open className="mb-2 px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg text-gray-800">
              <summary className="cursor-pointer font-medium select-none">
                What I understood — check each day before pricing
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {readback.map(d => (
                  <div key={d.title}>
                    <p className="font-semibold text-gray-900">{d.title}</p>
                    <ul className="text-gray-700">
                      {d.lines.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  className="font-medium text-[#556B2F] hover:underline"
                  onClick={() => {
                    const pkg = PACKAGE_TYPE_CONFIGS.find(c => c.slug === config.packageType)
                    void navigator.clipboard?.writeText(readbackText(days, { packageName: pkg?.name, tier: config.tier, pax: config.pax, startDate: config.startDate }))
                      .then(() => showToast('success', 'Copied'), () => showToast('error', 'Could not copy'))
                  }}
                >
                  Copy as text
                </button>
                <button type="button" onClick={() => setShowReadback(false)} className="text-gray-500 hover:underline">Hide</button>
              </div>
            </details>
          )}
          {libraryMissing.length > 0 && (
            <details className="mb-2 px-3 py-2 text-xs bg-amber-50 border border-amber-200 rounded-lg">
              <summary className="cursor-pointer text-amber-900 font-medium">
                {libraryMissing.length} item{libraryMissing.length === 1 ? '' : 's'} not in your Content Library — the text for {libraryMissing.length === 1 ? 'it' : 'them'} is general
              </summary>
              <ul className="mt-1.5 space-y-0.5 text-amber-800">
                {libraryMissing.map((m, i) => (
                  <li key={`${m.dayNumber}-${m.kind}-${i}`}>Day {m.dayNumber}: {m.name} <span className="text-amber-600">({m.kind})</span></li>
                ))}
              </ul>
              <Link href="/settings/content-library" className="inline-block mt-1.5 text-amber-900 underline">Add them in the Content Library</Link>
            </details>
          )}

          {/* Day bar: every day at a glance, one click to jump to it */}
          <div className="sticky top-0 z-20 -mx-1 mb-2 px-1 py-1.5 bg-gray-50/95 backdrop-blur border-b border-gray-200">
            <div className="flex gap-1.5 overflow-x-auto">
              {days.map(day => {
                const perPerson = calculateDay(day, config).dailyPerPerson
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => jumpToDay(day.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      day.isExpanded
                        ? 'bg-[#556B2F] text-white border-[#556B2F]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#556B2F]'
                    }`}
                    title={day.title || `Day ${day.dayNumber}`}
                  >
                    <span className="font-semibold">Day {day.dayNumber}</span>
                    {day.city && <span className="opacity-80">{day.city}</span>}
                    <span className="tabular-nums opacity-80">
                      {getCurrencySymbol(config.currency)}{convertAmount(perPerson, config.exchangeRate).toFixed(0)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Day Cards */}
          <div className="space-y-3">
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
                onApplyToAllDays={applySlotToAllDays}
                blocks={rates ? blocks : []}
                onApplyBlock={(block) => applyBlockToDay(day.id, block)}
                blockNote={blockNotes[day.id]}
                onDismissBlockNote={() => setBlockNotes(prev => { const next = { ...prev }; delete next[day.id]; return next })}
                onSaveAsBlock={canWriteBlocks ? () => setSavingBlockDayId(day.id) : undefined}
                onRewriteDescription={() => rewriteDay(day)}
                rewriting={writing === day.dayNumber || writing === 'all'}
                writtenFrom={writtenFrom[day.dayNumber]}
              />
            ))}
          </div>

          {/* Save a day to the catalog as a new block */}
          {(() => {
            const idx = savingBlockDayId ? days.findIndex(d => d.id === savingBlockDayId) : -1
            if (idx < 0) return null
            const target = days[idx]
            return (
              <SaveAsBlockDialog
                key={target.id}
                day={target}
                nextDay={days[idx + 1] ?? null}
                takenCodes={blocks.map(b => b.code)}
                onClose={() => setSavingBlockDayId(null)}
                onSaved={(block) => blockSaved(target.id, block)}
              />
            )
          })()}

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
            savedSellingTotal={config.itineraryId ? savedSellingTotal : null}
          />
        </>
      )}
    </div>
  )
}
