import { vi, describe, it, expect, beforeAll } from 'vitest'
import { computeCoverage, type CoverageCalc } from '@/lib/pricing-coverage'
import { setMockTables } from './_mock-supabase'
import {
  fullRateTables,
  missingHotelTables,
  TEMPLATE_ID,
} from './fixtures/sample-templates'

// Layer 4 of the pricing harness: the coverage report. See PRICING-HARNESS-PLAN.md.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

// Imported after the mock is registered (used by the integration block).
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('computeCoverage — aggregation (injected engine)', () => {
  it('summarizes complete vs incomplete and counts holes by kind', async () => {
    const calc: CoverageCalc = async ({ templateId, tier }) => {
      if (templateId === 't-good') {
        return { success: true, complete: true, holes: [], templateName: 'Good' }
      }
      return {
        success: true,
        complete: false,
        templateName: 'Gappy',
        holes: [
          { kind: 'hotel', reason: 'missing', tier, lookupAttempted: 'hotel', message: 'add hotel' },
          { kind: 'transport', reason: 'fuzzy', tier, lookupAttempted: 'transport', message: 'add transport' },
        ],
      }
    }

    const report = await computeCoverage({
      templates: [{ id: 't-good', name: 'Good' }, { id: 't-bad', name: 'Gappy' }],
      tiers: ['standard'],
      isEurPassport: true,
      calc,
    })

    expect(report.summary.checked).toBe(2)
    expect(report.summary.complete).toBe(1)
    expect(report.summary.incomplete).toBe(1)
    expect(report.summary.totalHoles).toBe(2)
    expect(report.summary.holesByKind).toEqual({ hotel: 1, transport: 1 })
    expect(report.rows.find((r) => r.templateId === 't-bad')?.complete).toBe(false)
  })

  it('treats a thrown engine call as incomplete (e.g. template not found)', async () => {
    const calc: CoverageCalc = async () => {
      throw new Error('template not found')
    }
    const report = await computeCoverage({
      templates: [{ id: 'x', name: 'X' }],
      tiers: ['standard'],
      isEurPassport: true,
      calc,
    })
    expect(report.summary.incomplete).toBe(1)
    expect(report.rows[0].complete).toBe(false)
  })

  it('runs every template × tier combination', async () => {
    const calc = vi.fn(async () => ({
      success: true,
      complete: true,
      holes: [],
      templateName: 'T',
    }))
    await computeCoverage({
      templates: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      tiers: ['budget', 'standard', 'deluxe', 'luxury'],
      isEurPassport: true,
      calc,
    })
    expect(calc).toHaveBeenCalledTimes(8)
  })
})

describe('computeCoverage — integration with the real engine', () => {
  it('reports zero holes when every rate resolves', async () => {
    setMockTables(fullRateTables())
    const report = await computeCoverage({
      templates: [{ id: TEMPLATE_ID, name: 'Cairo' }],
      tiers: ['standard'],
      isEurPassport: true,
      calc: (a) => calculateDayBasedPricing(a),
    })
    expect(report.summary.incomplete).toBe(0)
    expect(report.summary.totalHoles).toBe(0)
  })

  it('surfaces a hotel hole when accommodation data is missing', async () => {
    setMockTables(missingHotelTables())
    const report = await computeCoverage({
      templates: [{ id: TEMPLATE_ID, name: 'Cairo' }],
      tiers: ['standard'],
      isEurPassport: true,
      calc: (a) => calculateDayBasedPricing(a),
    })
    expect(report.summary.incomplete).toBe(1)
    expect(report.summary.holesByKind.hotel).toBeGreaterThanOrEqual(1)
  })
})
