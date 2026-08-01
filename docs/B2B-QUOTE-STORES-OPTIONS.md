# B2B Quote Stores — Consolidation Options

**Status:** Decision needed · 2026-08-01
**Problem:** Two separate B2B quote stores confuse users — a quote saved from New Quote (pricing grid) never appears under B2B → Quotes.

## The two stores today

| | `tour_quotes` | `b2b_quotes` |
|---|---|---|
| List page | `/b2b/quotes` (sidebar **B2B → Quotes**) | `/quotes/b2b` (deliberately removed from sidebar) |
| Written by | B2B Calculator "Save as Quote" | New Quote (grid) B2B save, AI generation, quote-from-itinerary |
| Shape | Per-client quote for a template variation (client fields, pax, services snapshot, `created_by`) | Partner rate-sheet document (`pricing_table`, per-person/per-day component columns, PDF URL, terms, tier) |
| Lifecycle | List, detail, PDF, delete; convert-to-itinerary API exists but **no UI calls it** | Send by email/WhatsApp, PDF generation, **convert to booking**, bulk update/delete, edit page |
| Code sites | 5 | 16 |
| **Production rows** | **0** | **0** |

Both tables being empty means there is **no data migration in any option** — this is the cheapest this decision will ever be.

## Option A — Consolidate on `b2b_quotes` (recommended)

The calculator's "Save as Quote" writes a `b2b_quotes` row instead (its 1–10 pax rate sheet maps naturally onto `pricing_table`; client details go to added nullable columns or notes). Sidebar **B2B → Quotes** points at `/quotes/b2b`, restored to the sidebar; `/b2b/quotes` becomes a redirect; `tour_quotes` APIs retire and a later migration drops the table.

- ✅ One list, one lifecycle — calculator quotes gain send/PDF/booking-conversion for free
- ✅ Kills the confusion permanently; `created_by` attribution can come along (phase-2 parity)
- ⚠️ Medium effort: field mapping in the calculator save + navigation swap + route retirement

## Option B — Consolidate on `tour_quotes`

Opposite direction: rebuild send/PDF/booking-conversion/bulk on `tour_quotes` and point the grid at it.

- ❌ Rebuilds the richer half onto the poorer table; most effort, no extra benefit. Not recommended.

## Option C — Keep both, merge the view

`/b2b/quotes` lists both sources with an origin badge; detail pages stay separate.

- ✅ Smallest change; nothing retires
- ❌ Permanent complexity tax: two lifecycles, two detail pages, half the rows can't be sent/converted; the confusion is papered over, not fixed

## Option D — Do nothing beyond docs

The docs already explain the split (added in the docs revision).

- ❌ Leaves a real trap in the product

## Recommendation

**Option A**, phased: (1) calculator save → `b2b_quotes` + sidebar/navigation swap + `/b2b/quotes` redirect; (2) follow-up migration drops `tour_quotes` and its routes once (1) has been exercised. Decide now while both tables are empty.
