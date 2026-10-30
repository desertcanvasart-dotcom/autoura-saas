# Supplier Network — Implementation Plan

Status: **PHASE 1 STARTED 2026-10-30** · written 2026-10-28, D5 added 2026-10-30 · steps 1–6 built (migs 446–448); the client "your car tomorrow" message next.
Source: "Autoura Supplier Network — Structure Brief" (Faris Hussein, 2026-10-28), amended by the
operator's decisions of the same day (below). Read this whole file before starting; every phase
lists the existing code it builds on, so nothing is rebuilt beside what already exists.

---

## 1. What it is (one paragraph)

Every service line of a confirmed booking (a car, a guide, a lunch, an airport meet-and-assist, a
hotel night) becomes a **service booking** that a named supplier accepts and covers, tracked
inside the booking, without the operator leaving Autoura. The operator's **own resources come
first** (own cars, guides, staff — assigned directly); **own suppliers** are requested and confirm
by a one-tap link; a **shared network** of suppliers other operators also use is optional, off by
default, and last. **Each agency chooses where its suppliers come from** — its own suppliers only,
the network only, or both (D5). Clients never see suppliers' companies or rates; the public website and the
one-public-rate rule are untouched.

## 2. Decisions already taken (operator, 2026-10-28)

| # | Decision | Consequence for the build |
|---|---|---|
| D1 | **We book the CAR, not the driver.** Drivers change; the car does not. This is the trade norm. | The bookable transport unit is `vehicles` (plate, type, capacity, supplier). A supplier "assigns" by naming the **car (plate)**; the day's driver name/phone is an optional note on the assignment, never the booked thing. Guides stay people (`guides`). |
| D2 | **Send from the operator's own WhatsApp** (already built: wa.me deep link with the message pre-typed). Meta templates are optional, later. | No dependency on Meta template approval. Every request/reminder is one tap by a person. Replies typed in WhatsApp stay in WhatsApp; **the status flows back through the one-tap link** in the message. |
| D3 | **English only. No Arabic / RTL** — everybody in tourism uses English. | The supplier portal is English, same UI kit as the app. (The brief's "Arabic-first" wording is void.) |
| D4 | **QuickBooks postponed** — no current or prospective customer uses it. | No accounting integration. Confirmed services become supplier payables inside Autoura (existing `supplier_invoices`). |
| D5 | **Each agency chooses its supplier sourcing** (operator, 2026-10-30): **own suppliers only**, **network only**, or **both**. | A per-agency setting, owner/admin only, default **own suppliers only** (the network stays off until an agency turns it on). It decides which suppliers the supplier picker offers and the engine may price from. The agency's **own resources** (its cars, guides, staff) are always available in every mode — the choice is about outside suppliers. Detailed in §7.1. |

Still open — see §9.

## 3. What already exists (verified in code, 2026-10-28)

Build ON these. Do not create parallel tables for the same fact — two writers for one fact is the
drift pattern this codebase has paid for repeatedly.

| Need | Exists today | Where |
|---|---|---|
| Supplier records | `suppliers` (type/types, company_name, phone, whatsapp, email, languages, routes, vehicle_types, cuisine_types, payment_terms, bank_details, tenant_id) | supplier screens `app/suppliers/*` |
| Supplier documents/contracts | `supplier_contracts` + private bucket, signed URLs; `supplier_documents`, `supplier_properties` | migs 332/333 |
| Cars | `vehicles` (license_plate, vehicle_type, passenger_capacity, supplier_id, city, default_driver_id/name/phone, is_preferred) | |
| People identity (guides, airport/hotel staff, drivers) | **Unified** on `team_members` via `team_member_id` / `default_driver_id`, link-or-create triggers | mig 288 |
| Supplier rates | Rate sheets already carry `supplier_id`: `transportation_rates`, `guide_rates`, `meal_rates` (+ hotels/cruises via properties), dated periods (mig 379), vocabularies per tenant | rates engine `lib/auto-pricing-service.ts` |
| Supplier on itinerary lines | `itinerary_services.supplier_id / supplier_name / unit_cost / pickup_location / pickup_time / vehicle_type / rate_id` | |
| Per-booking supplier confirmation | `booking_supplier_status` (one row per supplier per service date: pending → contacted → confirmed / no_response / cancelled; quoted & confirmed cost, confirmation no.) + **Suppliers tab** | `lib/bookings/booking-suppliers.ts`, `components/booking/BookingSuppliersPanel.tsx`, `app/api/bookings/[id]/suppliers`, `…/sync-suppliers` |
| Own-resource assignment + clash check | `itinerary_resources` (types incl. `vehicle`, `driver`, `guide`, airport/hotel staff, restaurant, hotel, cruise; per-day dates; status) + conflict-detection endpoint + `ResourceAssignmentV2.tsx` | `/api/itinerary-resources` |
| No-login tap links | `staff_links` (token per assignment, revocable; page writes `trip_events`) | mig 286, `lib/staff-link.ts`, `app/api/itinerary-resources/[id]/staff-link` |
| Event log | `trip_events` (event_kind, occurred_at, lat/lng, actor) | |
| Send from own WhatsApp | `generateWhatsAppLink` / wa.me helpers; assignment message builder (with check-in link); supplier voucher "Did you send it?" → marked sent | `lib/communication-utils.ts`, `lib/notify/assignment-message.ts`, `app/documents/supplier/[id]/page.tsx` |
| Supplier vouchers / documents | supplier document page | `app/documents/supplier/[id]` |
| Payables | `supplier_invoices` (+ expenses, matching to bookings), supplier expense on booking | `lib/bookings/supplier-expense.ts` |
| Email | Resend, company from-name, reply-to | |
| Crons | Railway cron services (mail-alerts, gmail-sync, publish-sync…) | for reminders/deadlines |

**Assignment is already one writer** (re-checked 2026-10-30): migration 289 (Aug 2026) made
`itinerary_resources` the only writer of "who is assigned"; the old `itineraries.assigned_*` columns
are derived from it by a trigger and direct writes are refused (`trg_protect_assigned_columns`).
Production had 0 mismatches on 2026-10-30. The calendar, guides and dashboard read the derived
columns, which is safe. Step 1 below therefore needed no work.

**Also found 2026-10-30:** booked itinerary lines were priced from rate rows that name a supplier
(`rate_table` + `rate_id`), but the lines were saved without `supplier_id`, so service bookings showed
only the service's name. The sync now reads the supplier from that rate row. There are 0 `vehicles`
rows on production, so own cars must be entered before they can be assigned.

## 4. Target model (evolve, don't duplicate)

The brief proposed 7 new tables. Mapped onto what exists:

| Brief table | Plan |
|---|---|
| `suppliers` | **Exists.** Add only: `claimed_at`, `network_profile` flag (Phase 2/3), areas/licence if missing. |
| `supplier_services` | **New, small** — what a supplier offers ("sedan, airport→Giza, 1–3 pax"), only where the rate sheets don't already say it. Prefer reading services from the rate rows (`transportation_rates` etc. by `supplier_id`) first; add this table only if a real gap shows. |
| `supplier_rates` | **Do NOT create.** Rates live in the existing rate sheets with `supplier_id`. Network rates (Phase 3) = a supplier-owned rate row a tenant may link to; tenant-negotiated rates stay tenant rows. |
| `tenant_suppliers` | **New (Phase 2/3 only)** — links a tenant to a network profile (preferred, private notes, status). Phase 1 suppliers are tenant-owned rows, no link table needed. |
| `service_bookings` | **Evolve `booking_supplier_status`** into it: one row **per service line** (not per supplier-day), add `itinerary_service_id`, `service_date`, `time`, `pickup`, `pax`, `cost_snapshot`, `reply_deadline`, `resource_kind` (own / supplier / network), and the new state machine. Keep the "backed" rule in `booking-suppliers.ts`. |
| `service_assignments` | **Reuse `itinerary_resources`** for own resources; for supplier-covered lines store the named **car (vehicle id or plate)** / guide on the service booking (+ optional driver-of-the-day note). |
| `service_booking_events` | **New** append-only audit (at, actor operator/supplier/system, channel link/whatsapp/email/portal, from→to status, note). Mirrors `trip_events` style. |

### States (D1 applied)
`requested → accepted → assigned (car plate / guide named) → done`
side exits: `declined`, `expired` (no reply by deadline → back to operator), `cancelled` (operator, any stage; supplier told).
Own resources skip request/accept: assign from calendar → `assigned` directly, with the clash warning.

## 5. Phase 1 — Supplier book & service bookings (≈ 5–7 weeks)

Goal: operators cover every service line from inside the booking — own cars/guides directly, own
suppliers by request + one-tap reply — and see every line's status in one place.

1. ~~**Consolidate assignment**~~ — already done by migration 289 (see §3). Car is the booked
   unit for transport (D1).
2. **Service bookings** (~1.5–2 wks) — *done: #723 (mig 446) + #724 (mig 447), 2026-10-30* — migration evolving `booking_supplier_status` to per-line
   rows + new states + `reply_deadline` + `cost_snapshot`; `service_booking_events` table; create on
   booking confirmation (hook in `lib/bookings/create-booking-on-confirm.ts` /
   `booking-on-confirm.ts`); backfill existing rows. Keep tips/water/fees excluded (existing rule).
3. **Supplier field on itinerary lines** (~0.5–1 wk) — *done 2026-10-30: supplier read from the pricing
   rate (#725); "Who covers it" per line — own team/cars assigned directly with a clash warning, or a
   supplier with the cost from its own rate for the same service (else a gap)* — pick supplier (or own car/guide) per
   transfer/guide/meal/hotel line; cost from that supplier's rate row (rates engine already
   reads `supplier_id`-bearing rate sheets).
4. **Request + one-tap reply** (~1.5–2 wks) — *built 2026-10-30 (mig 448): "Ask on WhatsApp" per line
   (wa.me, message pre-typed, "Did you send it?" → Requested with its deadline; again = reminder);
   `/reply/<token>` page: Accept / Decline / name the car (plate) or guide + driver note; bell to the
   office on every answer; link revoked when the line is not needed or the supplier changes. Email
   not done yet* — extend the `staff_links` pattern to a
   **supplier reply link** per service booking (token = credential, revocable, expires after the
   service date): Accept / Decline / name the car (plate) or guide (+ optional driver note).
   Message built like `buildAssignmentMessage`, sent by **wa.me from the operator's WhatsApp**
   (D2) and/or email (Resend). Every status change writes an event.
5. **Deadlines & reminders** (~0.5–1 wk) — cron flags overdue requests; operator gets a bell
   notification with the reminder pre-typed (one tap, D2); after the deadline the line returns to
   the operator with the next preferred supplier suggested.
   *Built 2026-10-30: `/api/cron/service-booking-deadlines`, every 5 min from the mail-alerts
   service (no new Railway cron). Halfway to the deadline with no answer → one bell item whose link
   opens the line (`?tab=suppliers&line=`) with "Remind on WhatsApp" — a popup can't be opened for
   them, so the one tap is on the line; a reminder the office already sent counts. Past the
   deadline → No reply, bell names the next supplier (starred first, then cheapest known cost,
   never the one who didn't answer; no rate = says so). The job never messages a supplier and
   never changes who covers a line.*
6. **Services tab + calendar + documents** (~1–1.5 wks) — upgrade `BookingSuppliersPanel` to the
   per-line Services view (status, supplier, car/guide, re-request, cancel); assignments on the
   operations calendar with clash warnings; supplier voucher reflects the service booking; day
   becomes `done` after the service date (cron); confirmed lines feed supplier payables
   (`supplier_invoices` / expense — D4).
   *Split 2026-10-30 into 4 PRs: (a) covered lines → Done after their date (daily, from the
   reminders service; Accepted may now become Done — a restaurant names nobody); (b) line history
   + Not needed on the Suppliers tab; (c) voucher shows plate / guide / time / pickup from the
   service line; (d) supplier-covered lines on the operations calendar. Payables already work: a
   covered line makes a pending expense, Accounts Payable groups them by supplier. Built: (a) #729, (b) #730, (c) #731, (d) calendar badge "3/5" per trip (amber when an uncovered service is within 2 days) + the trip's supplier lines in the calendar's trip window (`/api/service-bookings/coverage`).*

**Move on when:** operators run most lines through it and suppliers answer by the link.

## 6. Phase 2 — Supplier portal (≈ 5–6 weeks)

English UI (D3). Consider first whether a **link-only supplier page** (one token link listing all
of that supplier's open requests from one operator) covers the need before building logins.

- Supplier sign-in by phone (one-time code sent from WhatsApp/email) — a **new user kind outside
  tenants**; tight RLS; claim profile matched by phone (merge approval per §9).
- One inbox of requests from every operator that uses them; accept/decline/assign car or guide;
  rates and blocked dates.
- Riverdesk cruise operators as cruise suppliers — **size after reading Riverdesk's API** (not in
  this repo; unknown today).

## 7. Phase 3 — Network discovery (≈ 4–6 weeks + ongoing verification)

Opt-in, off by default. Search verified network suppliers by city / service / language from the
itinerary builder; verification of licence and vehicle papers (uses supplier documents storage).
**Highest-risk part:** records with no owning tenant break the WHITE-LABEL rule ("nothing a tenant
prices from may be global") and every RLS policy's single-owner assumption — design network
profiles + `tenant_suppliers` so one operator's negotiated rates and notes can never be read by
another. Legal: data shared between operators.

### 7.1 Supplier sourcing per agency (D5)

One setting per agency, `tenants.supplier_sourcing` (or `tenant_settings`): `own` · `network` ·
`both`. Default `own`. Changed only by an owner or admin, in Settings → Company, with a line
explaining each choice.

| | Own suppliers only (`own`, default) | Network only (`network`) | Both (`both`) |
|---|---|---|---|
| Supplier picker on a service line | The agency's supplier book | Network suppliers it has linked (`tenant_suppliers`) and network search | Own suppliers first, then a separate, labelled **Network** group |
| Rates the engine prices from | The agency's own rate sheets | Network rates it has linked (its negotiated copy, or the supplier's published network rate) | Own rate sheets first; a network rate only where no own supplier has a rate for that line |
| Network search in the itinerary builder | Hidden | Shown | Shown |
| Own resources (own cars, guides, staff) | Always | Always | Always |

Rules:
- **Never mixes data between agencies.** Choosing the network gives an agency access to network
  *profiles* and their *published* rates, and to its *own* links, notes and negotiated rates
  (`tenant_suppliers`) — never another agency's suppliers, notes or rates.
- **Consuming is not sharing.** This setting decides whom the agency books. Whether an agency's own
  suppliers appear in the network is a separate thing: a supplier joins the network itself by
  claiming its profile (Phase 2), never because an agency switched a setting.
- **Changing the setting never rewrites the past.** Bookings keep the suppliers already assigned;
  only new assignments follow the new choice. Moving to `own` with network suppliers on open
  bookings shows a list of those lines, so nothing is silently dropped.
- **No price is made up when a source is off.** If the chosen source has no rate for a line, the
  line is a visible gap (rule in §10), not a fall-back to the other source.
- **Before Phase 3 ships**, the setting shows only "Own suppliers" (the other two are listed as
  coming); Phase 1–2 work is unaffected.

Estimate: ≈ 3–5 days inside Phase 3 (setting + picker grouping + engine source filter + tests).

## 8. Estimate

| Phase | Estimate |
|---|---|
| 1. Supplier book & service bookings | 5–7 weeks |
| 2. Supplier portal | 5–6 weeks (+ Riverdesk, unsized) |
| 3. Network discovery | 4–6 weeks |
| QuickBooks | postponed (D4) |
| **Total** | **≈ 3.5–4.5 months**, one developer; each phase useful on its own |

## 9. Open decisions (answer before the phase that needs them)

- [x] **Reply deadline** — **4 h normally, 1 h when the service is within 48 h** (operator, 2026-10-30;
      `replyDeadline` in `lib/bookings/service-booking-states.ts`). *(Phase 1)*
- [x] **Client message** "your car tomorrow" (car + plate + driver contact) — **yes** (operator,
      2026-10-30). Sent from the operator's own WhatsApp like the rest (D2); clients never see
      supplier companies or rates. Last PR of Phase 1. *(Phase 1)*
- [ ] **Duplicate suppliers** — phone number as merge key; who approves a merge? *(Phase 2)*
- [ ] **Availability** — request-and-confirm only, or live calendars for hotels/cruises? *(Phase 2)*
- [ ] **Riverdesk** — create bookings directly in Riverdesk, or service bookings Riverdesk users
      answer? *(Phase 2)*
- [ ] **Deployment** — GetAutoura (multi-tenant) only, or also standalone installs? (Standalone
      has no network → Phase 3 is GetAutoura-only.) *(before Phase 3)*
- [ ] **Link-only vs logins** for suppliers (§6) *(before Phase 2)*
- [ ] **D5 detail — per service type?** One sourcing choice for the whole agency, or per service
      type (e.g. own guides, network cars)? *(before Phase 3)*
- [ ] **D5 detail — "network only" and private suppliers:** may a network-only agency still keep a
      few private suppliers of its own (e.g. a favourite restaurant)? If yes, "network only" is
      really "both" with network first. *(before Phase 3)*
- [ ] **D5 detail — in "both", who wins on price?** Own supplier first always (as written), or the
      cheaper of own vs network? *(before Phase 3)*

## 10. Rules to hold throughout

- Clients never see supplier companies or rates; public site + one-public-rate rule unchanged.
- Never fabricate a price: a line with no supplier rate is a visible gap, not a guess.
- One writer per fact (assignment, supplier status, rates).
- A token link is a credential: per service booking, revocable, expiring, service-role behind
  middleware (the `staff_links` model).
- Every status change has an event row with its actor and channel.
- Multi-tenant: nothing a tenant prices from may be global (until Phase 3's explicit design).
