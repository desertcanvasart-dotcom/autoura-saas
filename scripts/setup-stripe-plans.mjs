#!/usr/bin/env node
// ============================================================================
// Create the Stripe products and prices for the plan catalogue.
// ============================================================================
//
// You run this, not CI — it needs a Stripe secret key, and it changes a real
// payment account.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-plans.mjs
//   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-plans.mjs --apply
//   STRIPE_SECRET_KEY=sk_live_... node scripts/setup-stripe-plans.mjs --apply --live
//
// DRY RUN BY DEFAULT. Nothing is created without --apply, and a live key is
// refused without --live on top, so a copy-pasted live key cannot quietly
// create real products.
//
// Prices come from supabase/generated/plans.json — the same artifact the deploy
// sync applies, generated from lib/pricing-config.ts. Editing a price here
// would reintroduce exactly the second-source-of-truth problem migrations
// 240/241 removed, so this script has no prices of its own.
//
// IDEMPOTENT. Products are matched on metadata.autoura_plan_slug and prices on
// lookup_key, so re-running finds what exists instead of duplicating it.
// Stripe prices are IMMUTABLE: if an amount has changed, a new price is created
// and the old one archived (active:false). Nothing is ever deleted — archived
// prices keep working for subscriptions already on them, which is the point.
//
// Enterprise has no published price and is skipped: it is contact-sales, and
// inventing a number for it would be fabricating a price.
// ============================================================================

import fs from 'fs'
import path from 'path'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const APPLY = process.argv.includes('--apply')
const LIVE_OK = process.argv.includes('--live')

function die(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Credentials — from the environment only. Never read from a committed file,
// never echoed back.
// ---------------------------------------------------------------------------
const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  die(
    'STRIPE_SECRET_KEY is not set.\n' +
    '  Run it inline so the key never lands in your shell history file:\n' +
    '    STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-plans.mjs'
  )
}

const isLive = key.startsWith('sk_live_')
if (!isLive && !key.startsWith('sk_test_') && !key.startsWith('rk_')) {
  die('STRIPE_SECRET_KEY does not look like a Stripe secret key (expected sk_test_ / sk_live_ / rk_).')
}
if (isLive && !LIVE_OK) {
  die(
    'That is a LIVE key. Re-run with --live if you really mean to create products\n' +
    '  in the live account. Test first: use your sk_test_ key with no --live.'
  )
}

const MODE = isLive ? 'LIVE' : 'TEST'
const stripe = new Stripe(key, { apiVersion: '2025-12-15.clover' })

// ---------------------------------------------------------------------------
// The catalogue — canonical, not authored here.
// ---------------------------------------------------------------------------
const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/generated/plans.json'), 'utf8'))
const priced = plans.filter(p => p.price_monthly !== null || p.price_yearly !== null)
const skipped = plans.filter(p => p.price_monthly === null && p.price_yearly === null)

const CYCLES = [
  { key: 'monthly', field: 'price_monthly', interval: 'month', column: 'stripe_price_id_monthly' },
  { key: 'yearly', field: 'price_yearly', interval: 'year', column: 'stripe_price_id_yearly' },
]

/** Stable per plan+cycle, so a re-run finds the price instead of making a new one. */
const lookupKey = (slug, cycle) => `autoura_${slug}_${cycle}`

console.log(`\nStripe plan setup — ${MODE} mode — ${APPLY ? 'APPLYING' : 'DRY RUN'}`)
console.log(`${priced.length} priced plan(s); skipping ${skipped.map(p => p.slug).join(', ') || 'none'} (no published price)\n`)

const results = []

// A Stripe error must not surface as a raw stack trace: the failure people hit
// is a bad or wrong-mode key, and that deserves a sentence, not a dump.
//
// Both listeners are needed. A throw out of TOP-LEVEL AWAIT in an ES module is
// reported as an uncaught exception, not an unhandled rejection, so listening
// for only the latter leaves Node printing its own fatal dump.
function reportAndExit(err) {
  const e = /** @type {{ type?: string, message?: string }} */ (err)
  if (e?.type === 'StripeAuthenticationError') {
    die(`Stripe rejected the key (${MODE} mode). Check it is the right key for this account.`)
  }
  if (e?.type === 'StripePermissionError') {
    die(`The key lacks permission for this call: ${e.message}`)
  }
  die(`Stripe call failed: ${e?.message ?? String(err)}`)
}
process.on('unhandledRejection', reportAndExit)
process.on('uncaughtException', reportAndExit)

