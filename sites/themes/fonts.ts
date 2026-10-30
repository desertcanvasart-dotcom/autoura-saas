// ============================================
// The typeface pairs a site can use (lib/publish/brand.ts FONT_PAIRS)
// ============================================
// Loaded through next/font at build time and served from the site's own
// origin — no request to Google from a visitor's browser. Each face exposes
// a CSS variable; the layout applies only the chosen pair's two variables.
// preload is off for all of them: preloading every pair would make each page
// download faces it never shows. display: swap with Next's metric-matched
// fallbacks keeps layout shift near zero (Core Web Vitals, PLAN §7).

import {
  Cormorant_Garamond, Inter, Playfair_Display, Source_Sans_3,
  DM_Serif_Display, DM_Sans, Poppins, Nunito, Nunito_Sans, Outfit, Manrope,
} from 'next/font/google'
import type { FontPairKey } from '@/lib/publish/brand'

// next/font reads these options at build time, so each call spells them out
// in full (no shared object): latin + latin-ext, swap, no preload.
const cormorant = Cormorant_Garamond({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, weight: ['500', '600', '700'], variable: '--font-cormorant' })
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, variable: '--font-inter' })
const playfair = Playfair_Display({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, variable: '--font-playfair' })
const sourceSans = Source_Sans_3({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, variable: '--font-source-sans' })
const dmSerif = DM_Serif_Display({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, weight: '400', variable: '--font-dm-serif' })
const dmSans = DM_Sans({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, variable: '--font-dm-sans' })
const poppins = Poppins({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, weight: ['400', '600', '700'], variable: '--font-poppins' })
const nunito = Nunito({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, variable: '--font-nunito' })
const outfit = Outfit({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, variable: '--font-outfit' })
const manrope = Manrope({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, variable: '--font-manrope' })
const nunitoSans = Nunito_Sans({ subsets: ['latin', 'latin-ext'], display: 'swap', preload: false, variable: '--font-nunito-sans' })

type Face = { variable: string; style: { fontFamily: string } }

const PAIRS: Record<FontPairKey, { display: Face; text: Face }> = {
  classic: { display: cormorant, text: inter },
  editorial: { display: playfair, text: sourceSans },
  modern: { display: dmSerif, text: dmSans },
  clean: { display: poppins, text: inter },
  friendly: { display: nunito, text: nunitoSans },
  sleek: { display: outfit, text: inter },
  manrope: { display: manrope, text: inter },
}

/** The class names that load a pair, and the CSS variables the themes read. */
export function fontPair(key: FontPairKey): { className: string; vars: Record<string, string> } {
  const p = PAIRS[key]
  return {
    className: `${p.display.variable} ${p.text.variable}`,
    vars: { '--font-display': p.display.style.fontFamily, '--font-text': p.text.style.fontFamily },
  }
}
