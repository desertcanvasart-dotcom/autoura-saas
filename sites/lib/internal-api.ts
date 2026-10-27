// ============================================
// The renderer's only data source: the GetAutoura app's internal endpoints
// ============================================
// No database credentials live in this app. Every answer is checked against
// the shared contract (lib/publish/contract.ts), so the two services cannot
// silently disagree about a field.
//
// Env: PUBLISH_APP_URL (the GetAutoura app), PUBLISH_INTERNAL_SECRET.

import {
  CONTRACT_VERSION, INTERNAL_ENQUIRY_PATH, INTERNAL_PAGE_PATH, INTERNAL_SITE_PATH, INTERNAL_WA_REF_PATH, internalAuthHeader,
  pagePayloadSchema, siteResolutionSchema, waRefResultSchema,
  type EnquiryInput, type PagePayload, type SiteResolution, type WaRefInput, type WaRefResult,
} from '@/lib/publish/contract'
import { publishTags } from '@/lib/publish/sync/events'
import type { Mode } from './routing'

export class InternalApiError extends Error {}

function config() {
  const base = process.env.PUBLISH_APP_URL
  const secret = process.env.PUBLISH_INTERNAL_SECRET
  if (!base || !secret) throw new InternalApiError('PUBLISH_APP_URL and PUBLISH_INTERNAL_SECRET must be set')
  return { base: base.replace(/\/$/, ''), secret }
}

async function readJson(res: Response, what: string): Promise<unknown> {
  if (res.status === 404) return null
  if (!res.ok) throw new InternalApiError(`${what}: HTTP ${res.status}`)
  return res.json()
}

// ---------- hostname → site (used by the proxy, every request) ----------

const HOST_TTL_MS = 60_000
type HostEntry = { at: number; value: SiteResolution | null }
// On globalThis so the proxy and the revalidate route — separate bundles in
// one process — share one cache.
const hostCache: Map<string, HostEntry> =
  ((globalThis as { __publishHostCache?: Map<string, HostEntry> }).__publishHostCache ??= new Map())

export function forgetHosts(): void {
  hostCache.clear()
}

export async function siteForHost(host: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<SiteResolution | null> {
  const hit = hostCache.get(host)
  if (hit && now - hit.at < HOST_TTL_MS) return hit.value
  const { base, secret } = config()
  const res = await fetchImpl(`${base}${INTERNAL_SITE_PATH}?host=${encodeURIComponent(host)}&v=${CONTRACT_VERSION}`, {
    headers: internalAuthHeader(secret),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  const json = await readJson(res, 'site lookup')
  const value = json === null ? null : siteResolutionSchema.parse(json)
  hostCache.set(host, { at: now, value })
  if (hostCache.size > 1000) hostCache.delete(hostCache.keys().next().value!)
  return value
}

// ---------- one page (used by the page, cached until its tags change) ----------

/** The tags a page's data is cached under — what the sync worker revalidates. */
export function pageTags(tenantId: string): string[] {
  // Coarse on purpose: a tour page's product id is only known once its data
  // is read, and the worker refreshes `tours` on every product change anyway.
  return [publishTags.site(tenantId), publishTags.tours(tenantId)]
}

export async function loadPage(
  input: { tenantId: string; siteId: string; mode: Mode; language: string; path: string },
  fetchImpl: typeof fetch = fetch,
): Promise<PagePayload | null> {
  const { base, secret } = config()
  const q = new URLSearchParams({ site: input.siteId, lang: input.language, path: input.path, v: String(CONTRACT_VERSION) })
  if (input.mode === 'preview') q.set('preview', '1')
  const res = await fetchImpl(`${base}${INTERNAL_PAGE_PATH}?${q}`, {
    headers: internalAuthHeader(secret),
    // Kept until the sync worker revalidates one of these tags; the hour is
    // only a backstop (PLAN D9).
    next: { tags: pageTags(input.tenantId), revalidate: 3600 },
    signal: AbortSignal.timeout(10_000),
  } as RequestInit)
  const json = await readJson(res, 'page lookup')
  if (json === null) return null
  const page = pagePayloadSchema.parse(json)
  // The app answered for the site it was asked about, or this is a bug.
  if (page.site.id !== input.siteId || page.site.tenantId !== input.tenantId) {
    throw new InternalApiError('page payload is for a different site')
  }
  return page
}

// ---------- lead capture (step 8): never cached ----------

async function post(path: string, body: unknown, fetchImpl: typeof fetch): Promise<Response> {
  const { base, secret } = config()
  return fetchImpl(`${base}${path}?v=${CONTRACT_VERSION}`, {
    method: 'POST',
    headers: { ...internalAuthHeader(secret), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
}

/** 'sent', 'slow_down' (rate limited), or 'invalid' (the app refused the fields). */
export async function sendEnquiry(input: EnquiryInput, fetchImpl: typeof fetch = fetch): Promise<'sent' | 'slow_down' | 'invalid'> {
  const res = await post(INTERNAL_ENQUIRY_PATH, input, fetchImpl)
  if (res.status === 201) return 'sent'
  if (res.status === 429) return 'slow_down'
  if (res.status === 400) return 'invalid'
  throw new InternalApiError(`enquiry: HTTP ${res.status}`)
}

export async function requestWaRef(input: WaRefInput, fetchImpl: typeof fetch = fetch): Promise<WaRefResult> {
  const res = await post(INTERNAL_WA_REF_PATH, input, fetchImpl)
  if (!res.ok) throw new InternalApiError(`WhatsApp reference: HTTP ${res.status}`)
  return waRefResultSchema.parse(await res.json())
}
