// Noto Sans JP for jsPDF documents built in the browser (lib/pdf/jspdf-font).
// Fetched from /api/fonts (the files live in assets/fonts) once per session,
// and only for a document that needs it. Null if unavailable: the document
// falls back to Helvetica rather than failing to download.

import { needsUnicodeFont, UNICODE_FONT_FAMILY, type JsPdfFont } from './jspdf-font'

let cached: Promise<JsPdfFont | null> | null = null

async function fetchBase64(file: string): Promise<string> {
  const res = await fetch(`/api/fonts/${file}`)
  if (!res.ok) throw new Error(`font ${file}: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

function load(): Promise<JsPdfFont | null> {
  return Promise.all([fetchBase64('NotoSansJP-Regular.ttf'), fetchBase64('NotoSansJP-Bold.ttf')])
    .then(([regular, bold]): JsPdfFont => ({
      family: UNICODE_FONT_FAMILY,
      files: [
        { name: 'NotoSansJP-Regular.ttf', base64: regular, weight: 'normal' },
        { name: 'NotoSansJP-Bold.ttf', base64: bold, weight: 'bold' },
      ],
    }))
    .catch(error => {
      console.error('PDF font unavailable; using helvetica:', error)
      cached = null
      return null
    })
}

/** The font, only when these values need it (see needsUnicodeFont). */
export async function browserPdfFontFor(...values: unknown[]): Promise<JsPdfFont | null> {
  if (!needsUnicodeFont(...values)) return null
  cached ??= load()
  return cached
}
