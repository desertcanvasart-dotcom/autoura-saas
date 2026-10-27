# Autoura Publish — Phase 0 and Phase 1 plan

*Written 2026-10-25 against `main` @ `ae03d16d` (migrations up to 438). Status: **awaiting approval** — no feature code until the decisions in §2 are answered.*

*Revised 2026-10-25: **no Arabic and no right-to-left languages.** Sites are built only in left-to-right languages, so RTL layout, Arabic content and Arabic numeral handling are removed from scope. This overrides the prompt's "English and Arabic" requirement. **Each tenant picks its own second language** from the supported LTR languages (French and Spanish in Phase 1) — see D14.*

Source documents: `Autoura-Publish-Module-Specification.md` (spec) and the build prompt (prompt). Where they disagree the prompt wins; where either disagrees with the code, this plan says so.

---

## 1. What the repository already gives us (and what it doesn't)

| Area | What exists | Consequence for Publish |
| --- | --- | --- |
| Stack | Next.js 16.4 / React 19, Supabase, Zod, Tailwind, Vitest, Playwright. Deployed on Railway as one Node service plus cron services. | Build on these. |
| Service-to-service API | **No tRPC.** Route handlers under `app/api/*`. | No tRPC (D2). |
| Content engine | **No Python/FastAPI.** AI is TypeScript: `lib/ai/anthropic-client.ts`, `lib/ai/models.ts`. `lib/ai/day-writer.ts` already writes day text only from facts matched without AI. | Engine in TypeScript (D3). |
| Tenancy | `tenant_id` + RLS everywhere; `get_user_tenant_id()` is the app rule; `concierge_brand_mappings` maps brand keys to tenants. | Our brands are ordinary tenants. |
| Product | `tour_templates` (descriptions, highlights, main attractions, inclusions, exclusions, images, `is_active`, `is_featured`), `tour_variations` (tier, `min_pax`/`max_pax`, inclusions/exclusions per tier), `tour_days` (city, hotel, meals, title, description), `tour_variation_options`. **No "published" flag.** | Publish state lives in Publish tables (D5). |
| Rates | 13 rate tables; EU/non-EU columns on `accommodation_rates` and `nile_cruises`; dated rate periods; `nile_cruises.sailing_days`. | Nationality display is possible. |
| Price-from | **Not stored.** Computed live by the pricing engine (`/api/tours/browse/prices`). Last census: 12 of 45 live tours fully priced. `cached_starting_price` columns exist but the operator chose "keep live". | Price is engine output at render time; incomplete prices need a rule (D7). |
| Departures | `tour_departures` (dated; today mostly the Sawa mirror). Cruises have weekday `sailing_days`. **No departure weekdays for ordinary tours.** | D8. |
| Cancellation terms | **No product or tenant record.** Only in message templates and bookings. | D8. |
| Change capture | **No event bus or outbox.** But `rate_audit_log` is filled by a trigger on **all 13 rate tables** (mig 252) — every rate write, from any route, CSV import or SQL, already leaves a row. Nothing equivalent on product or departure tables. | Rate events come free; product events need triggers (E1). |
| Leads | **No unified leads table.** A lead is a `clients` row with `status='lead'` (mig 352); `client_source` CHECK allows `direct, referral, website, social_media, whatsapp, email, partner, other`. No landing-page or campaign fields. Concierge briefs create a lead + `concierge_briefs` row; WhatsApp to a tenant's own number creates a lead; never-seen senders on the **shared** number are dropped. | D4. |
| Concierge bot | External (Travel2Egypt AI Concierge). Posts HMAC-signed briefs to `/api/webhooks/concierge`, brand → tenant, gated by `tenant_features.concierge_enabled`. Widget code is not in this repo. | Q1. |
| Sawa mirror | Runs **into** this repo (`/api/webhooks/departures`, `lib/departure-mirror.ts`). The sender lives in the Sawa repo, and nothing here records "last received", so a sender that never sends looks exactly like a quiet day. | Health must measure arrivals and lag, not only errors (§5). |
| i18n | No framework. `docs/I18N-PHASE1.md` planned French and Spanish customer documents and deferred `next-intl` to a later phase. `blog_posts` is getautoura.net's own blog (no `tenant_id`). | Per-language URLs for left-to-right languages only, in the renderer only (§12). |
| Export precedent | `lib/account/data-export.ts` + `tenant_data_tables()` (mig 433); `jszip` is a dependency. | Reuse for §14. |
| Notifications | `notifyTeam` / bell, `sendSystemEmail` (Resend), `job_runs` for cron runs. | Alert path (§5.5). |

---

## 2. Decisions for you — recommended defaults

Each line is what this plan assumes unless you say otherwise. ✅ = approve as written.

