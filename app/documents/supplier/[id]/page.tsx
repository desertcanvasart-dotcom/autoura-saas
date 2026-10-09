'use client'

import { identityFromTenant, fetchLogoDataUrl } from '@/lib/company-identity'
import { DocumentLetterhead, DocumentFooter, brandColor } from '@/components/documents/Letterhead'
import { formatDateOnly, daysBetween } from '@/lib/date-utils'
import { useTenant } from '@/app/contexts/TenantContext'
import { useVocabulary } from '@/components/vocabulary'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Download, Send, Mail, MessageSquare, Printer, CheckCircle, Pencil } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { BackLink, TripBreadcrumb } from '@/components/nav/TripNav'
import { withReturnTo, safeReturnPath, FROM_PARAM } from '@/lib/nav/return-to'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { VOUCHER_VEHICLE_TYPES } from '@/lib/documents/vehicle-types'

interface SupplierDocument {
  id: string
  document_type: string
  document_number: string
  supplier_name: string
  supplier_contact_name?: string
  supplier_contact_email?: string
  supplier_contact_phone?: string
  supplier_address?: string
  client_name: string
  client_nationality?: string
  num_adults: number
  num_children: number
  city?: string
  service_date?: string
  check_in?: string
  check_out?: string
  pickup_time?: string
  pickup_location?: string
  dropoff_location?: string
  vehicle_type?: string
  driver_name?: string
  services: any[]
  currency: string
  total_cost: number
  payment_terms?: string
  special_requests?: string
  internal_notes?: string
  status: string
  sent_at?: string | null
  confirmed_at?: string | null
  created_at: string
  itinerary?: {
    id: string
    itinerary_code: string
    trip_name: string
  }
}

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em]'

const PAYMENT_TERMS: Record<string, string> = {
  prepaid: 'Prepaid',
  credit: 'Credit terms',
  on_service: 'Pay on service date',
  commission: 'Commission based',
  pay_direct: 'Pay direct',
}

const DOCUMENT_TITLES: Record<string, string> = {
  hotel_voucher: 'Hotel Voucher',
  service_order: 'Service Order',
  transport_voucher: 'Transport Voucher',
  activity_voucher: 'Activity Voucher',
  guide_assignment: 'Guide Assignment',
  cruise_voucher: 'Cruise Voucher'
}

