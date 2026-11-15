# Transport zones — build plan

Status: **PLAN, nothing built.** Written 2026-11-16 from the owner's answers
(11-15/16). Each step below is one PR. Nothing ships without the owner's OK.

## The problem

A transfer or day tour is priced by **city** today. In reality the price
depends on **where in the city the hotel is**:

- Cairo airport → a 6th of October hotel costs more than → a Downtown hotel.
- Luxor airport → a West Bank hotel costs more than → an East Bank hotel; an
  East Bank tour from a West Bank hotel costs more than from an East Bank one.

And a sightseeing card is really a **named package of sights** (Luxor: East
Bank, West Bank, East & West Bank, West Bank Extended, East Bank Extended —
"Extended" = extra sights added to the standard day).

### What Autoura has today (checked 11-16)

- A hotel (`supplier_properties`, migration 311) has a `city` only.
- A transport card (`transportation_rates`) has a `city` only. Its `area` column
  means a *sightseeing* area guessed from a fixed keyword list
  (`AREA_ATTRACTIONS`, lib/auto-pricing-service.ts:468) — the same list for
  every company, empty on every row, not in the form. Not usable.
- Zones live only in card **names** (Marsa Alam North/South/Shams Alam,
  Hurghada Makadi/Sahl Hasheesh/El Quseir, "Cairo to the New Capital" as an
  intercity drop-off). Since #827 those cards compete and the **cheapest**
  wins — a Makadi hotel can be quoted at the Hurghada-town price.

## Owner decisions

| # | Decision |
|---|---|
| D1 | Zones are per city. Each company keeps its own list (white-label rule). |
| D2 | Each city has one **default** zone. A card or hotel with no zone = the default. |
| D3 | No card for the hotel's zone → a **gap**, never the default price. |
| D4 | Sightseeing cards list the sights they cover; Autoura picks the **smallest card covering every sight of the day**. "Both banks" is its own card. |
| D5 | Giza stays its own city (own cards). |
| D6 | Adding a hotel includes its zone. |

Zones agreed for Travel2Egypt:

| City | Default | Others |
|---|---|---|
| Cairo | Cairo | 6th of October & Sheikh Zayed · New Cairo · New Capital |
| Giza | Giza | — |
| Luxor | East Bank | West Bank |
| Aswan | City | West of Sehail · South of the Aswan bridge |
| Hurghada | Hurghada | Makadi · Sahl Hasheesh/El Gouna · El Quseir |
| Marsa Alam | Marsa Alam | North · South · Shams Alam |

## Still to decide (my recommendation first)

1. **Is the zone required when adding a hotel** in a city that has zones?
   *Recommend yes* — otherwise a Sheikh Zayed hotel silently prices as Cairo.
   Existing hotels with no zone count as the default until set, and the hotel
   list shows a "No zone yet" filter so they can be filled in.
