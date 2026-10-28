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
//   POST /api/publish/internal/enquiry                  an enquiry form sent (step 8)
//   POST /api/publish/internal/wa-ref                   a tracked WhatsApp click (step 8)
//   GET /api/publish/internal/sitemap?site=…            the published pages, for sitemaps (step 9)
//   GET /api/publish/internal/embed?key=…               which site an embed key shows (own-website blocks)
//
// Authenticated with `Authorization: Bearer <PUBLISH_INTERNAL_SECRET>` — a
// fixed header, so the renderer's fetch cache key stays stable.
//
// Identity and page structure (step 3), the tour's facts (step 5); narrative
// joins in step 7 — always as data, never as text written for them.

import { z } from 'zod'
import { ARCHETYPES } from './brand'

/**
 * Bumped whenever a shape below changes. The renderer sends it with every
 * request, so a cached answer in the old shape is never read back after a
 * deploy (it sits under a different cache key) — and the app can refuse a
 * renderer that is a version behind.
 */
export const CONTRACT_VERSION = 5

export const INTERNAL_SITE_PATH = '/api/publish/internal/site'
export const INTERNAL_PAGE_PATH = '/api/publish/internal/page'
export const INTERNAL_ENQUIRY_PATH = '/api/publish/internal/enquiry'
export const INTERNAL_WA_REF_PATH = '/api/publish/internal/wa-ref'
export const INTERNAL_SITEMAP_PATH = '/api/publish/internal/sitemap'
export const INTERNAL_EMBED_PATH = '/api/publish/internal/embed'

export const languageCode = z.string().regex(/^[a-z]{2}$/)

export const siteResolutionSchema = z.object({
  site: z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    archetype: z.enum(ARCHETYPES),
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

/** What a tour card shows (home, listing, destination pages): the tour's
 *  shape and its "from" price, from the same records as its page. Optional,
 *  so a renderer or app one deploy behind still agrees. */
const tourCard = z.object({
  days: z.number().int().nonnegative(),
  nights: z.number().int().nonnegative(),
  cities: z.array(z.string()),
  /** The tour's public "from": its lowest per-person price; null = price on request. */
  from: z.object({ amount: money, currency: z.string() }).nullable(),
  /** The agency's own first photo, if it has one. */
  image: z.string().nullable(),
})
const pageLink = z.object({ title: z.string(), path: z.string(), card: tourCard.optional() })
const weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])

/**
 * A tour's facts, read from Autoura records each time the page is rendered
 * (docs/publish/PLAN.md §8). Nothing here is written for the page: an absent
 * fact is absent (null / empty), never filled in.
 *
 * Price: the tour's ONE public rate (operator brief 2026-10-28) — the bands a
 * manager approved (lib/publish/public-rate.ts): a per-person price for every
 * traveller count in the group size, the same for every visitor. Nothing
 * here is, or can carry, a nationality, passport or residence figure. No
 * approved rate = `on_request`, with no number at all.
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
    /** The tier the rate is for, in the agency's words ("Deluxe"). */
    tierLabel: z.string().nullable(),
    /** The lowest per-person price across the bands: "From X per person". */
    fromPrice: money.nullable(),
    /** Per person by traveller count, contiguous from the fewest to the most. */
    bands: z.array(z.object({ minPax: z.number().int().positive(), maxPax: z.number().int().positive(), perPerson: money })),
    /** Display-only conversions, labelled indicative: the customer pays in `currency`. */
    indicative: z.array(z.object({ currency: z.string().regex(/^[A-Z]{3}$/), rate: z.number().positive().finite(), rateDate: z.string() })),
  }).strict(),
  /** The thin-page rule (D7): whether this tour may be published, and why not. */
  publishable: z.object({ ok: z.boolean(), reasons: z.array(z.string()) }),
}).superRefine((f, ctx) => {
  // The one rule, enforced at the boundary too: no amount without a complete price.
  const p = f.price
  if (p.status !== 'available') {
    if (p.fromPrice !== null || p.bands.length || p.indicative.length) ctx.addIssue({ code: 'custom', message: 'a price on request carries no amount' })
    return
  }
  // One public rate: contiguous bands, and "from" is their lowest price.
  const contiguous = p.bands.length > 0 && p.bands.every((b, i) => b.minPax <= b.maxPax && (i === 0 || b.minPax === p.bands[i - 1].maxPax + 1))
  if (!contiguous) ctx.addIssue({ code: 'custom', message: 'an available price needs contiguous bands' })
  else if (p.fromPrice !== Math.min(...p.bands.map(b => b.perPerson))) ctx.addIssue({ code: 'custom', message: '"from" must be the lowest band price' })
})
export type TourFacts = z.infer<typeof tourFactsSchema>

const segmentSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string().min(1), sources: z.array(z.string()).optional() }),
  z.object({ type: z.literal('slot'), slot: z.enum(['price_from', 'duration', 'group_size', 'departure_days', 'next_departure', 'cancellation']) }),
])

/**
 * The approved narrative a page may show (step 7): only parts still true to
 * today's facts — a part whose tour or day changed under it, or whose fact
 * slot can no longer be filled, is withheld and the page shows its facts.
 */
export const narrativeSchema = z.object({
  overview: z.array(segmentSchema).nullable(),
  highlights: z.array(z.array(segmentSchema)).nullable(),
  days: z.array(z.object({ day: z.number().int().positive(), segments: z.array(segmentSchema) })),
  seo: z.object({ title: z.string(), description: z.string() }).nullable(),
})
export type PageNarrative = z.infer<typeof narrativeSchema>

