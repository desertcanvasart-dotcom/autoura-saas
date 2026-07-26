import { describe, it, expect } from 'vitest'
import {
  workspaceModeFromFlags,
  workspaceModeFromBusinessType,
  showsB2c,
  showsB2b,
  type WorkspaceMode,
} from '@/lib/workspace-mode'

// ============================================================================
// Which workspaces a tenant sees was stored TWICE — tenants.business_type and
// tenant_features.b2c_enabled/b2b_enabled — written by different code paths
// with nothing reconciling them.
//
// Migration 239 made `tenants.workspace_mode` the single source; migration 240
// dropped the mirrors, so there is no longer a second copy to drift from.
// What is left here is the parser for legacy REQUEST BODIES (a cached browser
// bundle can still POST `business_type` mid-deploy) and the two read helpers
// the UI uses to decide what to show.
// ============================================================================

const ALL: WorkspaceMode[] = ['b2c', 'b2b', 'both']

describe('workspaceModeFromFlags', () => {
  it('maps the three real combinations', () => {
    expect(workspaceModeFromFlags(true, true)).toBe('both')
    expect(workspaceModeFromFlags(true, false)).toBe('b2c')
    expect(workspaceModeFromFlags(false, true)).toBe('b2b')
  })

  it('never produces "neither" — an empty app is not a state', () => {
    // Migration 239's CHECK forbids it; returning something the database would
    // reject would fail the write instead of degrading sensibly.
    expect(workspaceModeFromFlags(false, false)).toBe('both')
  })
})

describe('workspaceModeFromBusinessType', () => {
  it('translates the legacy enum', () => {
    expect(workspaceModeFromBusinessType('b2c_only')).toBe('b2c')
    expect(workspaceModeFromBusinessType('b2b_only')).toBe('b2b')
    expect(workspaceModeFromBusinessType('b2c_and_b2b')).toBe('both')
  })

  it('defaults to showing everything for null/unknown', () => {
    // Permissive by design: hiding a workspace someone was using is a visible
    // regression, showing one they hid is a one-click tidy-up.
    expect(workspaceModeFromBusinessType(null)).toBe('both')
    expect(workspaceModeFromBusinessType(undefined)).toBe('both')
    expect(workspaceModeFromBusinessType('nonsense')).toBe('both')
  })
})

describe('showsB2c / showsB2b', () => {
  it('both is visible in both workspaces', () => {
    expect(showsB2c('both')).toBe(true)
    expect(showsB2b('both')).toBe(true)
  })

  it('a single mode shows only its own workspace', () => {
    expect(showsB2c('b2c')).toBe(true)
    expect(showsB2b('b2c')).toBe(false)
    expect(showsB2b('b2b')).toBe(true)
    expect(showsB2c('b2b')).toBe(false)
  })

  it('every mode shows at least one workspace', () => {
    for (const m of ALL) {
      expect(showsB2c(m) || showsB2b(m), m).toBe(true)
    }
  })
})

describe('legacy request bodies still parse', () => {
  // The columns are gone (migration 240) but the wire format is not: a browser
  // holding a cached bundle can still POST `business_type` to
  // /api/onboarding/business during a deploy. That request must not be
  // misread as 'both' when the user actually picked one workspace.
  it('maps every legacy value to the mode it meant', () => {
    expect(workspaceModeFromBusinessType('b2c_only')).toBe('b2c')
    expect(workspaceModeFromBusinessType('b2b_only')).toBe('b2b')
    expect(workspaceModeFromBusinessType('b2c_and_b2b')).toBe('both')
  })

  it('falls back to both — never to an empty app — on junk', () => {
    for (const junk of [null, undefined, '', 'nonsense', 'B2C_ONLY']) {
      const mode = workspaceModeFromBusinessType(junk as string)
      expect(showsB2c(mode) || showsB2b(mode), String(junk)).toBe(true)
    }
  })
})

describe('the five live tenants', () => {
  it('all currently b2c_and_b2b, so all map to both with nothing hidden', () => {
    const mode = workspaceModeFromBusinessType('b2c_and_b2b')
    expect(mode).toBe('both')
    expect(showsB2c(mode) && showsB2b(mode)).toBe(true)
  })
})
