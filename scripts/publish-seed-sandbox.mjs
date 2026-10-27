#!/usr/bin/env node
/**
 * Publish test brand — seed the "Autoura Sandbox" company with invented data
 * so Publish can be tested end to end without touching a real brand
 * (operator, 2026-10-25: the four real brands keep their own websites).
 *
 *   node --env-file=.env.local scripts/publish-seed-sandbox.mjs            # dry run: lists every row, writes nothing
 *   node --env-file=.env.local scripts/publish-seed-sandbox.mjs --apply    # writes it all, in one transaction
 *   node --env-file=.env.local scripts/publish-seed-sandbox.mjs --remove   # deletes exactly what --apply wrote
 *
 * Everything is INVENTED: names, prices, wording. Nothing is copied from
 * another company (their rows carry real guides' names and suppliers'
 * contacts). Every row is tagged — rates by a service code starting SBX-,
 * tours by a template code starting SBX-, the policy and site by name — so
 * a rerun skips what exists and --remove finds exactly these rows.
 *
 * Writes ONLY to the Autoura Sandbox company. Prices are in EUR (the
 * company's currency), EU and other-nationality hotel rates differ so the
 * page's nationality split shows. Tour pages are NOT created: adding them
 * through Publish → Website is part of the test.
 */

import pg from 'pg'

const COMPANY = 'Autoura Sandbox'
const APPLY = process.argv.includes('--apply')
const REMOVE = process.argv.includes('--remove')
const VALID_FROM = '2026-01-01'
const VALID_TO = '2027-12-31'

// ---------- the invented data ----------

const TIERS = ['budget', 'standard', 'deluxe', 'luxury']
const CITIES = ['Cairo', 'Luxor']

// The engine sizes the vehicle from the company's own vehicle list
// (tenant_vocabularies 'vehicle_type'): in Sandbox a sedan is 1–2 people, so
// two travellers plus the guide's seat take the 4x4 (1–6). Every type on the
// list gets a rate, or some group size has no vehicle to price.
const vehicles = [
  { vehicle_type: 'sedan', capacity_min: 1, capacity_max: 3, Cairo: 35, Luxor: 30 },
  { vehicle_type: '4x4', capacity_min: 1, capacity_max: 6, Cairo: 42, Luxor: 38 },
  { vehicle_type: 'minivan', capacity_min: 4, capacity_max: 7, Cairo: 50, Luxor: 45 },
  { vehicle_type: 'van', capacity_min: 8, capacity_max: 14, Cairo: 70, Luxor: 60 },
  { vehicle_type: 'minibus', capacity_min: 15, capacity_max: 24, Cairo: 95, Luxor: 85 },
  { vehicle_type: 'bus', capacity_min: 25, capacity_max: 45, Cairo: 140, Luxor: 125 },
]

const transportation_rates = CITIES.flatMap(city => vehicles.map(v => ({
  key: `SBX-${city.toUpperCase()}-DAY-TOUR-${v.vehicle_type}`,
  row: {
    service_type: 'day_tour', vehicle_type: v.vehicle_type, city, destination_city: city,
    base_rate_eur: v[city], base_rate_non_eur: v[city], rate_currency: 'EUR',
    capacity_min: v.capacity_min, capacity_max: v.capacity_max,
    route_name: `SBX-${city.toUpperCase()}-DAY-TOUR`, is_active: true,
  },
  match: { route_name: `SBX-${city.toUpperCase()}-DAY-TOUR`, vehicle_type: v.vehicle_type, city },
})))

const guide_rates = CITIES.flatMap(city => [['full_day', 45], ['half_day', 30]].map(([duration, rate]) => ({
  key: `SBX-GUIDE-${city.toUpperCase()}-${duration}`,
  row: {
    service_code: `SBX-GUIDE-${city.toUpperCase()}-${duration}`, city, guide_type: 'egyptologist', guide_language: 'english',
    tour_duration: duration, guide_mode: 'spot', base_rate_eur: rate, base_rate_non_eur: rate, rate_currency: 'EUR',
    rate_valid_from: VALID_FROM, rate_valid_to: VALID_TO, notes: 'Invented test rate (Publish sandbox)', is_active: true,
  },
  match: { service_code: `SBX-GUIDE-${city.toUpperCase()}-${duration}` },
})))

