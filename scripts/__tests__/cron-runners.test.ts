import { describe, it, expect, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ============================================================================
// Cron entrypoints — the exit code IS the product.
//
// Railway records a scheduled run as success or failure purely from the
// process exit code. Both of these scripts POST to an endpoint that answers
// 200 with a SUMMARY, and that summary can describe a night where the real
// work failed:
//
//   agent-memory    200 with runs_failed > 0     (every run failed to process)
//   exchange-rates  200 with snapshotError       (rate history was not written)
//
// Exiting 0 on any 200 makes those nights indistinguishable from healthy ones,
// which is the quiet-degradation failure mode this whole area keeps hitting.
// These tests spawn the real scripts against a stub server and assert the code.
// ============================================================================

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const AGENT_MEMORY = path.join(ROOT, 'scripts/cron-agent-memory.mjs')
const EXCHANGE_RATES = path.join(ROOT, 'scripts/cron-exchange-rates.mjs')

interface StubResponse {
  status?: number
  body: string
  contentType?: string
}

let server: http.Server | null = null

/** Start a one-shot stub that answers every request identically. */
async function stub(response: StubResponse): Promise<{ url: string; received: { secret?: string; path?: string } }> {
  const received: { secret?: string; path?: string } = {}

  server = http.createServer((req, res) => {
    received.secret = req.headers['x-cron-secret'] as string | undefined
    received.path = req.url
    res.writeHead(response.status ?? 200, {
      'Content-Type': response.contentType ?? 'application/json',
    })
    res.end(response.body)
  })

  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('stub server has no port')
  return { url: `http://127.0.0.1:${address.port}`, received }
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

function run(script: string, env: Record<string, string | undefined>): Promise<RunResult> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script], {
      // Deliberately NOT inheriting the ambient env: a developer's real
      // APP_URL/CRON_SECRET must not make a "missing env" test pass.
      env: { PATH: process.env.PATH, ...env } as NodeJS.ProcessEnv,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

afterEach(async () => {
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()))
    server = null
  }
})

