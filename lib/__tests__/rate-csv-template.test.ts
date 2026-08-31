// The sample CSV must describe the form people actually fill in.
//
// It had drifted twice over:
//
//   * every numeric column got the value 100, capacities included, so the
//     transportation sample said each vehicle seats exactly 100. Because
//     getTransportRateForPax() matches a capacity band and then falls back to
//     the first tier whose max fits, an agency importing that sample priced
//     EVERY group as a sedan -- a couple and a coachload alike. The same rule
//     put 100 in student_discount_percentage: a 100% discount.
//   * both templates still asked for the non-EU passport price that the
//     transportation and attractions forms stopped collecting. On attractions
//     it was REQUIRED, so a file written from the current form's fields was
//     rejected row by row.
import { describe, it, expect } from 'vitest'
import {
  RATE_TABLE_CONFIGS,
  getTemplateHeaders,
  getExportHeaders,
  buildTemplateRow,
  validateImportData,
} from '@/lib/bulk-rate-service'

const transport = RATE_TABLE_CONFIGS.transportation_rates
const attractions = RATE_TABLE_CONFIGS.entrance_fees

describe('rate CSV template matches the form', () => {
  it('offers one rate per vehicle, not a passport split', () => {
    const headers = getTemplateHeaders(transport)
    for (const tier of ['sedan', 'minivan', 'van', 'minibus', 'bus']) {
      expect(headers, `${tier} rate`).toContain(`${tier}_rate_eur`)
      expect(headers, `${tier} must not offer a non-EU column`).not.toContain(`${tier}_rate_non_eur`)
    }
  })

  it('offers one attraction rate, and does not require the dropped column', () => {
    const headers = getTemplateHeaders(attractions)
    expect(headers).toContain('eur_rate')
    expect(headers).not.toContain('non_eur_rate')
    // Absent from the template AND still required would fail every row.
    const nonEur = attractions.columns.find(c => c.name === 'non_eur_rate')
    expect(nonEur?.required).toBe(false)
  })

  it('drops the EU-passport wording the forms no longer use', () => {
    for (const config of [transport, attractions]) {
      const shown = config.columns
        .filter(c => !c.exportOnly && !c.legacy)
        .map(c => c.label)
      expect(shown.filter(l => /EU passport/i.test(l)), config.displayName).toEqual([])
    }
  })

  it('samples real capacity bands, never a flat 100', () => {
    const row = buildTemplateRow(transport)
    // The bands lib/transport-rate-utils.ts falls back to.
    expect([row.sedan_capacity_min, row.sedan_capacity_max]).toEqual(['1', '2'])
    expect([row.minivan_capacity_min, row.minivan_capacity_max]).toEqual(['3', '7'])
    expect([row.van_capacity_min, row.van_capacity_max]).toEqual(['8', '12'])
    expect([row.minibus_capacity_min, row.minibus_capacity_max]).toEqual(['13', '20'])
    expect([row.bus_capacity_min, row.bus_capacity_max]).toEqual(['21', '45'])
  })

  it('never samples a 100% discount', () => {
    for (const config of Object.values(RATE_TABLE_CONFIGS)) {
      const row = buildTemplateRow(config)
      for (const [name, value] of Object.entries(row)) {
        if (!/(percent|percentage)$/.test(name)) continue
        expect(Number(value), `${config.tableName}.${name}`).toBeLessThan(100)
      }
    }
  })

  it('every sampled capacity is a plausible passenger count', () => {
    for (const config of Object.values(RATE_TABLE_CONFIGS)) {
      const row = buildTemplateRow(config)
      for (const [name, value] of Object.entries(row)) {
        if (!/capacity/.test(name)) continue
        expect(Number(value), `${config.tableName}.${name}`).toBeLessThanOrEqual(45)
      }
    }
  })
})

// The passport split is real for exactly two things: hotels and Nile cruises,
// where a room genuinely has two contracted prices. Their two-price data lives
// in the SEPARATE rate-periods CSV (lib/rates/period-csv.ts), not here.
// Everything else — transport, entrance fees, guides, meals, flights,
// activities — is one price (operator, 2026-08-30).
describe('only hotels and cruises keep a passport split', () => {
  // Unlike the parent app, hotels and cruises carry their split in THIS file
  // rather than a separate rate-periods CSV, so they are named exceptions.
  const SPLIT_IS_REAL = new Set(['accommodation_rates', 'nile_cruises'])

  it('no other rate table offers a non-EU column', () => {
    const offenders: string[] = []
    for (const config of Object.values(RATE_TABLE_CONFIGS)) {
      if (SPLIT_IS_REAL.has(config.tableName)) continue
      for (const c of config.columns) {
        if (/non_eur/.test(c.name) && !c.legacy) {
          offenders.push(`${config.tableName}.${c.name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('hotels and cruises keep theirs — a room has two contracted prices', () => {
    for (const t of SPLIT_IS_REAL) {
      const live = RATE_TABLE_CONFIGS[t].columns.filter(c => /non_eur/.test(c.name) && !c.legacy)
      expect(live.length, t).toBeGreaterThan(0)
    }
  })

  it('every dropped non-EU column mirrors the price beside it', () => {
    for (const config of Object.values(RATE_TABLE_CONFIGS)) {
      for (const c of config.columns) {
        if (!/non_eur/.test(c.name) || !c.legacy) continue
        expect(c.mirrorFrom, `${config.tableName}.${c.name}`).toBeTruthy()
        const source = config.columns.find(x => x.name === c.mirrorFrom)
        expect(source, `${c.mirrorFrom} must exist`).toBeTruthy()
      }
    }
  })
})

describe('the dropped columns still round-trip', () => {
  it('exports them, so existing data is never lost', () => {
    expect(getExportHeaders(attractions)).toContain('non_eur_rate')
    expect(getExportHeaders(transport)).toContain('sedan_rate_non_eur')
  })

  it('still imports an OLD file that carries them', () => {
    const preview = validateImportData(
      [{ service_code: 'OLD-1', attraction_name: 'Giza', city: 'Cairo', eur_rate: '100', non_eur_rate: '80' }],
      attractions
    )
    expect(preview.errors).toEqual([])
    expect(preview.validRows).toBe(1)
  })

  it('mirrors the rate when a NEW file omits them', () => {
    // Without this an import through the current template writes a row priced
    // for one passport and blank for the other, and lib/tourCalculator.ts
    // reads that blank as zero rather than falling back.
    const preview = validateImportData(
      [{ service_code: 'NEW-1', attraction_name: 'Giza', city: 'Cairo', eur_rate: '100' }],
      attractions
    )
    expect(preview.errors).toEqual([])
    expect((preview.sampleData[0] as Record<string, number>).non_eur_rate).toBe(100)
  })

  it('mirrors every vehicle rate too', () => {
    const preview = validateImportData(
      // This app keys transportation on route_name, not service_code.
      [{ route_name: 'NEW-2', service_type: 'airport_transfer', city: 'Cairo',
         sedan_rate_eur: '50', bus_rate_eur: '300' }],
      transport
    )
    expect(preview.errors).toEqual([])
    expect((preview.sampleData[0] as Record<string, number>).sedan_rate_non_eur).toBe(50)
    expect((preview.sampleData[0] as Record<string, number>).bus_rate_non_eur).toBe(300)
  })
})