const MEAL_PRICES = { lunch: [8, 12, 18, 28], dinner: [10, 15, 24, 38] }
const RESTAURANT = { budget: 'Sandbox Corner Café', standard: 'Sandbox Garden Kitchen', deluxe: 'Sandbox River Terrace', luxury: 'Sandbox Palace Dining Room' }
const meal_rates = CITIES.flatMap(city => Object.entries(MEAL_PRICES).flatMap(([meal, prices]) => TIERS.map((tier, i) => ({
  key: `SBX-MEAL-${city.toUpperCase()}-${meal}-${tier}`,
  row: {
    service_code: `SBX-MEAL-${city.toUpperCase()}-${meal}-${tier}`, restaurant_name: `${RESTAURANT[tier]} (${city})`,
    meal_type: meal, tier, city, base_rate_eur: prices[i], base_rate_non_eur: prices[i], rate_currency: 'EUR',
    cuisine_type: 'egyptian', restaurant_type: 'local_restaurant', meal_category: 'casual', per_person_rate: true, minimum_pax: 1,
    // One preferred restaurant per tier and meal across ALL cities
    // (meal_rates_one_preferred_idx): Cairo's are; Luxor has one per tier
    // and meal, so there is nothing to prefer between.
    rate_valid_from: VALID_FROM, rate_valid_to: VALID_TO, is_preferred: city === 'Cairo', is_active: true, notes: 'Invented test rate (Publish sandbox)',
  },
  match: { service_code: `SBX-MEAL-${city.toUpperCase()}-${meal}-${tier}` },
}))))

const tipping_rates = CITIES.flatMap(city => [
  ['restaurant', 'restaurant', 'per_service', 2],
  ['guide', 'day_tour', 'per_day', 10],
  ['driver', 'day_tour', 'per_day', 5],
].map(([role, context, unit, rate]) => ({
  key: `SBX-TIP-${city.toUpperCase()}-${role}-${context}`,
  row: {
    service_code: `SBX-TIP-${city.toUpperCase()}-${role}-${context}`, role_type: role, context, rate_unit: unit,
    rate_eur: rate, rate_currency: 'EUR', city, description: `Invented test tip: ${role}, ${context}, ${city}`, is_active: true,
  },
  match: { service_code: `SBX-TIP-${city.toUpperCase()}-${role}-${context}` },
})))

const fixed_daily_costs = [{
  key: 'SBX Bottled Water',
  row: { cost_type: 'SBX Bottled Water', cost_per_person_per_day: 1, rate_currency: 'EUR', is_active: true },
  match: { cost_type: 'SBX Bottled Water' },
}]

// Hotels: one per city and tier, preferred. EU and other nationalities differ.
const HOTEL = { budget: 'Sandbox Lotus Inn', standard: 'Sandbox Papyrus Hotel', deluxe: 'Sandbox Nile View Hotel', luxury: 'Sandbox Pharaoh Palace' }
const PPD = { budget: 30, standard: 50, deluxe: 85, luxury: 150 }
const accommodation_rates = CITIES.flatMap(city => TIERS.map(tier => {
  const eu = PPD[tier] + (city === 'Luxor' ? -5 : 0)
  const other = Math.round(eu * 0.9)
  const single = Math.round(eu * 0.7), singleOther = Math.round(other * 0.7)
  const code = `SBX-ACC-${city.toUpperCase().slice(0, 3)}-${tier}`
  const rates = { ppd_eur: eu, ppd_non_eur: other, single_supplement_eur: single, single_supplement_non_eur: singleOther, triple_reduction_eur: 2, triple_reduction_non_eur: 2 }
  return {
    key: code,
    row: {
      service_code: code, hotel_name: `${HOTEL[tier]} ${city}`, property_name: `${HOTEL[tier]} ${city}`, property_type: 'hotel',
      city, tier, board_basis: 'bb', is_preferred: true, is_active: true, rate_currency: 'EUR',
      ...rates,
      pp_double_eur: eu, pp_double_non_eur: other, single_supp_eur: single, single_supp_non_eur: singleOther, triple_red_eur: 2, triple_red_non_eur: 2,
      double_rate_eur: eu * 2, double_rate_non_eur: other * 2, single_rate_eur: eu + single, single_rate_non_eur: other + singleOther,
      triple_rate_eur: eu * 3 - 6, triple_rate_non_eur: other * 3 - 6,
      rate_valid_from: VALID_FROM, rate_valid_to: VALID_TO,
      seasons: JSON.stringify([{ from: VALID_FROM, to: VALID_TO, name: 'Sandbox — all year', season: 'low_season', rates }]),
      notes: 'Invented test hotel (Publish sandbox)',
    },
    match: { service_code: code },
  }
}))

