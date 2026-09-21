// Filling tour cards in with their prices, a few at a time.
//
// The tours page used to wait for the pricing engine before showing anything —
// 5–8 seconds of blank page on production data. It now shows its list at once
// and asks for prices afterwards; this is the asking.
import { describe, it, expect } from 'vitest'
import { chunk, loadPricesInBatches, type PriceState, type StartingFrom } from '@/lib/tours/price-loader'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`)
const price = (n: number): StartingFrom => ({ starting_from: n, starting_from_tier: 'standard' })

describe('chunk', () => {
  it('splits into batches, the last one short', () => {
    expect(chunk(ids(7), 3)).toEqual([['t1', 't2', 't3'], ['t4', 't5', 't6'], ['t7']])
  })
  it('never loops forever on a nonsense size', () => {
    expect(chunk(ids(2), 0)).toEqual([['t1'], ['t2']])
    expect(chunk([], 3)).toEqual([])
  })
})

describe('loading prices in batches', () => {
  it('reports each batch as it answers — a card does not wait for the whole page', async () => {
    const reported: string[][] = []
    await loadPricesInBatches(ids(7), async batch => Object.fromEntries(batch.map(id => [id, price(100)])), u => reported.push(Object.keys(u)), { batchSize: 3, concurrency: 1 })
    expect(reported).toEqual([['t1', 't2', 't3'], ['t4', 't5', 't6'], ['t7']])
  })

  it('keeps only a couple of requests in flight, so nineteen tours are not nineteen engine runs at once', async () => {
    let inFlight = 0, peak = 0
    await loadPricesInBatches(ids(19), async batch => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      return Object.fromEntries(batch.map(id => [id, price(1)]))
    }, () => {}, { batchSize: 3, concurrency: 2 })
    expect(peak).toBe(2)
  })

  it('a slow batch does not hold up the one behind it', async () => {
    const order: string[] = []
    await loadPricesInBatches(['slow', 'quick-1', 'quick-2'], async batch => {
      await new Promise(r => setTimeout(r, batch[0] === 'slow' ? 40 : 1))
      return Object.fromEntries(batch.map(id => [id, price(1)]))
    }, u => order.push(...Object.keys(u)), { batchSize: 1, concurrency: 2 })
    expect(order).toEqual(['quick-1', 'quick-2', 'slow'])
  })

  it('a batch that FAILS is failed for exactly its own tours — the rest carry on', async () => {
    const state: Record<string, PriceState> = {}
    await loadPricesInBatches(ids(6), async batch => {
      if (batch.includes('t4')) throw new Error('network')
      return Object.fromEntries(batch.map(id => [id, price(250)]))
    }, u => Object.assign(state, u), { batchSize: 3, concurrency: 2 })
    expect(state.t1).toEqual({ status: 'done', starting_from: 250, starting_from_tier: 'standard' })
    expect(state.t4).toEqual({ status: 'failed' })
    expect(state.t6).toEqual({ status: 'failed' })
  })

  it('"could not ask" is never reported as "has no price"', async () => {
    const state: Record<string, PriceState> = {}
    await loadPricesInBatches(['t1'], async () => { throw new Error('offline') }, u => Object.assign(state, u))
    expect(state.t1.status).toBe('failed')
    expect(state.t1).not.toHaveProperty('starting_from')
  })

  it('a tour the server did not find has no price to show — that is done, not failed', async () => {
    const state: Record<string, PriceState> = {}
    await loadPricesInBatches(['mine', 'not-mine'], async () => ({ mine: price(90) }), u => Object.assign(state, u))
    expect(state['not-mine']).toEqual({ status: 'done', starting_from: null, starting_from_tier: null })
  })

  it('asks for each tour once, however many times it is listed', async () => {
    const asked: string[] = []
    await loadPricesInBatches(['t1', 't1', 't2'], async batch => { asked.push(...batch); return {} }, () => {})
    expect(asked).toEqual(['t1', 't2'])
  })

  it('a page that has gone gets nothing — and stops asking', async () => {
    const controller = new AbortController()
    const reported: string[] = []
    const asked: string[] = []
    await loadPricesInBatches(ids(9), async batch => {
      asked.push(...batch)
      if (batch.includes('t1')) controller.abort()
      return Object.fromEntries(batch.map(id => [id, price(1)]))
    }, u => reported.push(...Object.keys(u)), { batchSize: 3, concurrency: 1, signal: controller.signal })
    expect(reported).toEqual([])
    expect(asked).toEqual(['t1', 't2', 't3'])
  })

  it('stays out of the browser bundle\'s way: it imports nothing', async () => {
    const src = (await import('node:fs')).readFileSync((await import('node:path')).join(process.cwd(), 'lib/tours/price-loader.ts'), 'utf8')
    expect([...src.matchAll(/^import\s/gm)]).toHaveLength(0)
  })
})
