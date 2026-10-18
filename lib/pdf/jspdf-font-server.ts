// Noto Sans JP for jsPDF documents rendered on the server (lib/pdf/jspdf-font).
// Read once from assets/fonts — next.config.js traces the folder into the
// routes that render them. Null when the files are missing: the document
// falls back to Helvetica rather than not being sent.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { needsUnicodeFont, UNICODE_FONT_FAMILY, type JsPdfFont } from './jspdf-font'

let cached: Promise<JsPdfFont | null> | null = null

function load(): Promise<JsPdfFont | null> {
  const dir = join(process.cwd(), 'assets', 'fonts')
  return Promise.all([
    readFile(join(dir, 'NotoSansJP-Regular.ttf')),
    readFile(join(dir, 'NotoSansJP-Bold.ttf')),
  ])
    .then(([regular, bold]): JsPdfFont => ({
      family: UNICODE_FONT_FAMILY,
      files: [
        { name: 'NotoSansJP-Regular.ttf', base64: regular.toString('base64'), weight: 'normal' },
        { name: 'NotoSansJP-Bold.ttf', base64: bold.toString('base64'), weight: 'bold' },
      ],
    }))
    .catch(error => {
      console.error('Noto Sans JP missing from assets/fonts; PDFs fall back to helvetica:', error)
      cached = null
      return null
    })
}

/** The font, only when these values need it (see needsUnicodeFont). */
export async function serverPdfFontFor(...values: unknown[]): Promise<JsPdfFont | null> {
  if (!needsUnicodeFont(...values)) return null
  cached ??= load()
  return cached
}
