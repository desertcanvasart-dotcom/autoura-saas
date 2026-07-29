# Pricing Correctness Harness — Implementation Plan

_Status: PROPOSED (awaiting approval). Author: pairing session, 2026-06-08._
_Scope: make the pricing module deliver only **definite** prices — never fabricated, never AI-invented._

---

## 0. Governing principle (the one rule everything serves)

> **A price is deliverable only when every component traces to a real, in-date database rate.**
> **When data is missing, the system flags the hole — it never guesses, defaults, or invents a number.**

This is a direct decision from the product owner: _"flag the hole so we can fix. never to fabricate or invent rates."_

Everything below exists to enforce that rule and to prove it stays enforced.

---

## 1. Current state (verified against the code, 2026-06-08)

Three distinct risk classes were found and confirmed by reading the source. Only one is literal AI hallucination; all three break "definiteness."

### Risk 1 — The engine silently fabricates numbers via hardcoded defaults
- `lib/auto-pricing-service.ts:253` defines `DEFAULT_RATES` (hotel/guide/meal/transport/etc. per tier).
- When a DB rate is missing, the default is added to the total, e.g. hotel at `lib/auto-pricing-service.ts:1530` — **with no `services[]` line item and no `warnings` entry**, so the substitution is invisible.
- The function still returns `success: true` at `lib/auto-pricing-service.ts:1881`. A full quote can be produced with **zero real rates**, and it looks final.
- `success` currently means "did not throw" — it carries no correctness meaning.

### Risk 2 — Real AI hallucination in the pricing-grid parser
- `app/api/pricing-grid/parse/route.ts` sends free text to Claude.
- **Good (keep):** accommodation / guide / entrance / etc. resolve only through validated rate IDs against `rateMap` (`:497`, `:509`). The AI cannot invent these numbers.
- **Hole:** the catch-all slots `water`, `other_group`, `other_pp` trust an AI-emitted raw number directly: `customAmount: amount, resolvedRate: amount || 0` (`app/api/pricing-grid/parse/route.ts:483-492`). Claude can output `other_pp: 250` and €250 becomes a real per-person cost labeled "Custom €250", validated against nothing.
- **Generative fallback** (`app/api/pricing-grid/parse/route.ts:377`) invents an entire 5–7 day itinerary when input is vague (`generationMode: 'generated'` is tracked but the result is not visibly fenced from customer delivery).

### Risk 3 — No safety net
- **Zero automated tests.** No vitest/jest config, no `expect()` anywhere. `lib/test-tour-calculator.ts` and `app/test-calculator/page.tsx` are manual scratch files (no assertions).
- **No rate-entry validation** — negative or absurd rates are accepted (`app/rates/**`, no zod).
- **No output sanity check** before a price reaches a customer (PDF / email / WhatsApp / invoice).
- **Fuzzy matches** can return wrong-but-plausible rates: entrance-fee keyword search, hotel city `ilike`, Edfu→Luxor transport substitution, guide tier falling back to `guides[0]`.

### What is already healthy (build on it)
- The core engine is **deterministic given DB state** — no `Date.now()`/random in the pricing math. (`generateTourCode` uses `Date.now()` but that is a code string, not a price.)
- Found-rate line items already carry a `rateSource` string (e.g. `lib/auto-pricing-service.ts:1524`, `:1546`) — provenance is half-built; we extend it.
- ID-based AI slots are already validated against the DB — the fence exists, it just has gaps.

---

## 2. Target data model (the contract the whole harness asserts)

Extend the pricing result so completeness is a first-class, checkable property.

```ts
// lib/pricing-types.ts (new)

export type RateSource =
  | 'db'        // a real, in-date rate row was used  → the ONLY deliverable source
  | 'fuzzy'     // matched, but via keyword/ilike/city-substitution — needs confirmation
  | 'missing'   // no rate found — a HOLE (never auto-filled)

export interface PricingHole {
  kind: 'hotel' | 'cruise' | 'guide' | 'meal' | 'entrance' | 'transport'
      | 'tipping' | 'airport_service' | 'hotel_service'
  dayNumber?: number
  city?: string
  attraction?: string
  tier: ServiceTier
  lookupAttempted: string   // human-readable: what key was searched
  message: string           // "No hotel rate for 'Aswan' (deluxe). Add it in Rates → Hotels."
}

export interface PricingLine {            // every cost contribution, no exceptions
  /* existing fields ... */
  rateSource: RateSource
  rateId: string | null     // FK to the rate row actually used (null for fuzzy/missing)
}

export interface PricingResult {
  /* existing fields ... */
  complete: boolean         // true ⇔ holes.length === 0 AND no 'fuzzy' line unconfirmed
  holes: PricingHole[]
  sellablePrice: number | null   // null whenever !complete — the deliverable number
  // `success` is RETAINED but redefined as "ran without throwing"; callers must read `complete`.
}
```

