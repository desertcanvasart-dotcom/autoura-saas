// ============================================
// Publish — what the GetAutoura app tells the site renderer
// ============================================
// The renderer (sites/) has no database credentials: everything it shows
// comes from two internal endpoints of the GetAutoura app, in these shapes.
// Both ends import this file, so a field cannot be renamed on one side only;
// the renderer also validates every answer, so a deploy of one side ahead of
// the other fails loudly instead of rendering half a page.
//
//   GET /api/publish/internal/site?host=…              which site a hostname serves
//   GET /api/publish/internal/page?site=…&lang=…&path=… one page of it
//
// Authenticated with `Authorization: Bearer <PUBLISH_INTERNAL_SECRET>` — a
// fixed header, so the renderer's fetch cache key stays stable.
//
// Step 3 carries identity and page structure only. Facts (prices,
// inclusions, departures, terms) join the page payload in step 5, narrative
// in step 7 — always as data, never as text written for them.

import { z } from 'zod'

/**
 * Bumped whenever a shape below changes. The renderer sends it with every
 * request, so a cached answer in the old shape is never read back after a
 * deploy (it sits under a different cache key) — and the app can refuse a
 * renderer that is a version behind.
 */
export const CONTRACT_VERSION = 2

export const INTERNAL_SITE_PATH = '/api/publish/internal/site'
export const INTERNAL_PAGE_PATH = '/api/publish/internal/page'

export const languageCode = z.string().regex(/^[a-z]{2}$/)

export const siteResolutionSchema = z.object({
  site: z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    archetype: z.enum(['private_journeys', 'transparent_value']),
    status: z.enum(['draft', 'live', 'suspended']),
    languages: z.array(languageCode).min(1),
    companyName: z.string(),
    brand: z.record(z.string(), z.unknown()),
  }),
  /** How this hostname serves the site. */
  domain: z.object({
    hostname: z.string(),
    kind: z.enum(['primary', 'alias_redirect', 'test']),
  }),
  /** Where an alias redirects to: the site's primary hostname, if active. */
  primaryHost: z.string().nullable(),
  /** Test hostnames preview unpublished pages and are never indexed. */
  preview: z.boolean(),
  redirects: z.array(z.object({
    from: z.string(),
    to: z.string(),
    status: z.union([z.literal(301), z.literal(302)]),
  })),
})
export type SiteResolution = z.infer<typeof siteResolutionSchema>

const pageLink = z.object({ title: z.string(), path: z.string() })

/** The company as its records say — shown in the header and footer. From
 *  `tenants`, read at render time like every other fact. */
export const companyIdentitySchema = z.object({
  tagline: z.string().nullable(),
  logoUrl: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  whatsapp: z.string().nullable(),
  address: z.string().nullable(),
  /** e.g. the ETAA licence number. */
  licenseNumber: z.string().nullable(),
})
export type CompanyIdentity = z.infer<typeof companyIdentitySchema>

export const pagePayloadSchema = z.object({
  kind: z.enum(['home', 'listing', 'tour', 'about', 'how_we_work', 'contact', 'legal']),
  language: languageCode,
  /** The path inside the language, '' for the home page. */
  path: z.string(),
  title: z.string(),
  site: z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    archetype: z.enum(['private_journeys', 'transparent_value']),
    companyName: z.string(),
    languages: z.array(languageCode),
    /** publish_sites.brand as stored; lib/publish/brand.ts resolveBrand reads it. */
    brand: z.record(z.string(), z.unknown()),
    identity: companyIdentitySchema,
  }),
  /** The same page in the site's other languages, for hreflang (step 10). */
  alternates: z.array(z.object({ language: languageCode, path: z.string() })),
  /** A tour page's product. Facts about it arrive in step 5. */
  tour: z.object({ templateId: z.string().uuid(), name: z.string() }).nullable(),
  /** Home and listing: the tours the site shows. */
  tours: z.array(pageLink),
  /** Not yet published — shown only on a test hostname. */
  unpublished: z.boolean(),
})
export type PagePayload = z.infer<typeof pagePayloadSchema>

export function internalAuthHeader(secret: string): Record<string, string> {
  return { authorization: `Bearer ${secret}` }
}
