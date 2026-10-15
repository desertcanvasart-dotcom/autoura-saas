import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appLinkHref } from '@/lib/html-escape'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Notification emails escape what callers hand them
// ============================================
// The public trip-report form (app/api/share/[token]/report) passes a
// traveller's own words to createNotification({ send_email: true }); POST
// /api/notifications passes a staff-supplied message and link. All of it went
// into the email HTML raw, sent from the platform address to staff.

const sent: Array<{ to: string; subject: string; html: string }> = []
let member = { id: 'tm1', name: 'Sara', email: 'sara@agency.test' }

vi.mock('@/lib/email', () => ({
  sendSystemEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return { success: true } },
}))
vi.mock('@/lib/push', () => ({ sendPushToUsers: async () => {} }))
vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      let inserted: Record<string, unknown> = {}
      q.insert = (row: Record<string, unknown>) => { inserted = row; return q }
      q.select = () => q
      q.single = async () => ({ data: { id: 'n1', ...inserted, team_member: member }, error: null })
      q.update = () => q
      q.eq = async () => ({ error: null })
      return q
    },
  }),
}))

import { createNotification } from '@/lib/notifications'

const notify = (over: Record<string, unknown>) =>
  createNotification({ team_member_id: 'tm1', type: 'trip_report', title: 'Report', message: 'hi', send_email: true, ...over } as never)

beforeEach(() => {
  sent.length = 0
  member = { id: 'tm1', name: 'Sara', email: 'sara@agency.test' }
})

describe('createNotification email', () => {
  it('escapes the message — a traveller cannot put a link or markup in front of staff', async () => {
    await notify({ message: 'Help <a href="https://evil.test">Re-login here</a><script>x()</script>' })
    expect(sent).toHaveLength(1)
    const { html } = sent[0]
    expect(html).not.toContain('<a href="https://evil.test"')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;a href=&quot;https://evil.test&quot;&gt;Re-login here&lt;/a&gt;')
  })

  it('escapes the recipient name', async () => {
    member = { ...member, name: '<img src=x onerror=1>' }
    await notify({})
    expect(sent[0].html).not.toContain('<img src=x')
  })

  it('drops a link that would point off the app, and keeps an app path', async () => {
    await notify({ link: '@evil.test/login' })
    expect(sent[0].html).not.toContain('evil.test')
    await notify({ link: '/trips/42?tab=report' })
    expect(sent[1].html).toMatch(/href="https?:\/\/[^"]+\/trips\/42\?tab=report"/)
  })

  it('keeps the subject on one line', async () => {
    await notify({ title: 'Report\r\nBcc: x@y.z' })
    expect(sent[0].subject).not.toMatch(/[\r\n]/)
  })
})

describe('appLinkHref', () => {
  const base = 'https://app.test'
  it('accepts a plain app path', () => {
    expect(appLinkHref(base, '/tasks')).toBe('https://app.test/tasks')
    expect(appLinkHref(base + '/', '/a?b=1&c=2')).toBe('https://app.test/a?b=1&amp;c=2')
  })
  it('refuses anything that could name another host or break the attribute', () => {
    for (const bad of ['@evil.test', '//evil.test', '/\\evil.test', 'https://evil.test', 'javascript:alert(1)', '/a" onclick="x', '/a b', null, 5]) {
      expect(appLinkHref(base, bad), String(bad)).toBe('')
    }
  })
})

describe('the task-reminder email', () => {
  const route = readFileSync(path.join(__dirname, '..', '..', 'app/api/cron/task-reminders/route.ts'), 'utf8')
  it('escapes the name and message (task titles are free text) and builds the link safely', () => {
    expect(route).toContain('${escapeHtml(toName)}')
    expect(route).toContain('${escapeHtml(message)}')
    expect(route).not.toContain('href="${baseUrl}${link}"')
  })
})
