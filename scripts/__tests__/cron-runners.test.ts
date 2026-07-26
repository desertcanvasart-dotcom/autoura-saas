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
