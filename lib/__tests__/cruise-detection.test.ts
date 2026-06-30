import { describe, it, expect } from 'vitest'
import { detectCruiseRequest } from '../ai/cruise-detection'

describe('detectCruiseRequest', () => {
  it('detects a clear Nile cruise request', () => {
    const result = detectCruiseRequest(
      'Nile cruise Luxor to Aswan',
      [],
      [],
      [],
      5,
      ''
    )

    expect(result.isCruise).toBe(true)
    expect(result.cruiseType).toBe('nile-cruise')
    expect(result.route).toBe('luxor-aswan')
    expect(result.startCity).toBe('Luxor')
    expect(result.endCity).toBe('Aswan')
    expect(result.keywords).toContain('cruise')
  })

  it('does NOT flag a pure land request', () => {
    const result = detectCruiseRequest(
      'Cairo city tour',
      [],
      [],
      [],
      3,
      ''
    )

    expect(result.isCruise).toBe(false)
    expect(result.cruiseType).toBeNull()
    expect(result.route).toBeNull()
    expect(result.startCity).toBeNull()
    expect(result.endCity).toBeNull()
    expect(result.keywords).toEqual([])
    expect(result.includesLand).toBe(false)
    expect(result.cruiseNights).toBe(0)
    expect(result.landNights).toBe(0)
  })
})
