import { brandColorRgb, type CompanyIdentity } from './company-identity'
import { drawLetterhead, drawFooters } from './pdf-letterhead'
import { jsPDF } from 'jspdf'
import { formatDateOnly } from '@/lib/date-utils'
import { getCurrencySymbol } from '@/lib/currency'

interface ReceiptData {
  receiptNumber: string
  invoiceNumber: string
  clientName: string
  clientEmail: string
  paymentDate: string
  paymentMethod: string
  amount: number
  currency: string
  transactionRef: string | null
  notes: string | null
}

interface Invoice {
  invoice_number: string
  client_name: string
  total_amount: number
  currency: string
}

export function generateReceiptPDF(receipt: ReceiptData, invoice: Invoice, company: CompanyIdentity = { name: '' }): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  // Header: the agency's letterhead (Settings → Organization)
  const [br, bg, bb] = brandColorRgb(company, [100, 124, 71])
  const brand = { r: br, g: bg, b: bb }
  const paidOn = formatDateOnly(receipt.paymentDate, 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  y = drawLetterhead(doc, company, brand, { title: 'Payment Receipt', number: receipt.receiptNumber, dateLine: `Paid ${paidOn}` }, margin)
  y += 4

  // Client info
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text('Received From:', margin, y)

  y += 8
  doc.setFont('helvetica', 'normal')
  doc.text(receipt.clientName, margin, y)
  
  if (receipt.clientEmail) {
    y += 6
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(receipt.clientEmail, margin, y)
  }

  y += 20

  // Payment details box
  doc.setFillColor(br + (255 - br) * 0.94, bg + (255 - bg) * 0.94, bb + (255 - bb) * 0.94)
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 50, 3, 3, 'F')

  y += 10
  doc.setFontSize(11)
  doc.setTextColor(40, 40, 40)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Details', margin + 10, y)

  y += 10
  doc.setFont('helvetica', 'normal')
  doc.text(`Invoice: ${receipt.invoiceNumber}`, margin + 10, y)
  
  y += 7
  const methodLabel = receipt.paymentMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  doc.text(`Payment Method: ${methodLabel}`, margin + 10, y)

  if (receipt.transactionRef) {
    y += 7
    doc.text(`Transaction Ref: ${receipt.transactionRef}`, margin + 10, y)
  }

  y += 25

  // Amount
  const currencySymbol = getCurrencySymbol(receipt.currency)
  
  doc.setFillColor(br, bg, bb)
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 25, 3, 3, 'F')

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('AMOUNT RECEIVED', margin + 10, y + 10)
  
  doc.setFontSize(18)
  doc.text(`${currencySymbol}${Number(receipt.amount).toFixed(2)}`, pageWidth - margin - 10, y + 15, { align: 'right' })

  y += 40

  // Notes
  if (receipt.notes) {
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.setFont('helvetica', 'normal')
    doc.text('Notes:', margin, y)
    y += 6
    const noteLines = (doc.splitTextToSize(receipt.notes, pageWidth - 2 * margin) as string[]).slice(0, 6)
    doc.text(noteLines, margin, y)
    y += noteLines.length * 5 + 10
  }

  // Thank you
  y += 10
  doc.setFontSize(11)
  doc.setTextColor(br, bg, bb)
  doc.setFont('helvetica', 'bold')
  doc.text('Thank you for your payment!', pageWidth / 2, y, { align: 'center' })

  // Footer: the agency's details (Settings → Organization)
  drawFooters(doc, company, brand, receipt.receiptNumber, margin)

  return doc
}

export function downloadReceiptPDF(receipt: ReceiptData, invoice: Invoice, company: CompanyIdentity = { name: '' }) {
  const doc = generateReceiptPDF(receipt, invoice, company)
  doc.save(`Receipt-${receipt.receiptNumber}.pdf`)
}