// Entrance fees for the sights the tours visit, added only where the company
// has no fee of that name already.
const SIGHTS = [
  ['Step Pyramid of Djoser', 'Cairo', 20], ['Red Pyramid', 'Cairo', 12], ['Memphis Open-Air Museum', 'Cairo', 8],
  ['Giza Pyramids', 'Cairo', 22], ['Great Sphinx', 'Cairo', 0], ['Egyptian Museum', 'Cairo', 18], ['Citadel of Salah El Din', 'Cairo', 14],
  ['Karnak Temple', 'Luxor', 18], ['Valley of the Kings', 'Luxor', 28], ['Hatshepsut Temple', 'Luxor', 14], ['Colossi of Memnon', 'Luxor', 0],
]
const entrance_fees = SIGHTS.map(([name, city, fee]) => ({
  key: `SBX-ENT-${name}`,
  row: {
    service_code: `SBX-ENT-${name.toUpperCase().replace(/[^A-Z]+/g, '-').replace(/-$/, '')}`, attraction_name: name, city,
    category: 'monument', fee_type: 'standard', eur_rate: fee, non_eur_rate: fee, rate_currency: 'EUR', season: 'all_year',
    child_discount_percent: 50, student_discount_percentage: 0, rate_valid_from: VALID_FROM, rate_valid_to: VALID_TO,
    is_active: true, is_addon: false, is_sellable_extra: false, notes: 'Invented test fee (Publish sandbox)',
  },
  match: { attraction_name: name },
}))

