// ============================================
// CONTRACT PDF GENERATOR (browser and server)
// ============================================
// On the agency's letterhead (lib/pdf-letterhead), like every other document:
// logo, name and tagline at the top; address, contacts, licence/tax numbers
// and the agency's note at the foot of every page — all from Settings →
// Organization. Was pdf-lib with its own header and a one-line footer.

import jsPDF from 'jspdf'
import { formatDateOnly } from '@/lib/date-utils'
import { brandColorRgb, fetchLogoDataUrl, type CompanyIdentity } from '@/lib/company-identity'
import { drawLetterhead, drawContinuationHeader, drawFooters, footerReserve } from '@/lib/pdf-letterhead'

interface ContractData {
  /** The operator issuing the contract — the "Service Provider" party. This
   *  generator hardcoded Travel2Egypt there, i.e. named the wrong LEGAL PARTY
   *  on other tenants' contracts. Omitted fields omit their lines; a missing
   *  primaryColor keeps the original olive palette, a missing logoUrl keeps
   *  the text-only header. Server callers validate logoUrl (SSRF) first. */
  company?: Omit<CompanyIdentity, 'logoUrl' | 'primaryColor' | 'email' | 'phone' | 'website'> & {
    email?: string | null
    phone?: string | null
    website?: string | null
    primaryColor?: string | null
    logoUrl?: string | null
  }
  contractNumber: string
  contractDate: string
  clientName: string
  clientEmail?: string
  numTravelers: number
  tourName: string
  startDate: string
  endDate: string
  destinations: string
  totalCost: number
  currency: string
  inclusions?: string[]
  exclusions?: string[]
}

const DEFAULT_INCLUSIONS = [
  'Private transportation throughout',
  'Licensed Egyptologist guide',
  'Entrance fees to all sites',
  'Accommodation as specified',
  'Meals as mentioned',
  'All taxes and service charges',
]

const DEFAULT_EXCLUSIONS = [
  'International flights',
  'Travel insurance',
  'Personal expenses',
  'Guide gratuities (optional)',
]

export async function generateContractPDF(data: ContractData): Promise<Uint8Array> {
  const c = data.company
  const company: CompanyIdentity = {
    name: c?.name || '',
    email: c?.email || undefined,
    phone: c?.phone || undefined,
    website: c?.website || undefined,
    primaryColor: c?.primaryColor || undefined,
    tagline: c?.tagline,
    address: c?.address,
    licenseNumber: c?.licenseNumber,
    taxNumber: c?.taxNumber,
    footerText: c?.footerText,
    logoDataUrl: c?.logoDataUrl ?? (await fetchLogoDataUrl(c?.logoUrl)),
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2

  const [br, bg, bb] = brandColorRgb(company, [100, 124, 71])
  const brand = { r: br, g: bg, b: bb }
  const issued = formatDateOnly(data.contractDate, 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  let y = drawLetterhead(pdf, company, brand, { title: 'Travel Contract', number: data.contractNumber, dateLine: `Dated ${issued}` }, margin)

  const bottomLimit = pageHeight - footerReserve(pdf, company, contentWidth) - 4
  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      pdf.addPage()
      y = drawContinuationHeader(pdf, brand)
    }
  }

  // `keepWith`: room for what must follow the heading on the same page.
  const heading = (text: string, keepWith = 8) => {
    ensureSpace(8 + keepWith)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(br, bg, bb)
    pdf.text(text.toUpperCase(), margin, y)
    pdf.setDrawColor(230, 230, 230)
    pdf.setLineWidth(0.3)
    pdf.line(margin, y + 2, pageWidth - margin, y + 2)
    y += 8
  }

  const line = (label: string, value: string, opts: { muted?: boolean } = {}) => {
    const wrapped = pdf.splitTextToSize(value, contentWidth - 42) as string[]
    ensureSpace(wrapped.length * 5 + 1)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(110, 110, 110)
    pdf.text(label, margin, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(opts.muted ? 100 : 30, opts.muted ? 100 : 30, opts.muted ? 100 : 30)
    pdf.text(wrapped, margin + 42, y)
    y += wrapped.length * 5 + 1
  }

  // Parties
  heading('Parties')
  line('Service Provider', company.name || '(operator not specified)')
  if (company.address) line('Address', company.address.replace(/\s*\n\s*/g, ', '), { muted: true })
  if (company.licenseNumber) line('License No.', company.licenseNumber, { muted: true })
  y += 3
  line('Client', data.clientName)
  if (data.clientEmail) line('Email', data.clientEmail, { muted: true })
  line('Travelers', `${data.numTravelers} person${data.numTravelers > 1 ? 's' : ''}`)
  y += 6

  // Tour details
  heading('Tour details')
  line('Tour', data.tourName)
  line('Dates', `${formatDateOnly(data.startDate, 'en-GB')} – ${formatDateOnly(data.endDate, 'en-GB')}`)
  line('Destinations', data.destinations)
  y += 6

  // Financial terms
  heading('Financial terms')
  ensureSpace(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9.5)
  pdf.setTextColor(110, 110, 110)
  pdf.text('Total price', margin, y)
  pdf.setFontSize(13)
  pdf.setTextColor(br, bg, bb)
  pdf.text(`${data.currency} ${data.totalCost.toLocaleString()}`, margin + 42, y + 0.5)
  y += 7
  line('Payment', '10% deposit to confirm. Balance due upon arrival.')
  y += 6

  const bullets = (title: string, items: string[]) => {
    heading(title)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9.5)
    pdf.setTextColor(30, 30, 30)
    for (const item of items) {
      const wrapped = pdf.splitTextToSize(item, contentWidth - 8) as string[]
      ensureSpace(wrapped.length * 5)
      pdf.text('•', margin + 1, y)
      pdf.text(wrapped, margin + 6, y)
      y += wrapped.length * 5
    }
    y += 6
  }
  bullets('Inclusions', data.inclusions?.length ? data.inclusions : DEFAULT_INCLUSIONS)
  bullets('Exclusions', data.exclusions?.length ? data.exclusions : DEFAULT_EXCLUSIONS)

  // Signatures
  heading('Signatures', 30)
  y += 12
  const sigWidth = (contentWidth - 16) / 2
  pdf.setDrawColor(170, 170, 170)
  pdf.setLineWidth(0.3)
  pdf.line(margin, y, margin + sigWidth, y)
  pdf.line(pageWidth - margin - sigWidth, y, pageWidth - margin, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(110, 110, 110)
  pdf.text(company.name ? `Service Provider — ${company.name}` : 'Service Provider', margin, y + 5)
  pdf.text('Client', pageWidth - margin - sigWidth, y + 5)
  pdf.text('Date: ______________', margin, y + 11)
  pdf.text('Date: ______________', pageWidth - margin - sigWidth, y + 11)

  drawFooters(pdf, company, brand, data.contractNumber, margin)

  return new Uint8Array(pdf.output('arraybuffer'))
}
