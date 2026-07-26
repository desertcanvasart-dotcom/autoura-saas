import { describe, it, expect } from 'vitest'
import {
  resolveGate,
  isWorkspacePreference,
  workspaceNotice,
  WORKSPACE_PREFERENCES,
  type GatedFeature,
} from '@/lib/workspace-visibility'

// ============================================================================
// HIDING NAVIGATION IS NOT HIDING DATA.
//
// RequireFeature used to router.push('/dashboard') whenever a flag was off.
// B2C and B2B are workspace preferences — free on every tier — so turning B2C
// off made every client record unreachable by direct URL across seven pages:
//
//   clients, clients/new, clients/[id], clients/[id]/edit,
//   quotes/b2c, quotes/b2c/[id], quotes/b2c/[id]/edit, b2b/partners
//
// These tests pin the rule that separates the two cases. The project's vitest
// environment is `node` with no React testing libraries, so the decision lives
// in a pure function precisely so it can be asserted rather than described.
// ============================================================================

const ALL: GatedFeature[] = ['b2c', 'b2b', 'analytics', 'whatsapp', 'email', 'pdf']

describe('WORKSPACE_PREFERENCES defines the whole policy', () => {
  it('contains exactly the two business-model workspaces', () => {
    expect([...WORKSPACE_PREFERENCES].sort()).toEqual(['b2b', 'b2c'])
  })

  it('does NOT contain paid entitlements', () => {
    for (const f of ['analytics', 'whatsapp', 'email', 'pdf'] as GatedFeature[]) {
      expect(isWorkspacePreference(f), f).toBe(false)
    }
  })
})

describe('a hidden workspace still renders — the actual bug', () => {
  it('b2c off renders the page with a notice, never blocks', () => {
    expect(resolveGate('b2c', false)).toBe('render-with-notice')
  })

  it('b2b off renders the page with a notice, never blocks', () => {
    expect(resolveGate('b2b', false)).toBe('render-with-notice')
  })

  it('NO workspace preference can ever resolve to block', () => {
    for (const f of WORKSPACE_PREFERENCES) {
      for (const access of [true, false, null]) {
        expect(resolveGate(f, access), `${f}/${access}`).not.toBe('block')
      }
    }
  })
})

describe('genuine entitlements still block', () => {
  it('blocks an unpaid entitlement', () => {
    expect(resolveGate('analytics', false)).toBe('block')
    expect(resolveGate('whatsapp', false)).toBe('block')
  })

  it('renders an entitlement the tenant has', () => {
    expect(resolveGate('analytics', true)).toBe('render')
  })
})

describe('unknown access never presents as a paywall', () => {
  it('renders while the tenant context is still loading', () => {
    for (const f of ALL) {
      expect(resolveGate(f, null), f).toBe('render')
    }
  })
})

describe('every feature and state is decided', () => {
  it('returns a valid outcome for the full matrix', () => {
    const valid = new Set(['render', 'render-with-notice', 'block'])
    for (const f of ALL) {
      for (const access of [true, false, null]) {
        expect(valid.has(resolveGate(f, access)), `${f}/${access}`).toBe(true)
      }
    }
  })

  it('access granted always renders plainly, whatever the feature', () => {
    for (const f of ALL) {
      expect(resolveGate(f, true), f).toBe('render')
    }
  })
})

describe('workspaceNotice copy', () => {
  it('reassures that data is intact before explaining anything else', () => {
    // Someone arriving from a bookmark or search result needs to know nothing
    // is wrong with their records.
    const notice = workspaceNotice('b2c')
    expect(notice.body).toMatch(/still here/i)
    expect(notice.body).toMatch(/editable/i)
  })

  it('never implies loss, removal or a paywall', () => {
    for (const f of ['b2c', 'b2b'] as GatedFeature[]) {
      const { title, body } = workspaceNotice(f)
      const text = `${title} ${body}`
      expect(text, f).not.toMatch(/upgrade|plan|deleted|removed|unavailable|not available/i)
    }
  })

  it('points at settings, not billing', () => {
    for (const f of ['b2c', 'b2b'] as GatedFeature[]) {
      const notice = workspaceNotice(f)
      expect(notice.settingsHref, f).toContain('/settings')
      expect(notice.settingsHref, f).not.toContain('billing')
    }
  })

  it('names the workspace so the message is not generic', () => {
    expect(workspaceNotice('b2c').title).toMatch(/B2C/)
    expect(workspaceNotice('b2b').title).toMatch(/B2B/)
  })
})