2. **Two equally small cards cover the day** (e.g. two West Bank cards for the
   same zone): *recommend* the starred one, else the cheapest with a warning —
   the same rule as today (#827).
3. **Cruise days** (the ship is the hotel): *recommend* the city's default zone
   unless the day states a pickup zone (Luxor ships moor on the East Bank).
4. **Lahami Azur** (a single-hotel Marsa Alam card): which zone — probably South.

## How the engine decides

**Pickup zone of a transport line** = the zone of the hotel at the guests' end:

| Line | Hotel used |
|---|---|
| Airport arrival, any arrival transfer | the hotel they sleep in that night |
| Airport departure | the hotel they slept in the night before |
| Day tour, half day, in-city transfer, dinner transfer | the hotel they woke up in (else that night's) |
| Cruise day | the city's default zone, unless the day states one (decision 3) |
| Intercity | unchanged (route-based) — out of scope |

The hotel is the one the engine already chose for the city and tier
(`hotelRatesMap`, auto-pricing-service.ts:3460) — its property gives the zone.
A quote with no hotel uses the day's stated zone, else the default.

**Card choice** for a line, in order:

1. Cards for the service, city and vehicle **in the pickup zone** (a card with
   no zone = the default zone). None → **gap**: "No West Bank price for an
   airport transfer in Luxor — add a card in Rates → Transportation."
2. Sightseeing services only: if any of those cards lists sights, keep the
   cards whose list covers **every** sight of the day and take the one with
   the **fewest** sights. None covers → **gap**: "No Luxor card covers Karnak +
   Valley of the Kings." A card that lists no sights keeps today's behaviour.
3. Several left → starred, else cheapest + warning (decision 2).

## Build steps (one PR each)

### Step 1 — Zones (settings)
- Migration: table `city_zones (tenant_id, city, key, label, is_default, sort)`,
  unique `(tenant_id, lower(city), key)`, one default per city (partial unique
  index), RLS like `tenant_vocabularies`. A table, not a vocabulary kind,
  because a zone belongs to a city (vocabulary keys are unique per company
  across all cities).
- Settings → Zones page: pick a city, add/rename/reorder zones, mark the default.
  Renaming keeps the key; deleting a zone in use is refused (shows where).
- No seed for any company (white-label rule); Travel2Egypt's list is entered in
  step 5.

### Step 2 — Hotels carry a zone
- Migration: `supplier_properties.zone` (text, nullable).
- Hotel form (app/rates/hotels/hotels-content.tsx) and supplier property form:
  an **Area** dropdown listing the zones of the hotel's city; required if the
  city has zones (decision 1); changing the city clears it.
- Property CSV import/export (app/api/suppliers/properties/*) and the hotel rate
  sheet (lib/rates/rate-sheet.ts) gain a `Zone` column; an unknown zone is
  refused with the row number.
- Hotel list: Zone column + "No zone yet" filter.

### Step 3 — Transport cards carry a zone and their sights
- Migration: `transportation_rates.zone` (text) and `covers_sights` (text[],
  same shape as `land_packages.covered_attractions`, migration 462).
- Card form (app/rates/transportation/transportation-content.tsx): **Pickup
  area** dropdown (the city's zones; empty = default) and, for sightseeing
  service types, **Sights covered** (picked from the city's entrance-fee
  sights, so names always match).
- The zone joins every key that tells cards apart: the card grouping key
  (transportation-content.tsx:62), `transportJourneyKey` / `transportLookupKey`
  (lib/pricing/transport-suppliers.ts), the preferred-star scope
  (lib/rates/preferred.ts:51) and the CSV unique key
  (lib/bulk-rate-service.ts:184). So a West Bank card and an East Bank card no
  longer compete for the star or for "cheapest".
- CSV gains `Zone` and `Covers sights` (`;`-separated).

### Step 4 — The engine uses them
- `buildTransportCache` keys on zone instead of `area`; lookups pass the
  pickup zone; the "match without area" fallback goes (it is what would let a
  default card answer for a West Bank hotel — D3).
- Pickup zone per line from the hotel (table above) inside
  `calculateDayBasedPricing`, where `hotelRatesMap` is already in scope
  (transport needs at ~4679, lookups at ~4830 / ~5011).
- Smallest-covering-card rule for sightseeing (reusing `sightCovered` from
  lib/pricing/land-package.ts so names match the way land packages do).
- The same rule in the transport preview (`previewDayTransport`, ~2686) and the
  calculator/grid path (`getTransportRateFor`, ~2865) — a quote shows the same
  price everywhere.
- A day may state its pickup zone (for cruise days and hotel-less quotes); the
  tour-days CSV gains a `Pickup Zone` column.
- Remove the fixed `AREA_ATTRACTIONS` keyword list and the old `area` reads.
- Tests: zone from arrival/departure/day-tour hotel; gap when the zone has no
  card; smallest covering card (East Bank vs East Bank Extended vs both banks);
  tie → star → cheapest+warning; a card with no zone/sights behaves as today;
  breakdown rows still sum to the subtotal.

### Step 5 — Travel2Egypt's data (only with the owner's OK, live writes)
- Enter the zone lists above.
- Give each T2E hotel its zone (list prepared for the owner to confirm).
- Re-tag the Red Sea cards from their names (Makadi, Sahl Hasheesh/El Gouna,
  El Quseir; North/South/Shams Alam) and put the "Cairo to the New Capital"
  price on a New Capital zone card.
- Fill **Sights covered** on the Luxor scope cards (East Bank, West Bank, East &
  West Bank, both Extended) with the owner.
- Re-price the 7-day tour and the T2E tour census before/after; list every
  price that moved and every new gap.

### Step 6 — Retire the old `area` column (after step 5 is live)
- Migration drops `transportation_rates.area` once nothing reads it.

## What does NOT change
- Intercity transfers, flights, trains and cruise packages
  (`b2b_transport_packages` has no zone and is not looked up through the
  transport cards).
- Destination trips priced by where they go (Abu Dabbab, Wadi el Gamal): a
  separate idea, not a zone.
- Quotes already saved keep their stored prices.

## Effect on day one
Until zones are entered nothing moves: every card and hotel has no zone = the
default, and cards without a sights list behave as today. Prices change only as
the owner adds zones, hotel zones and zone cards (step 5).

## Size
Steps 1–4: about 5–7 working days including tests. Step 5: about half a day
with the owner. Step 6: an hour.
