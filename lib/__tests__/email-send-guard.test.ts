import { describe, it, expect } from 'vitest'
import { claimSend, finishSend, threadConflict, replyBodyHash, SAME_REPLY_WINDOW_MINUTES } from '@/lib/email/send-guard'

// ============================================
// Never the same email reply twice
// ============================================
// /api/gmail/send sent whatever reached it: a double click, a retried request,
// a second tab, or two colleagues answering the same customer each sent a real
// email. The only duplicate check ran AFTER Gmail had accepted the message.

/** A tiny stand-in for the query builder, recording what it was asked. */
function db(tables: Record<string, unknown[]>, opts: { insertError?: { code: string } } = {}) {
  const calls: Array<{ table: string; op: string }> = []
  const make = (table: string) => {
    let rows = [...(tables[table] ?? [])] as Array<Record<string, unknown>>
    const builder: Record<string, unknown> = {
      insert: (row: Record<string, unknown>) => {
        calls.push({ table, op: 'insert' })
        if (opts.insertError) return Promise.resolve({ error: opts.insertError })
        const key = row.request_key
        if ((tables[table] ?? []).some(r => (r as Record<string, unknown>).request_key === key)) {
          return Promise.resolve({ error: { code: '23505' } })
        }
        ;(tables[table] ||= []).push(row)
        return Promise.resolve({ error: null })
      },
      update: (patch: Record<string, unknown>) => {
        calls.push({ table, op: 'update' })
        const chain: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            rows = rows.filter(r => r[col] === val)
            return chain
          },
          select: () => {
            for (const r of rows) Object.assign(r, patch)
            return Promise.resolve({ data: rows, error: null })
          },
          then: (res: (v: unknown) => unknown) => {
            for (const r of rows) Object.assign(r, patch)
            return Promise.resolve(res({ data: rows, error: null }))
          },
        }
        return chain
      },
      select: () => builder,
      eq: (col: string, val: unknown) => {
        rows = rows.filter(r => r[col] === val)
        return builder
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter(r => vals.includes(r[col] as never))
        return builder
      },
      gt: (col: string, val: unknown) => {
        rows = rows.filter(r => String(r[col]) > String(val))
        return builder
      },
      order: () => builder,
      limit: () => Promise.resolve({ data: rows, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    }
    return builder
  }
  return { from: (t: string) => make(t), calls, tables }
}

describe('replyBodyHash', () => {
  it('is the same reply whatever the markup, case or spacing', () => {
    expect(replyBodyHash('<p>Hello  <b>Ada</b></p>')).toBe(replyBodyHash('hello ada'))
    expect(replyBodyHash('Hello&nbsp;Ada')).toBe(replyBodyHash('Hello Ada'))
  })

  it('is a different reply when the words differ', () => {
    expect(replyBodyHash('Hello Ada')).not.toBe(replyBodyHash('Hello Bob'))
  })
})

describe('claimSend', () => {
  const info = { userId: 'u1', threadId: 't1', bodyHash: 'h1' }

  it('claims a fresh key', async () => {
    const d = db({ email_send_claims: [] })
    expect(await claimSend(d, 'k1', info)).toEqual({ ok: true })
  })

  it('refuses the SAME key — the double click', async () => {
    const d = db({ email_send_claims: [{ request_key: 'k1', status: 'sending' }] })
    const res = await claimSend(d, 'k1', info)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe('sending')
  })

  it('answers a repeat of a SENT key with what was sent, so nothing sends twice', async () => {
    const d = db({ email_send_claims: [{ request_key: 'k1', status: 'sent', gmail_message_id: 'm1', gmail_thread_id: 't1' }] })
    const res = await claimSend(d, 'k1', info)
    expect(res).toMatchObject({ ok: false, status: 'sent', gmailMessageId: 'm1' })
  })

  it('lets a FAILED attempt be retried with its own key', async () => {
    const d = db({ email_send_claims: [{ request_key: 'k1', status: 'failed' }] })
    expect(await claimSend(d, 'k1', info)).toEqual({ ok: true })
  })

  it('does not block sending before the table exists', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      expect(await claimSend(db({}, { insertError: { code } }), 'k1', info), code).toEqual({ ok: true })
    }
  })

  it('does not swallow a real database error', async () => {
    await expect(claimSend(db({}, { insertError: { code: '42501' } }), 'k1', info)).rejects.toBeTruthy()
  })
})

