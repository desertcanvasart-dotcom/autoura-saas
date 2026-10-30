import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ROUTE_PERMISSIONS, permissionRouteFor } from '@/middleware'
import {
  MAIN_NAV,
  SETTINGS_NAV,
  SETTINGS_LINK,
  JUMP_ONLY_PAGES,
  RATE_GROUPS,
  mainNavFor,
  settingsNavFor,
  activeHref,
  settingsEntryFor,
} from '@/lib/nav/config'
import { jumpEntriesFor, rankJump } from '@/components/nav/CommandPalette'
import type { PermissionRole } from '@/lib/roles'

// ============================================
// The navigation is one config (lib/nav/config.ts), and the server agrees
// with it: a link is never shown to a role the middleware turns away, and
// the pages hidden from a role are closed to it by URL too.
// ============================================

const ROLES: PermissionRole[] = ['admin', 'manager', 'member', 'viewer']
const gate = (p: string) => ROUTE_PERMISSIONS[permissionRouteFor(p.split('?')[0]) ?? ''] ?? null

/** Does app/ serve this path? (a page.tsx, allowing [param] folders) */
function pageExists(href: string): boolean {
  const parts = href.split('?')[0].split('/').filter(Boolean)
  const walk = (dir: string, i: number): boolean => {
    if (i === parts.length) return existsSync(path.join(dir, 'page.tsx'))
    const exact = path.join(dir, parts[i])
    if (existsSync(exact) && walk(exact, i + 1)) return true
    return false
  }
  return walk(path.join(process.cwd(), 'app'), 0)
}

const everyEntry = [
  ...MAIN_NAV.flatMap(s => s.items),
  SETTINGS_LINK,
  ...SETTINGS_NAV.flatMap(g => g.items),
  ...JUMP_ONLY_PAGES,
]

describe('the main sidebar', () => {
  it('admin sees about 27 links, manager no more, staff about 14 (brief mockups 01–03)', () => {
    const count = (r: PermissionRole) => mainNavFor(r).flatMap(s => s.items).length + 1 // + Settings
    expect(count('admin')).toBeGreaterThanOrEqual(26)
    expect(count('admin')).toBeLessThanOrEqual(30)
    expect(count('manager')).toBeLessThanOrEqual(count('admin'))
    expect(count('member')).toBeGreaterThanOrEqual(12)
    expect(count('member')).toBeLessThanOrEqual(16)
  })

  it('holds no rate category and no setup page', () => {
    const hrefs = MAIN_NAV.flatMap(s => s.items.map(i => i.href))
    for (const g of RATE_GROUPS) for (const c of g.categories) expect(hrefs).not.toContain(`/rates/${c.slug}`)
    expect(hrefs.filter(h => h.startsWith('/settings'))).toEqual([])
  })

  it('an empty section is dropped for a role', () => {
    for (const r of ROLES) for (const s of mainNavFor(r)) expect(s.items.length).toBeGreaterThan(0)
    expect(mainNavFor('member').map(s => s.key)).not.toContain('suppliers')
  })

  it('the longest matching link is the current page', () => {
    const items = MAIN_NAV.flatMap(s => s.items)
    expect(activeHref(items, '/tours/manage/abc')).toBe('/tours/manage')
    expect(activeHref(items, '/tours/123')).toBe('/tours')
    expect(activeHref(items, '/rates/check')).toBe('/rates/check')
    expect(activeHref(items, '/rates/hotels')).toBe('/rates')
    expect(activeHref(items, '/airport-staff')).toBe('/suppliers')
    expect(activeHref(items, '/supplier-invoices/abc')).toBe('/supplier-bills')
    expect(activeHref(items, '/nowhere')).toBeNull()
  })
})