export const pagePayloadSchema = z.object({
  kind: z.enum(['home', 'listing', 'tour', 'about', 'how_we_work', 'contact', 'legal', 'destination']),
  language: languageCode,
  /** The path inside the language, '' for the home page. */
  path: z.string(),
  title: z.string(),
  site: z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    archetype: z.enum(ARCHETYPES),
    companyName: z.string(),
    languages: z.array(languageCode),
    /** publish_sites.brand as stored; lib/publish/brand.ts resolveBrand reads it. */
    brand: z.record(z.string(), z.unknown()),
    identity: companyIdentitySchema,
    /** The site's active primary hostname — the address search engines are
     *  given (canonical, hreflang, structured data); null before it has one
     *  (step 9). Additive and optional, like pageId. */
    publicHost: z.string().nullable().optional(),
  }),
  /** The same page in the site's other languages, for hreflang (step 10). */
  alternates: z.array(z.object({ language: languageCode, path: z.string() })),
  /** A tour page's product, and its facts from the records. */
  tour: z.object({
    templateId: z.string().uuid(),
    name: z.string(),
    facts: tourFactsSchema.nullable(),
    narrative: narrativeSchema.nullable(),
  }).nullable(),
  /** Home, listing and destination pages: the tours the site shows there. */
  tours: z.array(pageLink),
  /** The places the site's tours go, each a page of its own (redesign). */
  destinations: z.array(z.object({ name: z.string(), path: z.string(), count: z.number().int().positive() })).optional(),
  /** The agency's Google reviews (lib/publish/reviews.ts) — on the home and
   *  tour pages, only when the agency picked its business and Google answered. */
  reviews: z.object({
    name: z.string(), rating: z.number().nullable(), count: z.number().int().nullable(), url: z.string().nullable(),
    reviews: z.array(z.object({
      author: z.string(), authorUrl: z.string().nullable(), authorPhoto: z.string().nullable(), rating: z.number(),
      text: z.string(), translated: z.boolean(), original: z.string().nullable(), when: z.string(), url: z.string().nullable(),
    })),
  }).nullable().optional(),
  /** A destination page: the place it is about. */
  destination: z.object({ name: z.string(), slug: z.string() }).nullable().optional(),
  /** Not yet published — shown only on a test hostname. */
  unpublished: z.boolean(),
  /** The page row, for the enquiry form and the tracked WhatsApp link
   *  (step 8); null for a home page or listing that has no row yet.
   *  Additive and optional, so a renderer one deploy behind ignores it. */
  pageId: z.string().uuid().nullable().optional(),
})
export type PagePayload = z.infer<typeof pagePayloadSchema>

// ---------- lead capture (step 8, PLAN §11) ----------
// The renderer resolves the site from the hostname it was asked for, never
// from what the visitor sent, and passes the visitor's address only so the
// app can rate-limit it.

const optionalText = (max: number) => z.string().trim().max(max).transform(v => v === '' ? null : v).nullable()

export const enquiryInputSchema = z.object({
  siteId: z.string().uuid(),
  pageId: z.string().uuid().nullable(),
  language: languageCode,
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: optionalText(40),
  travellers: z.number().int().min(1).max(99).nullable(),
  /** The month or day the visitor hopes to travel, as they gave it (YYYY-MM or YYYY-MM-DD). */
  travelDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable(),
  message: optionalText(4000),
  /** The page they enquired from, with its utm_* / campaign parameters. */
  landingUrl: z.string().url().max(2000).nullable(),
  visitorIp: z.string().max(64).nullable(),
})
export type EnquiryInput = z.infer<typeof enquiryInputSchema>

export const enquiryResultSchema = z.object({ ok: z.literal(true), enquiryId: z.string().uuid() })

export const waRefInputSchema = z.object({
  siteId: z.string().uuid(),
  pageId: z.string().uuid().nullable(),
  language: languageCode,
  landingUrl: z.string().url().max(2000).nullable(),
})
export type WaRefInput = z.infer<typeof waRefInputSchema>

/** null number = the company has no WhatsApp number of its own (decision Q7:
 *  no button is shown, and nothing is created). */
export const waRefResultSchema = z.object({
  number: z.string().nullable(),
  token: z.string().nullable(),
  tourName: z.string().nullable(),
})
export type WaRefResult = z.infer<typeof waRefResultSchema>

export function internalAuthHeader(secret: string): Record<string, string> {
  return { authorization: `Bearer ${secret}` }
}

// ---------- sitemaps (step 9, PLAN §12) ----------

/** Every published page of a site, each with its path in every language it
 *  is published in — what the per-language sitemaps list, with hreflang. */
export const sitemapSchema = z.object({
  languages: z.array(languageCode),
  pages: z.array(z.object({
    kind: z.enum(['home', 'listing', 'tour', 'about', 'how_we_work', 'contact', 'legal', 'destination']),
    /** language → path inside it ('' for the home page). */
    paths: z.record(languageCode, z.string()),
    /** ISO date of the latest publication, when known. */
    lastModified: z.string().nullable(),
  })),
})
export type SitemapData = z.infer<typeof sitemapSchema>

// ---------- blocks on the agency's own website (lib/publish/embed.ts) ----------

export const embedResolutionSchema = z.object({
  site: siteResolutionSchema.shape.site,
  /** The websites (origins) the blocks may appear on — nowhere else. */
  origins: z.array(z.string().url()).min(1),
})
export type EmbedResolution = z.infer<typeof embedResolutionSchema>