describe('threadConflict', () => {
  const NOW = new Date('2027-03-01T12:00:00Z')
  const hash = 'h1'

  it('reports a colleague who replied after the message being answered', async () => {
    const d = db({
      email_messages: [{ gmail_thread_id: 't1', direction: 'outbound', sent_at: '2027-03-01T11:00:00Z', sent_by: 'u2' }],
      user_profiles: [{ id: 'u2', full_name: 'Sara', email: 's@x.test' }],
    })
    const c = await threadConflict(d, { threadId: 't1', requestKey: 'k2', seenUpTo: '2027-03-01T10:00:00Z', bodyHash: hash, now: NOW })
    expect(c).toMatchObject({ code: 'ALREADY_REPLIED', repliedBy: 'Sara' })
  })

  it('reports an attempt still in flight from someone else', async () => {
    const d = db({
      email_messages: [],
      email_send_claims: [{ request_key: 'other', thread_id: 't1', status: 'sending', created_at: '2027-03-01T11:30:00Z', user_id: null }],
    })
    const c = await threadConflict(d, { threadId: 't1', requestKey: 'k2', seenUpTo: '2027-03-01T10:00:00Z', bodyHash: hash, now: NOW })
    expect(c).toMatchObject({ code: 'ALREADY_REPLIED' })
  })

  it('does not report the sender’s OWN attempt', async () => {
    const d = db({
      email_messages: [],
      email_send_claims: [{ request_key: 'k2', thread_id: 't1', status: 'sending', created_at: '2027-03-01T11:30:00Z' }],
    })
    expect(await threadConflict(d, { threadId: 't1', requestKey: 'k2', seenUpTo: '2027-03-01T10:00:00Z', bodyHash: hash, now: NOW })).toBeNull()
  })

  it('reports the same text sent to the thread within the window', async () => {
    const d = db({
      email_messages: [],
      email_send_claims: [{ request_key: 'earlier', thread_id: 't1', body_hash: hash, status: 'sent', created_at: '2027-03-01T11:55:00Z' }],
    })
    const c = await threadConflict(d, { threadId: 't1', requestKey: 'k2', seenUpTo: undefined, bodyHash: hash, now: NOW })
    expect(c).toMatchObject({ code: 'SAME_REPLY' })
  })

  it('does not report the same text sent longer ago than the window', async () => {
    const old = new Date(NOW.getTime() - (SAME_REPLY_WINDOW_MINUTES + 5) * 60_000).toISOString()
    const d = db({
      email_messages: [],
      email_send_claims: [{ request_key: 'earlier', thread_id: 't1', body_hash: hash, status: 'sent', created_at: old }],
    })
    expect(await threadConflict(d, { threadId: 't1', requestKey: 'k2', seenUpTo: undefined, bodyHash: hash, now: NOW })).toBeNull()
  })

  it('a clean thread has nothing in the way', async () => {
    const d = db({ email_messages: [], email_send_claims: [] })
    expect(await threadConflict(d, { threadId: 't1', requestKey: 'k1', seenUpTo: '2027-03-01T10:00:00Z', bodyHash: hash, now: NOW })).toBeNull()
  })
})

describe('finishSend', () => {
  it('records what was sent, so a repeat of the key can answer with it', async () => {
    const d = db({ email_send_claims: [{ request_key: 'k1', status: 'sending' }] })
    await finishSend(d, 'k1', { ok: true, gmailMessageId: 'm1', gmailThreadId: 't1' })
    expect(d.tables.email_send_claims[0]).toMatchObject({ status: 'sent', gmail_message_id: 'm1' })
  })

  it('releases a failed attempt, so it can be retried', async () => {
    const d = db({ email_send_claims: [{ request_key: 'k1', status: 'sending' }] })
    await finishSend(d, 'k1', { ok: false })
    expect(d.tables.email_send_claims[0]).toMatchObject({ status: 'failed' })
  })
})
