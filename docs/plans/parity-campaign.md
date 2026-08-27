# Parity campaign — closing the gap with the reference implementation

**Status: PLANNED** · Written 2026-08-29, immediately after the productization
campaign (P1–P6 + self-hosted deliverables, PRs #232–#239, release v2026.08.29).

The reference implementation (`~/whatsapp_to_quote/travel-ops-pro` — the
operator's own agency ops tool) kept evolving for months while this product
stood still, and the productization campaign ported only its multi-tenant
enablers. This plan catalogues everything the reference has that the product
still lacks, verified by a feature-by-feature sweep of both repos on
2026-08-29, and sequences the ports.

## Ground rules (unchanged from the productization campaign)

- **Design ports, never cherry-picks.** The repos diverged long ago (68/71
  lib and 236/238 api files differ). Read the reference as a specification,
  re-implement in this repo's idioms (`requireAuth`, RLS +
  `get_user_tenant_id()`, tenant_id stamping, absent-table → success+empty).
- **English-only UI.** Nothing Japanese comes across, ever.
- **Deploy-order safety** on every schema-coupled change: `select('*')`,
  write payloads name new columns only when the client sent them, readers
  treat absence as the old default.
- **Migrations**: append-only, idempotent, numbered `NNN_name.sql`, applied
  with `npm run migrate` (or hand-applied + recorded — column is `name`).
  Every migration must pass the from-scratch replay test
  (`scripts/__tests__/migration-replay.test.ts`) — its exemption list is
  closed.
- **Gated merges**: `gh pr checks N --watch` exit-code-gated, never piped
  through `tail`.
- Where behaviour is prompt-shaped, extend the golden snapshots BEFORE
  refactoring (Step-0 referee pattern).

## Verified gap inventory (2026-08-29)

Sweep method: enumerate reference feature surfaces (app/, lib/, api/ dir
diffs + targeted greps), check the product for equivalents.

### Already ported / not gaps
Multi-destination catalog + settings (P1), destination-parameterised
generation (P2), per-rate contract currency (P3), FX freeze + reprice (P4),
trip-message notify outcomes (P5), department routing exclusivity +
fixed-costs delete (P6). The product's own stack (Stripe billing, signup,
super-admin, invoices/receipts/contract PDFs, dashboard, notifications,
templates, quotes, ops board, staff links, concierge) is its own lineage,
not a gap.

### Deliberately skipped (do not port)
Everything Japanese (日程表 document pipeline, JA message templates,
next-intl); A.T.S-specific paperwork (travel-insurance application forms,
Sawa sync); i18n message keys.

## Phases

### C1 — Customer portal  (size XL, the flagship gap)

The reference portal (`app/portal/[token]`, `app/api/portal/[token]/…`) is
what a paying agency's customers actually touch. The product has only the
read-only share page, trip messages, and the problem report.

Port as design specs:
- **Verify gate** (`VerifyGate.tsx`, `api/portal/[token]/verify`): identity
  confirmation before anything sensitive renders.
- **Per-traveller private links + coordinator view**
  (`lib/portal-links.ts`, `LeadCoordinator.tsx`, `api/.../travellers`,
  `api/.../coordinator`): each traveller gets their own scoped link; the
  lead coordinator sees everyone. Reference campaign: #131–#135.
- **Traveller forms** (`TravellerForm.tsx`, `lib/passenger-validation.ts`,
  `lib/passport.ts`): passenger/passport details captured from the
  traveller side.
