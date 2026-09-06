'use client'

import { identityFromTenant } from '@/lib/company-identity'
import { useTenant } from '@/app/contexts/TenantContext'
import { useVocabulary } from '@/components/vocabulary'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Send, Mail, MessageSquare, Printer, CheckCircle } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'

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
  services: any[]
  currency: string
  total_cost: number
  payment_terms?: string
  special_requests?: string
  internal_notes?: string
  status: string
  created_at: string
  itinerary?: {
    id: string
    itinerary_code: string
    trip_name: string
  }
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

  const handleDownload = async () => {
    if (!document) return

    const { generateSupplierDocumentPDF } = await import('@/lib/supplier-document-pdf')
    const pdf = generateSupplierDocumentPDF({ ...withLanguageLabels(document), company: identityFromTenant(tenant) })
    const filename = `${document.document_number}_${document.supplier_name.replace(/\s+/g, '_')}.pdf`
    pdf.save(filename)
  }

  const handlePrint = async () => {
    if (!document) return

    const { generateSupplierDocumentPDF } = await import('@/lib/supplier-document-pdf')
    const pdf = generateSupplierDocumentPDF({ ...withLanguageLabels(document), company: identityFromTenant(tenant) })
    const pdfBlob = pdf.output('blob')
    const pdfUrl = URL.createObjectURL(pdfBlob)
    
    const printWindow = window.open(pdfUrl, '_blank')
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print()
      }
    }
  }

  const handleSendEmail = async () => {
    if (!document || !document.supplier_contact_email) {
      showToast('error', 'Supplier email not available')
      return
    }
    
    setActionLoading('email')
    try {
      const { generateSupplierDocumentPDF } = await import('@/lib/supplier-document-pdf')
      const pdf = generateSupplierDocumentPDF({ ...withLanguageLabels(document), company: identityFromTenant(tenant) })
      const pdfBase64 = pdf.output('datauristring').split(',')[1]
      
      const response = await fetch('/api/send-supplier-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          supplierEmail: document.supplier_contact_email,
          supplierName: document.supplier_name,
          documentNumber: document.document_number,
          documentType: DOCUMENT_TITLES[document.document_type],
          clientName: document.client_name,
          pdfBase64
        })
      })
      
      if (response.ok) {
        // Update status to sent
        await fetch(`/api/supplier-documents/${document.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'sent', sent_via: 'email' })
        })
        
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

  const handleSendWhatsApp = () => {
    if (!document || !document.supplier_contact_phone) {
      showToast('error', 'Supplier phone not available')
      return
    }
    
    const phone = document.supplier_contact_phone.replace(/\D/g, '')
    const message = encodeURIComponent(
      `Dear ${document.supplier_contact_name || document.supplier_name},\n\n` +
      `Please find attached ${DOCUMENT_TITLES[document.document_type]} #${document.document_number}\n\n` +
      `Guest: ${document.client_name}\n` +
      `Date: ${document.check_in || document.service_date || 'As specified'}\n\n` +
      `Please confirm receipt.\n\n` +
      `Best regards,\nTravel2Egypt`
    )
    
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank')
    
    // Update status
    fetch(`/api/supplier-documents/${document.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'sent', sent_via: 'whatsapp' })
    }).then(() => fetchDocument())
  }

  const handleMarkConfirmed = async () => {
    if (!document) return
    
    setActionLoading('confirm')
    try {
      await fetch(`/api/supplier-documents/${document.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' })
      })
      
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/documents/supplier"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{document.document_number}</h1>
                <p className="text-sm text-gray-500">{DOCUMENT_TITLES[document.document_type]} • {document.supplier_name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
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
          {/* Document Preview Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Header Section */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-primary-600">TRAVEL2EGYPT</h2>
                  <p className="text-sm text-gray-500 mt-1">{DOCUMENT_TITLES[document.document_type]}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">{document.document_number}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(document.created_at).toLocaleDateString()}
                  </p>
                  <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-medium ${
                    document.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    document.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                    document.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {document.status.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Supplier Info */}
            <div className="p-6 bg-gray-50 border-b border-gray-200">
              <p className="text-xs text-gray-500 mb-1">TO:</p>
              <p className="text-lg font-semibold text-gray-900">{document.supplier_name}</p>
              {document.supplier_address && (
                <p className="text-sm text-gray-600">{document.supplier_address}</p>
              )}
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                {document.supplier_contact_phone && (
                  <span>📞 {document.supplier_contact_phone}</span>
                )}
                {document.supplier_contact_email && (
                  <span>✉️ {document.supplier_contact_email}</span>
                )}
              </div>
            </div>

            {/* Guest Info */}
            <div className="p-6 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-gray-500 mb-1">GUEST NAME</p>
                  <p className="text-lg font-semibold text-gray-900">{document.client_name}</p>
                  {document.client_nationality && (
                    <p className="text-sm text-gray-600">Nationality: {document.client_nationality}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">PAX</p>
                  <p className="text-2xl font-bold text-primary-600">
                    {document.num_adults + (document.num_children || 0)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {document.num_adults} Adult{document.num_adults !== 1 ? 's' : ''}
                    {document.num_children > 0 && `, ${document.num_children} Child${document.num_children !== 1 ? 'ren' : ''}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="p-6 border-b border-gray-200">
              {document.check_in ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-primary-50 p-4 rounded-lg">
                    <p className="text-xs text-primary-600 font-medium mb-1">CHECK-IN</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {new Date(document.check_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="bg-primary-50 p-4 rounded-lg">
                    <p className="text-xs text-primary-600 font-medium mb-1">CHECK-OUT</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {document.check_out && new Date(document.check_out).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium mb-1">SERVICE DATE</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {document.service_date && new Date(document.service_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  {document.pickup_time && (
                    <p className="text-sm text-gray-600 mt-1">Pickup: {document.pickup_time}</p>
                  )}
                </div>
              )}
            </div>

            {/* Services */}
            {document.services && document.services.length > 0 && (
              <div className="p-6 border-b border-gray-200">
                <p className="text-xs text-gray-500 font-medium mb-3">SERVICES INCLUDED</p>
                <div className="space-y-2">
                  {document.services.map((service, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                        <p className="text-xs text-gray-500">
                          {service.date && new Date(service.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {service.city && ` • ${service.city}`}
                        </p>
                      </div>
                      <p className="text-sm text-gray-600">x{service.quantity || 1}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Special Requests */}
            {document.special_requests && (
              <div className="p-6 border-b border-gray-200 bg-amber-50">
                <p className="text-xs text-amber-700 font-medium mb-1">SPECIAL REQUESTS</p>
                <p className="text-sm text-gray-700">{document.special_requests}</p>
              </div>
            )}

            {/* Payment & Total */}
            <div className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500 mb-1">PAYMENT TERMS</p>
                  <p className="text-sm font-medium text-gray-900">
                    {document.payment_terms?.replace('_', ' ').toUpperCase() || 'AS AGREED'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">TOTAL</p>
                  <p className="text-2xl font-bold text-primary-600">
                    {document.currency} {document.total_cost.toFixed(2)}
                  </p>
                </div>
              </div>
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