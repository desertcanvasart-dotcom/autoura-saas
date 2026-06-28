# Pricing-grid parity — staging smoke test

Verifies the [pricing parity PR](https://github.com/desertcanvasart-dotcom/autoura-saas/pull/25) end-to-end against a real tenant.

## What's already proven vs what this checks

| Layer | Covered by | Status |
| --- | --- | --- |
| Pure pricing math (per-day, multi-pax, margin, tour leader) | `vitest` — `pax-range`, `pricing-grid-multipax`, `golden-basket`, `auto-pricing-service` | ✅ green in CI |
| Completeness gate, AI fence | `vitest` — `grid-completeness`, `parse-fence` | ✅ green in CI |
| **Live HTTP routes + RLS + DB schema for a real tenant** | **this smoke test** | ⬜ run before merge |

The unit tests lock the numbers; this checks the runtime wiring (rates endpoint shape, tenant scoping, and that `save` persists passport-aware costs) that unit tests can't reach.

## 1. Environment

The grid needs these (already set on the Railway/staging deploy; for a local run put them in `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # used by the B2B-quote RPC path in save
ANTHROPIC_API_KEY=...                # only needed to test the AI parse route
```

No new migrations are required — this PR keeps the existing `tenant_id` persistence schema (no `org_id`, no new RPC). Transport is handled in code: the grid `rates` route groups this app's **one-row-per-vehicle** `transportation_rates` into the tier set the grid expects (`groupVehicleRowsToTiers`, unit-tested), so the existing transport schema is used as-is — no column changes.

## 2. Run target

- **Against staging:** `BASE_URL=https://<your-railway-app>` — tests the deployed build.
- **Locally:** `npm run dev` then `BASE_URL=http://localhost:3000`.

## 3. Get a session cookie

Auth is cookie-based (Supabase SSR), so the script needs a logged-in session:

1. Log into the app in a browser **as a user of the tenant you want to test**.
2. DevTools → Application → Cookies → copy every `sb-*-auth-token*` cookie.
3. Join them as one string: `GRID_COOKIE='sb-xxx-auth-token=...; sb-xxx-auth-token.1=...'`.

## 4. Run the script

```bash
# Read-only — checks the rates endpoint shape (safe, no writes)
BASE_URL=https://staging.example.com \
GRID_COOKIE='sb-...-auth-token=...' \
node scripts/smoke-pricing-grid.mjs

# + save round-trip — also persists ONE draft itinerary, then prints its id to delete
SMOKE_WRITE=1 BASE_URL=... GRID_COOKIE=... node scripts/smoke-pricing-grid.mjs
```

It asserts:
- `/api/pricing-grid/rates` returns `success` with all 13 slot arrays.
- Transport options are **tier-encoded** (`rowId__tier`) and carry `capacity_min/max` — this is what drives per-pax vehicle re-selection.
- Accommodation & entrance options carry **both** `rateEur` and `rateNonEur` (passport-aware).
- (write) `/api/pricing-grid/save` returns an `itineraryId`, the expected day/service counts, and scopes the row to the caller's tenant.

## 5. Manual UI parity spot-check (5 min)

Open `/pricing-grid` as a tenant user and confirm the visible behaviour matches travel-ops-pro:

1. **Dual passport** — build a 1-day quote (accommodation + an entrance + transport). Toggle passport **EU ↔ non-EU** in the header; the per-person price must change (it reads `rateEur` vs `rateNonEur` live). *If it doesn't move, the slot isn't carrying dual rates.*
2. **Group vs per-person** — increase **pax** from 1 → 4. Per-person cost should drop for group slots (transport/guide divided by pax) but stay flat for per-person slots (accommodation/entrance). At a pax boundary (e.g. 2→3, 7→8) the transport vehicle tier should re-select and nudge the group cost.
3. **B2B multi-pax sheet** — switch `clientType` to **B2B**; you should get the pax-range rate sheet (1–40) with +0 / +1 tour-leader columns, not a single price.
4. **Save** — save a draft and open `/itineraries/<id>`; services should show non-zero costs and the header total ≈ supplier × (1 + margin).
5. **Removed by design** — there is no longer an input→review→pricing review step, and no `sleeping_trains` slot in the grid (the Rates → Sleeping Trains page is unchanged). Confirm this is acceptable.

## 6. Cleanup

The write test creates one `status: 'draft'` itinerary named **“SMOKE TEST (delete me)”** — delete it from `/itineraries`, or run the write test against a scratch tenant.

## 7. Cross-app number parity (optional, highest confidence)

To prove the two apps emit the *same* euros (not just internally consistent): pick one real template/basket, price it in **travel-ops-pro** and here with identical pax/passport/tier/margin **and identical rate values**, and diff the per-person figures. Any gap is a rate-**data** difference between the two Supabase DBs, not the engine (the engine code is now identical).
