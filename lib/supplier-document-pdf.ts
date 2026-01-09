// lib/supplier-document-pdf.ts
// Professional Supplier Document PDF Generator
// Unified branding with Travel2Egypt / Autoura colors

import jsPDF from 'jspdf'

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
}

// Brand colors
const BRAND = {
  primary: { r: 100, g: 124, b: 71 },      // Olive green #647C47
  primaryDark: { r: 80, g: 100, b: 57 },   // Darker olive
  primaryLight: { r: 240, g: 244, b: 236 }, // Light olive bg
  text: { r: 30, g: 30, b: 30 },
  textMuted: { r: 100, g: 100, b: 100 },
  textLight: { r: 150, g: 150, b: 150 },
  border: { r: 220, g: 220, b: 220 },
  white: { r: 255, g: 255, b: 255 },
  background: { r: 250, g: 250, b: 250 }
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

  // ==================== HEADER SECTION ====================
  
  // Top accent bar
  pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.rect(0, 0, pageWidth, 8, 'F')
  
  y = 15
  
  // Company Logo Area (Left side)
  pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
  pdf.roundedRect(margin, y, 55, 20, 3, 3, 'F')
  
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text('TRAVEL2EGYPT', margin + 5, y + 9)
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text('Your Gateway to Egypt', margin + 5, y + 15)
  
  // Document Type & Number (Right side)
  const rightBoxX = pageWidth - margin - 65
  pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.roundedRect(rightBoxX, y, 65, 20, 3, 3, 'F')
  
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
  pdf.text(title, rightBoxX + 32.5, y + 8, { align: 'center' })
  
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(doc.document_number, rightBoxX + 32.5, y + 15, { align: 'center' })
  
  y += 28
  
  // Issue date line
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  const issueDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long',
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  })
  pdf.text(`Issue Date: ${issueDate}`, pageWidth - margin, y, { align: 'right' })
  
  y += 8

  // ==================== SUPPLIER & GUEST INFO ====================
  
  // Two-column layout
  const colWidth = (contentWidth - 6) / 2
  
  // Supplier Box (Left)
  pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
  pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(margin, y, colWidth, 38, 3, 3, 'FD')
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text('SUPPLIER', margin + 4, y + 5)
  
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
  pdf.text(doc.supplier_name || 'N/A', margin + 4, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  
  let supplierY = y + 18
  if (doc.supplier_address) {
    const addressLines = pdf.splitTextToSize(doc.supplier_address, colWidth - 8)
    pdf.text(addressLines.slice(0, 2), margin + 4, supplierY)
    supplierY += addressLines.slice(0, 2).length * 4
  }
  if (doc.supplier_contact_phone) {
    pdf.text(`📞 ${doc.supplier_contact_phone}`, margin + 4, supplierY)
    supplierY += 4
  }
  if (doc.supplier_contact_email) {
    pdf.text(`✉️ ${doc.supplier_contact_email}`, margin + 4, supplierY)
  }
  
  // Guest Box (Right)
  const guestBoxX = margin + colWidth + 6
  pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
  pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.roundedRect(guestBoxX, y, colWidth, 38, 3, 3, 'FD')
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text('GUEST INFORMATION', guestBoxX + 4, y + 5)
  
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
  pdf.text(doc.client_name || 'N/A', guestBoxX + 4, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  
  if (doc.client_nationality) {
    pdf.text(`Nationality: ${doc.client_nationality}`, guestBoxX + 4, y + 18)
  }
  
  // PAX display
  const totalPax = doc.num_adults + (doc.num_children || 0)
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text(totalPax.toString(), guestBoxX + colWidth - 15, y + 18)
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text('PAX', guestBoxX + colWidth - 15, y + 23)
  
  let paxDetail = `${doc.num_adults} Adult${doc.num_adults !== 1 ? 's' : ''}`
  if (doc.num_children > 0) {
    paxDetail += ` + ${doc.num_children} Child${doc.num_children !== 1 ? 'ren' : ''}`
  }
  pdf.text(paxDetail, guestBoxX + 4, y + 33)
  
  if (doc.city) {
    pdf.text(`📍 ${doc.city}`, guestBoxX + 4, y + 28)
  }
  
  y += 45

  // ==================== DATE/TIME SECTION ====================
  
  if (doc.document_type === 'hotel_voucher' || doc.document_type === 'cruise_voucher') {
    // Hotel/Cruise: Check-in / Check-out with nights
    const dateBoxWidth = (contentWidth - 12) / 3
    
    // Check-in
    pdf.setFillColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
    pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
    pdf.roundedRect(margin, y, dateBoxWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text('CHECK-IN', margin + 4, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    const checkInDate = doc.check_in ? new Date(doc.check_in).toLocaleDateString('en-US', { 
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
    }) : '—'
    pdf.text(checkInDate, margin + 4, y + 14)
    
    // Check-out
    pdf.roundedRect(margin + dateBoxWidth + 6, y, dateBoxWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text('CHECK-OUT', margin + dateBoxWidth + 10, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    const checkOutDate = doc.check_out ? new Date(doc.check_out).toLocaleDateString('en-US', { 
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
    }) : '—'
    pdf.text(checkOutDate, margin + dateBoxWidth + 10, y + 14)
    
    // Nights
    pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.roundedRect(margin + (dateBoxWidth + 6) * 2, y, dateBoxWidth, 22, 3, 3, 'F')
    
    let nights = 0
    if (doc.check_in && doc.check_out) {
      nights = Math.ceil((new Date(doc.check_out).getTime() - new Date(doc.check_in).getTime()) / (1000 * 60 * 60 * 24))
    }
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
    pdf.text('DURATION', margin + (dateBoxWidth + 6) * 2 + 4, y + 5)
    
    pdf.setFontSize(14)
    pdf.text(`${nights} NIGHT${nights !== 1 ? 'S' : ''}`, margin + (dateBoxWidth + 6) * 2 + dateBoxWidth / 2, y + 15, { align: 'center' })
    
    y += 28
    
  } else {
    // Other documents: Service date, pickup time, locations
    const dateBoxWidth = (contentWidth - 6) / 2
    
    // Service Date
    pdf.setFillColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
    pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
    pdf.roundedRect(margin, y, dateBoxWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text('SERVICE DATE', margin + 4, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    const serviceDate = doc.service_date ? new Date(doc.service_date).toLocaleDateString('en-US', { 
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
    }) : '—'
    pdf.text(serviceDate, margin + 4, y + 14)
    
    // Pickup Time
    pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.roundedRect(margin + dateBoxWidth + 6, y, dateBoxWidth, 22, 3, 3, 'F')
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
    pdf.text('PICKUP TIME', margin + dateBoxWidth + 10, y + 5)
    
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.text(doc.pickup_time || '—', margin + dateBoxWidth + 10, y + 15)
    
    y += 28
    
    // Pickup/Dropoff for transport
    if (doc.document_type === 'transport_voucher' && (doc.pickup_location || doc.dropoff_location)) {
      pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
      pdf.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F')
      
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
      
      if (doc.pickup_location) {
        pdf.setFont('helvetica', 'bold')
        pdf.text('FROM:', margin + 4, y + 7)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
        pdf.text(doc.pickup_location, margin + 20, y + 7)
      }
      
      if (doc.dropoff_location) {
        pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
        pdf.setFont('helvetica', 'bold')
        pdf.text('TO:', margin + 4, y + 13)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
        pdf.text(doc.dropoff_location, margin + 20, y + 13)
      }
      
      y += 24
    }
  }

  // ==================== SERVICES TABLE ====================
  
  const hasServices = (doc.services && doc.services.length > 0) || (doc.selected_attractions && doc.selected_attractions.length > 0)
  
  if (hasServices) {
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    pdf.text('SERVICES / ITEMS', margin, y + 5)
    y += 10
    
    // Table header
    pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F')
    
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
    pdf.text('Description', margin + 4, y + 6.5)
    pdf.text('Qty', pageWidth - margin - 40, y + 6.5, { align: 'center' })
    pdf.text('Amount', pageWidth - margin - 4, y + 6.5, { align: 'right' })
    
    y += 12
    
    // Use selected_attractions if available (entrance fees), otherwise use services
    const items = doc.selected_attractions || doc.services || []
    
    items.forEach((item: any, idx: number) => {
      const isOdd = idx % 2 === 0
      if (isOdd) {
        pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
        pdf.rect(margin, y, contentWidth, 10, 'F')
      }
      
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
      
      // Get item name
      const itemName = item.attraction_name || item.service_name || item.service_type || 'Service'
      const itemCity = item.city ? ` (${item.city})` : ''
      pdf.text((itemName + itemCity).substring(0, 60), margin + 4, y + 6.5)
      
      // Quantity
      const qty = item.quantity || 1
      pdf.text(qty.toString(), pageWidth - margin - 40, y + 6.5, { align: 'center' })
      
      // Amount
      const amount = item.total_price || item.eur_rate || item.unit_price || 0
      if (amount > 0) {
        pdf.text(`${doc.currency} ${(amount * qty).toFixed(2)}`, pageWidth - margin - 4, y + 6.5, { align: 'right' })
      } else {
        pdf.text('—', pageWidth - margin - 4, y + 6.5, { align: 'right' })
      }
      
      y += 10
      
      // Page break check
      if (y > pageHeight - 70) {
        pdf.addPage()
        y = margin
        
        // Re-add header bar on new page
        pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
        pdf.rect(0, 0, pageWidth, 5, 'F')
        y = 15
      }
    })
    
    y += 5
  }

  // ==================== SPECIAL REQUESTS ====================
  
  if (doc.special_requests) {
    pdf.setFillColor(255, 250, 240)
    pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(margin, y, contentWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text('⚠️ SPECIAL REQUESTS', margin + 4, y + 5)
    
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    const requestLines = pdf.splitTextToSize(doc.special_requests, contentWidth - 8)
    pdf.text(requestLines.slice(0, 3), margin + 4, y + 12)
    
    y += 28
  }

  // ==================== TOTAL & PAYMENT ====================
  
  // Payment terms (left)
  const paymentBoxWidth = contentWidth * 0.55
  pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
  pdf.roundedRect(margin, y, paymentBoxWidth, 18, 3, 3, 'F')
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text('PAYMENT TERMS', margin + 4, y + 5)
  
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
  const paymentTermsText = (doc.payment_terms || 'as_agreed').replace(/_/g, ' ').toUpperCase()
  pdf.text(paymentTermsText, margin + 4, y + 13)
  
  // Total (right)
  const totalBoxWidth = contentWidth * 0.4
  const totalBoxX = pageWidth - margin - totalBoxWidth
  pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.roundedRect(totalBoxX, y, totalBoxWidth, 18, 3, 3, 'F')
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
  pdf.text('TOTAL AMOUNT', totalBoxX + 4, y + 5)
  
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text(`${doc.currency} ${doc.total_cost.toFixed(2)}`, totalBoxX + totalBoxWidth - 4, y + 14, { align: 'right' })
  
  y += 28

  // ==================== SIGNATURES ====================
  
  const sigWidth = (contentWidth - 20) / 2
  
  // Our signature
  pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
  pdf.setLineWidth(0.3)
  pdf.line(margin, y + 12, margin + sigWidth, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text('Authorized by Travel2Egypt', margin, y + 18)
  
  // Supplier signature
  pdf.line(pageWidth - margin - sigWidth, y + 12, pageWidth - margin, y + 12)
  pdf.text('Supplier Confirmation & Stamp', pageWidth - margin - sigWidth, y + 18)

  // ==================== FOOTER ====================
  
  const footerY = pageHeight - 12
  
  // Footer bar
  pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
  pdf.rect(0, footerY - 8, pageWidth, 20, 'F')
  
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text('Travel2Egypt | www.travel2egypt.com | reservations@travel2egypt.com | +20 100 XXX XXXX', pageWidth / 2, footerY, { align: 'center' })
  
  pdf.setFontSize(6)
  pdf.setTextColor(BRAND.textLight.r, BRAND.textLight.g, BRAND.textLight.b)
  pdf.text(`Document generated on ${new Date().toLocaleString()} | ${doc.document_number}`, pageWidth / 2, footerY + 5, { align: 'center' })

  return pdf
}