import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A plain Supabase select stops at 1000 rows without saying so. These lists
// and totals must read everything (lib/db/fetch-all-pages).
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('reports and lists read every row', () => {
  for (const [f, n] of [
    ['app/api/financial-reports/route.ts', 5],
    ['app/api/accounts-receivable/route.ts', 1],
    ['app/api/payments/route.ts', 1],
    ['app/api/itineraries/route.ts', 2],
    ['app/api/tasks/route.ts', 2],
    ['app/api/cron/task-reminders/route.ts', 2],
  ] as const) {
    it(f, () => expect((read(f).match(/fetchAllPages\(/g) ?? []).length).toBeGreaterThanOrEqual(n))
  }

  it('the available report years start at the earliest invoice', () => {
    expect(read('app/api/financial-reports/route.ts')).toContain('yearsFrom((availableYearsResult.data || [])[0]?.issue_date, year)')
  })
})

describe('scheduled jobs keep up', () => {
  it('invoice reminders: the whole due list, within a time budget — not 50 a day', () => {
    const src = read('app/api/cron/send-reminders/route.ts')
    expect(src).not.toContain('.limit(50)')
    expect(src).toContain('TIME_BUDGET_MS')
    expect(src).toContain('const MAX_DUE = 2000')
  })
  it('task reminders: one dedupe query per 200 tasks, not one per task', () => {
    const src = read('app/api/cron/task-reminders/route.ts')
    expect(src).toContain(".in('related_task_id', taskIds.slice(i, i + 200))")
    expect(src).not.toMatch(/\.eq\('related_task_id', task\.id\)/)
  })
})

describe('search text is never filter syntax', () => {
  for (const f of ['app/api/conversations/route.ts', 'app/api/templates/route.ts', 'app/api/whatsapp/conversations/route.ts',
    'app/api/guides/route.ts', 'app/api/b2b/partners/route.ts', 'app/api/clients/route.ts', 'app/api/super-admin/users/route.ts']) {
    it(f, () => {
      const src = read(f)
      expect(src).toContain('orIlikeContains(')
      expect(src).not.toMatch(/ilike\.%\$\{/)
    })
  }
})

it('431 indexes the hot per-company queries', () => {
  const sql = read('supabase/migrations/431_hot_path_indexes.sql')
  for (const ix of ['idx_clients_tenant_created', 'idx_email_messages_tenant_created', 'idx_notifications_task_type_created', 'idx_invoices_reminder_due']) {
    expect(sql).toContain(ix)
  }
})