- **Document uploads** (`TravellerDocuments.tsx`, `api/.../documents`):
  passports etc. into a PRIVATE bucket — audit this repo's buckets first
  (the reference's lesson: both its existing buckets were public).
  Retention purge after trip end.
- **Change requests** (`ChangeRequestForm.tsx`, `api/.../change-request`).
- **Reprice-on-approve / add-traveller** (`lib/reprice-add-traveller.ts`):
  compose with THIS repo's FX-freeze — an approve that reprices must
  respect `fx_frozen`.
- **Portal chat**: the product already has `trip_messages` (291/292) + P5
  notify outcomes — integrate the portal UI onto that channel; do NOT port
  the reference's chat storage. Thread scope mirrors the link
  (per-traveller vs coordinator).

Migrations: traveller links table, change_requests, documents metadata +
private bucket. Existing `itinerary_shares` stays for the read-only page;
decide link-model unification inside the phase.

### C2 — Commissions (both directions) + supplier consolidation  (size L)

- **Two-direction commissions** (`lib/commission-generation.ts`): supplier
  `commission_type` = we-pay | we-receive (| profit-share); generation
  engine computes owed/owing per service; profit-share guards ("no client
  price → no profit to share" error). Reference campaign: #138–#142.
- **Supplier vocabulary consolidation** (`lib/suppliers/fields.ts` et al.):
  supplier form = contact + location only, role details live in rates;
  delete guards counting rate references; consider guides-as-view-over-
  suppliers (reference did this; the product has separate `guides` +
  `guide_rates` — decide inside the phase, it is invasive).

### C3 — Pricing depth  (size L, four independent slices)

1. **Seasonal demand premium** (reference `auto-pricing-service`
   season-calendar params, #99/#100): the operator's own high-date calendar
   applies a premium to the WHOLE price after margin. Per-tenant calendar.
2. **Unlimited dated rate periods** (`lib/rates/rate-seasons.ts`,
   `period-csv.ts`, reference #208): replace the fixed low/high/peak column
   model on hotels/cruises with a `seasons` JSONB period list. Biggest
   slice; touches P3's `RATE_MONETARY_COLUMNS` (period rates must convert
   like activity tiers do in the reference).
3. **Activity tiered rates** (`lib/rates/activity-tiers.ts`, #195):
   group-size tiers on `activity_rates.tiers` JSONB.
4. **Org-level run currency** (`lib/org-rate-currency.ts`, reference
   #148–#153): the engine's run currency is hard-EUR here; make it a
   per-tenant setting. MATTERS FOR MEA TENANTS. Do this slice FIRST — the
   other slices and P3's normalizer read the run currency.
   Also port sleeping-train cabin model (`sleeping-train-cabins.ts`, #146)
   and day-tour vehicle bands if the audit shows gaps.

### C4 — Ops depth  (size M each, independent)

- **Dashboard needs-attention engine** (reference #202–#204):
  `/api/dashboard/{summary,attention,money}` model — forms/guide/balance/
  change-request attention (balance keyed on due date), per-currency money
  row, financials-permission gating. Product's single dashboard route is
  much shallower.
- **Payment schedule / deposit stack** (`lib/payment-schedule.ts`):
  RECONCILE with the product's existing invoices/payments tables — map
  both models first, port the schedule logic only.
- **Documents engine** (`lib/documents/registry.ts`, assemble-*,
  templates): registry-based generation (program itinerary, operations
  sheet, per-customer templates). RECONCILE with the product's
  invoice/receipt/contract generators; the registry pattern is the port,
  not the JA templates.
- **Capacity / vehicles** (`lib/capacity-availability.ts`, `app/capacity`,
  `api/vehicles`): product has only a settings page.
- **Rate-change digest** (`lib/rate-change-digest.ts`).
- Low priority: tour builder (`app/tour-builder`), B2C module, contacts
  app, QuickBooks/Xero sync (`lib/accounting/` — never runtime-tested even
  in the reference).

### C5 — Quality rails  (size S)

- **Playwright E2E smoke** in CI (reference `e2e-smoke-harness`: seeded
  fixture + smoke over the main routes; its #41 anon-client migration
  pattern). The product's CI is vitest-only.
- Extend the golden-snapshot set as prompts grow.

## Suggested order

C3.4 (org run currency — small, unblocks MEA) → C1 (portal) → C2
(commissions) → C3.1–.3 → C4 slices as needed → C5 alongside.

Before each phase: `git pull` BOTH repos, re-verify the reference pointers
above (they are 2026-08-29 facts), and read the reference files as specs —
the memory files in the operator's Claude memory index the reference
campaigns by PR number.
