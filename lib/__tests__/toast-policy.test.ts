import { describe, it, expect } from 'vitest'
import { toastTtlMs } from '@/app/contexts/ToastContext'

// ============================================
// Toast dismissal policy (the reliability contract)
// ============================================
// An import summary once auto-closed mid-read and the user had no idea
// what it said. The policy: errors and warnings NEVER auto-dismiss; the
// rest stay for reading time — scaled to length, floored, capped.

describe('toastTtlMs', () => {
  it('errors and warnings are sticky — null TTL, manual dismiss only', () => {
    expect(toastTtlMs('error', 'anything')).toBeNull()
    expect(toastTtlMs('warning', 'anything')).toBeNull()
  })

  it('short messages still get the 5s floor', () => {
    expect(toastTtlMs('success', 'Saved')).toBe(5_000)
  })

  it('long messages get reading time, scaling with length', () => {
    const short = toastTtlMs('success', 'Five words are enough here')!
    const long = toastTtlMs(
      'success',
      'Suppliers import: 64 imported and 64 had no Type so they were imported as Other — reclassify them when convenient'
    )!
    expect(long).toBeGreaterThan(short)
    expect(long).toBeGreaterThanOrEqual(7_000)
  })

  it('is capped at 20s so a wall of text cannot pin the screen', () => {
    expect(toastTtlMs('info', 'word '.repeat(500))).toBe(20_000)
  })
})
