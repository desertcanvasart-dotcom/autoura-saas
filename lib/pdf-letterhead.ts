// ============================================
// The agency's letterhead on a jsPDF document
// ============================================
// Header (logo, name, tagline, the document's title and number) and a footer
// on EVERY page (address, contacts, licence/tax numbers, the agency's own
// note, page x of y), all from Settings → Organization via CompanyIdentity.
// Same lines as the on-screen letterhead (components/documents/Letterhead).
// Supplier documents use it first; the other generators can adopt it.

import type jsPDF from 'jspdf'
import { letterheadFooterLines, type CompanyIdentity } from './company-identity'

type RGB = { r: number; g: number; b: number }

const MUTED: RGB = { r: 110, g: 110, b: 110 }
const LIGHT: RGB = { r: 150, g: 150, b: 150 }
const TEXT: RGB = { r: 30, g: 30, b: 30 }

/** Height the footer takes at the bottom of each page — keep content above it. */
export function footerReserve(pdf: jsPDF, company: CompanyIdentity, contentWidth: number): number {
  return 14 + footerLayout(pdf, company, contentWidth).length * 3.6
}

function footerLayout(pdf: jsPDF, company: CompanyIdentity, contentWidth: number): { text: string; size: number; bold?: boolean; light?: boolean }[] {
  const out: { text: string; size: number; bold?: boolean; light?: boolean }[] = []
  if (company.name) out.push({ text: company.name, size: 7.5, bold: true })
  pdf.setFontSize(7)
  for (const l of letterheadFooterLines(company)) {
    for (const part of pdf.splitTextToSize(l, contentWidth) as string[]) out.push({ text: part, size: 7 })
  }
  if (company.footerText) {
    pdf.setFontSize(6.5)
    const lines = (pdf.splitTextToSize(company.footerText, contentWidth) as string[]).slice(0, 3)
    for (const part of lines) out.push({ text: part, size: 6.5, light: true })
  }
  return out
}

/**
 * The header on the first page. Returns the y below it.
 */
export function drawLetterhead(
  pdf: jsPDF,
  company: CompanyIdentity,
  color: RGB,
  doc: { title: string; number: string; dateLine?: string },
  margin = 15,
): number {
  const pageWidth = pdf.internal.pageSize.getWidth()

  pdf.setFillColor(color.r, color.g, color.b)
  pdf.rect(0, 0, pageWidth, 4, 'F')

  const top = 14
  let textX = margin

  // Logo: fitted into 38 × 18 mm, aspect kept. Best-effort — a logo jsPDF
  // cannot read leaves a text-only header, never a failed document.
  if (company.logoDataUrl) {
    try {
      const props = pdf.getImageProperties(company.logoDataUrl)
      const maxW = 38
      const maxH = 18
      const ratio = Math.min(maxW / props.width, maxH / props.height)
      const w = props.width * ratio
      const h = props.height * ratio
      const format = /^data:image\/png/i.test(company.logoDataUrl) ? 'PNG' : 'JPEG'
      pdf.addImage(company.logoDataUrl, format, margin, top + (maxH - h) / 2, w, h)
      textX = margin + w + 5
    } catch {
      textX = margin
    }
  }

  const rightWidth = 62
  const nameWidth = pageWidth - margin - rightWidth - textX - 4
  if (company.name) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(15)
    pdf.setTextColor(color.r, color.g, color.b)
    const name = (pdf.splitTextToSize(company.name, nameWidth) as string[])[0]
    pdf.text(name, textX, top + 8)
  }
  if (company.tagline) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    const tag = (pdf.splitTextToSize(company.tagline, nameWidth) as string[]).slice(0, 2)
    pdf.text(tag, textX, top + (company.name ? 13.5 : 8))
  }

  // Title and number, right-aligned
  const rightX = pageWidth - margin
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(color.r, color.g, color.b)
  pdf.text(doc.title.toUpperCase(), rightX, top + 4, { align: 'right' })
  pdf.setFontSize(13)
  pdf.setTextColor(TEXT.r, TEXT.g, TEXT.b)
  pdf.text(doc.number, rightX, top + 10.5, { align: 'right' })
  if (doc.dateLine) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    pdf.text(doc.dateLine, rightX, top + 15.5, { align: 'right' })
  }

  const ruleY = top + 23
  pdf.setDrawColor(225, 225, 225)
  pdf.setLineWidth(0.3)
  pdf.line(margin, ruleY, pageWidth - margin, ruleY)
  return ruleY + 7
}

/** The thin brand bar on continuation pages. Returns the y to resume at. */
export function drawContinuationHeader(pdf: jsPDF, color: RGB): number {
  pdf.setFillColor(color.r, color.g, color.b)
  pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 4, 'F')
  return 15
}

/** Footer on every page, with "Page x of y" once there is more than one. */
export function drawFooters(
  pdf: jsPDF,
  company: CompanyIdentity,
  color: RGB,
  documentNumber: string,
  margin = 15,
): void {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - margin * 2
  const lines = footerLayout(pdf, company, contentWidth)
  const total = pdf.getNumberOfPages()

  for (let p = 1; p <= total; p++) {
    pdf.setPage(p)
    const bottom = pageHeight - 8
    let y = bottom - 4 - lines.length * 3.6
    pdf.setDrawColor(color.r, color.g, color.b)
    pdf.setLineWidth(0.5)
    pdf.line(margin, y - 3, pageWidth - margin, y - 3)

    for (const l of lines) {
      pdf.setFont('helvetica', l.bold ? 'bold' : 'normal')
      pdf.setFontSize(l.size)
      const c = l.bold ? TEXT : l.light ? LIGHT : MUTED
      pdf.setTextColor(c.r, c.g, c.b)
      pdf.text(l.text, pageWidth / 2, y + 1, { align: 'center' })
      y += 3.6
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    pdf.setTextColor(LIGHT.r, LIGHT.g, LIGHT.b)
    pdf.text(documentNumber, margin, bottom + 2)
    if (total > 1) pdf.text(`Page ${p} of ${total}`, pageWidth - margin, bottom + 2, { align: 'right' })
  }
}
