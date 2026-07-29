# Rate seed templates

Fill the blank price cells, then import via **Rates → (table) → Import CSV**
(or `POST /api/rates/bulk/import`). Both templates are idempotent: re-importing
updates existing rows in place (entrance fees match on `service_code`,
transportation on `route_name`) — safe to iterate.

## entrance-fees-template.csv
- `attraction_name` values are CANONICAL — they are what the pricing engine's
  attraction normalizer emits, so AI-generated and parsed itineraries match
  them automatically. Do not rename them; add new rows freely (and tell the
  normalizer about common variants of new attractions).
- Fill `eur_rate` and `non_eur_rate` (required). `egyptian_rate` and the
  discount columns are optional.

## transportation-rates-template.csv
- One row per ROUTE; the vehicle columns carry the per-class rates.
  Leave a vehicle's rate blank if it is not offered on that route.
- `route_name` is a display label (rename freely); pricing matches on
  service_type + city (+ origin/destination + duration/area), so keep THOSE
  using the fixed vocabularies. Capacity bands are prefilled with the
  engine's defaults — adjust per route if your fleet differs.
- Add rows for any routes you sell that are not scaffolded here.
