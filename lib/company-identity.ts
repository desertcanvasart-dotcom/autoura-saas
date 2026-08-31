// ============================================
// COMPANY IDENTITY ON CUSTOMER-FACING DOCUMENTS
// ============================================
// Every PDF generator hardcoded one operator — "Travel2Egypt", its website,
// email and phone — in headers, footers and signature blocks. In a
// multi-tenant product that meant Afford Egypt's invoices introduced
// themselves as Travel2Egypt: the same identity bug fixed for email senders
// (see app/api/send-email), one artifact further down.
//
// The identity on a document comes from the TENANT, whose fields already
// exist and are edited in Settings → Organization. The rule when a field is
// missing: OMIT the line. A blank footer is unremarkable; another operator's
// name on your invoice is not. There is no non-tenant default identity, and
// there must never be one.

import { checkPublicHttpUrl } from '@/lib/ssrf-guard'

export interface CompanyIdentity {
  name: string
  email?: string
  phone?: string
  website?: string
  /** Brand color, hex (e.g. '#647C47'). Unset = each document's current
   *  default palette, so an unbranded tenant's PDFs look exactly as before. */
  primaryColor?: string
  /** data: URL for the tenant's logo, fetched by the caller (jsPDF cannot load
   *  a remote URL itself). Absent = text-only header, as before. */
  logoDataUrl?: string
}

/** The tenant fields documents render. All optional so partial rows degrade. */
export interface TenantIdentityFields {
  company_name?: string | null
  contact_email?: string | null
  company_phone?: string | null
  company_website?: string | null
  primary_color?: string | null
  logo_url?: string | null
}

export function identityFromTenant(
  tenant: TenantIdentityFields | null | undefined
): CompanyIdentity {
  return {
    // Empty string, not a placeholder brand: generators skip empty lines.
    name: tenant?.company_name?.trim() || '',
    email: tenant?.contact_email?.trim() || undefined,
    phone: tenant?.company_phone?.trim() || undefined,
    website: tenant?.company_website?.trim() || undefined,
    primaryColor: tenant?.primary_color?.trim() || undefined,
  }
}

/**
 * '#647C47' -> [100, 124, 71]. `fallback` is the document's existing palette,
 * so a missing or malformed color is a VISUAL NO-OP, never black or a crash —
 * a wrong brand color on an invoice is the cosmetic cousin of a wrong company
 * name.
 */
export function brandColorRgb(
  company: Pick<CompanyIdentity, 'primaryColor'> | null | undefined,
  fallback: [number, number, number]
): [number, number, number] {
  const hex = company?.primaryColor?.trim()
  const m = hex?.match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mix a color toward white — the light panel tints derived from the brand. */
export function tint(
  [r, g, b]: [number, number, number],
  factor: number
): [number, number, number] {
  const t = Math.min(Math.max(factor, 0), 1)
  return [
    Math.round(r + (255 - r) * t),
    Math.round(g + (255 - g) * t),
    Math.round(b + (255 - b) * t),
  ]
}

/**
 * Fetch a logo into a data: URL for jsPDF. Isomorphic (browser + server) and
 * BEST-EFFORT: any failure returns undefined and the document renders its
 * text-only header — a missing logo must never block an invoice.
 */
export async function fetchLogoDataUrl(
  logoUrl: string | null | undefined
): Promise<string | undefined> {
  if (!logoUrl) return undefined
  // SSRF: this URL comes from tenant-controlled data and is fetched by the
  // server. Reject anything resolving to a private/link-local/metadata
  // address before making the request.
  const safe = await checkPublicHttpUrl(logoUrl)
  if (!safe.ok) {
    console.warn(`fetchLogoBytes: refusing logo URL (${safe.reason})`)
    return undefined
  }
  try {
    const res = await fetch(logoUrl)
    if (!res.ok) return undefined
    const type = res.headers.get('content-type') || 'image/png'
    if (!/^image\/(png|jpe?g)/.test(type)) return undefined // jsPDF supports PNG/JPEG
    const buf = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
    const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(buf).toString('base64')
    return `data:${type};base64,${b64}`
  } catch {
    return undefined
  }
}

/**
 * Fetch a logo as raw bytes for pdf-lib (embedPng/embedJpg take bytes, not
 * data: URLs). Same contract as fetchLogoDataUrl: isomorphic, PNG/JPEG only,
 * BEST-EFFORT — any failure returns undefined and the document renders its
 * text-only header.
 */
export async function fetchLogoBytes(
  logoUrl: string | null | undefined
): Promise<{ bytes: Uint8Array; format: 'png' | 'jpeg' } | undefined> {
  if (!logoUrl) return undefined
  try {
    const res = await fetch(logoUrl)
    if (!res.ok) return undefined
    const m = (res.headers.get('content-type') || '').match(/^image\/(png|jpe?g)/)
    if (!m) return undefined
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      format: m[1] === 'png' ? 'png' : 'jpeg',
    }
  } catch {
    return undefined
  }
}

/**
 * The "Name | website | email" footer used across the generators, built from
 * whatever exists. Returns '' when nothing does, and callers skip the line.
 */
export function identityFooterLine(company: CompanyIdentity): string {
  return [company.name, company.website, company.email, company.phone]
    .filter((part): part is string => !!part && part.length > 0)
    .join(' | ')
}