describe('cron-agent-memory', () => {
  it('exits 0 and reports the counts on a clean run', async () => {
    const { url, received } = await stub({
      body: JSON.stringify({
        success: true, runs_found: 3, runs_processed: 3, runs_failed: 0,
        memories_written: 7, memories_purged: 2, duration_ms: 412,
      }),
    })

    const result = await run(AGENT_MEMORY, { APP_URL: url, CRON_SECRET: 'shh' })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('ok')
    expect(result.stdout).toContain('found=3')
    expect(result.stdout).toContain('failed=0')
    expect(result.stdout).toContain('written=7')
    expect(received.secret).toBe('shh')
    expect(received.path).toBe('/api/cron/process-agent-memory')
  })

  it('exits 0 when there was simply nothing to do', async () => {
    // No agent runs in the window is a legitimate quiet night, not a failure.
    const { url } = await stub({
      body: JSON.stringify({
        success: true, runs_found: 0, runs_processed: 0, runs_failed: 0,
        memories_written: 0, memories_purged: 0, duration_ms: 12,
      }),
    })

    const result = await run(AGENT_MEMORY, { APP_URL: url, CRON_SECRET: 'shh' })
    expect(result.code).toBe(0)
  })

  it('THE FIX: exits 1 when runs failed, despite the 200', async () => {
    const { url } = await stub({
      body: JSON.stringify({
        success: true, runs_found: 5, runs_processed: 2, runs_failed: 3,
        memories_written: 0, memories_purged: 0, duration_ms: 300,
      }),
    })

    const result = await run(AGENT_MEMORY, { APP_URL: url, CRON_SECRET: 'shh' })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('3 of 5')
    expect(result.stderr).toContain('FAILED')
  })

  it('exits 1 when the route itself reports failure', async () => {
    const { url } = await stub({
      body: JSON.stringify({ success: false, error: 'db unreachable' }),
    })

    const result = await run(AGENT_MEMORY, { APP_URL: url, CRON_SECRET: 'shh' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('db unreachable')
  })

  it('exits 1 on a 200 whose body it cannot vouch for', async () => {
    const { url } = await stub({ body: '<html>gateway</html>', contentType: 'text/html' })

    const result = await run(AGENT_MEMORY, { APP_URL: url, CRON_SECRET: 'shh' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('unparseable')
  })

  it('exits 1 on a rejected secret', async () => {
    const { url } = await stub({ status: 401, body: JSON.stringify({ error: 'Unauthorized' }) })

    const result = await run(AGENT_MEMORY, { APP_URL: url, CRON_SECRET: 'wrong' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('401')
  })

  it('exits 1 when required env is missing, without calling anything', async () => {
    const noUrl = await run(AGENT_MEMORY, { CRON_SECRET: 'shh' })
    expect(noUrl.code).toBe(1)
    expect(noUrl.stderr).toContain('APP_URL')

    const noSecret = await run(AGENT_MEMORY, { APP_URL: 'http://127.0.0.1:1' })
    expect(noSecret.code).toBe(1)
    expect(noSecret.stderr).toContain('CRON_SECRET')
  })
})

describe('cron-exchange-rates', () => {
  it('exits 0 and reports snapshots written', async () => {
    const { url, received } = await stub({
      body: JSON.stringify({
        success: true, message: 'Successfully refreshed 6 exchange rates',
        fetchedAt: '2026-07-26T01:00:00.000Z', ratesRefreshed: 6, snapshotsWritten: 6,
      }),
    })

    const result = await run(EXCHANGE_RATES, { APP_URL: url, CRON_SECRET: 'shh' })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('snapshots=6')
    expect(received.path).toBe('/api/cron/refresh-exchange-rates')
  })

  it('exits 1 when rates refreshed but the history write was lost', async () => {
    // The live table updated, so HTTP is 200 — but the P&L gained nothing.
    const { url } = await stub({
      body: JSON.stringify({
        success: true, message: 'Successfully refreshed 6 exchange rates',
        ratesRefreshed: 6, snapshotsWritten: 0, snapshotError: 'permission denied',
      }),
    })

    const result = await run(EXCHANGE_RATES, { APP_URL: url, CRON_SECRET: 'shh' })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('history write FAILED')
    expect(result.stderr).toContain('permission denied')
  })

  it('targets the cron-prefixed endpoint, not the session-gated admin route', async () => {
    // /api/exchange-rates/refresh sits behind the middleware session gate;
    // pointing the job there 401s every night. Locked so it cannot drift back.
    const { url, received } = await stub({
      body: JSON.stringify({ success: true, ratesRefreshed: 6, snapshotsWritten: 6 }),
    })

    await run(EXCHANGE_RATES, { APP_URL: url, CRON_SECRET: 'shh' })
    expect(received.path).toContain('/api/cron/')
  })

  it('exits 1 when required env is missing', async () => {
    const noUrl = await run(EXCHANGE_RATES, { CRON_SECRET: 'shh' })
    expect(noUrl.code).toBe(1)
    expect(noUrl.stderr).toContain('APP_URL')
  })
})

// ============================================================================
// cron-reminders — two sweeps, one exit code.
//
// These endpoints existed for months with nothing calling them: no runner, no
// npm script, no Railway service. Wiring them is only half the job — both
// answer 200 with a summary that can describe a failed night (send-reminders
// `failed > 0`, task-reminders `results.errors[]`), so a runner that trusted
// the status code would restore the silence it was written to end.
//
// Note these two authenticate with `Authorization: Bearer`, not the
// `x-cron-secret` header the other two jobs use.
// ============================================================================

const REMINDERS = path.join(ROOT, 'scripts/cron-reminders.mjs')

/** Stub that answers per path, and records what each path received. */
async function stubByPath(
  routes: Record<string, { status?: number; body: string }>
): Promise<{ url: string; hits: string[]; auth: (string | undefined)[] }> {
  const hits: string[] = []
  const auth: (string | undefined)[] = []

  server = http.createServer((req, res) => {
    hits.push(req.url ?? '')
    auth.push(req.headers['authorization'] as string | undefined)
    const match = Object.entries(routes).find(([p]) => (req.url ?? '').startsWith(p))
    const r = match?.[1] ?? { status: 404, body: '{}' }
    res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json' })
    res.end(r.body)
  })

  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('stub server has no port')
  return { url: `http://127.0.0.1:${address.port}`, hits, auth }
}

const OK_INVOICES = JSON.stringify({ success: true, message: 'Processed 3 reminders', sent: 3, failed: 0, skipped: 0 })
const OK_TASKS = JSON.stringify({ success: true, message: 'Task reminders sent: 2 due soon, 1 overdue', results: { dueSoon: 2, overdue: 1, errors: [] } })

describe('cron-reminders', () => {
  it('exits 0 on a clean run and calls BOTH endpoints with a Bearer secret', async () => {
    const { url, hits, auth } = await stubByPath({
      '/api/cron/purge-traveller-documents': { body: JSON.stringify({ success: true, purged: 0, failures: [] }) },
      '/api/cron/send-reminders': { body: OK_INVOICES },
      '/api/cron/task-reminders': { body: OK_TASKS },
    })

    const result = await run(REMINDERS, { APP_URL: url, CRON_SECRET: 'shh' })

    expect(result.code).toBe(0)
    expect(hits).toContain('/api/cron/send-reminders')
    expect(hits).toContain('/api/cron/task-reminders')
    expect(auth).toEqual(['Bearer shh', 'Bearer shh', 'Bearer shh'])
    expect(result.stdout).toContain('send-reminders ok')
    expect(result.stdout).toContain('task-reminders ok')
    expect(result.stdout).toContain('purge-traveller-documents ok')
  })

  it('exits 0 when there was simply nothing to do', async () => {
    const { url } = await stubByPath({
      '/api/cron/purge-traveller-documents': { body: JSON.stringify({ success: true, purged: 0, failures: [] }) },
      '/api/cron/send-reminders': { body: JSON.stringify({ success: true, message: 'No reminders to send', processed: 0 }) },
      '/api/cron/task-reminders': { body: JSON.stringify({ success: true, message: 'Task reminders sent: 0 due soon, 0 overdue', results: { dueSoon: 0, overdue: 0, errors: [] } }) },
    })
    const result = await run(REMINDERS, { APP_URL: url, CRON_SECRET: 'shh' })
    expect(result.code).toBe(0)
  })

  it('exits 1 when dunning emails failed inside a 200', async () => {
    const { url } = await stubByPath({
      '/api/cron/purge-traveller-documents': { body: JSON.stringify({ success: true, purged: 0, failures: [] }) },
      '/api/cron/send-reminders': { body: JSON.stringify({ success: true, message: 'Processed 4 reminders', sent: 1, failed: 3, skipped: 0 }) },
      '/api/cron/task-reminders': { body: OK_TASKS },
    })
    const result = await run(REMINDERS, { APP_URL: url, CRON_SECRET: 'shh' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('3 reminder email(s) FAILED')
  })

  it('exits 1 when the task sweep reported errors inside a 200', async () => {
    const { url } = await stubByPath({
      '/api/cron/purge-traveller-documents': { body: JSON.stringify({ success: true, purged: 0, failures: [] }) },
      '/api/cron/send-reminders': { body: OK_INVOICES },
      '/api/cron/task-reminders': { body: JSON.stringify({ success: true, message: 'done', results: { dueSoon: 0, overdue: 0, errors: ['Due soon query error: boom'] } }) },
    })
    const result = await run(REMINDERS, { APP_URL: url, CRON_SECRET: 'shh' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('boom')
  })

  it('still calls the second sweep when the first one fails', async () => {
    // One broken job must not hide the state of the other.
    const { url, hits } = await stubByPath({
      '/api/cron/purge-traveller-documents': { body: JSON.stringify({ success: true, purged: 0, failures: [] }) },
      '/api/cron/send-reminders': { status: 500, body: 'kaboom' },
      '/api/cron/task-reminders': { body: OK_TASKS },
    })
    const result = await run(REMINDERS, { APP_URL: url, CRON_SECRET: 'shh' })
    expect(result.code).toBe(1)
    expect(hits).toContain('/api/cron/task-reminders')
    expect(result.stdout).toContain('task-reminders ok')
  })

  it('exits 1 rather than running unauthenticated when CRON_SECRET is absent', async () => {
    const { url, hits } = await stubByPath({ '/api/cron/': { body: OK_TASKS } })
    const result = await run(REMINDERS, { APP_URL: url })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('CRON_SECRET')
    expect(hits).toEqual([])
  })
})
