import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JOB_NAMES } from '@/lib/support/job-names.mjs'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('operations', () => {
  it('the web service only goes live once /api/health answers', () => {
    const iac = read('.railway/railway.ts')
    const web = iac.slice(iac.indexOf('service("get-autoura"'))
    expect(web).toMatch(/healthcheck: "\/api\/health"/)
    expect(web).toMatch(/healthcheckTimeout: \d+/)
  })

  it('the optional alert and portal secrets survive a config apply', () => {
    const iac = read('.railway/railway.ts')
    expect(iac).toContain('ALERT_WEBHOOK_URL: preserve()')
    expect(iac).toContain('PORTAL_VERIFY_SECRET: preserve()')
  })

  it('OPERATIONS.md lists every scheduled job, plus backups', () => {
    const ops = read('docs/OPERATIONS.md')
    const endpoint: Record<string, string> = {
      'exchange-rates': 'refresh-exchange-rates', 'agent-memory': 'process-agent-memory',
      reminders: 'send-reminders', 'task-reminders': 'task-reminders',
      'purge-traveller-documents': 'purge-traveller-documents', 'purge-closed-companies': 'purge-closed-companies', 'gmail-sync': 'gmail-sync',
      'mail-alerts': 'mail-alerts', 'scheduled-send': 'scheduled-send', 'publish-sync': 'publish-sync',
      'service-booking-deadlines': 'service-booking-deadlines',
    }
    for (const job of JOB_NAMES) expect(ops, job).toContain(`/api/cron/${endpoint[job]}`)
    expect(ops).toContain('## Backups and restore')
    expect(ops).toContain('do **not** include files in\nStorage')
  })
})