const meals = (b, l, d) => ({ breakfast: b, lunch: l, dinner: d })
const services = { hotel_checkin: false, guide_required: false, hotel_checkout: false, airport_arrival: false, airport_departure: false }
const tours = [
  {
    template_code: 'SBX-SAQQARA-DAY', template_name: 'Saqqara and the First Pyramids', tour_type: 'day_tour',
    duration_days: 1, duration_nights: 0, cities_covered: ['Cairo'],
    main_attractions: ['Step Pyramid of Djoser', 'Red Pyramid', 'Memphis Open-Air Museum'],
    short_description: 'A day south of Cairo among the oldest pyramids. (Invented test tour.)',
    inclusions: ['Egyptologist guide', 'Air-conditioned vehicle', 'Entrance fees to the sites listed', 'Lunch'], exclusions: ['Tips not listed', 'Drinks'],
    departure_days: ['mon', 'wed', 'fri', 'sun'],
    itinerary: [{ day: 1, city: 'Cairo', title: 'Saqqara, Dahshur and Memphis', meals: meals('none', 'external', 'none'), services,
      attractions: ['Step Pyramid of Djoser', 'Red Pyramid', 'Memphis Open-Air Museum'], accommodation_type: 'none', description: '' }],
  },
  {
    template_code: 'SBX-THEBES-DAY', template_name: 'Thebes in a Day: Karnak and the Valley of the Kings', tour_type: 'day_tour',
    duration_days: 1, duration_nights: 0, cities_covered: ['Luxor'],
    main_attractions: ['Karnak Temple', 'Valley of the Kings', 'Hatshepsut Temple', 'Colossi of Memnon'],
    short_description: 'Both banks of Luxor in one full day. (Invented test tour.)',
    inclusions: ['Egyptologist guide', 'Air-conditioned vehicle', 'Entrance fees to the sites listed', 'Lunch'], exclusions: ['Special tombs', 'Tips not listed'],
    departure_days: ['tue', 'thu', 'sat'],
    itinerary: [{ day: 1, city: 'Luxor', title: 'East and West Bank', meals: meals('none', 'external', 'none'), services,
      attractions: ['Karnak Temple', 'Valley of the Kings', 'Hatshepsut Temple', 'Colossi of Memnon'], accommodation_type: 'none', description: '' }],
  },
  {
    template_code: 'SBX-CAIRO-5D', template_name: 'Five Days in Cairo', tour_type: 'multi_day',
    duration_days: 5, duration_nights: 4, cities_covered: ['Cairo'],
    main_attractions: ['Giza Pyramids', 'Egyptian Museum', 'Citadel of Salah El Din'],
    short_description: 'Pyramids, museums and the old city, four nights in Cairo. (Invented test tour.)',
    inclusions: ['Four nights with breakfast', 'Egyptologist guide on sightseeing days', 'Air-conditioned vehicle', 'Entrance fees to the sites listed', 'Lunches as listed'],
    exclusions: ['International flights', 'Visa', 'Tips not listed'],
    departure_days: ['sat'],
    itinerary: [
      { day: 1, city: 'Cairo', title: 'Arrival in Cairo', meals: meals('none', 'none', 'none'), services, attractions: [], is_cruise_day: false, overnight_city: 'Cairo', accommodation_type: 'hotel', description: '' },
      { day: 2, city: 'Cairo', title: 'Giza', meals: meals('included', 'external', 'none'), services, attractions: ['Giza Pyramids', 'Great Sphinx'], is_cruise_day: false, overnight_city: 'Cairo', accommodation_type: 'hotel', description: '' },
      { day: 3, city: 'Cairo', title: 'The Egyptian Museum and the Citadel', meals: meals('included', 'external', 'none'), services, attractions: ['Egyptian Museum', 'Citadel of Salah El Din'], is_cruise_day: false, overnight_city: 'Cairo', accommodation_type: 'hotel', description: '' },
      { day: 4, city: 'Cairo', title: 'Saqqara', meals: meals('included', 'external', 'none'), services, attractions: ['Step Pyramid of Djoser', 'Red Pyramid'], is_cruise_day: false, overnight_city: 'Cairo', accommodation_type: 'hotel', description: '' },
      { day: 5, city: 'Cairo', title: 'Departure', meals: meals('included', 'none', 'none'), services, attractions: [], is_cruise_day: false, accommodation_type: 'none', description: '' },
    ],
  },
]
const VARIATIONS = { budget: [2, 16], standard: [2, 12], deluxe: [2, 8], luxury: [2, 6] }

const POLICY = {
  name: 'SBX Standard terms',
  tiers: [{ days_before: 45, charge_percent: 10 }, { days_before: 30, charge_percent: 25 }, { days_before: 14, charge_percent: 50 }, { days_before: 3, charge_percent: 100 }],
  wording: { en: 'Invented test terms for the Publish sandbox. Cancellations must be made in writing.' },
}

const SITE = {
  archetype: 'private_journeys', status: 'draft', languages: ['en', 'fr'],
  brand: { tone: 'warm', claims: ['Egyptologist guides'], avoid: [] },
  settings: { indicativeCurrencies: ['USD', 'GBP'] },
}
// sandbox.localhost for a renderer run on this machine; the Railway hostname
// for the deployed publish-sites service.
const TEST_HOSTNAMES = ['sandbox.localhost', 'publish-sites-production.up.railway.app']

// ---------- the run ----------

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
const q = async (sql, params = []) => (await db.query(sql, params)).rows

const company = (await q('select id, company_name, currency from tenants where company_name = $1', [COMPANY]))[0]
if (!company) { console.error(`No company called "${COMPANY}".`); process.exit(1) }
const T = company.id
console.log(`${COMPANY} (${T}) — currency ${company.currency}\n${REMOVE ? 'REMOVE' : APPLY ? 'APPLY' : 'DRY RUN (nothing is written)'}\n`)