| # | Decision | Recommended default | Why |
| --- | --- | --- | --- |
| **D1** | Where the tenant sites run | **A second Next.js app in this repo (`sites/`), deployed as its own Railway service.** It renders every tenant site; the admin UI stays in the GetAutoura app. *(This changes the recommendation in my exploration report — see note below.)* | Keeps public traffic and outages away from the back office, keeps auth code and Supabase credentials out of public sites, and gives the sites their own middleware (hostname routing) instead of threading it through the app's auth middleware. Each language version also needs the correct `<html lang>`; in the current app one root layout is shared by every route, and setting it per request makes every page dynamic. *Without RTL this case is weaker than before:* serving sites from the existing app is workable if you'd rather run one service. |
| **D2** | Service API | **Versioned internal HTTP routes, not tRPC.** The GetAutoura app exposes `/api/publish/internal/*` (signed with a shared secret); the renderer calls them. | tRPC isn't in the repo; the prompt says not to add a framework without asking. Both ends are typed by one shared Zod contract and contract-tested. |
| **D3** | Content engine | **TypeScript module `lib/publish/engine/` inside the GetAutoura app**, behind a narrow interface (§9) so it can move to a separate service later. | No Python in the stack; `day-writer.ts` already does grounded writing. Adding FastAPI adds a language, a deploy and a second AI client. |
| **D4** | "Unified leads table" | **Leads stay `clients` rows (find-or-create by email, then phone, as the concierge already does). Each enquiry also writes one row to a new `publish_enquiries` table** holding source (`web_form` / `concierge_bot` / `whatsapp`), landing URL, campaign/UTM, tour, dates, language. `clients` is not changed; `clients.client_source` gets the existing values `website` / `whatsapp` on first touch. | There is no leads table to write to. One person can enquire many times, so source/page/campaign belong to the enquiry, not the client. This is an attribution record pointing at the lead, not a second leads store. Alternative: add columns to `clients` (changes an existing table; loses repeat enquiries). |
| **D5** | Where "published" lives | **`publish_pages` row per tour, with per-language publish state.** `tour_templates` is not changed. | Leaves the Sell module untouched. |
| **D6** | Content store | **Supabase-native tables** (§4). Sanity not used. | Prompt default; keeps RLS, export and tests in one place. |
| **D7** | A tour whose price is incomplete | **Not publishable.** A tour can be published only with at least one fully priced tier (plus days and inclusions — the spec's thin-page rule). If its price later becomes incomplete, the page stays up with the price block replaced by "Ask for a price" and the tenant is alerted. | Never show a partial number a customer could hold the agency to. Alternative: show the incomplete figure with a warning (as the internal tours list does) — not safe on a public page. |
| **D8** | Cancellation terms and departure weekdays (no records exist) — *approved and built in step 5 (migration 441)* | **Cancellation:** a new tenant-level `cancellation_policies` record in Sell (text per language, structured tiers), with an optional per-tour override. **Departure weekdays:** a `departure_days` column on `tour_templates`, same shape as `nile_cruises.sailing_days`. Until these exist, the page shows dated departures when there are any and omits the sections otherwise. | They are customer promises, so they must be records an operator owns, not Publish text. **Both change Sell's schema — needs your OK.** |
| **D9** | Sync trigger mechanism | **Outbox + poller.** All changes land in `publish_change_log` (E1): products/departures/tenant brand/FX through their own triggers, rates through one trigger on `rate_audit_log` (which every rate table already feeds). Each row is marked processed once delivered — no cursor. A `cron:publish-sync` worker runs **every 5 minutes**, maps changes to pages, calls the renderer's revalidate endpoint, and records health. Pages also carry a 1-hour time-based revalidation as a backstop. | Survives deploys and outages (unprocessed rows wait); a transaction that commits late still shows up as unprocessed, which a cursor over `rate_audit_log`'s timestamps would have skipped — *changed in step 1*; every step is observable. Fast path (Postgres → HTTP via `pg_net`) can be added later. **Revalidation window = 5 minutes** (worst case ~6). If Railway's cron minimum turns out to be finer, we tighten it. |
| **D10** | Which pages a rate change touches | **All of that tenant's tour pages** (45 live tours today). Product/departure changes touch only that tour's page plus listings. | Rates reach tours only through engine lookups (city, tier, preferred hotel, season), so exact dependency tracking would be guesswork. Coarse is correct; at today's sizes it's cheap. |
| **D11** | Module name in the UI | **"Publish"** (sidebar section under its own group). | Open decision from the prompt; one-string change later. |
| **D12** | Price-only auto-publish rule default | **On for every tenant, and prices are outside the rule entirely** — fact slots always render live; see §10. The configurable rule decides only whether a product change that touched fact fields alone republishes silently or also notifies a reviewer. | The prompt says a price change must never wait for approval, which makes "off" impossible for prices. Flagging the contradiction. |
| **D13** | Custom-domain hosting and certificates | **Railway custom domains on the `sites` service** (CNAME from the agency's DNS; Railway issues certificates), wrapped in a `DomainProvider` interface so Cloudflare for SaaS can replace it. | Already our host. Open question Q6 about limits and CDN. |
| **D14** | Languages | **Left-to-right languages only. No RTL support is built** (no `dir` handling, no mirrored layouts, no Arabic fonts). **Every site is English plus one second language the tenant picks** (`publish_sites.languages` = `['en', <pick>]`, at most two in Phase 1). The pick is limited to *supported* languages: a language is supported once it has (a) a fact-check word list with tests, (b) the theme's interface strings ("Enquire", "Day", "Included"…) translated and reviewed, (c) locale formatting for prices and dates. **Phase 1 ships French and Spanish** as supported (the languages `docs/I18N-PHASE1.md` already targets); German and Italian follow the same recipe. Japanese and Chinese are LTR but need CJK fonts and a fact-check that doesn't rely on word boundaries, so they wait for Phase 2. | Ruth, 2026-10-25: no Arabic or RTL sites; each tenant picks its own second language from the supported LTR languages. |
| **D15** | Published-version audit | **Each published version also stores a read-only snapshot of the facts as rendered** (prices, inclusions, terms) — never read back for rendering. | Lets the agency answer "what did the page say on 3 March". It's an immutable audit copy, not editable product data. If you read the data rule as forbidding even this, drop it. |
| **D16** | Sites per tenant | **One site per tenant in Phase 1; schema keys everything by `site_id`** so multi-brand tenants can come later. | Keeps admin simple. |

### Changes to existing modules (each needs your OK)

| # | Module | Change | Why |
| --- | --- | --- | --- |
| **E1** | Sell / Operate | **Add triggers (no column changes)** on `tour_templates`, `tour_variations`, `tour_days`, `tour_day_activities`, the variation-level tables the pricing engine and tour detail read (`tour_variation_services`, `variation_services`, `variation_pricing`, `variation_daily_itinerary`), `tour_departures`, `tenants`, `exchange_rates`, and an AFTER INSERT trigger on `rate_audit_log` → insert into `publish_change_log`, only for companies enrolled in Publish. Never blocks the write (errors are swallowed). *(Built in step 1, migration 439. `tour_variation_options` no longer exists in production, so it is not watched; `rate_audit_log` was added instead of a cursor.)* | Catch every write path. |
| **E2** | Communication | `/api/webhooks/concierge` accepts an optional `attribution` object (landing URL, campaign, tour ref, language) and writes `publish_enquiries`. **The concierge side (other repo) must send it.** | Concierge leads with page and campaign. |
| **E3** | Communication | WhatsApp inbound reads a `Ref:` token from the first message → writes `publish_enquiries`, and uses the token to resolve the tenant when the message arrives on the **shared** number (today those are dropped). | Click-to-WhatsApp attribution. |
| **E4** | Sell | D8 (`cancellation_policies`, `tour_templates.departure_days`). | Facts that don't exist yet. |
| **E5** | App shell | Sidebar group "Publish"; role gates via `lib/api-role-gate.ts`. | Admin UI. |

---

## 3. Architecture

```
GetAutoura app (existing)                               sites/ app (new, one for all tenants)
───────────────────────────                             ──────────────────────────────────────
Sell / Operate tables ──triggers──► publish_change_log   middleware: Host → site (cached)
rate tables ──(existing)──► rate_audit_log                  │
                │                                           ▼
        cron:publish-sync ───── POST /api/revalidate ──► revalidateTag(...)
                │  (health, alerts)                        │ on render / revalidate:
                ▼                                           ▼
  /api/publish/internal/page-data  ◄──── signed GET ──── fetch page payload
     facts from records + pricing engine                    (facts + approved narrative + theme)
     + approved narrative from publish_versions             │
                                                            ▼
  /publish/* admin UI, engine, approvals            static HTML per /{lang}/{path}
  /api/publish/enquiries ◄──── POST (form) ───────── enquiry form, WhatsApp link, concierge embed
```

Rules this enforces:
- **Facts are assembled in one place**, next to the pricing engine, at render time. The renderer never computes a price.
- **The renderer has no Supabase credentials.** It sees only the page payload, which contains published content only.
- **Narrative arrives as segments with slot tokens**; the renderer fills slots from the facts in the same payload.

---

## 4. Data model

All tables: `tenant_id uuid not null references tenants(id) on delete cascade`, RLS on, indexed by `tenant_id`. Policies use `get_user_tenant_id()`. "Members" = authenticated users of that tenant. Writes from webhooks, the worker and the renderer path use the service role with an explicit tenant filter (the existing convention).

| Table | Key columns | RLS |
| --- | --- | --- |
| `publish_sites` | `id`, `archetype` (`private_journeys`/`transparent_value`), `status` (`draft`/`live`/`suspended`), `languages text[]`, `default_language`, `brand jsonb` (logo path, palette tokens, font pair key, tone, claim list, words to avoid), `settings jsonb` (indicative currencies, WhatsApp on/off) | Members select; admin/manager update; insert/delete super-admin (enabling Publish) |
| `publish_domains` | `site_id`, `hostname` (**globally unique**, lower-case), `kind` (`primary`/`alias_redirect`/`test`), `status` (`pending_dns`/`verifying`/`active`/`failed`), `provider_ref`, `verified_at`, `last_checked_at`, `last_error` | Members select own; admin/manager insert/delete; uniqueness across tenants checked by a SECURITY DEFINER function that returns only "taken / free" |
| `publish_pages` | `site_id`, `kind` (`tour`/`home`/`listing`/`about`/`how_we_work`/`contact`/`legal`), `tour_template_id` (nullable FK, unique per site), `blocks jsonb` (non-tour pages: ordered approved block keys) | Members select; admin/manager write |
| `publish_page_locales` | `page_id`, `language`, `slug` (unique per site+language), `is_published`, `current_version_id`, `published_at` | Members select; admin/manager write |
| `publish_drafts` | `page_id`, `language`, `kind` (`narrative`/`seo`/`blocks`/`faq`), `content jsonb` (segments, §9), `sources jsonb`, `check_result jsonb`, `status` (`draft`/`in_review`/`approved`/`rejected`/`superseded`/`failed_check`), `origin` (`engine`/`user`), `model`, `prompt_version`, `fact_fingerprint`, `reviewer_note`, `reviewed_by`, `reviewed_at` | Members select/insert/update while not approved; approve/reject via route with role gate |
| `publish_versions` | `page_id`, `language`, `version_no`, `content jsonb`, `facts_snapshot jsonb` (D15), `reason` (`approved_draft`/`fact_refresh`/`rule_auto`), `draft_id`, `approved_by` (null for automatic), `approved_at` | Members select; **no update/delete for anyone but service role** (insert-only history) |
| `publish_rules` | `site_id`, `rule_type` (`auto_publish_fact_only`), `enabled` | Members select; admin/manager update |
| `publish_glossary` | `term_key`, `kind` (`site`/`hotel`/`cruise`/`house`), `language`, `spelling`; unique (`tenant_id`,`term_key`,`language`) | Members select/write |
| `publish_media` | `site_id`, `storage_path` (bucket `publish-media`, **public by design** — these are published site images), `width`, `height`, `alt jsonb` (per language, reviewed with the page), `is_placeholder` (stock flag), `checksum` | Members select/write; storage policy restricts writes to the tenant's folder |
| `publish_redirects` | `site_id`, `from_path` (unique per site), `to_path`, `status_code` (301/302) | Members select/write |
| `publish_enquiries` | `site_id`, `page_id`, `client_id` (FK `clients`), `source` (`web_form`/`concierge_bot`/`whatsapp`), `landing_url`, `campaign`, `utm jsonb`, `language`, `tour_template_id`, `dates jsonb`, `travellers`, `message`, `concierge_brief_id`, `whatsapp_conversation_id`, `ref_token`, `created_at` | Members select; insert service role only |
| `publish_wa_refs` | `token` (short, unique), `site_id`, `page_id`, `landing_url`, `campaign`, `language`, `created_at`, `matched_at` | Service role only |
| `publish_change_log` | `id bigserial`, `table_name`, `record_id`, `op`, `changed_fields text[]`, `template_id` (derived where possible), `changed_at` | Service role only |
| `publish_sync_health` | `tenant_id` PK, `status` (`ok`/`lagging`/`failing`/`stalled`), `last_event_at`, `last_success_at`, `last_failure_at`, `last_error`, `consecutive_failures`, `lag_seconds`, `alerted_at` | Members select own; super-admin all; writes service role |

Nothing in these tables duplicates a product, rate, departure or policy value except the immutable audit snapshot in D15.

**Isolation tests** (step 2): two tenants seeded in the PGlite migration build; acting as `authenticated` with each tenant's JWT claims, assert tenant A can neither select nor insert/update/delete tenant B's `publish_pages`, `publish_drafts`, `publish_versions`, `publish_media` (rows and storage paths) and `publish_enquiries`; plus route-level tests that every `/api/publish/*` handler filters by the caller's tenant.

---

## 5. Sync

### 5.1 Events Publish consumes

| Event | Source | Pages affected |
| --- | --- | --- |
| `product.created` / `product.updated` | `publish_change_log` on `tour_templates`, `tour_variations`, `tour_variation_options`, `tour_days` | That tour's page (all languages) + listings; if narrative-relevant fields changed, queue regeneration (§10) |
| `product.unpublished` | `tour_templates.is_active` → false, or delete | Page returns 410 and leaves sitemaps; tenant notified |
| `rate.changed` | `rate_audit_log` (13 tables, existing) → `publish_change_log` | All the tenant's tour pages (D10) |
| `departure.changed` | `publish_change_log` on `tour_departures` (includes Sawa-mirrored rows) | That tour's page |
| `policy.changed` | `cancellation_policies` (after D8) and tenant identity fields on `tenants` (name, licence number, WhatsApp number, logo) | Tours using the policy / whole site |
| `fx.changed` | `exchange_rates` refresh | Tour pages (indicative prices and EGP-denominated costs) |

### 5.2 One registry, no names in strings

`lib/publish/sync/events.ts` exports a registry: `{ type, payloadSchema (Zod), handler (function reference), tagsFor(payload) }`. The dispatcher only calls handlers through the registry. There is no lookup by function name anywhere — that is the Sawa failure mode.

### 5.3 Contract tests (step 1)

1. Every event type has a schema, a handler and a `tagsFor`; the registry is exhaustive over the event-type union (type-level + runtime test).
2. For each event, a fixture payload passes the schema and **the handler is actually invoked** (spy) and calls the revalidate client with the expected tags.
3. Malformed payloads are rejected and recorded as failures, not swallowed.
4. **Migration-level test:** in the PGlite build, write to each watched table → assert a `publish_change_log` / `rate_audit_log` row appears. A watched table without a trigger fails CI; a trigger on a table with no registered event fails CI.
5. End-to-end in-process: update a rate row → run one worker cycle → assert revalidate was called for every tour tag of that tenant and health shows `ok`.
6. Renderer side: `/api/revalidate` rejects unsigned calls and calls `revalidateTag` for each tag it receives.

### 5.4 Health

Each cycle writes `job_runs` (global heartbeat) and updates `publish_sync_health` per tenant:
- **failing** — a handler or revalidate call errored (`consecutive_failures` ≥ 1).
- **lagging** — oldest unprocessed change is older than 2 × the window.
- **stalled** — the worker's last `job_runs` entry is older than 3 × the interval (checked after every OTHER scheduled job runs — mail alerts and scheduled send also run every 5 minutes — not by the worker itself, so a dead worker is still noticed; `/api/health` is Railway's deploy healthcheck, so it is deliberately not used). *Changed in step 1.*

### 5.5 Alerts

On entering `failing`, `lagging` or `stalled` (de-duplicated, at most one alert per tenant per state per 6 hours): a bell notification to the tenant's admins (`notifyTeam`) and an email to the platform super-admins (`sendSystemEmail`). Recovery sends one "back to normal" notification. The admin home shows the status badge permanently.

---

## 6. Renderer and routing (`sites/`)

*Built in step 3 — this section describes what exists.*

- **Hostname → site:** `sites/proxy.ts` (Next 16's name for middleware) asks `/api/publish/internal/site?host=…`, cached in memory for 60 s and cleared on every revalidate call. A hostname serves its site when it is a `test` domain (any status — how a site is seen before launch), or a verified `primary`/`alias_redirect` of a `live` site; a suspended site is served nowhere. Unknown host → plain 404 naming no company. Alias → 301 to the active primary. The app unreachable → 503 with Retry-After, never a 404.
- **Internal path:** `/{lang}/{...path}` → `/s/{tenant}/{site}/{mode}/{lang}/{...path}`, `mode` = `live` or `preview` (test hostnames; unpublished pages shown and flagged, everything `noindex`). Every visitor path is rewritten, so a typed `/s/…` is just an unknown page of the site.
- **Routes built:** `/{lang}` home (exists even with no home page row: lists the published tours), `/{lang}/tours`, `/{lang}/tours/{slug}`, `/{lang}/{core-page-slug}`; the site's own 404 for anything else. `/` → 302 to the visitor's language if the site has it (Accept-Language as a hint, `Vary: Accept-Language`), else English. Still to come: `/enquire/thanks`, sitemaps, robots, `/go/wa`.
- **Rendering:** the root layout sits at the language segment, so `<html lang>` is right per language. `generateStaticParams` empty + `dynamicParams` → built on first request, then static (verified on a production build: MISS, then HIT); `revalidate = 3600` backstop.
- **Tags:** company-keyed, as the worker sends them: every page carries `publish:tenant:{id}` and `publish:tenant:{id}:tours` (*coarser than first planned*: a tour's product id is only known after its data is read, and the worker refreshes `tours` on any product change anyway). The renderer expires a tag at once (`revalidateTag(tag, { expire: 0 })`) — verified: a change reaches the very next request.
- **Internal API auth:** `Authorization: Bearer PUBLISH_INTERNAL_SECRET` (*changed from "signed"*): a timestamped signature would change the fetch cache key on every request. Read-only, server to server, over HTTPS.
- **Redirects:** `publish_redirects`, exact path match, before language handling; internal targets keep the query string.
- **One instance first:** Next's file-system cache is per instance; if we scale `sites` beyond one replica we add a shared cache handler (noted, not built). The pages send `s-maxage=3600, stale-while-revalidate`: **a CDN in front (Q6) must not serve stale after a revalidation** — decide with step 11.
- **No healthcheck path** on the renderer service yet: every path is a company site, so Railway's own hostname is an unknown host by design.
- **Test domains:** locally `{name}.localhost:3001` against `scripts/publish-dev-api.mjs` (a fixture standing in for the internal API — no database needed; see `sites/README.md`). On Railway a `test` domain row per site (e.g. a subdomain of the agency's own domain, CNAMEd to the `publish-sites` service).

---

## 7. Archetype themes and brand layer

*Built in step 4 — this section describes what exists.*

- **Theme packages:** `sites/themes/private-journeys/` and `sites/themes/transparent-value/`, registered in `sites/themes/index.ts` (typed so an archetype without a theme does not compile). Each exports its frame (header, footer), its pages by kind, and its **tour section order** — the archetype's sales logic: Private journeys tells the journey first and the price late, ending on the consultation; Transparent value puts price, the way to ask and inclusions above the itinerary. Sections render from records (step 5) or approved narrative (step 7) and render **nothing** without data — no placeholder price, no invented inclusion (a test renders every page kind and fails on any digit or currency it was not given).
- **Shared blocks:** brand mark (logo from the company record, else its name), language links (this page in the other language — real URLs), contact links from the record (WhatsApp/email/phone, each only when the record has it), tour sections in manifest order. Step 8 swaps the plain WhatsApp link for the tracked `/go/wa`.
- **Brand layer = configuration only** (`lib/publish/brand.ts`, shared with the future admin screen): palette (primary, accent, ink, surface), typeface pair from a fixed list of five, tone (for the engine). A stored choice is used only if valid **and readable** (body text ≥ 4.5:1, links/buttons ≥ 3:1 against the background); otherwise that field falls back to the archetype default and the reason is kept for the admin — never an error on a live site. Text colour on buttons is computed for contrast. The brand reaches the page only as CSS variables on `<body>` (validated hex only), so two companies on one archetype get identical markup.
- **Fonts:** `next/font` at build time, self-hosted (no request to Google from a visitor), Latin + Latin Extended; only the chosen pair's variables are applied; `preload` off so no page downloads faces it does not show; `display: swap` with metric-matched fallbacks.
- **Company identity** (tagline, logo, phone, email, WhatsApp, address, licence) joined the page payload from `tenants`; the sync worker already refreshes the site when those fields change.
- **Contract version:** `CONTRACT_VERSION` is sent on every internal request — a cached answer in an old shape sits under a different cache key after a deploy, and the app answers 409 to a renderer on another version. *(Found while building: the dev cache served a pre-change payload and the page crashed.)*
- **Interface words** (`sites/i18n/strings.ts`) are English for now; a French or Spanish page shows English buttons and labels until step 10 adds the reviewed translations.
- **Performance:** no client JavaScript in the themes; images (none yet in the payload) arrive with step 5 via `next/image`. The Lighthouse run in CI is still to add — with real tour pages in step 5.

---

## 8. Tour page — where every fact comes from

*Built in step 5 — this section describes what exists.* Assembled by `lib/publish/tour-facts.ts` in the GetAutoura app on every (re)build of a page; returned in the page payload (`tour.facts`, contract v3); never stored.

| Shown on page | Read from |
| --- | --- |
| Images | `tour_templates.image_url`, `gallery_urls` (https only) |
| Itinerary by day | `tour_templates.itinerary` (where the day editor writes): title, city, meals provided (in the rate or bought), sights by the engine's own rule (`lib/tours/day-attractions.ts`), night = the record's accommodation (a one-day tour never has one). Free-text day descriptions are left for the approved narrative (step 7). |
| Highlights | `tour_templates.highlights` + `main_attractions` |
| Inclusions / exclusions | the tour's, plus the priced tier's `tour_variations` lists, once each |
| Where it sleeps | the engine's priced hotel/cruise lines for the priced tier (`PricedService.property`, added for this — never parsed from a label; an unpriced line is never shown) |
| Price | engine, **2 travellers sharing, both nationality bases, every tier, the agency's house margin (`tenants.default_margin_percent`; 25% only if unset — a test pins that unset never becomes 0%), no travel date = lowest season**. "From" = the cheapest **complete** (tier, basis); EU / other nationalities both shown when they differ; table for 2/4/6 (the 2-traveller row is the "from" figure). Displayed in whole units rounded **up**. |
| Indicative currencies | `publish_sites.settings.indicativeCurrencies` (≤ 3), converted with an `exchange_rates` row no older than 7 days (the company's own rate first); labelled "Indicative only … you pay in {currency}; rate of {date}". No fresh rate → no conversion. |
| Departure days | `tour_templates.departure_days` (migration 441); empty → nothing shown, never "daily" |
| Upcoming departures | `tour_departures` from today: open / guaranteed / full, seats left = max − booked, up to 12 |
| Group size | the priced tier's `min_pax` / `max_pax` |
| Cancellation terms | `cancellation_policies` (migration 441): the tour's own, else the company default. Tiers render as "N days or fewer before departure: X% charged when cancelled"; anything earlier than the largest N is not stated — never called free. The agency's own wording shows only in the language it was written in. |
| Agency identity, licence | `tenants` (step 4) |

**Price on request (D7):** no complete tier → `status: on_request`, and the payload carries **no amount at all** (the contract refuses one). The page says "Price on request — ask us for a price for your dates."

**Publishability (D7):** days, inclusions, a complete price, switched on. Returned with each tour as `publishable { ok, reasons }`. A *published* page that stops qualifying still shows (price on request) and the company's owners/admins/managers get one bell notice per tour per week. **Blocking a publish** is the approval workflow's job (step 7), using the same rule.

**Measured on production (2026-10-25, read-only):** of 52 active tours, 14 have a complete price and 13 would pass the publishability rule today; 38 would show "price on request". None of the 14 has differing EU/other rates.

**Not in step 5:** prices on listing cards (each needs a full engine run — a lighter price-only path first); admin screens for departure days and cancellation policies (the tour CSV carries departure days already); the Lighthouse CI budget.

--- | --- |
| Name, images | `tour_templates.template_name`, `image_url`, `gallery_urls` (+ `publish_media` replacements) |
| Itinerary by day (city, hotel, meals, sights) | `tour_days` + `tour_templates.main_attractions` / day sightseeing as the engine reads them |
| Inclusions / exclusions | `tour_templates.inclusions`/`exclusions`, refined by the tier's `tour_variations` values |
| Hotel / cruise options per tier | Engine resolution per tier (named hotel/ship wins over tier, as #510) |
| Price-from, price table | Pricing engine per tier for a reference group size (default 2 adults; Q4) — lowest **complete** tier (D7) |
| EU / non-EU prices | Engine run on each nationality basis when the priced components carry both; shown as two labelled prices |
| Indicative currencies | `exchange_rates`, labelled "Indicative — you pay in {payment currency}" |
| Departure days / dates | `departure_days` (after D8), cruise `sailing_days`, upcoming `tour_departures` with seats left |
| Group size | `tour_variations.min_pax` / `max_pax` |
| Cancellation terms | `cancellation_policies` (after D8) |
| Agency identity, licence (ETAA) | `tenants` (`company_name`, `license_number`, `company_address`, `whatsapp_number`) |

**Publishability check** (shown in admin, enforced on publish): has days, has inclusions, at least one complete tier, has at least one non-placeholder image (warning only in Phase 1).

---

## 9. Content engine (`lib/publish/engine/`)

*Built in step 6 — this section describes what exists.*

- **`draftNarrative(input, callModel)`** (`engine.ts`) — kinds `overview`, `highlights`, `days`, `seo`; languages en/fr/es (a language without a post-check word list is refused before any call). Output is a draft: segments of text (with the ids of the agency notes used) or a fact **slot** by key.
- **What the model is given:** the tour's shape from the records (days, cities, sights, meals, nights, main attractions, where it stays), the agency's tone, the claims it may make and the words it avoids (`publish_sites.brand.claims` / `.avoid`), its glossary, its own notes, the reviewer's note on a rejected draft. **Never** prices, durations, group sizes, dates or terms — those exist only as slots. A test asserts the prompt carries none of them.
- **Slots** (`slots.ts`): `price_from`, `duration`, `group_size`, `departure_days`, `next_departure`, `cancellation` — offered only when the fact exists (no price slot on a price on request); the JSON schema enforces the list; a slot the tour cannot fill is dropped, never rendered blank. Rendering slot values on the page comes with the approved narrative (step 7).
- **Post-check** (`fact-check.ts` + `words/{en,fr,es}.ts`): refuses any digit (every script), Roman numerals (two letters or more, upper case), number words and ordinals (from "second"; articles that mean "one" are left alone), currency signs/codes/names, months, weekdays and schedule words, policy and promise words (whole words, `*` for prefixes, so "free" does not catch "freedom" nor "tax" "taxi"). Names from the records and the glossary are masked first ("KV62", "Ramses II", "Travel2Egypt"); day titles and highlights are not names and are not masked. Claims are flagged for the reviewer unless on the claim list. The same check will run on every human edit before approval (step 7).
- **Retries:** a draft that fails is sent back, append-only, naming each offending word; at most three attempts, then kept as `failed_check` for a person — never passed as clean. A refusal, `max_tokens`, invalid JSON or empty reply ends the loop with the reason in `notes`.
- **Model call** (`generate.ts`): the product's single model constant (`lib/ai/models.ts`), structured output (`output_config.format` JSON schema), effort `medium`, the static system prompt cached. `generateTourDraft()` gathers a page's inputs (site, page, facts, glossary) — reads only; storing and approving drafts is step 7.
- **Not yet:** matching the Content Library to a tour as source notes (the input exists; step 7 fills it), the cross-tenant similarity check (Phase 2).
- **Live check: blocked** — the app's `ANTHROPIC_API_KEY` in `.env.local` was rejected (401) on 2026-10-25; to run once the key is updated.

---

## 10. Draft and approval workflow

*Built in step 7 — this section describes what exists.*

- **Parts:** a page's text in one language is four parts — overview, highlights, day narratives, search title/description — drafted and approved separately (`lib/publish/admin.ts`). A published version (`publish_versions.content`) is the whole **bundle** at an approval: the approved part replaces its predecessor, the others carry over (`lib/publish/narrative.ts`).
- **Roles:** writers (owner/admin/manager/member) ask the engine for a draft and edit drafts; managers (owner/admin/manager) add tour pages, approve, reject and publish (`lib/publish/admin-route.ts` → `roleDenied`). Viewers read. Server writes use the service role with the company named in every query; RLS (mig 440) already refuses approvals, versions and engine drafts from a browser.
- **Approval** (`POST /api/publish/drafts/[id]/approve`): only an `in_review` draft; the post-check is **re-run on the text as it stands** (a fact slipped in sends it back to `failed_check`); a draft written before the tour's days, sights or stays changed is refused ("draft it again"); a new numbered version records the approver (id and name), the draft, and the D15 snapshot of the facts as shown; the page language points at it; older open drafts of that part are retired; the site is refreshed if the language is published (a renderer that is down leaves a warning, never undoes the approval).
- **Rejection** needs a note, kept as the next draft's instruction. **Edits** (`PATCH /api/publish/drafts/[id]`) are shape-checked and held to the same post-check as the engine; only open drafts can be edited; an edit cannot change which part a draft is.
- **Publishing a language** (`POST /api/publish/locales/[id]/publish`): a tour page publishes only past the thin-page rule (D7: days, inclusions, a complete price, switched on) — with or without approved text, since the facts are the page. Unpublishing is always allowed.
- **Facts never wait.** Prices and other facts render live; nothing about them needs approval.
- **Text the records have overtaken is withheld at render, not by a job** (*changed from the plan*): each part stores a fingerprint of what it could mention (cities, sights, nights, stays; each day its own). When the records change those, the part stops showing — the page shows its facts — and a part whose fact slot can no longer be filled (price on request) stops showing too. The company's managers get one bell notice per page and language per week ("new text needed"). No draft is generated automatically: a person asks for one (an engine call per change would cost money on every edit).
- **The fact-only rule (D12):** on by default — a change of facts alone republishes silently. Switched off, the company is also told (weekly) when a page's facts changed under approved text. *Changed from the plan:* no `fact_refresh` version row is written per change — rates change often and every tour page would gain a row each time; what a page showed at any moment is reconstructable from the approval snapshots plus `rate_audit_log`.
- **Rendering** (contract v4): the page payload carries only the renderable parts; themes print the overview (in paragraphs), written highlights in place of the records' list, each day's text under its day, and the approved SEO title/description in the page metadata — every slot filled from today's facts (`sites/themes/blocks/narrative.ts`).

---

## 11. Lead capture

*Built in step 8 (2026-10-27), with the operator's answers to Q1, Q3 and Q7:*
- ***Q1 — no concierge on company sites in Phase 1.*** *The concierge lives inside `travel2egypt-next` (its prompt speaks as Travel2Egypt, its tours come from that site's CMS, and it routes only our four brands), so it cannot be embedded on another company's site. A white-label concierge built inside Autoura from each company's own Publish facts is a later phase.*
- ***Q3 — a form enquiry is a lead + an enquiry row + a client note + a bell notice; no Inbox conversation.***
- ***Q7 — click-to-WhatsApp only for a company with its own number*** *(`tenants.whatsapp_number`); a shared-number company shows the form and its email/phone.*
- *Routes: the renderer's `/api/enquire` (form POST) and `/api/wa` (button), which call `/api/publish/internal/enquiry` and `/api/publish/internal/wa-ref`; the outcome is shown by a `:target` anchor so pages stay static. Code: `lib/publish/enquiries.ts`, `sites/lib/lead-capture.ts`.*

All three paths write a lead into `clients` (find-or-create, existing logic factored out of `lib/concierge-brief-intake.ts`), a `publish_enquiries` row, and a bell notification.

- **Enquiry form:** pre-filled with tour, tier and dates from the page; POST to `/api/publish/enquiries` on the GetAutoura app via the renderer (site resolved from the host, never from the body). Honeypot + per-IP rate limit (existing `lib/rate-limit`). Landing URL, `utm_*` and `campaign` are captured from the page URL into hidden fields. Also adds a `client_notes` entry with the message.
- **Concierge bot:** embedded lazily on tour pages with `data-*` attributes (brand, tour ref, landing URL, campaign, language) → the concierge includes them as `attribution` in the brief (E2) → `publish_enquiries.source='concierge_bot'` linked to the brief.
- **Click-to-WhatsApp:** the button links to `/go/wa?p={pageId}&c={campaign}` on the site, which stores a `publish_wa_refs` token and 302s to `wa.me/{tenant number}?text=` with the tour name and `Ref: {token}`. On inbound (E3) the token is matched → `source='whatsapp'`. Without JS, without cookies.

---

## 12. SEO, structured data, languages

*Built in step 9 (2026-10-27): `sites/lib/seo.ts` (canonical + hreflang + x-default on the primary hostname only — the page payload carries `site.publicHost`; JSON-LD TravelAgency / TouristTrip + Offer(s) / BreadcrumbList; robots.txt and sitemaps), `/api/publish/internal/sitemap`. Editable SEO title/description were already built in step 7 (draft kind `seo`). FAQPage waits for an FAQ block; no Review/AggregateRating. The manual Rich Results check needs a live site on a public primary domain (step 11).*

- **JSON-LD from the payload only:** `TravelAgency` (name, address, phone, licence as `identifier`), `TouristTrip` (name, description from the approved overview, `itinerary` as an `ItemList` of days, `provider`), `Offer` (price, `priceCurrency`, `availability`, `url`; EU and non-EU as two offers distinguished by `name`/`eligibleCustomerType`-style description — Q5), `BreadcrumbList`, `FAQPage` only when the page has an approved FAQ block. No `Review`/`AggregateRating` in Phase 1.
- Tests: snapshot + structural validation of each type against a fixture tour; the price in JSON-LD must equal the price in the HTML (same payload field); manual Rich Results check recorded for one page per archetype.
- Canonical per language; `hreflang` for each enabled language plus `x-default` on every page and in sitemaps (`xhtml:link`); sitemap index + one sitemap per language; `robots.txt` per host; editable title and meta description as `seo` drafts (same post-check).
- **Second language (tenant's pick, D14):** separate URLs (`/{lang}/...`, slugs per language), `<html lang>` per language, `Intl` formatting of prices and dates for that locale, glossary-enforced names, theme interface strings from `sites/i18n/{lang}.ts` (a typed dictionary, as `docs/I18N-PHASE1.md` chose; no i18n framework). The Setup screen offers only supported languages. Changing a site's second language unpublishes the old language's pages and returns 410 for their URLs (removed from sitemaps), and queues drafts in the new language for approval. Left-to-right only.

---

## 13. Domains

`DomainProvider` interface (`add`, `status`, `remove`) with a Railway implementation (D13). Admin flow: tenant enters hostname → we show the exact DNS record → poller checks DNS and certificate → `active`. Apex + `www` handled (one primary, the other `alias_redirect`). The domain is always the agency's: we never register domains in Phase 1; the UI says so and links to the DNS guide. Proper 404/410 pages per theme and language.

---

## 14. Export

`/publish/export` → one zip (built with `jszip`, streamed; background job if large):
- `pages/{lang}/{slug}.html` — the rendered pages as served (fetched from the renderer, with assets rewritten to relative paths), so the site can be hosted elsewhere as-is;
- `pages/{lang}/{slug}.md` — narrative + facts as Markdown with front matter;
- `media/` — originals + `media.csv` (alt text per language);
- `redirects.csv` plus `_redirects` (Netlify/Cloudflare) and `nginx.conf` snippets;
- `leads.csv` — `publish_enquiries` joined with client name/email/phone;
- `site.json` — archetype, brand, glossary, page tree, sitemaps.

Test: export a fixture site, unzip, assert every published page/language, every media file and every redirect is present and that the HTML files open without the renderer.

---

## 15. Admin screens (inside GetAutoura, `/publish`)

*Step 7 built **Overview** (`/publish`, with "add a tour page") and **Page review** (`/publish/pages/[id]`, with drafting, editing under the post-check, approve/reject, publish, version history), and the sidebar section "Publish → Website". The rest are still to come.*

| Screen | Purpose |
| --- | --- |
| Overview | Site status, domains, **sync health badge**, pages published per language, drafts waiting |
| Setup | Archetype, brand (logo, palette, font pair, tone, claim list), languages |
| Tours | Every product with its publishability check, publish/unpublish per language |
| Page review | Draft vs live preview, slots highlighted, sources, check result, approve/reject, version history |
| Approvals | Queue of drafts in review |
| Core pages | Home/about/how-we-work/contact/legal from the theme's blocks |
| Glossary | Terms per language |
| Media | Upload, alt text, placeholder flags |
| Domains & redirects | DNS instructions, status, redirect list |
| Enquiries | List of `publish_enquiries` with source/page/campaign, linked to the client (verification, not reporting) |
| Export | Download archive |
| Super-admin: Publish health | All tenants' sync health and worker heartbeat |

---

## 16. Build order (one reviewable PR per step, each with tests)

| Step | Delivers | Tests | Needs first |
| --- | --- | --- | --- |
| 1 | Sync: registry, `publish_change_log` + triggers (E1, incl. `rate_audit_log`), worker `cron:publish-sync`, health, alerts, watchdog, the shared revalidate protocol (the renderer's route itself lands with the renderer in step 3) | §5.3 1–6 | D9, D10, E1 |
| 2 | Data model + RLS + storage bucket + isolation tests | §4 isolation | D4–D6, D15, D16 |
| 3 | `sites/` app, host routing, internal page-data API skeleton, test-domain support | routing, unknown host, redirect, signed internal calls | D1, D2 |
| 4 | Two archetype themes + brand layer | visual snapshots, Lighthouse budget | — |
| 5 | Tour pages from data (facts module, engine prices, EU/non-EU, indicative currency, departures, publishability) | fact-source tests, D7 behaviour, rate change → price change e2e | D7, D8/E4 |
| 6 | Content engine + post-check | §9 rule tests both languages, adversarial set | D3 |
| 7 | Drafts, approvals, versions, fact-only rule, stale-day withdrawal | workflow + fingerprint tests | D12 |
| 8 | Lead capture: form, concierge attribution, WhatsApp ref | one enquiry per source lands with correct source/page/campaign | D4, E2, E3, Q1 |
| 9 | JSON-LD, sitemaps, canonical, SEO drafts | §12 | Q5 |
| 10 | Tenant-picked second language (French, Spanish), hreflang, glossary | §12 languages: hreflang pairs for each pick, word-list tests for French and Spanish, locale formatting, only supported languages selectable, language switch → 410 + new drafts | D14 |
| 11 | Domains | provider adapter with fake + one real test domain | D13, Q6 |
| 12 | Export | §14 | — |

**Phase 0 gate** = steps 1–4 plus step 5 enough to show tour pages on a test domain, with sync alerts working. *Changed 2026-10-25 (operator): the four own brands keep their existing websites, so the gate runs on a **fictional test brand** instead — the "Autoura Sandbox" company, seeded with invented rates and tours by `scripts/publish-seed-sandbox.mjs` (dry run by default; `--apply`; `--remove`). Seeded 2026-10-25: 72 invented rows, site + test domain `sandbox.localhost`, enrolled; its three tours price completely in all four tiers and pass the thin-page rule.*

**Found while seeding (pricing engine, outside Publish):** the engine prices hotels and Nile cruises from the EU column only (`ppd_eur`, seasonal periods' `ppd_eur`) for every traveller — the other-nationality hotel/cruise rates are entered but never used. So a tour page's EU/other split (Q5) can today only come from entrance fees, flights, trains and activities. Raised with the operator; not changed. I report after each step: what was built, what was tested, what changed from this plan.

---

## 17. Assumptions

1. Our own brands to run first are existing production tenants (Sillage Egypte for Private journeys; AffordEgypt or Travel2Egypt for Transparent value — Q2).
2. "Payment currency" on the site = the tenant's quoting currency (`tenants.rates_currency`, EUR for our brands). Online payment is out of scope, so "indicative" labels refer to that currency.
3. The pricing engine is fast enough at revalidation time (one tour ≈ the cost of today's per-card price call). If a full-tenant revalidation after a rate change is too slow, the worker spreads it out; prices never come from a cache that the operator didn't approve.
4. Approvers are tenant `admin`/`manager`; `staff` can edit drafts but not approve.
5. A Publish site exists only when a super-admin enables it for a tenant; billing (the Publish add-on) is not wired in Phase 1.
6. The PGlite migration build used in CI can run RLS tests as `authenticated` with JWT claims; if not, isolation tests run against a disposable Supabase branch.
7. Legal pages (terms, privacy, cookies) are written by the agency (human text, not engine output); Publish supplies the page and the licence display.
8. The Content Library (`content_library`) is the "source material" input for tour narratives in Phase 1; guide interviews and uploads come with the guides engine in Phase 2.

## 18. Open questions

- **Q1** Where does the concierge widget code live, and can it accept `data-*` attributes and send an `attribution` object? (Blocks step 8 concierge path.)
- **Q2** Which two tenants are our first brands, and which test hostnames can we CNAME to the `sites` service?
- **Q3** Do web-form enquiries also need to appear as an **Inbox conversation** (a `unified_conversations` row), or are a lead + bell notification enough for Phase 1?
- ~~**Q4**~~ **Answered (2026-10-25):** "price from" is per person for **2 travellers sharing**, plus a per-person table for **2, 4 and 6** travellers on the tour page.
- **Q4b (answered 2026-10-25):** public prices use the **agency's house margin** (`tenants.default_margin_percent`, as quotes do; 25% only where none is set), not the engine's fixed 25%; and "from" is the **lowest season** (no travel date), with the page saying prices vary by date.
- ~~**Q5**~~ **Answered (2026-10-25):** both prices, labelled **"EU passport holders"** and **"Other nationalities"**, only on tours whose rates actually differ.
- **Q6** Railway custom-domain limits per service and whether to put a CDN (e.g. Cloudflare) in front of `sites` for Core Web Vitals outside Europe.
- **Q7** Do shared-number WhatsApp tenants (no own number) get click-to-WhatsApp at all, given E3 makes it possible via the ref token?
- ~~**Q8** Second language~~ — **answered (Ruth, 2026-10-25): each tenant picks its own second language from the supported LTR languages.** See D14.
- Plus every **D1–D16** and **E1–E5** above.

## 19. Acceptance criteria → where they're proven

| Criterion | Proven by |
| --- | --- |
| Rate change updates the live page in both languages within the window | Step 1 e2e (worker → tags) + step 5 e2e (rate row → rendered price), run for `en` and the second language |
| Draft with number/currency/date/policy outside a slot rejected | Step 6 post-check tests |
| No AI text publishes without approval except the fact-only rule | Step 7 workflow tests (no code path writes `publish_versions` with `reason='approved_draft'` without an approver) |
| One enquiry per source lands with source, page, campaign | Step 8 tests + one live test per source on a test domain |
| Tenant isolation for pages, drafts, media, leads | Step 2 isolation tests |
| Sync failure → alert + visible health | Step 1 tests (failing, lagging, stalled) + admin badge |
| JSON-LD validates; hreflang pairs English with the second language | Step 9/10 tests + recorded Rich Results check |
| ~~True RTL Arabic~~ | **Removed from scope** (Ruth, 2026-10-25) |
| Export rebuilds the site elsewhere | Step 12 archive test (HTML opens without the renderer) |
| Two of our brands on Publish on test domains | Phase 0 gate, verified live |