export default function SupplierDocumentViewPage() {
  const { tenant } = useTenant()
  // Guide lines store the language KEY (346); the PDF prints the agency's word.
  // Every array on the document (services, selected_guides, …) is walked.
  const { labelFor: guideLanguageLabel } = useVocabulary('guide_language')
  const withLanguageLabels = <T extends object>(doc: T): T => {
    const out: Record<string, unknown> = { ...(doc as Record<string, unknown>) }
    for (const [k, v] of Object.entries(out)) {
      if (!Array.isArray(v)) continue
      out[k] = v.map(item => (item && typeof item === 'object' && typeof (item as { guide_language?: unknown }).guide_language === 'string'
        ? { ...item, guide_language: guideLanguageLabel((item as { guide_language: string }).guide_language) }
        : item))
    }
    return out as T
  }
  const params = useParams()
  const router = useRouter()
  const [document, setDocument] = useState<SupplierDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const dialog = useConfirmDialog()
  // ?from= (the list or trip this was opened from), passed on to Edit.
  const [returnTo, setReturnTo] = useState<string | null>(null)
  useEffect(() => {
    setReturnTo(safeReturnPath(new URLSearchParams(window.location.search).get(FROM_PARAM)))
  }, [])

  useEffect(() => {
    if (params.id) {
      fetchDocument()
    }
  }, [params.id])

  const fetchDocument = async () => {
    try {
      const response = await fetch(`/api/supplier-documents/${params.id}`)
      const result = await response.json()
      
      if (result.success) {
        setDocument(result.data)
      } else {
        setError('Document not found')
      }
    } catch (err) {
      setError('Error loading document')
    } finally {
      setLoading(false)
    }
  }

  // The letterhead the PDF prints: Settings → Organization, logo included.
  const buildPdf = async (doc: SupplierDocument) => {
    const { generateSupplierDocumentPDF } = await import('@/lib/supplier-document-pdf')
    const company = { ...identityFromTenant(tenant), logoDataUrl: await fetchLogoDataUrl(tenant?.logo_url) }
    return generateSupplierDocumentPDF({ ...withLanguageLabels(doc), company })
  }

  const handleDownload = async () => {
    if (!document) return

    const pdf = await buildPdf(document)
    const filename = `${document.document_number}_${document.supplier_name.replace(/\s+/g, '_')}.pdf`
    pdf.save(filename)
  }

  const handlePrint = async () => {
    if (!document) return

    const pdf = await buildPdf(document)
    const pdfBlob = pdf.output('blob')
    const pdfUrl = URL.createObjectURL(pdfBlob)
    
    const printWindow = window.open(pdfUrl, '_blank')
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print()
      }
    }
  }

  // Marks the voucher sent (the route stamps sent_at). It used to send a
  // sent_via column the table does not have, so the update always failed and
  // nothing checked: no voucher ever reached "sent".
  const markSent = async (documentId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/supplier-documents/${documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' })
      })
      if (!res.ok) showToast('error', 'Sent, but the voucher could not be marked as sent')
      return res.ok
    } catch {
      showToast('error', 'Sent, but the voucher could not be marked as sent')
      return false
    }
  }

  const handleSendEmail = async () => {
    if (!document || !document.supplier_contact_email) {
      showToast('error', 'Supplier email not available')
      return
    }
    
    setActionLoading('email')
    try {
      const pdf = await buildPdf(document)
      const pdfBase64 = pdf.output('datauristring').split(',')[1]
      
      const response = await fetch('/api/send-supplier-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The route reads the recipient, number and names from the voucher,
        // and marks it sent once the email has gone.
        body: JSON.stringify({
          documentId: document.id,
          documentType: DOCUMENT_TITLES[document.document_type],
          pdfBase64
        })
      })
      
      if (response.ok) {
        setActionSuccess('Email sent successfully!')
        fetchDocument()
        setTimeout(() => setActionSuccess(null), 5000)
      } else {
        showToast('error', 'Failed to send email')
      }
    } catch (error) {
      console.error('Error sending email:', error)
      showToast('error', 'Failed to send email')
    } finally {
      setActionLoading(null)
    }
  }

  // wa.me opens a chat with the text filled in; nothing is attached and this
  // page cannot see whether it was sent. It used to mark the voucher sent the
  // moment the chat opened. Now it asks.
  const handleSendWhatsApp = async () => {
    if (!document || !document.supplier_contact_phone) {
      showToast('error', 'Supplier phone not available')
      return
    }
    
    const phone = document.supplier_contact_phone.replace(/\D/g, '')
    const message = encodeURIComponent(
      `Dear ${document.supplier_contact_name || document.supplier_name},\n\n` +
      `${DOCUMENT_TITLES[document.document_type]} #${document.document_number}\n\n` +
      `Guest: ${document.client_name}\n` +
      `Date: ${document.check_in || document.service_date || 'As specified'}\n\n` +
      `Please confirm receipt.\n\n` +
      `Best regards,\n${tenant?.company_name || ''}`
    )
    
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank')

    const sent = await dialog.confirm({
      title: 'WhatsApp',
      message: 'Did you send the voucher on WhatsApp? It will be marked as sent.',
      confirmText: 'Yes, mark sent',
      cancelText: 'Not yet',
    })
    if (sent && (await markSent(document.id))) fetchDocument()
  }

  const handleMarkConfirmed = async () => {
    if (!document) return
    
    setActionLoading('confirm')
    try {
      const res = await fetch(`/api/supplier-documents/${document.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' })
      })
      if (!res.ok) {
        showToast('error', 'Failed to update status')
        return
      }

      setActionSuccess('Marked as confirmed!')
      fetchDocument()
      setTimeout(() => setActionSuccess(null), 5000)
    } catch (error) {
      showToast('error', 'Failed to update status')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Link href="/documents/supplier" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            ← Back to Documents
          </Link>
        </div>
      </div>
    )
  }

  const company = identityFromTenant(tenant)
  const accent = brandColor(company)
  const totalPax = document.num_adults + (document.num_children || 0)
  const longDate = (d?: string) => d ? formatDateOnly(d, 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const isStay = document.document_type === 'hotel_voucher' || document.document_type === 'cruise_voucher' || !!document.check_in
  const nights = document.check_in && document.check_out ? daysBetween(document.check_in, document.check_out) : 0
  const dateCells: { label: string; value: string }[] = isStay
    ? [
        { label: 'Check-in', value: longDate(document.check_in) },
        { label: 'Check-out', value: longDate(document.check_out) },
        { label: 'Duration', value: `${nights} night${nights !== 1 ? 's' : ''}` },
      ]
    : [
        { label: 'Service date', value: longDate(document.service_date) },
        ...(document.pickup_time ? [{ label: 'Pickup time', value: document.pickup_time }] : []),
        ...(document.pickup_location ? [{ label: 'From', value: document.pickup_location }] : []),
        ...(document.dropoff_location ? [{ label: 'To', value: document.dropoff_location }] : []),
        ...(document.vehicle_type ? [{ label: 'Vehicle', value: VOUCHER_VEHICLE_TYPES[document.vehicle_type] || document.vehicle_type }] : []),
        ...(document.driver_name ? [{ label: 'Driver', value: document.driver_name }] : []),
      ]
  const paymentTerms = document.payment_terms
    ? (PAYMENT_TERMS[document.payment_terms] || document.payment_terms.replace(/_/g, ' '))
    : 'As agreed'

  const tripRef = document.itinerary
    ? { id: document.itinerary.id, code: document.itinerary.itinerary_code, name: document.itinerary.trip_name }
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <TripBreadcrumb itineraryId={document.itinerary?.id} trip={tripRef} current={document.document_number} />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BackLink fallbackHref="/documents/supplier" fallbackLabel="Documents" trip={tripRef} />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{document.document_number}</h1>
                <p className="text-sm text-gray-500">{DOCUMENT_TITLES[document.document_type]} • {document.supplier_name}</p>
                {(document.sent_at || document.confirmed_at) && (
                  <p className="text-xs text-gray-500">
                    {document.sent_at && `Sent ${new Date(document.sent_at).toLocaleDateString()}`}
                    {document.sent_at && document.confirmed_at && ' · '}
                    {document.confirmed_at && `Confirmed ${new Date(document.confirmed_at).toLocaleDateString()}`}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {document.status !== 'cancelled' && (
                <Link
                  // Edit returns here, keeping where this page was opened from.
                  href={withReturnTo(`/documents/supplier/${document.id}/edit`, returnTo)}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Link>
              )}
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              {document.supplier_contact_email && (
                <button
                  onClick={handleSendEmail}
                  disabled={actionLoading === 'email'}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {actionLoading === 'email' ? 'Sending...' : 'Email'}
                </button>
              )}
              {document.supplier_contact_phone && (
                <button
                  onClick={handleSendWhatsApp}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4" />
                  WhatsApp
                </button>
              )}
              {document.status === 'sent' && (
                <button
                  onClick={handleMarkConfirmed}
                  disabled={actionLoading === 'confirm'}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark Confirmed
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Success Message */}
      {actionSuccess && (
        <div className="container mx-auto px-4 pt-4">
          <div className="bg-green-50 border border-green-200 p-3 rounded-md">
            <p className="text-sm text-green-700 font-medium">{actionSuccess}</p>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {/* Document preview: the agency's letterhead (Settings → Organization),
              laid out like the PDF the supplier receives. */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <DocumentLetterhead
              company={company}
              title={DOCUMENT_TITLES[document.document_type] || 'Service Document'}
              number={document.document_number}
              date={new Date(document.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              status={document.status}
            />

            <div className="px-8 pb-8 space-y-6">
              {/* Supplier and guest */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className={LABEL} style={{ color: accent }}>Supplier</p>
                  <p className="text-base font-semibold text-gray-900 mt-1">{document.supplier_name}</p>
                  {document.supplier_contact_name && <p className="text-sm text-gray-600">Attn: {document.supplier_contact_name}</p>}
                  {document.supplier_address && <p className="text-sm text-gray-600">{document.supplier_address}</p>}
                  {(document.supplier_contact_phone || document.supplier_contact_email) && (
                    <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                      {document.supplier_contact_phone && <p>Tel: {document.supplier_contact_phone}</p>}
                      {document.supplier_contact_email && <p>Email: {document.supplier_contact_email}</p>}
                    </div>
                  )}
                </div>
                <div className="rounded-lg p-4 flex justify-between gap-4" style={{ backgroundColor: `${accent}10`, border: `1px solid ${accent}40` }}>
                  <div className="min-w-0">
                    <p className={LABEL} style={{ color: accent }}>Guest</p>
                    <p className="text-base font-semibold text-gray-900 mt-1">{document.client_name}</p>
                    {document.client_nationality && <p className="text-sm text-gray-600">Nationality: {document.client_nationality}</p>}
                    {document.city && <p className="text-sm text-gray-600">{document.city}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-3xl font-bold leading-none" style={{ color: accent }}>{totalPax}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mt-1">Pax</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {document.num_adults} adult{document.num_adults !== 1 ? 's' : ''}
                      {document.num_children > 0 && `, ${document.num_children} child${document.num_children !== 1 ? 'ren' : ''}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* When (and where, for transport) */}
              <div className={`grid gap-4 ${dateCells.length >= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {dateCells.map(cell => (
                  <div key={cell.label} className="rounded-lg border border-gray-200 px-4 py-3">
                    <p className={LABEL} style={{ color: accent }}>{cell.label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{cell.value}</p>
                  </div>
                ))}
              </div>

              {/* Services */}
              {document.services && document.services.length > 0 && (
                <div>
                  <p className={`${LABEL} mb-2`} style={{ color: accent }}>Services included</p>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500" style={{ backgroundColor: `${accent}10` }}>
                          <th className="px-4 py-2 font-semibold w-24">Date</th>
                          <th className="px-4 py-2 font-semibold">Service</th>
                          <th className="px-4 py-2 font-semibold hidden sm:table-cell">City</th>
                          <th className="px-4 py-2 font-semibold text-right w-16">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {document.services.map((service, idx) => (
                          <tr key={idx} className="border-t border-gray-100">
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                              {service.date ? formatDateOnly(service.date, 'en-US', { month: 'short', day: 'numeric' }) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-900 font-medium">
                              {service.service_name || service.service_type || 'Service'}
                              {service.notes && <span className="block text-xs font-normal text-gray-500">{service.notes}</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell">{service.city || '—'}</td>
                            <td className="px-4 py-2.5 text-gray-900 text-right">×{service.quantity || 1}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Special requests */}
              {document.special_requests && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className={`${LABEL} text-amber-700`}>Special requests</p>
                  <p className="text-sm text-gray-800 mt-1 whitespace-pre-line">{document.special_requests}</p>
                </div>
              )}

              {/* Payment and total */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
                <div>
                  <p className={LABEL} style={{ color: accent }}>Payment terms</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">{paymentTerms}</p>
                </div>
                <div className="sm:text-right rounded-lg px-5 py-3" style={{ backgroundColor: `${accent}10` }}>
                  <p className={LABEL} style={{ color: accent }}>Total</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">
                    {document.currency} {Number(document.total_cost || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-10 pt-8">
                <div>
                  <div className="border-t border-gray-300" />
                  <p className="text-xs text-gray-500 mt-1.5">{company.name ? `Authorized by ${company.name}` : 'Authorized signature'}</p>
                </div>
                <div>
                  <div className="border-t border-gray-300" />
                  <p className="text-xs text-gray-500 mt-1.5">Supplier confirmation &amp; stamp</p>
                </div>
              </div>
            </div>

            {/* Footer: Settings → Organization */}
            <div className="border-t border-gray-100 bg-gray-50/60 px-8 py-4">
              <DocumentFooter company={company} />
            </div>
          </div>

          {/* Itinerary Link */}
          {document.itinerary && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">LINKED ITINERARY</p>
              <Link
                href={`/itineraries/${document.itinerary.id}`}
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                {document.itinerary.itinerary_code} - {document.itinerary.trip_name}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}