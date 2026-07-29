# Autoura — Product Description for Marketing & Distribution

*Prepared 2026-07-29. Every claim below reflects what is built and live today —
no roadmap items are presented as features. Roadmap items are marked as such.*

---

## 1. One-liner

**Autoura is the operating system for tour operators and DMCs — from the first
WhatsApp message to the final invoice.** It turns inbound conversations into
priced itineraries, branded quotes, confirmed bookings, and settled payments,
with an AI copilot working alongside a small team.

## 2. The problem it solves

A typical inbound tour operator runs their business across WhatsApp threads,
Gmail, Excel rate sheets, and Word documents. The consequences:

- **Quoting takes hours** — reading the conversation, checking rates across
  spreadsheets, assembling a document, calculating margins by hand.
- **Pricing errors are invisible** — a stale rate or a guessed number goes to
  a client and eats the margin, or worse, wins the booking at a loss.
- **Nothing is tracked** — who got a quote, who viewed it, who never got a
  follow-up, which deposits are overdue. Leads evaporate in chat history.
- **The business depends on one person's memory** — rates, supplier contacts,
  client preferences, what was promised to whom.

Autoura replaces that stack with one system where the conversation, the
product, the price, the money, and the follow-up live together.

## 3. Who it's for

**Primary segment — inbound tour operators & DMCs in Egypt** (initial market):
2–20 person agencies selling multi-day cultural trips, Nile cruises, and day
tours to international travelers, mostly arriving via WhatsApp, email, and
referral. The product is deeply fluent in this market's mechanics (see §5).

**Secondary segments** (the machinery generalizes):
- B2B ground operators / wholesalers serving foreign tour operators with
  net-rate sheets and reservation traffic.
- Small operators in comparable destination markets (Jordan, Morocco, Turkey,
  East Africa) with the same WhatsApp-first, rate-sheet-driven workflow.

**Buyer**: the owner-operator. They are the seller, pricer, and often the
tour manager. Time-poor, margin-sensitive, WhatsApp-native.

## 4. The core workflow (the demo storyline)

1. **A lead arrives** — WhatsApp message, email, or a structured brief from a
   partner-brand AI concierge widget. It lands in a unified inbox with client
   context attached.
2. **AI drafts the trip** — the WhatsApp parser turns the conversation into a
   day-by-day itinerary draft. Deliberately **unpriced**: the operator reviews
   and edits first (a design decision — context lives in conversations, and a
   human confirms before money is quoted).
3. **Priced in the grid** — the pricing grid prices the reviewed itinerary
   against the operator's own rate database: per-day service slots, dual
   passport pricing, automatic vehicle selection by group size, margin applied
   transparently. **If a rate is missing, the system says so — it never
   invents a number** (see §6).
4. **Quote goes out** — a numbered, versioned commercial quote with the
   operator's branding: PDF, email, or WhatsApp. A white-labeled **live
   itinerary share link** shows the trip beautifully on any device — and tells
   the operator when the client viewed it.
5. **Accepted → booked → paid** — one click converts an accepted quote to a
   booking (the system guarantees one booking per quote at the database
   level). Deposit request, payment recording, automatic status transitions
   (pending deposit → confirmed → paid in full), balance tracking.
6. **Operations run** — supplier vouchers and orders, guide/vehicle resource
   assignment with conflict detection, fixed-date departures with capacity,
   tasks, and a lifecycle of message templates from "inquiry received" to
   "welcome home" (27 seeded touchpoints across customer, partner, and
   supplier communication).
7. **Money is visible** — invoices, receipts, AR/AP, expenses, commissions,
   per-trip and aggregate P&L in a chosen reporting currency, with honest FX
   (converted at the rate on the day money moved, never a guess).

## 5. Feature inventory by pillar

### Communication & AI
- Unified cross-channel inbox (WhatsApp + email in one conversation view)
- Full Gmail integration (two-way, OAuth, per-tenant)
- WhatsApp via Twilio: inbound webhook, outbound documents (quotes, invoices,
  receipts, contracts, reminders, supplier notifications)
