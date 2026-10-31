import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ============================================
// The WhatsApp AI's notes reach the team
// ============================================
// The agent saved "AI created a trip inquiry", "AI asked for a quote" and
// escalations as whatsapp_messages with direction 'system'. The table allows
// only inbound/outbound (migration 019), so every note was rejected, and
// nobody checked the error. They now go to the team's bell on the chat's
// own item.

vi.mock('@/lib/supabase-server', () => ({ createAdminClient: () => ({}) }))
const notifyTeam = vi.fn()
vi.mock('@/lib/notifications', () => ({ notifyTeam: (...a: unknown[]) => notifyTeam(...a) }))

type Row = Record<string, unknown>
let inserts: { table: string; values: Row }[] = []

function db() {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        update: () => q,
        insert: async (values: Row) => { inserts.push({ table, values }); return { error: null } },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      }
      return q
    },
  }
}

import { ToolExecutor, noteForTeam } from '@/lib/whatsapp-ai-agent'

beforeEach(() => {
  inserts = []
  notifyTeam.mockReset()
})

describe('escalate_to_human', () => {
  it('rings the team on the chat’s own bell item and writes nothing into the chat', async () => {
    const tool = new ToolExecutor(db() as never, 'c1', '+20', 'conv-1', 't1')
    const r = await tool.execute('escalate_to_human', { reason: 'Wants a refund', urgency: 'high' })

    expect(r.success).toBe(true)
    expect(notifyTeam).toHaveBeenCalledTimes(1)
    expect(notifyTeam.mock.calls[0][0]).toMatchObject({
      tenant_id: 't1',
      dedupe_key: 'wa:conv-1',
      link: '/inbox?channel=whatsapp',
    })
    expect(notifyTeam.mock.calls[0][0].message).toContain('Wants a refund')
    expect(inserts.filter(i => i.table === 'whatsapp_messages')).toEqual([])
  })
})

describe('noteForTeam', () => {
  it('without a company, nobody is notified', async () => {
    await noteForTeam(null, 'conv-1', 'title', 'message')
    expect(notifyTeam).not.toHaveBeenCalled()
  })

  it('a failed note does not fail the caller', async () => {
    notifyTeam.mockRejectedValueOnce(new Error('bell down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(noteForTeam('t1', 'conv-1', 'title', 'message')).resolves.toBeUndefined()
    spy.mockRestore()
  })
})

describe('the agent', () => {
  it('never writes a direction the whatsapp_messages table rejects', () => {
    const source = readFileSync(join(process.cwd(), 'lib/whatsapp-ai-agent.ts'), 'utf8')
    const directions = [...source.matchAll(/direction:\s*'([a-z_]+)'/g)].map(m => m[1])
    expect(directions.length).toBeGreaterThan(0)
    for (const d of directions) expect(['inbound', 'outbound']).toContain(d)
  })
})