const where = (match) => {
  const keys = Object.keys(match)
  return { sql: keys.map((k, i) => `${k} = $${i + 2}`).join(' and '), values: keys.map(k => match[k]) }
}
const exists = async (table, match) => {
  const w = where(match)
  return (await q(`select id from ${table} where tenant_id = $1 and ${w.sql} limit 1`, [T, ...w.values]))[0]?.id ?? null
}

if (REMOVE) {
  await db.query('begin')
  const site = (await q('select id from publish_sites where tenant_id = $1', [T]))[0]
  if (site) await q('delete from publish_sites where id = $1', [site.id]) // cascades pages, locales, drafts, versions, domains, rules; enrolment ends
  await q("update tour_templates set cancellation_policy_id = null where tenant_id = $1 and template_code like 'SBX-%'", [T])
  const tourIds = (await q("select id from tour_templates where tenant_id = $1 and template_code like 'SBX-%'", [T])).map(r => r.id)
  if (tourIds.length) {
    await q('delete from tour_variations where template_id = any($1)', [tourIds])
    await q('delete from tour_templates where id = any($1)', [tourIds])
  }
  await q('delete from cancellation_policies where tenant_id = $1 and name = $2', [T, POLICY.name])
  for (const [table, col] of [['transportation_rates', 'route_name'], ['guide_rates', 'service_code'], ['meal_rates', 'service_code'], ['tipping_rates', 'service_code'], ['accommodation_rates', 'service_code'], ['entrance_fees', 'service_code']]) {
    const n = (await q(`delete from ${table} where tenant_id = $1 and ${col} like 'SBX-%' returning id`, [T])).length
    console.log(`  removed ${n} from ${table}`)
  }
  await q("delete from fixed_daily_costs where tenant_id = $1 and cost_type like 'SBX %'", [T])
  await db.query('commit')
  console.log('\nRemoved. (rate_audit_log keeps its history of these rows, as it does for every rate.)')
  await db.end()
  process.exit(0)
}

let toWrite = 0, skipped = 0
const plan = []
const section = async (table, items, describe) => {
  console.log(`== ${table}`)
  for (const it of items) {
    const id = await exists(table, it.match)
    if (id) { skipped++; console.log(`   = exists  ${describe(it.row)}`); continue }
    toWrite++; plan.push({ table, row: it.row }); console.log(`   + ${describe(it.row)}`)
  }
}

await section('transportation_rates', transportation_rates, r => `${r.city} day tour, ${r.vehicle_type} (${r.capacity_min}–${r.capacity_max} pax): EUR ${r.base_rate_eur}`)
await section('guide_rates', guide_rates, r => `${r.city} Egyptologist, English, ${r.tour_duration}: EUR ${r.base_rate_eur}`)
await section('meal_rates', meal_rates, r => `${r.city} ${r.meal_type}, ${r.tier} — ${r.restaurant_name}: EUR ${r.base_rate_eur} pp`)
await section('tipping_rates', tipping_rates, r => `${r.city} tip, ${r.role_type} / ${r.context}: EUR ${r.rate_eur} ${r.rate_unit}`)
await section('fixed_daily_costs', fixed_daily_costs, r => `${r.cost_type}: EUR ${r.cost_per_person_per_day} pp per day`)
await section('accommodation_rates', accommodation_rates, r => `${r.hotel_name} (${r.tier}): EUR ${r.ppd_eur} pp/night EU, ${r.ppd_non_eur} other; single supp ${r.single_supplement_eur}`)
console.log('== entrance_fees (only sights the company has no fee for)')
for (const it of entrance_fees) {
  const has = (await q('select id from entrance_fees where tenant_id = $1 and lower(attraction_name) = lower($2) limit 1', [T, it.row.attraction_name]))[0]
  if (has) { skipped++; console.log(`   = exists  ${it.row.attraction_name}`); continue }
  toWrite++; plan.push({ table: 'entrance_fees', row: it.row }); console.log(`   + ${it.row.attraction_name} (${it.row.city}): EUR ${it.row.eur_rate}`)
}