- AI itinerary generation from conversations (structured mode follows the
  operator's text verbatim; creative mode composes)
- AI copilot: retrieval-augmented reply suggestions learned from the
  operator's own past answers + a knowledge base; per-tenant tone settings
- AI supplier-invoice parsing; 29-language translation built in
- Message template system with placeholders, scheduling, and send tracking —
  seeded with a complete lifecycle library

### Pricing (the crown jewel)
- Operator-owned rate database: 14 rate categories (hotels, Nile cruises,
  sleeping trains, flights, trains, meals, entrance fees, guides, activities,
  transportation, airport services, hotel services, tipping, fixed costs)
- **Egypt-native rate mechanics**: dual passport pricing (EU vs non-EU rates
  on every category), three-season hotel/cruise rates, per-monument entrance
  fees with a canonical attraction vocabulary the AI understands
- **Route-first transport pricing**: one route, five vehicle classes with
  capacity bands — the engine re-selects the vehicle automatically as group
  size changes
- Pricing grid: per-day slot pricing for B2C (margin-based, per-person price)
  and B2B (1–40 pax rate sheet with tour-leader columns) — one engine, two
  commercial shapes
- CSV bulk import/export for every rate table, idempotent re-import
- Quote versioning with revert; quote validity, sent/viewed tracking

### Sales & operations
- B2C and B2B quote pipelines; B2B partner portal (partners, net-rate sheets,
  pricing rules, reservation traffic)
- One-click quote→booking conversion with database-enforced integrity
- Bookings with passengers, payment schedule, supplier confirmation status
- Resource management: guides, vehicles, hotels, restaurants, airport staff —
  with assignment conflicts detected
- Fixed-date departures with capacity management (plus a live integration
  from a sibling seat-pooling marketplace)
- Tasks with kanban; follow-ups; calendar

### Documents & branding
- Tenant branding everywhere: logo, colors, identity on every PDF (quotes,
  invoices, receipts, contracts, supplier vouchers)
- White-labeled live itinerary share pages with view tracking — the client
  sees a polished trip page under the operator's brand, never Autoura's
- Per-tenant verified email sending domains (white-label envelope)

### Finance
- Invoices, receipts, payment recording with atomic totals and automatic
  status transitions; payment reminders
- AR/AP ledgers, expenses, supplier invoices, commissions
- Multi-currency (EUR/USD/GBP/EGP) with a strict honesty rule: amounts are
  never summed across currencies or converted at guessed rates; FX uses the
  historical rate of the day the money moved
- Per-itinerary and aggregate P&L; financial reports

### Platform
- True multi-tenant SaaS with row-level security isolation per tenant
- Roles (admin/manager/agent/viewer) enforced at the route level
- In-app support chat to the platform team; onboarding wizard
- Global Egypt catalog (seeded attractions/entrance fees) that tenants can
  opt into — new operators start with a working product database

## 6. Differentiators (the positioning raw material)

1. **"Never a fabricated price."** The pricing engine returns a real rate
   from the operator's database or explicitly reports the gap — it never
   defaults, never guesses, and blocks sending any quote with an invented or
   uncertain number. Every price on a client document traces to a rate row.
   Competitors talk about speed; Autoura's story is speed *with integrity*.
   (This is enforced in code and tests, not a slogan — legitimate proof-point
   material for technical buyers.)
2. **WhatsApp is the front door, not an afterthought.** Intake, parsing,
   sending documents, AI reply suggestions — built around how this market
   actually sells. Most established competitors are email/portal-first.
3. **Destination-native pricing depth.** Dual passport rates, seasonal bands,
   monument-level entrance fees, Nile cruises and sleeping trains, vehicle
   auto-selection by pax — mechanics generic itinerary tools cannot express
   without spreadsheet gymnastics.
4. **One engine, both business models.** The same rate database prices a B2C
   per-person quote and a B2B 1–40 pax net-rate sheet. Operators running both
   sides stop maintaining two pricing worlds. Business model is never
   plan-gated — tiers differ on volume, not capability.
5. **Human-in-the-loop AI.** AI drafts; the operator reviews before anything
   is priced or sent. No auto-replies to clients unless explicitly enabled.
   Sellable as "AI that makes you faster, not AI that talks to your clients
   behind your back."
6. **White-label client experience.** The client only ever sees the
   operator's brand — share pages, PDFs, sending domain.
7. **Owner-friendly entry price** vs. legacy DMC systems (Lemax, Tourplan
   class) that price and implement for enterprises.

## 7. Pricing (current)

| Plan | Monthly | Onboarding | Notes |
|---|---|---|---|
| Solo | $69 | $500 one-time | Full product, volume-limited |
| Studio | $189 | $1,000 one-time | |
| Agency | $449 | $1,500 one-time | |
| Enterprise | contact sales | scoped | |

- **14-day free trial, no card required.** Nothing auto-charges at trial end.
- All plans include the full feature set — B2C + B2B, the entire pricing
  engine, all languages. Tiers differ on throughput (seats, AI generations,
  itinerary volume), with a grace band before anything blocks.
- Onboarding fee is invoiced at trial end, bundled with the first month.

## 8. Trust & engineering proof points

For technical evaluators, partners, and "why should I trust a small vendor"
objections:

- Per-tenant data isolation enforced in the database (RLS), verified by an
  automated sweep of every table on every deploy
- 1,380+ automated tests, including golden pricing tests that lock quoted
  numbers against drift
- Deploy verification proves which exact code version production serves
- Security posture actively maintained (route-level auth sweep tests, HMAC
  webhooks, sanitized rendering, third-party advisor findings at zero)
- Stripe billing; payments/PII never touch Autoura's own storage beyond what
  operators enter

## 9. Honest current limitations (know before promising)

- **Language**: staff UI is English; client documents in French/Spanish are a
  planned phase (per-tenant single language model), not live.
- **Accounting integrations** (QuickBooks/Xero) not yet built.
- **Egypt-first catalog**: the global seeded content is Egypt; other
  destinations work but start from an empty rate database.
- **No native mobile app** — responsive web.
- **Channel distribution** (OTA connections, GDS) is out of scope; Autoura is
  the operator's internal engine, not a distribution channel.

## 10. Marketing-usable vocabulary

- "From WhatsApp to invoice."
- "Your rates. Your brand. Your margin — protected."
- "The quote is done before the client finishes typing." (AI draft speed)
- "If a rate is missing, Autoura tells you — it never makes one up."
- "One conversation → one itinerary → one quote → one booking → one P&L."
- Category label options: *tour operator operating system*, *DMC back office*,
  *itinerary-to-invoice platform*.

## 11. Distribution starting points (observations, not strategy)

- The founder-led wedge is credible: built by/for an operating Egypt DMC;
  case-study material exists in-house from day one.
- The B2B partner portal creates a network loop: every operator using Autoura
  can onboard their foreign agent partners into a portal — each tenant brings
  its own ecosystem into contact with the product.
- The concierge-widget intake (partner brands feeding briefs into a tenant)
  is a white-label lead-gen story for partnerships with travel content sites.
- Trial friction is genuinely low (no card, 14 days, seeded Egypt catalog =
  a working demo out of the box) — fits product-led motion in WhatsApp/
  Facebook groups where Egypt operators congregate.
