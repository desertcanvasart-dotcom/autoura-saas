// lib/supplier-document-pdf.ts
// Professional Supplier Document PDF Generator
// Unified branding with Travel2Egypt / Autoura colors

import { formatMoney } from '@/lib/currency-totals'
import jsPDF from 'jspdf'
import { brandColorRgb, tint, type CompanyIdentity } from './company-identity'
import { drawLetterhead, drawContinuationHeader, drawFooters, footerReserve } from './pdf-letterhead'
import { formatDateOnly, daysBetween } from '@/lib/date-utils'
import { voucherLines } from '@/lib/documents/voucher-lines'
import { VOUCHER_VEHICLE_TYPES } from '@/lib/documents/vehicle-types'

interface ServiceItem {
  date?: string
  service_name?: string
  service_type?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  notes?: string
}

interface SupplierDocument {
  /** The operator authorising the document. Previously hardcoded Travel2Egypt
   *  with a placeholder phone ("+20 100 XXX XXXX") in the footer. */
  company?: CompanyIdentity
  id: string
  document_type: string
  document_number: string
  supplier_name: string
  supplier_contact_name?: string
  supplier_contact_email?: string
  supplier_contact_phone?: string
  supplier_whatsapp?: string
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
  services: ServiceItem[]
  currency: string
  total_cost: number
  payment_terms?: string
  special_requests?: string
  internal_notes?: string
  created_at: string
  // Entrance fees specific
  selected_attractions?: {
    id: string
    attraction_name: string
    city: string
    eur_rate: number
    non_eur_rate: number
    quantity: number
  }[]
  // Transport routes specific
  selected_routes?: {
    rate_id: string
    service_code: string
    route_name: string
    service_type: string
    city: string
    quantity: number
    unit_rate: number
    total_cost: number
  }[]
  // Meal specific
  selected_meals?: {
    rate_id: string
    service_code: string
    restaurant_name: string
    meal_type: string
    city: string
    quantity: number
    unit_rate: number
    total_cost: number
  }[]
  // Guide specific
  selected_guides?: {
    rate_id: string
    service_code: string
    guide_language: string
    guide_type: string
    tour_duration: string
    city: string
    quantity: number
    unit_rate: number
    total_cost: number
  }[]
}

// Brand colors - lighter, more professional palette
// Defaults (the original olive). ACTIVE is what everything reads; it is
// re-derived from the tenant's brand color at the top of every generate call.
// Safe because generation is fully synchronous — no interleaving is possible.
const BRAND = {
  primary: { r: 100, g: 124, b: 71 },      // Olive green #647C47
  primaryDark: { r: 80, g: 100, b: 57 },   // Darker olive
  primaryLight: { r: 245, g: 248, b: 241 }, // Very light olive bg (lighter)
  primaryMedium: { r: 220, g: 230, b: 210 }, // Medium light olive for accents
  text: { r: 30, g: 30, b: 30 },
  textMuted: { r: 100, g: 100, b: 100 },
  textLight: { r: 150, g: 150, b: 150 },
  border: { r: 200, g: 210, b: 190 },       // Light olive border
  borderLight: { r: 230, g: 230, b: 230 },  // Very light border
  white: { r: 255, g: 255, b: 255 },
  background: { r: 252, g: 252, b: 250 }
}

let ACTIVE = BRAND
function derivePalette(company?: { primaryColor?: string }): typeof BRAND {
  const [r, g, b] = brandColorRgb(company, [BRAND.primary.r, BRAND.primary.g, BRAND.primary.b])
  if (r === BRAND.primary.r && g === BRAND.primary.g && b === BRAND.primary.b) return BRAND
  const T = (f: number) => { const [tr, tg, tb] = tint([r, g, b], f); return { r: tr, g: tg, b: tb } }
  return {
    ...BRAND,
    primary: { r, g, b },
    primaryDark: { r: Math.round(r * 0.8), g: Math.round(g * 0.8), b: Math.round(b * 0.8) },
    primaryLight: T(0.94),
    primaryMedium: T(0.82),
    border: T(0.7),
  }
}

const DOCUMENT_TITLES: Record<string, string> = {
  hotel_voucher: 'HOTEL VOUCHER',
  service_order: 'SERVICE ORDER',
  transport_voucher: 'TRANSPORT VOUCHER',
  activity_voucher: 'ACTIVITY VOUCHER',
  guide_assignment: 'GUIDE ASSIGNMENT',
  cruise_voucher: 'CRUISE VOUCHER',
  entrance_fees: 'ENTRANCE FEES ORDER'
}

