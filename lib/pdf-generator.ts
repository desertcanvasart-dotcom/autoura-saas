// ============================================
// PDF GENERATOR - ITINERARY QUOTE
// File: lib/pdf-generator.ts
// ============================================

import { jsPDF } from 'jspdf'

// ============================================
// TYPES
// ============================================

interface Service {
  id: string
  service_type: string
  service_name: string
  quantity: number
  rate_eur?: number
  rate_non_eur?: number
  total_cost: number
  notes?: string
}

interface DayWithServices {
  id: string
  day_number: number
  date: string
  city: string
  title: string
  description: string
  overnight_city: string
  services?: Service[]
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  client_email?: string
  client_phone?: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  currency: string
  total_cost: number
  status: string
  notes?: string
  tier?: string
}

interface AggregatedService {
  name: string
  type: string
  quantity: number
  total: number
  rate: number
}

interface PDFOptions {
  showPricingBreakdown?: boolean  // true = show service breakdown, false = total only
  showServiceDetails?: boolean    // show individual service lines
}

const DEFAULT_OPTIONS: PDFOptions = {
  showPricingBreakdown: true,
  showServiceDetails: true
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Clean up service names for display
 */
function cleanServiceName(name: string, type: string): string {
  if (!name) return type || 'Service'
  
  let cleaned = name
    .replace(/^(Daily |Per Day |Standard )/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  return cleaned || type || 'Service'
}

/**
 * Clean day title - remove duplicate "Day X:" prefix if present
 */
function cleanDayTitle(title: string, dayNumber: number): string {
  if (!title) return `Day ${dayNumber}`
  
  // Remove existing "Day X:" or "Day X -" prefix patterns
  const cleaned = title
    .replace(/^Day\s*\d+\s*[:\-–—]\s*/i, '')
    .trim()
  
  return cleaned || `Day ${dayNumber}`
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

/**
 * Format short date (day + month only)
 */
function formatShortDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    })
  } catch {
    return dateStr
  }
}

/**
 * Get currency symbol
 */
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    EGP: 'E£'
  }
  return symbols[currency] || currency
}

/**
 * Format currency amount
 */
function formatCurrency(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency)
  return `${symbol}${Number(amount).toFixed(2)}`
}

/**
 * Draw a simple table
 */
function drawTable(
  doc: jsPDF,
  startY: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  margin: number
): number {
  const rowHeight = 8
  const headerHeight = 10
  let y = startY
  
  // Draw header background
  doc.setFillColor(100, 124, 71)
  doc.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), headerHeight, 'F')
  
  // Draw header text
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  
  let x = margin + 2
  headers.forEach((header, i) => {
    doc.text(header, x, y + 7)
    x += colWidths[i]
  })
  
  y += headerHeight
  
  // Draw rows
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  
  rows.forEach((row, rowIndex) => {
    // Alternate row background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 245)
      doc.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F')
    }
    
    x = margin + 2
    row.forEach((cell, i) => {
      // Truncate if too long
      const maxWidth = colWidths[i] - 4
      let text = cell || ''
      while (doc.getTextWidth(text) > maxWidth && text.length > 0) {
        text = text.slice(0, -1)
      }
      if (text !== cell && text.length > 0) {
        text = text.slice(0, -2) + '..'
      }
      doc.text(text, x, y + 5.5)
      x += colWidths[i]
    })
    
    y += rowHeight
  })
  
  // Draw border
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.rect(margin, startY, colWidths.reduce((a, b) => a + b, 0), y - startY)
  
  return y + 5
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