**Key behavioural change:** missing rate → push a `PricingHole` and set `complete = false`. **Do not add a default.** `DEFAULT_RATES` is removed from the deliverable path entirely (see §3.1 for the one possible exception).

---

## 3. The six layers

Each layer lists: files touched, the change, new files, and acceptance criteria.

### Layer 0 — Test harness (BUILD FIRST)
_The literal "harness." Locks today's numbers so every later change is provably safe._

- **New:** `vitest.config.ts`, `package.json` scripts (`test`, `test:watch`), dev-deps `vitest`, `@vitest/coverage-v8`.
- **New:** `lib/__tests__/fixtures/` — hermetic rate-table data (JSON rows per table: `accommodation_rates`, `nile_cruises`, `transportation_rates`, `guides`, `entrance_fees`, `meal_rates`, `tipping_rates`, `airport_staff_rates`, `hotel_staff_rates`) + a few representative `tour_templates`.
- **New:** `lib/__tests__/_mock-supabase.ts` — intercepts the engine's `getSupabaseAdmin()` rate queries and returns fixture rows, so tests are deterministic and offline.
- **New test files:**
  - `lib/__tests__/golden.test.ts` — **golden-master**: fixed (template × tier × pax) cases with locked expected totals. Any drift fails CI. This is the core regression wall.
  - `lib/__tests__/invariants.test.ts` — property tests:
    - `per_person × pax === total` (within rounding) for all pax 1–40
    - no `NaN`, no negative line/total
    - **determinism**: run engine twice on identical input → byte-identical output
    - monotonicity sanity (per-person cost behaves correctly as pax grows)
  - `lib/__tests__/tour-calculator.test.ts` — real assertions migrated from the scratch file (e.g. the €1,385 / 10-pax case noted in `app/test-calculator/page.tsx`).
- **Acceptance:** `npm test` green; golden masters captured from *current* engine output (locks present behavior before we change anything).

### Layer 1 — Provenance + "flag the hole, never fabricate" (the core fix)
_Files: `lib/auto-pricing-service.ts` (+ new `lib/pricing-types.ts`)._

- Every cost contribution pushes a `PricingLine` with `rateSource` + `rateId`. No silent additions.
- Replace each `DEFAULT_RATES[...]` substitution (hotel `:1530`, transport `:1744`, guide/meal/tips/services, cruise) with: push a `PricingHole`, set `complete = false`, **add nothing to the total**.
- Tag fuzzy paths (`getEntranceFee` keyword search, hotel `ilike`, Edfu→Luxor transport, `guides[0]` tier fallback) as `rateSource: 'fuzzy'` so they surface for confirmation instead of passing as exact.
- Compute `sellablePrice = complete ? roundedSellingPrice : null`.
- Redefine the return: keep `success`, add `complete`, `holes`, `sellablePrice`.
- **Open exception (decide in §6):** keep `DEFAULT_RATES` behind an explicit, non-deliverable `mode: 'estimate'` flag used *only* by the browse "from €X" range (`getTemplatePriceRange`, `lib/auto-pricing-service.ts:2216`), clearly labeled an estimate — or remove it outright.
- **Acceptance:** new tests prove that a fixture with a deliberately missing rate yields `complete: false`, a populated `holes[]`, `sellablePrice: null`, and a total that does **not** include any guessed amount.

### Layer 2 — Output sanity gate (the wall before the customer)
_New: `lib/pricing-guards.ts`. Wired into every customer-facing send path._

- `assertDeliverablePrice(result | quoteRow)` throws/returns-error unless **all** hold:
  - `complete === true` and `holes.length === 0`
  - every line `rateSource === 'db'` (no `fuzzy`, no `missing`)
  - no zero / negative total or line
  - `per_person × pax ≈ total`
  - margin within configured bounds; currency set
- Wire into: `app/api/quotes/[type]/[id]/send/route.ts`, `.../send-whatsapp/route.ts`, quote-save (`app/api/quotes/b2c|b2b`), and invoice-from-itinerary creation.
- **Acceptance:** integration tests prove an incomplete/fuzzy/zero quote is **blocked** from every send path with a clear error naming the holes.