for (const plan of priced) {
  // -- product ------------------------------------------------------------
  const search = await stripe.products.search({
    query: `metadata['autoura_plan_slug']:'${plan.slug}'`,
    limit: 1,
  })
  let product = search.data[0] ?? null

  if (product) {
    console.log(`  ${plan.slug.padEnd(10)} product exists  ${product.id}`)
  } else if (APPLY) {
    product = await stripe.products.create({
      name: `Autoura ${plan.name}`,
      description: plan.description,
      metadata: { autoura_plan_slug: plan.slug },
    })
    console.log(`  ${plan.slug.padEnd(10)} product CREATED ${product.id}`)
  } else {
    console.log(`  ${plan.slug.padEnd(10)} product would be created — "Autoura ${plan.name}"`)
  }

  const row = { slug: plan.slug }

  // -- prices -------------------------------------------------------------
  for (const cycle of CYCLES) {
    const amount = plan[cycle.field]
    if (amount === null || amount === undefined) {
      console.log(`  ${''.padEnd(10)}   ${cycle.key}: no price in the catalogue — skipped`)
      continue
    }

    const unitAmount = Math.round(Number(amount) * 100)
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      die(`${plan.slug} ${cycle.key}: refusing to create a price from ${JSON.stringify(amount)}`)
    }

    const lk = lookupKey(plan.slug, cycle.key)
    const existing = (await stripe.prices.list({ lookup_keys: [lk], limit: 1 })).data[0] ?? null

    if (existing && existing.unit_amount === unitAmount && existing.currency === plan.currency.toLowerCase()) {
      console.log(`  ${''.padEnd(10)}   ${cycle.key}: unchanged      ${existing.id}  ${plan.currency} ${amount}`)
      row[cycle.column] = existing.id
      continue
    }

    if (existing) {
      // Amount changed. Prices are immutable — a new one is required, and the
      // old must give up the lookup key before the new one can take it.
      console.log(
        `  ${''.padEnd(10)}   ${cycle.key}: AMOUNT CHANGED ${existing.unit_amount / 100} -> ${amount}` +
        ` (archiving ${existing.id})`
      )
      if (APPLY) {
        await stripe.prices.update(existing.id, { active: false, lookup_key: `${lk}_archived_${existing.id}` })
      }
    }

    if (!APPLY) {
      console.log(`  ${''.padEnd(10)}   ${cycle.key}: would create   ${plan.currency} ${amount} / ${cycle.interval}`)
      continue
    }

    const price = await stripe.prices.create({
      product: product.id,
      currency: plan.currency.toLowerCase(),
      unit_amount: unitAmount,
      recurring: { interval: cycle.interval },
      lookup_key: lk,
      transfer_lookup_key: true,
      metadata: { autoura_plan_slug: plan.slug, autoura_cycle: cycle.key },
    })
    console.log(`  ${''.padEnd(10)}   ${cycle.key}: CREATED        ${price.id}  ${plan.currency} ${amount}`)
    row[cycle.column] = price.id
  }

  if (product) row.stripe_product_id = product.id
  results.push(row)
}

// ---------------------------------------------------------------------------
// Write the ids back. scripts/sync-plans.mjs upserts on slug WITHOUT these
// columns in its payload, so what we write here survives every deploy.
// ---------------------------------------------------------------------------
if (!APPLY) {
  console.log('\nDry run — nothing was created and nothing was written.')
  console.log('Re-run with --apply once the above looks right.')
  process.exit(0)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.log('\n⚠ Stripe objects were created, but NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  console.log('  are not set, so the ids were NOT written to subscription_plans.')
  console.log('  Re-run with those set — the script is idempotent and will reuse what it just made.')
  console.log(`\n${JSON.stringify(results, null, 2)}`)
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
let wrote = 0
for (const { slug, ...cols } of results) {
  if (Object.keys(cols).length === 0) continue
  const { error } = await supabase.from('subscription_plans').update(cols).eq('slug', slug)
  if (error) die(`writing ${slug}: ${error.message}`)
  wrote++
}

console.log(`\n✅ ${MODE}: ${wrote} plan(s) updated in subscription_plans.`)
if (!isLive) console.log('   This was TEST mode — repeat with your live key and --live when ready.')
