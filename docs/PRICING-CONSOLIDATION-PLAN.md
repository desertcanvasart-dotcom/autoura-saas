# Pricing Consolidation Plan — one core, two surfaces

_Status: PROPOSED (awaiting approval). No code yet._
_Companion to `PRICING-HARNESS-PLAN.md` (the harness that makes pricing definite). This plan removes the **redundancy** that keeps re-introducing the problems the harness fights._

---

## 0. The decision this plan encodes (locked with the product owner)

1. **The pricing grid is the canonical pricing surface.** The older routes "had a lot of issues"; the grid delivers exactly what's needed.
2. **No redundancy/duplication** — but "no duplication" means **one place where a rate becomes money, with no fabrication**, NOT literally one screen.
3. **Intake is already built — do not rebuild it.** Paste Text, File upload (PDF/Image/DOCX via vision), and Load-by-Itinerary-ID all exist (`components/pricing-grid/InputPanel.tsx`).
4. **The tour-variation / multi-pax B2B rate-sheet workflow is STILL IN USE** → it must be preserved. Therefore the grid (single-pax, free-form) cannot be the *only* surface without first rebuilding rate sheets in it.
5. **The downstream pipeline is kept untouched** — itinerary, `itinerary_services`, quotes, invoices, PDFs, send. We consolidate the *source of the numbers*, not the pipeline.

**End-state chosen: "one rate-and-completeness CORE, two pricing surfaces, thin UIs."** (Not "one calculator.")

---

## 1. Current state (verified against the code)

### The TWO legitimate pricing shapes (keep both)
| Shape | Surface today | Input | Output |
|---|---|---|---|
| **Bespoke** (one group) | `app/pricing-grid/lib/calculator.ts` | free-form day/slot grid | one total/quote |
| **Catalog rate sheet** (B2B) | `lib/auto-pricing-service.ts` (hardened in Phase 1) | `tour_variations` + `tour_variation_services` | multi-pax (2–10/1–40) price table |

These are genuinely different math/outputs over the **same rates** — both stay.

### Intake (DONE — not rebuilding)
- `components/pricing-grid/InputPanel.tsx` → Paste Text → `/api/pricing-grid/parse` (AI-fenced, Phase 3); File → `/api/ai/parse-file` (vision); Load-by-ID.
- `/api/ai/parse-whatsapp` already exists (a future WhatsApp intake is mostly wiring, not new AI).

### The redundant / fabricating computation (the target)
| Route | Problem | Live callers |
|---|---|---|
| `app/api/itineraries/[id]/calculate-pricing/route.ts` | `||50/80/55/12/18`, hardcoded fallback maps; **persists** padded totals + sets `status:'quoted'` | `app/itineraries/[id]/edit/page.tsx` ("Recalculate pricing") |
| `app/api/b2b/calculate-price/route.ts` | service-based branch fabricates (`||0/55/80`); ignores `complete`/`holes` on the auto-pricing branch | `app/b2b/calculator/[id]/page.tsx`, `app/tours/[code]/page.tsx` |

### Rate-resolution is duplicated 3–4×
Grid (`/api/pricing-grid/rates`, returns real `RateOption`s), `auto-pricing-service` (hardened `getHotel/Guide/Meal/...`), and the two fabricator routes each have their **own** copy of "look up a rate." This divergence is the root cause of the silent-default class of bug.

### The grid's own gap
The grid never fabricates (pure sum), but it **silently omits** unpriced slots (`save/route.ts:144` skips `resolvedRate===0`) and has **no completeness check** — so an incomplete grid saves a confidently-wrong under-total. This is the grid-native "flag the hole" gap.

---

## 2. Target architecture

```
 INTAKE (built): paste · file/vision · load-by-id · (later) WhatsApp/email
                               │
              ┌────────────────┴─────────────────┐
   BESPOKE SURFACE                         RATE-SHEET SURFACE
   pricing-grid calculator                 auto-pricing-service (variation × pax)
   single group, free-form                 B2B partner rate sheets
              └────────────────┬─────────────────┘
                               │
        ONE RATE-RESOLUTION + COMPLETENESS CORE
   (reads DB rates → real rate + provenance, or a HOLE — never a default)
                               │
   EXISTING PIPELINE (kept): itinerary · itinerary_services · quotes · invoices · PDFs · send
```

- **Core** = the single non-fabricating rate-resolution + hole/completeness logic (extends what Phase 1 already built: `lib/pricing-types.ts` `RateSource`/`PricingHole`, `lib/pricing-guards.ts`).
- **Surfaces** = grid (bespoke) and auto-pricing (rate sheet). Both pure, both fed by the core, both report holes.
- **UIs** (itinerary editor, B2B calculator, tour price, grid) become thin views over the surfaces.

---

## 3. Migration sequence (redirect-before-delete; each phase shippable behind tests + CI)

