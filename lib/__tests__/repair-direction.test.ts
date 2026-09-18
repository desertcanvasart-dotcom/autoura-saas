import { describe, it, expect } from 'vitest'
import { repairOfficeDirections } from '@/lib/email/repair-direction'
import { officeRule } from '@/lib/email/office-addresses'

// ============================================
// Mail already stored on the wrong side
// ============================================
// Before the office rule, a colleague's reply from another address on the
// agency's domain was stored as INBOUND — the customer writing. Fixing the
// rule going forward leaves those rows wrong, and a wrong row shows the
// conversation as "Waiting on us" for an answer that already went.

function db(opts: { updated?: Array<{ unified_conversation_id: string | null }>; error?: unknown; rpcThrows?: boolean } = {}) {
  const calls: Array<{ kind: string; value: unknown }> = []
  const rpcCalls: string[] = []
  const builder = () => {
    const chain: Record<string, unknown> = {
      update: () => chain,
      eq: () => chain,
      in: (_c: string, v: string[]) => { calls.push({ kind: 'in', value: v }); return chain },
      ilike: (_c: string, v: string) => { calls.push({ kind: 'ilike', value: v }); return chain },
      select: async () => ({ data: opts.updated ?? [], error: opts.error ?? null }),
    }
    return chain
  }
  return {
    from: () => builder(),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (opts.rpcThrows) throw new Error('rpc failed')
      rpcCalls.push(`${fn}:${args.p_unified_id}`)
      return {}
    },
    calls,
    rpcCalls,
  }
}

const RULE = officeRule(['info@agency.com'], ['partner-office.com'])

describe('repairOfficeDirections', () => {
  it('looks for the office addresses and each office domain', async () => {
    const d = db()
    await repairOfficeDirections(d, 't1', RULE)
    expect(d.calls.find(c => c.kind === 'in')?.value).toEqual(['info@agency.com'])
    expect(d.calls.filter(c => c.kind === 'ilike').map(c => c.value)).toEqual(['%@agency.com', '%@partner-office.com'])
  })

  it('reports what it moved, and recomputes only those conversations', async () => {
    const d = db({ updated: [{ unified_conversation_id: 'conv-1' }, { unified_conversation_id: 'conv-1' }] })
    const res = await repairOfficeDirections(d, 't1', RULE)
    expect(res.repaired).toBeGreaterThan(0)
    expect(res.conversations).toEqual(['conv-1'])
    expect(d.rpcCalls.every(c => c.startsWith('update_unified_conversation_stats:'))).toBe(true)
    expect(new Set(d.rpcCalls).size, 'a conversation is recomputed once').toBe(1)
  })

  it('never fails the sync when the tidy-up query fails', async () => {
    const res = await repairOfficeDirections(db({ error: { message: 'nope' } }), 't1', RULE)
    expect(res).toEqual({ repaired: 0, conversations: [] })
  })

  it('never fails the sync when recomputing fails', async () => {
    const d = db({ updated: [{ unified_conversation_id: 'conv-1' }], rpcThrows: true })
    // It still reports what it moved; only the recompute failed.
    const res = await repairOfficeDirections(d, 't1', RULE)
    expect(res.repaired).toBeGreaterThan(0)
    expect(res.conversations).toEqual(['conv-1'])
  })

  it('does nothing when the office has no addresses at all', async () => {
    const d = db()
    const res = await repairOfficeDirections(d, 't1', { addresses: [], domains: [] })
    expect(res).toEqual({ repaired: 0, conversations: [] })
    expect(d.calls).toEqual([])
  })
})
