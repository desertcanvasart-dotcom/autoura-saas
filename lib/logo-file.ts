// ============================================
// Which files can be a company logo
// ============================================
// PNG or JPEG only. The logo goes onto every quote, invoice and itinerary PDF,
// and the PDF libraries take only those two (lib/company-identity.ts) — a WebP
// logo showed in the app and silently vanished from every document. And never
// SVG: the logos bucket is public, and an SVG can carry script. Migration 426
// enforces the same list on the bucket itself.

export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg'] as const
export const LOGO_ACCEPT = LOGO_MIME_TYPES.join(',')
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

/** Why this file cannot be the logo, or null when it can. */
export function logoFileProblem(file: { type: string; size: number }): string | null {
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Please choose a PNG or JPEG image — those are the formats your PDFs can show'
  }
  if (file.size > LOGO_MAX_BYTES) return 'Image must be less than 2MB'
  return null
}
