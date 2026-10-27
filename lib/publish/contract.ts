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
// Identity and page structure (step 3), the tour's facts (step 5); narrative
// joins in step 7 — always as data, never as text written for them.

import { z } from 'zod'

/**
 * Bumped whenever a shape below changes. The renderer sends it with every
 * request, so a cached answer in the old shape is never read back after a
 * deploy (it sits under a different cache key) — and the app can refuse a
 * renderer that is a version behind.
 */
export const CONTRACT_VERSION = 3

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

const money = z.number().positive().finite()
const weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])

/**
 * A tour's facts, read from Autoura records each time the page is rendered
 * (docs/publish/PLAN.md §8). Nothing here is written for the page: an absent
 * fact is absent (null / empty), never filled in.
 *
 * Prices (decisions Q4/Q4b/Q5, 2026-10-25): per person for 2 travellers
 * sharing, at the agency's house margin, lowest season (no travel date); a
 * table for 2/4/6; EU and other-nationality prices when the rates differ.
 * An amount appears ONLY from a tier the engine priced completely (D7):
 * otherwise the status is `on_request` and there is no number at all.
 */
export const tourFactsSchema = z.object({
  durationDays: z.number().int().positive(),
  durationNights: z.number().int().nonnegative(),
  images: z.array(z.string()),
  days: z.array(z.object({
    day: z.number().int().positive(),
    title: z.string().nullable(),
    city: z.string().nullable(),
    overnight: z.boolean(),
    meals: z.object({ breakfast: z.boolean(), lunch: z.boolean(), dinner: z.boolean() }),
    sights: z.array(z.string()),
  })),
  mainAttractions: z.array(z.string()),
  highlights: z.array(z.string()),
  inclusions: z.array(z.string()),
  exclusions: z.array(z.string()),
  accommodation: z.array(z.object({ kind: z.enum(['hotel', 'cruise']), name: z.string(), city: z.string().nullable() })),
  groupSize: z.object({ min: z.number().int().positive().nullable(), max: z.number().int().positive().nullable() }).nullable(),
  departureDays: z.array(weekday),
  departures: z.array(z.object({
    date: z.string(),
    endDate: z.string().nullable(),
    status: z.enum(['open', 'guaranteed', 'full']),
    seatsLeft: z.number().int().nonnegative().nullable(),
  })),
  cancellation: z.object({
    tiers: z.array(z.object({ daysBefore: z.number().int().nonnegative(), chargePercent: z.number().min(0).max(100) })),
    /** The agency's own wording in this page's language, if it wrote one. */
    wording: z.string().nullable(),
  }).nullable(),
  price: z.object({
    status: z.enum(['available', 'on_request']),
    currency: z.string().regex(/^[A-Z]{3}$/),
    basis: z.object({ pax: z.literal(2), season: z.literal('lowest') }),
    from: z.object({ perPerson: money, tier: z.string(), tierLabel: z.string() }).nullable(),
    byNationality: z.object({ eu: money, other: money }).nullable(),
    table: z.array(z.object({ pax: z.number().int().positive(), perPerson: money.nullable(), eu: money.nullable(), other: money.nullable() })),
    /** Display-only conversions, labelled indicative: the customer pays in `currency`. */
    indicative: z.array(z.object({ currency: z.string().regex(/^[A-Z]{3}$/), perPerson: money, rateDate: z.string() })),
  }),
  /** The thin-page rule (D7): whether this tour may be published, and why not. */
  publishable: z.object({ ok: z.boolean(), reasons: z.array(z.string()) }),
}).superRefine((f, ctx) => {
  // The one rule, enforced at the boundary too: no amount without a complete price.
  if (f.price.status !== 'available' && (f.price.from || f.price.byNationality || f.price.table.length || f.price.indicative.length)) {
    ctx.addIssue({ code: 'custom', message: 'a price on request carries no amount' })
  }
})
export type TourFacts = z.infer<typeof tourFactsSchema>

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
  /** A tour page's product, and its facts from the records. */
  tour: z.object({ templateId: z.string().uuid(), name: z.string(), facts: tourFactsSchema.nullable() }).nullable(),
  /** Home and listing: the tours the site shows. */
  tours: z.array(pageLink),
  /** Not yet published — shown only on a test hostname. */
  unpublished: z.boolean(),
})
export type PagePayload = z.infer<typeof pagePayloadSchema>

export function internalAuthHeader(secret: string): Record<string, string> {
  return { authorization: `Bearer ${secret}` }
}
