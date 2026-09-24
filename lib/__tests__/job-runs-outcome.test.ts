import { describe, it, expect } from 'vitest'
import { withJobRun } from '@/lib/support/job-runs'

// The job history must not call a bad run "ok". The Gmail sync's first live
// run (2026-09-24) synced 0 of 5 mailboxes, answered 200 with
// { success: false }, and was recorded as ok.

function fakeDb() {
  const finished: Array<{ outcome: string; detail: unknown }> = []
  const db = {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'run1' } }) }) }),
      update: (row: { outcome: string; detail: unknown }) => {
        finished.push({ outcome: row.outcome, detail: row.detail })
        return { eq: async () => ({}) }
      },
      delete: () => ({ eq: () => ({ lt: async () => ({}), then: (ok: () => void) => ok() }) }),
    }),
  }
  return { db, finished }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('withJobRun outcome', () => {
  it('a 200 that reports success:false is a FAILED run, with the reason', async () => {
    const { db, finished } = fakeDb()
    const res = await withJobRun('gmail-sync', () => db, async () => json({ success: false, failed: 5 }))()
    expect(res.status).toBe(200) // the caller still gets the body untouched
    expect(await res.json()).toEqual({ success: false, failed: 5 })
    expect(finished[0]).toMatchObject({ outcome: 'failed' })
    expect(String(finished[0].detail)).toContain('5 failed')
  })

  it('a clean 200 is ok; a 500 is failed; a non-JSON 200 is ok', async () => {
    for (const [body, want] of [[json({ success: true }), 'ok'], [json({}, 500), 'failed'], [new Response('done'), 'ok']] as const) {
      const { db, finished } = fakeDb()
      await withJobRun('mail-alerts', () => db, async () => body)()
      expect(finished[0].outcome).toBe(want)
    }
  })
})