console.log('== cancellation_policies')
const policyId = await exists('cancellation_policies', { name: POLICY.name })
if (policyId) { skipped++; console.log(`   = exists  ${POLICY.name}`) } else {
  toWrite++; console.log(`   + ${POLICY.name} (company default): ${POLICY.tiers.map(t => `${t.days_before}d → ${t.charge_percent}%`).join(', ')}`)
}

console.log('== tour_templates (+ a variation per tier)')
for (const t of tours) {
  const id = await exists('tour_templates', { template_code: t.template_code })
  if (id) { skipped++; console.log(`   = exists  ${t.template_code} ${t.template_name}`); continue }
  toWrite += 1 + TIERS.length
  console.log(`   + ${t.template_code} "${t.template_name}" — ${t.duration_days} day(s), departs ${t.departure_days.join('/')}, ${t.itinerary.length} day(s) in the programme; variations ${TIERS.map(x => `${x} ${VARIATIONS[x].join('–')} pax`).join(', ')}`)
}

console.log('== publish_sites')
const siteId = (await q('select id from publish_sites where tenant_id = $1', [T]))[0]?.id ?? null
if (siteId) { skipped++; console.log('   = exists') } else {
  toWrite++; console.log(`   + ${SITE.archetype}, ${SITE.languages.join(' + ')}, status ${SITE.status}, brand tone ${SITE.brand.tone}, claims ${SITE.brand.claims.join('; ')}, indicative ${SITE.settings.indicativeCurrencies.join('/')}`)
  console.log('     (creating it enrols the company in Publish sync health and switches on the fact-only rule)')
}
console.log('== publish_domains')
const newHostnames = []
for (const hostname of TEST_HOSTNAMES) {
  const taken = (await q('select tenant_id from publish_domains where hostname = $1', [hostname]))[0]
  if (taken) { skipped++; console.log(`   = exists  ${hostname}${taken.tenant_id !== T ? ' (ANOTHER COMPANY — will not touch)' : ''}`) } else {
    toWrite++; newHostnames.push(hostname); console.log(`   + ${hostname} (test hostname: preview, never indexed)`)
  }
}

console.log(`\n${toWrite} row(s) to write, ${skipped} already there.`)
if (!APPLY) { console.log('Dry run — nothing written. Run again with --apply to write.'); await db.end(); process.exit(0) }

// ---------- apply, all or nothing ----------
const insert = async (table, row) => {
  const cols = Object.keys(row)
  const r = await q(`insert into ${table} (tenant_id, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) returning id`, [T, ...cols.map(c => row[c])])
  return r[0].id
}
try {
  await db.query('begin')
  for (const p of plan) await insert(p.table, p.row)
  const policy = policyId ?? await insert('cancellation_policies', { name: POLICY.name, is_default: true, tiers: JSON.stringify(POLICY.tiers), wording: JSON.stringify(POLICY.wording) })
  for (const t of tours) {
    if (await exists('tour_templates', { template_code: t.template_code })) continue
    const { itinerary, ...fields } = t
    const id = await insert('tour_templates', { ...fields, itinerary: JSON.stringify(itinerary), is_active: true, is_featured: false })
    for (const tier of TIERS) {
      await insert('tour_variations', {
        template_id: id, tier, variation_code: `${t.template_code}-${tier}`.toUpperCase(), variation_name: `${t.template_name} — ${tier}`,
        min_pax: VARIATIONS[tier][0], max_pax: VARIATIONS[tier][1], group_type: 'private', is_active: true,
      })
    }
  }
  const site = siteId ?? await insert('publish_sites', { archetype: SITE.archetype, status: SITE.status, languages: SITE.languages, brand: JSON.stringify(SITE.brand), settings: JSON.stringify(SITE.settings) })
  for (const hostname of newHostnames) await insert('publish_domains', { site_id: site, hostname, kind: 'test' })
  await db.query('commit')
  console.log(`\nWritten. Policy ${policy}, site ${site}.`)
} catch (e) {
  await db.query('rollback')
  console.error(`\nNothing written — the transaction was rolled back: ${e.message}`)
  process.exitCode = 1
}
await db.end()
