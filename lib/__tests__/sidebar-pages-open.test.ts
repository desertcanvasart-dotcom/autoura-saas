import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ROUTE_PERMISSIONS, permissionRouteFor } from '@/middleware'

// ============================================
// A sidebar link opens for everyone it is shown to (2026-10-11). Email
// Signatures (all staff), Copilot Analytics and Seasonal Premiums (managers)
// were in the sidebar, but the '/settings' rule — admins only — matched them
// first and sent the manager or member to "unauthorized".
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
const allowed = (pathname: string) => ROUTE_PERMISSIONS[permissionRouteFor(pathname) ?? ''] ?? null

describe('the pages under /settings', () => {
  it('the most specific rule governs a path', () => {
    expect(permissionRouteFor('/settings/seasons')).toBe('/settings/seasons')
    expect(permissionRouteFor('/settings/seasons/2026')).toBe('/settings/seasons')
    expect(permissionRouteFor('/settings/whatsapp')).toBe('/settings')
    expect(permissionRouteFor('/no-such-page')).toBeUndefined()
  })

  it('open for the roles the Settings sidebar shows them to; the rest stays admin-only', () => {
    expect(allowed('/settings/email-signatures')).toEqual(['admin', 'manager', 'member'])
    expect(allowed('/reports')).toEqual(['admin', 'manager', 'member', 'viewer'])
    expect(allowed('/settings/seasons')).toEqual(['admin', 'manager'])
    // Personal: your own Gmail (the Inbox sends members here) and your own profile.
    expect(allowed('/settings/email')).toEqual(['admin', 'manager', 'member'])
    expect(allowed('/settings/profile')).toEqual(['admin', 'manager', 'member', 'viewer'])
    expect(allowed('/settings/departments')).toEqual(['admin', 'manager'])
    for (const p of ['/settings', '/settings/whatsapp', '/settings/company', '/settings/copilot', '/settings/team', '/settings/pricing', '/settings/currencies']) {
      expect(allowed(p), p).toEqual(['admin'])
    }
  })
})

describe('the WhatsApp inbox knows who you are', () => {
  it('the agents route names the signed-in agent — by login, else by email', () => {
    const route = src('app/api/whatsapp/agents/route.ts')
    expect(route).toContain('current_agent_id: await currentAgentId(supabase, user)')
    expect(route).toContain(".eq('user_id', user.id)")
    expect(route).toContain(".ilike('email', email.replace(")
  })

  it('"Mine" and "Claim" use it; Mine with no agent shows nothing, and says why', () => {
    const page = src('app/inbox/_views/WhatsAppView.tsx')
    expect(page).toContain('setCurrentAgentId(data.current_agent_id ?? null)')
    expect(page).toContain("if (filterMode === 'mine' && !currentAgentId) {")
    expect(page).toContain('add yourself in Manage Agents with your login email')
  })
})
