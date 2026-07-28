import { describe, it, expect } from 'vitest'
import { evaluateDeleteGuard } from '@/lib/delete-guard'

// ============================================================================
// Two delete handlers destroyed child rows, THEN hit a RESTRICT/NO-ACTION
// foreign key on the parent — leaving the record gutted while telling the user
// "cannot delete". Reproduced against production. The handlers now check first
// and delete once (atomically). This guards the pre-check's two rules:
//   1. a FAILED count is not "zero, safe to delete" (the silent-empty trap)
//   2. any positive count blocks, and the message names every blocker
// ============================================================================

describe('evaluateDeleteGuard', () => {
  it('allows the delete when nothing is linked', () => {
    const r = evaluateDeleteGuard('itinerary', [
      { label: '0 booking(s)', count: 0 },
      { label: '0 invoice(s)', count: 0 },
    ])
    expect(r.ok).toBe(true)
  })

  it('treats null/undefined counts as zero (an empty relation, not a block)', () => {
    const r = evaluateDeleteGuard('client', [
      { label: '0 booking(s)', count: null },
      { label: '0 invoice(s)', count: undefined },
    ])
    expect(r.ok).toBe(true)
  })

  it('blocks when any relation has rows, and lists every blocker', () => {
    const r = evaluateDeleteGuard('itinerary', [
      { label: '2 booking(s)', count: 2 },
      { label: '0 invoice(s)', count: 0 },
      { label: '1 payment(s)', count: 1 },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok && r.kind === 'blocked') {
      expect(r.message).toContain('2 booking(s)')
      expect(r.message).toContain('1 payment(s)')
      expect(r.message).not.toContain('0 invoice(s)') // zero relations are not named
      expect(r.message).toContain('itinerary')
    } else {
      throw new Error('expected blocked')
    }
  })

  it('a FAILED count is an error, NOT a green light — the core rule', () => {
    // If the bookings count errored, we cannot know there are no bookings.
    // Reading that as "0, safe to delete" is exactly how a booking's itinerary
    // could have been gutted.
    const r = evaluateDeleteGuard('itinerary', [
      { label: '0 booking(s)', count: 0, error: { message: 'permission denied' } },
      { label: '0 invoice(s)', count: 0 },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('error')
      expect(r.message).toContain('Nothing was deleted')
    }
  })

  it('an error outranks a block — we report the thing we could not verify', () => {
    const r = evaluateDeleteGuard('client', [
      { label: '3 invoice(s)', count: 3 },                                  // would block
      { label: '0 payment(s)', count: 0, error: { message: 'timeout' } },   // errored
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.kind).toBe('error')
  })

  it('names the deleted noun in the blocked message', () => {
    const r = evaluateDeleteGuard('client', [{ label: '1 booking(s)', count: 1 }])
    if (!r.ok && r.kind === 'blocked') {
      expect(r.message).toContain('client')
    } else {
      throw new Error('expected blocked')
    }
  })

  it('handles an empty check list as allowed', () => {
    expect(evaluateDeleteGuard('itinerary', []).ok).toBe(true)
  })
})