### Phase A — Extract the shared rate-resolution core _(no behavior change)_
- New `lib/pricing/rate-resolution.ts`: the hardened lookups currently inside `auto-pricing-service.ts` (`getHotelRates`, `getCruiseRates`, `getGuideRate`, `getMealRates`, `getTippingRate`, `getAirportServiceRate`, `getHotelServiceRate`, `getEntranceFee`, `findTransportRate`) moved out, each returning `{ rate, rateId, source: 'db'|'fuzzy' } | null` — never a default.
- `auto-pricing-service.ts` imports from it. Golden masters unchanged ⇒ proves no behavior change.
- **Acceptance:** all 139 tests still green; no `|| <number>` rate fallback remains in the moved code.

### Phase B — Grid completeness gate _(fixes the primary surface's gap)_
- `gridCompleteness(days, config)` → `PricingHole[]`: flags empty **required** slots (accommodation on overnight days, transport on travel days, guide when `withGuide`, …) and **unreviewed custom amounts** (the Phase-3 `needsHumanInput` flags).
- Surface in the grid UI ("N items need attention before this is deliverable"); feed into `pricing-grid/save` and quote-create so an incomplete grid cannot silently become a `status:'quoted'` itinerary; tie into the Phase-2 send gate (`lib/pricing-guards.ts`).
- **Acceptance:** an incomplete grid is blocked from becoming a deliverable quote and lists exactly what's missing; tests cover it.

### Phase C — Kill the itinerary fabricator (Screen 1)
- Re-point `app/itineraries/[id]/edit` "Recalculate pricing" → open the grid via Load-by-Itinerary-ID → price → `save` writes back to the itinerary. Verify the grid round-trips an existing itinerary (load → edit → save) faithfully.
- **Delete** `app/api/itineraries/[id]/calculate-pricing/route.ts` once it has no callers.
- **Acceptance:** the route is gone; itinerary pricing happens only via the grid; the itinerary view/pipeline still work.

### Phase D — De-fabricate the B2B route (Screens 2 & 3)
- Refactor `app/api/b2b/calculate-price/route.ts`: remove the service-based fabrication branch's `|| <number>` defaults → use `lib/pricing/rate-resolution.ts` + holes; always produce the multi-pax table via the hardened engine; **honor `complete`/`holes`** (never return a partial rate sheet as valid).
- **Verify first:** whether a variation *with* services builds its rate sheet from the fabrication branch or the auto-pricing branch — removing the former must preserve the multi-pax table.
- `b2b/calculator/[id]` and `tours/[code]` UIs unchanged except they now receive `complete`/`holes` and show "needs attention" when incomplete.
- **Acceptance:** no fabrication branch remains; rate sheets still generate; incomplete data surfaces as holes, not guessed numbers.

### Phase E — Unify & clean
- Ensure `/api/pricing-grid/rates` and `lib/pricing/rate-resolution.ts` read the same tables under the same no-fabrication rule; delete any remaining duplicate lookup code.
- Re-point the harness tests at the core; extend golden masters to cover **both** surfaces (bespoke + rate sheet).
- **Acceptance:** exactly one rate-resolution module in the codebase; CI green.

### Phase F — _(optional, later)_ collapse to a single surface
- Only if desired: fold multi-pax rate-sheet + variation-loading into the grid, then retire the B2B calculator UI. Not required; not now.

---

## 4. What we are explicitly NOT doing
- **Not** rebuilding intake (paste/file/load are done).
- **Not** deleting or altering the pipeline (itinerary, quotes, invoices, PDFs, send).
- **Not** retiring the B2B rate-sheet workflow (it's in use).
- **Not** collapsing to a single screen now (that's optional Phase F).

---

## 5. Risks & guardrails
- **Redirect before delete** — never remove a route with live callers; re-point the screen first, delete after.
- **Two intakes stay** — grid loads *itineraries*; the rate-sheet surface loads *variations*. Don't conflate.
- **Capability clarity** — the grid (bespoke) is human-driven for vehicle/room choices; the rate-sheet surface keeps auto vehicle-sizing/single-supplement/tour-leader. Document so no one expects the grid to auto-size.
- Every phase lands behind the existing test suite + CI (`tsconfig.ci.json`, `.github/workflows/ci.yml`).

---

## 6. Definition of done (whole consolidation)
- Exactly **one** rate-resolution module; **no `|| <number>`** rate fabrication anywhere in pricing.
- **Two surfaces** (bespoke grid, B2B rate sheet); both report `holes`; neither fabricates.
- `itineraries/[id]/calculate-pricing` **deleted**; `b2b/calculate-price` has **no fabrication branch** and honors completeness.
- Grid blocks incomplete quotes with a clear hole list (no silent under-pricing).
- Pipeline intact; all existing screens function.
- Harness + CI enforce all of the above.

---

## 7. Open items to confirm before/while building
1. **Screen 1 redirect flavor:** navigate to the grid UI (`/pricing-grid?itinerary=<id>`), or keep the editor button but call the grid core under the hood? (Recommendation: navigate — simplest, one pricing UX.)
2. **Phase D verification:** do variation-with-services rate sheets currently use the fabrication branch? (Determines exact refactor.)
3. **Phase A scope:** move lookups into `lib/pricing/rate-resolution.ts` vs. keep them in `auto-pricing-service.ts` and just have the grid import them. (Recommendation: extract — clean shared ownership.)
