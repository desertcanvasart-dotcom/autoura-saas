import { describe, it, expect } from 'vitest'
import {
  workspaceModeFromFlags,
  workspaceModeFromBusinessType,
  showsB2c,
  showsB2b,
  legacyWorkspaceFields,
  type WorkspaceMode,
} from '@/lib/workspace-mode'

// ============================================================================
// Which workspaces a tenant sees was stored TWICE — tenants.business_type and
// tenant_features.b2c_enabled/b2b_enabled — written by different code paths
// with nothing reconciling them.
//
// Migration 239 makes `tenants.workspace_mode` the single source. These
// helpers keep the legacy columns in sync during the additive-then-cutover
// rename, and are the reason the two can no longer drift: every writer now
// derives the mirrors from one value instead of computing them separately.
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

describe('legacyWorkspaceFields — the mirrors cannot drift', () => {
  it('produces all three legacy values from one mode', () => {
    expect(legacyWorkspaceFields('both')).toEqual({
      business_type: 'b2c_and_b2b', b2c_enabled: true, b2b_enabled: true,
    })
    expect(legacyWorkspaceFields('b2c')).toEqual({
      business_type: 'b2c_only', b2c_enabled: true, b2b_enabled: false,
    })
    expect(legacyWorkspaceFields('b2b')).toEqual({
      business_type: 'b2b_only', b2c_enabled: false, b2b_enabled: true,
    })
  })

  it('the enum and the booleans always agree — the original bug', () => {
    for (const m of ALL) {
      const legacy = legacyWorkspaceFields(m)
      expect(legacy.b2c_enabled, m).toBe(workspaceModeFromBusinessType(legacy.business_type) !== 'b2b')
      expect(legacy.b2b_enabled, m).toBe(workspaceModeFromBusinessType(legacy.business_type) !== 'b2c')
    }
  })
})

describe('round-trips', () => {
  it('mode -> legacy -> mode is lossless', () => {
    for (const m of ALL) {
      const legacy = legacyWorkspaceFields(m)
      expect(workspaceModeFromBusinessType(legacy.business_type), m).toBe(m)
      expect(workspaceModeFromFlags(legacy.b2c_enabled, legacy.b2b_enabled), m).toBe(m)
    }
  })

  it('the two legacy sources always round-trip to the SAME mode', () => {
    // If these ever disagreed, the drift would be back.
    for (const m of ALL) {
      const legacy = legacyWorkspaceFields(m)
      expect(workspaceModeFromBusinessType(legacy.business_type))
        .toBe(workspaceModeFromFlags(legacy.b2c_enabled, legacy.b2b_enabled))
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
