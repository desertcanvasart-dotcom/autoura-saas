import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Wrappers forward EVERY engine option explicitly
// ============================================
// The travelDate incident: the B2B calculate-price route accepted
// travel_date, echoed a season label into its response — and never passed
// the date to the engine, so every dated hotel/cruise period and the
// seasonal uplift were silently ignored. calculateAutoPricing itself
// dropped packageType the same way, and PricingParams carried four fields
// (mealPlan, includeAccommodation, numAdults, numChildren) that nothing
// ever read. A dropped option is silent pricing corruption; an inert
// option is a lie in the type. These source scans fail the build on the
// next instance of either.

const ROOT = path.join(__dirname, '..', '..')
const ENGINE = readFileSync(path.join(ROOT, 'lib', 'auto-pricing-service.ts'), 'utf8')
const B2B_ROUTE = readFileSync(
  path.join(ROOT, 'app', 'api', 'b2b', 'calculate-price', 'route.ts'),
  'utf8'
)

/** Field names of an interface declared in `src` (top-level fields only). */
function interfaceKeys(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`))
  if (!m) throw new Error(`interface ${name} not found`)
  return [...m[1].matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??:/gm)].map(x => x[1])
}

/** Keys of the object literal passed in the FIRST `fn({ ... })` call after `after`. */
function callKeys(src: string, fn: string, after = 0): string[] {
  const start = src.indexOf(`${fn}({`, after)
  if (start === -1) throw new Error(`call ${fn}({ not found`)
  const open = src.indexOf('{', start + fn.length)
  let depth = 0
  let end = open
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    if (src[i] === '}') depth--
    if (depth === 0) { end = i; break }
  }
  const body = src.slice(open + 1, end)
  const keys: string[] = []
  for (const line of body.split('\n')) {
    const named = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/)
    const shorthand = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*,?\s*(\/\/.*)?$/)
    if (named) keys.push(named[1])
    else if (shorthand && shorthand[1] !== 'true' && shorthand[1] !== 'false') keys.push(shorthand[1])
  }
  return keys
}

describe('calculateAutoPricing → calculateDayBasedPricing', () => {
  it('forwards every core option DayPricingParams declares', () => {
    const coreKeys = interfaceKeys(ENGINE, 'DayPricingParams')
    expect(coreKeys.length).toBeGreaterThanOrEqual(7)
    const wrapperStart = ENGINE.indexOf('export async function calculateAutoPricing')
    const forwarded = callKeys(ENGINE, 'calculateDayBasedPricing', wrapperStart)
    for (const key of coreKeys) {
      expect(forwarded, `calculateAutoPricing drops core option '${key}'`).toContain(key)
    }
  })

  it('PricingParams declares no option the wrapper body never touches', () => {
    const wrapperStart = ENGINE.indexOf('export async function calculateAutoPricing')
    const wrapperEnd = ENGINE.indexOf('export async function calculateMultiTierPricing')
    const body = ENGINE.slice(wrapperStart, wrapperEnd)
    for (const key of interfaceKeys(ENGINE, 'PricingParams')) {
      // Read via destructuring or params.<key> — either counts as "touched".
      const touched = new RegExp(`(\\b${key}\\b\\s*[,}=:])|params\\.${key}\\b`).test(body)
      expect(touched, `PricingParams.${key} is accepted but never read — inert option`).toBe(true)
    }
  })
})

describe('B2B calculate-price → calculateAutoPricing', () => {
  it('forwards travelDate (the incident this file exists for)', () => {
    const passed = callKeys(B2B_ROUTE, 'calculateAutoPricing')
    expect(passed).toContain('travelDate')
  })

  it('passes only options PricingParams actually declares', () => {
    const declared = new Set(interfaceKeys(ENGINE, 'PricingParams'))
    for (const key of callKeys(B2B_ROUTE, 'calculateAutoPricing')) {
      expect(declared.has(key), `route passes '${key}', which PricingParams does not declare — it would be silently ignored`).toBe(true)
    }
  })
})
