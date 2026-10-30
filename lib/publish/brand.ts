// ============================================
// Publish — the brand layer: one company's look on an archetype
// ============================================
// docs/publish/PLAN.md §7. An archetype (sites/themes/*) is the layout and
// page structure; the brand layer is CONFIGURATION on top of it — palette,
// typeface pair, tone — stored in publish_sites.brand. Never a fork, never
// per-company code: two agencies on the same archetype differ only by this.
//
// Shared by the renderer (to draw the site) and, later, the admin screen (to
// edit it), so both read a stored brand the same way. A stored value that
// fails validation is not an error on a live site: each field falls back to
// the archetype's default, and the reasons are returned for the admin to show.

import { z } from 'zod'

export const ARCHETYPES = ['private_journeys', 'transparent_value', 'modern'] as const
export type Archetype = typeof ARCHETYPES[number]

export const TONES = ['formal', 'warm', 'expert', 'playful'] as const
export type Tone = typeof TONES[number]

/**
 * The typeface pairs a site may use: a display face for headings and a text
 * face for reading. A fixed list — fonts are loaded at build time
 * (sites/themes/fonts.ts), and an open choice would make every site download
 * whatever was typed. Every face covers Latin Extended (French, Spanish,
 * German, Italian); right-to-left scripts are out of scope (PLAN D14).
 */
export const FONT_PAIRS = {
  classic: { label: 'Classic — Cormorant Garamond & Inter', display: 'Cormorant Garamond', text: 'Inter' },
  editorial: { label: 'Editorial — Playfair Display & Source Sans 3', display: 'Playfair Display', text: 'Source Sans 3' },
  modern: { label: 'Modern — DM Serif Display & DM Sans', display: 'DM Serif Display', text: 'DM Sans' },
  clean: { label: 'Clean — Poppins & Inter', display: 'Poppins', text: 'Inter' },
  friendly: { label: 'Friendly — Nunito & Nunito Sans', display: 'Nunito', text: 'Nunito Sans' },
  sleek: { label: 'Sleek — Outfit & Inter', display: 'Outfit', text: 'Inter' },
  manrope: { label: 'Template — Manrope & Inter', display: 'Manrope', text: 'Inter' },
} as const
export type FontPairKey = keyof typeof FONT_PAIRS

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour as #RRGGBB')

export const paletteSchema = z.object({
  /** Buttons, links, the main accent. */
  primary: hex,
  /** A second accent: badges, highlights. */
  accent: hex,
  /** Body text. */
  ink: hex,
  /** Page background. */
  surface: hex,
})
export type Palette = z.infer<typeof paletteSchema>

export interface Brand {
  palette: Palette
  fontPair: FontPairKey
  tone: Tone
}

/** Each archetype's own starting point — what a site looks like before the
 *  agency has chosen anything. */
export const ARCHETYPE_DEFAULTS: Record<Archetype, Brand> = {
  private_journeys: {
    palette: { primary: '#7a5c3e', accent: '#b08d57', ink: '#1f1b16', surface: '#fbf8f3' },
    fontPair: 'classic',
    tone: 'expert',
  },
  transparent_value: {
    palette: { primary: '#0b6e4f', accent: '#f2a541', ink: '#14213d', surface: '#ffffff' },
    fontPair: 'clean',
    tone: 'warm',
  },
  // Operator, 2026-10-27: modern and sleek, never a default of gold or beige;
  // each agency picks its own palette. Deep teal with a mint accent.
  modern: {
    palette: { primary: '#1d6b64', accent: '#38d9a9', ink: '#0f1720', surface: '#ffffff' },
    // The website template brief (2026-10-28): Manrope headings, Inter text.
    fontPair: 'manrope',
    tone: 'warm',
  },
}

/** Ready-made palettes for the brand studio (operator, 2026-10-27: modern,
 *  each agency choosing its own — never a default of gold or beige). Each
 *  one passes the contrast rules below (tested); an agency may also enter
 *  its own colours, held to the same rules. */
