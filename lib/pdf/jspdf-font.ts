// ============================================
// Noto Sans JP on the jsPDF documents
// ============================================
// The jsPDF generators (itinerary, invoice, receipt, contract, supplier
// documents) drew everything in Helvetica, jsPDF's built-in face. It is
// WinAnsi only: a Japanese, Cyrillic or Greek client name, hotel, trip name or
// note came out as garbled Latin-1 on the customer's document. The quote PDFs
// (react-pdf) were moved to Noto Sans JP already (lib/pdf/quote-fonts.ts).
//
// jsPDF embeds a TTF whole — about 5 MB per weight — so the font goes in only
// when a document has text Helvetica cannot draw (needsUnicodeFont). An
// all-Latin invoice stays a small file.
//
// applyDocumentFont registers both weights (jsPDF cannot fake bold) and maps
// the generators' existing setFont('helvetica', …) calls onto the family, so
// every generator gains the font with one call instead of a rewrite. Noto Sans
// JP has no italic: italic is drawn upright.
//
// Isomorphic: the font data comes from lib/pdf/jspdf-font-server (fs) or
// lib/pdf/jspdf-font-browser (fetch).

import type { jsPDF } from 'jspdf'

export const UNICODE_FONT_FAMILY = 'NotoSansJP'

export interface JsPdfFont {
  family: string
  files: Array<{ name: string; base64: string; weight: 'normal' | 'bold' }>
}

/** The characters Helvetica draws: Latin-1 plus the WinAnsi extras (euro sign, curly quotes, dashes…). */
// WinAnsi (cp1252) 0x80–0x9F, as Unicode code points: the euro sign, curly
// quotes, dashes, ellipsis, trademark and the rest of the block.
const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

/** Whether any of these values has text Helvetica cannot draw. */
export function needsUnicodeFont(...values: unknown[]): boolean {
  let text: string
  try {
    text = JSON.stringify(values) ?? ''
  } catch {
    return false
  }
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0xff) continue
    if (WIN_ANSI_EXTRAS.has(code)) continue
    return true
  }
  return false
}

type SetFont = jsPDF['setFont']

/**
 * Register the font on the document and route Helvetica to it. Returns the
 * family now in use ('helvetica' when no font was given).
 */
export function applyDocumentFont(doc: jsPDF, font: JsPdfFont | null | undefined): string {
  if (!font || font.files.length === 0) return 'helvetica'
  try {
    for (const f of font.files) {
      doc.addFileToVFS(f.name, f.base64)
      doc.addFont(f.name, font.family, f.weight)
    }
  } catch (error) {
    console.error('PDF font could not be registered; using helvetica:', error)
    return 'helvetica'
  }
  const hasBold = font.files.some(f => f.weight === 'bold')
  const original: SetFont = doc.setFont.bind(doc)
  const routed = ((fontName: string, fontStyle?: string, fontWeight?: string | number) => {
    if (String(fontName).toLowerCase() !== 'helvetica') return original(fontName, fontStyle, fontWeight)
    const bold = /bold/i.test(fontStyle ?? '') || fontWeight === 'bold' || Number(fontWeight) >= 600
    return original(font.family, bold && hasBold ? 'bold' : 'normal')
  }) as SetFont
  doc.setFont = routed
  doc.setFont(font.family, 'normal')
  return font.family
}
