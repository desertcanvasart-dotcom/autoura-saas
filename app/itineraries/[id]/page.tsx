'use client'

import { identityFromTenant, fetchLogoDataUrl } from '@/lib/company-identity'
import { todayLocal } from '@/lib/today'
import { useTenant } from '@/app/contexts/TenantContext'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Share2, ArrowLeft, FileText, Download, Send, Edit2, ChevronDown, ChevronUp, Receipt, Calculator, Settings, Check, X, Handshake, MoreHorizontal, BookOpen, AlertTriangle, Info, ClipboardList } from 'lucide-react'
import ResourceAssignmentV2 from '@/app/components/ResourceAssignmentV2'
import WhatsAppButton from '@/app/components/whatsapp/whatsapp-button'
import { generateWhatsAppMessage, generateWhatsAppLink, formatPhoneForWhatsApp } from '@/lib/communication-utils'
import AddExpenseFromItinerary from '@/components/AddExpenseFromItinerary'
import AssigneeSelect from '@/components/AssigneeSelect'
import ItineraryPL from '@/app/components/ItineraryPL'
import { createClient } from '@/app/supabase'
import GenerateDocumentsButton from '@/app/components/GenerateDocumentsButton'
import PDFPreviewModal from '@/app/components/PDFPreviewModal'
import ItineraryExpenses from '@/app/components/ItineraryExpenses'
import TripTimeline from '@/app/components/TripTimeline'
import TravellerChat from '@/app/components/TravellerChat'
import { showToast } from '@/app/contexts/ToastContext'
import ItineraryBookingAction from '@/components/ItineraryBookingAction'
import GenerateTasksButton from '@/components/tasks/GenerateTasksButton'
import { overnightProperty, overnightLabel } from '@/lib/itineraries/overnight-property'
import { effectiveItineraryTotal, resolveItineraryMargin, type PricedService } from '@/lib/itinerary-client-total'
import { normalizeItineraryForView, normalizeDaysForView } from '@/lib/itineraries/view-normalize'
import { serviceLabel, serviceTypeLabel, splitSystemNote } from '@/lib/itineraries/display'
import type { TripPnL } from '@/lib/trip-pnl'
import { defaultTab, nextAction, tripAttention, tripSteps, type AttentionAction, type PrimaryKind, type TabKey } from '@/lib/itineraries/trip-stage'
import HeaderMenu from '@/components/HeaderMenu'
import { useConfirmDialog } from '@/components/ConfirmDialog'

interface Itinerary {
  id: string
  itinerary_code: string
  client_id?: string
  client_name: string
  client_email: string
  client_phone: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  currency: string
  total_cost: number
  status: string
  notes: string
  /** A cruise that boards on a day its ship does not sail — a note, never a
   *  blocker (migration 382). Present only when the itinerary was loaded with
   *  its days. */
  cruise_sailing_notes?: string[]
  /** Team member who owns this itinerary (migration 272) — staff, not a supplier. */
  assigned_to: string | null
  assigned_guide_id: string
  assigned_vehicle_id: string
  guide_notes: string
  vehicle_notes: string
  pickup_location: string
  pickup_time: string
  cost_mode?: 'auto' | 'manual'
  tier?: string
  /** Nullable in the DB. 0 is legitimate (an at-cost trip) — do not `|| 25`. */
  margin_percent?: number | null
}

interface ItineraryDay {
  id: string
  day_number: number
  date: string
  city: string
  title: string
  description: string
  overnight_city: string
}

interface Service {
  id: string
  service_type: string
  service_name: string
  quantity: number
  rate_eur: number
  rate_non_eur: number
  total_cost: number
  notes: string
  /** Whether the night's hotel or ship is still in Rates (days API; staff only). */
  property_rate_status?: 'on_file' | 'switched_off' | 'not_on_file' | null
}

interface DayWithServices extends ItineraryDay {
  services: Service[]
}

interface ExistingInvoice {
  id: string
  invoice_number: string
  status: string
}

/** The page's four sections (step 3 of the itinerary page clean-up). */
const TABS: { key: TabKey; label: string }[] = [
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'operations', label: 'Operations' },
  { key: 'finance', label: 'Finance' },
  { key: 'messages', label: 'Messages' },
]
const isTab = (v: string | null): v is TabKey => TABS.some(t => t.key === v)

