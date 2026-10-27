// ============================================
// Publish — tours on the agency's OWN website (embeddable blocks)
// ============================================
// Operator, 2026-10-28: an agency with its own website publishes only its
// tours there. It pastes our loader and a placeholder per block (the tour
// list, one tour, the enquiry form); each block is the renderer's page in a
// frame — the same live prices, approved text and theme as the hosted site.
//
// A site's embed settings live in publish_sites.settings.embed:
//   { key: 'Ab3…' (public — it names the site, it grants nothing),
//     origins: ['https://www.agency.com'] }
// The key alone shows nothing: the browser refuses to draw a block on any
// page whose origin is not listed (CSP frame-ancestors, set by the
// renderer), and an enquiry's landing page counts only from a listed origin.

import { randomInt } from 'node:crypto'
import type { SiteResolution } from './contract'

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
export const EMBED_KEY = /^[A-Za-z0-9]{20,40}$/
export const MAX_ORIGINS = 10

export interface EmbedSettings { key: string | null; origins: string[] }

export function newEmbedKey(length = 24): string {
  let k = ''
  for (let i = 0; i < length; i++) k += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)]
  return k
}

/** "https://www.agency.com/tours?x" → "https://www.agency.com"; null when not
 *  a website address we allow (https only; http only for localhost testing). */
export function normalizeOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let url: URL
  try { url = new URL(raw.trim().includes('://') ? raw.trim() : `https://${raw.trim()}`) } catch { return null }
  const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
  if (!url.hostname.includes('.') && !local) return null
  return url.origin.toLowerCase()
}

export function embedOf(settings: unknown): EmbedSettings {
  const e = (settings && typeof settings === 'object' ? (settings as Record<string, unknown>).embed : null) as Record<string, unknown> | null | undefined
  const key = typeof e?.key === 'string' && EMBED_KEY.test(e.key) ? e.key : null
  const origins = Array.isArray(e?.origins) ? e!.origins.map(normalizeOrigin).filter((o): o is string => o !== null) : []
  return { key, origins: [...new Set(origins)].slice(0, MAX_ORIGINS) }
}

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** The site an embed key belongs to, and where its blocks may appear; null
 *  for an unknown key, a suspended site, or a site with no website listed. */
export async function resolveSiteByEmbedKey(db: Db, key: string): Promise<{ site: SiteResolution['site']; origins: string[] } | null> {
  if (!EMBED_KEY.test(key)) return null
  const { data, error } = await db.from('publish_sites')
    .select('id, tenant_id, archetype, status, languages, brand, settings, tenants(company_name)')
    .eq('settings->embed->>key', key).maybeSingle()
  if (error) throw new Error(`reading the embed key: ${error.message}`)
  if (!data || data.status === 'suspended') return null
  const embed = embedOf(data.settings)
  if (embed.key !== key || embed.origins.length === 0) return null
  return {
    site: {
      id: data.id, tenantId: data.tenant_id, archetype: data.archetype, status: data.status,
      languages: data.languages, companyName: data.tenants?.company_name ?? '', brand: data.brand ?? {},
    },
    origins: embed.origins,
  }
}
