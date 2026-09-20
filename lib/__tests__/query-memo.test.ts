import { describe, it, expect } from 'vitest'
import { withQueryMemo, memoRead, memoSize } from '@/lib/pricing/query-memo'
import { ttlMemo } from '@/lib/ttl-memo'

// ============================================
// Ask each thing once, and never across requests
// ============================================
// Measured on live data 2026-09-18: one tour card on /tours cost 48 database
// round trips and 6.8 seconds, because the price is computed per tier and each
// tier re-read the same programme, the same transport rows, the same entrance
// fee. Every round trip is ~200ms through PostgREST, so the repeats WERE the
// wait. This is the memo those reads now go through.

describe('memoRead inside a scope', () => {
  it('reads once, however many callers ask', async () => {
    let reads = 0
    const read = async () => { reads++; return 'rate' }
    const answers = await withQueryMemo(async () => Promise.all([
      memoRead('k', read), memoRead('k', read), memoRead('k', read),
    ]))
    expect(reads).toBe(1)
    expect(answers).toEqual(['rate', 'rate', 'rate'])
  })

  it('shares one IN-FLIGHT read, not just a finished one', async () => {
    // The tiers run together now, so the second caller arrives before the
    // first has answered. Caching the result only would miss every time.
    let reads = 0
    let release: (v: string) => void = () => {}
    const read = () => { reads++; return new Promise<string>(r => { release = r }) }
    await withQueryMemo(async () => {
      const a = memoRead('k', read)
      const b = memoRead('k', read)
      release('rate')
      expect(await a).toBe('rate')
      expect(await b).toBe('rate')
    })
    expect(reads).toBe(1)
  })

  it('keeps different keys apart — a deluxe answer is not a standard one', async () => {
    const seen: string[] = []
    await withQueryMemo(async () => {
      await memoRead('rate|standard', async () => { seen.push('standard'); return 1 })
      await memoRead('rate|deluxe', async () => { seen.push('deluxe'); return 2 })
    })
    expect(seen).toEqual(['standard', 'deluxe'])
  })

  it('does not remember a failure', async () => {
    let attempts = 0
    await withQueryMemo(async () => {
      const failing = async () => { attempts++; throw new Error('network') }
      await expect(memoRead('k', failing)).rejects.toThrow('network')
      await expect(memoRead('k', failing)).rejects.toThrow('network')
    })
    expect(attempts).toBe(2)
  })
})

describe('memoRead outside a scope', () => {
  it('caches NOTHING — no rate survives a request', async () => {
    // This is the safety property. A price is only ever as good as the rate
    // behind it, so nothing may be remembered between calculations.
    let reads = 0
    const read = async () => { reads++; return 'rate' }
    await memoRead('k', read)
    await memoRead('k', read)
    expect(reads).toBe(2)
    expect(memoSize()).toBe(0)
  })
})

describe('ttlMemo', () => {
  it('collapses callers who arrive together into one read', async () => {
    let reads = 0
    const memo = ttlMemo<number>(60_000)
    const load = () => { reads++; return new Promise<number>(r => setTimeout(() => r(7), 5)) }
    const all = await Promise.all([memo('k', load), memo('k', load), memo('k', load)])
    expect(reads).toBe(1)
    expect(all).toEqual([7, 7, 7])
  })

  it('forgets a failed load rather than serving the error for a minute', async () => {
    let attempts = 0
    const memo = ttlMemo<number>(60_000)
    const failing = async () => { attempts++; throw new Error('down') }
    await expect(memo('k', failing)).rejects.toThrow('down')
    await expect(memo('k', failing)).rejects.toThrow('down')
    expect(attempts).toBe(2)
  })

  it('can be cleared, for the admin routes that change rates', async () => {
    let reads = 0
    const memo = ttlMemo<number>(60_000)
    const load = async () => { reads++; return 1 }
    await memo('k', load)
    memo.clear()
    await memo('k', load)
    expect(reads).toBe(2)
  })
})
