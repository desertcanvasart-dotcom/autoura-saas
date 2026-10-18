// ============================================
// The typeface of the quote PDFs (components/pdf/*)
// ============================================
// They used Helvetica, react-pdf's built-in face, which is Latin-1 only: a
// Japanese or Russian client name, trip name, note or tenant name came out
// garbled or blank, and the "⚠" in the B2B tour-leader note could not be
// drawn. Noto Sans JP (assets/fonts, SIL OFL) covers Latin, Cyrillic, Greek
// and Japanese, and has both weights so bold stays bold.
//
// Registered once, on first import, from files on disk. If they are missing
// (a build that did not trace them), the PDFs fall back to Helvetica rather
// than failing: wrong glyphs for some names beat no quote at all.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Font } from '@react-pdf/renderer'

const DIR = join(process.cwd(), 'assets', 'fonts')
const REGULAR = join(DIR, 'NotoSansJP-Regular.ttf')
const BOLD = join(DIR, 'NotoSansJP-Bold.ttf')

function register(): boolean {
  if (!existsSync(REGULAR) || !existsSync(BOLD)) {
    console.error(`quote PDFs: ${DIR} has no Noto Sans JP; falling back to Helvetica`)
    return false
  }
  Font.register({
    family: 'NotoSansJP',
    fonts: [{ src: REGULAR }, { src: BOLD, fontWeight: 'bold' }],
  })
  // Long names are not split mid-word into hyphenated fragments.
  Font.registerHyphenationCallback(word => [word])
  return true
}

const registered = register()

/** The family every quote PDF style uses; bold comes from fontWeight: 'bold'. */
export const QUOTE_PDF_FONT = registered ? 'NotoSansJP' : 'Helvetica'