### Layer 3 — AI fencing (kill the hallucination vector)
_Files: `app/api/pricing-grid/parse/route.ts`._

- `buildSlotsFromAI` (`:467`): for `CUSTOM_SLOTS` (`water`, `other_group`, `other_pp`), **never** trust an AI number. Set `resolvedRate: 0`, `needsHumanInput: true`, surface in UI for manual entry. (`water` keeps a *code* constant default, not an AI value — already done at `:441`.)
- Count AI-selected IDs that fail `rateMap` validation; if any slot is unresolved, mark the grid `complete: false`.
- Keep `generationMode: 'generated'` but propagate it to the UI as a prominent "AI-suggested draft — review before sending" banner; block auto-send while set.
- **New test:** `app/api/pricing-grid/__tests__/parse-fence.test.ts` — feed adversarial AI output (invented `other_pp` number, bogus rate IDs) and assert numbers are zeroed/flagged, never priced.

### Layer 4 — Rate-data integrity + coverage report
_Files: `lib/validation.ts` (extend), `app/rates/**` (entry forms), new coverage endpoint._

- Zod schemas per rate category: non-negative, plausible per-category band (e.g. hotel PPD €5–€2000), EUR + non-EUR present where the engine reads both. Applied on rate-save API routes.
- **New:** `app/api/pricing/coverage/route.ts` (+ a small admin view) — given live templates × tiers, list every (template, tier, city, attraction, day) that would produce a `hole`. Finds gaps **before a customer does**. Reuses the Layer-1 engine in strict mode and aggregates `holes[]`.
- **Acceptance:** saving a negative/out-of-band rate is rejected; coverage endpoint returns the full hole list for the current dataset.

### Layer 5 — CI + drift guard (keep it enforced over time)
- **New:** `.github/workflows/test.yml` — run `npm test` + `tsc --noEmit` on PRs (with `NODE_OPTIONS=--max-old-space-size=4096`, per the repo's known build constraint).
- **Optional scheduled job:** recompute a basket of canonical quotes nightly; alert if any moves > X% (catches accidental rate-table edits / drift). Can ride the existing cron infrastructure (`app/api/cron/*`).
- **Acceptance:** PRs cannot merge with a failed golden master or type error.

---

## 4. Build order & estimate

| Phase | Layer | Risk addressed | Rough effort |
|---|---|---|---|
| 0 | Test harness | locks behavior (3) | 0.5–1 day |
| 1 | Provenance + flag-the-hole | silent defaults (1) | 1–1.5 days |
| 2 | Output sanity gate | reaches-customer (1,2) | 0.5 day |
| 3 | AI fencing | hallucination (2) | 0.5 day |
| 4 | Rate validation + coverage | data gaps (1) | 1 day |
| 5 | CI + drift guard | regression | 0.5 day |

Phase 0 ships first and independently; Phases 1–5 each land behind green tests.

---

## 5. Non-goals / out of scope (for now)
- Re-architecting rate tables or the PPD model.
- Currency-conversion correctness at display time (`app/pricing-grid` + `lib/exchange-rate-api.ts`) — tracked separately; the engine itself returns EUR.
- The email-send blocker (PR #4) — separate workstream, intentionally paused.

---

## 6. Open decisions (need a call before/while building)
1. **`DEFAULT_RATES` for the browse "from €X" range** — remove entirely, or keep behind a clearly-labeled non-deliverable `estimate` flag used *only* for `getTemplatePriceRange`? (Recommendation: keep, labeled "from ~€X (estimate)", never used for a real quote.)
2. **Fuzzy matches** — treat as a hole (block) or as a "confirm this match" soft-flag that staff can accept? (Recommendation: soft-flag — surface the matched rate + let staff confirm; unconfirmed fuzzy is not deliverable.)
3. **Drift-guard threshold X%** and whether to build Layer 5's scheduled job now or defer.

---

## 7. Acceptance for the whole harness (definition of done)
- `npm test` green, run in CI on every PR.
- No code path adds a number to a price without a `rateSource` and (for `db`) a `rateId`.
- A missing rate produces a `hole` + `sellablePrice: null`, never a guessed total.
- No price reaches a PDF/email/WhatsApp/invoice without passing `assertDeliverablePrice`.
- The AI can select real rates but cannot emit a price number anywhere.
- A coverage report exists that lists every gap in the current rate data.