export default function ViewItineraryPage() {
  const { tenant } = useTenant()
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<DayWithServices[]>([])

  // The itinerary's OWN margin, not a constant. This was hardcoded to 25 while
  // the very same file already read margin_percent when persisting total_cost
  // (see handleSaveServiceCost below) — so an itinerary configured at 40% was
  // displayed, emailed and INVOICED at 25%: €10,000 of supplier cost quoted at
  // €12,500 instead of €14,000, losing €1,500 silently on every trip.
  //
  // `Number.isFinite` rather than `|| 25`: margin_percent is nullable, but 0 is
  // a legitimate value (an at-cost trip), and `0 || 25` would quietly resell it
  // at 25%.
  const marginPercent = useMemo(() => resolveItineraryMargin(itinerary?.margin_percent), [itinerary])

  // The stored itinerary.total_cost is a denormalized cache that can be 0/stale
  // (an itinerary priced via its services without the header being re-synced —
  // which is why the header read EUR 0.00 while Profit & Loss showed a price).
  // The services are the source of truth. Same function the email route uses
  // server-side (lib/itinerary-client-total.ts).
  const effectiveTotalCost = useMemo(
    () => effectiveItineraryTotal(
      { total_cost: itinerary?.total_cost ?? null, margin_percent: itinerary?.margin_percent },
      days.flatMap(day => (day.services || []) as PricedService[])
    ),
    [days, itinerary]
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null)
  const [pdfShowBreakdown, setPdfShowBreakdown] = useState(true)
  const [expenseRefreshTrigger, setExpenseRefreshTrigger] = useState(0)
  // The trip's real money so far (invoices, payments, expenses, commissions,
  // each in the trip's currency) — the Profit & Loss report's own figures
  // (lib/trip-pnl.ts), so the two never disagree.
  const [actualPnl, setActualPnl] = useState<TripPnL | null>(null)
  // The trip's booking, when there is one — for the header's link and stage.
  const [booking, setBooking] = useState<{ id: string; booking_number: string } | null>(null)
  // The ⋯ menu opens these dialogs; the components keep their own forms.
  const [expenseSignal, setExpenseSignal] = useState(0)
  const [tasksSignal, setTasksSignal] = useState(0)
  const [closingOut, setClosingOut] = useState(false)
  // The section shown: the one asked for in the address (?tab=), else the
  // one that fits where the trip is (lib/itineraries/trip-stage defaultTab).
  const [tabChoice, setTabChoice] = useState<TabKey | null>(null)
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('tab')
    if (isTab(asked)) setTabChoice(asked)
  }, [])
  const selectTab = (key: TabKey) => {
    setTabChoice(key)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', key)
    window.history.replaceState(window.history.state, '', url.toString())
  }
  const { confirm: confirmDialog } = useConfirmDialog()
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [existingInvoice, setExistingInvoice] = useState<ExistingInvoice | null>(null)
  const [generatingCommissions, setGeneratingCommissions] = useState(false)
  const [commissionResult, setCommissionResult] = useState<string | null>(null)
  
  // Cost Mode State
  const [costMode, setCostMode] = useState<'auto' | 'manual'>('auto')
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [editedCost, setEditedCost] = useState<string>('')
  const [savingCostMode, setSavingCostMode] = useState(false)
  const [savingServiceCost, setSavingServiceCost] = useState(false)
  const [costModeChanged, setCostModeChanged] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchItinerary()
      checkExistingInvoice()
    }
  }, [params.id])

  useEffect(() => {
    if (!params.id) return
    let live = true
    createClient()
      .from('bookings')
      .select('id, booking_number')
      .eq('itinerary_id', String(params.id))
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (live) setBooking(data ?? null) })
    return () => { live = false }
  }, [params.id, itinerary?.status])

  useEffect(() => {
    if (!params.id) return
    let live = true
    fetch(`/api/profit-loss?itineraryId=${params.id}`)
      .then(r => r.json())
      .then(json => { if (live && json?.success && Array.isArray(json.data)) setActualPnl((json.data[0] as TripPnL) ?? null) })
      // Without it the page shows the quoted figures only, as before.
      .catch(() => undefined)
    return () => { live = false }
  }, [params.id, expenseRefreshTrigger])

  const fetchItinerary = async () => {
    try {
      // include=days so the route can flag a cruise that boards on a day its
      // ship does not sail (cruise_sailing_notes) — a note, never a blocker.
      const itinResponse = await fetch(`/api/itineraries/${params.id}?include=days`)
      const itinData = await itinResponse.json()

      if (!itinData.success) {
        setError('Itinerary not found')
        setLoading(false)
        return
      }

      // Empty fields in their neutral form (a Pricing Grid itinerary can have
      // no client name) — the page reads them as plain strings and numbers.
      setItinerary(normalizeItineraryForView(itinData.data))
      setCostMode(itinData.data.cost_mode || 'auto')

      const daysResponse = await fetch(`/api/itineraries/${params.id}/days`)
      const daysData = await daysResponse.json()

      if (daysData.success) {
        setDays(normalizeDaysForView(daysData.data))
      }

      setLoading(false)
    } catch (err) {
      setError('Error loading itinerary')
      setLoading(false)
    }
  }

  const checkExistingInvoice = async () => {
    try {
      const response = await fetch(`/api/invoices?itineraryId=${params.id}`)
      if (response.ok) {
        const invoices = await response.json()
        if (invoices && invoices.length > 0) {
          setExistingInvoice(invoices[0])
        }
      }
    } catch (error) {
      console.error('Error checking existing invoice:', error)
    }
  }

  const handleToggleCostMode = async () => {
    const newMode = costMode === 'auto' ? 'manual' : 'auto'
    setSavingCostMode(true)
    
    try {
      const { error } = await supabase
        .from('itineraries')
        .update({ cost_mode: newMode })
        .eq('id', params.id as string)

      if (error) throw error

      setCostMode(newMode)
      setCostModeChanged(true)
      setTimeout(() => setCostModeChanged(false), 2000)
      
      if (itinerary) {
        setItinerary({ ...itinerary, cost_mode: newMode })
      }
    } catch (error) {
      console.error('Error updating cost mode:', error)
      showToast('error', 'Failed to update cost mode')
    } finally {
      setSavingCostMode(false)
    }
  }

  const handleStartEditCost = (service: Service) => {
    if (costMode !== 'manual') return
    setEditingServiceId(service.id)
    setEditedCost(service.total_cost.toString())
  }

  const handleCancelEditCost = () => {
    setEditingServiceId(null)
    setEditedCost('')
  }

  const handleSaveServiceCost = async (serviceId: string, dayId: string) => {
    const newCost = parseFloat(editedCost)
    if (isNaN(newCost) || newCost < 0) {
      showToast('error', 'Please enter a valid cost')
      return
    }

    setSavingServiceCost(true)
    
    try {
      const { error } = await supabase
        .from('itinerary_services')
        .update({ total_cost: newCost })
        .eq('id', serviceId)

      if (error) throw error

      setDays(prevDays => prevDays.map(day => {
        if (day.id === dayId) {
          return {
            ...day,
            services: day.services.map(s => 
              s.id === serviceId ? { ...s, total_cost: newCost } : s
            )
          }
        }
        return day
      }))

      // Sum the (supplier) service costs, then store the CLIENT/selling total in
      // total_cost — consistent with the grid save and how the header/invoice/PDF
      // consume the field (previously this persisted the raw supplier sum).
      let supplierSum = 0
      days.forEach(day => {
        day.services.forEach(s => {
          supplierSum += s.id === serviceId ? newCost : s.total_cost
        })
      })
      // Same source as the display, so the header and the stored cache can
      // never disagree about the margin.
      const newTotalCost = Math.round(supplierSum * (1 + marginPercent / 100) * 100) / 100

      await supabase
        .from('itineraries')
        .update({ total_cost: newTotalCost })
        .eq('id', params.id as string)

      if (itinerary) {
        setItinerary({ ...itinerary, total_cost: newTotalCost })
      }

      setEditingServiceId(null)
      setEditedCost('')
    } catch (error) {
      console.error('Error updating service cost:', error)
      showToast('error', 'Failed to update cost')
    } finally {
      setSavingServiceCost(false)
    }
  }
  const handleGenerateCommissions = async () => {
    if (!itinerary) return
    
    setGeneratingCommissions(true)
    try {
      const response = await fetch(`/api/itineraries/${itinerary.id}/generate-commissions`, {
        method: 'POST'
      })
      
      const result = await response.json()
      
      if (result.success) {
        setCommissionResult(`✅ ${result.message}`)
        setTimeout(() => setCommissionResult(null), 5000)
      } else {
        showToast('error', result.error || 'Failed to generate commissions')
      }
    } catch (error) {
      console.error('Error generating commissions:', error)
      showToast('error', 'Failed to generate commissions')
    } finally {
      setGeneratingCommissions(false)
    }
  }

  const handleGenerateInvoice = async () => {
    if (!itinerary) return

    if (existingInvoice) {
      router.push(`/invoices/${existingInvoice.id}`)
      return
    }

    setGeneratingInvoice(true)
    try {
      let clientId = itinerary.client_id || null
      
      if (!clientId) {
        const clientsResponse = await fetch('/api/clients')
        if (clientsResponse.ok) {
          const clientsData = await clientsResponse.json()
          const clients = clientsData.success ? clientsData.data : (Array.isArray(clientsData) ? clientsData : [])
          
          const matchingClient = clients.find((c: any) => {
            const clientEmail = c.email?.toLowerCase()
            const clientName = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()
            
            if (itinerary.client_email && clientEmail === itinerary.client_email.toLowerCase()) {
              return true
            }
            if (clientName.toLowerCase() === itinerary.client_name?.toLowerCase()) {
              return true
            }
            if (itinerary.client_phone && c.phone && c.phone.replace(/\D/g, '') === itinerary.client_phone.replace(/\D/g, '')) {
              return true
            }
            return false
          })
          
          if (matchingClient) {
            clientId = matchingClient.id
          }
        }
      }
  
      if (!clientId && itinerary.client_name) {
        const nameParts = itinerary.client_name.trim().split(' ')
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''
        
        const createClientResponse = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email: itinerary.client_email || '',
            phone: itinerary.client_phone || '',
            status: 'active',
            source: 'itinerary'
          })
        })
        
        if (createClientResponse.ok) {
          const newClientData = await createClientResponse.json()
          clientId = newClientData.data?.id || newClientData.id
        }
      }
  
      const lineItems = [{
        description: `${itinerary.trip_name} - ${itinerary.itinerary_code}`,
        quantity: 1,
        unit_price: effectiveTotalCost,
        amount: effectiveTotalCost
      }]
  
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          itinerary_id: itinerary.id,
          client_name: itinerary.client_name,
          client_email: itinerary.client_email,
          line_items: lineItems,
          subtotal: effectiveTotalCost,
          tax_rate: 0,
          tax_amount: 0,
          discount_amount: 0,
          total_amount: effectiveTotalCost,
          currency: itinerary.currency || 'EUR',
          issue_date: todayLocal(),
          due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          payment_terms: 'Payment due within 14 days',
          notes: `Trip dates: ${new Date(itinerary.start_date).toLocaleDateString()} - ${new Date(itinerary.end_date).toLocaleDateString()}`
        })
      })
  
      if (response.ok) {
        const invoice = await response.json()
        router.push(`/invoices/${invoice.id}`)
      } else {
        const error = await response.json()
        showToast('error', error.error || 'Failed to create invoice')
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      showToast('error', 'Failed to create invoice')
    } finally {
      setGeneratingInvoice(false)
    }
  }

  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  // A share link IS a send path: the API refuses drafts and non-deliverable
  // prices with the same gate as email/WhatsApp. Idempotent — clicking again
  // re-copies the one existing link.
  const handleShare = async () => {
    if (!itinerary) return
    setSharing(true)
    try {
      const res = await fetch(`/api/itineraries/${itinerary.id}/share`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        showToast('error', data.error || 'Could not create the share link')
        return
      }
      setShareUrl(data.url)
      await navigator.clipboard.writeText(data.url)
      showToast('success', 'Share link copied — send it to your client')
    } catch {
      showToast('error', 'Could not create the share link')
    } finally {
      setSharing(false)
    }
  }

  const handleRevokeShare = async () => {
    if (!itinerary) return
    const res = await fetch(`/api/itineraries/${itinerary.id}/share`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) {
      setShareUrl(null)
      showToast('success', 'Share link revoked — the old URL no longer works')
    } else {
      showToast('error', data.error || 'Could not revoke the link')
    }
  }

  const handleDownloadPDF = async () => {
    if (!itinerary) return
    if (days.length === 0) {
      // This used to silently return while the button looked enabled — a
      // dead click that read as "the app is broken" (A-item 18).
      showToast('error', 'This itinerary has no days yet — add days before generating the PDF.')
      return
    }

    setGeneratingPDF(true)
    try {
      // Open a preview first; the modal exposes Download / Print / Email and a
      // breakdown toggle. The current breakdown choice is preserved.
      const { generateItineraryPDF } = await import('@/lib/pdf-generator')
      const pdf = await generateItineraryPDF(itinerary, days, { showPricingBreakdown: pdfShowBreakdown }, { ...identityFromTenant(tenant), logoDataUrl: await fetchLogoDataUrl(tenant?.logo_url) })
      setPdfPreviewBlob(pdf.output('blob'))
      setShowPdfPreview(true)
    } catch (error) {
      console.error('Error generating PDF:', error)
      showToast('error', 'Failed to generate PDF. Please try again.')
    } finally {
      setGeneratingPDF(false)
    }
  }

  // Regenerate the preview blob when the user toggles the pricing breakdown
  const handleToggleBreakdown = async (show: boolean) => {
    setPdfShowBreakdown(show)
    if (!itinerary || days.length === 0) return
    try {
      const { generateItineraryPDF } = await import('@/lib/pdf-generator')
      const pdf = await generateItineraryPDF(itinerary, days, { showPricingBreakdown: show }, { ...identityFromTenant(tenant), logoDataUrl: await fetchLogoDataUrl(tenant?.logo_url) })
      setPdfPreviewBlob(pdf.output('blob'))
    } catch (error) {
      console.error('Error regenerating PDF preview:', error)
    }
  }

  const handleSendWhatsApp = async () => {
    if (!itinerary) return
  
    if (!itinerary.client_phone) {
      showToast('error', 'Client phone number is required for WhatsApp. Please add it in edit mode.')
      return
    }
  
    setShowSendModal(false)
    setSendingEmail(true) // Reuse loading state for UI feedback
  
    try {
      const response = await fetch('/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryId: itinerary.id,
          clientPhone: itinerary.client_phone,
          clientName: itinerary.client_name
        })
      })
  
      const data = await response.json()
  
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send WhatsApp message')
      }
  
      markAsSent('WhatsApp')
      setSendSuccess('Quote sent via WhatsApp! ✅')
      setTimeout(() => setSendSuccess(null), 5000)
    } catch (error: any) {
      console.error('WhatsApp send error:', error)
      showToast('error', `Failed to send WhatsApp: ${error.message}`)
    } finally {
      setSendingEmail(false)
    }
  }

  const handleSendEmail = async () => {
    if (!itinerary || days.length === 0) return

    if (!itinerary.client_email) {
      showToast('error', 'Client email is required. Please add it in edit mode.')
      return
    }

    setSendingEmail(true)
    setShowSendModal(false)
    
    try {
      // Same identity + logo as the Download and preview paths. This call
      // omitted them, so the ONE PDF a client actually receives was the only
      // unbranded one: blank header name, no logo, empty footer.
      const { generateItineraryPDF } = await import('@/lib/pdf-generator')
      const pdf = generateItineraryPDF(itinerary, days, undefined, {
        ...identityFromTenant(tenant),
        logoDataUrl: await fetchLogoDataUrl(tenant?.logo_url),
      })
      const pdfBlob = pdf.output('blob')
      const pdfBase64 = await blobToBase64(pdfBlob)

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryId: itinerary.id,
          clientName: itinerary.client_name,
          clientEmail: itinerary.client_email,
          itineraryCode: itinerary.itinerary_code,
          tripName: itinerary.trip_name,
          pdfBase64: pdfBase64.split(',')[1]
        })
      })

      const data = await response.json()

      if (data.success) {
        setSendSuccess('Email sent successfully! ✅')
        markAsSent('Email')
        setTimeout(() => setSendSuccess(null), 5000)
      } else {
        throw new Error(data.error || 'Failed to send email')
      }
    } catch (error) {
      console.error('Error sending email:', error)
      showToast('error', `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSendingEmail(false)
    }
  }

  const markAsSent = async (method: string) => {
    try {
      await fetch(`/api/itineraries/${params.id}/mark-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentVia: method,
          recipientEmail: itinerary?.client_email
        })
      })
      
      if (itinerary) {
        setItinerary({ ...itinerary, status: 'sent' })
      }
    } catch (error) {
      console.error('Error marking as sent:', error)
    }
  }

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const toggleDay = (dayNumber: number) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dayNumber)) {
        newSet.delete(dayNumber)
      } else {
        newSet.add(dayNumber)
      }
      return newSet
    })
  }

  const expandAll = () => {
    setExpandedDays(new Set(days.map(d => d.day_number)))
  }

  const collapseAll = () => {
    setExpandedDays(new Set())
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-50 text-gray-600 border-gray-200',
      sent: 'bg-primary-50 text-primary-600 border-primary-200',
      confirmed: 'bg-green-50 text-green-600 border-green-200',
      completed: 'bg-purple-50 text-purple-600 border-purple-200',
      cancelled: 'bg-red-50 text-red-600 border-red-200'
    }
    return styles[status as keyof typeof styles] || styles.draft
  }

  const getServiceIcon = (type: string) => {
    const icons: Record<string, string> = {
      accommodation: '🏨',
      transportation: '🚗',
      guide: '👨‍🏫',
      entrance: '🎫',
      meal: '🍽️',
      activity: '🎭',
      service_fee: '💼',
      tips: '💰',
      supplies: '💧'
    }
    return icons[type] || '📋'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading itinerary...</p>
        </div>
      </div>
    )
  }

  if (error || !itinerary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-red-500 text-xl">⚠️</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Itinerary</h2>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Link href="/itineraries" className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to List
          </Link>
        </div>
      </div>
    )
  }

  // Where the trip stands, what to do next, and what needs attention
  // (lib/itineraries/trip-stage) — from what this page already loaded.
  const facts = {
    status: itinerary.status,
    hasBooking: !!booking,
    hasInvoice: !!existingInvoice,
    invoiced: actualPnl && actualPnl.invoice_count > 0 ? actualPnl.total_revenue : null,
    paid: actualPnl && actualPnl.invoice_count > 0 ? actualPnl.total_paid : null,
    startDate: itinerary.start_date,
    endDate: itinerary.end_date,
    today: todayLocal(),
  }
  const steps = tripSteps(facts)
  const tab: TabKey = tabChoice ?? defaultTab(facts)
  const primary = nextAction(facts)
  const attention = tripAttention({
    ...facts,
    currency: itinerary.currency || 'EUR',
    cruiseNotes: itinerary.cruise_sailing_notes ?? [],
    staleNights: days.flatMap(day => {
      const property = overnightProperty(day.services as never)
      const status = day.services.find(sv => sv.property_rate_status)?.property_rate_status
      return property && (status === 'not_on_file' || status === 'switched_off')
        ? [{ day: day.day_number, property: property.name, switchedOff: status === 'switched_off' }]
        : []
    }),
  })

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const closeOut = async () => {
    const ok = await confirmDialog({
      title: 'Close out this trip',
      message: 'This marks the itinerary as completed. Expenses and payments can still be added afterwards.',
      confirmText: 'Close out',
      cancelText: 'Cancel',
      variant: 'info',
    })
    if (!ok) return
    setClosingOut(true)
    try {
      const res = await fetch(`/api/itineraries/${itinerary.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not close out the trip')
      setItinerary(prev => (prev ? { ...prev, status: 'completed' } : prev))
      showToast('success', 'Trip closed out')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not close out the trip')
    } finally {
      setClosingOut(false)
    }
  }

  const runPrimary = (kind: PrimaryKind) => {
    if (kind === 'send_quote') setShowSendModal(true)
    else if (kind === 'create_invoice' || kind === 'record_payment') handleGenerateInvoice()
    else if (kind === 'assign_resources') { selectTab('operations'); setTimeout(() => scrollTo('resource-assignment'), 50) }
    else if (kind === 'open_trip_log') { selectTab('operations'); setTimeout(() => scrollTo('trip-timeline'), 50) }
    else if (kind === 'close_out') closeOut()
  }

  const runAttention = (kind: AttentionAction, dayNumber?: number) => {
    if (kind === 'go_to_day' && dayNumber != null) {
      selectTab('itinerary')
      setExpandedDays(prev => new Set([...prev, dayNumber]))
      setTimeout(() => scrollTo(`day-${dayNumber}`), 50)
    } else if (kind === 'create_invoice' || kind === 'record_payment') handleGenerateInvoice()
    else if (kind === 'close_out') closeOut()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER — one main action, chosen by where the trip stands
          (lib/itineraries/trip-stage); everything else in a few menus. */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 space-y-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/itineraries"
                className="p-2 hover:bg-gray-100 rounded-md transition-colors shrink-0"
                title="Back to list"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 truncate" title={itinerary.trip_name}>{itinerary.trip_name}</h1>
                <p className="text-sm text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-primary-600">{itinerary.itinerary_code}</span>
                  <span>•</span>
                  <span>{itinerary.client_name || 'No client'}</span>
                  {itinerary.start_date && (
                    <>
                      <span>•</span>
                      <span>
                        {new Date(itinerary.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {itinerary.end_date && ` – ${new Date(itinerary.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span>{itinerary.num_adults} {itinerary.num_adults === 1 ? 'adult' : 'adults'}{itinerary.num_children > 0 ? `, ${itinerary.num_children} ${itinerary.num_children === 1 ? 'child' : 'children'}` : ''}</span>
                  {itinerary.tier && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      itinerary.tier === 'luxury' ? 'bg-amber-100 text-amber-700' :
                      itinerary.tier === 'deluxe' ? 'bg-purple-100 text-purple-700' :
                      itinerary.tier === 'standard' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {itinerary.tier.toUpperCase()}
                    </span>
                  )}
                  {/* Linked records are links, not actions. */}
                  {booking && (
                    <Link href={`/bookings/${booking.id}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-xs text-gray-700 hover:bg-gray-50">
                      <BookOpen className="w-3 h-3" /> {booking.booking_number}
                    </Link>
                  )}
                  {existingInvoice && (
                    <Link href={`/invoices/${existingInvoice.id}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-xs text-gray-700 hover:bg-gray-50">
                      <Receipt className="w-3 h-3" /> {existingInvoice.invoice_number}
                    </Link>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <HeaderMenu
                label="Send"
                icon={<Send className="w-4 h-4" />}
                items={[
                  { label: 'Send quote', icon: <Send className="w-4 h-4" />, onSelect: () => setShowSendModal(true) },
                  { label: sharing ? 'Sharing…' : shareUrl ? 'Copy share link' : 'Create share link', icon: <Share2 className="w-4 h-4" />, onSelect: handleShare, disabled: sharing, title: 'A client-facing link to this itinerary' },
                  shareUrl ? { label: 'Revoke share link', danger: true, onSelect: handleRevokeShare } : null,
                ]}
              />
              <HeaderMenu
                label="Documents"
                icon={<FileText className="w-4 h-4" />}
                items={[
                  {
                    label: generatingPDF ? 'Generating PDF…' : 'Itinerary PDF',
                    icon: <Download className="w-4 h-4" />,
                    onSelect: handleDownloadPDF,
                    disabled: generatingPDF || days.length === 0,
                    title: days.length === 0 ? 'Add days to the itinerary first — an empty itinerary has nothing to print' : 'Preview and download the client itinerary PDF',
                  },
                  { label: 'Contract', icon: <FileText className="w-4 h-4" />, href: `/documents/contract/${itinerary.id}` },
                  {
                    label: existingInvoice ? `Invoice ${existingInvoice.invoice_number}` : generatingInvoice ? 'Creating invoice…' : 'Create invoice',
                    icon: <Receipt className="w-4 h-4" />,
                    onSelect: handleGenerateInvoice,
                    disabled: generatingInvoice,
                  },
                ]}
              />
              <GenerateDocumentsButton itineraryId={itinerary.id} itineraryCode={itinerary.itinerary_code} label="Supplier docs" quiet />
              <HeaderMenu
                ariaLabel="More actions"
                icon={<MoreHorizontal className="w-4 h-4" />}
                items={[
                  { label: 'Edit itinerary', icon: <Edit2 className="w-4 h-4" />, href: `/itineraries/${itinerary.id}/edit` },
                  { label: 'Add expense', icon: <Receipt className="w-4 h-4" />, onSelect: () => setExpenseSignal(n => n + 1) },
                  { label: 'Operations tasks', icon: <ClipboardList className="w-4 h-4" />, onSelect: () => setTasksSignal(n => n + 1), title: 'Create or sync the operations tasks for this itinerary' },
                  { label: generatingCommissions ? 'Generating commissions…' : 'Generate commissions', icon: <Handshake className="w-4 h-4" />, onSelect: handleGenerateCommissions, disabled: generatingCommissions },
                ]}
              />
              {/* The one thing to do next. */}
              {primary?.kind === 'convert' ? (
                <ItineraryBookingAction
                  itineraryId={itinerary.id}
                  status={itinerary.status}
                  onStatusChange={status => setItinerary({ ...itinerary, status })}
                />
              ) : primary ? (
                <button
                  type="button"
                  onClick={() => runPrimary(primary.kind)}
                  disabled={(primary.kind === 'create_invoice' && generatingInvoice) || closingOut}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-semibold disabled:opacity-50"
                >
                  {primary.label}
                </button>
              ) : null}
              <AddExpenseFromItinerary
                itineraryId={itinerary.id}
                itineraryCode={itinerary.itinerary_code}
                clientName={itinerary.client_name}
                onExpenseAdded={() => setExpenseRefreshTrigger(t => t + 1)}
                openSignal={expenseSignal}
                hideTrigger
              />
              <GenerateTasksButton itineraryId={itinerary.id} openSignal={tasksSignal} hideTrigger />
            </div>
          </div>

          {/* Where the trip stands. */}
          {itinerary.status !== 'cancelled' && (
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" aria-label="Trip stage">
              {steps.map((st, i) => (
                <li key={st.key} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-300 mx-0.5">→</span>}
                  <span className={`px-2 py-0.5 rounded-full border ${
                    st.current ? 'border-amber-300 bg-amber-50 text-amber-800 font-medium'
                    : st.done ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-gray-200 text-gray-400'
                  }`}>
                    {st.done ? '✓ ' : ''}{st.label}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {itinerary.status === 'cancelled' && <p className="text-xs font-medium text-red-700">Cancelled</p>}
        </div>
      </header>

      {/* What needs attention — only when something does. */}
      {attention.length > 0 && (
        <div className="container mx-auto px-4 pt-3">
          <div className="bg-white border border-amber-200 rounded-md divide-y divide-amber-100">
            {attention.map((a, i) => (
              <div key={i} className={`flex items-start justify-between gap-3 px-3 py-2 text-sm ${a.severity === 'warning' ? 'text-amber-900' : 'text-gray-700'}`}>
                <span className="flex items-start gap-2">
                  {a.severity === 'warning' ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" /> : <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />}
                  {a.message}
                </span>
                {a.action && (
                  <button type="button" onClick={() => runAttention(a.action!.kind, a.action!.day)} className="shrink-0 text-xs font-medium underline hover:no-underline">
                    {a.action.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Messages */}
      {sendSuccess && (
        <div className="container mx-auto px-4 pt-3">
          <div className="bg-green-50 border border-green-200 p-3 rounded-md">
            <p className="text-sm text-green-700 font-medium">{sendSuccess}</p>
          </div>
        </div>
      )}

      {commissionResult && (
        <div className="container mx-auto px-4 pt-3">
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-md">
            <p className="text-sm text-emerald-700 font-medium">{commissionResult}</p>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Send Quote to Client</h3>
            <p className="text-sm text-gray-600 mb-4">
              Choose how you'd like to send the itinerary to <strong>{itinerary.client_name}</strong>
            </p>

            <div className="space-y-2">
              <button
                onClick={handleSendWhatsApp}
                disabled={!itinerary.client_phone}
                className={`w-full py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-all text-sm ${
                  itinerary.client_phone
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <span className="text-lg">📱</span>
                <div className="text-left">
                  <div>Send via WhatsApp</div>
                  {itinerary.client_phone && (
                    <div className="text-xs opacity-80">{itinerary.client_phone}</div>
                  )}
                </div>
              </button>

              <button
                onClick={handleSendEmail}
                disabled={!itinerary.client_email || sendingEmail}
                className={`w-full py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-all text-sm ${
                  itinerary.client_email && !sendingEmail
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {sendingEmail ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Sending Email...</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">📧</span>
                    <div className="text-left">
                      <div>Send via Email</div>
                      {itinerary.client_email && (
                        <div className="text-xs opacity-80">{itinerary.client_email}</div>
                      )}
                    </div>
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => setShowSendModal(false)}
              className="w-full mt-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        pdfBlob={pdfPreviewBlob}
        filename={`${itinerary.itinerary_code}${itinerary.client_name ? `_${itinerary.client_name.replace(/\s+/g, '_')}` : ''}.pdf`}
        isOpen={showPdfPreview}
        onClose={() => { setShowPdfPreview(false); setPdfPreviewBlob(null) }}
        onSendEmail={() => { setShowPdfPreview(false); setShowSendModal(true) }}
        title="Itinerary PDF Preview"
        showBreakdown={pdfShowBreakdown}
        onToggleBreakdown={handleToggleBreakdown}
      />

      <div className="container mx-auto px-4 py-4">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-4">
          {/* RIGHT PANEL — who, how much, whose. Above the tabs on a narrow screen. */}
          <aside className="lg:order-2 space-y-3 mb-4 lg:mb-0 lg:sticky lg:top-44 lg:self-start">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">Client</p>
              <p className="text-sm font-semibold text-gray-900">{itinerary.client_name || 'No client'}</p>
              {itinerary.client_email && (
                <a href={`mailto:${itinerary.client_email}`} className="block text-xs text-primary-600 hover:underline truncate">{itinerary.client_email}</a>
              )}
              {itinerary.client_phone && <p className="text-xs text-gray-600">{itinerary.client_phone}</p>}
              {itinerary.client_phone && (
                <div className="mt-2 flex gap-2">
                  <a
                    href={`https://wa.me/${formatPhoneForWhatsApp(itinerary.client_phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 text-xs font-medium rounded-md border border-green-300 text-green-700 hover:bg-green-50"
                  >
                    WhatsApp
                  </a>
                  <button type="button" onClick={() => selectTab('messages')} className="px-2 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
                    Messages
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Price</p>
                <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${getStatusBadge(itinerary.status)}`}>
                  {itinerary.status.charAt(0).toUpperCase() + itinerary.status.slice(1)}
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900">{itinerary.currency} {effectiveTotalCost.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{itinerary.total_days} days · {itinerary.num_adults + (itinerary.num_children || 0)} travellers</p>
              {actualPnl && (
                <dl className="pt-2 mt-2 border-t border-gray-100 text-xs grid grid-cols-2 gap-y-1">
                  {actualPnl.invoice_count === 0 ? (
                    <><dt className="text-gray-500">Invoice</dt><dd className="text-right text-gray-700">none yet</dd></>
                  ) : (
                    <>
                      <dt className="text-gray-500">Paid</dt>
                      <dd className="text-right text-gray-900">{itinerary.currency} {actualPnl.total_paid.toFixed(2)}</dd>
                      <dt className="text-gray-500">Balance due</dt>
                      <dd className={`text-right font-medium ${actualPnl.total_revenue - actualPnl.total_paid > 0.005 ? 'text-amber-700' : 'text-green-700'}`}>
                        {itinerary.currency} {Math.max(0, actualPnl.total_revenue - actualPnl.total_paid).toFixed(2)}
                      </dd>
                    </>
                  )}
                  <dt className="text-gray-500">Costs recorded</dt>
                  <dd className="text-right text-gray-900">{itinerary.currency} {actualPnl.total_expenses.toFixed(2)}</dd>
                  {actualPnl.invoice_count > 0 && (
                    <>
                      <dt className="text-gray-500">Profit so far</dt>
                      <dd className="text-right font-medium text-gray-900">{itinerary.currency} {actualPnl.gross_profit.toFixed(2)}</dd>
                    </>
                  )}
                </dl>
              )}
              <button type="button" onClick={() => selectTab('finance')} className="text-xs text-primary-600 hover:underline">Open finance</button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <AssigneeSelect
                value={itinerary.assigned_to}
                endpoint={`/api/itineraries/${itinerary.id}`}
                method="PUT"
                onSaved={(assigneeId) =>
                  setItinerary(prev => (prev ? { ...prev, assigned_to: assigneeId } : prev))
                }
              />
              {(() => {
                // "Created via Pricing Grid | B2C | 2 pax" is the system's, not a note.
                const { source, note } = splitSystemNote(itinerary.notes)
                return (
                  <>
                    {note && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">Notes</p>
                        <p className="text-sm text-gray-700 whitespace-pre-line">{note}</p>
                      </div>
                    )}
                    {source && <p className="mt-3 text-xs text-gray-400">Source: {source}</p>}
                  </>
                )
              })()}
              <button type="button" onClick={() => setTasksSignal(n => n + 1)} className="mt-3 text-xs text-primary-600 hover:underline flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5" /> Operations tasks
              </button>
            </div>
          </aside>

          <div className="lg:order-1 min-w-0 space-y-4">
            {/* TABS — the itinerary, running it, the money, the messages. */}
            <nav className="flex gap-1 border-b border-gray-200 overflow-x-auto" aria-label="Itinerary sections">
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => selectTab(t.key)}
                  aria-current={tab === t.key ? 'page' : undefined}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                    tab === t.key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'itinerary' && (
              <div className="space-y-4">
        {/* DAY CONTROLS */}
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Daily Itinerary</h2>
            {/* How costs are kept: a setting, not a card. Manual lets a cost
                below be typed over. */}
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              {costMode === 'auto' ? <Calculator className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5 text-amber-600" />}
              Costs: {costMode === 'auto' ? 'automatic, from your rates' : 'manual — click a cost below to change it'}
              {' · '}
              <button type="button" onClick={handleToggleCostMode} disabled={savingCostMode} className="text-primary-600 hover:underline disabled:opacity-50">
                {costMode === 'auto' ? 'switch to manual' : 'switch to automatic'}
              </button>
              {costModeChanged && <span className="text-green-600 flex items-center gap-0.5"><Check className="w-3 h-3" />Saved</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={expandAll} className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">Expand All</button>
            <button onClick={collapseAll} className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors">Collapse All</button>
          </div>
        </div>

        {/* DAYS LIST */}
        <div className="space-y-3">
          {days.map((day) => (
            <div key={day.id} id={`day-${day.day_number}`} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden scroll-mt-40">
              <button onClick={() => toggleDay(day.day_number)} className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-600 text-white rounded-md flex items-center justify-center font-semibold text-sm">{day.day_number}</div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900">{day.title || `Day ${day.day_number}`}</h3>
                    <p className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{day.city && ` • ${day.city}`}</p>
                  </div>
                </div>
                {expandedDays.has(day.day_number) ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>
              {expandedDays.has(day.day_number) && (
                <div className="p-4">
                  {day.description && <div className="mb-4"><p className="text-sm text-gray-700">{day.description}</p></div>}
                  {day.services && day.services.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Services Included</h4>
                      <div className="space-y-2">
                        {day.services.map((service) => (
                          <div key={service.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-lg">{getServiceIcon(service.service_type)}</span>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{serviceLabel(service.service_name)}</p>
                                <p className="text-xs text-gray-500">{serviceTypeLabel(service.service_type)}{service.quantity > 1 && ` • Qty: ${service.quantity}`}</p>
                                {service.notes && <p className="text-xs text-gray-600 mt-0.5">{service.notes}</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              {costMode === 'manual' && editingServiceId === service.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-gray-500">{itinerary.currency}</span>
                                  <input type="number" value={editedCost} onChange={(e) => setEditedCost(e.target.value)} className="w-20 px-2 py-1 text-sm font-semibold text-right border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveServiceCost(service.id, day.id); if (e.key === 'Escape') handleCancelEditCost() }} />
                                  <button onClick={() => handleSaveServiceCost(service.id, day.id)} disabled={savingServiceCost} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                                  <button onClick={handleCancelEditCost} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                                </div>
                              ) : (
                                <button onClick={() => handleStartEditCost(service)} disabled={costMode !== 'manual'} className={`text-sm font-semibold ${costMode === 'manual' ? 'text-amber-700 hover:text-amber-800 cursor-pointer underline decoration-dashed underline-offset-2' : 'text-gray-900 cursor-default'}`} title={costMode === 'manual' ? 'Click to edit' : 'Switch to Manual mode to edit'}>
                                  {itinerary.currency} {service.total_cost.toFixed(2)}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500"><p className="text-sm">No services added yet</p></div>
                  )}
                  {/* The hotel or ship, not just the city: the property is on the
                      day's accommodation line (lib/itineraries/overnight-property). */}
                  {(() => {
                    const property = overnightProperty(day.services as never)
                    const stay = overnightLabel(property, day.overnight_city)
                    // The night line that named it says whether it is still in Rates.
                    const status = day.services.find(s => s.property_rate_status)?.property_rate_status
                    const stale = property && (status === 'not_on_file' || status === 'switched_off')
                    return stay ? (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-600">🌙 Overnight in <span className="font-medium">{stay}</span></p>
                        {stale && (
                          <p className="mt-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1" data-testid="overnight-stale">
                            ⚠ {status === 'switched_off'
                              ? `${property!.name} is switched off in your rates — this night can no longer be re-priced or booked from it. Switch it back on in Rates, or choose another.`
                              : `${property!.name} is no longer in your rates — it was removed after this itinerary was priced. Check the night before confirming it.`}
                          </p>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>

        {days.length === 0 && <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center"><p className="text-sm text-gray-500">No days planned yet</p></div>}
              </div>
            )}

            {tab === 'operations' && (
              <div className="space-y-4">
        {/* Resources: the assignments below are the one source. The summary
            banner that sat here read an older single-guide field, so it could
            say "guide needed" beside a confirmed guide. */}
        <div id="resource-assignment">
          <ResourceAssignmentV2 itineraryId={itinerary.id} startDate={itinerary.start_date} endDate={itinerary.end_date} numTravelers={itinerary.num_adults} clientName={itinerary.client_name} tripName={itinerary.trip_name} onUpdate={fetchItinerary} />
        </div>

        {/* Trip timeline — the execution layer's checkpoint log, office view */}
        <div id="trip-timeline"><TripTimeline itineraryId={itinerary.id} /></div>

              </div>
            )}

            {tab === 'finance' && (
              <div className="space-y-4">
        {/* PROFIT & LOSS */}
        {days.length > 0 && <ItineraryPL itineraryId={itinerary.id} totalCost={effectiveTotalCost} currency={itinerary.currency} marginPercent={marginPercent} days={days} actual={actualPnl} />}

        {/* EXTRA EXPENSES */}
        <ItineraryExpenses
          itineraryId={itinerary.id}
          currency={itinerary.currency || 'EUR'}
          refreshTrigger={expenseRefreshTrigger}
        />

              </div>
            )}

            {tab === 'messages' && (
              <div className="space-y-4">
        {/* WHATSAPP ACTIONS */}
        <div className="bg-white rounded-lg border border-green-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center"><span className="text-white text-lg">📱</span></div>
            <div><h3 className="text-sm font-semibold text-gray-900">WhatsApp Actions</h3><p className="text-xs text-gray-600">Send updates to {itinerary.client_name}</p></div>
          </div>
          {/* Where the payment stands, before reminding or thanking anyone for it. */}
          {actualPnl && (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {actualPnl.invoice_count === 0 ? (
                <span className="text-gray-600">No invoice yet</span>
              ) : (
                <>
                  <span className="text-gray-600">Invoiced <span className="font-semibold text-gray-900">{itinerary.currency} {actualPnl.total_revenue.toFixed(2)}</span></span>
                  <span className="text-gray-600">Paid <span className="font-semibold text-gray-900">{itinerary.currency} {actualPnl.total_paid.toFixed(2)}</span></span>
                  {actualPnl.total_revenue - actualPnl.total_paid > 0.005 ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">Balance due {itinerary.currency} {(actualPnl.total_revenue - actualPnl.total_paid).toFixed(2)}</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Paid in full</span>
                  )}
                </>
              )}
            </div>
          )}
          {!itinerary.client_phone && <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md"><p className="text-yellow-800 text-xs">⚠️ Client phone number required. Add it in edit mode.</p></div>}
          {itinerary.client_phone && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {itinerary.status === 'draft' && <WhatsAppButton itineraryId={itinerary.id} type="status" status="confirmed" onSuccess={() => { setSendSuccess('Booking confirmation sent! ✅'); setTimeout(() => setSendSuccess(null), 5000); fetchItinerary() }} className="bg-blue-600 hover:bg-blue-700" />}
            {itinerary.status !== 'completed' && <WhatsAppButton itineraryId={itinerary.id} type="status" status="pending_payment" onSuccess={() => { setSendSuccess('Payment reminder sent! ✅'); setTimeout(() => setSendSuccess(null), 5000) }} className="bg-yellow-600 hover:bg-yellow-700" />}
            <WhatsAppButton itineraryId={itinerary.id} type="status" status="paid" onSuccess={() => { setSendSuccess('Payment confirmation sent! ✅'); setTimeout(() => setSendSuccess(null), 5000); fetchItinerary() }} className="bg-emerald-600 hover:bg-emerald-700" />
          </div>
          )}
          {itinerary.client_phone && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-full"><span>📱</span><span>{itinerary.client_phone}</span></div>
                {itinerary.status === 'sent' && <div className="flex items-center gap-1.5 px-2 py-1 bg-primary-50 text-primary-700 rounded-full"><span>✅</span><span>Quote sent</span></div>}
              </div>
            </div>
          )}
        </div>

        {/* Traveller chat — office side of the share-page thread (mig 291) */}
        <TravellerChat itineraryId={itinerary.id} />

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}