const DOCUMENT_ICONS: Record<string, string> = {
  hotel_voucher: '🏨',
  service_order: '📋',
  transport_voucher: '🚐',
  activity_voucher: '🎫',
  guide_assignment: '👤',
  cruise_voucher: '🚢',
  entrance_fees: '🎟️'
}

export function generateSupplierDocumentPDF(doc: SupplierDocument): jsPDF {
  ACTIVE = derivePalette(doc.company ?? undefined)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - (margin * 2)
  
  let y = margin
  
  const title = DOCUMENT_TITLES[doc.document_type] || 'SERVICE DOCUMENT'

  // ==================== HEADER: the agency's letterhead ====================
  // Settings → Organization (lib/pdf-letterhead). Was a hard-coded
  // "TRAVEL2EGYPT / Your Gateway to Egypt" for every agency.

  const company: CompanyIdentity = doc.company ?? { name: '' }
  const issueDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  y = drawLetterhead(pdf, company, ACTIVE.primary, { title, number: doc.document_number, dateLine: `Issued ${issueDate}` }, margin)

  // Content stops above the footer, which is drawn on every page at the end.
  const bottomLimit = pageHeight - footerReserve(pdf, company, contentWidth) - 4
  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      pdf.addPage()
      y = drawContinuationHeader(pdf, ACTIVE.primary)
    }
  }

  // ==================== SUPPLIER & GUEST INFO ====================
  
  // Two-column layout
  const colWidth = (contentWidth - 6) / 2
  
  // Supplier Box (Left)
  pdf.setFillColor(ACTIVE.background.r, ACTIVE.background.g, ACTIVE.background.b)
  pdf.setDrawColor(ACTIVE.border.r, ACTIVE.border.g, ACTIVE.border.b)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(margin, y, colWidth, 38, 3, 3, 'FD')
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
  pdf.text('SUPPLIER', margin + 4, y + 5)
  
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
  pdf.text(doc.supplier_name || 'N/A', margin + 4, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)
  
  let supplierY = y + 18
  if (doc.supplier_address) {
    const addressLines = pdf.splitTextToSize(doc.supplier_address, colWidth - 8)
    pdf.text(addressLines.slice(0, 2), margin + 4, supplierY)
    supplierY += addressLines.slice(0, 2).length * 4
  }
  if (doc.supplier_contact_phone) {
    pdf.text(`Tel: ${doc.supplier_contact_phone}`, margin + 4, supplierY)
    supplierY += 4
  }
  if (doc.supplier_whatsapp) {
    pdf.text(`WhatsApp: ${doc.supplier_whatsapp}`, margin + 4, supplierY)
    supplierY += 4
  }
  if (doc.supplier_contact_email) {
    pdf.text(`Email: ${doc.supplier_contact_email}`, margin + 4, supplierY)
  }
  
  // Guest Box (Right)
  const guestBoxX = margin + colWidth + 6
  pdf.setFillColor(ACTIVE.primaryLight.r, ACTIVE.primaryLight.g, ACTIVE.primaryLight.b)
  pdf.setDrawColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
  pdf.roundedRect(guestBoxX, y, colWidth, 38, 3, 3, 'FD')
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
  pdf.text('GUEST INFORMATION', guestBoxX + 4, y + 5)
  
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
  pdf.text(doc.client_name || 'N/A', guestBoxX + 4, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)
  
  if (doc.client_nationality) {
    pdf.text(`Nationality: ${doc.client_nationality}`, guestBoxX + 4, y + 18)
  }
  
  // PAX display
  const totalPax = doc.num_adults + (doc.num_children || 0)
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
  pdf.text(totalPax.toString(), guestBoxX + colWidth - 15, y + 18)
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)
  pdf.text('PAX', guestBoxX + colWidth - 15, y + 23)
  
  let paxDetail = `${doc.num_adults} Adult${doc.num_adults !== 1 ? 's' : ''}`
  if (doc.num_children > 0) {
    paxDetail += ` + ${doc.num_children} Child${doc.num_children !== 1 ? 'ren' : ''}`
  }
  pdf.text(paxDetail, guestBoxX + 4, y + 33)
  
  if (doc.city) {
    pdf.text(doc.city, guestBoxX + 4, y + 28)
  }
  
  y += 45

  // ==================== DATE/TIME SECTION ====================
  
  if (doc.document_type === 'hotel_voucher' || doc.document_type === 'cruise_voucher') {
    // Hotel/Cruise: Check-in / Check-out with nights
    const dateBoxWidth = (contentWidth - 12) / 3
    
    // Check-in
    pdf.setFillColor(ACTIVE.white.r, ACTIVE.white.g, ACTIVE.white.b)
    pdf.setDrawColor(ACTIVE.border.r, ACTIVE.border.g, ACTIVE.border.b)
    pdf.roundedRect(margin, y, dateBoxWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    pdf.text('CHECK-IN', margin + 4, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
    const checkInDate = doc.check_in ? formatDateOnly(doc.check_in, 'en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }) : '—'
    pdf.text(checkInDate, margin + 4, y + 14)
    
    // Check-out
    pdf.roundedRect(margin + dateBoxWidth + 6, y, dateBoxWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    pdf.text('CHECK-OUT', margin + dateBoxWidth + 10, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
    const checkOutDate = doc.check_out ? formatDateOnly(doc.check_out, 'en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }) : '—'
    pdf.text(checkOutDate, margin + dateBoxWidth + 10, y + 14)
    
    // Nights
    pdf.setFillColor(ACTIVE.primaryLight.r, ACTIVE.primaryLight.g, ACTIVE.primaryLight.b)
    pdf.setDrawColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    pdf.roundedRect(margin + (dateBoxWidth + 6) * 2, y, dateBoxWidth, 22, 3, 3, 'FD')

    let nights = 0
    if (doc.check_in && doc.check_out) {
      nights = daysBetween(doc.check_in, doc.check_out)
    }

    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    pdf.text('DURATION', margin + (dateBoxWidth + 6) * 2 + 4, y + 5)

    pdf.setFontSize(14)
    pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
    pdf.text(`${nights} NIGHT${nights !== 1 ? 'S' : ''}`, margin + (dateBoxWidth + 6) * 2 + dateBoxWidth / 2, y + 15, { align: 'center' })
    
    y += 28
    
  } else {
    // Other documents: Service date, pickup time, locations
    const dateBoxWidth = (contentWidth - 6) / 2
    
    // Service Date
    pdf.setFillColor(ACTIVE.white.r, ACTIVE.white.g, ACTIVE.white.b)
    pdf.setDrawColor(ACTIVE.border.r, ACTIVE.border.g, ACTIVE.border.b)
    pdf.roundedRect(margin, y, dateBoxWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    pdf.text('SERVICE DATE', margin + 4, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
    const serviceDate = doc.service_date ? formatDateOnly(doc.service_date, 'en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    }) : '—'
    pdf.text(serviceDate, margin + 4, y + 14)
    
    // Pickup Time
    pdf.setFillColor(ACTIVE.primaryLight.r, ACTIVE.primaryLight.g, ACTIVE.primaryLight.b)
    pdf.setDrawColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    pdf.roundedRect(margin + dateBoxWidth + 6, y, dateBoxWidth, 22, 3, 3, 'FD')

    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    pdf.text('PICKUP TIME', margin + dateBoxWidth + 10, y + 5)

    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
    pdf.text(doc.pickup_time || '—', margin + dateBoxWidth + 10, y + 15)
    
    y += 28
    
    // Pickup/Dropoff for transport (only show single-route box when no selected_routes)
    if (doc.document_type === 'transport_voucher' && !doc.selected_routes?.length && (doc.pickup_location || doc.dropoff_location)) {
      pdf.setFillColor(ACTIVE.background.r, ACTIVE.background.g, ACTIVE.background.b)
      pdf.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F')

      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)

      if (doc.pickup_location) {
        pdf.setFont('helvetica', 'bold')
        pdf.text('FROM:', margin + 4, y + 7)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
        pdf.text(doc.pickup_location, margin + 20, y + 7)
      }

      if (doc.dropoff_location) {
        pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)
        pdf.setFont('helvetica', 'bold')
        pdf.text('TO:', margin + 4, y + 13)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
        pdf.text(doc.dropoff_location, margin + 20, y + 13)
      }

      y += 24
    }

    // Vehicle Type & Driver for transport
    if (doc.document_type === 'transport_voucher' && (doc.vehicle_type || doc.driver_name)) {
      const vehicleTypeLabels = VOUCHER_VEHICLE_TYPES

      const halfWidth = (contentWidth - 6) / 2

      // Vehicle Type Box
      pdf.setFillColor(ACTIVE.primaryLight.r, ACTIVE.primaryLight.g, ACTIVE.primaryLight.b)
      pdf.setDrawColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
      pdf.roundedRect(margin, y, halfWidth, 18, 3, 3, 'FD')

      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
      pdf.text('VEHICLE TYPE', margin + 4, y + 5)

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
      const vehicleLabel = doc.vehicle_type ? (vehicleTypeLabels[doc.vehicle_type] || doc.vehicle_type) : '—'
      pdf.text(vehicleLabel, margin + 4, y + 13)

      // Driver Name Box
      pdf.setFillColor(ACTIVE.background.r, ACTIVE.background.g, ACTIVE.background.b)
      pdf.setDrawColor(ACTIVE.border.r, ACTIVE.border.g, ACTIVE.border.b)
      pdf.roundedRect(margin + halfWidth + 6, y, halfWidth, 18, 3, 3, 'FD')

      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)
      pdf.text('DRIVER', margin + halfWidth + 10, y + 5)

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
      pdf.text(doc.driver_name || 'To be assigned', margin + halfWidth + 10, y + 13)

      y += 24
    }
  }

  // ==================== SERVICES TABLE ====================
  
  // The voucher's lines: `services`, else another list with lines (lib/documents/voucher-lines).
  const items = voucherLines(doc)

  if (items.length > 0) {
    ensureSpace(32)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
    pdf.text('SERVICES / ITEMS', margin, y + 5)
    y += 10
    
    // Table header
    pdf.setFillColor(ACTIVE.primaryLight.r, ACTIVE.primaryLight.g, ACTIVE.primaryLight.b)
    pdf.setDrawColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'FD')

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
    // A voucher's lines span days (a guide on days 2, 4 and 6; a transport
    // supplier's whole week), and only the page showed which line was which
    // day: the PDF the supplier receives printed none.
    const dated = items.some((item: { date?: unknown }) => !!item.date)
    const descX = dated ? margin + 26 : margin + 4
    const descWidth = contentWidth - 60 - (descX - margin - 4)
    if (dated) pdf.text('Date', margin + 4, y + 6.5)
    pdf.text('Description', descX, y + 6.5)
    pdf.text('Qty', pageWidth - margin - 40, y + 6.5, { align: 'center' })
    pdf.text('Amount', pageWidth - margin - 4, y + 6.5, { align: 'right' })
    
    y += 12
    
    items.forEach((item: any, idx: number) => {
      // Get item name
      const itemName = item.route_name || item.restaurant_name || (item.guide_language ? `${item.guide_language} ${(item.guide_type || '').replace(/_/g, ' ')} - ${(item.tour_duration || '').replace(/_/g, ' ')}` : null) || item.attraction_name || item.service_name || item.service_type || 'Service'
      const itemCity = item.city ? ` (${item.city})` : ''
      // The whole name, wrapped — an entrance order names its sites, which
      // ran past the 60 characters this used to cut at — and the line's
      // notes under it ("Inside: … | Photo stops: …"), never printed before.
      pdf.setFontSize(8)
      const nameLines: string[] = pdf.splitTextToSize(itemName + itemCity, descWidth).slice(0, 3)
      pdf.setFontSize(7)
      const noteLines: string[] = item.notes && typeof item.notes === 'string'
        ? pdf.splitTextToSize(item.notes, descWidth).slice(0, 2)
        : []
      const rowHeight = Math.max(10, 4 + nameLines.length * 4 + noteLines.length * 3.5)

      const isOdd = idx % 2 === 0
      if (isOdd) {
        pdf.setFillColor(ACTIVE.background.r, ACTIVE.background.g, ACTIVE.background.b)
        pdf.rect(margin, y, contentWidth, rowHeight, 'F')
      }

      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
      if (dated && item.date) {
        pdf.text(formatDateOnly(String(item.date), 'en-US', { day: 'numeric', month: 'short' }), margin + 4, y + 6.5)
      }
      pdf.text(nameLines, descX, y + 6.5)
      if (noteLines.length > 0) {
        pdf.setFontSize(7)
        pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)
        pdf.text(noteLines, descX, y + 6.5 + nameLines.length * 4)
        pdf.setFontSize(8)
        pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
      }

      // Quantity
      const qty = item.quantity || 1
      pdf.text(qty.toString(), pageWidth - margin - 40, y + 6.5, { align: 'center' })

      // Amount
      // numeric columns arrive as strings: "100.00".toFixed threw.
      const amount = Number(item.total_cost || item.total_price || item.eur_rate || item.unit_price || 0) || 0
      if (amount > 0) {
        pdf.text(formatMoney(amount, doc.currency), pageWidth - margin - 4, y + 6.5, { align: 'right' })
      } else {
        pdf.text('—', pageWidth - margin - 4, y + 6.5, { align: 'right' })
      }

      y += rowHeight
      
      // Page break before the next row would run into the footer
      if (idx < items.length - 1) ensureSpace(14)
    })
    
    y += 5
  }

  // ==================== SPECIAL REQUESTS ====================
  
  if (doc.special_requests) {
    // Every line of it, the box sized to the text and broken across pages.
    // It printed three lines in a fixed box: a dietary note, an access need
    // or a guide's languages past the third line never reached the supplier.
    pdf.setFontSize(9)
    const requestLines: string[] = pdf.splitTextToSize(doc.special_requests, contentWidth - 8)
    const lineHeight = 4.2
    let start = 0
    while (start < requestLines.length) {
      ensureSpace(12 + lineHeight * Math.min(3, requestLines.length - start))
      const room = Math.max(1, Math.floor((bottomLimit - y - 12) / lineHeight))
      const chunk = requestLines.slice(start, start + room)
      const boxHeight = 10 + chunk.length * lineHeight
      pdf.setFillColor(255, 250, 240)
      pdf.setDrawColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
      pdf.setLineWidth(0.5)
      pdf.roundedRect(margin, y, contentWidth, boxHeight, 3, 3, 'FD')

      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
      pdf.text(start === 0 ? 'SPECIAL REQUESTS' : 'SPECIAL REQUESTS (CONTINUED)', margin + 4, y + 5)

      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
      pdf.text(chunk, margin + 4, y + 10.5, { lineHeightFactor: 1.32 })

      y += boxHeight + 6
      start += chunk.length
    }
  }

  // ==================== TOTAL & PAYMENT ====================
  
  ensureSpace(28 + 22)
  // Payment terms (left)
  const paymentBoxWidth = contentWidth * 0.55
  pdf.setFillColor(ACTIVE.background.r, ACTIVE.background.g, ACTIVE.background.b)
  pdf.roundedRect(margin, y, paymentBoxWidth, 18, 3, 3, 'F')
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)
  pdf.text('PAYMENT TERMS', margin + 4, y + 5)
  
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
  const paymentTermsDisplay: Record<string, string> = {
    'prepaid': 'PREPAID',
    'credit': 'CREDIT TERMS',
    'on_service': 'PAY ON SERVICE DATE',
    'commission': 'COMMISSION BASED'
  }
  const paymentTermsText = doc.payment_terms ? (paymentTermsDisplay[doc.payment_terms] || doc.payment_terms.replace(/_/g, ' ').toUpperCase()) : 'TO BE CONFIRMED'
  pdf.text(paymentTermsText, margin + 4, y + 13)
  
  // Total (right)
  const totalBoxWidth = contentWidth * 0.4
  const totalBoxX = pageWidth - margin - totalBoxWidth
  pdf.setFillColor(ACTIVE.primaryLight.r, ACTIVE.primaryLight.g, ACTIVE.primaryLight.b)
  pdf.setDrawColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
  pdf.setLineWidth(0.8)
  pdf.roundedRect(totalBoxX, y, totalBoxWidth, 18, 3, 3, 'FD')

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ACTIVE.primary.r, ACTIVE.primary.g, ACTIVE.primary.b)
  pdf.text('TOTAL AMOUNT', totalBoxX + 4, y + 5)

  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ACTIVE.text.r, ACTIVE.text.g, ACTIVE.text.b)
  pdf.text(formatMoney(doc.total_cost, doc.currency), totalBoxX + totalBoxWidth - 4, y + 14, { align: 'right' })
  
  y += 28

  // ==================== SIGNATURES ====================
  
  const sigWidth = (contentWidth - 20) / 2
  
  // Our signature
  pdf.setDrawColor(ACTIVE.border.r, ACTIVE.border.g, ACTIVE.border.b)
  pdf.setLineWidth(0.3)
  pdf.line(margin, y + 12, margin + sigWidth, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ACTIVE.textMuted.r, ACTIVE.textMuted.g, ACTIVE.textMuted.b)
  pdf.text(doc.company?.name ? `Authorized by ${doc.company.name}` : 'Authorized signature', margin, y + 18)
  
  // Supplier signature
  pdf.line(pageWidth - margin - sigWidth, y + 12, pageWidth - margin, y + 12)
  pdf.text('Supplier Confirmation & Stamp', pageWidth - margin - sigWidth, y + 18)

  // ==================== FOOTER: every page ====================

  drawFooters(pdf, company, ACTIVE.primary, doc.document_number, margin)

  return pdf
}