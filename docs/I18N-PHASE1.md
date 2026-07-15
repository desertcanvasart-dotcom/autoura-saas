# i18n Phase 1 — Customer-facing documents in French & Spanish

*Plan written 2026-07-15. Prerequisite: migration 229 (`tenants.locale`, PR #46) applied.*

**Goal:** A tenant whose customers speak French or Spanish sends invoices, receipts,
quotes, contracts, emails, and WhatsApp messages in that language — while the staff
UI stays English (staff UI = Phase 2, ~2–3 weeks, see sizing below).

**Non-goals:** App UI, docs pages, homepage (Phase 2); tenant-authored content
(tour names, notes — never translated); AI copilot replies (already language-matching
via the copilot prompt).

**Measured surface (2026-07-15):** ~200 customer-visible strings — PDF label calls:
invoice 60, quote/itinerary 25, receipt 17, contract (verify: builds differently);
WhatsApp builders ~70 fragments; email subjects/bodies + transport voucher template.

## Design decisions

1. **Language resolution order:** `client.preferred_language` → `tenant.locale` → `en`.
   Tenant locale is the default; per-client override matters (a French agency can have
   one German-speaking customer; the concierge already captures visitor language).
   One shared resolver used by every send path.
2. **Data cleanup prerequisite:** `clients.preferred_language` stores LABELS
   ("English", "Spanish" — written by the concierge mapper, migration 129), not codes.
   Normalize the column to codes with a small migration + backfill (labels rot).
3. **No i18n framework in Phase 1.** ~200 server-side strings: a typed dictionary
   module (`lib/i18n/customer/{en,fr,es}.ts` + `t(locale, key, params)`) is simpler
   and testable. `next-intl` enters in Phase 2 with the UI (port the sibling's setup —
   travel-ops-pro runs next-intl 4.x with 5.5k keys for EN/JA).
4. **Locale-aware formatting in the same pass:** dates and money through
   `Intl.DateTimeFormat` / `Intl.NumberFormat` with the resolved locale
   (e.g. `1 234,56 €` in French).

## Workstreams

| # | Work | Files | Est. |
|---|------|-------|------|
| 0 | Foundation: dictionary module, `t()`, `resolveDocumentLocale()`, formatters, `preferred_language` normalization | new `lib/i18n/`, small migration | 1 day |
| 1 | PDFs: invoice, quote/itinerary, receipt, contract | `lib/*-pdf-generator.ts` | 1.5–2 days |
| 2 | Emails: quote-send subject/body, transport voucher, payment/booking notifications | `app/api/quotes/[type]/[id]/send`, `lib/templates/`, `lib/email.ts` callers | 1 day |
| 3 | WhatsApp builders: quote/invoice/receipt/contract messages | `lib/twilio-whatsapp.ts`, `app/api/whatsapp/send-*` | 1–1.5 days |
| 4 | Translations: machine-translate en → fr/es, native-speaker review | dictionary files | 0.5 day (+ async review) |
| 5 | QA: golden-file tests per locale, French text-expansion layout check in PDFs, format spot-checks | tests | 1 day |

**Total ≈ 6 working days**, shipped as three independent PRs
(foundation + PDFs → emails → WhatsApp), each verifiable on its own.

## Deliberately stays English

Supplier documents (`lib/supplier-document-pdf.ts`) — suppliers are Egyptian vendors,
not the tenant's customers. Also logs, error codes, internal notifications.

## Testing strategy

- **Key-parity test:** `fr`/`es` dictionaries must cover every `en` key — missing
  translations fail CI (no silent mid-document fallbacks).
- Snapshot tests per WhatsApp builder and PDF text layer in all three locales.
- One end-to-end proof per artifact type: generate a French invoice for a test
  client; assert labels + Intl formatting.

## Risks

- **French text expansion** (~20% longer) can overflow fixed PDF label columns —
  the QA day exists mostly for this.
- **Accented glyphs in PDFs** — standard fonts handle fr/es, but one glyph check on
  the embedded font is due diligence.
- **Mixed label/code data** in `preferred_language` from pre-normalization clients —
  the migration backfill handles it.

## Phase 2 sizing (for reference)

Full staff-UI localization: ~8,000–10,000 keys extrapolated from the sibling
(5,519 keys at half this app's 396-component size) — ~2–3 weeks, done
screen-cluster by screen-cluster behind the same infrastructure, shippable
incrementally. Per-tenant mono-lingual model: locale from `tenants.locale` at
session bootstrap, no in-app switcher; public pages get URL-based locale routing
(`/fr/docs`) for SEO.