describe('the Settings area', () => {
  it('everyone has the Account group', () => {
    for (const r of ROLES) expect(settingsNavFor(r)[0]?.key).toBe('account')
  })

  it('admin-only pages are hidden from managers and staff', () => {
    for (const r of ['manager', 'member'] as PermissionRole[]) {
      const hrefs = settingsNavFor(r).flatMap(g => g.items.map(i => i.href))
      for (const item of SETTINGS_NAV.flatMap(g => g.items).filter(i => i.adminOnly)) {
        expect(hrefs, `${item.href} for ${r}`).not.toContain(item.href)
      }
    }
  })

  it('every settings entry lives under /settings, with a description for its header', () => {
    for (const item of SETTINGS_NAV.flatMap(g => g.items)) {
      expect(item.href.startsWith('/settings/'), item.href).toBe(true)
      expect(item.description.length, item.href).toBeGreaterThan(10)
    }
    expect(settingsEntryFor('/settings/billing/plans')?.item.label).toBe('Billing & plan')
    expect(settingsEntryFor('/settings/email-signatures')?.item.label).toBe('Email & signature')
  })

  it('one name per concept', () => {
    const labels = everyEntry.map(e => e.label)
    expect(labels).toContain('Seasonal premiums')
    expect(labels).toContain('Team & roles')
    expect(labels).toContain('Vocabulary')
    for (const old of ['Demand calendar', 'Manage seasons', 'User Management', 'Your Vocabulary', 'Rates Hub']) {
      expect(labels).not.toContain(old)
    }
  })
})

describe('the server agrees with the navigation', () => {
  it('every entry opens for each role it is shown to', () => {
    for (const e of everyEntry) {
      const g = gate(e.href)
      if (!g) continue // no rule = open to every signed-in role
      for (const r of e.roles) expect(g, `${e.href} shown to ${r}`).toContain(r)
    }
  })

  // Hidden from staff's sidebar, yet opened by staff from inside their own
  // work: an itinerary from its booking, a contract or receipt from Payments,
  // a tour from the Quote Builder. The page itself is the gate there.
  const OPENED_FROM_OTHER_PAGES = new Set(['/itineraries', '/documents', '/tours'])

  it('an entry hidden from staff or managers is closed to them by URL', () => {
    for (const e of everyEntry) {
      const g = gate(e.href)
      for (const r of ['member', 'manager'] as PermissionRole[]) {
        if (e.roles.includes(r)) continue
        if (r === 'member' && OPENED_FROM_OTHER_PAGES.has(e.href)) continue
        // A tab of a merged page (?tab=): the page is open, the tab's own
        // API refuses the role, and the page does not offer the tab.
        if (e.href.includes('?')) continue
        expect(g, `${e.href} has no rule but is hidden from ${r}`).not.toBeNull()
        expect(g, `${e.href} open to ${r} by URL`).not.toContain(r)
      }
    }
  })

  it('every entry points at a real page', () => {
    for (const e of everyEntry) {
      expect(pageExists(e.href), e.href).toBe(true)
    }
    for (const g of RATE_GROUPS) for (const c of g.categories) expect(pageExists(`/rates/${c.slug}`), c.slug).toBe(true)
  })
})

describe('⌘K jump-to', () => {
  it('finds every page a role may open, rate categories and settings included', () => {
    const admin = jumpEntriesFor('admin').map(e => e.href)
    for (const e of everyEntry.filter(e => e.roles.includes('admin'))) expect(admin, e.href).toContain(e.href)
    for (const g of RATE_GROUPS) for (const c of g.categories) expect(admin).toContain(`/rates/${c.slug}`)
    const member = jumpEntriesFor('member').map(e => e.href)
    expect(member).not.toContain('/rates/hotels')
    expect(member).not.toContain('/settings/company')
    expect(member).toContain('/settings/profile')
  })

  it('ranks a label match first and finds old names by keyword', () => {
    const all = jumpEntriesFor('admin')
    expect(rankJump(all, 'hot')[0].label).toBe('Hotels')
    expect(rankJump(all, 'demand calendar').map(e => e.label)).toContain('Seasonal premiums')
    expect(rankJump(all, 'user management').map(e => e.label)).toContain('Team & roles')
  })

  it('the sidebar is built from the config, not written by hand', () => {
    const src = readFileSync(path.join(process.cwd(), 'components/Sidebar.tsx'), 'utf8')
    expect(src).toContain('mainNavFor(role)')
    expect(src).not.toMatch(/href=["']\/(?!settings)/)
  })
})