export const PALETTE_PRESETS: Array<{ key: string; label: string; palette: Palette }> = [
  { key: 'teal', label: 'Teal and mint', palette: { primary: '#1d6b64', accent: '#38d9a9', ink: '#0f1720', surface: '#ffffff' } },
  { key: 'navy', label: 'Navy and coral', palette: { primary: '#1e2a78', accent: '#ff6b5b', ink: '#111827', surface: '#ffffff' } },
  { key: 'mono', label: 'Charcoal and lime', palette: { primary: '#161616', accent: '#c6f432', ink: '#161616', surface: '#ffffff' } },
  { key: 'ocean', label: 'Ocean and sky', palette: { primary: '#0b5fa5', accent: '#7dd3fc', ink: '#0f172a', surface: '#ffffff' } },
  { key: 'forest', label: 'Forest and lemon', palette: { primary: '#2f5d3a', accent: '#e9f26b', ink: '#13201a', surface: '#ffffff' } },
  { key: 'plum', label: 'Plum and peach', palette: { primary: '#5b2a6e', accent: '#ffb38a', ink: '#1c1222', surface: '#ffffff' } },
  { key: 'red', label: 'Nile red and white', palette: { primary: '#b42318', accent: '#fecdca', ink: '#1a1a1a', surface: '#ffffff' } },
  { key: 'night', label: 'Midnight and violet', palette: { primary: '#111c44', accent: '#a78bfa', ink: '#0b1020', surface: '#ffffff' } },
]

// ---------- contrast (WCAG 2.1) ----------

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Text that stays readable on a coloured background: white or near-black,
 *  whichever contrasts more. */
export function readableOn(background: string): '#ffffff' | '#111111' {
  return contrastRatio('#ffffff', background) >= contrastRatio('#111111', background) ? '#ffffff' : '#111111'
}

/** AA for body text. */
export const MIN_TEXT_CONTRAST = 4.5
/** AA for large text and interface parts (links are underlined, buttons carry their own text colour). */
export const MIN_UI_CONTRAST = 3

// ---------- reading a stored brand ----------

export interface ResolvedBrand extends Brand {
  /** Text colour on a primary-coloured button or band. */
  onPrimary: string
  /** Text colour on an accent-coloured badge. */
  onAccent: string
  /** Why a stored value was not used, for the admin screen. Empty when all were. */
  problems: string[]
}

/**
 * The brand to draw a site with: the stored choices where they are valid and
 * readable, the archetype's defaults where not. Never throws — a bad colour
 * must not take a live site down.
 */
export function resolveBrand(archetype: Archetype, stored: unknown): ResolvedBrand {
  const base = ARCHETYPE_DEFAULTS[archetype]
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  const problems: string[] = []

  let palette: Palette = base.palette
  if (raw.palette !== undefined) {
    const parsed = paletteSchema.safeParse(raw.palette)
    if (!parsed.success) {
      problems.push(`palette: ${parsed.error.issues.map(i => `${i.path.join('.')} must be ${i.message}`).join('; ')}`)
    } else if (contrastRatio(parsed.data.ink, parsed.data.surface) < MIN_TEXT_CONTRAST) {
      problems.push(`palette: body text (${parsed.data.ink}) on the background (${parsed.data.surface}) is hard to read — contrast ${contrastRatio(parsed.data.ink, parsed.data.surface).toFixed(1)}:1, at least ${MIN_TEXT_CONTRAST}:1 needed`)
    } else if (contrastRatio(parsed.data.primary, parsed.data.surface) < MIN_UI_CONTRAST) {
      problems.push(`palette: links and buttons (${parsed.data.primary}) barely stand out from the background (${parsed.data.surface}) — contrast ${contrastRatio(parsed.data.primary, parsed.data.surface).toFixed(1)}:1, at least ${MIN_UI_CONTRAST}:1 needed`)
    } else {
      palette = parsed.data
    }
  }

  let fontPair = base.fontPair
  if (raw.fontPair !== undefined) {
    if (typeof raw.fontPair === 'string' && raw.fontPair in FONT_PAIRS) fontPair = raw.fontPair as FontPairKey
    else problems.push(`fontPair: "${String(raw.fontPair)}" is not one of ${Object.keys(FONT_PAIRS).join(', ')}`)
  }

  let tone = base.tone
  if (raw.tone !== undefined) {
    if ((TONES as readonly unknown[]).includes(raw.tone)) tone = raw.tone as Tone
    else problems.push(`tone: "${String(raw.tone)}" is not one of ${TONES.join(', ')}`)
  }

  return { palette, fontPair, tone, onPrimary: readableOn(palette.primary), onAccent: readableOn(palette.accent), problems }
}

/** The CSS custom properties a theme reads. Values are validated hex, so they
 *  are safe to place in a style attribute. */
export function brandCssVariables(b: ResolvedBrand): Record<string, string> {
  return {
    '--brand-primary': b.palette.primary,
    '--brand-accent': b.palette.accent,
    '--brand-ink': b.palette.ink,
    '--brand-surface': b.palette.surface,
    '--brand-on-primary': b.onPrimary,
    '--brand-on-accent': b.onAccent,
  }
}