export function generateItineraryPDF(
  itinerary: Itinerary, 
  days: DayWithServices[],
  options: PDFOptions = DEFAULT_OPTIONS
): jsPDF {
  console.log('📄 PDF Generator started')
  
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  try {
    if (!itinerary) {
      throw new Error('Itinerary data is required')
    }
    
    if (!days || !Array.isArray(days)) {
      days = []
    }
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })
    
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - 2 * margin
    let yPos = margin
    
    const currency = itinerary.currency || 'EUR'
    
    // ============================================
    // HEADER
    // ============================================
    
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text('Travel2Egypt', margin, yPos + 8)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Quote: ${itinerary.itinerary_code || 'N/A'}`, pageWidth - margin, yPos + 5, { align: 'right' })
    doc.text(`Date: ${formatDate(new Date().toISOString())}`, pageWidth - margin, yPos + 10, { align: 'right' })
    
    yPos += 20
    
    // Divider
    doc.setDrawColor(100, 124, 71)
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    
    yPos += 10
    
    // ============================================
    // TRIP TITLE
    // ============================================
    
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(itinerary.trip_name || 'Egypt Tour Package', margin, yPos)
    
    yPos += 10
    
    // ============================================
    // TRIP INFO
    // ============================================
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    
    const infoLines = [
      `Client: ${itinerary.client_name || 'N/A'}`,
      `Travel Dates: ${formatDate(itinerary.start_date)} - ${formatDate(itinerary.end_date)}`,
      `Duration: ${itinerary.total_days || 0} days`,
      `Travelers: ${itinerary.num_adults || 0} adult${(itinerary.num_adults || 0) > 1 ? 's' : ''}${(itinerary.num_children || 0) > 0 ? `, ${itinerary.num_children} child${(itinerary.num_children || 0) > 1 ? 'ren' : ''}` : ''}`,
    ]
    
    if (itinerary.tier) {
      infoLines.push(`Package: ${itinerary.tier.charAt(0).toUpperCase() + itinerary.tier.slice(1)} Tier`)
    }
    
    infoLines.forEach(line => {
      doc.text(line, margin, yPos)
      yPos += 5
    })
    
    yPos += 10
    
    // ============================================
    // ITINERARY OVERVIEW TABLE
    // ============================================
    
    if (days.length > 0) {
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 124, 71)
      doc.text('ITINERARY OVERVIEW', margin, yPos)
      
      yPos += 8
      
      // Build table data - clean the titles to avoid "Day X: Day X:"
      const daysData = days.map(day => [
        `Day ${day.day_number || '?'}`,
        formatShortDate(day.date),
        cleanDayTitle(day.title, day.day_number) || day.city || '',
        day.overnight_city || ''
      ])
      
      yPos = drawTable(doc, yPos, ['Day', 'Date', 'Activities', 'Overnight'], daysData, [20, 25, 90, 45], margin)
      
      yPos += 5
    }
    
    // ============================================
    // DAY DETAILS
    // ============================================
    
    days.forEach((day, index) => {
      if (yPos > pageHeight - 60) {
        doc.addPage()
        yPos = margin
      }
      
      // Day header box
      doc.setFillColor(245, 247, 241)
      doc.rect(margin, yPos - 3, contentWidth, 10, 'F')
      
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(74, 92, 53)
      
      // FIX: Clean the title to avoid "Day X: Day X:" duplication
      const cleanedTitle = cleanDayTitle(day.title, day.day_number)
      doc.text(`Day ${day.day_number || index + 1}: ${cleanedTitle}`, margin + 3, yPos + 3)
      
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(120, 120, 120)
      doc.text(formatShortDate(day.date), pageWidth - margin - 3, yPos + 3, { align: 'right' })
      
      yPos += 12
      
      // Description
      if (day.description) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        
        const lines = doc.splitTextToSize(day.description, contentWidth - 10)
        doc.text(lines, margin + 5, yPos)
        yPos += lines.length * 4 + 5
      }
      
      yPos += 5
    })
    
    // ============================================
    // PRICING SUMMARY
    // ============================================
    
    if (yPos > pageHeight - 100) {
      doc.addPage()
      yPos = margin
    }
    
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text('PRICING SUMMARY', margin, yPos)
    
    yPos += 8
    
    // Show service breakdown only if enabled
    if (opts.showPricingBreakdown && opts.showServiceDetails) {
      // Aggregate services across all days
      const serviceMap = new Map<string, AggregatedService>()
      
      days.forEach((day) => {
        if (!day.services || !Array.isArray(day.services)) return
        
        day.services
          .filter((s) => s && (s.total_cost || 0) > 0)
          .forEach((service) => {
            const name = cleanServiceName(service.service_name, service.service_type)
            const key = `${service.service_type}-${name}`
            
            if (serviceMap.has(key)) {
              const existing = serviceMap.get(key)!
              existing.quantity += service.quantity || 0
              existing.total += service.total_cost || 0
            } else {
              const qty = service.quantity || 1
              const total = service.total_cost || 0
              serviceMap.set(key, {
                name,
                type: service.service_type,
                quantity: qty,
                total,
                rate: qty > 0 ? total / qty : total
              })
            }
          })
      })
      
      const serviceRows = Array.from(serviceMap.values()).map(s => [
        s.name,
        s.quantity.toString(),
        formatCurrency(s.rate, currency),
        formatCurrency(s.total, currency)
      ])
      
      if (serviceRows.length > 0) {
        yPos = drawTable(doc, yPos, ['Service', 'Qty', 'Rate', 'Total'], serviceRows, [85, 20, 35, 40], margin)
      } else {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(150, 150, 150)
        doc.text('No services calculated yet', margin, yPos)
        yPos += 10
      }
    } else {
      // Total only - no breakdown
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      doc.text('Package includes all services as per itinerary.', margin, yPos)
      yPos += 10
    }
    
    // ============================================
    // TOTAL BOX
    // ============================================
    
    yPos += 5
    const totalPrice = itinerary.total_cost || 0
    const totalPax = (itinerary.num_adults || 0) + (itinerary.num_children || 0)
    
    doc.setFillColor(100, 124, 71)
    doc.roundedRect(pageWidth - margin - 80, yPos, 80, 22, 2, 2, 'F')
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255)
    doc.text('TOTAL PRICE', pageWidth - margin - 75, yPos + 7)
    
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(formatCurrency(totalPrice, currency), pageWidth - margin - 5, yPos + 17, { align: 'right' })
    
    yPos += 32
    
    // Per person cost (if multiple travelers)
    if (totalPax > 1 && totalPrice > 0) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      const perPerson = totalPrice / totalPax
      doc.text(`(${formatCurrency(perPerson, currency)} per person)`, pageWidth - margin, yPos, { align: 'right' })
      yPos += 10
    }
    
    // ============================================
    // INCLUSIONS
    // ============================================
    
    if (yPos > pageHeight - 70) {
      doc.addPage()
      yPos = margin
    }
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text('INCLUSIONS', margin, yPos)
    yPos += 6
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    
    const inclusions = [
      'Private air-conditioned vehicle for all transfers and tours',
      'Professional English-speaking Egyptologist guide',
      'All entrance fees to sites mentioned in the itinerary',
      'Bottled water during tours',
      'All applicable taxes and service charges'
    ]
    
    inclusions.forEach(item => {
      doc.text(`• ${item}`, margin + 3, yPos)
      yPos += 5
    })
    
    yPos += 6
    
    // ============================================
    // EXCLUSIONS
    // ============================================
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text('EXCLUSIONS', margin, yPos)
    yPos += 6
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    
    const exclusions = [
      'International flights',
      'Travel insurance',
      'Personal expenses and tips (optional)',
      'Any items not mentioned in inclusions'
    ]
    
    exclusions.forEach(item => {
      doc.text(`• ${item}`, margin + 3, yPos)
      yPos += 5
    })
    
    yPos += 6
    
    // ============================================
    // PAYMENT TERMS
    // ============================================
    
    if (yPos > pageHeight - 35) {
      doc.addPage()
      yPos = margin
    }
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text('PAYMENT TERMS', margin, yPos)
    yPos += 6
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    
    const terms = [
      '30% deposit required to confirm booking',
      'Remaining balance due 14 days before arrival',
      'Payment accepted via bank transfer or credit card'
    ]
    
    terms.forEach(term => {
      doc.text(`• ${term}`, margin + 3, yPos)
      yPos += 5
    })
    
    // ============================================
    // FOOTER ON ALL PAGES
    // ============================================
    
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      const footerY = pageHeight - 10
      
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5)
      
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text('Travel2Egypt | www.travel2egypt.org | info@travel2egypt.org', pageWidth / 2, footerY, { align: 'center' })
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
    }
    
    console.log('📄 PDF generation complete!')
    return doc
    
  } catch (error) {
    console.error('❌ PDF Generation Error:', error)
    throw error
  }
}

// ============================================
// DOWNLOAD HELPER
// ============================================

export function downloadItineraryPDF(
  itinerary: Itinerary, 
  days: DayWithServices[], 
  filename?: string,
  options?: PDFOptions
): void {
  const doc = generateItineraryPDF(itinerary, days, options)
  const clientName = (itinerary.client_name || 'Client').replace(/\s+/g, '_')
  const defaultFilename = `${itinerary.itinerary_code}_${clientName}.pdf`
  doc.save(filename || defaultFilename)
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

// Download with full breakdown (default)
export function downloadWithBreakdown(itinerary: Itinerary, days: DayWithServices[], filename?: string): void {
  downloadItineraryPDF(itinerary, days, filename, { showPricingBreakdown: true, showServiceDetails: true })
}

// Download with total only (no service breakdown)
export function downloadTotalOnly(itinerary: Itinerary, days: DayWithServices[], filename?: string): void {
  downloadItineraryPDF(itinerary, days, filename, { showPricingBreakdown: false, showServiceDetails: false })
}